/* ScanProf — outils communs chargés sur toutes les pages.
 * - Alerte quand la mémoire de l'iPad (localStorage) est pleine
 * - Récupération de la liste en cours si une édition de séance a été interrompue
 * - Outils CSV compatibles Excel (point-virgule, accents)
 * - Réparation des accents mal décodés
 * - Mode hors-ligne (service worker)
 */
(function () {
  "use strict";

  // Clés de données appartenant à ScanProf (le domaine github.io est partagé
  // avec d'autres applis : on ne touche qu'à ces clés-là).
  var DATA_KEYS = [
    "eleves",
    "scanprof_classes_store_v1",
    "scanprof_apps_v1",
    "participants_custom_cols_v1",
    "participants_cols_focus_v1",
    "scanprof_theme",
    "sp_hide_local_banner",
    "eleves_case_migrated",
  ];

  var EDITOR_BACKUP_KEY = "scanprof_editor_backup";
  var isTopWindow = (function () {
    try { return window.top === window.self; } catch (e) { return false; }
  })();

  /* ---------- 1. Alerte stockage plein ---------- */
  try {
    var proto = Storage.prototype;
    if (!proto.__scanprofGuard) {
      var originalSetItem = proto.setItem;
      var lastAlert = 0;
      proto.setItem = function (key, value) {
        try {
          return originalSetItem.call(this, key, value);
        } catch (err) {
          var isQuota =
            err &&
            (err.name === "QuotaExceededError" ||
              err.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
              err.code === 22 ||
              err.code === 1014);
          if (isQuota && Date.now() - lastAlert > 4000) {
            lastAlert = Date.now();
            setTimeout(function () {
              alert(
                "⚠️ La mémoire de ScanProf est pleine : la dernière modification n'a PAS été enregistrée.\n\n" +
                  "Faites une sauvegarde (Accueil → 💾 Sauvegarder / Restaurer), puis supprimez des " +
                  "anciennes séances ou applications archivées."
              );
            }, 0);
          }
          throw err;
        }
      };
      proto.__scanprofGuard = true;
    }
  } catch (e) {
    /* navigateur sans Storage : rien à faire */
  }

  /* ---------- 2. Récupération après une édition de séance interrompue ---------- */
  // L'éditeur de séance remplace temporairement la liste « eleves » et garde
  // l'original dans EDITOR_BACKUP_KEY. Si la page a été rechargée pendant
  // l'édition, on remet la liste d'origine au prochain chargement.
  if (isTopWindow) {
    try {
      var pending = localStorage.getItem(EDITOR_BACKUP_KEY);
      if (pending != null) {
        if (pending === "__empty__") localStorage.removeItem("eleves");
        else localStorage.setItem("eleves", pending);
        localStorage.removeItem(EDITOR_BACKUP_KEY);
        console.info("ScanProf — liste des participants restaurée après une édition interrompue.");
      }
    } catch (e) {
      /* ignore */
    }
  }

  /* ---------- 3. Réparation des accents ---------- */
  // Certaines applis encodent les QR en UTF-8 sans le signaler : le lecteur
  // les lit alors en Latin-1 et « é » devient « Ã© ».
  var MOJIBAKE = /[Â-ÃÅ][\u0080-¿]|â\u0080[\u0090-¿]/;
  function fixAccents(text) {
    if (typeof text !== "string" || !MOJIBAKE.test(text)) return text;
    try {
      var bytes = new Uint8Array(text.length);
      for (var i = 0; i < text.length; i++) {
        var c = text.charCodeAt(i);
        if (c > 255) return text; // pas du Latin-1 : on ne touche à rien
        bytes[i] = c;
      }
      var repaired = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
      return repaired;
    } catch (e) {
      return text;
    }
  }

  /* ---------- 4. Outils CSV ---------- */
  var CSV_SEP = ";";

  function csvCell(value) {
    if (value == null) return "";
    if (typeof value === "object") {
      try { value = JSON.stringify(value); } catch (e) { value = String(value); }
    }
    var s = String(value);
    if (/[";\n\r,]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function toCSV(header, rows) {
    var lines = [header.map(csvCell).join(CSV_SEP)];
    rows.forEach(function (r) { lines.push(r.map(csvCell).join(CSV_SEP)); });
    return lines.join("\r\n");
  }

  function downloadCSV(csvText, filename) {
    // BOM UTF-8 : indispensable pour qu'Excel affiche correctement les accents
    var blob = new Blob(["﻿" + csvText], { type: "text/csv;charset=utf-8" });
    downloadBlob(blob, filename);
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  // Lit un CSV séparé par ; , ou tabulation, avec guillemets (RFC 4180)
  function parseCSV(text) {
    text = String(text || "").replace(/^﻿/, "");
    var firstLine = text.split(/\r?\n/, 1)[0] || "";
    var counts = { ";": 0, ",": 0, "\t": 0 };
    var inQ = false;
    for (var i = 0; i < firstLine.length; i++) {
      var ch = firstLine[i];
      if (ch === '"') inQ = !inQ;
      else if (!inQ && counts.hasOwnProperty(ch)) counts[ch]++;
    }
    var sep = ";";
    if (counts[","] > counts[sep]) sep = ",";
    if (counts["\t"] > counts[sep]) sep = "\t";

    var rows = [];
    var row = [];
    var field = "";
    var quoted = false;
    for (var j = 0; j < text.length; j++) {
      var c = text[j];
      if (quoted) {
        if (c === '"') {
          if (text[j + 1] === '"') { field += '"'; j++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') {
        quoted = true;
      } else if (c === sep) {
        row.push(field); field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[j + 1] === "\n") j++;
        row.push(field); field = "";
        rows.push(row); row = [];
      } else field += c;
    }
    if (field !== "" || row.length) { row.push(field); rows.push(row); }
    rows = rows.filter(function (r) { return r.some(function (v) { return String(v).trim() !== ""; }); });
    if (!rows.length) return { headers: [], records: [] };

    var headers = rows[0].map(function (h) { return String(h).trim(); });
    var records = rows.slice(1).map(function (r) {
      var obj = {};
      headers.forEach(function (h, k) { if (h) obj[h] = (r[k] == null ? "" : String(r[k])).trim(); });
      return obj;
    });
    return { headers: headers, records: records, separator: sep };
  }

  window.ScanProfCore = {
    DATA_KEYS: DATA_KEYS,
    EDITOR_BACKUP_KEY: EDITOR_BACKUP_KEY,
    fixAccents: fixAccents,
    csvCell: csvCell,
    toCSV: toCSV,
    downloadCSV: downloadCSV,
    downloadBlob: downloadBlob,
    parseCSV: parseCSV,
  };

  /* ---------- 5. Mode hors-ligne ---------- */
  if (isTopWindow && "serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js", { scope: "./" }).catch(function (err) {
        console.warn("ScanProf — mode hors-ligne indisponible", err);
      });
    });
  }
})();
