(function () {
  const state = {
    apps: [],
    filtered: [],
    selectedId: null,
  };

  const dom = {};

  document.addEventListener("DOMContentLoaded", () => {
    dom.list = document.getElementById("apps-list");
    dom.detail = document.getElementById("app-detail");
    dom.count = document.getElementById("apps-count");
    dom.search = document.getElementById("apps-search");
    dom.refresh = document.getElementById("apps-refresh");
    dom.toast = document.getElementById("apps-toast");

    if (!window.ScanProfStore) {
      dom.list.innerHTML =
        '<p class="app-detail-empty">⚠️ Chargez “app-store.js” pour utiliser cette page.</p>';
      return;
    }

    bindEvents();
    loadData();
  });

  function bindEvents() {
    dom.search.addEventListener("input", handleSearch);
    dom.refresh.addEventListener("click", (e) => {
      e.preventDefault();
      loadData();
    });
    dom.list.addEventListener("click", (event) => {
      const card = event.target.closest("[data-app]");
      if (!card) return;
      state.selectedId = card.getAttribute("data-app");
      renderList();
      renderDetail();
    });
    dom.list.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") return;
      const card = event.target.closest("[data-app]");
      if (!card) return;
      event.preventDefault();
      state.selectedId = card.getAttribute("data-app");
      renderList();
      renderDetail();
    });
    dom.detail.addEventListener("click", handleDetailAction);
  }

  function loadData() {
    const store = window.ScanProfStore;
    state.apps = (store.listBundles() || []).slice();
    state.apps.sort((a, b) => {
      const da = new Date(a.savedAt || a.createdAt || 0).getTime();
      const db = new Date(b.savedAt || b.createdAt || 0).getTime();
      return db - da;
    });
    state.filtered = state.apps.slice();
    if (!state.filtered.some((app) => app.id === state.selectedId)) {
      state.selectedId = state.filtered.length ? state.filtered[0].id : null;
    }
    renderList();
    renderDetail();
    updateCount();
  }

  function handleSearch(event) {
    const query = (event.target.value || "").toLowerCase().trim();
    if (!query) {
      state.filtered = state.apps.slice();
    } else {
      state.filtered = state.apps.filter((app) => {
        const haystack = [
          app.name,
          app.version,
          app.type,
          app.description,
          (app.tags || []).join(" "),
          app.author,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(query);
      });
    }
    if (!state.filtered.some((app) => app.id === state.selectedId)) {
      state.selectedId = state.filtered.length ? state.filtered[0].id : null;
    }
    renderList();
    renderDetail();
    updateCount();
  }

  function handleDetailAction(event) {
    const actionEl = event.target.closest("[data-action]");
    if (!actionEl) return;
    const action = actionEl.getAttribute("data-action");
    const record = getSelectedRecord();
    if (!record) return;

    if (action === "import") {
      event.preventDefault();
      const stats = window.ScanProfStore.importParticipantsFromBundle(record.id);
      if (stats.ok) {
        const parts = [];
        if (stats.added) parts.push(`${stats.added} ajoutés`);
        if (stats.updated) parts.push(`${stats.updated} mis à jour`);
        const detail = parts.length ? ` (${parts.join(", ")})` : "";
        showToast(`👥 Participants fusionnés${detail}. Total: ${stats.total}.`);
      } else {
        showToast("⚠️ Impossible d'importer ces participants.", false);
      }
    }

    if (action === "export") {
      event.preventDefault();
      exportRecord(record);
    }

    if (action === "delete") {
      event.preventDefault();
      if (confirm(`Supprimer “${record.name}” de l'archive ?`)) {
        window.ScanProfStore.deleteBundle(record.id);
        showToast("🗑️ Application supprimée.", true);
        loadData();
      }
    }
  }

  function renderList() {
    if (!state.filtered.length) {
      dom.list.innerHTML =
        '<div class="app-detail-empty"><p>Aucune archive pour l’instant. Scannez un QR (participants ou appli) afin de le conserver ici.</p></div>';
      return;
    }
    dom.list.innerHTML = state.filtered
      .map((app) => {
        const tags = (app.tags || [])
          .map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`)
          .join("");
        const selected = app.id === state.selectedId ? "selected" : "";
        const meta = [
          `v${escapeHtml(app.version || "1.0")}`,
          `${app.participantsCount || 0} part.`,
          window.ScanProfStore.formatDate(app.savedAt || app.createdAt),
        ]
          .map((text) => `<span>${escapeHtml(text)}</span>`)
          .join("");
        return `
        <article class="app-card ${selected}" data-app="${app.id}" role="button" tabindex="0" aria-pressed="${selected ? "true" : "false"}">
          <div class="app-title">
            <span>${escapeHtml(app.name || "Archive")}</span>
            <small>${escapeHtml(humanRecordType(app))}</small>
          </div>
          <div class="app-meta">${meta}</div>
          ${tags ? `<div class="app-tags">${tags}</div>` : ""}
          <div class="app-open">📂 Ouvrir l'archive</div>
        </article>`;
      })
      .join("");
  }

  function renderDetail() {
    const record = getSelectedRecord();
    if (!record) {
      dom.detail.innerHTML = `
        <div class="app-detail-empty">
          <p>Sélectionnez une source à gauche pour afficher ses détails.</p>
        </div>
      `;
      return;
    }

      const metaCards = [
        { label: "Scanné", value: window.ScanProfStore.formatDate(record.savedAt || record.createdAt) },
        { label: "Créé le", value: window.ScanProfStore.formatDate(record.createdAt) },
        { label: "Participants", value: `${record.participantsCount || 0}` },
        { label: "Type", value: humanRecordType(record) },
        { label: "Auteur", value: record.author || "—" },
        { label: "Source", value: record.source || "QR" },
      ];

    const metaList = Object.entries(record.meta || {});
    const metaPreview = metaList.slice(0, 8);
    const extraMetaCount = Math.max(0, metaList.length - metaPreview.length);

    const participantsPreview = buildParticipantsPreview(record.participants || []);

    const rawJson = escapeHtml(JSON.stringify(record.payload || {}, null, 2));
    const mutedColor = cssVar("--sp-muted", "#666");
    dom.detail.innerHTML = `
      <div class="app-detail-header">
        <h2>${escapeHtml(record.name || "Application")}</h2>
        <p>Version ${escapeHtml(record.version || "1.0")} • ${escapeHtml(record.description || "Aucune description")}</p>
      </div>

      ${
        record.kind === "snapshot"
          ? `<p style="margin:6px 0 12px;color:${escapeHtml(mutedColor)};">Cet instantané conserve la liste telle qu'elle a été scannée. Utilisez “Importer” pour fusionner les élèves ou “Exporter” pour récupérer le JSON.</p>`
          : ""
      }

      <div class="app-detail-meta">
        ${metaCards
          .map(
            (card) => `
            <div class="meta-card">
              <span>${card.label}</span>
              <strong>${escapeHtml(card.value || "—")}</strong>
            </div>`
          )
          .join("")}
      </div>

      <div class="app-detail-actions">
        <button class="apps-btn" data-action="import">👥 Importer dans Participants</button>
        <button class="apps-btn secondary" data-action="export">⬇️ Exporter le JSON</button>
        <button class="apps-btn danger" data-action="delete">🗑️ Supprimer</button>
      </div>

      <div class="app-detail-section">
        <h3>Champs détectés</h3>
        ${
          metaPreview.length
            ? `<div class="app-meta-list">
                ${metaPreview
                  .map(
                    ([key, value]) => `
                    <div class="meta-row">
                      <strong>${escapeHtml(key)}</strong>
                      <div>${escapeHtml(formatMetaValue(value))}</div>
                    </div>`
                  )
                  .join("")}
              </div>
              ${extraMetaCount ? `<p style="font-size:0.85rem;color:#6b7280;">+ ${extraMetaCount} champ(s) masqué(s)</p>` : ""}`
            : `<p style="color:#6b7280">Aucun champ spécifique détecté.</p>`
        }
      </div>

      <div class="app-detail-section">
        <h3>Participants (${record.participantsCount || 0})</h3>
        ${participantsPreview}
      </div>

      <div class="app-detail-section app-raw">
        <details>
          <summary>Voir le JSON brut</summary>
          <pre>${rawJson}</pre>
        </details>
      </div>
    `;
  }

  function buildParticipantsPreview(participants) {
    if (!participants.length) {
      return `<p style="color:#6b7280;">Aucun participant embarqué dans cette application.</p>`;
    }
    const sample = participants.slice(0, 10);
    const baseColumns = ["nom", "prenom", "classe", "sexe"];
    const extraCandidates = ["distance", "vitesse", "vma", "temps_total"];
    const extra = extraCandidates.filter((key) =>
      sample.some((item) => item[key] != null && String(item[key]).trim() !== "")
    );
    const columns = baseColumns.concat(extra.slice(0, 2));
    const thead = columns.map((col) => `<th>${escapeHtml(col)}</th>`).join("");
    const rows = sample
      .map((row) => {
        const cells = columns
          .map((col) => `<td>${escapeHtml(row[col] != null ? String(row[col]) : "")}</td>`)
          .join("");
        return `<tr>${cells}</tr>`;
      })
      .join("");
    const more = participants.length > sample.length ? `<p style="font-size:0.85rem;color:#6b7280;">... +${participants.length - sample.length} participant(s)</p>` : "";
    return `
      <div class="app-participants-preview">
        <table>
          <thead><tr>${thead}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
      ${more}
    `;
  }

  function exportRecord(record) {
    const filename = `${(record.name || "application")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "application"}.json`;
    const blob = new Blob([JSON.stringify(record.payload || {}, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    showToast("⬇️ JSON exporté.");
  }

  function getSelectedRecord() {
    return state.filtered.find((app) => app.id === state.selectedId) || null;
  }

  function updateCount() {
    if (!dom.count) return;
    dom.count.textContent = state.filtered.length ? `(${state.filtered.length})` : "(0)";
  }

  function formatMetaValue(value) {
    if (value == null) return "—";
    if (typeof value === "object") return JSON.stringify(value);
    return String(value);
  }

  function escapeHtml(str) {
    return String(str == null ? "" : str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function showToast(message, success = true) {
    if (!dom.toast) return;
    dom.toast.textContent = message;
    dom.toast.style.background = success ? cssVar("--sp-primary", "#1e90ff") : "#c00040";
    dom.toast.classList.add("visible");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(() => dom.toast.classList.remove("visible"), 2000);
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name);
    return value && value.trim() ? value.trim() : fallback;
  }

  function humanRecordType(record) {
    if (!record) return "Application";
    if (record.kind === "snapshot" || (record.type || "").toLowerCase() === "snapshot") {
      return "Instantané";
    }
    return record.type || "Application";
  }
})();
