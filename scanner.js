// Délai pendant lequel un même QR resté devant la caméra est ignoré
const SAME_QR_COOLDOWN_MS = 4000;
let _lastScan = { text: "", at: 0 };
let _scannerInstance = null;

function startScanner() {
  const qrRegion = document.getElementById("reader");
  if (!qrRegion) return;
  const resultDisplay = document.getElementById("scan-result");

  if (typeof Html5Qrcode === "undefined") {
    qrRegion.innerHTML = "<p>❌ Le lecteur QR n'a pas pu être chargé. Rechargez la page.</p>";
    return;
  }

  const scanner = new Html5Qrcode("reader");
  _scannerInstance = scanner;
  scanner
    .start(
      { facingMode: "environment" },
      { fps: 10, qrbox: 250 },
      (decodedText) => onDecoded(decodedText, resultDisplay),
      () => {
        /* ignore */
      }
    )
    .catch(() => {
      qrRegion.innerHTML = "<p>❌ Impossible d'accéder à la caméra.</p>";
    });
}

// Libère la caméra quand on quitte la page
window.addEventListener("pagehide", () => {
  if (_scannerInstance && _scannerInstance.isScanning) {
    _scannerInstance.stop().catch(() => {});
  }
});

function onDecoded(decodedText, outlet) {
  const now = Date.now();
  if (decodedText === _lastScan.text && now - _lastScan.at < SAME_QR_COOLDOWN_MS) {
    _lastScan.at = now; // le QR est toujours devant la caméra : on prolonge
    return;
  }
  _lastScan = { text: decodedText, at: now };
  handleScan(decodedText, outlet);
}

function parseQrPayload(decodedText) {
  const core = window.ScanProfCore;
  const repaired = core ? core.fixAccents(decodedText) : decodedText;
  try {
    return JSON.parse(repaired);
  } catch (err) {
    if (repaired !== decodedText) return JSON.parse(decodedText);
    throw err;
  }
}

function playFeedback(success) {
  try {
    if (navigator.vibrate) navigator.vibrate(success ? 80 : [60, 60, 60]);
  } catch (e) {}
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    playFeedback._ctx = playFeedback._ctx || new Ctx();
    const ctx = playFeedback._ctx;
    if (ctx.state === "suspended") ctx.resume();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = success ? 1046 : 220;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + (success ? 0.15 : 0.35));
    osc.connect(gain).connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);
  } catch (e) {}
}

function handleScan(decodedText, outlet) {
  const store = window.ScanProfStore || null;
  try {
    const payload = parseQrPayload(decodedText);
    if (!store) {
      const legacy = legacyStoreParticipants(payload);
      showMessage(outlet, legacy.message, legacy.ok);
      return;
    }

    const classification = store.categorizePayload(payload);
    if (classification.kind === "participants") {
      const participants = classification.participants || [];
      if (!participants.length) {
        showMessage(outlet, "❌ Aucun participant détecté dans ce QR.", false);
        return;
      }
      const stats = mergeParticipants(participants);
      const parts = [];
      if (stats.added) parts.push(`${stats.added} ajoutés`);
      if (stats.updated) parts.push(`${stats.updated} mis à jour`);
      const detail = parts.length ? ` (${parts.join(", ")})` : "";
      showMessage(
        outlet,
        `✅ Participants synchronisés${detail}. Total actuel : ${stats.total}.`,
        true
      );
      if (store && typeof store.storeSnapshot === "function") {
        const label = inferSnapshotLabel(payload);
        store.storeSnapshot(participants, decodedText, {
          source: "qr",
          label,
        });
      }
      return;
    }

    if (classification.kind === "app") {
      const result = store.storeAppBundle(payload, decodedText, { source: "qr" });
      if (result.ok) {
        const name = result.record.name || "Application";
        showMessage(outlet, `✅ “${name}” archivée (version ${result.record.version}).`, true);
      } else if (result.reason === "exists") {
        const name = (result.record && result.record.name) || "Application";
        showMessage(outlet, `ℹ️ “${name}” était déjà archivée.`, true);
      } else {
        showMessage(outlet, "❌ Format application non géré.", false);
      }
      return;
    }

    const fallback = legacyStoreParticipants(payload);
    showMessage(outlet, fallback.message, fallback.ok);
    if (fallback.ok && store && typeof store.storeSnapshot === "function") {
      const entries = Array.isArray(payload)
        ? payload
        : payload && typeof payload === "object"
        ? [payload]
        : [];
      if (entries.length) {
        store.storeSnapshot(entries, decodedText, {
          source: "qr",
          label: inferSnapshotLabel(payload),
        });
      }
    }
  } catch (err) {
    console.warn("ScanProf — unable to parse QR payload", err);
    showMessage(outlet, "❌ QR Code invalide ou format non pris en charge.", false);
  }
}

function mergeParticipants(entries) {
  const store = window.ScanProfStore || null;
  const normalize = (entry) =>
    store && store.normalizeParticipantEntry ? store.normalizeParticipantEntry(entry) : entry;
  const keyOf = (entry) =>
    store && store.participantKey
      ? store.participantKey(entry)
      : [
          String(entry && entry.nom ? entry.nom : "").toLowerCase().trim(),
          String(entry && entry.prenom ? entry.prenom : "").toLowerCase().trim(),
          String(entry && entry.classe ? entry.classe : "").toLowerCase().trim(),
        ].join("|");

  const currentRaw = JSON.parse(localStorage.getItem("eleves") || "[]") || [];
  const currentKeys = new Map();
  currentRaw.forEach((entry, idx) => {
    const normalized = normalize(entry);
    currentRaw[idx] = normalized;
    currentKeys.set(keyOf(normalized), idx);
  });

  let added = 0;
  let updated = 0;
  entries.forEach((entry) => {
    const normalized = normalize(entry);
    const key = keyOf(normalized);
    if (!key || key === "||") return;
    if (currentKeys.has(key)) {
      const idx = currentKeys.get(key);
      currentRaw[idx] = Object.assign({}, currentRaw[idx], normalized);
      updated++;
    } else {
      currentRaw.push(normalized);
      currentKeys.set(key, currentRaw.length - 1);
      added++;
    }
  });

  localStorage.setItem("eleves", JSON.stringify(currentRaw));
  return { added, updated, total: currentRaw.length };
}

function legacyStoreParticipants(payload) {
  const result = { ok: false, message: "❌ Format non reconnu." };
  const entries = Array.isArray(payload) ? payload : payload && typeof payload === "object" ? [payload] : [];
  if (!entries.length) return result;
  const existing = JSON.parse(localStorage.getItem("eleves") || "[]") || [];
  let added = 0;
  entries.forEach((entry) => {
    if (
      !existing.some(
        (e) => e.nom === entry.nom && e.prenom === entry.prenom && e.classe === entry.classe
      )
    ) {
      existing.push(entry);
      added++;
    }
  });
  localStorage.setItem("eleves", JSON.stringify(existing));
  result.ok = true;
  result.message = `✅ QR Code enregistré (mode rétro). ${added} nouveau(x).`;
  return result;
}

function inferSnapshotLabel(payload) {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return "";
  const meta = payload.meta || payload.metadata || payload.info || payload.infos || {};
  const candidates = [
    payload.appName,
    payload.app,
    payload.application,
    payload.name,
    payload.nom,
    payload.titre,
    meta.appName,
    meta.application,
    meta.nom,
  ];
  for (const c of candidates) {
    if (c && String(c).trim()) return String(c).trim();
  }
  return "";
}

function showMessage(outlet, text, success) {
  if (!outlet) return;
  outlet.innerText = text;
  outlet.style.color = success ? "#138c27" : "#b00020";
  outlet.classList.remove("scan-flash-ok", "scan-flash-err");
  void outlet.offsetWidth; // relance l'animation
  outlet.classList.add(success ? "scan-flash-ok" : "scan-flash-err");
  playFeedback(success);
  clearTimeout(showMessage._timer);
  showMessage._timer = setTimeout(() => {
    outlet.innerText = "";
    outlet.classList.remove("scan-flash-ok", "scan-flash-err");
  }, 4500);
}

window.onload = startScanner;
