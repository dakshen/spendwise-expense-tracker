
const titleInput = document.getElementById('title');
const amountInput = document.getElementById('amount');
const expenseList = document.getElementById('expense-list');
const dateInput = document.getElementById('date');
const addButton = document.getElementById('add-btn')
const totalExpenses = document.getElementById('total-expenses');
const expenseCount = document.getElementById('expense-count');
const monthlyTotal = document.getElementById('monthly-total');
const categoryInput = document.getElementById('category');
const filterCategory = document.getElementById('filter-category');
const searchInput = document.getElementById('search-expense')
const sortExpenses = document.getElementById('sort-expenses')
const exportButton = document.getElementById("export-expenses");
const todayButton = document.getElementById('today-button');
const csrfToken = document.querySelector('meta[name="csrf-token"]').content;

let editingExpenseId = null;
let editingExpenseElement = null;

// Creates an expense card and adds it to the page

function createExpenseElement(data) {
    const expense = document.createElement('div');

    expense.className = 'expense-item';
    expense.dataset.amount = data.amount;
    expense.dataset.date = data.date;
    expense.dataset.id = data.id;
    expense.dataset.category = data.category || 'Other';
    expense.dataset.title = data.title;

    // Expense name
    const expenseText = document.createElement('span');
    expenseText.className = 'expense-name';
    expenseText.textContent = data.title;

    // Category badge
    const categoryBadge = document.createElement('span');
    categoryBadge.className = 'expense-category';
    categoryBadge.textContent = data.category || 'Other';
    categoryBadge.dataset.category = data.category || 'Other';

    // Amount and date
    const expenseDetails = document.createElement('div');
    expenseDetails.className = 'expense-details';

    const expenseAmount = document.createElement('strong');
    expenseAmount.className = 'expense-amount';
    expenseAmount.textContent =
        '₹' + Number(data.amount).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });

    const expenseDate = document.createElement('span');
    expenseDate.className = 'expense-date';
    expenseDate.textContent = data.date;

    expenseDetails.append(expenseAmount, expenseDate);

    // Edit button
    const editButton = document.createElement('button');
    editButton.textContent = 'Edit';
    editButton.className = 'edit-btn';

    editButton.addEventListener('click', function () {
        editingExpenseId = data.id;
        editingExpenseElement = expenseText;

        titleInput.value = data.title;
        amountInput.value = data.amount;
        dateInput.value = data.date;
        categoryInput.value = data.category || 'Other';

        addButton.textContent = 'Save Changes';

        document.getElementById('add-expense').scrollIntoView({
            behavior: 'smooth',
            block: 'start'
        });

        titleInput.focus();
    });

    // Delete button
    const deleteButton = document.createElement('button');
    deleteButton.textContent = 'Delete';
    deleteButton.className = 'delete-btn';

    deleteButton.addEventListener('click', async function () {
        try {
            const response = await fetch('/api/' + data.id + '/', {
                method: 'DELETE',
                headers: {
                    'X-CSRFToken': csrfToken
                }
            });

            if (!response.ok) {
                alert('Failed to delete expense');
                return;
            }

            expense.remove();
            updateTotal();
            filterExpenses();

            if (editingExpenseId === data.id) {
                resetForm();
            }
        } catch (error) {
            alert('Unable to connect to the server. Please try again.');
        }
    });

    // Assemble transaction row
    expense.append(
        expenseText,
        categoryBadge,
        expenseDetails,
        editButton,
        deleteButton
    );

    expenseList.appendChild(expense);
}

// Clears the form and resets edit mode
function resetForm() {
    titleInput.value = '';
    amountInput.value = '';
    dateInput.value = '';
    categoryInput.value = '';

    editingExpenseId = null;
    editingExpenseElement = null;
    addButton.textContent = 'Add Expense';
}

// Adds a new expense or saves changes to an existing one
addButton.addEventListener('click', async function () {
    const title = titleInput.value.trim();
    const amount = amountInput.value;
    const date = dateInput.value;
    const category = categoryInput.value;

    if (title === '' || amount === '' || date === '' || category === '') {
        alert('Please fill all fields');
        return;
    }

    if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
        alert('Amount must be greater than 0');
        return;
    }

    const isEditing = editingExpenseId !== null;
    const url = isEditing
        ? '/api/' + editingExpenseId + '/'
        : '/api/';

    const method = isEditing ? 'PUT' : 'POST';

    try {
        const response = await fetch(url, {
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': csrfToken
            },
            body: JSON.stringify({
                title: title,
                amount: amount,
                date: date,
                category: category
            })
        });

        const data = await response.json();

        if (!response.ok) {
            const errors = data.error;

            if (typeof errors === 'string') {
                alert(errors);
            } else if (errors) {
                for (const field in errors) {
                    const message = errors[field];
                    alert(Array.isArray(message) ? message[0] : message);
                    break;
                }
            } else {
                alert('Unable to save expense');
            }

            return;
        }

        if (isEditing) {
            // Updates the existing expense card
            editingExpenseElement.textContent =
                data.title + ' - ' +
                (data.category || 'Other') + ' - ₹' +
                data.amount + ' - ' +
                data.date;

            const expense = editingExpenseElement.parentElement;
            expense.dataset.amount = data.amount;
            expense.dataset.date = data.date;
            expense.dataset.id = data.id;
            expense.dataset.category = data.category || 'Other';
            expense.dataset.title = data.title.toLowerCase();
        } else {
            // Adds the new expense card
            createExpenseElement(data);
        }

        resetForm();
        updateTotal();
        filterExpenses();
    } catch (error) {
        alert('Unable to connect to the server. Please try again.');
    }
});

// Recalculates total expenses, expense count, and current-month spending
function updateTotal() {
    let total = 0;
    let monthTotal = 0;
    let count = 0;

    const expenses = document.querySelectorAll('#expense-list > div');
    const selectedCategory = filterCategory.value;

    const today = new Date();
    const currentMonth = today.getMonth();
    const currentYear = today.getFullYear();



    for (const expense of expenses) {
        const category = expense.dataset.category;

        if (expense.style.display === 'none') {
            continue;
        }


        const amount = Number(expense.dataset.amount);
        total += amount;
        count++;

        const dateParts = expense.dataset.date.split('-');
        const year = Number(dateParts[0]);
        const month = Number(dateParts[1]) - 1;

        if (month === currentMonth && year === currentYear) {
            monthTotal += amount;
        }
    }

    totalExpenses.textContent = total.toFixed(2);
    expenseCount.textContent = count;
    monthlyTotal.textContent = monthTotal.toFixed(2);
}


function filterExpenses() {
    const selectedCategory = filterCategory.value;
    const searchText = searchInput.value.trim().toLowerCase();
    const expenses = document.querySelectorAll('#expense-list > div')

    for (const expense of expenses) {
        const category = expense.dataset.category;
        const title = expense.dataset.title.toLowerCase();
        const matchesCategory = selectedCategory == 'All' || category == selectedCategory;
        const matchesSearch = title.includes(searchText);
        if (matchesCategory && matchesSearch) {
            expense.style.display = 'flex';
        }
        else {
            expense.style.display = 'none';
        }
    }
    updateTotal();
}

function sortExpenseList() {
    const expenses = Array.from(document.querySelectorAll('#expense-list > div'));
    const sortBy = sortExpenses.value;
    expenses.sort(function (a, b) {
        if (sortBy === 'newest') {
            return b.dataset.date.localeCompare(a.dataset.date);
        }
        if (sortBy == 'oldest') {
            return a.dataset.date.localeCompare(b.dataset.date);
        }
        if (sortBy === 'lowest') {
            return Number(a.dataset.amount) - Number(b.dataset.amount);
        }
        if (sortBy === 'highest') {
            return Number(b.dataset.amount) - Number(a.dataset.amount);
        }
    });

    for (const expense of expenses) {
        expenseList.appendChild(expense);
    }
}




filterCategory.addEventListener('change', function () {
    filterExpenses();
    updateTotal();
})

searchInput.addEventListener('input', filterExpenses)


// Fetches saved expenses from Django when the page first opens
async function loadExpenses() {
    try {
        const response = await fetch('/api/');

        if (!response.ok) {
            throw new Error('Failed to load expenses');
        }

        const data = await response.json();

        expenseList.innerHTML = '';

        for (const expenseData of data) {
            createExpenseElement(expenseData);
        }

        updateTotal();
        filterExpenses();
    } catch (error) {
        console.error('Error loading expenses:', error);
        alert('Unable to load expenses. Please refresh the page.');
    }
}


function exportExpensesToCSV() {
    const expenses = document.querySelectorAll('#expense-list > div');
    const visibleExpenses = Array.from(expenses).filter(function (expense) {
        return expense.style.display !== 'none';
    })

    const rows = [
        ['Title', 'Amount', 'Date', 'Category']
    ];
    for (const expense of visibleExpenses) {
        rows.push([
            expense.dataset.title || '',
            expense.dataset.amount || '',
            expense.dataset.date || '',
            expense.dataset.category || 'Other'
        ]);
    }
    const csvContent = rows.map(function (row) {
        return row.map(function (value) {
            const text = String(value).replace(/"/g, '""');
            return `"${text}"`;
        }).join(',');
    }).join('\n');

    const blob = new Blob([csvContent], {
        type: 'text/csv;charset=utf-8;'
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = 'expenses.csv';
    link.click();

    URL.revokeObjectURL(url);
}

todayButton.addEventListener('click', function () {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    dateInput.value = `${year}-${month}-${day}`;
})



/* Sidebar active navigation */
const sidebarLinks = document.querySelectorAll('.sidebar-nav .nav-link');

sidebarLinks.forEach(link => {
    link.addEventListener('click', () => {
        sidebarLinks.forEach(item => item.classList.remove('active'));
        link.classList.add('active');
    });
});


// Loads existing expenses when the page opens
loadExpenses();
sortExpenses.addEventListener('change', sortExpenseList);
exportButton.addEventListener('click', exportExpensesToCSV);

