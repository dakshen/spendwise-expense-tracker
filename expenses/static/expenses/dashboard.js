document.addEventListener("DOMContentLoaded", () => {
    // Expense form elements
    const expenseForm = document.getElementById("expense-form");
    const expenseTitle = document.getElementById("expense-title");
    const expenseAmount = document.getElementById("expense-amount");
    const expenseCategory = document.getElementById("expense-category");
    const expenseDate = document.getElementById("expense-date");
    const expenseButton = document.getElementById("add-expense-button");
    const expenseMessage = document.getElementById("form-message");

    // Income form elements
    const incomeForm = document.getElementById("income-form");
    const incomeTitle = document.getElementById("income-title");
    const incomeAmount = document.getElementById("income-amount");
    const incomeCategory = document.getElementById("income-category");
    const incomeDate = document.getElementById("income-date");
    const incomeButton = document.getElementById("add-income-button");
    const incomeMessage = document.getElementById("income-message");

    // Dashboard summary elements
    const transactions = document.getElementById("recent-transactions");
    const netBalance = document.getElementById("total-balance");
    const totalExpense = document.getElementById("total-expense");
    const totalIncome = document.getElementById("total-income");
    const transactionCount = document.getElementById("expense-count");

    let expenses = [];
    let incomes = [];

    let editingExpenseId = null;
    let editingIncomeId = null;

    // Get Django CSRF token
    function csrfToken() {
        const tokenInput = document.querySelector(
            'input[name="csrfmiddlewaretoken"]'
        );

        return tokenInput ? tokenInput.value : "";
    }

    // Format currency
    const prefs = (function () {
            var p = { symbol: "\u20b9", locale: "en-IN" };
            try {
                var el = document.getElementById("sw-prefs");
                if (el) p = Object.assign(p, JSON.parse(el.textContent));
            } catch (e) {}
            return p;
        })();
    function money(value) {
        return prefs.symbol + Number(value || 0).toLocaleString(prefs.locale, {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // Show form success/error messages
    function showMessage(element, message, isError = false) {
        element.textContent = message;

        element.className = isError
            ? "text-sm text-rose-600"
            : "text-sm text-emerald-600";
    }

    // Shared API helper
    async function apiRequest(url, options = {}) {
        const method = options.method || "GET";

        const headers = {
            ...(options.body
                ? { "Content-Type": "application/json" }
                : {}),
            ...(method !== "GET"
                ? { "X-CSRFToken": csrfToken() }
                : {}),
            ...options.headers
        };

        const response = await fetch(url, {
            credentials: "same-origin",
            ...options,
            headers
        });

        const responseText = await response.text();

        let data = {};

        try {
            data = responseText ? JSON.parse(responseText) : {};
        } catch {
            throw new Error(
                `Unexpected server response (${response.status}). ` +
                "Check the Django terminal and browser Network tab."
            );
        }

        if (!response.ok) {
            const error = data.error;

            const detail = typeof error === "string"
                ? error
                : error
                    ? Object.values(error).flat().join(" ")
                    : `Request failed (${response.status})`;

            throw new Error(detail);
        }

        return data;
    }

    // Reset expense form after saving
    function resetExpenseForm() {
        expenseForm.reset();
        editingExpenseId = null;

        expenseButton.innerHTML =
            '<i class="ph ph-plus-circle text-lg"></i> Add Expense';
    }

    // Reset income form after saving
    function resetIncomeForm() {
        incomeForm.reset();
        editingIncomeId = null;

        incomeButton.innerHTML =
            '<i class="ph ph-plus-circle text-lg"></i> Add Income';
    }

    // Calculate dashboard totals
    function updateDashboard() {
        const expenseSum = expenses.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0
        );

        const incomeSum = incomes.reduce(
            (sum, item) => sum + Number(item.amount || 0),
            0
        );


        // Net balance = income - expenses
        const balance = incomeSum - expenseSum;
        const balanceCard = document.querySelector(".balance-card");

        if (balanceCard) {
            balanceCard.style.setProperty(
                "background",
                balance < 0
                    ? "linear-gradient(135deg, #dc2626, #991b1b)"
                    : "linear-gradient(135deg, #16a34a, #15803d)",
                "important"
            );
        }

        netBalance.textContent = money(balance);
        totalIncome.textContent = money(incomeSum);
        totalExpense.textContent = money(expenseSum);

        // Update the balance text color if the balance is negative
        netBalance.classList.toggle("text-rose-100", balance < 0);

        // Count both income and expense records
        const count = expenses.length + incomes.length;

        transactionCount.textContent =
            `${count} transaction${count === 1 ? "" : "s"}`;
    }

    // Display income and expenses together
    function renderTransactions() {
        transactions.innerHTML = "";

        const allTransactions = [
            ...expenses.map(item => ({
                ...item,
                transactionType: "expense"
            })),

            ...incomes.map(item => ({
                ...item,
                transactionType: "income"
            }))
        ];

        // Latest date first
        allTransactions.sort((a, b) => {
            const dateComparison = String(b.date || "").localeCompare(
                String(a.date || "")
            );

            if (dateComparison !== 0) {
                return dateComparison;
            }

            return Number(b.id || 0) - Number(a.id || 0);
        });

        if (allTransactions.length === 0) {
            const emptyMessage = document.createElement("p");

            emptyMessage.className = "text-sm text-slate-400";
            emptyMessage.textContent =
                "No transactions yet. Add income or an expense to get started.";

            transactions.appendChild(emptyMessage);
            return;
        }

        allTransactions.forEach(item => {
            const isIncome = item.transactionType === "income";

            const row = document.createElement("div");
            row.className =
                "flex flex-wrap items-center justify-between gap-3 " +
                "border-b border-slate-100 pb-4";

            // Transaction details
            const details = document.createElement("div");
            details.className = "min-w-0 flex-1";

            const title = document.createElement("p");
            title.className = "font-medium text-slate-800";
            title.textContent = item.title;

            const subtitle = document.createElement("p");
            subtitle.className = "text-xs text-slate-400 mt-1";

            subtitle.textContent =
                `${isIncome ? "Income" : "Expense"} · ` +
                `${item.category || "Other"} · ${item.date || ""}`;

            details.append(title, subtitle);

            // Amount and action buttons
            const right = document.createElement("div");
            right.className = "flex items-center gap-3";

            const amount = document.createElement("span");

            amount.className =
                `font-semibold ${isIncome ? "text-emerald-600" : "text-rose-600"
                }`;

            amount.textContent =
                `${isIncome ? "+" : "-"}${money(item.amount)}`;

            const actions = document.createElement("div");
            actions.className = "flex gap-2";

            // Edit button
            const editButton = document.createElement("button");

            editButton.type = "button";
            editButton.textContent = "Edit";
            editButton.className = "text-xs text-indigo-600 edit-btn";

            editButton.addEventListener("click", () => {
                if (isIncome) {
                    editingIncomeId = item.id;

                    incomeTitle.value = item.title;
                    incomeAmount.value = item.amount;
                    incomeCategory.value = item.category || "Other";
                    incomeDate.value = item.date;

                    incomeButton.innerHTML =
                        '<i class="ph ph-check-circle text-lg"></i> Save Changes';

                    showMessage(incomeMessage, "Editing income.");

                    incomeForm.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    incomeTitle.focus();
                } else {
                    editingExpenseId = item.id;

                    expenseTitle.value = item.title;
                    expenseAmount.value = item.amount;
                    expenseCategory.value = item.category || "Other";
                    expenseDate.value = item.date;

                    expenseButton.innerHTML =
                        '<i class="ph ph-check-circle text-lg"></i> Save Changes';

                    showMessage(expenseMessage, "Editing expense.");

                    expenseForm.scrollIntoView({
                        behavior: "smooth",
                        block: "center"
                    });

                    expenseTitle.focus();
                }
            });

            // Delete button
            const deleteButton = document.createElement("button");

            deleteButton.type = "button";
            deleteButton.textContent = "Delete";
            deleteButton.className = "text-xs text-rose-600 delete-btn";

            deleteButton.addEventListener("click", async () => {
                if (!confirm(`Delete "${item.title}"?`)) {
                    return;
                }

                try {
                    const url = isIncome
                        ? `/api/income/${item.id}/`
                        : `/api/${item.id}/`;

                    await apiRequest(url, {
                        method: "DELETE"
                    });

                    if (isIncome) {
                        incomes = incomes.filter(
                            entry => entry.id !== item.id
                        );

                        if (editingIncomeId === item.id) {
                            resetIncomeForm();
                        }
                    } else {
                        expenses = expenses.filter(
                            entry => entry.id !== item.id
                        );

                        if (editingExpenseId === item.id) {
                            resetExpenseForm();
                        }
                    }

                    renderTransactions();
                    updateDashboard();

                    showMessage(
                        isIncome ? incomeMessage : expenseMessage,
                        `${isIncome ? "Income" : "Expense"} deleted successfully.`
                    );

                } catch (error) {
                    console.error("Delete failed:", error);

                    showMessage(
                        isIncome ? incomeMessage : expenseMessage,
                        error.message,
                        true
                    );
                }
            });

            actions.append(editButton, deleteButton);
            right.append(amount, actions);
            row.append(details, right);

            transactions.appendChild(row);
        });
    }

    // Load expenses from Django
    async function loadExpenses() {
        const data = await apiRequest("/api/");

        if (!Array.isArray(data)) {
            throw new Error("The expenses API did not return a list.");
        }

        expenses = data;
    }

    // Load income records from Django
    async function loadIncomes() {
        const data = await apiRequest("/api/income/");

        if (!Array.isArray(data)) {
            throw new Error("The income API did not return a list.");
        }

        incomes = data;
    }

    // Add or update an expense
    expenseForm.addEventListener("submit", async event => {
        event.preventDefault();

        const title = expenseTitle.value.trim();
        const amount = expenseAmount.value;
        const category = expenseCategory.value;
        const date = expenseDate.value;

        if (!title || !amount || !category || !date) {
            showMessage(
                expenseMessage,
                "Please fill in all fields.",
                true
            );
            return;
        }

        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            showMessage(
                expenseMessage,
                "Amount must be greater than zero.",
                true
            );
            return;
        }

        const isEditing = editingExpenseId !== null;

        expenseButton.disabled = true;

        showMessage(
            expenseMessage,
            isEditing ? "Updating expense..." : "Saving expense..."
        );

        try {
            const saved = await apiRequest(
                isEditing
                    ? `/api/${editingExpenseId}/`
                    : "/api/",
                {
                    method: isEditing ? "PUT" : "POST",
                    body: JSON.stringify({
                        title,
                        amount,
                        category,
                        date
                    })
                }
            );

            if (isEditing) {
                expenses = expenses.map(item =>
                    item.id === saved.id ? saved : item
                );
            } else {
                expenses.push(saved);
            }

            resetExpenseForm();
            renderTransactions();
            updateDashboard();

            showMessage(
                expenseMessage,
                isEditing
                    ? "Expense updated successfully."
                    : "Expense added successfully."
            );

        } catch (error) {
            console.error("Saving expense failed:", error);

            showMessage(
                expenseMessage,
                error.message,
                true
            );
        } finally {
            expenseButton.disabled = false;
        }
    });

    // Add or update an income record
    incomeForm.addEventListener("submit", async event => {
        event.preventDefault();

        const title = incomeTitle.value.trim();
        const amount = incomeAmount.value;
        const category = incomeCategory.value;
        const date = incomeDate.value;

        if (!title || !amount || !category || !date) {
            showMessage(
                incomeMessage,
                "Please fill in all fields.",
                true
            );
            return;
        }

        if (!Number.isFinite(Number(amount)) || Number(amount) <= 0) {
            showMessage(
                incomeMessage,
                "Amount must be greater than zero.",
                true
            );
            return;
        }

        const isEditing = editingIncomeId !== null;

        incomeButton.disabled = true;

        showMessage(
            incomeMessage,
            isEditing ? "Updating income..." : "Saving income..."
        );

        try {
            const saved = await apiRequest(
                isEditing
                    ? `/api/income/${editingIncomeId}/`
                    : "/api/income/",
                {
                    method: isEditing ? "PUT" : "POST",
                    body: JSON.stringify({
                        title,
                        amount,
                        category,
                        date
                    })
                }
            );

            if (isEditing) {
                incomes = incomes.map(item =>
                    item.id === saved.id ? saved : item
                );
            } else {
                incomes.push(saved);
            }

            resetIncomeForm();
            renderTransactions();
            updateDashboard();

            showMessage(
                incomeMessage,
                isEditing
                    ? "Income updated successfully."
                    : "Income added successfully."
            );

        } catch (error) {
            console.error("Saving income failed:", error);

            showMessage(
                incomeMessage,
                error.message,
                true
            );
        } finally {
            incomeButton.disabled = false;
        }
    });

    // Load both sets of records when the page opens
    async function initialiseDashboard() {
        const results = await Promise.allSettled([
            loadExpenses(),
            loadIncomes()
        ]);

        const expenseResult = results[0];
        const incomeResult = results[1];

        if (expenseResult.status === "rejected") {
            console.error(
                "Loading expenses failed:",
                expenseResult.reason
            );

            showMessage(
                expenseMessage,
                `Could not load expenses: ${expenseResult.reason.message}`,
                true
            );
        }

        if (incomeResult.status === "rejected") {
            console.error(
                "Loading income failed:",
                incomeResult.reason
            );

            showMessage(
                incomeMessage,
                `Could not load income: ${incomeResult.reason.message}. ` +
                "Check that the Income model and API are configured.",
                true
            );
        }

        renderTransactions();
        updateDashboard();
    }

    initialiseDashboard();
});

/* SpendWise - dashboard motion layer
   Standalone: it only watches the DOM, it never edits dashboard.js's data.
   - Counts the summary figures up/down whenever dashboard.js updates them
   - Pointer spotlight on summary cards
   - Click ripple on the two submit buttons
   - Header shadow once the page scrolls
   - Smooth light/dark cross-fade and icon turn on theme toggle
   Everything is skipped when the user prefers reduced motion. */
(function () {
    "use strict";

    var reduce = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    function ready(fn) {
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", fn);
        } else {
            fn();
        }
    }

    /* ---------- Count-up for the summary figures ---------- */

    var fxLocale = "en-IN";
    try {
        var fxEl = document.getElementById("sw-prefs");
        if (fxEl) fxLocale = JSON.parse(fxEl.textContent).locale || fxLocale;
    } catch (e) {}

    var NUMBER = /\d[\d,]*(?:\.\d+)?/;

    function parse(text) {
        var m = NUMBER.exec(text);
        if (!m) return null;
        var raw = m[0];
        var before = text.slice(0, m.index);
        return {
            value: parseFloat(raw.replace(/,/g, "")),
            decimals: raw.indexOf(".") > -1 ? raw.split(".")[1].length : 0,
            lakh: /^\d{1,2}(,\d{2})+,\d{3}/.test(raw),
            grouped: raw.indexOf(",") > -1,
            neg: /[-\u2212]/.test(before),
            before: before,
            after: text.slice(m.index + raw.length)
        };
    }

    function format(v, p) {
        if (!p.grouped && v < 1000) return v.toFixed(p.decimals);
        return v.toLocaleString(fxLocale, {
            minimumFractionDigits: p.decimals,
            maximumFractionDigits: p.decimals
        });
    }

    function ease(t) {
        return 1 - Math.pow(1 - t, 4);
    }

    function sheen(el) {
        var card = el.closest(".balance-card");
        if (!card) return;
        card.classList.remove("fx-sheen");
        void card.offsetWidth;
        card.classList.add("fx-sheen");
    }

    function track(el) {
        var st = { current: 0, lastWritten: null, raf: 0 };
        el._fx = st;

        function write(s) {
            st.lastWritten = s;
            el.textContent = s;
        }

        function run() {
            var text = el.textContent;
            if (text === st.lastWritten) return; // our own write

            var p = parse(text);
            if (!p) {
                st.lastWritten = text;
                return;
            }

            var target = p.neg ? -p.value : p.value;
            var from = st.current;
            cancelAnimationFrame(st.raf);

            if (reduce || from === target) {
                st.current = target;
                st.lastWritten = text;
                return;
            }

            // Animate magnitude; restart from zero if the sign flips
            var sameSign = from === 0 || (from < 0) === (target < 0);
            var fromAbs = sameSign ? Math.abs(from) : 0;
            var toAbs = p.value;
            var duration = 1000;
            var start = performance.now();

            function step(now) {
                var t = Math.min(1, (now - start) / duration);
                var v = fromAbs + (toAbs - fromAbs) * ease(t);
                if (t < 1) {
                    write(p.before + format(v, p) + p.after);
                    st.current = p.neg ? -v : v;
                    st.raf = requestAnimationFrame(step);
                } else {
                    write(text); // land on exactly what dashboard.js wrote
                    st.current = target;
                }
            }

            if (el.id === "total-balance") sheen(el);
            step(start); // first frame immediately, so the final value never flashes
        }

        new MutationObserver(run).observe(el, {
            childList: true,
            characterData: true,
            subtree: true
        });

        run(); // handles values already present before this script ran
    }

    /* ---------- Pointer spotlight ---------- */

    function spotlight() {
        document.querySelectorAll(".summary-cards > div").forEach(function (card) {
            card.addEventListener("pointermove", function (e) {
                if (e.pointerType && e.pointerType !== "mouse") return;
                var r = card.getBoundingClientRect();
                card.style.setProperty("--mx", e.clientX - r.left + "px");
                card.style.setProperty("--my", e.clientY - r.top + "px");
            });
        });
    }

    /* ---------- Header shadow on scroll ---------- */

    function headerShadow() {
        var scroller = document.querySelector("main > div.overflow-y-auto");
        var header = document.querySelector(".dashboard-header");
        if (!scroller || !header) return;
        scroller.addEventListener(
            "scroll",
            function () {
                header.classList.toggle("is-scrolled", scroller.scrollTop > 4);
            },
            { passive: true }
        );
    }

    /* ---------- Button ripple ---------- */

    function ripples() {
        if (reduce) return;
        ["add-income-button", "add-expense-button"].forEach(function (id) {
            var btn = document.getElementById(id);
            if (!btn) return;
            btn.addEventListener("pointerdown", function (e) {
                if (btn.disabled) return;
                var r = btn.getBoundingClientRect();
                var d = Math.max(r.width, r.height) * 1.6;
                var s = document.createElement("span");
                s.className = "fx-ripple";
                s.style.width = s.style.height = d + "px";
                s.style.left = e.clientX - r.left - d / 2 + "px";
                s.style.top = e.clientY - r.top - d / 2 + "px";
                btn.appendChild(s);
                s.addEventListener("animationend", function () {
                    s.remove();
                });
            });
        });
    }

    /* ---------- Theme toggle polish ---------- */

    function themeToggle() {
        var btn = document.getElementById("theme-toggle");
        if (!btn || reduce) return;
        var timer;
        btn.addEventListener("click", function () {
            var icon = document.getElementById("theme-icon");
            document.documentElement.classList.add("fx-theme-shift");
            if (icon) {
                icon.classList.remove("fx-spin");
                void icon.offsetWidth;
                icon.classList.add("fx-spin");
            }
            clearTimeout(timer);
            timer = setTimeout(function () {
                document.documentElement.classList.remove("fx-theme-shift");
            }, 500);
        });
    }

    /* ---------- Rows slide in on first render only ---------- */

    function rowsEnterOnce() {
        var list = document.getElementById("recent-transactions");
        if (!list) return;
        var obs = new MutationObserver(function () {
            obs.disconnect(); // first render of the list has happened
            setTimeout(function () {
                list.setAttribute("data-fx-seen", "");
            }, 1200);
        });
        obs.observe(list, { childList: true });
    }

    ready(function () {
        ["total-balance", "total-income", "total-expense", "expense-count"].forEach(function (id) {
            var el = document.getElementById(id);
            if (el) track(el);
        });
        spotlight();
        headerShadow();
        ripples();
        themeToggle();
        rowsEnterOnce();
    });
})();


/* SpendWise - mobile helpers for the dashboard.
   1. Builds the bottom navigation from the existing sidebar links
      (so URLs/icons never get out of sync with sidebar.html).
   2. Wires the quick-action pills (scroll to form / open Scan Bill).
   Nothing here runs visibly on desktop: the nav and pills are hidden by CSS. */
(function () {
    "use strict";

    var WANTED = [
        { re: /dashboard/i, label: "Dashboard", icon: "ph-squares-four" },
        { re: /transaction/i, label: "Transactions", icon: "ph-receipt" },
        { re: /analytic/i, label: "Analytics", icon: "ph-chart-line-up" },
        { re: /setting/i, label: "Settings", icon: "ph-sliders-horizontal" }
    ];

    function samePath(a) {
        // Placeholder links (e.g. Settings = "#") must never count as the current page
        if (!a || a.charAt(0) === "#") return false;
        try {
            return new URL(a, location.href).pathname.replace(/\/+$/, "") ===
                location.pathname.replace(/\/+$/, "");
        } catch (e) {
            return false;
        }
    }

    function buildBottomNav() {
        if (document.querySelector(".mobile-bottom-nav")) return;

        var links = Array.prototype.slice.call(
            document.querySelectorAll("#sidebar a[href]")
        );
        if (!links.length) return;

        var items = [];
        WANTED.forEach(function (w) {
            var match = links.filter(function (a) {
                return w.re.test(a.textContent) && !/^javascript:/i.test(a.getAttribute("href"));
            })[0];
            if (match) items.push({ a: match, w: w });
        });

        // Fallback: if the sidebar uses other labels, take its first four links
        if (items.length < 2) {
            items = links.slice(0, 4).map(function (a) {
                return { a: a, w: { label: a.textContent.trim(), icon: "ph-circle" } };
            });
        }

        var nav = document.createElement("nav");
        nav.className = "mobile-bottom-nav";
        nav.setAttribute("aria-label", "Primary");
        nav.style.setProperty("--mbn-count", items.length);

        items.forEach(function (it) {
            var href = it.a.getAttribute("href");
            var a = document.createElement("a");
            a.href = href;

            // Reuse the sidebar's own icon when it has one
            var srcIcon = it.a.querySelector("i[class*='ph']");
            var i = document.createElement("i");
            i.className = srcIcon ? srcIcon.className.replace(/\btext-\S+/g, "").trim()
                                  : "ph " + it.w.icon;
            i.setAttribute("aria-hidden", "true");

            var s = document.createElement("span");
            s.textContent = it.w.label;

            a.appendChild(i);
            a.appendChild(s);

            var active = samePath(href) ||
                it.a.classList.contains("active") ||
                it.a.classList.contains("bg-indigo-50");
            if (active) {
                a.classList.add("is-active");
                a.setAttribute("aria-current", "page");
            }
            nav.appendChild(a);
        });

        document.body.appendChild(nav);
    }

    function wireActions() {
        var buttons = document.querySelectorAll(".mobile-action");
        Array.prototype.forEach.call(buttons, function (btn) {
            btn.addEventListener("click", function () {
                if (btn.getAttribute("data-scan")) {
                    var scan = document.getElementById("scan-bill-button");
                    if (scan) scan.click();
                    return;
                }
                var target = document.getElementById(btn.getAttribute("data-target"));
                if (!target) return;
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                var field = target.querySelector("input");
                if (field) {
                    // focus after the scroll so the keyboard doesn't fight it
                    setTimeout(function () {
                        try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); }
                    }, 450);
                }
            });
        });
    }

    function init() {
        buildBottomNav();
        wireActions();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();

/* SpendWise - mobile helpers for the dashboard.
   1. Builds the bottom navigation from the existing sidebar links
      (so URLs/icons never get out of sync with sidebar.html).
   2. Wires the quick-action pills (scroll to form / open Scan Bill).
   Nothing here runs visibly on desktop: the nav and pills are hidden by CSS. */
(function () {
    "use strict";

    var WANTED = [
        { re: /dashboard/i, label: "Dashboard", icon: "ph-squares-four" },
        { re: /transaction/i, label: "Transactions", icon: "ph-receipt" },
        { re: /analytic/i, label: "Analytics", icon: "ph-chart-line-up" }
    ];

    function samePath(a) {
        // Placeholder links (e.g. Settings = "#") must never count as the current page
        if (!a || a.charAt(0) === "#") return false;
        try {
            return new URL(a, location.href).pathname.replace(/\/+$/, "") ===
                location.pathname.replace(/\/+$/, "");
        } catch (e) {
            return false;
        }
    }

    function buildBottomNav() {
        if (document.querySelector(".mobile-bottom-nav")) return;

        var links = Array.prototype.slice.call(
            document.querySelectorAll("#sidebar a[href]")
        );
        if (!links.length) return;

        var items = [];
        WANTED.forEach(function (w) {
            var match = links.filter(function (a) {
                return w.re.test(a.textContent) && !/^javascript:/i.test(a.getAttribute("href"));
            })[0];
            if (match) items.push({ a: match, w: w });
        });

        // Fallback: if the sidebar uses other labels, take its first four links
        if (items.length < 2) {
            items = links.slice(0, 4).map(function (a) {
                return { a: a, w: { label: a.textContent.trim(), icon: "ph-circle" } };
            });
        }

        var nav = document.createElement("nav");
        nav.className = "mobile-bottom-nav";
        nav.setAttribute("aria-label", "Primary");
        var hasScan = !!document.getElementById("scan-bill-button");
        nav.style.setProperty("--mbn-count", items.length + (hasScan ? 1 : 0));

        items.forEach(function (it) {
            var href = it.a.getAttribute("href");
            var a = document.createElement("a");
            a.href = href;

            // Reuse the sidebar's own icon when it has one
            var srcIcon = it.a.querySelector("i[class*='ph']");
            var i = document.createElement("i");
            i.className = srcIcon ? srcIcon.className.replace(/\btext-\S+/g, "").trim()
                                  : "ph " + it.w.icon;
            i.setAttribute("aria-hidden", "true");

            var s = document.createElement("span");
            s.textContent = it.w.label;

            a.appendChild(i);
            a.appendChild(s);

            var active = samePath(href) ||
                it.a.classList.contains("active") ||
                it.a.classList.contains("bg-indigo-50");
            if (active) {
                a.classList.add("is-active");
                a.setAttribute("aria-current", "page");
            }
            nav.appendChild(a);
        });

        // Scan Bill replaces Settings (dashboard only: the button lives on this page)
        if (hasScan) {
            var b = document.createElement("button");
            b.type = "button";
            b.className = "mobile-nav-scan";
            b.innerHTML = '<i class="ph ph-scan" aria-hidden="true"></i><span>Scan Bill</span>';
            b.addEventListener("click", function () {
                var scan = document.getElementById("scan-bill-button");
                if (scan) scan.click();
            });
            nav.appendChild(b);
        }

        document.body.appendChild(nav);
    }

    function wireActions() {
        var buttons = document.querySelectorAll(".mobile-action");
        Array.prototype.forEach.call(buttons, function (btn) {
            btn.addEventListener("click", function () {
                if (btn.getAttribute("data-scan")) {
                    var scan = document.getElementById("scan-bill-button");
                    if (scan) scan.click();
                    return;
                }
                var target = document.getElementById(btn.getAttribute("data-target"));
                if (!target) return;
                target.scrollIntoView({ behavior: "smooth", block: "start" });
                var field = target.querySelector("input");
                if (field) {
                    // focus after the scroll so the keyboard doesn't fight it
                    setTimeout(function () {
                        try { field.focus({ preventScroll: true }); } catch (e) { field.focus(); }
                    }, 450);
                }
            });
        });
    }

    function init() {
        buildBottomNav();
        wireActions();
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();