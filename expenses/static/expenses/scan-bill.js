/* SpendWise - Scan a bill (Dashboard > Quick Transfer)
   Take a photo or upload one, read it in the browser with Tesseract.js, and
   pre-fill the Quick Transfer form. Nothing is uploaded to your server and
   nothing is saved until you press "Add Expense". */
(function () {
    "use strict";

    var TESSERACT_SRC = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";
    var MAX_SIDE = 1800;

    if (window.console) console.info("SpendWise scan-bill v5");
    var trigger = document.getElementById("scan-bill-button");
    if (!trigger) return;

    var fields = {
        title: document.getElementById("expense-title"),
        amount: document.getElementById("expense-amount"),
        category: document.getElementById("expense-category"),
        date: document.getElementById("expense-date"),
        message: document.getElementById("form-message")
    };

    var modal, video, preview, placeholder, statusEl;
    var btnCamera, btnUpload, btnCapture, btnRetake, btnClose;
    var fileInput, captureInput;
    var stream = null;
    var mode = "idle";
    var previewUrl = "";
    var lastFocus = null;
    var tesseractPromise = null;

    /* ------------------------------------------------------------------
       Modal
       ------------------------------------------------------------------ */

    function build() {
        modal = document.createElement("div");
        modal.className = "scan-modal";
        modal.hidden = true;
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "scan-title");
        modal.innerHTML =
            '<div class="scan-backdrop" data-scan-close></div>' +
            '<div class="scan-panel">' +
            '  <div class="scan-head">' +
            '    <div><h3 id="scan-title">Scan a bill</h3>' +
            '    <p>Take a photo or upload one. We\'ll fill in the details for you to check.</p></div>' +
            '    <button type="button" class="scan-close" data-scan-close aria-label="Close"><i class="ph ph-x"></i></button>' +
            '  </div>' +
            '  <div class="scan-stage">' +
            '    <video class="scan-video" playsinline muted hidden></video>' +
            '    <img class="scan-preview" alt="Bill preview" hidden>' +
            '    <div class="scan-placeholder"><i class="ph ph-receipt"></i><span>Your bill will appear here</span></div>' +
            '    <div class="scan-sweep" hidden></div>' +
            '  </div>' +
            '  <p class="scan-status" role="status" aria-live="polite"></p>' +
            '  <div class="scan-actions">' +
            '    <button type="button" class="scan-btn scan-btn--primary" id="scan-camera"><i class="ph ph-camera"></i>Use camera</button>' +
            '    <button type="button" class="scan-btn" id="scan-upload"><i class="ph ph-upload-simple"></i>Upload photo</button>' +
            '    <button type="button" class="scan-btn scan-btn--primary" id="scan-capture" hidden><i class="ph ph-aperture"></i>Capture</button>' +
            '    <button type="button" class="scan-btn" id="scan-retake" hidden><i class="ph ph-arrow-counter-clockwise"></i>Try again</button>' +
            '  </div>' +
            '  <details class="scan-debug"><summary>Show what was read</summary><pre></pre></details>' +
            '  <p class="scan-note"><i class="ph ph-lock-simple"></i>The photo is read in your browser and is not uploaded.</p>' +
            '</div>';
        document.body.appendChild(modal);

        fileInput = document.createElement("input");
        fileInput.type = "file";
        fileInput.accept = "image/*";
        fileInput.hidden = true;

        captureInput = document.createElement("input");
        captureInput.type = "file";
        captureInput.accept = "image/*";
        captureInput.setAttribute("capture", "environment");
        captureInput.hidden = true;

        document.body.appendChild(fileInput);
        document.body.appendChild(captureInput);

        video = modal.querySelector(".scan-video");
        preview = modal.querySelector(".scan-preview");
        placeholder = modal.querySelector(".scan-placeholder");
        statusEl = modal.querySelector(".scan-status");
        btnCamera = modal.querySelector("#scan-camera");
        btnUpload = modal.querySelector("#scan-upload");
        btnCapture = modal.querySelector("#scan-capture");
        btnRetake = modal.querySelector("#scan-retake");
        btnClose = modal.querySelector(".scan-close");

        modal.addEventListener("click", function (e) {
            if (e.target.closest("[data-scan-close]")) closeModal();
        });
        document.addEventListener("keydown", function (e) {
            if (e.key === "Escape" && !modal.hidden) closeModal();
        });

        btnCamera.addEventListener("click", startCamera);
        btnUpload.addEventListener("click", function () { fileInput.click(); });
        btnCapture.addEventListener("click", captureFrame);
        btnRetake.addEventListener("click", reset);

        [fileInput, captureInput].forEach(function (input) {
            input.addEventListener("change", function () {
                var file = input.files && input.files[0];
                input.value = "";
                if (file) handleImage(file);
            });
        });
    }

    function setStatus(text, tone) {
        statusEl.textContent = text || "";
        statusEl.setAttribute("data-tone", tone || "");
    }

    function setMode(next) {
        mode = next;
        var sweep = modal.querySelector(".scan-sweep");

        video.hidden = next !== "camera";
        preview.hidden = !(next === "busy" || next === "result");
        placeholder.hidden = next !== "idle";
        sweep.hidden = next !== "busy";

        btnCamera.hidden = next !== "idle";
        btnUpload.hidden = next !== "idle";
        btnCapture.hidden = next !== "camera";
        btnRetake.hidden = !(next === "result" || next === "camera");
        btnRetake.lastChild.textContent = next === "camera" ? "Cancel" : "Try again";
        modal.classList.toggle("is-busy", next === "busy");
    }

    function showRaw(text) {
        var pre = modal.querySelector(".scan-debug pre");
        if (pre) pre.textContent = text;
        if (window.console) console.info("SpendWise scan-bill text:\n" + text);
    }

    function openModal() {
        if (!modal) build();
        lastFocus = document.activeElement;
        reset();
        modal.hidden = false;
        document.body.classList.add("scan-open");
        btnCamera.focus();
    }

    function closeModal() {
        stopCamera();
        releasePreview();
        modal.hidden = true;
        document.body.classList.remove("scan-open");
        if (lastFocus && lastFocus.focus) lastFocus.focus();
    }

    function reset() {
        stopCamera();
        releasePreview();
        setMode("idle");
        setStatus("");
    }

    function releasePreview() {
        if (previewUrl) {
            URL.revokeObjectURL(previewUrl);
            previewUrl = "";
        }
        if (preview) preview.removeAttribute("src");
    }

    /* ------------------------------------------------------------------
       Camera
       ------------------------------------------------------------------ */

    function stopCamera() {
        if (stream) {
            stream.getTracks().forEach(function (t) { t.stop(); });
            stream = null;
        }
        if (video) video.srcObject = null;
    }

    async function startCamera() {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            // Plain http on a phone, or an old browser: let the device camera app handle it.
            setStatus("Opening your device camera…");
            captureInput.click();
            return;
        }

        setStatus("Starting camera…");

        try {
            stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: { ideal: "environment" } },
                audio: false
            });
            video.srcObject = stream;
            await video.play();
            setMode("camera");
            setStatus("Fit the whole bill in the frame, then press Capture.");
            btnCapture.focus();
        } catch (error) {
            stopCamera();
            setMode("idle");
            setStatus(
                error && error.name === "NotAllowedError"
                    ? "Camera permission was blocked. Allow it in the browser, or upload a photo instead."
                    : "Couldn't open the camera. You can upload a photo instead.",
                "warn"
            );
        }
    }

    function captureFrame() {
        if (!video.videoWidth) return;

        var canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0);
        stopCamera();

        canvas.toBlob(function (blob) {
            if (blob) handleImage(blob);
            else { setMode("idle"); setStatus("Couldn't capture the photo. Please try again.", "warn"); }
        }, "image/jpeg", 0.92);
    }

    /* ------------------------------------------------------------------
       Reading the bill
       ------------------------------------------------------------------ */

    function loadTesseract() {
        if (window.Tesseract) return Promise.resolve(window.Tesseract);
        if (tesseractPromise) return tesseractPromise;

        tesseractPromise = new Promise(function (resolve, reject) {
            var s = document.createElement("script");
            s.src = TESSERACT_SRC;
            s.async = true;
            s.onload = function () { resolve(window.Tesseract); };
            s.onerror = function () {
                tesseractPromise = null;
                reject(new Error("The text reader could not be loaded. Check your internet connection."));
            };
            document.head.appendChild(s);
        });

        return tesseractPromise;
    }

    async function toCanvas(blob, enhance) {
        var source;

        if (window.createImageBitmap) {
            source = await createImageBitmap(blob);
        } else {
            source = await new Promise(function (resolve, reject) {
                var img = new Image();
                img.onload = function () { resolve(img); };
                img.onerror = reject;
                img.src = URL.createObjectURL(blob);
            });
        }

        var w = source.width, h = source.height;
        var longest = Math.max(w, h);
        // shrink huge photos, enlarge small ones (text must be big enough to read)
        var scale = longest > MAX_SIDE ? MAX_SIDE / longest : Math.min(3, 1600 / longest);
        var canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);

        var ctx = canvas.getContext("2d");
        if (enhance) ctx.filter = "grayscale(1) contrast(1.4) brightness(1.05)";   // ignored where unsupported
        else { ctx.fillStyle = "#fff"; ctx.fillRect(0, 0, canvas.width, canvas.height); }
        ctx.drawImage(source, 0, 0, canvas.width, canvas.height);

        if (source.close) source.close();
        return canvas;
    }

    async function handleImage(blob) {
        stopCamera();
        releasePreview();

        previewUrl = URL.createObjectURL(blob);
        preview.src = previewUrl;
        setMode("busy");
        setStatus("Preparing the photo…");

        try {
            setStatus("Loading the text reader…");
            var Tesseract = await loadTesseract();
            var worker = await Tesseract.createWorker("eng", 1, {
                logger: function (m) {
                    if (m.status === "recognizing text") {
                        setStatus("Reading the bill… " + Math.round(m.progress * 100) + "%");
                    }
                }
            });

            var parsed = null;
            try {
                // Try a few ways of reading; stop at the first that finds a total.
                var passes = [
                    { enhance: false, psm: "3" },
                    { enhance: true, psm: "6" },
                    { enhance: false, psm: "11" }
                ];
                for (var i = 0; i < passes.length; i++) {
                    setStatus(i ? "Trying again to read the bill…" : "Reading the bill…");
                    var canvas = await toCanvas(blob, passes[i].enhance);
                    await worker.setParameters({ tessedit_pageseg_mode: passes[i].psm });
                    var result = await worker.recognize(canvas);
                    var p = parseBill(result.data.text || "");
                    p.raw = result.data.text || "";
                    showRaw("Pass " + (i + 1) + ":\n" + p.raw);
                    if (p.sure) { parsed = p; break; }          // found a real "Total" line
                    if (p.amount != null && (!parsed || parsed.amount == null || (!parsed.sure && p.amount > parsed.amount))) parsed = p;
                }
            } finally {
                worker.terminate();
            }

            setMode("result");

            if (parsed.amount == null) {
                setStatus("Couldn't find a total on this bill. Try a clearer, well-lit photo, or enter it manually.", "warn");
                return;
            }

            fillForm(parsed);
            setStatus("Done. Details filled in. Please check them before adding.", "ok");
            if (parsed.sure) setTimeout(function () { if (!modal.hidden && mode === "result") closeModal(); }, 900);
            else setStatus("Filled in, but please double-check the amount.", "warn");
        } catch (error) {
            setMode("result");
            setStatus((error && error.message) || "Something went wrong while reading the bill.", "warn");
        }
    }

    /* ------------------------------------------------------------------
       Parsing the text
       ------------------------------------------------------------------ */

    var NUM = /(\d{1,3}(?:,\d{2,3})+|\d+)(?:\.(\d{1,2}))?/g;

    function numbersIn(line) {
        var out = [], m;
        NUM.lastIndex = 0;
        while ((m = NUM.exec(line))) {
            var v = parseFloat(m[1].replace(/,/g, "") + (m[2] ? "." + m[2] : ""));
            if (isFinite(v) && v > 0 && v < 1e7) out.push({ v: v, dec: !!m[2] });
        }
        return out;
    }

    /* Cross-check: subtotal + taxes (+/- round-off) must equal the total.
       This catches misreads such as the rupee sign being read as a "2". */
    function reconcile(lines) {
        var taxTotal = 0, taxCount = 0;

        lines.forEach(function (line, i) {
            if (!/\b(cgst|sgst|igst|gst|vat|service\s*charge|tax)\b/i.test(line) || /gstin|total|invoice/i.test(line)) return;
            var nums = numbersIn(line.replace(/\d+(?:\.\d+)?\s*%/g, " ")).filter(function (n) { return n.dec; });
            if (!nums.length && lines[i + 1] && !/[A-Za-z]{3,}/.test(lines[i + 1])) {
                nums = numbersIn(lines[i + 1].replace(/\d+(?:\.\d+)?\s*%/g, " ")).filter(function (n) { return n.dec; });
            }
            if (!nums.length) return;
            var v = nums[nums.length - 1].v;
            if (v > 0 && v < 100000) { taxTotal += v; taxCount++; }
        });
        if (!taxCount) return null;

        var pool = [];
        lines.forEach(function (line) {
            numbersIn(line).forEach(function (n) {
                if (!n.dec) return;
                pool.push(n.v);
                if (n.v >= 1000) pool.push(parseFloat(String(n.v).replace(/^\d/, "")));  // stray symbol read as a digit
            });
        });

        var best = null;
        pool.forEach(function (t) {
            pool.forEach(function (sub) {
                if (sub >= t || sub <= 0) return;
                var rate = taxTotal / sub;
                if (rate >= 0.01 && rate <= 0.4 && Math.abs(t - sub - taxTotal) < 1.01 && (best === null || t > best)) best = t;
            });
        });
        return best;
    }

    /* A total far bigger than every other amount on the bill usually has a
       stray leading digit (the rupee sign read as "2", "7", "3"...). */
    function sanityFix(value, lines) {
        if (value < 1000) return value;
        var other = 0;
        lines.forEach(function (line) {
            numbersIn(line).forEach(function (n) {
                if (n.dec && n.v < value && n.v > other) other = n.v;
            });
        });
        var stripped = parseFloat(String(value).replace(/^\d/, ""));
        if (other > 0 && value > other * 1.6 && stripped >= other * 0.9 && stripped <= other * 1.6) return stripped;
        return value;
    }

    function findAmount(lines) {
        var rec = reconcile(lines);
        if (rec !== null) { findAmount.sure = true; return rec; }

        var rules = [
            [/grand\s*total/i, 4],
            [/(total\s*(amount|payable|due)|amount\s*(due|payable|paid)|net\s*(amount|payable|total)|bill\s*total|total\s*bill)/i, 3],
            [/\b(rs|inr)\b\.?\s*\d|\u20b9\s*\d/i, 3],
            [/\bt[o0]ta[l1i]\b/i, 2]
        ];
        var skip = /sub\s*-?\s*total|total\s*(tax|gst|discount|savings|qty|quantity|items?)|\b(cgst|sgst|igst|gst|tax|discount|round)/i;
        var best = null;

        lines.forEach(function (line, i) {
            if (skip.test(line)) return;

            var score = 0;
            rules.forEach(function (r) { if (r[0].test(line)) score = Math.max(score, r[1]); });
            if (!score) return;

            var nums = numbersIn(line);
            if (!nums.length && lines[i + 1]) nums = numbersIn(lines[i + 1]);
            if (!nums.length && lines[i + 2]) nums = numbersIn(lines[i + 2]);
            if (!nums.length) return;

            var value = nums[nums.length - 1].v;
            if (!best || score > best.score || (score === best.score && value > best.value)) {
                best = { score: score, value: value };
            }
        });

        if (best) {
            findAmount.sure = true;
            return sanityFix(best.value, lines);
        }
        findAmount.sure = false;

        // Fallback: the biggest amount that has decimals (so phone numbers and years are ignored)
        var max = null;
        lines.forEach(function (line) {
            numbersIn(line).forEach(function (n) {
                if (n.dec && (max === null || n.v > max)) max = n.v;
            });
        });
        if (max !== null) return max;

        // Last resort: the largest whole number that is not a year or a long id
        lines.forEach(function (line) {
            numbersIn(line).forEach(function (n) {
                var year = n.v >= 1990 && n.v <= 2100;
                if (!year && n.v < 1000000 && (max === null || n.v > max)) max = n.v;
            });
        });
        return max;
    }

    var MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

    function validDate(y, m, d) {
        if (y < 100) y += 2000;
        var date = new Date(y, m - 1, d);
        if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
        var limit = new Date();
        limit.setDate(limit.getDate() + 1);
        if (date > limit || y < 2000) return null;
        return y + "-" + String(m).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    }

    function findDate(text) {
        var m, iso;

        m = text.match(/(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})/);
        if (m && (iso = validDate(+m[1], +m[2], +m[3]))) return iso;

        m = text.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})/);
        if (m) {
            iso = validDate(+m[3], +m[2], +m[1]);            // day first (India)
            if (!iso) iso = validDate(+m[3], +m[1], +m[2]);  // month first
            if (iso) return iso;
        }

        m = text.match(/(\d{1,2})\s*(?:st|nd|rd|th)?[\s\-,]*(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-,.]*(\d{2,4})/i);
        if (m && (iso = validDate(+m[3], MONTHS[m[2].toLowerCase()], +m[1]))) return iso;

        return "";
    }

    function findTitle(lines) {
        var junk = /^name\b|invoice|bill|receipt|tax|gstin|gst|fssai|token|cashier|name\s*:|dine|table|waiter|\b(?:tel|phone|mob)\b|date|cash memo|www\.|@|road|street|main\s|^\W*\d/i;

        for (var i = 0; i < Math.min(lines.length, 8); i++) {
            var line = lines[i].replace(/[^A-Za-z0-9&'.\- ]/g, " ").replace(/\s+/g, " ").trim();
            if ((line.match(/[A-Za-z]/g) || []).length >= 4 && /[A-Za-z]{4}/.test(line) && !junk.test(line)) {
                return line.slice(0, 60);
            }
        }
        return "Scanned bill";
    }

    var CATEGORIES = [
        ["Food & Dining", /restaurant|cafe|café|hotel|kitchen|bakery|pizza|burger|biryani|dhaba|food|dine|swiggy|zomato|sweets|coffee|tea\b|juice|mess\b/i],
        ["Health", /pharma|medical|medicine|chemist|hospital|clinic|diagnostic|lab\b|dental|apollo|health/i],
        ["Transportation", /petrol|diesel|fuel|bunk|uber|ola\b|rapido|taxi|cab\b|metro|parking|toll|auto\b/i],
        ["Bills & Utilities", /electricity|water bill|broadband|recharge|postpaid|prepaid|gas\b|dth|insurance|utility/i],
        ["Entertainment", /cinema|movie|pvr|inox|theatre|theater|game|netflix|concert|ticket/i],
        ["Education", /school|college|tuition|books?\b|stationer|course|exam|library/i],
        ["Travel", /airlines?|flight|irctc|railway|train|bus\b|redbus|resort|lodge|booking/i],
        ["Shopping", /mart|store|supermarket|mall|fashion|garments?|textile|electronics|mobile|retail|bazaar|bazar|shop|dmart|reliance|big bazaar|amazon|flipkart/i]
    ];

    function guessCategory(text) {
        for (var i = 0; i < CATEGORIES.length; i++) {
            if (CATEGORIES[i][1].test(text)) return CATEGORIES[i][0];
        }
        return "Other";
    }

    function parseBill(text) {
        text = text.replace(/(\d)\s+\.\s*(\d{2})\b/g, "$1.$2");   // "404 .00" -> "404.00"
        var lines = text.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);

        return {
            title: findTitle(lines),
            amount: findAmount(lines),
            sure: findAmount.sure,
            date: findDate(text),
            category: guessCategory(text)
        };
    }

    /* ------------------------------------------------------------------
       Fill the Quick Transfer form
       ------------------------------------------------------------------ */

    function setField(el, value) {
        if (!el || value === "" || value == null) return;
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.classList.remove("scan-filled");
        void el.offsetWidth;
        el.classList.add("scan-filled");
        setTimeout(function () { el.classList.remove("scan-filled"); }, 2200);
    }

    function fillForm(p) {
        setField(fields.title, p.title);
        setField(fields.amount, p.amount.toFixed(2));
        setField(fields.category, p.category);
        setField(fields.date, p.date);

        if (fields.message) {
            fields.message.textContent = "Bill scanned. Please check the details, then press Add Expense.";
        }
    }

    trigger.addEventListener("click", openModal);
})();