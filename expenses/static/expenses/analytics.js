const categoryCanvas = document.getElementById('categoryChart');
const monthlyCanvas = document.getElementById('monthlyChart');
const message = document.getElementById('analytics-message');

async function loadAnalytics() {
    try {
        const response = await fetch('/api/');

        if (!response.ok) {
            throw new Error('Unable to load expenses.');
        }

        const expenses = await response.json();

        // 1. Calculate spending by category
        const categoryTotals = {};

        expenses.forEach(expense => {
            const category = expense.category || 'Other';
            categoryTotals[category] =
                (categoryTotals[category] || 0) +
                Number(expense.amount);
        });

        // 2. Calculate spending by month
        const monthlyTotals = {};

        expenses.forEach(expense => {
            if (!expense.date) return;

            const date = new Date(expense.date + 'T00:00:00');
            const monthKey =
                `${date.getFullYear()}-${String(
                    date.getMonth() + 1
                ).padStart(2, '0')}`;

            monthlyTotals[monthKey] =
                (monthlyTotals[monthKey] || 0) +
                Number(expense.amount);
        });

        const monthKeys = Object.keys(monthlyTotals).sort();

        const monthLabels = monthKeys.map(key => {
            const [year, month] = key.split('-').map(Number);

            return new Date(year, month - 1, 1)
                .toLocaleDateString('en-IN', {
                    month: 'short',
                    year: 'numeric'
                });
        });

        // Show helpful message when no expenses exist
        if (expenses.length === 0) {
            message.textContent =
                'No expenses yet. Add expenses to see your analytics.';
        } else {
            message.textContent = '';
        }

        // Draw doughnut chart
        new Chart(categoryCanvas, {
            type: 'doughnut',
            data: {
                labels: Object.keys(categoryTotals),
                datasets: [{
                    data: Object.values(categoryTotals),
                    backgroundColor: [
    '#4776E6', // Royal blue
    '#FF6B6B', // Coral red
    '#FFB84D', // Golden amber
    '#9B5DE5', // Rich violet
    '#00A8A8', // Turquoise
    '#64748B'  // Slate
],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        position: 'bottom'
                    },
                    tooltip: {
                        callbacks: {
                            label: function (context) {
                                return `${context.label}: ₹${Number(context.raw).toLocaleString(
                                    'en-IN',
                                    { maximumFractionDigits: 2 }
                                )
                                    }`;
                            }
                        }
                    }
                }
            }
        });

        // Draw monthly spending bar chart
        new Chart(monthlyCanvas, {
            type: 'bar',
            data: {
                labels: monthLabels,
                datasets: [{
                    label: 'Monthly Spending (₹)',
                    data: monthKeys.map(key => monthlyTotals[key]),
                    backgroundColor: '#0F766E',
                    borderRadius: 6
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            callback: value => '₹' + value
                        }
                    }
                },
                plugins: {
                    legend: {
                        display: false
                    }
                }
            }
        });

    } catch (error) {
        console.error('Analytics error:', error);
        message.textContent =
            'Could not load analytics. Please refresh the page.';
    }
}
loadAnalytics();
