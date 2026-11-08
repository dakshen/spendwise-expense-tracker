"""Adapters for UPI-app exports: PhonePe PDF statements and Google Pay
(Takeout) CSV / activity-HTML files.

Each adapter returns normalized transaction dicts in the same shape that
statement_parser.rows_to_transactions produces, plus a "reference" key
that is used for duplicate detection (a bank/UPI transaction id when the
export has one, otherwise a stable synthetic key).

IMPORTANT: these layouts are based on commonly seen exports and have been
tested only against synthetic samples. Check them against real files from
each app before relying on them.
"""
import csv
import io
import re
from collections import Counter
from datetime import datetime
from decimal import Decimal, InvalidOperation

from .category_detector import detect_category


# ---------------------------------------------------------------------------
# Shared helpers
# ---------------------------------------------------------------------------

_DATE_FORMATS = (
    "%d %b, %Y %I:%M %p", "%d %b, %Y", "%d %B, %Y",
    "%d %b %Y, %H:%M:%S", "%d %b %Y %H:%M:%S", "%d %b %Y, %I:%M:%S %p",
    "%d %b %Y, %I:%M %p", "%d %b %Y", "%d %B %Y",
    "%d-%b-%Y, %H:%M:%S", "%d-%b-%Y %H:%M:%S", "%d-%b-%Y, %I:%M:%S %p",
    "%d-%b-%Y",
    "%b %d, %Y, %I:%M:%S %p", "%b %d, %Y, %I:%M %p", "%b %d, %Y %I:%M %p",
    "%b %d, %Y, %H:%M:%S", "%b %d, %Y", "%B %d, %Y",
    "%d/%m/%Y, %H:%M:%S", "%d/%m/%Y %H:%M:%S", "%d/%m/%Y",
    "%d-%m-%Y %H:%M:%S", "%d-%m-%Y",
    "%Y-%m-%d %H:%M:%S", "%Y-%m-%dT%H:%M:%S", "%Y-%m-%d",
)
_TZ_SUFFIX = re.compile(r"\s+(?:UTC|GMT|IST|Z)$", re.IGNORECASE)

# Statuses that clearly mean the money did not move.
_NOT_COMPLETED = {
    "failed", "pending", "cancelled", "canceled", "declined", "expired",
}


def _norm(value):
    return re.sub(r"\s+", " ", str(value or "")).strip().lower()


def _parse_datetime(value):
    """Parse an explicit, unambiguous date. Numeric dates are day-first
    (Indian convention); anything else returns None rather than guessing."""
    text = str(value or "").strip()
    if not text:
        return None

    text = text.replace(" ", " ").replace(" ", " ")
    text = text.replace("–", "-").replace("—", "-")
    text = _TZ_SUFFIX.sub("", text)
    text = re.sub(r"\s+", " ", text)

    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return None


def _to_decimal(value):
    """Return a signed Decimal, or None if the text is not an amount."""
    text = str(value or "").strip()
    if not text:
        return None

    negative = text.startswith("-") or (
        text.startswith("(") and text.endswith(")")
    )
    text = re.sub(r"(?i)INR|Rs\.?|₹|[,\s()+\-]", "", text)

    try:
        amount = Decimal(text)
    except InvalidOperation:
        return None

    return -amount if negative else amount


def _fallback_reference(prefix, when, kind, amount, title, seen):
    """Stable key for exports that carry no transaction id.

    The occurrence counter keeps two genuinely identical payments in the
    same file distinct, while the same file re-uploaded later still
    produces the same references.
    """
    base = f"{prefix}:{when.isoformat()}:{kind}:{amount}:{_norm(title)}"
    seen[base] += 1
    return f"{base}#{seen[base]}"


def _make_row(when, title, amount, kind, reference, needs_review=False):
    title = re.sub(r"\s+", " ", str(title or "")).strip()[:200]

    row = {
        "date": when.date().isoformat(),
        "title": title,
        "amount": str(amount.quantize(Decimal("0.01"))),
        "kind": kind,
        # The keyword rules are written for spending, so incoming money
        # stays "Other" instead of picking up a misleading category.
        "category": detect_category(title) if kind == "expense" else "Other",
        "selected": True,
        "reference": reference,
    }
    if needs_review:
        row["needs_review"] = True
    return row


# ---------------------------------------------------------------------------
# PhonePe PDF
# ---------------------------------------------------------------------------

# Expected row layout (one transaction per block):
#   Nov 03, 2025  Paid to SWIGGY  DEBIT  ₹250
#   10:23 AM      Transaction ID T2511031023...
#                 UTR No : 123456789012
_PHONEPE_ROW = re.compile(
    r"^\s*(?P<date>[A-Za-z]{3,9}\s+\d{1,2},\s*\d{4})\s+"
    r"(?P<desc>.+?)\s+"
    r"(?P<type>DEBIT|CREDIT)\s+"
    r"(?:₹|INR|Rs\.?)?\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)\s*$",
    re.IGNORECASE,
)
_PHONEPE_TXN_ID = re.compile(
    r"Transaction\s*ID\s*[:\-]?\s*([A-Za-z0-9]+)", re.IGNORECASE
)
_PHONEPE_UTR = re.compile(
    r"UTR\s*(?:No\.?|Number)?\s*[:\-]?\s*([A-Za-z0-9]+)", re.IGNORECASE
)


def parse_phonepe_lines(lines):
    entries = []
    current = None

    for line in lines:
        match = _PHONEPE_ROW.match(line)
        if match:
            current = {
                "date": match.group("date"),
                "title": match.group("desc"),
                "type": match.group("type").upper(),
                "amount": match.group("amount"),
            }
            entries.append(current)
            continue

        if current is None:
            continue

        txn = _PHONEPE_TXN_ID.search(line)
        if txn:
            current["txn_id"] = txn.group(1)
            continue

        utr = _PHONEPE_UTR.search(line)
        if utr:
            current["utr"] = utr.group(1)

    rows = []
    seen = Counter()

    for entry in entries:
        when = _parse_datetime(entry["date"])
        amount = _to_decimal(entry["amount"])
        if when is None or amount is None or amount <= 0:
            continue

        kind = "income" if entry["type"] == "CREDIT" else "expense"
        ref_id = entry.get("txn_id") or entry.get("utr")

        if ref_id:
            reference = f"phonepe:{ref_id}"
        else:
            reference = _fallback_reference(
                "phonepe", when, kind, amount, entry["title"], seen
            )

        rows.append(
            _make_row(when, entry["title"], amount, kind, reference)
        )

    if not rows:
        raise ValueError(
            "No transactions were found. Is this a PhonePe statement PDF?"
        )

    return rows


def _is_password_error(error):
    # pdfplumber wraps pdfminer's PDFPasswordIncorrect in its own
    # exception and leaves the message empty, so look at the wrapped
    # exception as well.
    wrapped = [error, error.__cause__, *getattr(error, "args", ())]
    if any(type(item).__name__ == "PDFPasswordIncorrect" for item in wrapped):
        return True
    return "password" in str(error).lower()


def _read_pdf_lines(raw, password=None):
    import pdfplumber

    lines = []
    try:
        with pdfplumber.open(io.BytesIO(raw), password=password) as pdf:
            for page in pdf.pages:
                lines.extend((page.extract_text() or "").splitlines())
    except Exception as error:
        if _is_password_error(error):
            raise ValueError(
                "This PDF is password-protected. Enter the password "
                "and upload it again."
            ) from error
        raise ValueError("Could not open this PDF file.") from error

    return lines


# ---------------------------------------------------------------------------
# Google Pay PDF statement ("Get Statement" in the app)
# ---------------------------------------------------------------------------

class ParsedRows(list):
    """A list of rows that can also carry non-fatal warnings to show the
    user (for example, a failed totals check)."""

    def __init__(self, rows=()):
        super().__init__(rows)
        self.warnings = []


# Layout reported for this PDF (three columns: Date & time | Transaction
# details | Amount); each transaction spans about three text lines:
#   01 Nov, 2025  Paid to SWIGGY                   ₹250.00
#   10:23 AM      UPI Transaction ID: 123456789012
#                 Paid by HDFC Bank 1234
# The header repeats on every page and a summary at the top gives the total
# sent and received, which is used below to check the parse.
_GPAY_PDF_ROW = re.compile(
    r"^\s*(?P<date>\d{1,2}\s+[A-Za-z]{3,9},?\s+\d{4})\s+"
    r"(?P<desc>(?:Paid|Received|Sent|Refund|Payment|Cashback|Reward)\b.*?)\s*"
    r"(?:INR|Rs\.?|[^\w\s])?\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)\s*$",
    re.IGNORECASE,
)
_GPAY_PDF_TIME = re.compile(
    r"^\s*(?P<time>\d{1,2}:\d{2}\s*[AaPp][Mm])\b\s*(?P<rest>.*)$"
)
_GPAY_PDF_UPI_ID = re.compile(
    r"UPI\s*Transaction\s*ID\s*[:\-]?\s*([A-Za-z0-9]+)", re.IGNORECASE
)
_GPAY_PDF_BANK_LINE = re.compile(r"^\s*Paid\s+(?:by|to)\s+\S", re.IGNORECASE)
_GPAY_PDF_NOISE = re.compile(
    r"^\s*(?:page\s+\d+(?:\s*of\s*\d+)?|note\s*:.*)\s*$", re.IGNORECASE
)


def _gpay_header_total(header_text, label):
    match = re.search(
        rf"(?<![A-Za-z]){label}\s*[:\-]?\s*(?:INR|Rs\.?|[^\w\s])\s*"
        r"([\d,]+(?:\.\d{1,2})?)",
        header_text,
        re.IGNORECASE,
    )
    return _to_decimal(match.group(1)) if match else None


def parse_gpay_pdf_lines(lines):
    entries = []
    header_lines = []
    current = None

    for line in lines:
        match = _GPAY_PDF_ROW.match(line)
        if match:
            current = {
                "date": match.group("date"),
                "title": match.group("desc"),
                "amount": match.group("amount"),
                "time": None,
                "upi_id": None,
                "closed": False,
            }
            entries.append(current)
            continue

        if current is None:
            header_lines.append(line)
            continue

        if _GPAY_PDF_NOISE.match(line):
            continue

        rest = line
        if current["time"] is None:
            time_match = _GPAY_PDF_TIME.match(line)
            if time_match:
                current["time"] = time_match.group("time")
                rest = time_match.group("rest")

        upi = _GPAY_PDF_UPI_ID.search(rest)
        if upi:
            before = rest[:upi.start()].strip()
            if before and not current["closed"]:
                current["title"] += " " + before
            current["upi_id"] = upi.group(1)
            current["closed"] = True
            continue

        if _GPAY_PDF_BANK_LINE.match(rest):
            current["closed"] = True
            continue

        # A long payee name wraps onto the following line(s), before the
        # UPI id line.
        if not current["closed"] and rest.strip():
            current["title"] += " " + rest.strip()

    rows = ParsedRows()
    seen = Counter()

    for entry in entries:
        amount = _to_decimal(entry["amount"])
        if amount is None or amount <= 0:
            continue

        when = None
        if entry["time"]:
            when = _parse_datetime(f"{entry['date']} {entry['time']}")
        if when is None:
            when = _parse_datetime(entry["date"])
        if when is None:
            continue

        title = re.sub(r"\s+", " ", entry["title"]).strip()
        kind = _gpay_direction(title, amount)
        needs_review = kind is None
        if needs_review:
            kind = "expense"

        if entry["upi_id"]:
            reference = f"gpay-upi:{entry['upi_id']}"
        else:
            reference = _fallback_reference(
                "gpay-pdf", when, kind, amount, title, seen
            )

        rows.append(
            _make_row(when, title, amount, kind, reference, needs_review)
        )

    if not rows:
        raise ValueError(
            "No transactions were found. Is this a Google Pay statement PDF?"
        )

    # Check the parse against the totals printed at the top of the
    # statement, so missed or misread rows do not go unnoticed.
    header_text = " ".join(header_lines)
    for label, wanted_kind in (("Sent", "expense"), ("Received", "income")):
        expected = _gpay_header_total(header_text, label)
        if expected is None:
            continue

        actual = sum(
            (Decimal(row["amount"]) for row in rows
             if row["kind"] == wanted_kind),
            Decimal("0"),
        )
        if actual.quantize(Decimal("0.01")) != expected.quantize(Decimal("0.01")):
            rows.warnings.append(
                f"The statement says {label.lower()} ₹{expected:,.2f}, "
                f"but the rows found add up to ₹{actual:,.2f}. Some "
                "transactions may be missing or misread, so compare "
                "carefully before importing."
            )

    return rows


def parse_upi_pdf(raw, password=None):
    """Read a PhonePe or Google Pay statement PDF."""
    lines = _read_pdf_lines(raw, password)

    if any(_PHONEPE_ROW.match(line) for line in lines):
        return parse_phonepe_lines(lines)
    if any(_GPAY_PDF_ROW.match(line) for line in lines):
        return parse_gpay_pdf_lines(lines)

    raise ValueError(
        "This PDF doesn't look like a PhonePe or Google Pay statement."
    )


# ---------------------------------------------------------------------------
# Google Pay: Takeout transactions CSV
# ---------------------------------------------------------------------------

def _gpay_direction(description, amount):
    """Return "income", "expense" or None when it cannot be told."""
    text = _norm(description)

    if text.startswith(("received", "refund", "cashback", "reward")):
        return "income"
    if text.startswith(("paid", "sent", "payment", "bill")):
        return "expense"
    if amount < 0:
        return "expense"
    return None


def looks_like_gpay_csv(header):
    names = {_norm(name) for name in header}
    return (
        {"amount", "description"} <= names
        and bool(names & {"time", "date", "transaction time", "timestamp"})
        and bool(names & {"transaction id", "payment method", "product"})
    )


def parse_gpay_csv(text):
    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise ValueError("The CSV file has no header row.")

    by_name = {_norm(name): name for name in reader.fieldnames}

    def column(*names):
        return next((by_name[n] for n in names if n in by_name), None)

    time_col = column("time", "date", "transaction time", "timestamp")
    id_col = column("transaction id", "id")
    desc_col = column("description")
    amount_col = column("amount")
    status_col = column("status")

    if not (time_col and desc_col and amount_col):
        raise ValueError(
            "Could not find the time, description and amount columns."
        )

    rows = []
    seen = Counter()

    for record in reader:
        if status_col and _norm(record.get(status_col)) in _NOT_COMPLETED:
            continue

        when = _parse_datetime(record.get(time_col))
        raw_amount = _to_decimal(record.get(amount_col))
        description = str(record.get(desc_col) or "").strip()

        if when is None or raw_amount is None or not description:
            continue
        if raw_amount == 0:
            continue

        kind = _gpay_direction(description, raw_amount)
        needs_review = kind is None
        if needs_review:
            kind = "expense"

        amount = abs(raw_amount)
        txn_id = str(record.get(id_col) or "").strip() if id_col else ""

        if txn_id:
            reference = f"gpay:{txn_id}"
        else:
            reference = _fallback_reference(
                "gpay", when, kind, amount, description, seen
            )

        rows.append(_make_row(
            when, description, amount, kind, reference, needs_review
        ))

    if not rows:
        raise ValueError(
            "No transactions were found in this Google Pay CSV."
        )

    return rows


# ---------------------------------------------------------------------------
# Google Pay: Takeout "My Activity" HTML
# ---------------------------------------------------------------------------

# Entries look like: "Paid ₹250.00 to Swiggy" with a timestamp line such
# as "03-Nov-2025, 10:23:45 IST" in the same cell.
_GPAY_ACTION = re.compile(
    r"^\s*(?P<verb>Paid|Sent|Received|Refunded|Refund)\s*"
    r"(?:₹|Rs\.?|INR)\s*(?P<amount>[\d,]+(?:\.\d{1,2})?)"
    r"(?:\s+(?P<prep>to|from|for)\s+(?P<who>.+?))?"
    r"(?:\s+(?:using|via)\s+.*)?\s*$",
    re.IGNORECASE,
)
_TRAILING_ON_DATE = re.compile(
    r"\s+on\s+\d{1,2}[-/]\d{1,2}[-/]\d{2,4}\s*$", re.IGNORECASE
)


def parse_gpay_activity_html(text):
    try:
        from bs4 import BeautifulSoup
    except ImportError as error:
        raise ValueError(
            "Reading Google Pay HTML needs the beautifulsoup4 package."
        ) from error

    soup = BeautifulSoup(text, "html.parser")
    cells = soup.select("div.content-cell")
    if not cells:
        raise ValueError(
            "This HTML file doesn't look like a Google Pay activity export."
        )

    rows = []
    seen = Counter()

    for cell in cells:
        for br in cell.find_all("br"):
            br.replace_with("\n")

        lines = [
            re.sub(r"\s+", " ", line).strip()
            for line in cell.get_text(" ").split("\n")
        ]
        lines = [line for line in lines if line]

        action_line, match = None, None
        for line in lines:
            candidate = _GPAY_ACTION.match(line)
            if candidate:
                action_line, match = line, candidate
                break
        if match is None:
            continue

        if any(line.lower().rstrip(".") in _NOT_COMPLETED for line in lines):
            continue

        when = None
        for line in lines:
            if line is action_line:
                continue
            when = _parse_datetime(line)
            if when:
                break
        if when is None:
            continue

        amount = _to_decimal(match.group("amount"))
        if amount is None or amount <= 0:
            continue

        verb = match.group("verb").capitalize()
        kind = "income" if verb.startswith(("Received", "Refund")) else "expense"

        who = _TRAILING_ON_DATE.sub("", match.group("who") or "").strip()
        prep = (match.group("prep") or "").lower()
        title = f"{verb} {prep} {who}".strip() if who else f"{verb} via Google Pay"
        title = re.sub(r"\s+", " ", title)

        reference = _fallback_reference(
            "gpay", when, kind, amount, title, seen
        )
        rows.append(_make_row(when, title, amount, kind, reference))

    if not rows:
        raise ValueError(
            "No completed transactions were found in this Google Pay file."
        )

    return rows