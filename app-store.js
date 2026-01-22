(function () {
  const STORE_KEY = "scanprof_apps_v1";

  const PARTICIPANT_ALIASES = {
    nom: ["nom", "name", "lastname", "last_name", "surname"],
    prenom: ["prenom", "pr\u00e9nom", "firstName", "firstname", "first_name"],
    classe: ["classe", "class", "classe_eleve", "group", "groupe"],
    sexe: ["sexe", "genre", "gender", "sex"],
    distance: ["distance", "metres", "meters", "dist", "m"],
    vitesse: ["vitesse", "speed", "kmh", "km_h"],
    vma: ["vma", "VMA"],
    temps_total: ["temps_total", "temps", "chronometre", "chrono", "time", "duration", "duree"],
  };

  function safeClone(obj) {
    return JSON.parse(JSON.stringify(obj ?? null));
  }

  function firstNonEmpty(values) {
    for (const val of values) {
      if (val == null) continue;
      const text = String(val).trim();
      if (text) return text;
    }
    return "";
  }

  function fingerprintString(str) {
    let h1 = 0xdeadbeef ^ str.length;
    let h2 = 0x41c6ce57 ^ str.length;
    for (let i = 0, ch; i < str.length; i++) {
      ch = str.charCodeAt(i);
      h1 = Math.imul(h1 ^ ch, 2654435761);
      h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = (Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)) >>> 0;
    h2 = (Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)) >>> 0;
    return ((h2 & 0x1fffff) * 4294967296 + h1).toString(16);
  }

  function looksLikeParticipant(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const keys = Object.keys(obj).map((k) => k.toLowerCase());
    let score = 0;
    const tests = [
      ["nom", "last", "surname", "name"],
      ["prenom", "pr\u00e9nom", "first"],
      ["classe", "class", "groupe"],
      ["sexe", "sex", "genre", "gender"],
      ["distance", "vma", "vitesse", "time", "chrono", "temps"],
    ];
    tests.forEach((aliases) => {
      if (keys.some((k) => aliases.some((alias) => k.includes(alias)))) score++;
    });
    return score >= 2;
  }

  function looksLikeAppBundle(obj) {
    if (!obj || typeof obj !== "object" || Array.isArray(obj)) return false;
    const keys = Object.keys(obj).map((k) => k.toLowerCase());
    const hasAppFlag = keys.some((k) =>
      ["app", "appname", "application", "bundle", "module"].includes(k)
    );
    if (hasAppFlag) return true;
    if ("meta" in obj || "metadata" in obj || "info" in obj || "infos" in obj) return true;
    const type = String(obj.type || "").toLowerCase();
    if (type.includes("scanprof") || type.includes("app")) return true;
    if (obj.data && typeof obj.data === "object") {
      if ("app" in obj.data || "meta" in obj.data || "participants" in obj.data) return true;
    }
    return false;
  }

  function normalizeParticipantEntry(entry = {}) {
    const clone = safeClone(entry) || {};
    const lowerKeys = Object.keys(entry || {}).reduce((acc, key) => {
      acc[key.toLowerCase()] = key;
      return acc;
    }, {});

    Object.entries(PARTICIPANT_ALIASES).forEach(([target, aliases]) => {
      if (clone[target] != null && clone[target] !== "") return;
      for (const alias of aliases) {
        const realKey = lowerKeys[alias.toLowerCase()];
        if (realKey && entry[realKey] != null && entry[realKey] !== "") {
          clone[target] = entry[realKey];
          break;
        }
      }
    });
    return clone;
  }

  function detectParticipantList(raw) {
    if (!raw || typeof raw !== "object") return [];
    const candidates = [];
    const directKeys = [
      "participants",
      "eleves",
      "\u00e9l\u00e8ves",
      "students",
      "items",
      "list",
      "liste",
      "dataset",
      "data",
      "values",
    ];
    directKeys.forEach((key) => {
      const value = raw[key];
      if (Array.isArray(value)) candidates.push(value);
      else if (value && typeof value === "object") {
        if (Array.isArray(value.participants)) candidates.push(value.participants);
        if (Array.isArray(value.items)) candidates.push(value.items);
      }
    });
    for (const arr of candidates) {
      const filtered = arr.filter(looksLikeParticipant);
      if (filtered.length) return filtered;
    }
    return [];
  }

  function normalizeAppBundle(raw) {
    if (!looksLikeAppBundle(raw)) return null;
    const clone = safeClone(raw);
    const metaSource = raw.meta || raw.metadata || raw.info || raw.infos || {};
    const meta = safeClone(metaSource);
    const participants = detectParticipantList(raw).map((p) => normalizeParticipantEntry(p));
    const name = firstNonEmpty([
      raw.appName,
      raw.app,
      raw.application,
      raw.name,
      raw.nom,
      meta && meta.appName,
      meta && meta.application,
      meta && meta.nom,
    ]) || "Application sans nom";
    const version =
      firstNonEmpty([raw.appVersion, raw.version, raw.build, meta && meta.version, meta && meta.appVersion]) ||
      "1.0";
    const type =
      firstNonEmpty([raw.type, raw.appType, raw.categorie, meta && meta.type, meta && meta.categorie]) || "app";
    const description =
      firstNonEmpty([raw.description, raw.resume, raw.summary, meta && meta.description, meta && meta.resume]) ||
      "";
    const author = firstNonEmpty([raw.author, raw.auteur, meta && meta.author, meta && meta.auteur]) || "";
    const createdAt =
      firstNonEmpty([raw.createdAt, raw.date, raw.generatedAt, meta && meta.date]) ||
      new Date().toISOString();
    const tagsRaw = raw.tags || (meta && meta.tags) || [];
    const tags = Array.isArray(tagsRaw)
      ? tagsRaw.map((t) => String(t).trim()).filter(Boolean)
      : String(tagsRaw || "")
          .split(/[;,]/)
          .map((t) => t.trim())
          .filter(Boolean);
    const fingerprint = fingerprintString(JSON.stringify(raw));
    return {
      id: `app_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      version,
      type,
      description,
      author,
      createdAt,
      tags,
      meta,
      participants,
      participantsCount: participants.length,
      payload: clone,
      fingerprint,
    };
  }

  function loadRecords() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      return Array.isArray(arr) ? arr : [];
    } catch {
      return [];
    }
  }

  function saveRecords(records) {
    localStorage.setItem(STORE_KEY, JSON.stringify(records || []));
  }

  function listBundles() {
    return loadRecords();
  }

  function getBundleById(id) {
    return loadRecords().find((rec) => rec.id === id) || null;
  }

  function deleteBundle(id) {
    const records = loadRecords().filter((rec) => rec.id !== id);
    saveRecords(records);
    return records;
  }

  function storeAppBundle(raw, rawText, options = {}) {
    const normalized = normalizeAppBundle(raw);
    if (!normalized) return { ok: false, reason: "not_app" };
    const records = loadRecords();
    const existing = records.find((rec) => rec.fingerprint === normalized.fingerprint);
    if (existing) return { ok: false, reason: "exists", record: existing };
    normalized.rawText = rawText || "";
    normalized.source = options.source || "qr";
    normalized.savedAt = new Date().toISOString();
    records.unshift(normalized);
    saveRecords(records);
    return { ok: true, record: normalized };
  }

  function participantKey(entry = {}) {
    const obj = normalizeParticipantEntry(entry);
    const nom = String(obj.nom || "").toLowerCase().trim();
    const prenom = String(obj.prenom || "").toLowerCase().trim();
    const classe = String(obj.classe || "").toLowerCase().trim();
    return [nom, prenom, classe].join("|");
  }

  function importParticipantsFromBundle(id, opts = {}) {
    const record = getBundleById(id);
    if (!record) return { ok: false, reason: "missing" };
    if (!record.participants || !record.participants.length)
      return { ok: false, reason: "empty" };
    const current = (JSON.parse(localStorage.getItem("eleves") || "[]") || []).map((entry) =>
      normalizeParticipantEntry(entry)
    );
    const seen = new Map();
    current.forEach((p, idx) => seen.set(participantKey(p), idx));
    let added = 0;
    let updated = 0;
    record.participants.forEach((rawParticipant) => {
      const normalized = normalizeParticipantEntry(rawParticipant);
      const key = participantKey(normalized);
      if (!key || key === "||") return;
      if (seen.has(key)) {
        const idx = seen.get(key);
        current[idx] = Object.assign({}, current[idx], normalized);
        updated++;
      } else {
        current.push(normalized);
        seen.set(key, current.length - 1);
        added++;
      }
    });
    localStorage.setItem("eleves", JSON.stringify(current));
    return { ok: true, added, updated, total: current.length };
  }

  function formatDate(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch {
      return value;
    }
  }

  function categorizePayload(payload) {
    if (Array.isArray(payload) && payload.length && payload.every(looksLikeParticipant)) {
      return { kind: "participants", participants: payload.map((p) => normalizeParticipantEntry(p)) };
    }
    if (looksLikeParticipant(payload)) {
      return { kind: "participants", participants: [normalizeParticipantEntry(payload)] };
    }
    if (payload && typeof payload === "object") {
      const detected = detectParticipantList(payload);
      if (detected.length) {
        return {
          kind: "participants",
          participants: detected.map((p) => normalizeParticipantEntry(p)),
        };
      }
      const normalizedApp = normalizeAppBundle(payload);
      if (normalizedApp) {
        return { kind: "app", app: normalizedApp };
      }
    }
    return { kind: "unknown" };
  }

  window.ScanProfStore = {
    categorizePayload,
    normalizeParticipantEntry,
    participantKey,
    storeAppBundle,
    listBundles,
    getBundleById,
    deleteBundle,
    importParticipantsFromBundle,
    formatDate,
  };
})();
