const api = browser;

const DEF = {
  enabled: true,
  includePatterns: [],
  excludePatterns: ["localhost", "127.0.0.1"],
  stripWww: true,
  slowThresholdMs: 3000,
  quietWindowMs: 5000,
  siteRules: {
    "example.com": [
      { mode: "loader", selector: ".mx-grid-loading", hiddenClass: "ng-hide", debounceMs: 300, maxMs: 120000 },
      { mode: "text", selector: ".mx-aria-only", text: "Chargement", caseSensitive: false, debounceMs: 300, maxMs: 120000 }
    ]
  }
};

const X = new Map(); // mesures navigation (main_frame)
const Q = new Map(); // requêtes XHR en cours (navigation)
const V = new Map(); // mesures visuelles (loader/text)
const B = new Map(); // intervalles badge par onglet
const A = new Map(); // requêtes xhr-action en cours (requestId -> {tabId, host, start})

function badgeStart(tabId) {
  badgeStop(tabId);
  const start = Date.now();
  api.action.setBadgeBackgroundColor({ color: '#1b57c9', tabId });
  api.action.setBadgeText({ text: '0', tabId });
  const interval = setInterval(() => {
    const secs = Math.floor((Date.now() - start) / 1000);
    api.action.setBadgeText({ text: String(secs), tabId });
  }, 1000);
  B.set(tabId, interval);
}

function badgeStop(tabId) {
  if (B.has(tabId)) {
    clearInterval(B.get(tabId));
    B.delete(tabId);
  }
  api.action.setBadgeText({ text: '', tabId });
}

const norm = v => Array.isArray(v) ? v : (v?.mode ? [v] : []);

async function cfg() {
  let o = await api.storage.local.get("settings");
  let s = o.settings || {};
  let raw = { ...DEF.siteRules, ...(s.siteRules || {}) };
  let siteRules = {};
  for (const [h, v] of Object.entries(raw)) siteRules[h] = norm(v);
  return { ...DEF, ...s, siteRules };
}

function host(u, strip = true) {
  try {
    let h = new URL(u).hostname.toLowerCase();
    return strip && h.startsWith("www.") ? h.slice(4) : h;
  } catch {
    return null;
  }
}

function match(h, p) {
  p = p.trim().toLowerCase();
  if (p.startsWith("*.")) {
    let x = p.slice(2);
    return h === x || h.endsWith("." + x);
  }
  return h === p || h.endsWith("." + p);
}

function allow(h, s) {
  return s.enabled
    && h
    && !s.excludePatterns.some(p => match(h, p))
    && (!s.includePatterns.length || s.includePatterns.some(p => match(h, p)));
}

function dk(t) {
  let d = new Date(t);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

async function save(h, ms, at, err, method) {
  let s = await cfg();
  let o = await api.storage.local.get(["stats", "dailyStats"]);
  let S = o.stats || {};
  let D = o.dailyStats || {};
  let m = dk(at).slice(0, 7);
  let d = dk(at);

  S[h] ||= {};
  S[h][m] ||= { count: 0, totalMs: 0, minMs: null, maxMs: 0, slowCount: 0, errorCount: 0, methods: {} };
  let x = S[h][m];
  x.count++;
  x.totalMs += ms;
  x.minMs = x.minMs === null ? ms : Math.min(x.minMs, ms);
  x.maxMs = Math.max(x.maxMs, ms);
  if (ms >= s.slowThresholdMs) x.slowCount++;
  if (err) x.errorCount++;
  x.methods[method] = (x.methods[method] || 0) + 1;

  D[h] ||= {};
  D[h][d] ||= { count: 0, totalMs: 0, slowCount: 0, errorCount: 0 };
  x = D[h][d];
  x.count++;
  x.totalMs += ms;
  if (ms >= s.slowThresholdMs) x.slowCount++;
  if (err) x.errorCount++;

  await api.storage.local.set({ stats: S, dailyStats: D });
}

function clear(x) {
  if (x?.timer) clearTimeout(x.timer);
  if (x?.maxTimer) clearTimeout(x.maxTimer);
}

async function arm(tab) {
  let t = X.get(tab);
  if (!t || !t.mainDone || t.active.size) return;
  clear(t);
  let s = await cfg();
    t.timer = setTimeout(async () => {
    let q = X.get(tab);
    if (!q || q.active.size) return;
    X.delete(tab);
    if (q.maxTimer) clearTimeout(q.maxTimer);
    badgeStop(tab);
    await save(q.host, Math.max(0, q.last - q.start), q.last, q.error, "xhr");
  }, Number(s.quietWindowMs) || 5000);
}

api.webRequest.onBeforeRequest.addListener(async d => {
  if (d.tabId < 0) return;
  let s = await cfg();
  if (d.type === "main_frame") {
    let h = host(d.url, s.stripWww);
    clear(X.get(d.tabId));
    X.delete(d.tabId);
    let rules = s.siteRules[h] || [];
    if (!allow(h, s) || (rules.length && !rules.some(r => r.mode === "xhr"))) return;
    const entry = {
      host: h,
      start: d.timeStamp,
      last: d.timeStamp,
      mainId: d.requestId,
      mainDone: false,
      active: new Set(),
      error: false,
      maxTimer: null
    };
    // Timeout de sécurité : force la fin de mesure après 2 minutes
    entry.maxTimer = setTimeout(async () => {
      let q = X.get(d.tabId);
      if (!q) return;
      X.delete(d.tabId);
      badgeStop(d.tabId);
      await save(q.host, Math.max(0, q.last - q.start), q.last, q.error, "xhr");
    }, 120000);
        X.set(d.tabId, entry);
    badgeStart(d.tabId);
    return;
  }

  // Requête XHR hors navigation : vérifier si xhr-action applicable
  if (d.type === "xmlhttprequest") {
    let h = host(d.url, s.stripWww);
    let rules = s.siteRules[h] || [];
    let hasAction = rules.some(r => r.mode === "xhr-action");
    if (hasAction && allow(h, s) && !X.has(d.tabId)) {
      A.set(d.requestId, { tabId: d.tabId, host: h, start: d.timeStamp });
      badgeStart(d.tabId);
      return;
    }
  }

  let t = X.get(d.tabId);
  if (!t) return;
  clear(t);
  t.active.add(d.requestId);
  Q.set(d.requestId, d.tabId);
}, { urls: ["<all_urls>"], types: ["main_frame", "xmlhttprequest"] });

function done(d, e) {
  if (d.type === "main_frame") {
    let t = X.get(d.tabId);
        if (!t) return;
    if (t.mainId !== d.requestId) t.mainId = d.requestId; // redirection : on accepte le nouveau requestId
    t.mainDone = true;
    t.last = d.timeStamp;
    t.error ||= e;
    arm(d.tabId);
    return;
  }

  // Fin d'une requête xhr-action
  if (A.has(d.requestId)) {
    let a = A.get(d.requestId);
    A.delete(d.requestId);
    const ms = d.timeStamp - a.start;
    // Badge : on ne démarre/arrête que si pas de mesure navigation en cours
    if (!X.has(a.tabId)) badgeStop(a.tabId);
    save(a.host, ms, d.timeStamp, e, "xhr-action");
    return;
  }

  // Fin d'une requête navigation XHR
  let tab = Q.get(d.requestId);
  Q.delete(d.requestId);
  let t = X.get(tab);
  if (!t) return;
  t.active.delete(d.requestId);
  t.last = Math.max(t.last, d.timeStamp);
  t.error ||= e;
  arm(tab);
}

api.webRequest.onCompleted.addListener(d => done(d, false), { urls: ["<all_urls>"], types: ["main_frame", "xmlhttprequest"] });
api.webRequest.onErrorOccurred.addListener(d => done(d, true), { urls: ["<all_urls>"], types: ["main_frame", "xmlhttprequest"] });

api.runtime.onMessage.addListener(async (m, sender) => {
  if (m.type === "config") {
    let s = await cfg();
    let h = host(m.url, s.stripWww);
    let rules = (s.siteRules[h] || []).filter(r => ["loader", "text"].includes(r.mode));
        return { enabled: allow(h, s) && rules.length, host: h, rules };
  }
  if (m.type === "visualStart" && !V.has(sender.tab.id)) {
    V.set(sender.tab.id, { host: m.host, start: m.time });
    badgeStart(sender.tab.id);
  }
  if (m.type === "visualEnd") {
    let x = V.get(sender.tab.id);
    if (x) {
      V.delete(sender.tab.id);
      badgeStop(sender.tab.id);
      await save(x.host, Math.max(0, m.time - x.start), m.time, false, "multi-loader");
    }
  }
});

api.action.setBadgeBackgroundColor({ color: '#1b57c9' });

api.runtime.onInstalled.addListener(async () => {
  let o = await api.storage.local.get("settings");
  let s = o.settings || {};
  let raw = { ...DEF.siteRules, ...(s.siteRules || {}) };
  let siteRules = {};
  for (const [h, v] of Object.entries(raw)) siteRules[h] = norm(v);
  await api.storage.local.set({ settings: { ...DEF, ...s, siteRules } });
});