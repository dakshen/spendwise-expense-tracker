/* SpendWise - Analytics page effects.
   Load this BEFORE analytics.js (both deferred) so the Chart.js defaults
   below are in place when the charts are created. */
(function () {
    "use strict";

    var reduceMotion = window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    var canHover = window.matchMedia && window.matchMedia("(hover: hover)").matches;

    /* 1. Chart.js: refined typography, smoother animation, premium tooltips.
          Colours are left alone so analytics.js keeps control of light/dark. */
    if (window.Chart && Chart.defaults) {
        try {
            var d = Chart.defaults;
            d.font.family = "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
            d.font.size = 12;

            if (!reduceMotion && d.animation) {
                d.animation.duration = 1100;
                d.animation.easing = "easeOutQuart";
            }

            var t = d.plugins.tooltip;
            t.backgroundColor = "rgba(15, 26, 48, 0.94)";
            t.titleColor = "#ffffff";
            t.bodyColor = "#dbe3f5";
            t.borderColor = "rgba(255, 255, 255, 0.08)";
            t.borderWidth = 1;
            t.padding = 12;
            t.cornerRadius = 12;
            t.boxPadding = 4;
            t.caretSize = 6;
            t.usePointStyle = true;
            t.titleFont = { weight: "600", size: 13 };
            t.bodyFont = { size: 12.5 };

            var l = d.plugins.legend.labels;
            l.usePointStyle = true;
            l.boxWidth = 8;
            l.boxHeight = 8;
            l.padding = 16;
        } catch (e) { /* never break the page over styling */ }
    }

    /* 2. Stat cards: pointer spotlight + gentle 3D tilt */
    document.querySelectorAll(".analytics-stat").forEach(function (card) {
        card.addEventListener("pointermove", function (e) {
            var r = card.getBoundingClientRect();
            var x = e.clientX - r.left;
            var y = e.clientY - r.top;
            card.style.setProperty("--mx", x + "px");
            card.style.setProperty("--my", y + "px");

            if (canHover && !reduceMotion) {
                card.style.setProperty("--ry", ((x / r.width - 0.5) * 6).toFixed(2) + "deg");
                card.style.setProperty("--rx", ((0.5 - y / r.height) * 6).toFixed(2) + "deg");
            }
        });

        card.addEventListener("pointerleave", function () {
            card.style.setProperty("--rx", "0deg");
            card.style.setProperty("--ry", "0deg");
        });
    });

    /* 3. Count-up whenever analytics.js writes a new figure (load + month change) */
    function parseFigure(txt) {
        var m = txt.replace(/\s+/g, " ").trim().match(/^([^\d-]*)(-?)([\d,]*\.?\d+)$/);
        if (!m) return null;
        var num = m[3].replace(/,/g, "");
        var value = parseFloat(num);
        if (!isFinite(value)) return null;
        return { prefix: m[1], neg: m[2] === "-", value: value, dec: (num.split(".")[1] || "").length };
    }

    ["total-spending", "average-daily", "total-transactions"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el) return;

        var st = { last: 0, current: 0, raf: 0 };
        var first = parseFigure(el.textContent);
        if (first) { st.last = first.value; st.current = first.value; }

        var obs = new MutationObserver(function () {
            var info = parseFigure(el.textContent);
            if (!info || info.value === st.last) return;

            var from = st.current;
            st.last = info.value;
            if (reduceMotion) { st.current = info.value; return; }

            function fmt(n) {
                return info.prefix + (info.neg ? "-" : "") + n.toLocaleString("en-IN", {
                    minimumFractionDigits: info.dec,
                    maximumFractionDigits: info.dec
                });
            }

            cancelAnimationFrame(st.raf);
            el.textContent = fmt(from);
            obs.takeRecords();

            var start = null;
            var duration = 950;
            (function step(ts) {
                if (start === null) start = ts;
                var p = Math.min(1, (ts - start) / duration);
                var eased = 1 - Math.pow(1 - p, 4);
                st.current = from + (info.value - from) * eased;
                el.textContent = fmt(p < 1 ? st.current : info.value);
                obs.takeRecords();
                if (p < 1) st.raf = requestAnimationFrame(step);
            })(performance.now());
        });
        obs.observe(el, { childList: true, characterData: true, subtree: true });
    });

    /* 4. Text that changes with the month eases in */
    ["top-category", "analytics-period-label", "trend-peak", "trend-avg"].forEach(function (id) {
        var el = document.getElementById(id);
        if (!el || reduceMotion) return;
        var prev = el.textContent;
        new MutationObserver(function () {
            if (el.textContent === prev) return;
            prev = el.textContent;
            el.classList.remove("fx-pop");
            void el.offsetWidth;
            el.classList.add("fx-pop");
        }).observe(el, { childList: true, characterData: true, subtree: true });
    });

    /* 5. Breakdown progress bars grow from zero each time they render */
    var tbody = document.getElementById("category-breakdown");
    function growBars() {
        if (!tbody || reduceMotion) return;
        tbody.querySelectorAll('td:last-child [style*="width"]').forEach(function (bar) {
            if (bar.dataset.fxGrown) return;
            if (bar.querySelector('[style*="width"]')) return; /* that's the track */
            var w = bar.style.width;
            if (!w) return;
            bar.dataset.fxGrown = "1";
            bar.style.width = "0%";
            void bar.offsetWidth;
            requestAnimationFrame(function () { bar.style.width = w; });
        });
    }
    if (tbody) {
        new MutationObserver(growBars).observe(tbody, { childList: true });
        growBars();
    }

    /* 6. Header gains a shadow once the page scrolls */
    var scroller = document.querySelector(".analytics-scroll");
    var header = document.querySelector(".dashboard-header");
    if (scroller && header) {
        var onScroll = function () {
            header.classList.toggle("is-scrolled", scroller.scrollTop > 4);
        };
        scroller.addEventListener("scroll", onScroll, { passive: true });
        onScroll();
    }

    /* 7. Theme switch: icon turns in, colours cross-fade (runs before darkmode.js) */
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

    /* 8. Cards below the fold rise in as they are scrolled to, and their
          charts replay their draw animation at that moment */
    var cards = document.querySelectorAll(".analytics-card");
    if (cards.length && !reduceMotion && "IntersectionObserver" in window) {
        var io = new IntersectionObserver(function (entries) {
            entries.forEach(function (entry) {
                if (!entry.isIntersecting) return;
                var card = entry.target;
                io.unobserve(card);

                requestAnimationFrame(function () {
                    card.classList.add("fx-in");

                    var canvas = card.querySelector("canvas");
                    if (canvas && window.Chart && Chart.getChart) {
                        var chart = Chart.getChart(canvas);
                        if (chart) {
                            chart.reset();
                            chart.update();
                        }
                    }

                    // Drop the helper classes so normal hover transitions return
                    setTimeout(function () {
                        card.classList.remove("fx-await", "fx-in");
                        card.style.transitionDelay = "";
                    }, 1100);
                });
            });
        }, { root: scroller || null, threshold: 0.12 });

        cards.forEach(function (card, i) {
            card.classList.add("fx-await");
            card.style.transitionDelay = (Math.min(i, 3) * 70) + "ms";
            io.observe(card);
        });
    }

    /* 9. Keyboard: ← / → step through months */
    document.addEventListener("keydown", function (e) {
        if (e.metaKey || e.ctrlKey || e.altKey) return;
        var tag = (e.target && e.target.tagName) || "";
        if (/INPUT|TEXTAREA|SELECT/.test(tag) || (e.target && e.target.isContentEditable)) return;

        var btn = null;
        if (e.key === "ArrowLeft") btn = document.getElementById("month-prev");
        if (e.key === "ArrowRight") btn = document.getElementById("month-next");
        if (btn && !btn.disabled) btn.click();
    });
    /* 10. Stat cards: SVG outline whose short dark segment runs one lap on hover
          (styled in the CSS) */
    var SVG_NS = "http://www.w3.org/2000/svg";
    document.querySelectorAll(".analytics-stat").forEach(function (card) {
        var svg = document.createElementNS(SVG_NS, "svg");
        svg.setAttribute("class", "card-ring");
        svg.setAttribute("aria-hidden", "true");
        for (var k = 0; k < 2; k++) { /* one segment each way */
            var rect = document.createElementNS(SVG_NS, "rect");
            rect.setAttribute("pathLength", "100");
            svg.appendChild(rect);
        }
        card.appendChild(svg);
    });
})();


(() => {
    'use strict';

    const message = document.getElementById('analytics-message');

    const palette = [
        '#6366f1',
        '#14b8a6',
        '#f97316',
        '#a855f7',
        '#3b82f6',
        '#f43f5e',
        '#eab308',
        '#10b981',
        '#64748b'
    ];

    const chartInstances = {};

    let allExpenses = [];
    let earliestMonth = startOfMonth(new Date());
    let selectedMonth = startOfMonth(new Date());
    let dataLoaded = false;

    /* ------------------------------------------------------------------
       Helpers
       ------------------------------------------------------------------ */

    function money(amount) {
        return '₹' + Number(amount || 0).toLocaleString('en-IN', {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2
        });
    }

    // Short axis labels: ₹1.5K, ₹2L ...
    function compactMoney(amount) {
        const value = Number(amount || 0);

        try {
            return '₹' + new Intl.NumberFormat('en-IN', {
                notation: 'compact',
                maximumFractionDigits: 1
            }).format(value);
        } catch (error) {
            return '₹' + value.toLocaleString('en-IN');
        }
    }

    function setText(id, value) {
        const element = document.getElementById(id);

        if (element) {
            element.textContent = value;
        }
    }

    function startOfMonth(date) {
        return new Date(date.getFullYear(), date.getMonth(), 1);
    }

    function daysInMonth(date) {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    }

    function dateFromISO(value) {
        if (!value) return null;

        // Accept "2026-11-07" as well as "2026-11-07T10:30:00Z"
        const parts = String(value).slice(0, 10).split('-').map(Number);

        if (parts.length !== 3 || parts.some(Number.isNaN)) {
            return null;
        }

        const date = new Date(parts[0], parts[1] - 1, parts[2]);

        if (
            date.getFullYear() !== parts[0] ||
            date.getMonth() !== parts[1] - 1 ||
            date.getDate() !== parts[2]
        ) {
            return null;
        }

        return date;
    }

    function monthKey(date) {
        return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    }

    function shortMonth(date) {
        return date.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
    }

    function longMonth(date) {
        return date.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
    }

    function escapeHTML(value) {
        return String(value).replace(/[&<>"']/g, char => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        }[char]));
    }

    function normalizeExpenses(expenses) {
        return expenses
            .map(expense => ({
                ...expense,
                amountNumber: Number(expense.amount),
                parsedDate: dateFromISO(expense.date),
                kind: String(expense.type || expense.transaction_type || '').toLowerCase(),
                categoryName: String(expense.category || 'Other').trim() || 'Other'
            }))
            .filter(expense =>
                expense.kind !== 'income' &&
                Number.isFinite(expense.amountNumber) &&
                expense.amountNumber >= 0 &&
                expense.parsedDate
            );
    }

    /* ------------------------------------------------------------------
       Chart theme (follows the dark-mode toggle)
       ------------------------------------------------------------------ */

    function chartTheme() {
        const dark = document.body.classList.contains('dark-mode');

        return dark
            ? {
                text: '#a3a3a3',
                grid: 'rgba(255, 255, 255, 0.07)',
                surface: '#0e0e10',
                line: '#2dd4bf',
                line2: '#818cf8',
                glow: 'rgba(45, 212, 191, 0.35)',
                cross: 'rgba(165, 180, 252, 0.45)',
                areaTop: 'rgba(45, 212, 191, 0.32)',
                areaBottom: 'rgba(45, 212, 191, 0)',
                pointFill: '#0e0e10',
                barTop: 'rgba(129, 140, 248, 0.38)',
                barBottom: 'rgba(129, 140, 248, 0.06)',
                barActiveTop: '#a5b4fc',
                barActiveBottom: '#6366f1',
                centerTitle: '#f5f5f5'
            }
            : {
                text: '#64748b',
                grid: 'rgba(148, 163, 184, 0.20)',
                surface: '#ffffff',
                line: '#0d9488',
                line2: '#0d9488',
                glow: 'rgba(13, 148, 136, 0.30)',
                cross: 'rgba(99, 102, 241, 0.45)',
                areaTop: 'rgba(13, 148, 136, 0.28)',
                areaBottom: 'rgba(13, 148, 136, 0)',
                pointFill: '#ffffff',
                barTop: 'rgba(99, 102, 241, 0.34)',
                barBottom: 'rgba(99, 102, 241, 0.08)',
                barActiveTop: '#818cf8',
                barActiveBottom: '#4338ca',
                centerTitle: '#0f1a30'
            };
    }

    function applyChartDefaults(theme) {
        if (typeof Chart === 'undefined') {
            throw new Error(
                'Chart.js did not load. Check your internet connection or Chart.js script URL.'
            );
        }

        Chart.defaults.color = theme.text;
        Chart.defaults.borderColor = theme.grid;
        Chart.defaults.font.family = "'Inter', sans-serif";
    }

    /* ------------------------------------------------------------------
       Gradient + plugin helpers
       ------------------------------------------------------------------ */

    // Vertical gradient that follows the chart area (scriptable-option safe)
    function verticalGradient(chart, top, bottom) {
        const area = chart.chartArea;

        if (!area) return top;

        const gradient = chart.ctx.createLinearGradient(0, area.top, 0, area.bottom);
        gradient.addColorStop(0, top);
        gradient.addColorStop(1, bottom);

        return gradient;
    }

    // Soft glow under the trend line
    const lineGlowPlugin = {
        id: 'lineGlow',
        beforeDatasetDraw(chart, args, options) {
            if (!options || !options.color) return;

            const ctx = chart.ctx;
            ctx.save();
            ctx.shadowColor = options.color;
            ctx.shadowBlur = 14;
            ctx.shadowOffsetY = 6;
        },
        afterDatasetDraw(chart, args, options) {
            if (!options || !options.color) return;

            chart.ctx.restore();
        }
    };

    // Dashed vertical guide that follows the hovered day
    const crosshairPlugin = {
        id: 'crosshair',
        afterDatasetsDraw(chart, args, options) {
            if (!options || !chart.tooltip || !chart.tooltip.getActiveElements) return;

            const active = chart.tooltip.getActiveElements();

            if (!active.length) return;

            const x = active[0].element.x;
            const area = chart.chartArea;
            const ctx = chart.ctx;

            ctx.save();
            ctx.beginPath();
            ctx.setLineDash([4, 4]);
            ctx.lineWidth = 1;
            ctx.strokeStyle = options.color;
            ctx.moveTo(x, area.top);
            ctx.lineTo(x, area.bottom);
            ctx.stroke();
            ctx.restore();
        }
    };

    // Total spend printed in the middle of the doughnut
    const centerTextPlugin = {
        id: 'centerText',
        afterDraw(chart, args, options) {
            if (!options || !options.value) return;

            const area = chart.chartArea;
            const meta = chart.getDatasetMeta(0);
            const arc = meta && meta.data && meta.data[0];
            const ctx = chart.ctx;
            const cx = (area.left + area.right) / 2;
            const cy = (area.top + area.bottom) / 2;
            const family = "'Inter', sans-serif";
            const maxWidth = (arc && arc.innerRadius ? arc.innerRadius : 60) * 1.65;

            let size = 24;
            ctx.save();
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            ctx.font = `700 ${size}px ${family}`;
            while (ctx.measureText(options.value).width > maxWidth && size > 12) {
                size -= 1;
                ctx.font = `700 ${size}px ${family}`;
            }

            ctx.fillStyle = options.color;
            ctx.fillText(options.value, cx, cy + 8);

            ctx.font = `500 12px ${family}`;
            ctx.fillStyle = options.sub;
            ctx.fillText(options.label, cx, cy - 14);
            ctx.restore();
        }
    };

    // Draws a chart, or shows an empty-state message instead when there is no data.
    function drawChart(id, config, isEmpty, emptyText) {
        const canvas = document.getElementById(id);

        if (!canvas) {
            console.warn(`Chart canvas not found: ${id}`);
            return;
        }

        if (chartInstances[id]) {
            chartInstances[id].destroy();
            delete chartInstances[id];
        }

        const box = canvas.parentElement;
        let note = box ? box.querySelector('.chart-empty') : null;

        if (isEmpty) {
            canvas.style.visibility = 'hidden';

            if (box && !note) {
                note = document.createElement('div');
                note.className = 'chart-empty';
                box.appendChild(note);
            }

            if (note) {
                note.textContent = emptyText;
                note.hidden = false;
            }

            return;
        }

        canvas.style.visibility = '';

        if (note) {
            note.hidden = true;
        }

        chartInstances[id] = new Chart(canvas, config);
    }

    /* ------------------------------------------------------------------
       Section renderers
       ------------------------------------------------------------------ */

    function setSpendingNote(total, prevTotal, isCurrent, prevStart) {
        const element = document.getElementById('total-spending-note');

        if (!element) return;

        element.textContent = '';

        const prevLabel = shortMonth(prevStart);
        const suffix = isCurrent ? ' (same days)' : '';

        if (prevTotal > 0) {
            const percent = ((total - prevTotal) / prevTotal) * 100;

            if (Math.abs(percent) < 0.05) {
                element.textContent = `Same as ${prevLabel}${suffix}`;
                return;
            }

            const badge = document.createElement('span');
            badge.className = percent > 0 ? 'delta-up' : 'delta-down';
            badge.textContent = `${percent > 0 ? '▲' : '▼'} ${Math.abs(percent).toFixed(1)}%`;

            element.appendChild(badge);
            element.appendChild(
                document.createTextNode(` vs ${prevLabel}${suffix}`)
            );
        } else if (total > 0) {
            element.textContent = `No spending in ${prevLabel} to compare`;
        } else {
            element.textContent = isCurrent ? 'Current month' : 'Selected month';
        }
    }

    function renderBreakdown(categories, total) {
        const tbody = document.getElementById('category-breakdown');

        if (!tbody) return;

        if (categories.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center">
                        No expenses recorded in ${escapeHTML(longMonth(selectedMonth))}.
                    </td>
                </tr>
            `;
            return;
        }

        tbody.innerHTML = categories.map(([category, amount], index) => {
            const percent = total > 0 ? (amount / total) * 100 : 0;
            const color = palette[index % palette.length];

            return `
                <tr>
                    <td>
                        <span class="category-dot" style="background:${color}"></span>
                        <span class="font-medium text-slate-700">
                            ${escapeHTML(category)}
                        </span>
                    </td>
                    <td class="font-semibold text-slate-800 whitespace-nowrap">
                        ${money(amount)}
                    </td>
                    <td class="whitespace-nowrap">
                        ${percent.toFixed(1)}%
                    </td>
                    <td>
                        <div
                            class="analytics-progress"
                            role="progressbar"
                            aria-label="${escapeHTML(category)} share"
                            aria-valuemin="0"
                            aria-valuemax="100"
                            aria-valuenow="${percent.toFixed(1)}"
                        >
                            <div
                                class="analytics-progress-fill"
                                style="width:${Math.min(percent, 100)}%;background:linear-gradient(90deg, ${color}aa, ${color})"
                            ></div>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function drawTrend(monthExpenses, isCurrent, now, theme) {
        let days = isCurrent ? now.getDate() : daysInMonth(selectedMonth);

        // Make sure expenses dated later this month are not dropped from the chart
        monthExpenses.forEach(expense => {
            days = Math.max(days, expense.parsedDate.getDate());
        });

        const values = new Array(days).fill(0);

        monthExpenses.forEach(expense => {
            values[expense.parsedDate.getDate() - 1] += expense.amountNumber;
        });

        const labels = values.map((_, index) => String(index + 1));
        const monthName = selectedMonth.toLocaleDateString('en-IN', { month: 'short' });
        const year = selectedMonth.getFullYear();
        const month = selectedMonth.getMonth();

        // Peak day + daily average (shown as pills in the card header)
        let peak = 0;
        let peakIndex = -1;

        values.forEach((value, index) => {
            if (value > peak) {
                peak = value;
                peakIndex = index;
            }
        });

        const monthTotal = values.reduce((sum, value) => sum + value, 0);

        setText(
            'trend-peak',
            peak > 0 ? `Peak · ${monthName} ${peakIndex + 1} · ${money(peak)}` : 'Peak · —'
        );
        setText(
            'trend-avg',
            `Avg / day · ${money(days ? monthTotal / days : 0)}`
        );

        drawChart('trendChart', {
            type: 'line',
            data: {
                labels,
                datasets: [{
                    label: 'Daily Spending',
                    data: values,
                    borderColor: context => {
                        const area = context.chart.chartArea;

                        if (!area) return theme.line;

                        const gradient = context.chart.ctx.createLinearGradient(
                            area.left, 0, area.right, 0
                        );
                        gradient.addColorStop(0, theme.line);
                        gradient.addColorStop(1, theme.line2);

                        return gradient;
                    },
                    backgroundColor: context =>
                        verticalGradient(context.chart, theme.areaTop, theme.areaBottom),
                    borderWidth: 3,
                    borderCapStyle: 'round',
                    borderJoinStyle: 'round',
                    pointBackgroundColor: context =>
                        context.dataIndex === peakIndex ? theme.line : theme.pointFill,
                    pointBorderColor: theme.line,
                    pointBorderWidth: 2,
                    // Only days that actually have spending get a dot
                    pointRadius: context => {
                        if (!context.raw) return 0;
                        return context.dataIndex === peakIndex ? 6 : 4;
                    },
                    pointHoverRadius: 7,
                    pointHitRadius: 14,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 8, right: 8 } },
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: { display: false },
                    lineGlow: { color: theme.glow },
                    crosshair: { color: theme.cross },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            title: items => {
                                const day = Number(items[0].label);
                                return new Date(year, month, day).toLocaleDateString('en-IN', {
                                    weekday: 'short',
                                    day: 'numeric',
                                    month: 'short'
                                });
                            },
                            label: context => money(context.parsed.y)
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: theme.grid, drawTicks: false },
                        ticks: { padding: 10, callback: value => compactMoney(value) },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { padding: 6 },
                        border: { display: false },
                        title: { display: true, text: 'Day of month' }
                    }
                }
            },
            plugins: [lineGlowPlugin, crosshairPlugin]
        }, monthExpenses.length === 0, `No expenses recorded in ${longMonth(selectedMonth)}.`);
    }

    function drawMonthly(theme) {
        const monthStarts = [];
        const totals = {};

        for (let offset = 5; offset >= 0; offset--) {
            const date = new Date(
                selectedMonth.getFullYear(),
                selectedMonth.getMonth() - offset,
                1
            );

            monthStarts.push(date);
            totals[monthKey(date)] = 0;
        }

        allExpenses.forEach(expense => {
            const key = monthKey(expense.parsedDate);

            if (Object.prototype.hasOwnProperty.call(totals, key)) {
                totals[key] += expense.amountNumber;
            }
        });

        const values = monthStarts.map(date => totals[monthKey(date)]);
        const lastIndex = monthStarts.length - 1;

        setText(
            'monthly-subtitle',
            `Six months ending ${shortMonth(selectedMonth)} · click a bar to open that month`
        );

        drawChart('monthlyChart', {
            type: 'bar',
            data: {
                labels: monthStarts.map(shortMonth),
                datasets: [{
                    label: 'Expenses',
                    data: values,
                    backgroundColor: context => context.dataIndex === lastIndex
                        ? verticalGradient(context.chart, theme.barActiveTop, theme.barActiveBottom)
                        : verticalGradient(context.chart, theme.barTop, theme.barBottom),
                    hoverBackgroundColor: context =>
                        verticalGradient(context.chart, theme.barActiveTop, theme.barActiveBottom),
                    borderRadius: { topLeft: 10, topRight: 10, bottomLeft: 3, bottomRight: 3 },
                    borderSkipped: false,
                    maxBarThickness: 54
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                layout: { padding: { top: 8 } },
                // Bars rise one after another
                animation: {
                    delay: context =>
                        context.type === 'data' && context.mode === 'default'
                            ? context.dataIndex * 90
                            : 0
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        displayColors: false,
                        callbacks: {
                            title: items => longMonth(monthStarts[items[0].dataIndex]),
                            label: context => money(context.parsed.y)
                        }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: theme.grid, drawTicks: false },
                        ticks: { padding: 10, callback: value => compactMoney(value) },
                        border: { display: false }
                    },
                    x: {
                        grid: { display: false },
                        border: { display: false }
                    }
                },
                onClick: (event, elements) => {
                    if (!elements.length) return;

                    const target = monthStarts[elements[0].index];

                    if (!target || monthKey(target) === monthKey(selectedMonth)) return;

                    // Re-render after Chart.js has finished handling this click
                    setTimeout(() => {
                        selectedMonth = target;
                        render();
                    }, 0);
                },
                onHover: (event, elements) => {
                    const target = event && event.native && event.native.target;

                    if (target) {
                        target.style.cursor = elements.length ? 'pointer' : 'default';
                    }
                }
            }
        }, values.every(value => value === 0), 'No expenses recorded in the last six months.');
    }

    function drawCategory(categories, total, theme) {
        drawChart('categoryChart', {
            type: 'doughnut',
            data: {
                labels: categories.map(([category]) => category),
                datasets: [{
                    data: categories.map(([, amount]) => amount),
                    backgroundColor: categories.map(
                        (_, index) => palette[index % palette.length]
                    ),
                    borderWidth: 0,
                    spacing: categories.length > 1 ? 3 : 0,
                    borderRadius: 8,
                    hoverOffset: 10
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                cutout: '74%',
                layout: { padding: 8 },
                animation: { animateRotate: true, animateScale: true, duration: 1200 },
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { usePointStyle: true, padding: 18 }
                    },
                    centerText: {
                        label: 'Total spent',
                        value: money(total),
                        color: theme.centerTitle,
                        sub: theme.text
                    },
                    tooltip: {
                        callbacks: {
                            label: context => {
                                const percent = total > 0
                                    ? (context.parsed / total) * 100
                                    : 0;

                                return ` ${context.label}: ${money(context.parsed)} (${percent.toFixed(1)}%)`;
                            }
                        }
                    }
                }
            },
            plugins: [centerTextPlugin]
        }, categories.length === 0, `No expenses recorded in ${longMonth(selectedMonth)}.`);
    }

    /* ------------------------------------------------------------------
       Main render
       ------------------------------------------------------------------ */

    function render() {
        const now = new Date();
        const isCurrent = monthKey(selectedMonth) === monthKey(now);
        const theme = chartTheme();

        applyChartDefaults(theme);

        const selectedKey = monthKey(selectedMonth);
        const monthExpenses = allExpenses.filter(
            expense => monthKey(expense.parsedDate) === selectedKey
        );

        const total = monthExpenses.reduce(
            (sum, expense) => sum + expense.amountNumber, 0
        );

        const elapsedDays = isCurrent ? now.getDate() : daysInMonth(selectedMonth);

        const categoryTotals = {};

        monthExpenses.forEach(expense => {
            categoryTotals[expense.categoryName] =
                (categoryTotals[expense.categoryName] || 0) + expense.amountNumber;
        });

        const categories = Object.entries(categoryTotals).sort((a, b) => b[1] - a[1]);
        const topCategory = categories[0];

        // Previous month, compared over the same days when viewing the current month
        const prevStart = new Date(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth() - 1,
            1
        );
        const prevKey = monthKey(prevStart);
        const prevCutoff = isCurrent ? now.getDate() : 31;
        const prevTotal = allExpenses
            .filter(expense =>
                monthKey(expense.parsedDate) === prevKey &&
                expense.parsedDate.getDate() <= prevCutoff
            )
            .reduce((sum, expense) => sum + expense.amountNumber, 0);

        // Month navigator
        const label = longMonth(selectedMonth);
        const previousButton = document.getElementById('month-prev');
        const nextButton = document.getElementById('month-next');
        const todayButton = document.getElementById('month-today');

        setText('analytics-period-label', label);

        if (previousButton) {
            previousButton.disabled = selectedKey <= monthKey(earliestMonth);
        }

        if (nextButton) {
            nextButton.disabled = isCurrent;
        }

        if (todayButton) {
            todayButton.hidden = isCurrent;
        }

        // Summary cards
        setText('total-spending', money(total));
        setSpendingNote(total, prevTotal, isCurrent, prevStart);

        setText('average-daily', money(elapsedDays ? total / elapsedDays : 0));
        setText(
            'average-daily-note',
            isCurrent
                ? `Average over ${elapsedDays} day${elapsedDays === 1 ? '' : 's'} so far`
                : `Average over ${elapsedDays} days`
        );

        setText('top-category', topCategory ? topCategory[0] : '—');
        setText(
            'top-category-note',
            topCategory
                ? `${money(topCategory[1])} · ${(total > 0 ? (topCategory[1] / total) * 100 : 0).toFixed(1)}% of spending`
                : 'No spending recorded yet'
        );

        setText('total-transactions', String(monthExpenses.length));
        setText(
            'total-transactions-note',
            `Expense records in ${isCurrent ? 'this month' : shortMonth(selectedMonth)}`
        );

        // Section subtitles
        setText('trend-subtitle', `Daily expenses in ${label}`);
        setText('category-subtitle', `Distribution of ${label} spending`);
        setText(
            'breakdown-subtitle',
            `Category totals and their share of ${label} spending.`
        );

        // Charts and table
        drawTrend(monthExpenses, isCurrent, now, theme);
        drawMonthly(theme);
        drawCategory(categories, total, theme);
        renderBreakdown(categories, total);

        if (message) {
            message.textContent = monthExpenses.length === 0
                ? (isCurrent
                    ? 'No expenses recorded this month yet. Add an expense to see your analytics.'
                    : `No expenses recorded in ${label}.`)
                : `Showing ${monthExpenses.length} expense transaction(s) for ${label}.`;
        }
    }

    /* ------------------------------------------------------------------
       Data loading and events
       ------------------------------------------------------------------ */

    function goToMonth(offset) {
        selectedMonth = new Date(
            selectedMonth.getFullYear(),
            selectedMonth.getMonth() + offset,
            1
        );
        render();
    }

    function bindControls() {
        const previousButton = document.getElementById('month-prev');
        const nextButton = document.getElementById('month-next');
        const todayButton = document.getElementById('month-today');

        if (previousButton) {
            previousButton.addEventListener('click', () => goToMonth(-1));
        }

        if (nextButton) {
            nextButton.addEventListener('click', () => goToMonth(1));
        }

        if (todayButton) {
            todayButton.addEventListener('click', () => {
                selectedMonth = startOfMonth(new Date());
                render();
            });
        }

        // Redraw the charts when the dark-mode toggle changes the body class
        new MutationObserver(() => {
            if (!dataLoaded) return;

            try {
                render();
            } catch (error) {
                console.error('Analytics redraw error:', error);
            }
        }).observe(document.body, { attributes: true, attributeFilter: ['class'] });
    }

    async function loadAnalytics() {
        try {
            if (message) {
                message.textContent = 'Loading your analytics…';
            }

            const response = await fetch('/api/', {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                credentials: 'same-origin'
            });

            if (!response.ok) {
                throw new Error(
                    response.status === 401
                        ? 'Your session may have expired. Please log in again.'
                        : `Unable to load expenses (HTTP ${response.status}).`
                );
            }

            const expenses = await response.json();

            if (!Array.isArray(expenses)) {
                throw new Error(
                    'Unexpected response from the expenses API. Expected an array.'
                );
            }

            allExpenses = normalizeExpenses(expenses);

            // Earliest month that has data (never later than the current month)
            earliestMonth = allExpenses.reduce(
                (earliest, expense) => {
                    const month = startOfMonth(expense.parsedDate);
                    return month < earliest ? month : earliest;
                },
                startOfMonth(new Date())
            );

            selectedMonth = startOfMonth(new Date());
            dataLoaded = true;
            render();

        } catch (error) {
            console.error('Analytics error:', error);

            if (message) {
                message.textContent = error.message ||
                    'Could not load analytics. Please refresh the page.';
            }

            const tbody = document.getElementById('category-breakdown');

            if (tbody) {
                tbody.innerHTML = `
                    <tr>
                        <td colspan="4" class="text-center">
                            Unable to load category details.
                        </td>
                    </tr>
                `;
            }
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        bindControls();
        loadAnalytics();
    });
})();