
from django.http import JsonResponse
from django.shortcuts import render,redirect
from django.views.decorators.csrf import csrf_exempt
from django.core.exceptions import ValidationError
import json
from django.contrib.auth import authenticate, login
from django.contrib.auth.models import User
from django.contrib.auth.decorators import login_required
from .models import Expense


# Displays the Expense Tracker webpage
def home(request):
    if request.user.is_authenticated:
        return render(request, 'expenses/index.html')
    return redirect('login')

@login_required
def analytics(request):
    return render(request, 'expenses/analytics.html')

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


def login_view(request):
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
            return redirect('/')

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
        return redirect('/')
    return render(request,'expenses/register.html')