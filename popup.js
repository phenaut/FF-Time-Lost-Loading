(async () => {
  let [tabs, o] = await Promise.all([
    api.tabs.query({ active: true, currentWindow: true }),
    api.storage.local.get(["stats", "dailyStats", "settings"])
  ]);
  let tab = tabs[0];
  let h = null;

  enabled.checked = o.settings?.enabled !== false;

  try {
    h = new URL(tab.url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {}

  site.replaceChildren();
  if (h) {
    site.append(el("small", "Temps perdu sur"), el("b", h));
  } else {
    site.append(el("span", "Page non mesurable"));
  }

  let p = totals(o.stats, o.dailyStats, h);
  periods.replaceChildren(...[
    ["Aujourd'hui", p.today],
    ["Ce mois",     p.month],
    ["Cette annee", p.year]
  ].map(([l, v]) => {
    let d = el("div");
    d.append(el("span", l), el("b", fd(v)));
    return d;
  }));

  enabled.onchange = () => api.storage.local.set({ settings: { ...(o.settings || {}), enabled: enabled.checked } });
  dash.onclick     = () => api.tabs.create({ url: api.runtime.getURL("dashboard.html") });
  opts.onclick     = () => api.runtime.openOptionsPage();
})();