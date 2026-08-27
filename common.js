const api = browser;

function fd(ms) {
  let s = Math.round(ms / 1000);
  let h = Math.floor(s / 3600);
  s %= 3600;
  let m = Math.floor(s / 60);
  s %= 60;
  return [h && `${h} h`, m && `${m} min`, `${s} s`].filter(Boolean).join(" ");
}

function fm(ms) {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`;
}

function day(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function totals(S, G, h = null) {
  let d = day();
  let m = d.slice(0, 7);
  let y = d.slice(0, 4);
  let hs = h ? [h] : Object.keys(S || {});
  let today = 0, month = 0, year = 0;
  for (let k of hs) {
    today += G?.[k]?.[d]?.totalMs || 0;
    for (let [q, v] of Object.entries(S?.[k] || {})) {
      if (q === m) month += v.totalMs || 0;
      if (q.startsWith(y + "-")) year += v.totalMs || 0;
    }
  }
  return { today, month, year };
}

function el(tag, text, cls) {
  let n = document.createElement(tag);
  if (text !== undefined) n.textContent = text;
  if (cls) n.className = cls;
  return n;
}