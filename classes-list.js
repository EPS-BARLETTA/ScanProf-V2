(function () {
  const store = window.ScanProfClassesStore;
  if (!store) return;

  const els = {};
  let classes = [];

  document.addEventListener("DOMContentLoaded", () => {
    els.list = document.getElementById("classes-list");
    els.nameInput = document.getElementById("new-class-name");
    els.colorInput = document.getElementById("new-class-color");
    els.createBtn = document.getElementById("create-class-btn");
    els.createBtn.addEventListener("click", handleCreate);
    load();
    render();
  });

  function load() {
    classes = store.loadClasses();
  }

  function save() {
    store.saveClasses(classes);
  }

  function render() {
    if (!classes.length) {
      els.list.innerHTML = `<div class="empty-hint">Aucune classe pour l'instant. Utilisez le formulaire ci-dessous pour en créer une.</div>`;
      return;
    }
    els.list.innerHTML = classes.map((cls, index) => {
      const accent = pickAccentColor(cls, index);
      const tones = getToneVariants(accent);
      return `
        <article class="class-card" style="--class-accent:${tones.accent};--class-accent-soft:${tones.soft};--class-accent-border:${tones.border};">
          <div class="class-title">
            <span class="class-color"></span>
            ${escapeHtml(cls.name)}
          </div>
          <div class="class-meta">${cls.activities?.length || 0} activité(s)</div>
          <div class="class-actions">
            <a class="class-enter" href="class.html?id=${encodeURIComponent(cls.id)}">🎒 Voir les séances</a>
            <button data-action="rename" data-id="${cls.id}">Renommer</button>
            <button data-action="color" data-id="${cls.id}">Couleur</button>
            <button data-action="delete" data-id="${cls.id}" class="danger">Supprimer</button>
          </div>
        </article>
      `;
    }).join("");

    els.list.querySelectorAll("button[data-action]").forEach(btn => {
      btn.addEventListener("click", () => handleAction(btn.getAttribute("data-action"), btn.getAttribute("data-id")));
    });
  }

  function handleCreate() {
    const name = (els.nameInput.value || "").trim();
    const color = els.colorInput.value || "#1e90ff";
    if (!name) {
      alert("Merci de nommer la classe.");
      return;
    }
    const newClass = store.createClass(name, color);
    classes.push(newClass);
    save();
    els.nameInput.value = "";
    render();
  }

  function handleAction(action, id) {
    const cls = classes.find(c => c.id === id);
    if (!cls) return;
    if (action === "rename") {
      const name = prompt("Nouveau nom :", cls.name);
      if (name == null) return;
      cls.name = name.trim() || cls.name;
      save();
      render();
    }
    if (action === "color") {
      openColorDialog(cls);
    }
    if (action === "delete") {
      if (!confirm(`Supprimer la classe « ${cls.name} » ?`)) return;
      classes = classes.filter(c => c.id !== id);
      save();
      render();
    }
  }

  function openColorDialog(cls) {
    const overlay = document.createElement("div");
    overlay.style.cssText = "position:fixed;inset:0;background:rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;z-index:9999;";
    const card = document.createElement("div");
    card.style.cssText = "background:var(--sp-surface,#fff);color:var(--sp-text,#111);padding:16px 18px;border-radius:12px;width:min(90vw,360px);box-shadow:0 16px 30px rgba(0,0,0,.25);display:flex;flex-direction:column;gap:12px;";
    card.innerHTML = `
      <h3 style="margin:0;">Couleur de la classe</h3>
      <input type="color" id="class-color-picker" value="${cls.color || "#1e90ff"}" style="width:100%;height:48px;border:none;background:transparent;">
      <div style="display:flex;gap:10px;justify-content:flex-end;">
        <button type="button" id="color-cancel" style="padding:8px 12px;border-radius:8px;border:1px solid var(--sp-border,#ccc);background:var(--sp-surface,#fff);cursor:pointer;">Annuler</button>
        <button type="button" id="color-apply" style="padding:8px 12px;border-radius:8px;border:1px solid var(--sp-primary,#1e90ff);background:var(--sp-primary,#1e90ff);color:#fff;cursor:pointer;">Enregistrer</button>
      </div>
    `;
    overlay.appendChild(card);
    document.body.appendChild(overlay);
    card.querySelector("#color-cancel").addEventListener("click", () => overlay.remove());
    card.querySelector("#color-apply").addEventListener("click", () => {
      const color = card.querySelector("#class-color-picker").value || "#1e90ff";
      cls.color = color;
      save();
      render();
      overlay.remove();
    });
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  const NEUTRAL_PALETTE = [
    "#cfd8dc",
    "#d4cfc4",
    "#d9d4cf",
    "#cfd5ce",
    "#d8d1da",
    "#d6cbc4",
  ];

  function pickAccentColor(cls, index) {
    const userColor = sanitizeHex(cls?.color);
    if (userColor) return userColor;
    return NEUTRAL_PALETTE[index % NEUTRAL_PALETTE.length];
  }

  function getToneVariants(hex) {
    const safeHex = sanitizeHex(hex) || "#7a8891";
    return {
      accent: safeHex,
      soft: mixWithWhite(safeHex, 0.82),
      border: mixWithWhite(safeHex, 0.6),
    };
  }

  function mixWithWhite(hex, whiteRatio) {
    const ratio = Math.max(0, Math.min(1, typeof whiteRatio === "number" ? whiteRatio : 0.75));
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;
    const mix = (channel) => Math.round(channel * (1 - ratio) + 255 * ratio);
    return rgbToHex(mix(rgb.r), mix(rgb.g), mix(rgb.b));
  }

  function sanitizeHex(color) {
    if (typeof color !== "string") return null;
    const value = color.trim();
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value) ? value : null;
  }

  function hexToRgb(hex) {
    if (typeof hex !== "string") return null;
    let normalized = hex.replace("#", "");
    if (normalized.length === 3) {
      normalized = normalized.split("").map((ch) => ch + ch).join("");
    }
    if (normalized.length !== 6 || /[^0-9a-f]/i.test(normalized)) return null;
    const num = parseInt(normalized, 16);
    return {
      r: (num >> 16) & 255,
      g: (num >> 8) & 255,
      b: num & 255,
    };
  }

  function rgbToHex(r, g, b) {
    return (
      "#" +
      [r, g, b]
        .map((val) => {
          const bounded = Math.max(0, Math.min(255, val));
          return bounded.toString(16).padStart(2, "0");
        })
        .join("")
    );
  }
})();
