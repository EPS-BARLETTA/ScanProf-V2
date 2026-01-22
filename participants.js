// === Etat en mémoire ===
let _elevesBrut = [];
let _vueCourante = [];
let _labels = {};
let _types  = {};
let _ordreAsc = true; // ⬅︎ nouvel état pour ↑/↓

// Etat pour colonnes & menu
let _lastCols = [];
let _focusCols = new Set();    // colonnes “en focus” (hors nom/prenom). Vide = tout afficher
let _colMenuEl = null;         // ref du menu des colonnes
const LS_FOCUS_KEY = "participants_cols_focus_v1";

// ------------ Helpers méta (labels/types) ------------
function collectMeta(rows) {
  const L = {}, T = {};
  (rows || []).forEach(r => {
    if (r && r.__labels && typeof r.__labels === "object") Object.assign(L, r.__labels);
    if (r && r.__types  && typeof r.__types  === "object") Object.assign(T, r.__types);
  });
  return { labels: L, types: T };
}
function humanLabel(key) {
  if (_labels && _labels[key]) return _labels[key];
  const map = { nom:"Nom", prenom:"Prénom", classe:"Classe", sexe:"Sexe",
    distance:"Distance", vitesse:"Vitesse", vma:"VMA", temps_total:"Temps total" };
  if (map[key]) return map[key];
  if (/^t\d+$/i.test(key)) return key.toUpperCase();
  return key.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ------------ Helpers colonnes & splits ------------
function isSplitKey(key = "") {
  const k = key.toLowerCase();
  return k.includes("interm") || k.includes("split");
}
function parseSplits(val) {
  if (val == null) return [];
  if (Array.isArray(val)) return val.map(v => String(v).trim()).filter(Boolean);
  return String(val).split(/[;,]\s*/).map(x => x.trim()).filter(Boolean);
}
function allColumnKeys(rows) {
  if (!rows || !rows.length) return [];
  const standard = ["nom","prenom","classe","sexe","distance","vitesse","vma","temps_total"];
  const set = new Set();
  rows.forEach(r => Object.keys(r || {}).forEach(k => set.add(k)));
  const others = Array.from(set)
    .filter(k => !standard.includes(k))
    .sort((a,b)=>a.localeCompare(b,'fr',{sensitivity:'base'}));
  return [...standard.filter(k => set.has(k)), ...others];
}
function augmentData(rows) {
  if (!rows || !rows.length) return [];
  const splitKeys = new Set();
  rows.forEach(r => Object.keys(r || {}).forEach(k => { if (isSplitKey(k)) splitKeys.add(k); }));
  if (splitKeys.size === 0) return rows.map(r => ({...r}));

  let maxSplits = 0;
  rows.forEach(r => { for (const k of splitKeys) maxSplits = Math.max(maxSplits, parseSplits(r[k]).length); });
  const tCols = Array.from({length:maxSplits}, (_,i)=>`T${i+1}`);

  return rows.map(r => {
    const obj = {...r};
    let had = false;
    for (const k of splitKeys) {
      const arr = parseSplits(r[k]); if (arr.length) had = true;
      tCols.forEach((tName, idx) => { if (obj[tName] == null) obj[tName] = arr[idx] ?? ""; });
    }
    if (had) { for (const k of splitKeys) delete obj[k]; }
    return obj;
  });
}

// ------------ Détection temps/nombre pour tri ------------
function looksLikeTime(v) {
  const s = String(v || "");
  return /^(\d{1,2}:)?\d{1,2}:\d{1,2}(\.\d+)?$/.test(s) || /^\d{1,2}(\.\d+)?$/.test(s);
}
function parseTimeToSeconds(v) {
  if (v == null) return Number.POSITIVE_INFINITY;
  const s = String(v).trim();
  if (s.includes(":")) {
    const p = s.split(":").map(x=>x.trim());
    let h=0, m=0, sec=0;
    if (p.length === 3) { h=+p[0]||0; m=+p[1]||0; sec=parseFloat(p[2])||0; }
    else if (p.length === 2) { m=+p[0]||0; sec=parseFloat(p[1])||0; }
    else { sec=parseFloat(p[0])||0; }
    return h*3600 + m*60 + sec;
  }
  const n = parseFloat(s.replace(/\s/g,'').replace(',', '.'));
  return isNaN(n) ? Number.POSITIVE_INFINITY : n;
}
function isLikelyNumber(val) {
  if (val == null) return false;
  const s = String(val).trim().replace(/\s/g,'').replace(',', '.');
  return /^-?\d+(\.\d+)?$/.test(s);
}
function numericKey(key="") {
  const k = key.toLowerCase();
  return k === "vma" || k === "vitesse" || k === "distance";
}
function typedSortValue(key, val) {
  const t = (_types && _types[key]) || null;
  if (t === "time" || (!t && (key.toLowerCase()==="temps_total" || /^t\d+$/i.test(key) || looksLikeTime(val)))) {
    return parseTimeToSeconds(val);
  }
  if (t === "number" || numericKey(key) || isLikelyNumber(val)) {
    const n = parseFloat(String(val).trim().replace(/\s/g,'').replace(',', '.'));
    return isNaN(n) ? Number.POSITIVE_INFINITY : n;
  }
  return String(val ?? "").toLocaleLowerCase();
}

// ------------ Rendu cellules ------------
function formatCellValue(key, val) {
  if (val == null) return "";
  const k = (key || "").toLowerCase();
  if (typeof val === "string" && /[,;]/.test(val) && (k.includes("inter") || k.includes("split") || k.includes("temps"))) {
    const parts = val.split(/[;,]\s*/).filter(Boolean);
    return parts.map(s =>
      `<span style="display:inline-block;margin:2px 4px 2px 0;padding:2px 6px;border-radius:999px;background:#eef;border:1px solid #d5d9ff;">${s}</span>`
    ).join("<br>");
  }
  if (Array.isArray(val)) return val.map(v => formatCellValue(k, v)).join("<br>");
  if (typeof val === "object") {
    return Object.entries(val).map(([kk, vv]) => `<div><strong>${kk}:</strong> ${formatCellValue(kk, vv)}</div>`).join("");
  }
  return String(val);
}

// ------------ UI : bouton ordre ↑/↓ ------------
function ensureOrdreButton() {
  if (document.getElementById("ordre-btn")) return;
  const triSelect = document.getElementById("tri-select");
  if (!triSelect) return;
  const btn = document.createElement("button");
  btn.id = "ordre-btn";
  btn.type = "button";
  btn.style.marginLeft = "8px";
  btn.className = "btn btn-light";
  updateOrdreButtonText(btn);
  btn.onclick = () => {
    _ordreAsc = !_ordreAsc;
    updateOrdreButtonText(btn);
    if (_vueCourante && _vueCourante.length) trierParticipants();
  };
  triSelect.insertAdjacentElement("afterend", btn);
}
function updateOrdreButtonText(btn) {
  btn.textContent = _ordreAsc ? "↑ Croissant" : "↓ Décroissant";
}

// ------------ Identifiant unique d'une ligne ------------
const uniqKey = (e) =>
  `${(e.nom||"").toLowerCase()}|${(e.prenom||"").toLowerCase()}|${(e.classe||"").toLowerCase()}`;

// ------------ Styles & conteneur scroll injectés ------------
function ensureStickyStyles() {
  if (document.getElementById("participants-sticky-style")) return;
  const css = `
  /* conteneur scroll horizontal (iPad ok) */
  #participants-scroll {
    overflow-x: auto; overflow-y: visible;
    -webkit-overflow-scrolling: touch;
    touch-action: pan-x pinch-zoom;  /* iPad : autorise le slide horizontal */
    overscroll-behavior-x: contain;
    width: 100%;
  }

  /* sticky : on n'impose pas de fond blanc -> héritage pair/impair conservé */
  th.sticky-cell, td.sticky-cell { position: sticky; z-index: 2; }
  th.sticky-cell { z-index: 3; background: #f2f2f2; }

  tr.pair  td.sticky-cell { background: inherit; }
  tr.impair td.sticky-cell { background: inherit; }

  th.sticky-cell::after, td.sticky-cell::after {
    content: ""; position: absolute; top: 0; right: -1px; width: 1px; height: 100%;
    background: #e6e6e6;
  }

  .col-hidden { display: none !important; }

  /* menu Focus en overlay fixe très au-dessus (iPad Safari) */
  .colmenu {
    position: fixed;
    z-index: 2147483647; /* max */
    border: 1px solid #ddd; border-radius: 10px; background: #fff;
    box-shadow: 0 12px 28px rgba(0,0,0,.18);
    padding: 8px 10px; min-width: 240px; max-height: 360px; overflow: auto;
    transform: translateZ(0); will-change: transform; pointer-events: auto;
  }
  .colmenu label { display:flex; align-items:center; gap:8px; padding:4px 2px; }
  .colmenu .row { display:flex; justify-content:space-between; align-items:center; gap:8px; }
  `;
  const style = document.createElement("style");
  style.id = "participants-sticky-style";
  style.textContent = css;
  document.head.appendChild(style);
}
function ensureScrollWrap() {
  const table = document.getElementById("participants-table");
  if (!table) return;
  if (table.parentElement && table.parentElement.id === "participants-scroll") return;
  const wrap = document.createElement("div");
  wrap.id = "participants-scroll";
  table.parentElement.insertBefore(wrap, table);
  wrap.appendChild(table);
}

// ------------ Column picker (FOCUS) ------------
function ensureColumnsButton() {
  if (document.getElementById("focus-btn")) return;
  const triSelect = document.getElementById("tri-select");
  if (!triSelect) return;

  // bouton
  const btnWrap = document.createElement("span");
  btnWrap.style.position = "relative";
  const btn = document.createElement("button");
  btn.id = "focus-btn";
  btn.type = "button";
  btn.className = "btn btn-light";
  btn.style.marginLeft = "8px";
  btn.textContent = "🎯 Focus";

  // menu (rendu différé + position fixe)
  const menu = document.createElement("div");
  menu.id = "colmenu";
  menu.className = "colmenu";
  menu.style.display = "none";

  btn.onclick = (ev) => {
    if (menu.style.display === "none") {
      const rect = btn.getBoundingClientRect();
      const margin = 6;
      // position dans le viewport (fixed)
      let top = rect.bottom + margin;
      let left = rect.left;
      const menuWidth = 260;
      const maxLeft = document.documentElement.clientWidth - menuWidth - 8;
      if (left > maxLeft) left = maxLeft;
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
      refreshColumnMenu();
      menu.style.display = "block";
    } else {
      menu.style.display = "none";
    }
    ev.stopPropagation();
  };

  // fermer si clic hors (y compris iPad)
  document.addEventListener("click", (e) => {
    if (menu.style.display === "none") return;
    if (!menu.contains(e.target) && e.target !== btn) {
      menu.style.display = "none";
    }
  }, { passive: true });

  btnWrap.appendChild(btn);
  document.body.appendChild(menu); // append au body pour sortir des contextes d'empilement
  _colMenuEl = menu;
  triSelect.insertAdjacentElement("afterend", btnWrap);
}
function renderColumnMenu(menuEl) {
  if (!menuEl) return;
  const cols = _lastCols || [];
  const always = new Set(["nom","prenom"]);
  const saved = loadFocusFromLS();
  _focusCols = new Set(saved.filter(k => !always.has(k)));

  const maxFocus = 2;

  const html = [];
  html.push(`<div class="row" style="margin-bottom:6px;">
    <strong>Focus colonnes</strong>
    <button type="button" class="btn btn-light" id="btn-show-all">Tout afficher</button>
  </div>`);

  html.push(`<div>`);
  cols.forEach(k => {
    const lower = k.toLowerCase();
    const disabled = always.has(lower) ? "disabled" : "";
    const checked = always.has(lower) || _focusCols.has(lower) ? "checked" : "";
    html.push(`
      <label>
        <input type="checkbox" data-col="${lower}" ${checked} ${disabled}/>
        ${humanLabel(k)}
      </label>
    `);
  });
  html.push(`</div>`);
  menuEl.innerHTML = html.join("");

  menuEl.querySelector("#btn-show-all").onclick = () => {
    _focusCols.clear();
    saveFocusToLS([]);
    applyColumnVisibility();
  };

  menuEl.querySelectorAll('input[type="checkbox"][data-col]').forEach(chk => {
    chk.addEventListener("change", () => {
      const col = chk.getAttribute("data-col");
      if (col === "nom" || col === "prenom") { chk.checked = true; return; }
      if (chk.checked) {
        if (_focusCols.size >= maxFocus) { chk.checked = false; return; }
        _focusCols.add(col);
      } else {
        _focusCols.delete(col);
      }
      saveFocusToLS(Array.from(_focusCols));
      applyColumnVisibility(); // masque/affiche uniquement (pas de réordonnancement)
    });
  });
}
function refreshColumnMenu() {
  if (_colMenuEl) renderColumnMenu(_colMenuEl);
}
function loadFocusFromLS() {
  try {
    const arr = JSON.parse(localStorage.getItem(LS_FOCUS_KEY) || "[]");
    return Array.isArray(arr) ? arr : [];
  } catch { return []; }
}
function saveFocusToLS(arr) {
  localStorage.setItem(LS_FOCUS_KEY, JSON.stringify(arr || []));
}
function applyColumnVisibility() {
  const cols = _lastCols || [];
  const showAll = (_focusCols.size === 0);
  const mustShow = new Set(["nom","prenom", ..._focusCols]);

  cols.forEach(k => {
    const lower = k.toLowerCase();
    const show = showAll ? true : mustShow.has(lower);
    document.querySelectorAll(`[data-col="${lower}"]`).forEach(el => {
      if (show) el.classList.remove("col-hidden");
      else el.classList.add("col-hidden");
    });
  });

  applyStickyFirstTwo();
}

// ------------ Sticky Nom/Prénom (après rendu) ------------
function applyStickyFirstTwo() {
  const thead = document.getElementById("table-head");
  const tbody = document.getElementById("participants-body");
  if (!thead || !tbody) return;

  const cols = Array.from(document.querySelectorAll("#table-head th")).map(th => th.getAttribute("data-col") || "");
  const idxNom = cols.indexOf("nom");
  const idxPrenom = cols.indexOf("prenom");
  if (idxNom === -1 || idxPrenom === -1) return;

  // reset styles
  thead.querySelectorAll("th").forEach(th => { th.style.left = ""; th.classList.remove("sticky-cell"); });
  tbody.querySelectorAll("td").forEach(td => { td.style.left = ""; td.classList.remove("sticky-cell"); });

  const headRow = thead.querySelector("tr");
  if (!headRow) return;

  const allHeadTh = Array.from(headRow.children);
  const thNom = allHeadTh[idxNom];
  const thPrenom = allHeadTh[idxPrenom];
  if (!thNom || !thPrenom) return;

  const leftNom = 0;
  const widthNom = thNom.getBoundingClientRect().width;

  thNom.classList.add("sticky-cell"); thNom.setAttribute("data-col", "nom"); thNom.style.left = leftNom + "px";
  tbody.querySelectorAll(`td[data-col="nom"]`).forEach(td => { td.classList.add("sticky-cell"); td.style.left = leftNom + "px"; });

  const leftPrenom = leftNom + widthNom;
  thPrenom.classList.add("sticky-cell"); thPrenom.setAttribute("data-col", "prenom"); thPrenom.style.left = leftPrenom + "px";
  tbody.querySelectorAll(`td[data-col="prenom"]`).forEach(td => { td.classList.add("sticky-cell"); td.style.left = leftPrenom + "px"; });
}

// ------------ Initialisation ------------
function afficherParticipants() {
  ensureStickyStyles();
  _elevesBrut = JSON.parse(localStorage.getItem("eleves") || "[]");
  const meta = collectMeta(_elevesBrut);
  _labels = meta.labels;
  _types  = meta.types;

  _vueCourante = augmentData(_elevesBrut);

  const triSelect = document.getElementById("tri-select");
  let keys = allColumnKeys(_vueCourante);
  if (keys.some(k => /^T\d+$/i.test(k))) keys = keys.filter(k => !isSplitKey(k));
  triSelect.innerHTML = keys.map(k => `<option value="${k}">${humanLabel(k)}</option>`).join("");

  ensureOrdreButton();
  ensureColumnsButton();

  updateTable(_vueCourante);
}

// ------------ Rendu tableau ------------
function updateTable(data) {
  const thead = document.getElementById("table-head");
  const tbody = document.getElementById("participants-body");
  if (!thead || !tbody) return;

  if (!data || data.length === 0) {
    thead.innerHTML = "";
    tbody.innerHTML = `<tr><td colspan="1">Aucun élève enregistré.</td></tr>`;
    _lastCols = [];
    return;
  }

  let cols = allColumnKeys(data);
  if (cols.some(k => /^T\d+$/i.test(k))) cols = cols.filter(k => !isSplitKey(k));
  _lastCols = cols.slice();

  thead.innerHTML = `<tr>${cols.map(c => `<th data-col="${c.toLowerCase()}">${humanLabel(c)}</th>`).join("")}</tr>`;

  tbody.innerHTML = data.map((row, i) => {
    const tds = cols.map(k => `<td data-col="${k.toLowerCase()}">${formatCellValue(k, row[k])}</td>`).join("");
    const key = uniqKey(row);
    return `<tr data-key="${key}" title="Astuce : appui long pour supprimer la ligne" class="${i % 2 === 0 ? 'pair' : 'impair'}">${tds}</tr>`;
  }).join("");

  ensureScrollWrap();
  refreshColumnMenu();
  applyColumnVisibility();
  applyStickyFirstTwo();

  window.addEventListener("resize", applyStickyFirstTwo, { passive: true });
  const scroller = document.getElementById("participants-scroll");
  if (scroller) scroller.addEventListener("scroll", () => {/* sticky natif */}, { passive: true });
}

// ------------ Filtre texte ------------
function filtrerTexte() {
  const q = (document.getElementById("filtre-txt").value || "").toLowerCase().trim();
  _elevesBrut = JSON.parse(localStorage.getItem("eleves") || "[]");

  let filtered;
  if (!q) {
    filtered = _elevesBrut.slice();
  } else {
    filtered = _elevesBrut.filter(obj => {
      for (const k in obj) {
        const val = (obj[k] == null ? "" : String(obj[k])).toLowerCase();
        if (val.indexOf(q) !== -1) return true;
      }
      return false;
    });
  }

  const meta = collectMeta(filtered);
  _labels = meta.labels; _types = meta.types;

  _vueCourante = augmentData(filtered);
  let keys = allColumnKeys(_vueCourante);
  if (keys.some(k => /^T\d+$/i.test(k))) keys = keys.filter(k => !isSplitKey(k));
  document.getElementById("tri-select").innerHTML = keys.map(k => `<option value="${k}">${humanLabel(k)}</option>`).join("");

  updateTable(_vueCourante);
}

// ------------ Tri dynamique (avec ↑/↓ et détection nombres/temps) ------------
function trierParticipants() {
  const critere = document.getElementById("tri-select").value;
  let data = _vueCourante.length ? _vueCourante.slice() : augmentData(JSON.parse(localStorage.getItem("eleves") || "[]"));
  if (data.length === 0) return;

  data.sort((a, b) => {
    const va = typedSortValue(critere, a[critere]);
    const vb = typedSortValue(critere, b[critere]);
    if (typeof va === "number" && typeof vb === "number") {
      return _ordreAsc ? (va - vb) : (vb - va);
    }
    const cmp = String(va).localeCompare(String(vb), "fr", { sensitivity: "base", numeric: true });
    return _ordreAsc ? cmp : -cmp;
  });

  _vueCourante = data;
  updateTable(data);
}

// ------------ Export CSV (inchangé, avec T1..Tn) ------------
function exporterCSV() {
  const data = _vueCourante.length ? _vueCourante : augmentData(JSON.parse(localStorage.getItem("eleves") || "[]"));
  if (!data.length) return;

  let header = allColumnKeys(data);
  if (header.some(k => /^T\d+$/i.test(k))) header = header.filter(k => !isSplitKey(k));

  const rows = data.map(row => header.map(k => (row[k] ?? "")).join(","));
  const csv = [header.join(","), ...rows].join("\n");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = "participants.csv";
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ------------ Import CSV (inchangé) ------------
function importerCSV(event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = function (e) {
    const text = e.target.result;
    const lines = text.split(/\r?\n/).filter(l => l.trim() !== "");
    if (!lines.length) return;

    const headers = lines[0].split(",").map(h => h.trim());
    const data = lines.slice(1).map(line => {
      const values = line.split(",");
      const obj = {};
      headers.forEach((h, i) => obj[h] = (values[i] || "").trim());
      return obj;
    });

    localStorage.setItem("eleves", JSON.stringify(data));
    _elevesBrut = data.slice();

    const meta = collectMeta(_elevesBrut);
    _labels = meta.labels; _types = meta.types;

    _vueCourante = augmentData(_elevesBrut);
    let keys = allColumnKeys(_vueCourante);
    if (keys.some(k => /^T\d+$/i.test(k))) keys = keys.filter(k => !isSplitKey(k));
    document.getElementById("tri-select").innerHTML = keys.map(k => `<option value="${k}">${humanLabel(k)}</option>`).join("");

    updateTable(_vueCourante);
  };
  reader.readAsText(file);
}

// ------------ Impression (aperçu + bouton) ------------
function imprimerTableau() {
  const table = document.getElementById("participants-table");
  if (!table) return;

  const win = window.open("", "_blank");
  if (!win) { alert("Veuillez autoriser l’ouverture de fenêtres pour imprimer."); return; }

  win.document.write(`
    <html>
      <head>
        <meta charset="utf-8">
        <title>Participants enregistrés</title>
        <style>
          @page { size: A4; margin: 12mm; }
          body { font-family: Arial, sans-serif; margin: 0; font-size: 12pt; }
          h1 { font-size: 18pt; margin: 12mm 12mm 6mm 12mm; }
          .bar { margin: 0 12mm 6mm 12mm; }
          .btn { font-size: 12pt; padding: 8px 14px; border: 1px solid #aaa; border-radius: 8px; background: #f2f2f2; cursor: pointer; }
          table { border-collapse: collapse; width: calc(100% - 24mm); margin: 0 12mm; }
          th, td { border: 1px solid #ccc; padding: 6pt; text-align: left; vertical-align: top; }
          th { background: #f2f2f2; }
          tr:nth-child(even) { background: #fafafa; }
          td { white-space: normal; word-break: break-word; }
          .footer { margin: 8mm 12mm; font-size: 9pt; color: #666; text-align: center; }
        </style>
      </head>
      <body>
        <h1>Participants enregistrés</h1>
        <div class="bar">
          <button class="btn" onclick="window.print()">🖨️ Imprimer / PDF</button>
        </div>
        ${table.outerHTML}
        <div class="footer">ScanProf — Impression du ${new Date().toLocaleString()}</div>
      </body>
    </html>
  `);
  win.document.close();
  try { win.focus(); win.print(); } catch(e) {}
}

// ------------ Envoi par mail (inchangé) ------------
function envoyerParMail() {
  const data = _vueCourante.length ? _vueCourante : augmentData(JSON.parse(localStorage.getItem("eleves") || "[]"));
  if (!data.length) return;

  let header = allColumnKeys(data);
  if (header.some(k => /^T\d+$/i.test(k))) header = header.filter(k => !isSplitKey(k));

  const lignes = data.map(e => header.map(k => (e[k] ?? "")).join("\t")).join("%0A");
  const entete = header.join("\t");

  const body = `Bonjour,%0A%0AVoici la liste des participants scannés depuis ScanProf :%0A%0A${encodeURIComponent(entete)}%0A${encodeURIComponent(lignes)}%0A%0ACordialement.`;
  const mailto = `mailto:?subject=${encodeURIComponent("Participants ScanProf")}&body=${body}`;
  window.location.href = mailto;
}

// ------------ Réinitialisation ------------
function resetData() {
  if (confirm("Voulez-vous vraiment réinitialiser la liste ?")) {
    localStorage.removeItem("eleves");
    _elevesBrut = [];
    _vueCourante = [];
    updateTable([]);
  }
}

// --- Suppression par appui long sur une ligne (sans modifier l'UI) ---
(function enableLongPressDelete() {
  const PRESS_MS = 800;  // durée d'appui pour déclencher
  const MOVE_TOL = 8;    // tolérance de mouvement (px)
  const BODY_SEL = "#participants-body";

  let pressTimer = null;
  let startX = 0, startY = 0;
  let targetRow = null;

  function clearTimer() {
    if (pressTimer) clearTimeout(pressTimer);
    pressTimer = null;
    targetRow = null;
  }

  function deleteByKey(key) {
    const arr = JSON.parse(localStorage.getItem("eleves") || "[]");
    const filtered = arr.filter(e => uniqKey(e) !== key);
    localStorage.setItem("eleves", JSON.stringify(filtered));

    _elevesBrut = _elevesBrut.filter(e => uniqKey(e) !== key);
    _vueCourante = _vueCourante.filter(e => uniqKey(e) !== key);

    updateTable(_vueCourante);
  }

  function startPress(row, x, y) {
    clearTimer();
    targetRow = row;
    startX = x; startY = y;

    pressTimer = setTimeout(() => {
      const key = targetRow?.dataset?.key;
      if (!key) return clearTimer();

      if (confirm("Supprimer cette ligne ?")) {
        deleteByKey(key);
      }
      clearTimer();
    }, PRESS_MS);
  }

  document.addEventListener("pointerdown", (e) => {
    const row = e.target.closest("tr[data-key]");
    if (!row) return;
    if (!row.closest(BODY_SEL)) return;
    startPress(row, e.clientX, e.clientY);
  }, { passive: true });

  ["pointerup","pointercancel","pointerleave"].forEach(evt =>
    window.addEventListener(evt, clearTimer, { passive: true })
  );

  window.addEventListener("pointermove", (e) => {
    if (!pressTimer) return;
    const dx = Math.abs(e.clientX - startX);
    const dy = Math.abs(e.clientY - startY);
    if (dx > MOVE_TOL || dy > MOVE_TOL) clearTimer();
  }, { passive: true });
})();

window.onload = afficherParticipants;
