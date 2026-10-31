/* ScanProf — Sauvegarde / restauration en fichier HTML
 * Le fichier produit est une page lisible (tableaux) qui contient aussi
 * toutes les données dans un bloc JSON, relu lors de la restauration.
 */
(function () {
  "use strict";

  var BACKUP_TYPE = "SCANPROF_BACKUP";
  var BACKUP_VERSION = 1;
  var DATA_ID = "scanprof-backup-data";
  var SAFETY_KEY = "scanprof_before_restore";
  var SAFETY_DATE_KEY = "scanprof_before_restore_date";
  var LAST_BACKUP_KEY = "scanprof_last_backup";

  function dataKeys() {
    return (window.ScanProfCore && window.ScanProfCore.DATA_KEYS) || [
      "eleves", "scanprof_classes_store_v1", "scanprof_apps_v1",
      "participants_custom_cols_v1", "participants_cols_focus_v1", "scanprof_theme",
    ];
  }

  function safeParse(raw, fallback) {
    try { var v = JSON.parse(raw); return v == null ? fallback : v; } catch (e) { return fallback; }
  }

  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  function stampForFile(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate()) +
      "_" + pad(d.getHours()) + "h" + pad(d.getMinutes());
  }

  function formatDate(iso) {
    try { return new Date(iso).toLocaleString("fr-FR"); } catch (e) { return iso || ""; }
  }

  /* ---------- Lecture de l'état actuel ---------- */
  function snapshot() {
    var keys = {};
    dataKeys().forEach(function (k) {
      var v = localStorage.getItem(k);
      if (v != null) keys[k] = v;
    });
    return keys;
  }

  function summarize(keys) {
    var eleves = safeParse(keys.eleves, []);
    var classes = safeParse(keys.scanprof_classes_store_v1, []);
    var apps = safeParse(keys.scanprof_apps_v1, []);
    var activities = 0, sessions = 0;
    (Array.isArray(classes) ? classes : []).forEach(function (c) {
      (c.activities || []).forEach(function (a) {
        activities++;
        sessions += (a.sessions || []).length;
      });
    });
    return {
      participants: Array.isArray(eleves) ? eleves.length : 0,
      classes: Array.isArray(classes) ? classes.length : 0,
      activities: activities,
      sessions: sessions,
      apps: Array.isArray(apps) ? apps.length : 0,
    };
  }

  function summaryText(s) {
    return s.participants + " participant(s) en cours · " + s.classes + " classe(s) · " +
      s.activities + " activité(s) · " + s.sessions + " séance(s) · " + s.apps + " application(s) archivée(s)";
  }

  /* ---------- Construction du fichier HTML ---------- */
  function columnsOf(rows) {
    var cols = [];
    var seen = {};
    rows.forEach(function (r) {
      Object.keys(r || {}).forEach(function (k) {
        if (k.charAt(0) === "_" || seen[k]) return;
        seen[k] = true; cols.push(k);
      });
    });
    var first = ["nom", "prenom", "classe", "sexe"];
    cols.sort(function (a, b) {
      var ia = first.indexOf(a), ib = first.indexOf(b);
      if (ia === -1) ia = 99; if (ib === -1) ib = 99;
      return ia - ib;
    });
    return cols;
  }

  function cellText(v) {
    if (v == null) return "";
    if (typeof v === "object") { try { return JSON.stringify(v); } catch (e) { return String(v); } }
    return String(v);
  }

  function tableHtml(rows) {
    if (!rows || !rows.length) return '<p class="empty">Aucune donnée.</p>';
    var cols = columnsOf(rows);
    var h = '<div class="tw"><table><thead><tr>' +
      cols.map(function (c) { return "<th>" + esc(c) + "</th>"; }).join("") +
      "</tr></thead><tbody>";
    rows.forEach(function (r) {
      h += "<tr>" + cols.map(function (c) { return "<td>" + esc(cellText(r[c])) + "</td>"; }).join("") + "</tr>";
    });
    return h + "</tbody></table></div>";
  }

  function buildBackupHtml(keys, createdAt) {
    var s = summarize(keys);
    var eleves = safeParse(keys.eleves, []);
    var classes = safeParse(keys.scanprof_classes_store_v1, []);

    var body = "";
    body += "<h2>Participants en cours (" + s.participants + ")</h2>" + tableHtml(Array.isArray(eleves) ? eleves : []);
    body += "<h2>Classes &amp; séances</h2>";
    if (!Array.isArray(classes) || !classes.length) body += '<p class="empty">Aucune classe.</p>';
    (Array.isArray(classes) ? classes : []).forEach(function (c) {
      body += '<details class="cls"><summary>🗂 ' + esc(c.name) + "</summary>";
      var acts = c.activities || [];
      if (!acts.length) body += '<p class="empty">Aucune activité.</p>';
      acts.forEach(function (a) {
        body += "<h3>" + esc(a.name) + "</h3>";
        (a.sessions || []).forEach(function (se) {
          body += "<details><summary>" + esc(se.name) + " — " + esc(formatDate(se.updatedAt || se.createdAt)) +
            " (" + ((se.data || []).length) + " élève(s))</summary>" + tableHtml(se.data || []) + "</details>";
        });
      });
      body += "</details>";
    });

    var payload = {
      type: BACKUP_TYPE,
      version: BACKUP_VERSION,
      createdAt: createdAt,
      summary: s,
      keys: keys,
    };
    // « < » est échappé pour qu'aucune donnée ne puisse fermer la balise <script>
    var json = JSON.stringify(payload).replace(/</g, "\\u003c");

    return "<!doctype html>\n<html lang=\"fr\"><head><meta charset=\"utf-8\">" +
      "<meta name=\"viewport\" content=\"width=device-width,initial-scale=1\">" +
      "<title>Sauvegarde ScanProf — " + esc(formatDate(createdAt)) + "</title>" +
      "<style>" +
      "body{font-family:-apple-system,'Segoe UI',Arial,sans-serif;margin:0;background:#f3f3f3;color:#222}" +
      "header{background:#1e90ff;color:#fff;padding:16px 20px}header h1{margin:0 0 4px;font-size:1.4rem}" +
      "header p{margin:0;opacity:.9}main{max-width:1100px;margin:0 auto;padding:16px}" +
      ".note{background:#fff8c5;border:1px solid #f3e08a;border-radius:10px;padding:10px 14px;margin-bottom:14px}" +
      "h2{margin:22px 0 8px}h3{margin:14px 0 6px;font-size:1.05rem}" +
      "details{background:#fff;border:1px solid #d5d9e2;border-radius:10px;padding:8px 12px;margin:8px 0}" +
      "summary{cursor:pointer;font-weight:600}.tw{overflow-x:auto;margin-top:8px}" +
      "table{border-collapse:collapse;width:100%;background:#fff;font-size:.9rem}" +
      "th,td{border:1px solid #d5d9e2;padding:5px 8px;text-align:left;white-space:nowrap}" +
      "th{background:#eaf6ff}tr:nth-child(even) td{background:#fafcff}.empty{color:#777;font-style:italic}" +
      "@media print{details{break-inside:avoid}details:not([open]) > *:not(summary){display:block}}" +
      "</style></head><body>" +
      "<header><h1>📚 Sauvegarde ScanProf</h1><p>" + esc(formatDate(createdAt)) + " · " + esc(summaryText(s)) + "</p></header>" +
      "<main><div class=\"note\">💾 Gardez ce fichier précieusement. Pour récupérer vos données : " +
      "ScanProf → <strong>Sauvegarder / Restaurer</strong> → <strong>Restaurer un fichier</strong>, puis choisissez ce fichier.</div>" +
      body + "</main>" +
      "<script id=\"" + DATA_ID + "\" type=\"application/json\">" + json + "</script>" +
      "</body></html>";
  }

  /* ---------- Lecture d'un fichier de sauvegarde ---------- */
  function extractPayload(text) {
    text = String(text || "").replace(/^﻿/, "");
    var json = null;
    var trimmed = text.trim();
    if (trimmed.charAt(0) === "{") {
      json = trimmed; // fichier JSON brut accepté aussi
    } else {
      var doc = new DOMParser().parseFromString(text, "text/html");
      var node = doc.getElementById(DATA_ID);
      if (node) json = node.textContent;
    }
    if (!json) throw new Error("Ce fichier n'est pas une sauvegarde ScanProf.");
    var payload = JSON.parse(json);
    if (!payload || payload.type !== BACKUP_TYPE || !payload.keys || typeof payload.keys !== "object") {
      throw new Error("Ce fichier n'est pas une sauvegarde ScanProf valide.");
    }
    if (payload.version > BACKUP_VERSION) {
      throw new Error("Cette sauvegarde vient d'une version plus récente de ScanProf.");
    }
    var keys = {};
    var allowed = dataKeys();
    Object.keys(payload.keys).forEach(function (k) {
      if (allowed.indexOf(k) !== -1 && typeof payload.keys[k] === "string") keys[k] = payload.keys[k];
    });
    payload.keys = keys;
    return payload;
  }

  function writeKeys(keys) {
    dataKeys().forEach(function (k) {
      if (Object.prototype.hasOwnProperty.call(keys, k)) localStorage.setItem(k, keys[k]);
      else localStorage.removeItem(k);
    });
  }

  /* ---------- Interface ---------- */
  var dom = {};

  function show(msg, ok) {
    dom.msg.textContent = msg;
    dom.msg.className = "bk-msg " + (ok ? "ok" : "err");
  }

  function refresh() {
    var s = summarize(snapshot());
    dom.current.textContent = summaryText(s);
    var last = localStorage.getItem(LAST_BACKUP_KEY);
    dom.last.textContent = last ? "Dernière sauvegarde depuis cet iPad : " + formatDate(last) : "Aucune sauvegarde faite depuis cet iPad.";
    var safety = localStorage.getItem(SAFETY_KEY);
    dom.undoWrap.hidden = !safety;
    if (safety) {
      dom.undoInfo.textContent = "État d'avant la restauration du " + formatDate(localStorage.getItem(SAFETY_DATE_KEY));
    }
  }

  function doBackup() {
    var createdAt = new Date().toISOString();
    var keys = snapshot();
    var html = buildBackupHtml(keys, createdAt);
    var blob = new Blob([html], { type: "text/html;charset=utf-8" });
    var name = "scanprof_sauvegarde_" + stampForFile(new Date(createdAt)) + ".html";
    if (window.ScanProfCore) window.ScanProfCore.downloadBlob(blob, name);
    try { localStorage.setItem(LAST_BACKUP_KEY, createdAt); } catch (e) {}
    show("✅ Sauvegarde créée : " + name + ". Vérifiez qu'elle est bien dans vos Téléchargements (ou Fichiers).", true);
    refresh();
  }

  function onFile(ev) {
    var file = ev.target.files && ev.target.files[0];
    ev.target.value = "";
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var payload;
      try {
        payload = extractPayload(reader.result);
      } catch (err) {
        show("❌ " + (err && err.message ? err.message : "Fichier illisible."), false);
        return;
      }
      var incoming = summarize(payload.keys);
      var current = summarize(snapshot());
      var ok = confirm(
        "Restaurer la sauvegarde du " + formatDate(payload.createdAt) + " ?\n\n" +
        "Contenu du fichier :\n" + summaryText(incoming) + "\n\n" +
        "Ce qui est actuellement sur cet iPad sera REMPLACÉ :\n" + summaryText(current) + "\n\n" +
        "(Une copie de l'état actuel est gardée pour pouvoir annuler.)"
      );
      if (!ok) return;

      // Copie de sécurité de l'état actuel
      var safetySaved = false;
      try {
        localStorage.removeItem(SAFETY_KEY);
        localStorage.setItem(SAFETY_KEY, JSON.stringify(snapshot()));
        localStorage.setItem(SAFETY_DATE_KEY, new Date().toISOString());
        safetySaved = true;
      } catch (e) {
        try { localStorage.removeItem(SAFETY_KEY); } catch (e2) {}
      }
      if (!safetySaved && !confirm(
        "⚠️ Mémoire insuffisante pour garder une copie de secours de l'état actuel.\n\n" +
        "Conseil : annulez, faites d'abord « Sauvegarder maintenant », puis recommencez.\n\nContinuer quand même ?"
      )) return;

      try {
        writeKeys(payload.keys);
      } catch (err) {
        show("❌ La restauration a échoué (mémoire pleine ?). Utilisez « Annuler la dernière restauration ».", false);
        refresh();
        return;
      }
      show("✅ Sauvegarde restaurée : " + summaryText(incoming), true);
      refresh();
    };
    reader.onerror = function () { show("❌ Impossible de lire ce fichier.", false); };
    reader.readAsText(file, "utf-8");
  }

  function doUndo() {
    var raw = localStorage.getItem(SAFETY_KEY);
    if (!raw) return;
    var keys = safeParse(raw, null);
    if (!keys || typeof keys !== "object") { show("❌ Copie de secours illisible.", false); return; }
    if (!confirm("Revenir à l'état d'avant la dernière restauration ?\n\n" + summaryText(summarize(keys)))) return;
    try {
      writeKeys(keys);
      localStorage.removeItem(SAFETY_KEY);
      localStorage.removeItem(SAFETY_DATE_KEY);
      show("✅ Retour à l'état d'avant la restauration.", true);
    } catch (e) {
      show("❌ Impossible d'annuler (mémoire pleine).", false);
    }
    refresh();
  }

  document.addEventListener("DOMContentLoaded", function () {
    dom.current = document.getElementById("bk-current");
    dom.last = document.getElementById("bk-last");
    dom.msg = document.getElementById("bk-msg");
    dom.undoWrap = document.getElementById("bk-undo-wrap");
    dom.undoInfo = document.getElementById("bk-undo-info");
    if (!dom.current) return;
    document.getElementById("bk-save").addEventListener("click", doBackup);
    document.getElementById("bk-file").addEventListener("change", onFile);
    document.getElementById("bk-undo").addEventListener("click", doUndo);
    refresh();
  });

  window.ScanProfBackup = {
    buildBackupHtml: buildBackupHtml,
    extractPayload: extractPayload,
    snapshot: snapshot,
    summarize: summarize,
    LAST_BACKUP_KEY: LAST_BACKUP_KEY,
  };
})();
