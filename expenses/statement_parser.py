import csv
import hashlib
import io
import re
from datetime import datetime
from decimal import Decimal, InvalidOperation

import pandas as pd
from .category_detector import detect_category
from .upi_parsers import (
    looks_like_gpay_csv,
    parse_gpay_activity_html,
    parse_gpay_csv,
    parse_upi_pdf,
)

DATE_NAMES = {
    "date", "transaction date", "txn date", "posting date", "value date"
}
DESCRIPTION_NAMES = {
    "description", "narration", "particulars", "transaction details",
    "merchant", "remarks", "details"
}
AMOUNT_NAMES = {
    "amount", "transaction amount", "txn amount"
}
DEBIT_NAMES = {"debit", "withdrawal", "withdrawals", "dr"}
CREDIT_NAMES = {"credit", "deposit", "deposits", "cr"}


def normalize(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def parse_date(value):
    if isinstance(value, (datetime,)):
        return value.date().isoformat()

    value = str(value or "").strip()

    for fmt in (
        "%d/%m/%Y", "%d-%m-%Y", "%Y-%m-%d",
        "%d/%m/%y", "%d-%m-%y", "%d %b %Y",
        "%d-%b-%Y", "%d %B %Y",
        "%Y-%m-%d %H:%M:%S",
        "%Y-%m-%d %H:%M:%S.%f",
    ):
        try:
            return datetime.strptime(value, fmt).date().isoformat()
        except ValueError:
            pass

    # Do not guess ambiguous dates.
    return None


def parse_amount(value):
    if value is None:
        return None

    value = str(value).strip()
    if not value or value in {"-", "—"}:
        return None

    negative = value.startswith("(") and value.endswith(")")
    value = re.sub(r"[₹,\s]", "", value)
    value = value.replace("INR", "").replace("Rs.", "").replace("Rs", "")
    value = value.replace("(", "").replace(")", "")

    try:
        amount = Decimal(value)
        return abs(amount) if negative else amount
    except InvalidOperation:
        return None


def map_columns(columns):
    mapped = {}

    for column in columns:
        name = normalize(column)

        if name in DATE_NAMES and "date" not in mapped:
            mapped["date"] = column
        elif name in DESCRIPTION_NAMES and "description" not in mapped:
            mapped["description"] = column
        elif name in AMOUNT_NAMES and "amount" not in mapped:
            mapped["amount"] = column
        elif name in DEBIT_NAMES:
            mapped["debit"] = column
        elif name in CREDIT_NAMES:
            mapped["credit"] = column

    if "date" not in mapped or "description" not in mapped:
        raise ValueError(
            "Could not identify the date and description columns. "
            "Please use a statement with clear column headings."
        )

    if "amount" not in mapped and not (
        "debit" in mapped or "credit" in mapped
    ):
        raise ValueError(
            "Could not identify an amount, debit or credit column."
        )

    return mapped


def rows_to_transactions(records):
    if not records:
        raise ValueError("No transaction rows were found.")

    columns = list(records[0].keys())
    mapped = map_columns(columns)
    output = []

    for record in records:
        date = parse_date(record.get(mapped["date"]))
        description = str(
            record.get(mapped["description"]) or ""
        ).strip()
        

        category = detect_category(description)

        if not date or not description:
            continue

        if "amount" in mapped:
            amount = parse_amount(record.get(mapped["amount"]))
            if amount is None or amount == 0:
                continue

            # A standalone amount column has no reliable direction.
            # Treat it as a debit by default; the preview can be edited.
            kind = "expense"
        else:
            debit = parse_amount(record.get(mapped.get("debit")))
            credit = parse_amount(record.get(mapped.get("credit")))

            if debit and debit > 0:
                amount, kind = debit, "expense"
            elif credit and credit > 0:
                amount, kind = credit, "income"
            else:
                continue

        output.append({
            "date": date,
            "title": description[:200],
            "amount": str(amount.quantize(Decimal("0.01"))),
            "kind": kind,
            # Keyword rules are written for spending only.
            "category": category if kind == "expense" else "Other",
            "selected": True,
        })

    if not output:
        raise ValueError(
            "No valid transactions were extracted. "
            "The statement may use an unsupported format."
        )

    return output


def read_statement(uploaded_file, password=None):
    filename = uploaded_file.name.lower()
    raw = uploaded_file.read()

    file_hash = hashlib.sha256(raw).hexdigest()

    if filename.endswith(".csv"):
        text = raw.decode("utf-8-sig", errors="replace")

        # Google Pay Takeout transactions CSV has its own adapter.
        first_row = next(csv.reader(io.StringIO(text)), [])
        if looks_like_gpay_csv(first_row):
            return file_hash, parse_gpay_csv(text)

        sample = text[:4096]
        try:
            dialect = csv.Sniffer().sniff(sample, delimiters=",;\t|")
            delimiter = dialect.delimiter
        except csv.Error:
            delimiter = ","

        dataframe = pd.read_csv(
            io.StringIO(text),
            sep=delimiter,
            dtype=str,
        )

        records = dataframe.fillna("").to_dict(orient="records")

    elif filename.endswith((".xlsx", ".xls")):
        dataframe = pd.read_excel(
            io.BytesIO(raw),
            dtype=str,
        )
        records = dataframe.fillna("").to_dict(orient="records")

    elif filename.endswith(".pdf"):
        # The old generic PDF regex took the last number on each line,
        # which on bank statements is the running balance. PDFs are now
        # read only through the PhonePe and Google Pay adapters.
        return file_hash, parse_upi_pdf(raw, password=password)

    elif filename.endswith((".html", ".htm")):
        text = raw.decode("utf-8-sig", errors="replace")
        return file_hash, parse_gpay_activity_html(text)

    else:
        raise ValueError(
            "Upload a PhonePe or Google Pay statement (PDF), a Google "
            "Pay export (CSV or HTML), or a CSV/Excel file."
        )

    return file_hash, rows_to_transactions(records)