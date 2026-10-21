from django.db import models
from django.core.validators import MinValueValidator
from django.conf import settings

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

    def __str__(self):
        return self.title