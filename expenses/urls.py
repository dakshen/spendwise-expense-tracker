from django.urls import path
from . import views
from django.contrib.auth import views as auth_views

urlpatterns = [
    path('', views.home, name='home'),
    path('api/', views.expense_api, name='expense_api'),
    path('api/<int:expense_id>/',views.expense_detail_api,name='expense_detail_api'),
    path('login/', views.login_view, name='login'),
    path('register/', views.register_view, name='register'),
    path('analytics/', views.analytics, name='analytics'),
    path('logout/', auth_views.LogoutView.as_view(next_page='login'), name='logout'),
    path('dashboard_v2/', views.dashboard_v2, name='dashboard_v2'),
    path("api/income/", views.income_api, name="income_api"),
    path("api/income/<int:income_id>/",views.income_detail_api,name="income_detail_api"),
    path("transactions/",views.transactions,name="transactions"),
    path("settings/", views.settings_view, name="settings"),
    path(
        "statements/import/",
        views.statement_import,
        name="statement_import",
    ),
    path(
        "statements/import/<int:batch_id>/",
        views.statement_import_preview,
        name="statement_import_preview",
    ),
    path(
        "statements/import/<int:batch_id>/confirm/",
        views.statement_import_confirm,
        name="statement_import_confirm",
    ),

]