
document.addEventListener("DOMContentLoaded", function () {
    const sidebar = document.getElementById("sidebar");
    const toggle = document.getElementById("sidebar-toggle");
    const closeButton = document.getElementById("sidebar-close");
    const overlay = document.getElementById("sidebar-overlay");

    if (!sidebar || !toggle || !overlay) {
        console.error("Sidebar elements are missing.");
        return;
    }

    const mobile = () => window.innerWidth < 768;

    function openSidebar() {
        if (mobile()) {
            sidebar.classList.remove("-translate-x-full");
            overlay.classList.remove("hidden");
        } else {
            document.body.classList.remove("sidebar-collapsed");
        }

        toggle.setAttribute("aria-expanded", "true");
    }

    function closeSidebar() {
        if (mobile()) {
            sidebar.classList.add("-translate-x-full");
            overlay.classList.add("hidden");
        } else {
            document.body.classList.add("sidebar-collapsed");
        }

        toggle.setAttribute("aria-expanded", "false");
    }

    function toggleSidebar() {
        if (mobile()) {
            const isOpen = !sidebar.classList.contains("-translate-x-full");
            isOpen ? closeSidebar() : openSidebar();
        } else {
            document.body.classList.toggle("sidebar-collapsed");
            const isOpen = !document.body.classList.contains("sidebar-collapsed");
            toggle.setAttribute("aria-expanded", String(isOpen));
        }
    }

    toggle.addEventListener("click", toggleSidebar);

    closeButton?.addEventListener("click", closeSidebar);
    overlay.addEventListener("click", closeSidebar);

    sidebar.querySelectorAll("a").forEach(link => {
        link.addEventListener("click", () => {
            if (mobile()) closeSidebar();
        });
    });

    document.addEventListener("keydown", event => {
        if (event.key === "Escape" && mobile()) {
            closeSidebar();
        }
    });

    window.addEventListener("resize", () => {
        if (!mobile()) {
            sidebar.classList.remove("-translate-x-full");
            overlay.classList.add("hidden");
        } else {
            document.body.classList.remove("sidebar-collapsed");
            sidebar.classList.add("-translate-x-full");
            overlay.classList.add("hidden");
        }
    });
});
