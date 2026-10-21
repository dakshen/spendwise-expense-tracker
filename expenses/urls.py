from django.urls import path
from . import views
from django.contrib.auth import views as auth_views

urlpatterns = [
    path('', views.home, name='home'),
    path('api/', views.expense_api, name='expense_api'),
    path('api/<int:expense_id>/',views.expense_detail_api,name='expense_detail_api'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path(
    'logout/',
    auth_views.LogoutView.as_view(next_page='login'),
    name='logout',
),

]