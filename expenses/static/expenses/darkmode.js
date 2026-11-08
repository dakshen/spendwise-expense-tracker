document.addEventListener("DOMContentLoaded", function () {
    const toggleButton = document.getElementById("theme-toggle");
    const themeIcon = document.getElementById("theme-icon");

    if (!toggleButton || !themeIcon) return;

    // Apply the saved theme
    const savedTheme = localStorage.getItem("spendwise-theme");

    if (savedTheme === "dark") {
        document.body.classList.add("dark-mode");
    }

    function updateThemeButton() {
        const isDark = document.body.classList.contains("dark-mode");

        themeIcon.className = isDark
            ? "ph ph-sun"
            : "ph ph-moon";

        toggleButton.setAttribute(
            "aria-label",
            isDark ? "Switch to light mode" : "Switch to dark mode"
        );

        toggleButton.title = isDark
            ? "Switch to light mode"
            : "Switch to dark mode";
    }

    updateThemeButton();

    toggleButton.addEventListener("click", function () {
        document.body.classList.toggle("dark-mode");

        const isDark = document.body.classList.contains("dark-mode");

        localStorage.setItem(
            "spendwise-theme",
            isDark ? "dark" : "light"
        );

        updateThemeButton();
    });
});