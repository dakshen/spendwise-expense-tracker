from django.http import JsonResponse
from django.shortcuts import render,redirect
from django.views.decorators.csrf import csrf_exempt
from django.core.exceptions import ValidationError
import json
from django.contrib.auth import authenticate, login, logout
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from .models import Expense,Income
from django.views.decorators.http import require_http_methods
from decimal import Decimal

import hashlib
import json
import re
from decimal import Decimal
from datetime import date

from django.contrib import messages
from django.contrib.auth.decorators import login_required
from django.db import transaction
from django.shortcuts import get_object_or_404, redirect, render
from django.views.decorators.http import require_http_methods

from .models import Expense, Income, StatementImportBatch, UserSettings
from .statement_parser import read_statement

from functools import partial

from django.contrib.auth import update_session_auth_hash
from django.contrib.auth.forms import PasswordChangeForm
from django.contrib.sessions.models import Session
from django.core.validators import validate_email
from django.db import OperationalError, ProgrammingError
from django.utils import timezone
from django.views.decorators.cache import never_cache

# Every protected page sends visitors who are not signed in to the login page
# (no "?next=" in the address, and no dependency on LOGIN_URL in settings.py).
login_required = partial(
    login_required,
    login_url="login",
    redirect_field_name=None,
)


def income_to_dict(income):
    return {
        "id": income.id,
        "title": income.title,
        "amount": str(income.amount),
        "date": str(income.date),
        "category": income.category,
    }


@login_required
@require_http_methods(["GET", "POST"])
def income_api(request):
    if request.method == "GET":
        records = Income.objects.filter(user=request.user)
        return JsonResponse(
            [income_to_dict(item) for item in records],
            safe=False
        )

    try:
        data = json.loads(request.body)

        income = Income(
            user=request.user,
            title=data["title"].strip(),
            amount=data["amount"],
            date=data["date"],
            category=data.get("category", "Other"),
            
        )

        income.full_clean()
        income.save()

        return JsonResponse(income_to_dict(income), status=201)

    except ValidationError as error:
        return JsonResponse(
            {"error": getattr(error, "message_dict", {"general": error.messages})},
            status=400
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError, AttributeError):
        return JsonResponse(
            {"error": "Invalid income data."},
            status=400
        )


@login_required
@require_http_methods(["PUT", "DELETE"])
def income_detail_api(request, income_id):
    try:
        income = Income.objects.get(
            id=income_id,
            user=request.user
        )
    except Income.DoesNotExist:
        return JsonResponse(
            {"error": "Income record not found."},
            status=404
        )

    if request.method == "DELETE":
        income.delete()
        return JsonResponse({"message": "Income deleted."})

    try:
        data = json.loads(request.body)

        income.title = data["title"].strip()
        income.amount = data["amount"]
        income.date = data["date"]
        income.category = data.get("category", "Other")

        income.full_clean()
        income.save()

        return JsonResponse(income_to_dict(income))

    except ValidationError as error:
        return JsonResponse(
            {"error": getattr(error, "message_dict", {"general": error.messages})},
            status=400
        )
    except (json.JSONDecodeError, KeyError, TypeError, ValueError, AttributeError):
        return JsonResponse(
            {"error": "Invalid income data."},
            status=400
        )


# The site root sends people to the dashboard, or to the login page
def home(request):
    if request.user.is_authenticated:
        return redirect('dashboard_v2')
    return redirect('login')


@never_cache
@login_required
def dashboard_v2(request):
    return render(request, 'expenses/dashboard.html', {'prefs': prefs_for(request.user)})

@never_cache
@login_required
def analytics(request):
    return render(request, 'expenses/analytics.html', {'prefs': prefs_for(request.user)})


@never_cache
@login_required
def transactions(request):
    expenses = Expense.objects.filter(user=request.user)
    incomes = Income.objects.filter(user=request.user)

    transaction_list = []

    for expense in expenses:
        transaction_list.append({
            "id": expense.id,
            "title": expense.title,
            "amount": expense.amount,
            "date": expense.date,
            "category": expense.category,
            "type": "expense",
        })

    for income in incomes:
        transaction_list.append({
            "id": income.id,
            "title": income.title,
            "amount": income.amount,
            "date": income.date,
            "category": income.category,
            "type": "income",
        })

    # Show newest transactions first
    transaction_list.sort(
        key=lambda item: (item["date"], item["id"]),
        reverse=True,
    )

    total_income = sum(
        (item["amount"] for item in transaction_list
         if item["type"] == "income"),
        Decimal("0.00"),
    )

    total_expense = sum(
        (item["amount"] for item in transaction_list
         if item["type"] == "expense"),
        Decimal("0.00"),
    )

    categories = sorted({
        item["category"] for item in transaction_list
        if item["category"]
    })

    return render(request, "expenses/transactions.html", {
        "transactions": transaction_list,
        "total_income": total_income,
        "total_expense": total_expense,
        "net_balance": total_income - total_expense,
        "categories": categories,
        "prefs": prefs_for(request.user),
    })


# Handles fetching all expenses and creating a new expense

def expense_api(request):
    if not request.user.is_authenticated:
        return JsonResponse(
            { 'error':'Please log in first.'},
            status=401
        )
    if request.method == 'GET':
        expenses = Expense.objects.filter(user=request.user)
        data = []

        for expense in expenses:
            data.append({
                'id': expense.id,
                'title': expense.title,
                'amount': str(expense.amount),
                'date': str(expense.date),
                'category': expense.category
            })

        return JsonResponse(data, safe=False)

    if request.method == 'POST':
        try:
            data = json.loads(request.body)

            expense = Expense(
                user=request.user,
                title=data['title'],
                amount=data['amount'],
                date=data['date'],
                category=data.get('category', 'Other')
            )

            expense.full_clean()
            expense.save()

        except ValidationError as e:
            return JsonResponse({
                'error': e.message_dict
            }, status=400)

        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            return JsonResponse({
                'error': {
                    'general': ['Invalid expense data.']
                }
            }, status=400)

        return JsonResponse({
            'id': expense.id,
            'title': expense.title,
            'amount': str(expense.amount),
            'date': str(expense.date),
            'category': expense.category
        }, status=201)

    return JsonResponse({
        'error': 'Method not allowed'
    }, status=405)


# Updates or deletes a specific expense using its ID

def expense_detail_api(request, expense_id):
    if not request.user.is_authenticated:
        return JsonResponse(
            {'error':'Please log in first.'},
            status=401
        )
    try:
        expense = Expense.objects.get(id=expense_id,user=request.user)
    except Expense.DoesNotExist:
        return JsonResponse({
            'error': 'Expense not found'
        }, status=404)

    if request.method == 'PUT':
        try:
            data = json.loads(request.body)

            expense.title = data['title']
            expense.amount = data['amount']
            expense.date = data['date']
            expense.category = data.get('category', 'Other')

            expense.full_clean()
            expense.save()

        except ValidationError as e:
            return JsonResponse({
                'error': e.message_dict
            }, status=400)

        except (json.JSONDecodeError, KeyError, TypeError, ValueError):
            return JsonResponse({
                'error': {
                    'general': ['Invalid expense data.']
                }
            }, status=400)

        return JsonResponse({
            'id': expense.id,
            'title': expense.title,
            'amount': str(expense.amount),
            'date': str(expense.date),
            'category': expense.category
        })

    if request.method == 'DELETE':
        expense.delete()

        return JsonResponse({
            'message': 'Expense deleted'
        })

    return JsonResponse({
        'error': 'Method not allowed'
    }, status=405)


@never_cache
def login_view(request):
    # Arriving at the login page (for example with the browser's Back button
    # from the dashboard) ends the session, so every protected page asks for
    # a fresh login afterwards.
    if request.method == 'GET' and request.user.is_authenticated:
        logout(request)

    if request.method=='POST':
        username=request.POST.get('username');
        password=request.POST.get('password')

        user=authenticate(
            request,
            username=username,
            password=password
        )

        if user is not None:
            login(request,user)
            return redirect('dashboard_v2')

        return render(request,'expenses/login.html',{
            'error':'Invalid username or password'
        })
    return render(request,'expenses/login.html')

def register_view(request):
    if request.method == "POST":
        username=request.POST.get('username')
        password=request.POST.get('password')
        confirm_password=request.POST.get('confirm_password')

        if (password !=confirm_password):
            return render(request,'expenses/register.html',{
                'error':'Passwords do not match'
            })
        if User.objects.filter(username=username).exists():
            return render(request,'expenses/register.html',{
                'error':'Username already exists'
            })
        user=User.objects.create_user(
            username=username,
            password=password
        )

        login(request,user)
        return redirect('dashboard_v2')
    return render(request,'expenses/register.html')



def transaction_fingerprint(kind, tx_date, title, amount, reference=None):
    # A transaction/UTR id identifies a payment exactly, so two identical
    # payments (same day, same amount, same payee) stay distinct.
    if reference:
        raw = f"ref|{reference}"
        return hashlib.sha256(raw.encode("utf-8")).hexdigest()

    normalized_title = re.sub(
        r"\s+", " ", str(title or "").strip().lower()
    )

    raw = "|".join([
        kind,
        str(tx_date),
        normalized_title,
        str(Decimal(str(amount)).quantize(Decimal("0.01"))),
    ])

    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def existing_fingerprints(user):
    fingerprints = set()

    for kind, model in (("expense", Expense), ("income", Income)):
        rows = model.objects.filter(user=user).values_list(
            "date", "title", "amount", "import_fingerprint"
        )

        for tx_date, title, amount, stored in rows:
            if stored:
                # Imported earlier: reference-based (or legacy) key.
                fingerprints.add(stored)
            else:
                # Entered manually: match on date, title and amount.
                fingerprints.add(transaction_fingerprint(
                    kind, tx_date, title, amount
                ))

    return fingerprints


@never_cache
@login_required
@require_http_methods(["GET", "POST"])
def statement_import(request):
    if request.method == "GET":
        return render(
            request,
            "expenses/statement_import.html",
        )

    uploaded_file = request.FILES.get("statement")

    if not uploaded_file:
        messages.error(request, "Please choose a statement file.")
        return redirect("statement_import")

    # Basic upload limits. Keep the limit aligned with settings.py.
    if uploaded_file.size > 10 * 1024 * 1024:
        messages.error(request, "The file must be 10 MB or smaller.")
        return redirect("statement_import")

    try:
        file_hash, rows = read_statement(
            uploaded_file,
            password=request.POST.get("pdf_password") or None,
        )
    except (ValueError, UnicodeError, Exception) as error:
        messages.error(request, f"Could not read statement: {error}")
        return redirect("statement_import")

    # Non-fatal problems found while reading (for example, rows that do not
    # add up to the totals printed on the statement). They show on the
    # review page.
    for warning in getattr(rows, "warnings", []):
        messages.warning(request, warning)

    # Mark possible duplicates, including transactions entered manually
    # before this feature was added.
    known = existing_fingerprints(request.user)

    for row in rows:
        row["fingerprint"] = transaction_fingerprint(
            row["kind"],
            row["date"],
            row["title"],
            row["amount"],
            row.get("reference"),
        )

        # Rows with a reference are also compared on date/title/amount so
        # that manually entered copies are still caught.
        plain = transaction_fingerprint(
            row["kind"], row["date"], row["title"], row["amount"]
        )

        row["duplicate"] = (
            row["fingerprint"] in known or plain in known
        )

        # Also catch repeated rows within this statement. Rows with a
        # reference only collide when the reference itself repeats.
        known.add(row["fingerprint"])

    batch = StatementImportBatch.objects.create(
        user=request.user,
        filename=uploaded_file.name[:255],
        file_hash=file_hash,
        rows=rows,
    )

    return redirect("statement_import_preview", batch_id=batch.id)


@never_cache
@login_required
@require_http_methods(["GET"])
def statement_import_preview(request, batch_id):
    batch = get_object_or_404(
        StatementImportBatch,
        id=batch_id,
        user=request.user,
        status="preview",
    )

    return render(
        request,
        "expenses/statement_import_preview.html",
        {"batch": batch},
    )


@login_required
@require_http_methods(["POST"])
def statement_import_confirm(request, batch_id):
    batch = get_object_or_404(
        StatementImportBatch,
        id=batch_id,
        user=request.user,
        status="preview",
    )

    selected_indexes = {
        int(value)
        for value in request.POST.getlist("selected_rows")
        if value.isdigit()
    }

    if not selected_indexes:
        messages.error(request, "Select at least one transaction.")
        return redirect(
            "statement_import_preview",
            batch_id=batch.id,
        )

    rows = batch.rows

    if any(index >= len(rows) for index in selected_indexes):
        messages.error(request, "Invalid transaction selection.")
        return redirect(
            "statement_import_preview",
            batch_id=batch.id,
        )

    imported = 0
    skipped = 0

    with transaction.atomic():
        # Lock the batch so it cannot be confirmed twice concurrently.
        batch = StatementImportBatch.objects.select_for_update().get(
            id=batch.id,
            user=request.user,
        )

        if batch.status != "preview":
            messages.error(request, "This import was already completed.")
            return redirect("statement_import")

        known = existing_fingerprints(request.user)

        for index in sorted(selected_indexes):
            row = rows[index]

            # Never import an item flagged as a duplicate in the preview.
            if row.get("duplicate"):
                skipped += 1
                continue

            original_kind = row.get("kind")

            # The preview lets the user correct expense/income per row.
            kind = request.POST.get(f"kind_{index}") or original_kind
            if kind not in {"expense", "income"}:
                skipped += 1
                continue

            fingerprint = transaction_fingerprint(
                kind,
                row.get("date"),
                row.get("title"),
                row.get("amount"),
                row.get("reference"),
            )
            plain = transaction_fingerprint(
                kind,
                row.get("date"),
                row.get("title"),
                row.get("amount"),
            )

            # Check again at confirmation in case another import happened
            # after the preview was created.
            if fingerprint in known or plain in known:
                skipped += 1
                continue

            try:
                tx_date = date.fromisoformat(row["date"])
                amount = Decimal(row["amount"])

                if amount <= 0 or not row["title"].strip():
                    skipped += 1
                    continue

                # A spending category makes no sense once a row is switched
                # to income (or the other way round), so reset it.
                category = (
                    row.get("category", "Other")
                    if kind == original_kind else "Other"
                )

                common = {
                    "user": request.user,
                    "title": row["title"][:200],
                    "amount": amount,
                    "date": tx_date,
                    "category": category[:50],
                    "import_fingerprint": fingerprint,
                }

                if kind == "expense":
                    item = Expense(**common)
                else:
                    item = Income(**common)

                item.full_clean()
                item.save()

                known.add(fingerprint)
                imported += 1

            except (ValueError, TypeError, KeyError):
                skipped += 1

        batch.status = "completed"
        batch.rows = []
        batch.save(update_fields=["status", "rows"])

    messages.success(
        request,
        f"Imported {imported} transaction(s). Skipped {skipped} "
        "duplicate or invalid transaction(s).",
    )
    return redirect("transactions")


# ---------------------------------------------------------------------------
# Settings page
# ---------------------------------------------------------------------------

DEFAULT_PREFS = {
    "currency": "INR",
    "symbol": "\u20b9",
    "format": "indian",
    "locale": "en-IN",
    "range": "all",
}


def get_user_settings(user):
    prefs, _ = UserSettings.objects.get_or_create(user=user)
    return prefs


def prefs_for(user):
    """Preferences as a plain dict for templates and JavaScript.

    Falls back to the defaults if the UserSettings table does not exist yet
    (for example, code deployed before `migrate` was run), so pages that only
    read the preferences never break.
    """
    try:
        prefs = get_user_settings(user)
    except (OperationalError, ProgrammingError):
        return dict(DEFAULT_PREFS)

    return {
        "currency": prefs.currency,
        "symbol": prefs.symbol,
        "format": prefs.number_format,
        "locale": "en-IN" if prefs.number_format == "indian" else "en-US",
        "range": prefs.default_range,
    }


def logout_other_devices(request):
    """Delete every other session that belongs to the signed-in user."""
    current_key = request.session.session_key
    user_id = str(request.user.pk)
    removed = 0

    for session in Session.objects.filter(expire_date__gte=timezone.now()):
        if session.session_key == current_key:
            continue
        try:
            data = session.get_decoded()
        except Exception:
            continue
        if data.get("_auth_user_id") == user_id:
            session.delete()
            removed += 1

    return removed


@never_cache
@login_required
@require_http_methods(["GET", "POST"])
def settings_view(request):
    user = request.user
    prefs = get_user_settings(user)
    password_form = PasswordChangeForm(user)
    open_card = ""

    if request.method == "POST":
        action = request.POST.get("action", "")

        # ---- Profile ------------------------------------------------------
        if action == "profile":
            first_name = request.POST.get("first_name", "").strip()[:150]
            last_name = request.POST.get("last_name", "").strip()[:150]
            email = request.POST.get("email", "").strip()[:254]

            try:
                if email:
                    validate_email(email)
            except ValidationError:
                messages.error(request, "Please enter a valid email address.")
                return redirect("settings")

            user.first_name = first_name
            user.last_name = last_name
            user.email = email
            user.save(update_fields=["first_name", "last_name", "email"])
            messages.success(request, "Profile updated.")
            return redirect("settings")

        # ---- Password -----------------------------------------------------
        if action == "password":
            password_form = PasswordChangeForm(user, request.POST)
            if password_form.is_valid():
                user = password_form.save()
                # Keep this browser signed in after the password changes
                update_session_auth_hash(request, user)
                messages.success(request, "Password changed.")
                return redirect("settings")
            open_card = "password"

        # ---- Preferences --------------------------------------------------
        elif action == "preferences":
            currency = request.POST.get("currency", "")
            number_format = request.POST.get("number_format", "")
            default_range = request.POST.get("default_range", "")

            if (
                currency in UserSettings.SYMBOLS
                and number_format in dict(UserSettings.NUMBER_FORMATS)
                and default_range in dict(UserSettings.RANGES)
            ):
                prefs.currency = currency
                prefs.number_format = number_format
                prefs.default_range = default_range
                prefs.save()
                messages.success(request, "Preferences saved.")
            else:
                messages.error(request, "Please choose valid options.")
            return redirect("settings")

        # ---- Log out of other devices ------------------------------------
        elif action == "logout_others":
            removed = logout_other_devices(request)
            if removed:
                messages.success(
                    request,
                    f"Signed out of {removed} other "
                    f"{'device' if removed == 1 else 'devices'}.",
                )
            else:
                messages.info(request, "No other signed-in devices were found.")
            return redirect("settings")

        # ---- Delete all transactions -------------------------------------
        elif action == "delete_transactions":
            if request.POST.get("confirm", "").strip() != "DELETE":
                messages.error(
                    request,
                    "Type DELETE exactly to confirm. Nothing was removed.",
                )
                return redirect("settings")

            with transaction.atomic():
                expenses_removed = Expense.objects.filter(user=user).delete()[0]
                income_removed = Income.objects.filter(user=user).delete()[0]
                StatementImportBatch.objects.filter(user=user).delete()

            messages.success(
                request,
                f"Deleted {expenses_removed + income_removed} transaction(s).",
            )
            return redirect("settings")

        # ---- Delete account ----------------------------------------------
        elif action == "delete_account":
            typed = request.POST.get("confirm", "").strip()
            password = request.POST.get("password", "")

            if typed != user.username or not user.check_password(password):
                messages.error(
                    request,
                    "Your username or password did not match. "
                    "Your account was not deleted.",
                )
                open_card = "delete"
            else:
                logout(request)
                user.delete()
                messages.success(request, "Your account has been deleted.")
                return redirect("register")

    return render(request, "expenses/settings.html", {
        "prefs": prefs,
        "password_form": password_form,
        "currencies": UserSettings.CURRENCIES,
        "number_formats": UserSettings.NUMBER_FORMATS,
        "ranges": UserSettings.RANGES,
        "open_card": open_card,
        "symbols": UserSettings.SYMBOLS,
    })