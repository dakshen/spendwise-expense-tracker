from django.db import models
from django.core.validators import MinValueValidator
from django.conf import settings
from django.contrib.auth.models import User

# Create your models here.
class Expense(models.Model):
    title=models.CharField(max_length=200)
    amount=models.DecimalField(max_digits=10,decimal_places=2,validators=[MinValueValidator(0.01)])
    date=models.DateField()
    category = models.CharField(max_length=50, default='Other')
    user = models.ForeignKey(
    settings.AUTH_USER_MODEL,
    on_delete=models.CASCADE,
    related_name='expenses',
    null=True,
    blank=True
)
    import_fingerprint = models.CharField(
    max_length=64,
    null=True,
    blank=True,
    editable=False,
)

    def __str__(self):
        return self.title


class Income(models.Model):
    user = models.ForeignKey(
        User,
        on_delete=models.CASCADE,
        related_name="income_records"
    )
    title = models.CharField(max_length=200)
    amount = models.DecimalField(
        max_digits=10,
        decimal_places=2,
        validators=[MinValueValidator(0.01)]
    )
    date = models.DateField()
    category = models.CharField(max_length=100, default="Other")
    import_fingerprint = models.CharField(
    max_length=64,
    null=True,
    blank=True,
    editable=False,
)

    class Meta:
        ordering = ["-date", "-id"]

    def __str__(self):
        return f"{self.title} - {self.amount}"

class StatementImportBatch(models.Model):
    STATUS_CHOICES = [
        ("preview", "Preview"),
        ("completed", "Completed"),
    ]

    user = models.ForeignKey(
        settings.AUTH_USER_MODEL,
        on_delete=models.CASCADE,
    )
    filename = models.CharField(max_length=255)
    file_hash = models.CharField(max_length=64)
    rows = models.JSONField(default=list)
    status = models.CharField(
        max_length=20,
        choices=STATUS_CHOICES,
        default="preview",
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self):
        return f"{self.filename} - {self.user}"


class UserSettings(models.Model):
    """Per-user preferences edited on the Settings page (one row per user)."""

    SYMBOLS = {
        "INR": "\u20b9",
        "USD": "$",
        "EUR": "\u20ac",
        "GBP": "\u00a3",
        "AED": "AED ",
        "SGD": "S$",
        "JPY": "\u00a5",
        "AUD": "A$",
        "CAD": "C$",
    }

    CURRENCIES = [
        ("INR", "Indian Rupee (\u20b9)"),
        ("USD", "US Dollar ($)"),
        ("EUR", "Euro (\u20ac)"),
        ("GBP", "British Pound (\u00a3)"),
        ("AED", "UAE Dirham (AED)"),
        ("SGD", "Singapore Dollar (S$)"),
        ("JPY", "Japanese Yen (\u00a5)"),
        ("AUD", "Australian Dollar (A$)"),
        ("CAD", "Canadian Dollar (C$)"),
    ]

    NUMBER_FORMATS = [
        ("indian", "Indian grouping (12,34,567.89)"),
        ("international", "International grouping (1,234,567.89)"),
    ]

    RANGES = [
        ("all", "All time"),
        ("month", "This month"),
        ("last", "Last month"),
        ("d30", "Last 30 days"),
        ("year", "This year"),
    ]

    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name="preferences",
    )
    currency = models.CharField(max_length=3, choices=CURRENCIES, default="INR")
    number_format = models.CharField(
        max_length=20, choices=NUMBER_FORMATS, default="indian"
    )
    default_range = models.CharField(
        max_length=10, choices=RANGES, default="all"
    )

    @property
    def symbol(self):
        return self.SYMBOLS.get(self.currency, "\u20b9")

    def __str__(self):
        return f"Settings for {self.user}"