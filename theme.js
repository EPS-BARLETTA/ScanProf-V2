(function () {
  const STORAGE_KEY = "scanprof_theme";
  const prefersDark = window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)");

  function getInitialTheme() {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === "light" || stored === "dark") return stored;
    return prefersDark && prefersDark.matches ? "dark" : "light";
  }

  function applyTheme(theme) {
    const target = document.documentElement;
    if (!target) return;
    target.setAttribute("data-theme", theme);
  }

  let currentTheme = getInitialTheme();
  applyTheme(currentTheme);

  if (prefersDark && typeof prefersDark.addEventListener === "function") {
    prefersDark.addEventListener("change", (event) => {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "light" || stored === "dark") return;
      currentTheme = event.matches ? "dark" : "light";
      applyTheme(currentTheme);
      updateToggleLabel();
    });
  }

  let toggleButton = null;

  function updateToggleLabel() {
    if (!toggleButton) return;
    const isDark = currentTheme === "dark";
    toggleButton.setAttribute("aria-pressed", String(isDark));
    toggleButton.textContent = isDark ? "☀️ Mode clair" : "🌙 Mode sombre";
  }

  function toggleTheme() {
    currentTheme = currentTheme === "dark" ? "light" : "dark";
    localStorage.setItem(STORAGE_KEY, currentTheme);
    applyTheme(currentTheme);
    updateToggleLabel();
  }

  document.addEventListener("DOMContentLoaded", () => {
    if (!document.body) return;
    toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.className = "theme-toggle";
    toggleButton.addEventListener("click", toggleTheme);
    document.body.appendChild(toggleButton);
    updateToggleLabel();
  });
})();
