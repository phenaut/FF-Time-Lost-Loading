const api = browser;

const DEF = {
  enabled: true,
  excludePatterns: ["localhost", "127.0.0.1"],
  slowThresholdMs: 3000,
  minMeasureMs: 500,
  quietWindowMs: 300
};

// Un seul chrono par onglet
// tabId -> { host, path, start, lastActivity, activeRequests: Set, badgeInterval, timeoutTimer, quietTimer }
const M = new Map();

async function cfg() {
  let o = await api.storage.local.get("settings");
  return { ...DEF, ...(o.settings || {}) };
}

function host(u) {
  try {
    let h = new URL(u).hostname.toLowerCase();
    return h.startsWith("www.") ? h.slice(4) : h;
  } catch { return null; }
}

function pathOf(u) {
  try {
    return new URL(u).pathname.replace(/\/+$/, '') || '/';
  } catch { return '/'; }
}

function matchPattern(h, p) {
  p = p.trim().toLowerCase();
  if (p.startsWith("*.")) {
    let x = p.slice(2);
    return h === x || h.endsWith("." + x);
  }
  return h === p || h.endsWith("." + p);
}

function allow(h, s) {
  return s.enabled && h && !s.excludePatterns.some(p => matchPattern(h, p));
}

function badgeStart(tabId, start) {
  api.action.setBadgeBackgroundColor({ color: '#1b57c9', tabId });
  api.action.setBadgeText({ text: '0', tabId });
  return setInterval(() => {
    const secs = Math.floor((Date.now() - start) / 1000);
    api.action.setBadgeText({ text: String(secs), tabId });
  }, 1000);
}

function badgeStop(tabId) {
  api.action.setBadgeText({ text: '', tabId });
}

function dk(t) {
  let d = new Date(t);
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}

async function save(h, ms, at) {
  const s = await cfg();
  if (ms < s.minMeasureMs) return;
  const o = await api.storage.local.get(["stats", "dailyStats"]);
  const S = o.stats || {};
  const D = o.dailyStats || {};
  const m = dk(at).slice(0, 7);
  const d = dk(at);

  S[h] ||= {};
  S[h][m] ||= { count: 0, totalMs: 0, minMs: null, maxMs: 0, slowCount: 0, methods: {} };
  const x = S[h][m];
  x.count++;
  x.totalMs += ms;
  x.minMs = x.minMs === null ? ms : Math.min(x.minMs, ms);
  x.maxMs = Math.max(x.maxMs, ms);
  if (ms >= s.slowThresholdMs) x.slowCount++;
  x.methods.xhr = (x.methods.xhr || 0) + 1;

  D[h] ||= {};
  D[h][d] ||= { count: 0, totalMs: 0, slowCount: 0 };
  const y = D[h][d];
  y.count++;
  y.totalMs += ms;
  if (ms >= s.slowThresholdMs) y.slowCount++;

  await api.storage.local.set({ stats: S, dailyStats: D });
}

function scheduleStop(tabId, quietWindowMs) {
  const e = M.get(tabId);
  if (!e) return;
  if (e.quietTimer) clearTimeout(e.quietTimer);
  e.quietTimer = setTimeout(() => {
    const cur = M.get(tabId);
    if (!cur || cur.activeRequests.size > 0) return;
    stopChrono(tabId);
  }, quietWindowMs);
}

async function stopChrono(tabId, forced = false) {
  const e = M.get(tabId);
  if (!e) return;
  M.delete(tabId);
  if (e.badgeInterval) clearInterval(e.badgeInterval);
  if (e.timeoutTimer)  clearTimeout(e.timeoutTimer);
  if (e.quietTimer)    clearTimeout(e.quietTimer);
  badgeStop(tabId);
  const ms = e.lastActivity - e.start;
  const totalMs = Date.now() - e.start;
  console.log('[FFTLL]', e.host, '| sauve:', ms, 'ms | badge affichait ~', totalMs, 'ms | derniere URL:', e.lastUrl);
  await save(e.host, ms, e.lastActivity);
}

api.webRequest.onBeforeRequest.addListener(async d => {
  if (d.tabId < 0 || d.type !== 'xmlhttprequest') return;
  const s = await cfg();
  const h = host(d.documentUrl || d.originUrl || d.url);
  if (!allow(h, s)) return;

  const now = Date.now();
  let e = M.get(d.tabId);

  if (!e) {
    e = {
      host: h,
      path: pathOf(d.documentUrl || d.originUrl || d.url),
      start: now,
      lastActivity: now,
      activeRequests: new Set(),
      badgeInterval: null,
      timeoutTimer: null,
      quietTimer: null
    };
    e.badgeInterval = badgeStart(d.tabId, now);
    e.timeoutTimer  = setTimeout(() => stopChrono(d.tabId, true), 120000);
    M.set(d.tabId, e);
  }

  e.activeRequests.add(d.requestId);
  e.lastActivity = now;
  e.lastUrl = d.url;
  if (e.quietTimer) { clearTimeout(e.quietTimer); e.quietTimer = null; }
}, { urls: ["<all_urls>"], types: ["xmlhttprequest"] });

api.webRequest.onCompleted.addListener(d => {
  if (d.type !== 'xmlhttprequest') return;
  const e = M.get(d.tabId);
  if (!e) return;
  if (e.activeRequests.delete(d.requestId)) {
    e.lastActivity = Date.now();
    if (e.activeRequests.size === 0) {
      cfg().then(s => scheduleStop(d.tabId, s.quietWindowMs));
    }
  }
}, { urls: ["<all_urls>"], types: ["xmlhttprequest"] });

api.webRequest.onErrorOccurred.addListener(d => {
  if (d.type !== 'xmlhttprequest') return;
  const e = M.get(d.tabId);
  if (!e) return;
  if (e.activeRequests.delete(d.requestId)) {
    e.lastActivity = Date.now();
    if (e.activeRequests.size === 0) {
      cfg().then(s => scheduleStop(d.tabId, s.quietWindowMs));
    }
  }
}, { urls: ["<all_urls>"], types: ["xmlhttprequest"] });

api.webRequest.onBeforeRequest.addListener(async d => {
  if (d.tabId < 0 || d.type !== 'main_frame') return;
  const e = M.get(d.tabId);
  if (e) {
    if (e.lastActivity - e.start >= 500) {
      await stopChrono(d.tabId);
    } else {
      if (e.badgeInterval) clearInterval(e.badgeInterval);
      if (e.timeoutTimer)  clearTimeout(e.timeoutTimer);
      if (e.quietTimer)    clearTimeout(e.quietTimer);
      M.delete(d.tabId);
      badgeStop(d.tabId);
    }
  }
}, { urls: ["<all_urls>"], types: ["main_frame"] });

api.action.setBadgeBackgroundColor({ color: '#1b57c9' });

api.runtime.onInstalled.addListener(async () => {
  const o = await api.storage.local.get("settings");
  const s = o.settings || {};
  await api.storage.local.set({ settings: { ...DEF, ...s } });
});

api.tabs.onRemoved.addListener(tabId => {
  const e = M.get(tabId);
  if (!e) return;
  if (e.badgeInterval) clearInterval(e.badgeInterval);
  if (e.timeoutTimer)  clearTimeout(e.timeoutTimer);
  if (e.quietTimer)    clearTimeout(e.quietTimer);
  M.delete(tabId);
});