
document.addEventListener("DOMContentLoaded", function () {
    const searchInput = document.getElementById("search-input");
    const typeFilter = document.getElementById("type-filter");
    const categoryFilter = document.getElementById("category-filter");
    const startDate = document.getElementById("start-date");
    const endDate = document.getElementById("end-date");
    const clearButton = document.getElementById("clear-filters");
    const resultCount = document.getElementById("result-count");
    const noResults = document.getElementById("no-results");

    const rows = Array.from(
        document.querySelectorAll(".transaction-row")
    );

    function filterTransactions() {
        const search = searchInput.value.trim().toLowerCase();
        const type = typeFilter.value;
        const category = categoryFilter.value;
        const from = startDate.value;
        const to = endDate.value;

        // Avoid silently showing confusing results for an invalid range.
        const invalidRange = from && to && from > to;

        let visibleCount = 0;

        rows.forEach(function (row) {
            const title = row.dataset.title || "";
            const rowCategory = row.dataset.category || "";
            const rowType = row.dataset.type || "";
            const rowDate = row.dataset.date || "";

            const matchesSearch =
                title.includes(search) ||
                rowCategory.includes(search);

            const matchesType =
                type === "all" || rowType === type;

            const matchesCategory =
                category === "all" || rowCategory === category;

            const matchesStart =
                !from || rowDate >= from;

            const matchesEnd =
                !to || rowDate <= to;

            const visible =
                !invalidRange &&
                matchesSearch &&
                matchesType &&
                matchesCategory &&
                matchesStart &&
                matchesEnd;

            row.hidden = !visible;

            if (visible) {
                visibleCount++;
            }
        });

        resultCount.textContent =
            visibleCount + (visibleCount === 1 ? " record" : " records");

        noResults.hidden = visibleCount !== 0 || rows.length === 0;

        if (invalidRange) {
            noResults.hidden = false;
            noResults.textContent =
                "The start date must be on or before the end date.";
        } else {
            noResults.textContent =
                "No transactions match your filters.";
        }
    }

    [
        searchInput,
        typeFilter,
        categoryFilter,
        startDate,
        endDate
    ].forEach(function (control) {
        control.addEventListener(
            control.tagName === "INPUT" &&
            control.type === "search" ? "input" : "change",
            filterTransactions
        );
    });

    searchInput.addEventListener("input", filterTransactions);

    clearButton.addEventListener("click", function () {
        searchInput.value = "";
        typeFilter.value = "all";
        categoryFilter.value = "all";
        startDate.value = "";
        endDate.value = "";

        filterTransactions();
    });

    filterTransactions();
});


document.getElementById("export-csv")?.addEventListener("click", function () {
    const table = document.querySelector(".transactions-page table");

    if (!table) {
        alert("Transaction table not found.");
        return;
    }

    // Export only rows currently visible after filtering
    const visibleRows = Array.from(table.querySelectorAll("tr")).filter(row => {
        // Always include the header row
        if (row.querySelector("th")) return true;

        // Exclude hidden rows
        const style = window.getComputedStyle(row);
        return style.display !== "none" &&
               style.visibility !== "hidden" &&
               row.offsetParent !== null;
    });

    if (visibleRows.length <= 1) {
        alert("No filtered transactions available to export.");
        return;
    }

    const csvContent = visibleRows.map(row =>
        Array.from(row.querySelectorAll("th, td"))
            .map(cell => {
                // Export displayed text, not buttons or action controls
                const clone = cell.cloneNode(true);
                clone.querySelectorAll("button, a, i, svg").forEach(el => el.remove());

                const value = clone.innerText
                    .trim()
                    .replace(/\s+/g, " ")
                    .replace(/"/g, '""');

                return `"${value}"`;
            })
            .join(",")
    ).join("\r\n");

    const blob = new Blob(["\uFEFF" + csvContent], {
        type: "text/csv;charset=utf-8;"
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "spendwise_filtered_transactions.csv";

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);
});

/* SpendWise - Transactions page effects (counterpart of the dashboard's fx).
   Spotlight, count-up, ripple, header shadow on scroll, theme switch polish. */
(function () {
    "use strict";

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    /* 1. Pointer spotlight on the summary cards */
    document.querySelectorAll(".summary-card").forEach(function (card) {
        card.addEventListener("pointermove", function (e) {
            var r = card.getBoundingClientRect();
            card.style.setProperty("--mx", (e.clientX - r.left) + "px");
            card.style.setProperty("--my", (e.clientY - r.top) + "px");
        });
    });

    /* 2. Count-up for the three headline figures */
    function countUp(el) {
        var raw = el.textContent.replace(/\s+/g, " ").trim();
        var m = raw.match(/^([^\d-]*)(-?)([\d,]*\.?\d+)$/);
        if (!m) return;

        var prefix = m[1];
        var negative = m[2] === "-";
        var numText = m[3].replace(/,/g, "");
        var target = parseFloat(numText);
        if (!isFinite(target)) return;

        var decimals = (numText.split(".")[1] || "").length;
        var fmt = function (n) {
            return prefix + (negative ? "-" : "") + n.toLocaleString("en-IN", {
                minimumFractionDigits: decimals,
                maximumFractionDigits: decimals
            });
        };

        if (reduceMotion || target === 0) {
            el.textContent = fmt(target);
            return;
        }

        var duration = 900;
        var delay = 150;
        var start = null;
        el.textContent = fmt(0);

        function step(ts) {
            if (start === null) start = ts;
            var t = Math.min(1, Math.max(0, (ts - start - delay) / duration));
            var eased = 1 - Math.pow(1 - t, 3);
            el.textContent = fmt(target * eased);
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                el.textContent = fmt(target);
            }
        }
        requestAnimationFrame(step);
    }
    document.querySelectorAll(".summary-card strong").forEach(countUp);

    /* 3. Click ripple on the Export button */
    var exportBtn = document.getElementById("export-csv");
    if (exportBtn && !reduceMotion) {
        exportBtn.addEventListener("pointerdown", function (e) {
            var r = exportBtn.getBoundingClientRect();
            var size = Math.max(r.width, r.height) * 2;
            var ripple = document.createElement("span");
            ripple.className = "fx-ripple";
            ripple.style.width = ripple.style.height = size + "px";
            ripple.style.left = (e.clientX - r.left - size / 2) + "px";
            ripple.style.top = (e.clientY - r.top - size / 2) + "px";
            exportBtn.appendChild(ripple);
            setTimeout(function () { ripple.remove(); }, 700);
        });
    }

    /* 4. Header gains a shadow once the page scrolls */
    var page = document.querySelector(".transactions-page");
    var header = page && page.querySelector(":scope > header");
    if (page && header) {
        var onScroll = function () {
            header.classList.toggle("is-scrolled", page.scrollTop > 4);
        };
        page.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
    }

    /* 5. Theme switch: icon turns in, colours cross-fade (runs before darkmode.js) */
    document.addEventListener("click", function (e) {
        if (!e.target.closest("#theme-toggle")) return;
        var root = document.documentElement;
        root.classList.add("fx-theme-shift");
        setTimeout(function () { root.classList.remove("fx-theme-shift"); }, 450);

        var icon = document.getElementById("theme-icon");
        if (icon) {
            icon.classList.remove("fx-spin");
            void icon.offsetWidth;
            icon.classList.add("fx-spin");
        }
    }, true);

    /* 6. Row entrance runs once; stop it re-triggering when filters re-show rows */
    var rows = document.getElementById("transaction-rows");
    if (rows) {
        setTimeout(function () { rows.setAttribute("data-fx-seen", ""); }, 1600);
    }
})();

/* SpendWise - Transactions: period quick-filters + live summary cards.
   - The period buttons just fill the existing From / To date inputs and fire
     input + change events, so transactions.js does the actual row filtering.
   - Total Income / Total Expenses / Net Balance are recalculated from the
     rows that are currently visible, so they follow EVERY filter (period,
     search, type, category, dates).
   Needs: data-type / data-amount on each tr.transaction-row. */
(function () {
    "use strict";

    var LABELS = {
        all: "All time",
        month: "This month",
        last: "Last month",
        d30: "Last 30 days",
        year: "This year"
    };

    var body = document.getElementById("transaction-rows");
    var startEl = document.getElementById("start-date");
    var endEl = document.getElementById("end-date");
    var incomeEl = document.getElementById("sum-income");
    var expenseEl = document.getElementById("sum-expense");
    var netEl = document.getElementById("sum-net");
    var scopeEl = document.getElementById("summary-scope");
    var chipsWrap = document.getElementById("period-chips");

    if (!body || !incomeEl || !expenseEl || !netEl) return;

    function pad(n) { return n < 10 ? "0" + n : String(n); }

    // Local-time YYYY-MM-DD (toISOString would shift the day in some timezones)
    function iso(d) {
        return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
    }

    function ranges() {
        var t = new Date();
        var y = t.getFullYear();
        var m = t.getMonth();
        return {
            all: ["", ""],
            month: [iso(new Date(y, m, 1)), iso(new Date(y, m + 1, 0))],
            last: [iso(new Date(y, m - 1, 1)), iso(new Date(y, m, 0))],
            d30: [iso(new Date(y, m, t.getDate() - 29)), iso(t)],
            year: [iso(new Date(y, 0, 1)), iso(new Date(y, 11, 31))]
        };
    }

    function money(n) {
        return "₹" + Math.abs(n).toLocaleString("en-IN", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    function isHidden(row) {
        return row.hidden ||
            row.classList.contains("hidden") ||
            row.style.display === "none";
    }

    function fire(el) {
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
    }

    function setPeriod(key) {
        var r = ranges()[key];
        if (!r || !startEl || !endEl) return;
        startEl.value = r[0];
        endEl.value = r[1];
        fire(startEl);
        fire(endEl);
        schedule();
    }

    function currentPeriod() {
        if (!startEl || !endEl) return "all";
        var s = startEl.value;
        var e = endEl.value;
        if (!s && !e) return "all";
        var r = ranges();
        for (var k in r) {
            if (r[k][0] === s && r[k][1] === e) return k;
        }
        return "custom";
    }

    function update() {
        var income = 0;
        var expense = 0;
        var count = 0;
        var rows = body.querySelectorAll("tr.transaction-row");

        Array.prototype.forEach.call(rows, function (row) {
            if (isHidden(row)) return;
            var amount = parseFloat(row.getAttribute("data-amount"));
            if (isNaN(amount)) return;
            count += 1;
            if (row.getAttribute("data-type") === "income") income += amount;
            else expense += amount;
        });

        var net = income - expense;

        incomeEl.textContent = money(income);
        expenseEl.textContent = money(expense);
        netEl.textContent = (net < 0 ? "-" : "") + money(net);
        netEl.className = net < 0 ? "expense-value" : "income-value";

        var period = currentPeriod();
        if (chipsWrap) {
            Array.prototype.forEach.call(chipsWrap.querySelectorAll(".period-chip"), function (chip) {
                var on = chip.getAttribute("data-period") === period;
                chip.classList.toggle("is-active", on);
                chip.setAttribute("aria-pressed", on ? "true" : "false");
            });
        }

        if (scopeEl) {
            var label = LABELS[period] || "Custom range";
            scopeEl.textContent = "Totals above: " + label + " · " +
                count + (count === 1 ? " transaction" : " transactions");
        }
    }

    var queued = false;
    function schedule() {
        if (queued) return;
        queued = true;
        requestAnimationFrame(function () {
            queued = false;
            update();
        });
    }

    if (chipsWrap) {
        chipsWrap.addEventListener("click", function (ev) {
            var chip = ev.target.closest(".period-chip");
            if (chip) setPeriod(chip.getAttribute("data-period"));
        });
    }

    // Recalculate whenever transactions.js shows / hides rows
    new MutationObserver(schedule).observe(body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["hidden", "style", "class"]
    });

    // Typing in the date boxes, or pressing Clear, also refreshes the chips
    ["input", "change"].forEach(function (name) {
        if (startEl) startEl.addEventListener(name, schedule);
        if (endEl) endEl.addEventListener(name, schedule);
    });

    var clearBtn = document.getElementById("clear-filters");
    if (clearBtn) clearBtn.addEventListener("click", function () { setTimeout(schedule, 0); });

    update();
})();