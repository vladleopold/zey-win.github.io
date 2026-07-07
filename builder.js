const apiBase = document.querySelector('meta[name="builder-api"]')?.content?.replace(/\/$/, "") || "https://zeywin-android-builder-api.vercel.app";
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
const branchSelect = $("branch-select");
const gameIcon = $("game-icon");
const iconSpinner = $("icon-spinner");
const iconFile = $("icon-file");
const firebaseFile = $("firebase-file");
const versionMode = $("version-mode");
const loading = $("loading");

const BRANCHES = { "zey-win/plinko": [{ ref: "main", label: "Plinko" }] };
const DEFAULT_BRANCHES = [{ ref: "main", label: "main" }];
const REPO_NAMES = { "zey-win/plinko": "plinko", "zey-win/blackjack": "blackjack", "zey-win/roulette": "roulette", "zey-win/dragon-tiger": "dragon tiger", "zey-win/baccarat-tiger": "baccarat", "zey-win/wheel-of-fortune": "lucky wheel", "zey-win/Unstopable": "unstopable", "zey-win/SlotSpot": "slotspot" };
const REPO_ICONS = {
  "zey-win/plinko": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/plinko.png",
  "zey-win/plinko@app/plinko-real-money": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__plinkorm.png",
  "zey-win/plinko@app/plinko": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/plinko.png",
  "zey-win/plinko@main": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__plinkofaling.png",
  "zey-win/blackjack": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__blackjack.png",
  "zey-win/roulette": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__roulette.png",
  "zey-win/dragon-tiger": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/plinko.png",
  "zey-win/baccarat-tiger": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__baccarat-tiger.png",
  "zey-win/wheel-of-fortune": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__wheel-of-fortune.png",
  "zey-win/Unstopable": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__Unstopable.png",
  "zey-win/SlotSpot": "https://raw.githubusercontent.com/zey-win/zey-win.github.io/main/repo-icons/zey-win__SlotSpot.png"
};

let runMeta = {}, releases = [], firebaseJson = null, currentIconDataUrl = null, iconLoadedDeferred = null;
let savedConfigs = [], selectedConfigId = null;
const versionCache = new Map();
const firebaseCache = new Map();
let batchBuildRunning = false;
let runs = [];

function repoFromTitle(t) { const s = (t || "").toLowerCase().replace(/[^a-z0-9 ]/g, " "); for (const [repo, name] of Object.entries(REPO_NAMES)) if (s.includes(name)) return repo; return null; }
function parseTitle(title) { if (!title) return { app: "Build", pkg: "" }; const parts = title.replace(/^Android:\s*/i, "").split(" / ").map(p => p.trim()); return { app: parts[0] || "Build", pkg: parts[1] || "" }; }
function esc(s) { const d = document.createElement("div"); d.textContent = s; return d.innerHTML; }

function showIconSpinner() { gameIcon.style.display = "none"; iconSpinner.style.display = "block"; }
function hideIconSpinner() { iconSpinner.style.display = "none"; }
function setIcon(src) { if (src) { gameIcon.src = src; gameIcon.style.display = "block"; } else gameIcon.style.display = "none"; hideIconSpinner(); }

async function getIconDataUrl(repo, ref) {
  const refStr = ref || "main"; showIconSpinner();
  try {
    const res = await fetch(`${apiBase}/api/icon?game_repository=${encodeURIComponent(repo)}&game_ref=${encodeURIComponent(refStr)}`, { headers: op() });
    if (!res.ok) { setIcon(null); return null; }
    const d = await res.json();
    if (d.ok && d.icon?.dataUrl) { setIcon(d.icon.dataUrl); return d.icon.dataUrl; }
    setIcon(null); return null;
  } catch { setIcon(null); return null; }
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
  try { const res = await fetch("https://api.github.com/repos/zey-win/ci-cd/releases?per_page=50"); if (!res.ok) return; const data = await res.json(); releases.length = 0; for (const r of (data || [])) { const tag = r.tag_name || ""; const assets = (r.assets || []).map(a => ({ name: a.name, url: a.browser_download_url })); releases.push({ tag, name: r.name, assets }); } } catch {}
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
async function loadArtifactVersions() {
  const pkgs = new Set();
  for (const r of runs) {
    if (r.conclusion === "success" && !runMeta[r.id]?.ver) {
      const { pkg } = parseTitle(r.displayTitle || r.name || "");
      if (pkg) pkgs.add(pkg);
    }
  }
  for (const pkg of pkgs) {
    try {
      const res = await fetch(`${apiBase}/api/artifacts?package_name=${encodeURIComponent(pkg)}`);
      if (!res.ok) continue;
      const d = await res.json();
      if (d.versionName || d.versionCode) {
        const run = runs.find(r => { const { pkg: rp } = parseTitle(r.displayTitle || r.name || ""); return rp === pkg; });
        if (run) {
          if (!runMeta[run.id]) runMeta[run.id] = {};
          if (d.versionName) runMeta[run.id].ver = d.versionName;
          if (d.versionCode) runMeta[run.id].code = d.versionCode;
        }
      }
    } catch {}
  }
}

async function loadVersionSuggestion(packageName, force = false) {
  const pkg = (packageName || "").trim();
  if (!pkg) return null;
  if (!force && versionCache.has(pkg)) return versionCache.get(pkg);
  try {
    const res = await fetch(`${apiBase}/api/versions?package_name=${encodeURIComponent(pkg)}`, { headers: op() });
    if (!res.ok) return null;
    const data = await res.json();
    versionCache.set(pkg, data);
    return data;
  } catch {
    return null;
  }
}

async function syncVersionFields(force = false) {
  if (versionMode && versionMode.value === "manual") return;
  const pkg = $("f-pkg")?.value?.trim();
  if (!pkg) return;
  const data = await loadVersionSuggestion(pkg, force);
  const suggested = data?.aab || {};
  const versionName = suggested.versionName || data?.latest?.versionName || "1";
  const versionCode = suggested.versionCode || data?.latest?.versionCode || "1";
  const versionInput = $("f-version");
  const codeInput = $("f-vcode");
  if (versionInput && versionName) versionInput.value = versionName;
  if (codeInput && versionCode) codeInput.value = versionCode;
}

async function loadFirebaseConfigBase64(firebaseCfg) {
  const cfg = (firebaseCfg || "").trim();
  if (!cfg) return "";
  if (firebaseCache.has(cfg)) return firebaseCache.get(cfg);
  try {
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
  if (meta?.icon) return meta.icon;
  const raw = r.displayTitle || r.name || "";
  const { app } = parseTitle(raw);
  const repo = repoFromTitle(raw);
  const appLower = (app || "").toLowerCase();
  let iconUrl = REPO_ICONS[repo] || null;
  if (repo === "zey-win/plinko") {
    if (appLower.includes("real money")) iconUrl = REPO_ICONS["zey-win/plinko@app/plinko-real-money"] || iconUrl;
    else if (appLower.includes("real game")) iconUrl = REPO_ICONS["zey-win/plinko@app/plinko"] || iconUrl;
    else if (appLower.includes("plinko") && !appLower.includes("falling")) iconUrl = REPO_ICONS["zey-win/plinko@app/plinko"] || iconUrl;
    else iconUrl = REPO_ICONS["zey-win/plinko@main"] || iconUrl;
  }
  return iconUrl;
}

function buildCardHTML(r, idx) {
  const raw = r.displayTitle || r.name || "";
  const { app, pkg } = parseTitle(raw);
  const concl = r.conclusion || "";
  const st = r.status || "unknown";
  const url = r.htmlUrl || "#";
  const meta = runMeta[r.id];
  const iconUrl = resolveIcon(r);
  const verStr = (meta?.ver) || String(r.runNumber || "");
  const codeStr = (meta?.code) || String(r.runAttempt || "1");
  const versionInfo = verStr ? `<span class="version-line">${esc(app)} v${esc(verStr)}</span>` : `<span class="version-line">${esc(app)}</span>`;
  const createdAt = r.createdAt ? new Date(r.createdAt) : null;
  const dateStr = createdAt ? createdAt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
  let downloads = { apk: null, aab: null };
  if (concl === "success") {
    if (meta?.apk || meta?.aab) downloads = { apk: meta.apk || null, aab: meta.aab || null };
    else downloads = findDownloads(pkg);
    if (downloads.apk || downloads.aab) {
      if (!runMeta[r.id]) runMeta[r.id] = {};
      if (downloads.apk) runMeta[r.id].apk = downloads.apk;
      if (downloads.aab) runMeta[r.id].aab = downloads.aab;
      try { const sv = JSON.parse(localStorage.getItem('rv')||'{}'); if (!sv[r.id]) sv[r.id]={}; if (downloads.apk) sv[r.id].apk=downloads.apk; if (downloads.aab) sv[r.id].aab=downloads.aab; localStorage.setItem('rv',JSON.stringify(sv)); } catch {}
    }
  }
  let label, cls;
  if (concl === "success") { label = "✅<span class='lt'> Готов</span>"; cls = "status-success"; }
  else if (concl === "failure") { label = "❌<span class='lt'> Ошибка</span>"; cls = "status-failure"; }
  else if (["waiting","queued","pending"].includes(st)) { label = "⏳<span class='lt'> В очереди</span>"; cls = "status-pending"; }
  else if (st === "completed") { label = "❌<span class='lt'> Ошибка</span>"; cls = "status-failure"; }
  else { label = "🔄<span class='lt'> "+st+"</span>"; cls = "status-pending"; }
  const isProgress = ["in_progress","pending","queued","waiting"].includes(st);
  const bgStyle = idx % 2 === 0 ? 'background:#1a202c' : 'background:#161b22';
  const iconBlock = iconUrl ? `<img class="card-icon" src="${iconUrl}" alt="" loading="lazy" onerror="this.onerror=null;this.alt='🎮'">` : `<div class="card-icon card-icon-placeholder">🎮</div>`;
  const timerId = `t-${r.id}`;
  const timerHtml = `<span class="timer" id="${timerId}" data-run="${r.id}" style="display:${st!=='completed'&&timers[r.id]?'inline':'none'};color:#ffd700;font-size:15px;font-weight:700">⏱ 00:00,00</span>`;
  return `<div class="build-card${isProgress?' in-progress':''}" style="${bgStyle}" data-id="${r.id}">${iconBlock}<div class="info"><div class="app-name">${versionInfo}</div><div class="meta">${esc(pkg)}</div>${dateStr?`<div class="meta" style="font-size:12px;color:#8b949e">${esc(dateStr)}</div>`:""}</div><div class="right-col"><div class="actions-col">${concl==="success"&&downloads.apk?`<a class="dl-btn dl-btn-apk" href="${downloads.apk}" download>APK</a>`:""}${concl==="success"&&downloads.aab?`<a class="dl-btn dl-btn-aab" href="${downloads.aab}" download>AAB</a>`:""}${concl!=="success"?`<a href="${esc(url)}" target="_blank" class="log-btn log-btn-bottom">Логи</a>`:""}</div><div class="actions-col"><div class="status-row">${timerHtml}<span class="status ${cls} status-small">${label}</span></div><button class="del-btn" onclick="deleteRun(${r.id},event)" title="Удалить">✕</button></div></div></div>`;
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
  const active = runs.filter(r => r.status !== "completed");
  const done = runs.filter(r => r.status === "completed" && r.conclusion === "success");
  const fail = runs.filter(r => r.status === "completed" && r.conclusion !== "success");
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
  if (loading) loading.style.display = "inline-flex";
  try {
    const [runsRes] = await Promise.all([fetch(`${apiBase}/api/runs`), loadReleases()]);
    if (!runsRes.ok) return;
    const d = await runsRes.json();
    const oldRuns = runs;
    runs = Array.isArray(d.runs) ? d.runs : [];
    for (const r of runs) {
      let icon = r.iconUrl;
      if (!icon) {
        const title = `${r.displayTitle || ""} ${r.name || ""}`;
        const m = title.match(/builder-([a-z0-9]+)/);
        if (m) icon = `https://raw.githubusercontent.com/zey-win/ci-cd/main/builds/icons/${m[0]}.png`;
      }
      if (!runMeta[r.id]) runMeta[r.id] = {};
      if (icon) runMeta[r.id].icon = icon;
    }
    try {
      const sv = JSON.parse(localStorage.getItem('rv')||'{}');
      for (const [id, v] of Object.entries(sv)) {
        const rid = parseInt(id);
        if (!runMeta[rid]) runMeta[rid] = {};
        if (v.ver) runMeta[rid].ver = v.ver;
        if (v.code) runMeta[rid].code = v.code;
        if (v.apk) runMeta[rid].apk = v.apk;
        if (v.aab) runMeta[rid].aab = v.aab;
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
    loadArtifactVersions().then(() => renderAll());
  } catch(e) { console.error(e); } finally { if (loading) loading.style.display = "none"; }
}

async function deleteRun(runId, e) {
  if (!confirm("Удалить эту сборку?")) return;
  const btn = e?.target; if (btn) btn.disabled = true;
  try {
    await fetch(`${apiBase}/api/delete`, { method: "POST", headers: op(), body: JSON.stringify({ run_id: runId }) });
    runs = runs.filter(r => r.id !== runId);
    delete runMeta[runId];
    delete timers[runId];
    try { const sv = JSON.parse(localStorage.getItem('rv')||'{}'); delete sv[runId]; localStorage.setItem('rv',JSON.stringify(sv)); } catch {}
    renderAll();
  } catch (err) { alert("Ошибка удаления: " + err.message); }
  finally { if (btn) btn.disabled = false; }
}

function updateBranches() {
  const repo = repoSelect.value;
  const list = BRANCHES[repo] || DEFAULT_BRANCHES;
  branchSelect.innerHTML = list.map(b => `<option value="${b.ref}">${b.label}</option>`).join("");
  getIconDataUrl(repo, branchSelect.value);
}

iconFile.addEventListener("change", e => {
  const f = e.target.files[0]; if (!f) return;
  if (f.type !== "image/png") { alert("Только PNG"); return; }
  const r = new FileReader();
  r.onload = () => { currentIconDataUrl = r.result; gameIcon.src = r.result; gameIcon.style.display = "block"; };
  r.readAsDataURL(f);
});
$("icon-gen-btn").addEventListener("click", () => {
  getIconDataUrl(repoSelect.value, branchSelect.value).then(url => {
    if (url) currentIconDataUrl = url;
  });
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
    const requestPayload = { ...payload };
    if (requestPayload.version_mode !== "manual") {
      requestPayload.aab_version_name = "";
      requestPayload.aab_version_code = "";
    }

    const res = await fetch(`${apiBase}/api/build`, { method: "POST", headers: op(), body: JSON.stringify(requestPayload) });
    if (!res.ok) {
      throw new Error(await res.text().catch(() => ""));
    }
    const d = await res.json();
    if (d.run) {
      const serverIconPath = d.icon?.path;
      const serverIconUrl = serverIconPath ? `https://raw.githubusercontent.com/zey-win/ci-cd/main/${serverIconPath}` : (d.icon?.htmlUrl || null);
      runMeta[d.run.id] = { icon: serverIconUrl || null, ver: payload.aab_version_name || payload.version_name || "", code: payload.aab_version_code || payload.version_code || "" };
      try {
        const sv = JSON.parse(localStorage.getItem('rv')||'{}');
        sv[d.run.id] = { ver: payload.aab_version_name || payload.version_name || '', code: payload.aab_version_code || payload.version_code || '' };
        if (d.latestArtifact?.apkDownloadUrl) { runMeta[d.run.id].apk = d.latestArtifact.apkDownloadUrl; sv[d.run.id].apk = d.latestArtifact.apkDownloadUrl; }
        if (d.latestArtifact?.aabDownloadUrl) { runMeta[d.run.id].aab = d.latestArtifact.aabDownloadUrl; sv[d.run.id].aab = d.latestArtifact.aabDownloadUrl; }
        localStorage.setItem('rv',JSON.stringify(sv));
      } catch {}
      timers[d.run.id] = { start: Date.now(), total: (39 + (d.run.id % 12)) * 60 * 1000 };
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

async function buildFromConfig(cfg, { useNextVersion = true, buildFormat = "apk_aab" } = {}) {
  const pkg = cfg.package_name || "";
  const versionData = useNextVersion ? await loadVersionSuggestion(pkg, true) : null;
  const suggested = versionData?.aab || {};
  const versionName = useNextVersion ? (suggested.versionName || versionData?.latest?.versionName || cfg.version_name || "1") : (cfg.version_name || "1");
  const versionCode = useNextVersion ? String(suggested.versionCode || versionData?.latest?.versionCode || cfg.version_code || "1") : String(cfg.version_code || "1");
  const iconData = await getIconDataUrl(cfg.game_repository, "main");
  const firebaseBase64 = await loadFirebaseConfigBase64(cfg.firebase_cfg);
  return submitBuildPayload({
    game_repository: cfg.game_repository || "zey-win/plinko",
    game_ref: "main",
    app_name: cfg.app_name || cfg.label || "",
    package_name: pkg,
    build_format: buildFormat,
    version_mode: "auto_next",
    version_name: versionName,
    version_code: versionCode,
    aab_version_name: "",
    aab_version_code: "",
    zeywin_api_key: cfg.zeywin_api_key || "",
    admob_android_app_id: cfg.admob_app_id || "",
    admob_android_banner_id: cfg.admob_banner || "",
    admob_android_interstitial_id: cfg.admob_interstitial || "",
    admob_android_rewarded_id: cfg.admob_rewarded || "",
    iconDataUrl: iconData || "",
    firebaseJsonBase64: firebaseBase64 || ""
  }, { autoSave: false });
}

async function runBatchBuilds() {
  if (batchBuildRunning) return;
  if (!savedConfigs.length) {
    alert("Нет сохранённых конфигов");
    return;
  }

  batchBuildRunning = true;
  const progress = $("build-progress");
  const steps = $("bp-steps");
  const formEl = $("build-form");
  const previousFormDisplay = formEl?.style.display || "";
  if (progress && steps) {
    progress.classList.remove("hidden");
    steps.innerHTML = "";
  }
  if (formEl) formEl.style.display = "none";

  try {
    for (const cfg of savedConfigs) {
      const line = document.createElement("div");
      line.style.cssText = "padding:6px 0;border-bottom:1px solid #21262d;color:#c9d1d9;font-size:13px";
      line.textContent = `▶ ${cfg.label}`;
      steps?.appendChild(line);
      try {
        await buildFromConfig(cfg, { useNextVersion: true, buildFormat: "apk_aab" });
        line.textContent = `✅ ${cfg.label}`;
      } catch (error) {
        line.textContent = `❌ ${cfg.label}: ${error.message}`;
      }
      await new Promise(resolve => setTimeout(resolve, 1200));
    }
  } finally {
    batchBuildRunning = false;
    if (formEl) formEl.style.display = previousFormDisplay;
  }
}

repoSelect.addEventListener("change", () => { updateBranches(); syncVersionFields(true); });
branchSelect.addEventListener("change", () => {
  getIconDataUrl(repoSelect.value, branchSelect.value).then(url => { if (url) currentIconDataUrl = url; });
});
if (versionMode) {
  versionMode.addEventListener("change", () => {
    syncVersionFields(true);
  });
}

newBuildBtn.addEventListener("click", () => {
  currentIconDataUrl = null; firebaseJson = null;
  form.style.display = "";
  $("build-progress").classList.add("hidden");
  if (versionMode) versionMode.value = "auto_next";
  const all = form.querySelectorAll("label, .modal-actions, .form-row, .icon-format-row");
  all.forEach(el => { el.style.opacity = ""; el.style.transform = ""; el.style.transition = ""; });
  modal.classList.remove("hidden");
  updateBranches();
  iconLoadedDeferred = getIconDataUrl(repoSelect.value, branchSelect.value).then(url => { if (url) currentIconDataUrl = url; });
  syncVersionFields(true);
});
cancelBtn.addEventListener("click", () => modal.classList.add("hidden"));
modal.addEventListener("click", e => { if (e.target === modal) modal.classList.add("hidden"); });

form.addEventListener("submit", async e => {
  e.preventDefault();
  const fd = new FormData(form);
  if (!currentIconDataUrl && iconLoadedDeferred) {
    try { const url = await iconLoadedDeferred; if (url) currentIconDataUrl = url; } catch {}
  }
  const iconData = currentIconDataUrl || "";
  const buildFormat = fd.get("build_format") || "apk";
  const p = {
    game_repository: fd.get("game_repository") || "zey-win/plinko",
    game_ref: fd.get("game_ref") || "main",
    app_name: fd.get("app_name") || "",
    package_name: fd.get("package_name") || "",
    build_format: buildFormat,
    version_mode: fd.get("version_mode") || "auto_next",
    version_name: fd.get("version_name") || "1",
    version_code: fd.get("version_code") || "1",
    aab_version_name: fd.get("version_name") || "1",
    aab_version_code: fd.get("version_code") || "1",
    zeywin_api_key: fd.get("zeywin_api_key") || "",
    admob_android_app_id: fd.get("admob_app_id") || "",
    admob_android_banner_id: fd.get("admob_banner") || "",
    admob_android_interstitial_id: fd.get("admob_interstitial") || "",
    admob_android_rewarded_id: fd.get("admob_rewarded") || "",
    iconDataUrl: iconData,
    firebaseJsonBase64: firebaseJson || ""
  };
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
  } catch (err) { alert("Ошибка: " + err.message); }
});

// ----- Configs: build history dropdown -----
function renderConfigDropdown() {
  const list = $("config-list");
  const trigger = $("config-trigger");
  if (!list) return;
  list.innerHTML = "";
  const toolbar = document.createElement("div");
  toolbar.style.cssText = "display:flex;gap:6px;align-items:center;padding:8px 10px;border-bottom:1px solid #21262d;background:#0d1117;position:sticky;top:0;z-index:1";
  const batchBtn = document.createElement("button");
  batchBtn.type = "button";
  batchBtn.textContent = "Собрать всё";
  batchBtn.style.cssText = "flex:1;padding:7px 8px;background:#238636;border:none;border-radius:4px;color:#fff;font-size:13px;cursor:pointer";
  batchBtn.onclick = async (e) => { e.stopPropagation(); closeDropdown(); await runBatchBuilds(); };
  toolbar.appendChild(batchBtn);
  const hint = document.createElement("span");
  hint.textContent = "APK = v1, AAB = i+1";
  hint.style.cssText = "color:#8b949e;font-size:11px;white-space:nowrap";
  toolbar.appendChild(hint);
  list.appendChild(toolbar);
  for (const c of savedConfigs) {
    const item = document.createElement("div");
    item.style.cssText = "display:flex;align-items:center;padding:6px 10px;cursor:pointer;border-bottom:1px solid #21262d;font-size:14px";
    item.onmouseenter = () => { item.style.background = "#1c2333"; };
    item.onmouseleave = () => { item.style.background = ""; };
    const label = document.createElement("span");
    label.style.cssText = "flex:1;color:#c9d1d9";
    label.textContent = c.label;
    label.onclick = (e) => { e.stopPropagation(); fillConfig(c.id); closeDropdown(); };
    item.appendChild(label);
    const del = document.createElement("button");
    del.textContent = "✕";
    del.title = "Удалить";
    del.style.cssText = "background:none;border:none;color:#ff4444;cursor:pointer;font-size:14px;padding:2px 6px;border-radius:3px";
    del.onmouseenter = () => { del.style.background = "#ff444422"; };
    del.onmouseleave = () => { del.style.background = "none"; };
    del.onclick = async (e) => {
      e.stopPropagation();
      if (!confirm(`Удалить "${c.label}" из истории?`)) return;
      const id = c.id;
      savedConfigs = savedConfigs.filter(x => x.id !== id);
      try {
        const local = JSON.parse(localStorage.getItem("savedConfigs") || "[]");
        localStorage.setItem("savedConfigs", JSON.stringify(local.filter(x => x.id !== id)));
      } catch {}
      // Delete from repo (configs.json) via GitHub API
      try {
        const getRes = await fetch("https://api.github.com/repos/zey-win/zey-win.github.io/contents/configs.json", {
          headers: { "Authorization": "token " + operatorKey, "Accept": "application/vnd.github.v3+json" }
        });
        if (getRes.ok) {
          const meta = await getRes.json();
          const content = JSON.parse(atob(meta.content));
          content.configs = content.configs.filter(x => x.id !== id);
          const updated = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
          await fetch("https://api.github.com/repos/zey-win/zey-win.github.io/contents/configs.json", {
            method: "PUT",
            headers: { "Authorization": "token " + operatorKey, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
            body: JSON.stringify({ message: "delete config: " + id, content: updated, sha: meta.sha })
          });
        }
      } catch {}
      if (selectedConfigId === id) { selectedConfigId = null; }
      renderConfigDropdown();
    };
    item.appendChild(del);
    list.appendChild(item);
  }
  if (!savedConfigs.length) {
    list.innerHTML = '<div style="padding:8px;color:#8b949e;font-size:13px">Нет сохранённых конфигов</div>';
  }
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
  let loaded = false;
  // Try GitHub API first (always up-to-date)
  try {
    const res = await fetch("https://api.github.com/repos/zey-win/zey-win.github.io/contents/configs.json", {
      headers: { "Authorization": "token " + operatorKey, "Accept": "application/vnd.github.v3+json" }
    });
    if (res.ok) {
      const meta = await res.json();
      const data = JSON.parse(atob(meta.content));
      savedConfigs = data.configs || [];
      loaded = true;
    }
  } catch {}
  // Fallback to raw CDN (might be cached)
  if (!loaded) {
    try {
      const res = await fetch("./configs.json?" + Date.now());
      if (res.ok) {
        const data = await res.json();
        savedConfigs = data.configs || [];
      }
    } catch {}
  }
  // Merge locally-saved configs from auto-save
  try {
    const local = JSON.parse(localStorage.getItem("savedConfigs") || "[]");
    for (const lc of local) {
      if (!savedConfigs.some(c => c.id === lc.id)) savedConfigs.push(lc);
    }
  } catch {}
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
    fetch(`./firebase-cfg/${cfg.firebase_cfg}`)
      .then(r => r.ok ? r.text() : null)
      .then(text => {
        if (text) {
          firebaseJson = btoa(unescape(encodeURIComponent(text)));
          const st = $("firebase-status");
          if (st) { st.textContent = "✅ Firebase загружен"; st.style.display = "inline"; }
        }
      }).catch(() => {});
  } else {
    firebaseJson = null;
    const st = $("firebase-status");
    if (st) { st.textContent = ""; st.style.display = "none"; }
  }
  // Load icon
  getIconDataUrl(cfg.game_repository, "main").then(url => { if (url) currentIconDataUrl = url; });
  syncVersionFields(true);
  const trigger = $("config-trigger");
  if (trigger) trigger.textContent = "📜 " + cfg.label;
}

// Auto-save current form data as a config after successful build
async function autoSaveConfig(fd) {
  const label = fd.get("app_name") || "Без имени";
  const id = label.toLowerCase().replace(/\s+/g, "-");
  if (savedConfigs.some(c => c.id === id)) return;
  const cfg = {
    id: id,
    label: label,
    game_repository: fd.get("game_repository") || "zey-win/plinko",
    app_name: fd.get("app_name") || "",
    package_name: fd.get("package_name") || "",
    version_name: fd.get("version_name") || "1",
    version_code: fd.get("version_code") || "1",
    version_mode: fd.get("version_mode") || "auto_next",
    zeywin_api_key: fd.get("zeywin_api_key") || "",
    admob_app_id: fd.get("admob_app_id") || "",
    admob_banner: fd.get("admob_banner") || "",
    admob_interstitial: fd.get("admob_interstitial") || "",
    admob_rewarded: fd.get("admob_rewarded") || "",
    firebase_cfg: null
  };
  savedConfigs.push(cfg);
  // Persist to localStorage
  try {
    const local = JSON.parse(localStorage.getItem("savedConfigs") || "[]");
    local.push(cfg);
    localStorage.setItem("savedConfigs", JSON.stringify(local));
  } catch {}
  // Save to repo (configs.json) via GitHub API
  try {
    const getRes = await fetch("https://api.github.com/repos/zey-win/zey-win.github.io/contents/configs.json", {
      headers: { "Authorization": "token " + operatorKey, "Accept": "application/vnd.github.v3+json" }
    });
    if (getRes.ok) {
      const meta = await getRes.json();
      const content = JSON.parse(atob(meta.content));
      if (!content.configs.some(x => x.id === cfg.id)) {
        content.configs.push(cfg);
        const updated = btoa(unescape(encodeURIComponent(JSON.stringify(content, null, 2))));
        await fetch("https://api.github.com/repos/zey-win/zey-win.github.io/contents/configs.json", {
          method: "PUT",
          headers: { "Authorization": "token " + operatorKey, "Accept": "application/vnd.github.v3+json", "Content-Type": "application/json" },
          body: JSON.stringify({ message: "auto-save config: " + cfg.id, content: updated, sha: meta.sha })
        });
      }
    }
  } catch {}
}

// Dropdown trigger click
$("config-trigger").addEventListener("click", toggleDropdown);
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
  syncVersionFields(false);
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
renderSkeletons();

(async () => {
  await loadReleases();
  updateBranches();
  loadBuilds();
  loadConfigs();
  setInterval(loadBuilds, 15000);
})();

function renderSkeletons() {
  buildsContainer.style.display = "";
  activeContainer.style.display = "none";
  buildsContainer.innerHTML = '<div class="skeleton-card"></div>'.repeat(20);
}
