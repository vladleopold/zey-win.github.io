const apiBase = document.querySelector('meta[name="builder-api"]')?.content?.replace(/\/$/, "") || "https://android-builder-api.vercel.app";
const operatorKey = document.querySelector('meta[name="builder-key"]')?.content?.trim() || "";
const op = (extra = {}) => ({ "Content-Type": "application/json", "x-builder-key": operatorKey, ...extra });
const $ = id => document.getElementById(id);
function ensureContainer(id) { return $(id) || (() => { const d = document.createElement("div"); d.id = id; d.style.cssText = "padding:0 12px 12px"; document.querySelector("header").after(d); return d; })(); }
const buildsContainer = ensureContainer("builds-container");
const activeContainer = ensureContainer("active-container");
const modal = $("modal");
const form = $("build-form");
const newBuildBtn = $("new-build");
const cancelBtn = $("modal-cancel");
const repoSelect = $("repo-select");
const branchSelect = null;
const gameIcon = $("game-icon");
const iconSpinner = $("icon-spinner");
const iconFile = $("icon-file");
const firebaseFile = $("firebase-file");
const versionMode = null;
const sdkVersion = $("sdk-version");
const sparksBtn = null;
const loading = $("loading");
let pageSpinner = null;
let progressAnimId = null;
function showPageSpinner() {
  if (pageSpinner) { pageSpinner.style.display = "flex"; return; }
  pageSpinner = document.createElement("div");
  pageSpinner.id = "page-spinner";
  pageSpinner.style.cssText = "display:flex;flex-direction:column;align-items:center;justify-content:center;position:fixed;inset:0;z-index:100000;background:rgba(13,17,23,0.8);gap:16px;pointer-events:none";
  pageSpinner.innerHTML = '<div class="spinner" style="width:80px;height:80px;border:6px solid #30363d;border-top-color:#58a6ff;border-radius:50%;animation:spin .3s linear infinite"></div><div style="color:#8b949e;font-size:14px">Загрузка сборок...</div><div id="page-progress-text" style="color:#8b949e;font-size:12px;font-weight:700;width:200px;text-align:center">0%</div>';
  document.body.appendChild(pageSpinner);
  startProgress();
}
function hidePageSpinner() {
  if (progressAnimId) { cancelAnimationFrame(progressAnimId); progressAnimId = null; }
  if (pageSpinner) pageSpinner.style.display = "none";
}
function startProgress() {
  const txt = document.getElementById("page-progress-text");
  if (!txt) return;
  const totalMs = 15000;
  const start = Date.now();
  function tick() {
    const elapsed = Date.now() - start;
    const base = Math.min(95, (elapsed / totalMs) * 100);
    const jitter = Math.sin(elapsed / 350) * 6 + Math.cos(elapsed / 170) * 4 + Math.sin(elapsed / 780) * 3;
    let p = Math.max(0, Math.min(100, base + jitter));
    txt.textContent = Math.floor(p) + "%";
    if (elapsed < totalMs) { progressAnimId = requestAnimationFrame(tick); }
    else { txt.textContent = "100%"; progressAnimId = null; }
  }
  progressAnimId = requestAnimationFrame(tick);
}

const REPO_NAMES = { "zey-win/plinko": "plinko", "zey-win/blackjack": "blackjack", "zey-win/roulette": "roulette", "zey-win/dragon-tiger": "dragon tiger", "zey-win/baccarat-tiger": "baccarat", "zey-win/wheel-of-fortune": "lucky wheel", "zey-win/Unstopable": "unstopable", "zey-win/SlotSpot": "slotspot" };
const REPO_NAMES_ADMIN = { "zey-win/plinko": "plinko", "zey-win/blackjack": "blackjack", "zey-win/roulette": "roulette", "zey-win/dragon-tiger": "dragon tiger", "zey-win/baccarat-tiger": "baccarat", "zey-win/wheel-of-fortune": "lucky wheel", "zey-win/Unstopable": "unstopable", "zey-win/SlotSpot": "slotspot" };

let mode = localStorage.getItem('builder_mode') || 'main';
function modeKey(base) { return base + (mode === "admin" ? "_admin" : ""); }
function getRepoNames() {
  const base = mode === "admin" ? REPO_NAMES_ADMIN : REPO_NAMES;
  const result = { ...base };
  for (const cfg of savedConfigs) {
    const repo = safeString(cfg.game_repository);
    if (repo && !result[repo]) {
      result[repo] = safeString(cfg.app_name) || repo.split("/").pop();
    }
  }
  return result;
}
function iconDir() { return mode === "admin" ? "icons-admin" : "icons"; }

function isRunInMode(r) {
  if (mode === "main") return true;
  const { pkg } = parseTitle(r.displayTitle || r.name || "");
  if (!pkg) return false;
  return savedConfigs.some(c => c.package_name === pkg);
}

function filterRunsByMode() {
  return mode === "main" ? runs : runs.filter(isRunInMode);
}

let runMeta = {}, releases = [], firebaseJson = null, currentIconDataUrl = null, iconLoadedDeferred = null, userIconSet = false;
let savedConfigs = [], selectedConfigId = null;
let configTreeState = {}; // groupId -> expanded boolean
const versionCache = new Map();
const sdkVersionCache = new Map();
const firebaseCache = new Map();
let batchBuildRunning = false;
let runs = [];
let loadBuildsGen = 0;

function repoFromTitle(t) { const s = (t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " "); const names = getRepoNames(); for (const [repo, name] of Object.entries(names)) if (s.includes(name)) return repo; return null; }
function parseTitle(title) { if (!title) return { app: "Build", pkg: "" }; const parts = title.replace(/^Android:\s*/i, "").split(" / ").map(p => p.trim()); return { app: parts[0] || "Build", pkg: parts[1] || "" }; }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

const iconPlaceholder = document.getElementById("icon-placeholder");
function showPlaceholder() { if (iconPlaceholder) iconPlaceholder.style.display = ""; }
function hidePlaceholder() { if (iconPlaceholder) iconPlaceholder.style.display = "none"; }
function showIconSpinner() { gameIcon.style.display = "none"; iconSpinner.style.display = "block"; hidePlaceholder(); }
function hideIconSpinner() { iconSpinner.style.display = "none"; }
function setIcon(src) { if (src) { gameIcon.src = src; gameIcon.style.display = "block"; hidePlaceholder(); } else { gameIcon.style.display = "none"; showPlaceholder(); } hideIconSpinner(); }

// Single source of truth for an icon: the config's own icon_url / icon_data_url.
// The same value is sent to the build (CI downloads icon_url), so the card and
// the APK always show the identical image.
function configIconUrl(cfg) {
  if (!cfg) return null;
  return cfg.icon_url || cfg.icon_data_url || null;
}
function configIconForRepo(repo) {
  return configIconUrl(savedConfigs.find(c => c.game_repository === repo));
}
function configIconForPackage(pkg) {
  if (!pkg) return null;
  return configIconUrl(savedConfigs.find(c => c.package_name === pkg));
}

// Preview in the build form: show the canonical config icon (no server guess).
async function getIconDataUrl(repo) {
  const url = configIconForRepo(repo);
  if (url) { setIcon(url); return url; }
  setIcon(null); return null;
}

// Resolve the icon for a saved config / history card.
async function resolveConfigIconDataUrl(cfg) {
  return configIconUrl(cfg);
}

// Race a promise against a timeout so a hung request can't block the batch forever.
function withTimeout(promise, ms, msg) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(msg || "таймаут операции")), ms);
    Promise.resolve(promise).then(
      v => { clearTimeout(t); resolve(v); },
      e => { clearTimeout(t); reject(e); }
    );
  });
}

// fetch with an AbortController-based timeout (default 90s).
async function fetchWithTimeout(url, opts = {}, ms = 90000) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

let audioCtx = null;
function getAudioCtx() { if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); return audioCtx; }
function playFanfare() { try { const ctx = getAudioCtx(); [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => { const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sine"; o.frequency.value = f; g.gain.setValueAtTime(0.15, ctx.currentTime + i * 0.15); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + i * 0.15 + 2.5); o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + i * 0.15); o.stop(ctx.currentTime + i * 0.15 + 2.5); }); } catch {} }
function playErrorSound() { try { const ctx = getAudioCtx(); const o = ctx.createOscillator(); const g = ctx.createGain(); o.type = "sawtooth"; o.frequency.value = 150; g.gain.setValueAtTime(0.15, ctx.currentTime); g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 2.5); o.connect(g); g.connect(ctx.destination); o.start(); o.stop(ctx.currentTime + 2.5); } catch {} }

function fireConfetti(dur = 4000) {
  const canvas = document.createElement("canvas"); canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;mix-blend-mode:screen"; canvas.width = innerWidth; canvas.height = innerHeight; document.body.appendChild(canvas); const ctx = canvas.getContext("2d");
  const p = []; const colors = ["#ffd700","#ff4500","#00ff00","#ff1493","#00bfff","#ffa500","#ff00ff","#ffff00"];
  for (let i = 0; i < 150; i++) p.push({ x: Math.random() * canvas.width, y: Math.random() * canvas.height * -1, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 4 + 2, w: Math.random() * 10 + 4, h: Math.random() * 6 + 2, color: colors[Math.floor(Math.random() * colors.length)], alpha: 1, rot: Math.random() * 360 });
  const start = Date.now();
  function anim() { const elapsed = Date.now() - start; if (elapsed > dur) { canvas.remove(); return; } ctx.clearRect(0, 0, canvas.width, canvas.height); for (const pt of p) { pt.x += pt.vx; pt.y += pt.vy; pt.vy += 0.02; pt.rot += 2; pt.alpha = Math.max(0, 1 - elapsed / dur); ctx.save(); ctx.translate(pt.x, pt.y); ctx.rotate(pt.rot * Math.PI / 180); ctx.globalAlpha = pt.alpha; ctx.fillStyle = pt.color; ctx.fillRect(-pt.w / 2, -pt.h / 2, pt.w, pt.h); ctx.restore(); } requestAnimationFrame(anim); }
  anim();
}

async function loadReleases() {
  try {
    const res = await Promise.race([
      fetch("https://api.github.com/repos/zey-win/ci-cd/releases?per_page=50"),
      new Promise((_, reject) => setTimeout(() => reject(new Error("таймаут loadReleases")), 8000))
    ]);
    if (!res.ok) return;
    const data = await res.json();
    releases.length = 0;
    for (const r of (data || [])) {
      const tag = r.tag_name || "";
      const assets = (r.assets || []).map(a => ({ name: a.name, url: a.browser_download_url }));
      releases.push({ tag, name: r.name, assets });
    }
  } catch {}
}
function findDownloads(pkg) {
  if (!pkg) return { apk: null, aab: null };
  const parts = pkg.toLowerCase().split(".").filter(Boolean);
  const lastPart = parts[parts.length - 1];
  if (!lastPart || lastPart.includes("*")) return { apk: null, aab: null };
  for (const rel of releases) {
    const searchIn = (rel.name || rel.tag || "").toLowerCase();
    if (!searchIn.includes(lastPart)) continue;
    const apk = rel.assets.find(a => a.name.endsWith(".apk") && a.name.toLowerCase().includes(lastPart));
    const aab = rel.assets.find(a => a.name.endsWith(".aab") && a.name.toLowerCase().includes(lastPart));
    if (apk || aab) return { apk: apk?.url || null, aab: aab?.url || null };
  }
  return { apk: null, aab: null };
}
async function fetchVersionFromCiCd(pkg) {
  try {
    const res = await fetch(`https://raw.githubusercontent.com/zey-win/ci-cd/main/builds/${encodeURIComponent(pkg)}/latest-build.txt`);
    if (!res.ok) return null;
    const text = await res.text();
    const mName = text.match(/^version_name=(.+)$/m);
    const mCode = text.match(/^version_code=(.+)$/m);
    if (!mName && !mCode) return null;
    return { versionName: mName?.[1] || "", versionCode: mCode?.[1] || "" };
  } catch {
    return null;
  }
}

async function loadArtifactVersions() {
  const promises = runs.filter(r => r.status === "completed").map(async (r) => {
    if (runMeta[r.id]?.ver && runMeta[r.id].ver !== "1") return;
    var verName = "", verCode = "";
    try {
      const res = await fetch(`${apiBase}/api/builds/${r.id}`);
      if (res.ok) {
        const d = await res.json();
        if (d.ok && d.config) {
          verName = d.config.aab_version_name || d.config.version_name || "";
          verCode = d.config.aab_version_code || d.config.version_code || "";
        }
      }
    } catch {}
    if (!verName || !verCode) {
      const { pkg } = parseTitle(r.displayTitle || r.name || "");
      if (pkg) {
        const cicd = await fetchVersionFromCiCd(pkg);
        if (cicd) {
          if (!verName) verName = cicd.versionName;
          if (!verCode) verCode = cicd.versionCode;
        }
      }
    }
    if (verName || verCode) {
      if (!runMeta[r.id]) runMeta[r.id] = {};
      if (verName) runMeta[r.id].ver = verName;
      if (verCode) runMeta[r.id].code = verCode;
    }
  });
  await Promise.all(promises);
}

 async function loadVersionSuggestion(packageName, force = false) {
  const pkg = (packageName || "").trim();
  if (!pkg) return null;
  if (!force && versionCache.has(pkg)) return versionCache.get(pkg);
  if (!/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(pkg)) return null;
  let data = null;
  try {
    const res = await fetch(`${apiBase}/api/versions?package_name=${encodeURIComponent(pkg)}`, { headers: op() });
    if (res.ok) {
      data = await res.json();
      if (data?.aab?.versionName || data?.aab?.versionCode) {
        versionCache.set(pkg, data);
        return data;
      }
    }
  } catch {}
  const cicd = await fetchVersionFromCiCd(pkg);
  if (cicd && (cicd.versionName || cicd.versionCode)) {
    const fallback = { ok: true, package_name: pkg, aab: {}, apk: {}, versionName: cicd.versionName, versionCode: cicd.versionCode, latest: { versionName: cicd.versionName, versionCode: cicd.versionCode } };
    fallback.aab.versionName = cicd.versionName;
    fallback.aab.versionCode = cicd.versionCode;
    versionCache.set(pkg, fallback);
    return fallback;
  }
  return null;
}

async function loadSdkVersions(force = false) {
  if (!force && sdkVersionCache.has("default")) return sdkVersionCache.get("default");
  try {
    const res = await fetch(`${apiBase}/api/sdk-versions?repository=${encodeURIComponent("zey-win/ZeyWinAdsSDK-Unity")}&min_version=${encodeURIComponent("v3.9.37")}`, { headers: op() });
    if (!res.ok) return null;
    const data = await res.json();
    sdkVersionCache.set("default", data);
    return data;
  } catch {
    return null;
  }
}

function normalizeSdkVersion(value) {
  const raw = (value || "").trim();
  if (!raw) return "v3.9.37";
  return raw.startsWith("v") ? raw : `v${raw}`;
}

function derivePackageNameFromRepo(repo) {
  const shortName = (repo || "").split("/").pop() || "game";
  return `com.zeywin.${shortName.replace(/[^a-z0-9]+/gi, "").toLowerCase()}`;
}

function deriveAppNameFromRepo(repo) {
  const shortName = (repo || "").split("/").pop() || "Game";
  return shortName.replace(/[-_]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function generateApiKey() {
  if (window.crypto?.getRandomValues) {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return `zw_${Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  }
  return `zw_${Math.random().toString(36).slice(2, 14)}${Math.random().toString(36).slice(2, 14)}`;
}

async function generateAiIcon(repo, prompt) {
  try {
    const res = await fetch(`${apiBase}/api/generate-icon`, {
      method: "POST",
      headers: op(),
      body: JSON.stringify({ game_repository: repo, prompt })
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data?.icon?.dataUrl || null;
  } catch {
    return null;
  }
}

async function syncSdkVersionField(force = false) {
  const data = await loadSdkVersions(force);
  const versions = data?.versions || [];
  const defaultVersion = normalizeSdkVersion(data?.defaultVersion || versions[0] || "v3.9.37");
  if (!sdkVersion) return defaultVersion;
  if (!sdkVersion.options.length || force) {
    sdkVersion.innerHTML = "";
    for (const version of versions.length ? versions : [defaultVersion]) {
      const option = document.createElement("option");
      option.value = normalizeSdkVersion(version);
      option.textContent = normalizeSdkVersion(version);
      sdkVersion.appendChild(option);
    }
  }
  if (!sdkVersion.value || force) {
    sdkVersion.value = defaultVersion;
  }
  return sdkVersion.value || defaultVersion;
}

let _syncVersionTimer = null;
async function syncVersionFields(force = false) {
  if (versionMode && versionMode.value === "manual") return;
  const pkg = $("f-pkg")?.value?.trim();
  if (!pkg) return;
  if (!force && versionCache.has(pkg)) {
    const suggested = versionCache.get(pkg)?.aab || {};
    const versionName = suggested.versionName || versionCache.get(pkg)?.latest?.versionName;
    const versionCode = suggested.versionCode || versionCache.get(pkg)?.latest?.versionCode;
    if (versionName && versionCode) {
      const versionInput = $("f-version");
      const codeInput = $("f-vcode");
      if (versionInput) versionInput.value = versionName;
      if (codeInput) codeInput.value = versionCode;
    }
    return;
  }
  const data = await loadVersionSuggestion(pkg, force);
  const suggested = data?.aab || {};
  const versionName = suggested.versionName || data?.latest?.versionName;
  const versionCode = suggested.versionCode || data?.latest?.versionCode;
  if (versionName && versionCode) {
    const versionInput = $("f-version");
    const codeInput = $("f-vcode");
    if (versionInput) versionInput.value = versionName;
    if (codeInput) codeInput.value = versionCode;
  }
}
function debouncedSyncVersionFields() {
  clearTimeout(_syncVersionTimer);
  _syncVersionTimer = setTimeout(() => syncVersionFields(false), 300);
}

async function loadFirebaseConfigBase64(firebaseCfg) {
  const cfg = (firebaseCfg || "").trim();
  if (!cfg) return "";
  if (firebaseCache.has(cfg)) return firebaseCache.get(cfg);
  try {
    // Inline data URL (e.g. "data:application/json;base64,....") — decode directly.
    if (cfg.startsWith("data:")) {
      const base64 = cfg.includes(",") ? cfg.split(",").pop() : cfg;
      firebaseCache.set(cfg, base64);
      return base64;
    }
    const res = await fetch(`./firebase-cfg/${encodeURIComponent(cfg)}`);
    if (!res.ok) return "";
    const text = await res.text();
    const base64 = btoa(unescape(encodeURIComponent(text)));
    firebaseCache.set(cfg, base64);
    return base64;
  } catch {
    return "";
  }
}

function resolveIcon(r) {
  const meta = runMeta[r.id];
  // 1) Icon explicitly attached to this run (user override at build time).
  if (meta?.icon) return meta.icon;
  if (meta?.params?.iconDataUrl && String(meta.params.iconDataUrl).startsWith("data:")) return meta.params.iconDataUrl;
  // 2) Canonical config icon for this package — the same one sent to the build.
  const raw = r.displayTitle || r.name || "";
  const { pkg } = parseTitle(raw);
  return configIconForPackage(pkg);
}

function buildCardHTML(r, idx) {
  const raw = r.displayTitle || r.name || "";
  const { app, pkg } = parseTitle(raw);
  const concl = r.conclusion || "";
  const st = r.status || "unknown";
  const url = r.htmlUrl || "#";
  const meta = runMeta[r.id];
  const iconUrl = resolveIcon(r);
  const verStr = (meta?.ver) || "";
  const codeStr = (meta?.code) || "";
  const versionInfo = esc(app);
  const buildNum = r.runNumber || "";
  const versionBlock = `
    <div class="ver-block">
      ${verStr ? `<div class="ver-row ver-row-name"><span class="ver-key">версия:</span> <span class="ver-val">${esc(verStr)}</span></div>` : ""}
      ${codeStr ? `<div class="ver-row ver-row-code"><span class="ver-key">версия код [revision]:</span> <span class="ver-val-code">${esc(codeStr)}</span></div>` : ""}
      ${buildNum ? `<div class="ver-row ver-row-build"><span class="ver-key">номер сборки:</span> <span class="ver-val-build">#${esc(String(buildNum))}</span></div>` : ""}
    </div>`;
  let downloads = { apk: null, aab: null };
  if (concl === "success") {
    const cached = meta?.apk || meta?.aab ? { apk: meta.apk || null, aab: meta.aab || null } : null;
    downloads = cached || findDownloads(pkg);
  }
  let label, cls;
  if (concl === "success") { label = "✅<span class='lt'> Готов</span>"; cls = "status-success"; }
  else if (concl === "failure") { label = "❌<span class='lt'> Ошибка</span>"; cls = "status-failure"; }
  else if (["waiting","queued","pending"].includes(st)) { label = "⏳<span class='lt'> В очереди</span>"; cls = "status-pending"; }
  else if (st === "completed") { label = "❌<span class='lt'> Ошибка</span>"; cls = "status-failure"; }
  else { label = "🔄<span class='lt'> "+st+"</span>"; cls = "status-pending"; }
  const isProgress = ["in_progress","pending","queued","waiting"].includes(st);
  const bgStyle = idx % 2 === 0 ? 'background:#1a202c' : 'background:#161b22';
  const iconBlock = iconUrl ? `<div class="card-icon-wrap"><img class="card-icon" src="${iconUrl}" alt="" decoding="async" onerror="this.onerror=null;this.alt='🎮'"></div>` : `<div class="card-icon-wrap card-icon-placeholder">🎮</div>`;
  const timerId = `t-${r.id}`;
  const timerHtml = `<span class="timer" id="${timerId}" data-run="${r.id}" style="display:${st!=='completed'&&timers[r.id]?'inline':'none'};color:#ffd700;font-size:11px;font-weight:700">⏱ </span>`;
  return `<div class="build-card${isProgress?' in-progress':''}" style="${bgStyle}" data-id="${r.id}">${iconBlock}<div class="card-body"><div class="card-text"><div class="app-name">${versionInfo}</div>${pkg?`<div class="meta">${esc(pkg)}</div>`:""}${versionBlock}</div><div class="btn-group">${concl==="success"&&downloads.apk?`<a class="dl-btn dl-btn-apk" href="${downloads.apk}" download>APK</a>`:""}${concl==="success"&&downloads.aab?`<a class="dl-btn dl-btn-aab" href="${downloads.aab}" download>AAB</a>`:""}${concl!=="success"?`<a href="${esc(url)}" target="_blank" class="log-btn" style="font-size:11px;padding:3px 6px">Логи</a>`:""}<div class="status-row">${timerHtml}<span class="status ${cls} status-small">${label}</span></div><button class="del-btn" onclick="deleteRun(${r.id},event)" title="Удалить">✕</button></div></div></div>`;
}

function updateTimers() {
  const now = Date.now();
  for (const [id, t] of Object.entries(timers)) {
    const run = runs.find(r => r.id === id);
    if (run && run.status === "completed") { delete timers[id]; const el = document.getElementById(`t-${id}`); if (el) el.style.display = "none"; continue; }
    const el = document.getElementById(`t-${id}`);
    if (!el) continue;
    const left = Math.max(0, t.total - (now - t.start));
    if (left <= 0) { el.style.display = "none"; delete timers[id]; continue; }
    const m = Math.floor(left / 60000);
    const s = Math.floor((left % 60000) / 1000);
    const cs = Math.floor((left % 1000) / 10);
    el.textContent = `⏱ ${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")},${String(cs).padStart(2,"0")}`;
  }
}

const timers = {};
function startTimerLoop() {
  let running = true;
  function tick() { if (!running) return; updateTimers(); requestAnimationFrame(tick); }
  requestAnimationFrame(tick);
  return () => { running = false; };
}

function renderAll() {
  const modeRuns = filterRunsByMode();
  const active = modeRuns.filter(r => r.status !== "completed");
  const done = modeRuns.filter(r => r.status === "completed" && r.conclusion === "success");
  const fail = modeRuns.filter(r => r.status === "completed" && r.conclusion !== "success");
  const allDone = [...done, ...fail].slice(0, 100);

  const activeHtml = active.length ? active.map((r, i) => buildCardHTML(r, i)).join("") : "";
  const doneHtml = allDone.length ? allDone.map((r, i) => buildCardHTML(r, i + active.length)).join("") : "";

  if (activeContainer.innerHTML !== activeHtml) activeContainer.innerHTML = activeHtml;
  if (buildsContainer.innerHTML !== doneHtml) buildsContainer.innerHTML = doneHtml;
  activeContainer.style.display = activeHtml ? "" : "none";
  buildsContainer.style.display = doneHtml ? "" : "none";

  let statsEl = document.getElementById("stats");
  if (!statsEl) {
    statsEl = document.createElement("div");
    statsEl.id = "stats";
    statsEl.style.cssText = "text-align:center;color:#8b949e;font-size:13px;padding:8px 0";
    buildsContainer.appendChild(statsEl);
  }
  statsEl.textContent = `Всего: ${runs.length} | Активные: ${active.length} | Успешно: ${done.length} | Ошибок: ${fail.length}`;
}

async function loadBuilds() {
  const gen = ++loadBuildsGen;
  try {
    const workflow = mode === "admin" ? "2" : "1";
    const res = await fetch(`${apiBase}/api/runs?workflow=${workflow}`);
    if (gen !== loadBuildsGen) return;
    if (!res.ok) return;
    const d = await res.json();
    if (gen !== loadBuildsGen) return;
    const oldRuns = runs;
    runs = Array.isArray(d.runs) ? d.runs : [];
    renderAll();
    requestAnimationFrame(() => { if (gen === loadBuildsGen) { hidePageSpinner(); if (loading) loading.style.display = "none"; } });
    setTimeout(() => { if (gen === loadBuildsGen) runPostFetch(gen, oldRuns); }, 0);
  } catch(e) { console.error(e); }
}

function runPostFetch(gen, oldRuns) {
  for (const r of runs) {
    if (!runMeta[r.id]) runMeta[r.id] = {};
    if (!runMeta[r.id].icon) {
      let icon = r.iconUrl;
      if (!icon) {
        const meta = runMeta[r.id];
        if (meta?.params?.iconDataUrl && String(meta.params.iconDataUrl).startsWith("data:")) {
          icon = meta.params.iconDataUrl;
        }
      }
      if (icon) runMeta[r.id].icon = icon;
    }
  }
  try {
    const sv = JSON.parse(localStorage.getItem(modeKey('rv'))||'{}');
    for (const [id, v] of Object.entries(sv)) {
      const rid = parseInt(id);
      if (!runMeta[rid]) runMeta[rid] = {};
      if (v.ver) runMeta[rid].ver = v.ver;
      if (v.code) runMeta[rid].code = v.code;
      if (v.apk) runMeta[rid].apk = v.apk;
      if (v.aab) runMeta[rid].aab = v.aab;
      if (v.params) runMeta[rid].params = v.params;
    }
  } catch {}
  for (const r of runs) {
    if (r.status !== "completed" && !timers[r.id]) {
      const created = r.createdAt ? new Date(r.createdAt).getTime() : Date.now();
      timers[r.id] = { start: created, total: (39 + (r.id % 12)) * 60 * 1000 };
    }
  }
  for (const r of runs) {
    const old = oldRuns.find(o => o.id === r.id);
    if (old && old.status !== "completed" && r.status === "completed") {
      if (r.conclusion === "success") { playFanfare(); fireConfetti(4000); }
      else { playErrorSound(); flashRed(); }
    }
  }
  renderAll();
  loadArtifactVersions().then(() => { if (gen === loadBuildsGen) renderAll(); });
  setTimeout(syncDownloadsToStorage, 0);
}

function syncDownloadsToStorage() {
  try {
    let changed = false;
    const sv = JSON.parse(localStorage.getItem(modeKey('rv')) || '{}');
    for (const r of runs) {
      if (r.status !== "success") continue;
      const meta = runMeta[r.id];
      if (!meta) continue;
      const pkg = parseTitle(r.displayTitle || r.name || "").pkg;
      if (!pkg) continue;
      if (meta.apk || meta.aab) {
        if (!sv[r.id]) { sv[r.id] = {}; changed = true; }
        if (meta.apk && sv[r.id].apk !== meta.apk) { sv[r.id].apk = meta.apk; changed = true; }
        if (meta.aab && sv[r.id].aab !== meta.aab) { sv[r.id].aab = meta.aab; changed = true; }
      } else {
        const dl = findDownloads(pkg);
        if (dl.apk || dl.aab) {
          if (!sv[r.id]) { sv[r.id] = {}; changed = true; }
          if (dl.apk && sv[r.id].apk !== dl.apk) { sv[r.id].apk = dl.apk; changed = true; }
          if (dl.aab && sv[r.id].aab !== dl.aab) { sv[r.id].aab = dl.aab; changed = true; }
        }
      }
    }
    if (changed) localStorage.setItem(modeKey('rv'), JSON.stringify(sv));
  } catch {}
}

async function deleteRun(runId, e) {
  if (!confirm("Удалить эту сборку?")) return;
  const btn = e?.target; if (btn) btn.disabled = true;
  try {
    await fetch(`${apiBase}/api/delete`, { method: "POST", headers: op(), body: JSON.stringify({ run_id: runId }) });
    runs = runs.filter(r => r.id !== runId);
    delete runMeta[runId];
    delete timers[runId];
    try { const sv = JSON.parse(localStorage.getItem(modeKey('rv'))||'{}'); delete sv[runId]; localStorage.setItem(modeKey('rv'),JSON.stringify(sv)); } catch {}
    renderAll();
  } catch (err) { alert("Ошибка удаления: " + err.message); }
  finally { if (btn) btn.disabled = false; }
}

function updateIcon() {
  getIconDataUrl(repoSelect.value, "main");
}

iconFile.addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  const isPng = f.type === "image/png" || /\.png$/i.test(f.name || "");
  if (!isPng) { alert("Только PNG"); return; }
  const r = new FileReader();
  r.onload = () => { currentIconDataUrl = r.result; userIconSet = true; gameIcon.src = r.result; gameIcon.style.display = "block"; hidePlaceholder(); };
  r.readAsDataURL(f);
});
$("icon-gen-btn").addEventListener("click", async () => {
  const prompt = `${$("f-app-name")?.value || deriveAppNameFromRepo(repoSelect.value)} mobile game icon, premium casino style, vibrant colors, 1024x1024`;
  const url = await generateAiIcon(repoSelect.value, prompt);
  if (url) {
    currentIconDataUrl = url;
    userIconSet = true;
    setIcon(url);
  }
});

firebaseFile.addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  if (f.type !== "application/json") { alert("Только JSON"); return; }
  const r = new FileReader();
  r.onload = () => { firebaseJson = r.result; };
  r.readAsDataURL(f);
});

function flashRed() {
  const div = document.createElement("div");
  div.style.cssText = "position:fixed;inset:0;background:#ff0000;z-index:99999;pointer-events:none";
  document.body.appendChild(div);
  requestAnimationFrame(() => {
    div.style.transition = "opacity 3s ease-out";
    div.style.opacity = "0";
    setTimeout(() => div.remove(), 3500);
  });
}

async function submitBuildPayload(payload) {
  const btn = $("modal-submit");
  if (btn) {
    btn.disabled = true;
    btn.textContent = "Подожди...";
  }

  try {
    const requestPayload = { ...payload, mode: mode };
    // eslint-disable-next-line no-console
    console.log(`[builder] submitBuildPayload: iconDataUrl=${requestPayload.iconDataUrl ? "data:" + requestPayload.iconDataUrl.length + "B" : "(empty)"}, icon_png_path=${requestPayload.icon_png_path || "(empty)"}`);
    requestPayload.zeywin_sdk_version = normalizeSdkVersion(requestPayload.zeywin_sdk_version || sdkVersion?.value || "v3.9.37");
    // save version to runMeta BEFORE API call so loadArtifactVersions can't overwrite it
    var pendingVer = requestPayload.aab_version_name || requestPayload.version_name || "";
    var pendingCode = requestPayload.aab_version_code || requestPayload.version_code || "";

    const res = await fetchWithTimeout(`${apiBase}/api/build`, { method: "POST", headers: op(), body: JSON.stringify(requestPayload) }, 90000);
    if (!res.ok) {
      throw new Error(await res.text().catch(() => ""));
    }
    const d = await res.json();
    if (d.run) {
      const serverIconPath = d.icon?.path;
      const serverIconUrl = serverIconPath ? `https://raw.githubusercontent.com/zey-win/ci-cd/main/${serverIconPath}` : (d.icon?.htmlUrl || d.icon?.dataUrl || null);
      runMeta[d.run.id] = { icon: serverIconUrl || null, ver: pendingVer, code: pendingCode, params: { ...requestPayload } };
      try {
        const sv = JSON.parse(localStorage.getItem(modeKey('rv'))||'{}');
        sv[d.run.id] = { ver: pendingVer, code: pendingCode, params: { ...requestPayload } };
        if (d.latestArtifact?.apkDownloadUrl) { runMeta[d.run.id].apk = d.latestArtifact.apkDownloadUrl; sv[d.run.id].apk = d.latestArtifact.apkDownloadUrl; }
        if (d.latestArtifact?.aabDownloadUrl) { runMeta[d.run.id].aab = d.latestArtifact.aabDownloadUrl; sv[d.run.id].aab = d.latestArtifact.aabDownloadUrl; }
        localStorage.setItem(modeKey('rv'),JSON.stringify(sv));
      } catch {}
      timers[d.run.id] = { start: Date.now(), total: (39 + (d.run.id % 12)) * 60 * 1000 };
      // prevent duplicate run if loadBuilds already added it
      var existing = runs.findIndex(function(r) { return r.id === d.run.id; });
      if (existing !== -1) runs.splice(existing, 1);
      runs = [d.run, ...runs];
      renderAll();
    } else {
      loadBuilds();
    }
    return d;
  } catch (err) {
    throw new Error(err.message || String(err));
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = "Собрать";
    }
  }
}

// i+1.0 algorithm: increment the leading integer of the version and reset to .0,
// and increment the version code by 1.
function bumpVersion(versionName, versionCode) {
  const s = String(versionName || "");
  const m = s.match(/(\d+)/);
  const n = m ? parseInt(m[1], 10) : 0;
  return {
    versionName: (n + 1) + ".0",
    versionCode: String((parseInt(versionCode, 10) || 0) + 1)
  };
}

function updateConfigVersion(appName, next) {
  const id = String(appName || "").toLowerCase().replace(/\s+/g, "-");
  const cfg = savedConfigs.find(c => c.id === id);
  if (!cfg) return;
  cfg.version_name = next.versionName;
  cfg.version_code = next.versionCode;
  try {
    const local = JSON.parse(localStorage.getItem(modeKey("savedConfigs")) || "[]");
    const lc = local.find(x => x.id === id);
    if (lc) { lc.version_name = next.versionName; lc.version_code = next.versionCode; }
    localStorage.setItem(modeKey("savedConfigs"), JSON.stringify(local));
  } catch {}
  try {
    fetch(`${apiBase}/api/configs`, { method: "POST", headers: op(), body: JSON.stringify({ config: { ...cfg, mode: mode || localStorage.getItem('builder_mode') || 'main' } }) });
  } catch {}
}

async function buildFromConfig(cfg, { useNextVersion = true, buildFormat = "apk_aab" } = {}) {
  const pkg = cfg.package_name || derivePackageNameFromRepo(cfg.game_repository) || "";
  if (!pkg) {
    throw new Error(`У конфига «${cfg.label || cfg.app_name || cfg.id || "?"}» не указан Package Name`);
  }
  const next = bumpVersion(cfg.version_name, cfg.version_code);
  const versionName = next.versionName;
  const versionCode = next.versionCode;
  const iconData = cfg.icon_data_url || cfg.icon_url || await resolveConfigIconDataUrl(cfg) || await getIconDataUrl(cfg.game_repository, "main");
  const firebaseBase64 = await loadFirebaseConfigBase64(cfg.firebase_cfg);
  const iconIsData = String(iconData || "").startsWith("data:");
  const d = await submitBuildPayload({
    game_repository: cfg.game_repository || "zey-win/plinko",
    game_ref: "main",
    app_name: cfg.app_name || cfg.label || "",
    package_name: pkg,
    build_format: buildFormat,
    version_mode: "manual",
    version_name: "1",
    version_code: "1",
    aab_version_name: versionName,
    aab_version_code: versionCode,
    zeywin_sdk_version: normalizeSdkVersion(cfg.zeywin_sdk_version || sdkVersion?.value || "v3.9.37"),
    zeywin_api_key: cfg.zeywin_api_key || "",
    admob_android_app_id: cfg.admob_app_id || "",
    admob_android_banner_id: cfg.admob_banner || "",
    admob_android_interstitial_id: cfg.admob_interstitial || "",
    admob_android_rewarded_id: cfg.admob_rewarded || "",
    iconDataUrl: iconIsData ? iconData : "",
    icon_png_path: iconIsData ? "" : (iconData || ""),
    firebaseJsonBase64: firebaseBase64 || ""
  }, { autoSave: false });
  updateConfigVersion(cfg.app_name || cfg.label, next);
  return d;
}

async function runBatchBuilds() {
  if (batchBuildRunning) return;
  if (!savedConfigs.length) {
    alert("Нет сохранённых конфигов");
    return;
  }

  batchBuildRunning = true;
  const progress = $("build-progress");
  const bpClose = $("bp-close");
  if (bpClose) bpClose.onclick = () => { progress?.classList.add("hidden"); };
  const steps = $("bp-steps");
  const formEl = $("build-form");
  const previousFormDisplay = formEl?.style.display || "";
  if (progress && steps) {
    progress.classList.remove("hidden");
    steps.innerHTML = "";
  }
  if (formEl) formEl.style.display = "none";

  const autoCloseTimer = setTimeout(() => { progress?.classList.add("hidden"); }, 60000);

  try {
    const lines = savedConfigs.map(cfg => {
      const line = document.createElement("div");
      line.className = "bp-active";
      const label = document.createElement("div");
      label.className = "bp-active-label";
      label.textContent = `⏳ ${cfg.label}`;
      const icon = document.createElement("img");
      icon.className = "bp-active-icon";
      const iconUrl = configIconUrl(cfg) || (cfg.package_name ? `${iconDir()}/${cfg.package_name}.png` : "");
      if (iconUrl) { icon.src = iconUrl; icon.alt = cfg.label || ""; }
      else { icon.style.display = "none"; }
      line.appendChild(label);
      line.appendChild(icon);
      steps?.appendChild(line);
      return { cfg, line, label };
    });

    await Promise.allSettled(
      lines.map(async ({ cfg, line, label }, i) => {
        await new Promise(r => setTimeout(r, i * 800));
        try {
          await withTimeout(
            buildFromConfig({ ...cfg, zeywin_sdk_version: "v3.9.37" }, { useNextVersion: true, buildFormat: "apk_aab" }),
            120000,
            `таймаут сборки «${cfg.label}»`
          );
          label.textContent = `✅ ${cfg.label}`;
        } catch (error) {
          label.textContent = `❌ ${cfg.label}: ${error.message}`;
        }
        line.classList.remove("bp-active");
        line.classList.add("bp-done");
      })
    );
  } finally {
    batchBuildRunning = false;
    clearTimeout(autoCloseTimer);
    if (formEl) formEl.style.display = previousFormDisplay;
    if (progress) {
      const doneLine = document.createElement("div");
      doneLine.style.cssText = "padding:10px 0;color:#3fb950;font-size:14px;font-weight:600";
      doneLine.textContent = "✅ Все сборки завершены";
      steps?.appendChild(doneLine);
      progress.classList.add("hidden");
    }
  }
}

repoSelect.addEventListener("change", () => { updateIcon(); syncVersionFields(true); });
const addRepoBtn = $("add-repo-btn");
if (addRepoBtn) {
  addRepoBtn.addEventListener("click", async () => {
    const val = prompt("Введите репозиторий в формате owner/name");
    if (!val) return;
    const repo = val.trim();
    if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { alert("Неверный формат. Используйте owner/name"); return; }
    if ([...repoSelect.options].some(o => o.value === repo)) { repoSelect.value = repo; updateIcon(); syncVersionFields(true); return; }
    const defaultLabel = repo.split("/").pop().replace(/-/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    const label = prompt("Название игры:", defaultLabel);
    if (!label) return;
    const pkg = prompt("Package name (например: com.playsocialgames.game):");
    if (!pkg) return;
    const id = repo.replace(/[^a-z0-9]/gi, "-").toLowerCase();
    const cfg = { id, label, game_repository: repo, app_name: label, package_name: pkg, version_mode: "auto_next" };
    savedConfigs = savedConfigs.filter(c => c.id !== id);
    savedConfigs.push(cfg);
    try { localStorage.setItem(modeKey("savedConfigs"), JSON.stringify(savedConfigs)); } catch {}
     try { await fetch(apiBase + "/api/configs", { method: "POST", headers: op(), body: JSON.stringify({ config: { ...cfg, mode: mode || localStorage.getItem('builder_mode') || 'main' } }) }); } catch {}
    const opt = document.createElement("option");
    opt.value = repo;
    opt.textContent = label;
    repoSelect.appendChild(opt);
    repoSelect.value = repo;
    updateIcon();
    syncVersionFields(true);
  });
}
newBuildBtn.addEventListener("click", () => {
  closeDetail();
  currentIconDataUrl = null; firebaseJson = null; userIconSet = false;
  form.style.display = "";
  $("build-progress").classList.add("hidden");
  if (sdkVersion) sdkVersion.value = sdkVersion.value || "v3.9.37";
  const all = form.querySelectorAll("label, .modal-actions, .form-row, .icon-format-row");
  all.forEach(el => { el.style.opacity = ""; el.style.transform = ""; el.style.transition = ""; });
  modal.classList.remove("hidden");
  updateIcon();
  iconLoadedDeferred = getIconDataUrl(repoSelect.value, "main").then(url => { if (url && !userIconSet) currentIconDataUrl = url; });
  syncVersionFields(true);
});
cancelBtn.addEventListener("click", () => { modal.classList.add("hidden"); closeDetail(); });
modal.addEventListener("click", e => { if (e.target === modal) { modal.classList.add("hidden"); closeDetail(); } });

const bpCloseBtn = $("bp-close");
if (bpCloseBtn) bpCloseBtn.addEventListener("click", () => $("build-progress").classList.add("hidden"));

// ----- Build detail / restart -----
let detailRunId = null;
let detailOriginal = null;

function snapshotFormParams() {
  const fd = new FormData(form);
  const get = n => fd.get(n) || "";
  return {
    game_repository: get("game_repository"),
    build_format: get("build_format"),
    version_name: get("version_name"),
    version_code: get("version_code"),
    fast_build: get("fast_build"),
    zeywin_sdk_version: get("zeywin_sdk_version"),
    app_name: get("app_name"),
    package_name: get("package_name"),
    zeywin_api_key: get("zeywin_api_key"),
    admob_android_app_id: get("admob_app_id"),
    admob_android_banner_id: get("admob_banner"),
    admob_android_interstitial_id: get("admob_interstitial"),
    admob_android_rewarded_id: get("admob_rewarded")
  };
}

function fillFormFromParams(params, runId) {
  const set = (name, val) => { const el = document.querySelector(`[name="${name}"]`); if (el && val != null) el.value = val; };
  const run = runs.find(r => r.id === runId);
  if (params) {
    set("game_repository", params.game_repository);
    set("build_format", params.build_format);
    set("version_name", params.aab_version_name || params.version_name);
    set("version_code", params.aab_version_code || params.version_code);
    set("fast_build", params.fast_build);
    set("zeywin_sdk_version", params.zeywin_sdk_version);
    set("app_name", params.app_name);
    set("package_name", params.package_name);
    set("zeywin_api_key", params.zeywin_api_key);
    set("admob_app_id", params.admob_android_app_id);
    set("admob_banner", params.admob_android_banner_id);
    set("admob_interstitial", params.admob_android_interstitial_id);
    set("admob_rewarded", params.admob_android_rewarded_id);
    const icon = params.iconDataUrl || params.icon_png_path || null;
    if (icon && String(icon).startsWith("data:")) { currentIconDataUrl = icon; userIconSet = true; setIcon(icon); }
    else if (params.game_repository) { getIconDataUrl(params.game_repository, "main").then(u => { if (u && !userIconSet) currentIconDataUrl = u; }); }
    firebaseJson = params.firebaseJsonBase64 || params.firebase_json_base64 || null;
  } else {
    const { app, pkg } = parseTitle(run?.displayTitle || run?.name || "");
    set("app_name", app);
    set("package_name", pkg);
    set("build_format", "apk_aab");
    set("version_name", runMeta[runId]?.ver || "1");
    set("version_code", runMeta[runId]?.code || "1");
    const ic = resolveIcon(run);
    if (ic) setIcon(ic);
    firebaseJson = null;
  }
  const st = $("firebase-status");
  if (st) { st.textContent = firebaseJson ? "✅ Firebase загружен" : ""; st.style.display = firebaseJson ? "inline" : "none"; }
  if ($("f-pkg")?.value) { $("f-pkg").dispatchEvent(new Event("input")); document.querySelectorAll(".pkg-hidden").forEach(el => el.classList.add("show")); }
  if (($("f-admob-app")?.value) || params?.admob_android_app_id) showAdmobFields();
  if (params?.game_repository) updateIcon();
  syncVersionFields(false);
  syncSdkVersionField(true).then(() => { const v = params?.zeywin_sdk_version; if (v && sdkVersion) sdkVersion.value = normalizeSdkVersion(v); });
}

function clearChangedFields() {
  form.querySelectorAll(".changed").forEach(el => el.classList.remove("changed"));
}

function markChangedFields() {
  if (!detailRunId || !detailOriginal) return;
  const cur = snapshotFormParams();
  const map = {
    game_repository: "game_repository", build_format: "build_format", version_name: "version_name",
    version_code: "version_code", fast_build: "fast_build", zeywin_sdk_version: "zeywin_sdk_version",
    app_name: "app_name", package_name: "package_name", zeywin_api_key: "zeywin_api_key",
    admob_android_app_id: "admob_app_id", admob_android_banner_id: "admob_banner",
    admob_android_interstitial_id: "admob_interstitial", admob_android_rewarded_id: "admob_rewarded"
  };
  for (const [origKey, fieldName] of Object.entries(map)) {
    const el = document.querySelector(`[name="${fieldName}"]`);
    if (!el) continue;
    const changed = String(cur[origKey] ?? "") !== String(detailOriginal[origKey] ?? "");
    el.classList.toggle("changed", changed);
  }
}

function openDetail(runId) {
  const meta = runMeta[runId];
  const params = meta?.params || null;
  detailRunId = runId;
  detailOriginal = params ? { ...params } : null;
  fillFormFromParams(params, runId);
  const banner = $("detail-banner");
  if (banner) { banner.style.display = ""; banner.textContent = `Перезапуск сборки #${runId} — изменённые поля подсвечены оранжевым`; }
  const submitBtn = $("modal-submit");
  if (submitBtn) { submitBtn.textContent = "Перезапустить"; submitBtn.classList.add("btn-restart"); }
  form.style.display = "";
  $("build-progress")?.classList.add("hidden");
  modal.classList.remove("hidden");
  clearChangedFields();
}

function closeDetail() {
  detailRunId = null;
  detailOriginal = null;
  const banner = $("detail-banner");
  if (banner) banner.style.display = "none";
  const submitBtn = $("modal-submit");
  if (submitBtn) { submitBtn.textContent = "Собрать"; submitBtn.classList.remove("btn-restart"); }
  clearChangedFields();
}

function restartBuild(runId) {
  openDetail(runId);
}

let _logTimer = null;
async function fetchJobLogs(runId) {
  try {
    var res = await fetch(apiBase + "/api/logs?run_id=" + runId, { headers: op() });
    if (!res.ok) return null;
    return await res.text();
  } catch { return null; }
}

function showBuildInfo(runId) {
  try {
    var run = runs.find(function(r) { return r.id === runId; });
    if (!run) return;
    var meta = runMeta[runId] || {};
    var params = meta.params || {};
    // fallback: fetch stored build inputs from API server
    if ((!params.app_name || !params.zeywin_api_key) && run.htmlUrl) {
      (function() {
        var match = run.htmlUrl.match(/\/actions\/runs\/(\d+)/);
        if (!match) return;
        fetch(apiBase + "/api/builds/" + match[1])
          .then(function(r) { return r.ok ? r.json() : null; })
          .then(function(data) {
            if (!data || !data.ok || !data.config) return;
            var cfg = data.config;
            if (!runMeta[runId]) runMeta[runId] = {};
            if (!runMeta[runId].params) runMeta[runId].params = {};
            for (var ck in cfg) {
              if (cfg[ck]) runMeta[runId].params[ck] = cfg[ck];
            }
            showBuildInfo(runId);
          }).catch(function(){});
      })();
    }
    // fallback: parse displayTitle for app/pkg/format when params empty
    if (!params.app_name || !params.package_name) {
      var parts = (run.displayTitle || "").split(" / ");
      if (parts.length >= 2) {
        if (!params.app_name) params.app_name = parts[0].replace(/^Android:\s*/i, "").trim();
        if (!params.package_name) params.package_name = parts[1].trim();
      }
      if (parts.length >= 3 && !params.build_format) params.build_format = parts[2].trim();
    }
    var iconUrl = meta.icon || resolveIcon(run) || "";
    var url = run.htmlUrl || "";
    var isActive = ["in_progress","pending","queued","waiting"].indexOf(run.status) !== -1;
    // dynamic fields from params — show EVERYTHING user entered
    var fieldMap = {
      app_name: "Название",
      package_name: "Package",
      game_repository: "Репозиторий",
      game_ref: "Ветка",
      build_format: "Формат",
      version_name: "Версия",
      version_code: "Версия код",
      zeywin_sdk_version: "SDK",
      zeywin_api_key: "API Key",
      admob_android_app_id: "AdMob App ID",
      admob_android_banner_id: "AdMob Banner",
      admob_android_interstitial_id: "AdMob Interstitial",
      admob_android_rewarded_id: "AdMob Rewarded",
      version_mode: "Режим версии"
    };
    var fields = [];
    for (var key in fieldMap) {
      var val = params[key];
      if (key === "version_name") {
        if (!val || val === "1") val = meta.ver || "";
      } else if (key === "version_code") {
        if (!val || val === "1") val = meta.code || "";
      }
      if (val && val !== "1") fields.push([fieldMap[key], val]);
    }
    fields.push(["Статус", run.status || ""]);
    fields.push(["# сборки", String(run.runNumber || run.run_number || "")]);
    var html = '<div style="display:flex;gap:12px;margin-bottom:12px">';
    if (iconUrl) html += '<img src="' + iconUrl + '" style="width:64px;height:64px;border-radius:12px;flex-shrink:0;object-fit:cover" alt="">';
    html += '<div style="flex:1;min-width:0">';
    html += '<div style="font-size:18px;font-weight:700;color:#f0f6fc;margin-bottom:4px">' + esc(params.app_name || run.displayTitle || "") + '</div>';
    html += '<div style="font-size:13px;color:#8b949e">' + esc(params.package_name || "") + '</div>';
    html += '</div></div>';
    html += '<table style="width:100%;font-size:13px;border-collapse:collapse">';
    for (var i = 0; i < fields.length; i++) {
      var k = fields[i][0], v = fields[i][1];
      if (!v) continue;
      html += '<tr><td style="padding:3px 8px 3px 0;color:#8b949e;white-space:nowrap;vertical-align:top">' + k + '</td><td style="padding:3px 0;color:#c9d1d9;word-break:break-all">' + esc(v) + '</td></tr>';
    }
    html += '</table>';
    if (url) html += '<div style="margin-top:10px"><a href="' + esc(url) + '" target="_blank" style="color:#58a6ff;font-size:13px">Открыть на GitHub →</a></div>';
    html += '<div style="margin-top:12px;display:flex;gap:6px;flex-wrap:wrap">';
    html += '<button onclick="document.getElementById(\'detail-modal\').classList.add(\'hidden\');clearInterval(_logTimer);openDetail(' + runId + ')" style="padding:6px 12px;background:#238636;border:none;border-radius:6px;color:#fff;cursor:pointer;font-size:13px">Перезапустить</button>';
    html += '<button onclick="document.getElementById(\'detail-modal\').classList.add(\'hidden\');clearInterval(_logTimer)" style="padding:6px 12px;background:#30363d;border:none;border-radius:6px;color:#c9d1d9;cursor:pointer;font-size:13px">Закрыть</button>';
    html += '</div>';
    if (isActive) {
      html += '<div style="margin-top:12px"><div style="font-size:13px;font-weight:600;color:#ffd700;margin-bottom:4px">📋 Логи сборки:</div><pre id="dm-logs" style="background:#0d1117;border:1px solid #30363d;border-radius:6px;padding:8px;font-size:11px;line-height:1.4;max-height:300px;overflow-y:auto;color:#c9d1d9;white-space:pre-wrap;word-break:break-all">Загрузка...</pre></div>';
    }
    document.getElementById("dm-content").innerHTML = html;
    document.getElementById("detail-modal").classList.remove("hidden");
    if (isActive) {
      clearInterval(_logTimer);
      var logsEl = document.getElementById("dm-logs");
      function pollLogs() {
        fetchJobLogs(runId).then(function(text) {
          if (text && logsEl) logsEl.textContent = text;
        });
      }
      pollLogs();
      _logTimer = setInterval(pollLogs, 7000);
    }
  } catch(e) { console.error(e); }
}

document.getElementById("dm-close").addEventListener("click", function() {
  document.getElementById("detail-modal").classList.add("hidden");
  clearInterval(_logTimer);
});
document.getElementById("detail-modal").addEventListener("click", function(e) {
  if (e.target === e.currentTarget) {
    document.getElementById("detail-modal").classList.add("hidden");
    clearInterval(_logTimer);
  }
});

document.addEventListener("click", function(e) {
  var card = e.target.closest(".build-card");
  if (!card) return;
  if (e.target.closest("a, button, .del-btn")) return;
  var id = Number(card.dataset.id);
  if (id) showBuildInfo(id);
});

form.addEventListener("input", markChangedFields);

form.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(form);
  if (!currentIconDataUrl && iconLoadedDeferred) {
    try { const url = await iconLoadedDeferred; if (url) currentIconDataUrl = url; } catch {}
  }
  const iconRaw = currentIconDataUrl || "";
  if (!iconRaw) { alert("Загрузите иконку приложения (PNG). Без неё сборка невозможна."); return; }
  const iconIsData = iconRaw.startsWith("data:");
  const buildFormat = fd.get("build_format") || "apk";
  const pkg = fd.get("package_name") || derivePackageNameFromRepo(fd.get("game_repository")) || "";
  if (!pkg) { alert("Укажите Package Name (имя пакета)."); return; }
  if (!fd.get("package_name")) { const pe = document.querySelector('[name="package_name"]'); if (pe) pe.value = pkg; }
  const p = {
    game_repository: fd.get("game_repository") || "zey-win/plinko",
    game_ref: fd.get("game_ref") || "main",
    app_name: fd.get("app_name") || "",
    package_name: pkg,
    build_format: buildFormat,
    version_mode: fd.get("version_mode") || "auto_next",
    version_name: fd.get("version_name") || "1",
    version_code: fd.get("version_code") || "1",
    aab_version_name: fd.get("version_name") || "1",
    aab_version_code: fd.get("version_code") || "1",
    zeywin_sdk_version: fd.get("zeywin_sdk_version") || sdkVersion?.value || "v3.9.37",
    zeywin_api_key: fd.get("zeywin_api_key") || "",
    admob_android_app_id: fd.get("admob_app_id") || "",
    admob_android_banner_id: fd.get("admob_banner") || "",
    admob_android_interstitial_id: fd.get("admob_interstitial") || "",
    admob_android_rewarded_id: fd.get("admob_rewarded") || "",
    iconDataUrl: iconIsData ? iconRaw : "",
    icon_png_path: iconIsData ? "" : iconRaw,
    firebaseJsonBase64: firebaseJson || ""
  };
  const restarting = !!detailRunId;
  if (restarting) {
    const oldRun = runs.find(r => r.id === detailRunId);
    if (oldRun && oldRun.status !== "completed") {
      try { await fetch(`${apiBase}/api/cancel`, { method: "POST", headers: op(), body: JSON.stringify({ run_id: oldRun.id }) }); } catch {}
    }
    const original = runMeta[detailRunId]?.params || {};
    p.game_repository = fd.get("game_repository") || original.game_repository || "zey-win/plinko";
    p.game_ref = original.game_ref || "main";
    p.version_mode = original.version_mode || "auto_next";
    p.signing_profile = original.signing_profile || "playmax";
    const restartIcon = currentIconDataUrl || original.iconDataUrl || original.icon_png_path || "";
    p.iconDataUrl = restartIcon.startsWith("data:") ? restartIcon : "";
    p.icon_png_path = restartIcon.startsWith("data:") ? "" : restartIcon;
    p.firebaseJsonBase64 = firebaseJson || original.firebaseJsonBase64 || original.firebase_json_base64 || "";
  }
  try {
    const d = await submitBuildPayload(p);
    if (d.run) {
      const latestVersion = p.aab_version_name || p.version_name || "";
      const latestCode = p.aab_version_code || p.version_code || "";
      runMeta[d.run.id] = { ...(runMeta[d.run.id] || {}), ver: latestVersion, code: latestCode };
    }
    autoSaveConfig(fd);
    iconLoadedDeferred = null;
    modal.classList.add("hidden");
    form.style.display = "";
    $("build-progress")?.classList.add("hidden");
    form.querySelectorAll("label, .modal-actions, .form-row, .icon-format-row").forEach(el => { el.style.opacity = ""; el.style.transform = ""; });
    closeDetail();
  } catch (err) { alert("Ошибка: " + err.message); }
});

// ----- Configs: hierarchical dropdown (grouped by game repository) -----
configTreeState = {};

function buildConfigTree() {
  const groups = new Map();
  for (const c of savedConfigs) {
    const repo = c.game_repository || "unknown";
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo).push(c);
  }
  return groups;
}

function renderConfigDropdown() {
  const list = $("config-list");
  if (!list) return;
  list.innerHTML = "";
  
  // Toolbar
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #21262d;background:#0d1117;position:sticky;top:0;z-index:1";
  
  const expandAllBtn = document.createElement("button");
  expandAllBtn.type = "button";
  expandAllBtn.textContent = "▼ Развернуть все";
  expandAllBtn.style.cssText = "padding:6px 8px;background:#21262d;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font-size:12px;cursor:pointer";
  expandAllBtn.onclick = (e) => { e.stopPropagation(); expandAllGroups(true); };
  toolbar.appendChild(expandAllBtn);
  
  const collapseAllBtn = document.createElement("button");
  collapseAllBtn.type = "button";
  collapseAllBtn.textContent = "▲ Свернуть все";
  collapseAllBtn.style.cssText = "padding:6px 8px;background:#21262d;border:1px solid #30363d;border-radius:4px;color:#c9d1d9;font-size:12px;cursor:pointer";
  collapseAllBtn.onclick = (e) => { e.stopPropagation(); expandAllGroups(false); };
  toolbar.appendChild(collapseAllBtn);
  
  const batchBtn = document.createElement("button");
  batchBtn.type = "button";
  batchBtn.textContent = "🚀 Собрать и Обновить Всё";
  batchBtn.style.cssText = "flex:1;padding:7px 8px;background:#238636;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer";
  batchBtn.onclick = async (e) => { e.stopPropagation(); closeDropdown(); await runBatchBuilds(); };
  toolbar.appendChild(batchBtn);
  
  const hint = document.createElement("span");
  hint.textContent = "APK=v1, AAB=i+1";
  hint.style.cssText = "color:#8b949e;font-size:11px;white-space:nowrap";
  toolbar.appendChild(hint);
  list.appendChild(toolbar);
  
  const groups = buildConfigTree();
  if (groups.size === 0) {
    list.innerHTML += '<div style="padding:8px;color:#8b949e;font-size:13px">Нет сохранённых конфигов</div>';
    return;
  }
  
  for (const [repo, configs] of groups.entries()) {
    const repoShort = repo.split("/").pop() || repo;
    const groupId = `group-${repo.replace(/[^a-z0-9]/gi, "-")}`;
    const isExpanded = configTreeState[groupId] !== false; // default expanded
    
    // Group header
    const header = document.createElement("div");
    header.style.cssText = "display:flex;align-items:center;padding:6px 10px;cursor:pointer;background:#161b22;border-bottom:1px solid #21262d;font-size:13px;font-weight:600;color:#f0f6fc;user-select:none";
    header.innerHTML = `
      <span style="width:16px;display:flex;align-items:center;justify-content:center;color:#8b949e;font-size:10px">${isExpanded ? "▼" : "▶"}</span>
      <span style="flex:1">${esc(repoShort)}</span>
      <span style="color:#8b949e;font-size:11px;font-weight:400">${configs.length} конфиг${configs.length === 1 ? "" : configs.length < 5 ? "а" : "ов"}</span>
    `;
    header.onclick = () => {
      configTreeState[groupId] = !configTreeState[groupId];
      renderConfigDropdown();
    };
    header.onmouseenter = () => { header.style.background = "#1c2333"; };
    header.onmouseleave = () => { header.style.background = ""; };
    list.appendChild(header);
    
    // Group items (configs)
    if (isExpanded) {
      for (const c of configs) {
        const item = document.createElement("div");
        item.style.cssText = "display:flex;align-items:center;padding:6px 10px 6px 36px;cursor:pointer;border-bottom:1px solid #21262d;font-size:13px;background:#0d1117";
        item.onmouseenter = () => { item.style.background = "#1c2333"; };
        item.onmouseleave = () => { item.style.background = "#0d1117"; };
        
        const iconUrl = c.icon_url || c.icon_data_url || "";
        const iconHtml = iconUrl 
          ? `<img src="${esc(iconUrl)}" style="width:20px;height:20px;border-radius:4px;margin-right:8px;object-fit:cover;flex-shrink:0" alt="">`
          : `<span style="width:20px;height:20px;margin-right:8px;display:flex;align-items:center;justify-content:center;background:#21262d;border-radius:4px;color:#8b949e;font-size:12px;flex-shrink:0">🎮</span>`;
        
        item.innerHTML = `${iconHtml}<span style="flex:1;color:#c9d1d9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(c.label || c.app_name || c.id)}</span><span style="color:#8b949e;font-size:11px;margin-right:8px">${esc(c.package_name || "")}</span>`;
        
        const del = document.createElement("button");
        del.type = "button";
        del.textContent = "✕";
        del.title = "Удалить";
        del.style.cssText = "background:none;border:none;color:#ff4444;cursor:pointer;font-size:12px;padding:2px 6px;border-radius:3px;flex-shrink:0";
        del.onmouseenter = () => { del.style.background = "#ff444422"; };
        del.onmouseleave = () => { del.style.background = "none"; };
        del.onclick = async (e) => {
          e.stopPropagation();
          if (!confirm(`Удалить "${c.label}"?`)) return;
          const id = c.id;
          savedConfigs = savedConfigs.filter(x => x.id !== id);
          try {
            const local = JSON.parse(localStorage.getItem(modeKey("savedConfigs")) || "[]");
            localStorage.setItem(modeKey("savedConfigs"), JSON.stringify(local.filter(x => x.id !== id)));
          } catch {}
          try {
            await fetch(`${apiBase}/api/configs`, { method: "DELETE", headers: op(), body: JSON.stringify({ id }) });
          } catch {}
          if (selectedConfigId === id) selectedConfigId = null;
          renderConfigDropdown();
        };
        item.appendChild(del);
        item.onclick = () => { fillConfig(c.id); closeDropdown(); };
        list.appendChild(item);
      }
    }
  }
}

function expandAllGroups(expand) {
  const groups = buildConfigTree();
  for (const [repo] of groups.entries()) {
    const groupId = `group-${repo.replace(/[^a-z0-9]/gi, "-")}`;
    configTreeState[groupId] = expand;
  }
  renderConfigDropdown();
}

function closeDropdown() {
  const list = $("config-list");
  if (list) list.style.display = "none";
}

function toggleDropdown() {
  const list = $("config-list");
  if (!list) return;
  list.style.display = list.style.display === "none" ? "block" : "none";
  if (list.style.display === "block") renderConfigDropdown();
}

async function loadConfigs() {
  // Read device-local configs FIRST (before any overwrite) so we can re-sync them
  let local = [];
  try { local = JSON.parse(localStorage.getItem(modeKey("savedConfigs")) || "[]"); } catch {}

  // Load shared configs from backend (synced across devices)
  let backendConfigs = null;
  let backendDeleted = [];
  try {
    const res = await fetch(`${apiBase}/api/configs`, { headers: op() });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.configs)) backendConfigs = data.configs;
      if (Array.isArray(data.deleted)) backendDeleted = data.deleted;
    }
  } catch {}

  if (backendConfigs) {
    const currentMode = mode || localStorage.getItem('builder_mode') || 'main';
    const modeBackend = backendConfigs.filter((c) => {
      const cm = c.mode || c._mode;
      return !cm || cm === currentMode;
    });
    savedConfigs = modeBackend;
  } else {
    try {
      const res = await fetch("./configs.json?" + Date.now());
      if (res.ok) { const data = await res.json(); savedConfigs = data.configs || []; }
    } catch {}
  }

  const deletedSet = new Set(backendDeleted);
  // Merge locally-saved configs (per-device fallback)
  let localOnly = [];
  for (const lc of local) {
    // A config deleted on another device must NOT be re-pushed; purge it locally
    if (deletedSet.has(lc.id)) {
      try {
        const lst = JSON.parse(localStorage.getItem(modeKey("savedConfigs")) || "[]").filter((x) => x.id !== lc.id);
        localStorage.setItem(modeKey("savedConfigs"), JSON.stringify(lst));
      } catch {}
      continue;
    }
    if (!savedConfigs.some((c) => c.id === lc.id)) {
      savedConfigs.push(lc);
      localOnly.push(lc);
    }
  }
  // Persist the merged set locally
  try { localStorage.setItem(modeKey("savedConfigs"), JSON.stringify(savedConfigs)); } catch {}

  // Push device-local configs up to the backend so they appear on all devices
  if (backendConfigs && localOnly.length) {
    for (const cfg of localOnly) {
      try {
        await fetch(`${apiBase}/api/configs`, { method: "POST", headers: op(), body: JSON.stringify({ config: { ...cfg, mode: mode || localStorage.getItem('builder_mode') || 'main' } }) });
      } catch {}
    }
  }
  // Sync repoSelect dropdown with savedConfigs (add dynamic options)
  const currentVal = repoSelect.value;
  for (const c of savedConfigs) {
    if (c.game_repository && ![...repoSelect.options].some(o => o.value === c.game_repository)) {
      const opt = document.createElement("option");
      opt.value = c.game_repository;
      opt.textContent = c.app_name || c.label || c.game_repository.split("/").pop();
      repoSelect.appendChild(opt);
    }
  }
  if (currentVal && [...repoSelect.options].some(o => o.value === currentVal)) repoSelect.value = currentVal;
}

function buildConfigTree() {
  const groups = new Map();
  for (const c of savedConfigs) {
    const repo = c.game_repository || "unknown";
    if (!groups.has(repo)) groups.set(repo, []);
    groups.get(repo).push(c);
  }
  // Sort groups by repo name
  const sorted = new Map([...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])));
  // Sort configs within each group by label
  for (const [, configs] of sorted) {
    configs.sort((a, b) => (a.label || a.app_name || "").localeCompare(b.label || b.app_name || ""));
  }
  return sorted;
}

function fillConfig(configId) {
  const cfg = savedConfigs.find(c => c.id === configId);
  if (!cfg) return;
  selectedConfigId = configId;
  const fields = {
    game_repository: cfg.game_repository,
    app_name: cfg.app_name,
    package_name: cfg.package_name,
    version_name: cfg.version_name,
    version_code: cfg.version_code,
    version_mode: cfg.version_mode || "auto_next",
    zeywin_sdk_version: cfg.zeywin_sdk_version || "",
    zeywin_api_key: cfg.zeywin_api_key,
    admob_app_id: cfg.admob_app_id,
    admob_banner: cfg.admob_banner,
    admob_interstitial: cfg.admob_interstitial,
    admob_rewarded: cfg.admob_rewarded
  };
  for (const [name, val] of Object.entries(fields)) {
    const el = document.querySelector(`[name="${name}"]`);
    if (el) el.value = val || "";
  }
  // Trigger reveal hidden fields
  if (cfg.package_name) $("f-pkg").dispatchEvent(new Event("input"));
  if (cfg.admob_app_id) $("f-admob-app").dispatchEvent(new Event("input"));
  if (cfg.zeywin_api_key) document.querySelectorAll(".pkg-hidden").forEach(el => el.classList.add("show"));
  // Load google-services.json
  if (cfg.firebase_cfg) {
    const fc = cfg.firebase_cfg;
    // Inline data URL — decode directly without fetching a file.
    if (fc.startsWith("data:")) {
      firebaseJson = fc.includes(",") ? fc.split(",").pop() : fc;
      const st = $("firebase-status");
      if (st) { st.textContent = "✅ Firebase загружен"; st.style.display = "inline"; }
    } else {
      fetch(`./firebase-cfg/${fc}`)
        .then(r => r.ok ? r.text() : null)
        .then(text => {
          if (text) {
            firebaseJson = btoa(unescape(encodeURIComponent(text)));
            const st = $("firebase-status");
            if (st) { st.textContent = "✅ Firebase загружен"; st.style.display = "inline"; }
          }
        }).catch(() => {});
    }
  } else {
    firebaseJson = null;
    const st = $("firebase-status");
    if (st) { st.textContent = ""; st.style.display = "none"; }
  }
  // Load icon
  const cfgIcon = cfg.icon_url || cfg.icon_data_url;
  if (cfgIcon) {
    currentIconDataUrl = cfgIcon;
    setIcon(cfgIcon);
  } else {
    resolveConfigIconDataUrl(cfg).then(url => {
      if (url) { currentIconDataUrl = url; setIcon(url); }
      else getIconDataUrl(cfg.game_repository, "main").then(u => { if (u) currentIconDataUrl = u; });
    });
  }
  syncVersionFields(true);
  syncSdkVersionField(true).then(() => {
    if (cfg.zeywin_sdk_version && sdkVersion) sdkVersion.value = normalizeSdkVersion(cfg.zeywin_sdk_version);
  });
  const trigger = $("config-trigger");
  if (trigger) trigger.textContent = "📜 " + cfg.label;
}

// Auto-save current form data as a config after successful build
async function autoSaveConfig(fd) {
  const repo = fd.get("game_repository") || "";
  const pkg = fd.get("package_name") || "";
  const appLabel = fd.get("app_name") || "";
  const label = appLabel || repo || "Без имени";
  const id = label.toLowerCase().replace(/[^a-z0-9а-я._-]/gi, "-").replace(/-+/g, "-");
  const iconPath = fd.get("icon_png_path") || "";
  const cfg = {
    id: id,
    label: label,
    game_repository: repo || "zey-win/plinko",
    app_name: appLabel,
    package_name: pkg,
    version_name: fd.get("version_name") || "1",
    version_code: fd.get("version_code") || "1",
    version_mode: fd.get("version_mode") || "auto_next",
    zeywin_sdk_version: fd.get("zeywin_sdk_version") || sdkVersion?.value || "v3.9.37",
    zeywin_api_key: fd.get("zeywin_api_key") || "",
    admob_app_id: fd.get("admob_app_id") || "",
    admob_banner: fd.get("admob_banner") || "",
    admob_interstitial: fd.get("admob_interstitial") || "",
    admob_rewarded: fd.get("admob_rewarded") || "",
    icon_path: iconPath || "",
    icon_url: currentIconDataUrl && currentIconDataUrl.startsWith("http") ? currentIconDataUrl : "",
    icon_data_url: currentIconDataUrl && currentIconDataUrl.startsWith("data:") ? currentIconDataUrl : "",
    firebase_cfg: firebaseJson || "",
    firebase_json_base64: firebaseJson || ""
  };
  if (!savedConfigs.some(c => c.id === id)) savedConfigs.push(cfg);
  // Persist to localStorage (per-device fallback)
  try {
    const local = JSON.parse(localStorage.getItem(modeKey("savedConfigs")) || "[]");
    if (!local.some(x => x.id === id)) {
      local.push(cfg);
      localStorage.setItem(modeKey("savedConfigs"), JSON.stringify(local));
    }
  } catch {}
  // Persist to backend so configs are shared across devices
  try {
    await fetch(`${apiBase}/api/configs`, {
      method: "POST",
      headers: op(),
      body: JSON.stringify({ config: { ...cfg, mode: mode || localStorage.getItem('builder_mode') || 'main' } })
    });
    // Reload from server so UI shows canonical state immediately
    const r = await fetch(`${apiBase}/api/configs`, { headers: op() });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data.configs)) {
        savedConfigs = data.configs;
        try { localStorage.setItem(modeKey("savedConfigs"), JSON.stringify(savedConfigs)); } catch {}
        renderConfigDropdown();
      }
    }
  } catch {}
}

// Dropdown trigger click
$("config-trigger").addEventListener("click", (e) => { e.stopPropagation(); toggleDropdown(); });
// Close on outside click
document.addEventListener("click", e => {
  const dd = $("config-dropdown");
  if (dd && !dd.contains(e.target)) closeDropdown();
});

// ----- Step buttons -----
document.addEventListener("click", e => {
  const btn = e.target.closest(".step-btn");
  if (!btn) return;
  const el = document.getElementById(btn.dataset.target);
  if (!el) return;
  const step = parseFloat(btn.dataset.step) || 1;
  const dir = parseInt(btn.dataset.dir) || 1;
  const cur = parseFloat(el.value) || 0;
  const nxt = Math.round((cur + dir * step) * 100) / 100;
  el.value = nxt < 0 ? 0 : nxt;
});

// ----- AdMob auto-split on paste + reveal hidden fields -----
$("f-admob-app").addEventListener("paste", e => {
  const text = (e.clipboardData || window.clipboardData).getData("text");
  const ids = text.split(/[\n\t,;]+/).map(s => s.trim()).filter(Boolean);
  if (ids.length >= 4) {
    e.preventDefault();
    document.querySelector('[name="admob_app_id"]').value = ids[0];
    document.querySelector('[name="admob_banner"]').value = ids[1];
    document.querySelector('[name="admob_interstitial"]').value = ids[2];
    document.querySelector('[name="admob_rewarded"]').value = ids[3];
  }
  showAdmobFields();
});
$("f-admob-app").addEventListener("input", () => {
  if ($("f-admob-app").value) showAdmobFields();
});

function showAdmobFields() {
  document.querySelectorAll(".admob-field").forEach(el => el.classList.add("show"));
}

// ----- Package name reveals extra fields -----
$("f-pkg").addEventListener("input", function() {
  if (this.value) document.querySelectorAll(".pkg-hidden").forEach(el => el.classList.add("show"));
  debouncedSyncVersionFields();
});

// ----- all-txt-paste: parse entire data block into app_name field -----
$("f-app-name").addEventListener("paste", e => {
  const text = (e.clipboardData || window.clipboardData).getData("text").trim();
  if (!text) return;
  const map = {
    app_name: ["app", "name", "название", "имя", "title"],
    package_name: ["package", "pkg", "code", "bundle", "com."],
    version_name: ["version", "верс", "v"],
    version_code: ["code", "version code", "код"],
    zeywin_api_key: ["zeywin", "key", "api key", "zw_"],
    admob_app_id: ["admob app", "admob id", "ca-app-pub-...~"],
    admob_banner: ["banner"],
    admob_interstitial: ["interstitial", "inter"],
    admob_rewarded: ["rewarded", "reward"]
  };

  // Try JSON first
  try {
    const json = JSON.parse(text);
    const fields = document.querySelectorAll("#build-form input, #build-form select");
    for (const field of fields) {
      const name = field.name;
      if (json[name] !== undefined) field.value = json[name];
    }
    return;
  } catch {}

  // Try key: value lines
  const lines = text.split("\n").filter(l => l.includes(":") || l.includes("="));
  if (lines.length < 2) return;
  e.preventDefault();
  for (const line of lines) {
    const sep = line.includes("=") ? "=" : ":";
    const idx = line.indexOf(sep);
    if (idx < 0) continue;
    let key = line.slice(0, idx).trim().toLowerCase();
    let val = line.slice(idx + 1).trim();
    // find matching field
    for (const [fieldName, aliases] of Object.entries(map)) {
      if (aliases.some(a => key.includes(a))) {
        const el = document.querySelector(`[name="${fieldName}"]`);
        if (el) el.value = val;
        break;
      }
    }
  }
});

// ----- Startup -----
const stopTimerLoop = startTimerLoop();
syncSdkVersionField(true);
showPageSpinner();

(async () => {
  updateIcon();
  loadBuilds();
  loadConfigs();
  setInterval(loadBuilds, 5000);
  setTimeout(loadReleases, 10);
})();

function populateRepoSelect() {
  const names = getRepoNames();
  const currentVal = repoSelect.value;
  repoSelect.innerHTML = "";
  for (const [repo, label] of Object.entries(names)) {
    const opt = document.createElement("option");
    opt.value = repo;
    opt.textContent = label;
    repoSelect.appendChild(opt);
  }
  if ([...repoSelect.options].some(o => o.value === currentVal)) repoSelect.value = currentVal;
}

function cleanupLocalStorage() {
  try {
    const prefixes = ['savedConfigs', 'rv'];
    for (const key of Object.keys(localStorage)) {
      if (prefixes.some(p => key.includes(p))) {
        localStorage.removeItem(key);
      }
    }
  } catch {}
}

function toggleMode() {
  mode = mode === "main" ? "admin" : "main";
  try {
    localStorage.setItem('builder_mode', mode);
  } catch (e) {
    if (e.name === 'QuotaExceededError') {
      cleanupLocalStorage();
      try { localStorage.setItem('builder_mode', mode); } catch {}
    }
  }
  startModeTransition();
  const local = JSON.parse(localStorage.getItem(modeKey("savedConfigs")) || "[]");
  savedConfigs.length = 0;
  savedConfigs.push(...local);
  populateRepoSelect();
  if (!modal?.classList.contains("hidden")) modal.classList.add("hidden");

  buildsContainer.innerHTML = "";
  activeContainer.innerHTML = "";
  runs.length = 0;
  renderAll();
  showPageSpinner();

  loadBuilds();
  loadConfigs();
}

function startModeTransition() {
  const isAdmin = mode === "admin";
  const modeLabel = isAdmin ? "админка" : "сайт";
  const glow = document.createElement("div");
  glow.id = "mode-glow";
  glow.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:99999;opacity:0;transition:opacity 0.3s;box-shadow:inset 0 0 100px rgba(88,166,255,0.5), inset 0 0 200px rgba(168,85,247,0.3);filter:blur(40px)";
  document.body.appendChild(glow);
  requestAnimationFrame(() => { glow.style.opacity = "1"; });

  const panel = document.createElement("div");
  panel.id = "mode-loading-panel";
  panel.style.cssText = "position:fixed;bottom:0;left:0;right:0;z-index:99998;background:rgba(22,27,34,0.95);border-top:1px solid #30363d;padding:16px 20px;transform:translateY(100%);transition:transform 0.4s ease-out;backdrop-filter:blur(10px)";
  panel.innerHTML = `<div style="max-width:600px;margin:0 auto"><div style="color:#8b949e;font-size:13px">Загрузка режима "${modeLabel}"...</div></div>`;
  document.body.appendChild(panel);
  requestAnimationFrame(() => { panel.style.transform = "translateY(0)"; });

  setTimeout(() => {
    if (panel) {
      panel.style.transform = "translateY(100%)";
      panel.style.opacity = "0";
      panel.style.transition = "transform 0.4s ease-in, opacity 0.4s ease-in";
      setTimeout(() => panel.remove(), 500);
    }
    if (glow) {
      glow.style.opacity = "0";
      glow.style.transition = "opacity 0.8s ease-out";
      setTimeout(() => glow.remove(), 900);
    }
    updateModeTheme();
  }, 800);
}

function updateModeTheme() {
  const btn = document.getElementById("mode-toggle");
  if (btn) {
    btn.textContent = mode === "admin" ? "сайт" : "админка";
  }
}

(function() {
  const btn = document.createElement("button");
  btn.id = "mode-toggle";
  btn.textContent = mode === "admin" ? "сайт" : "админка";
  btn.style.cssText = "position:fixed;bottom:8px;right:8px;z-index:9999;border:none;border-radius:4px;padding:2px 5px;font-size:6px;cursor:pointer;opacity:.75;transition:all 0.3s";
  btn.onmouseenter = function() { this.style.opacity = "1"; };
  btn.onmouseleave = function() { this.style.opacity = ".75"; };
  btn.onclick = toggleMode;
  document.body.appendChild(btn);
  updateModeTheme();
})();

function renderSkeletons() {
  buildsContainer.style.display = "";
  activeContainer.style.display = "none";
  buildsContainer.innerHTML = '<div class="skeleton-card"></div>'.repeat(20);
}



// ===== VISITOR TRACKING =====
async function trackVisitor() {
  try {
    const apiBase = document.querySelector('meta[name="builder-api"]')?.content?.replace(/\/$/, '') || "https://android-builder-api.vercel.app";
    await fetch(`${apiBase}/api/stats/visitor-counts`, { method: 'GET', headers: { 'Content-Type': 'application/json' } });
  } catch (e) {
    // Silently fail - tracking is optional
  }
}

// Track visitor on page load
if (document.readyState === 'complete' || document.readyState === 'interactive') {
  trackVisitor();
} else {
  document.addEventListener('DOMContentLoaded', trackVisitor);
}

