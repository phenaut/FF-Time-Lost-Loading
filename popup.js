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
    ["Cette année", p.year]
  ].map(([l, v]) => {
    let d = el("div");
    d.append(el("span", l), el("b", fd(v)));
    return d;
  }));

  enabled.onchange = () => api.storage.local.set({ settings: { ...(o.settings || {}), enabled: enabled.checked } });
  dash.onclick     = () => api.tabs.create({ url: api.runtime.getURL("dashboard.html") });
  opts.onclick     = () => api.runtime.openOptionsPage();

  analyze.disabled = !h;
  analyze.onclick = async () => {
    analysis.replaceChildren(el("p", "Analyse en cours…"));
    try {
      let r = await api.tabs.sendMessage(tab.id, { type: "analyzePage" });
      let checks = [];
      analysis.replaceChildren(el("h3", `Suggestions pour ${r.host}`));

      for (let c of r.candidates || []) {
        let label = el("label", undefined, "candidate");
        let box   = el("input");
        box.type    = "checkbox";
        box.checked = true;
        let desc = c.mode === "xhr-action"
          ? c.label
          : `${c.label} : ${c.selector}${c.mode === "text" ? " → " + c.value : ""}`;
        label.append(box, el("span", desc));
        analysis.append(label);
        checks.push([box, c]);
      }

      let b = el("button", checks.length ? "Ajouter les règles sélectionnées" : "Ajouter une règle XHR", "suggest");
      b.type = "button";
      b.onclick = async () => {
        let selected = checks.filter(([x]) => x.checked).map(([, c]) => c);
        if (!selected.length) selected = [{ mode: "xhr", selector: "", value: "" }];

        let st        = await api.storage.local.get("settings");
        let settings  = st.settings || {};
        let siteRules = { ...(settings.siteRules || {}) };
        let cur = Array.isArray(siteRules[r.host])
          ? siteRules[r.host]
          : siteRules[r.host] ? [siteRules[r.host]] : [];

        for (let c of selected) {
          let rule = { mode: c.mode, selector: c.selector || "", debounceMs: 300, maxMs: 120000 };
          if (c.mode === "text") {
            rule.text = c.value;
            rule.caseSensitive = false;
          } else if (c.mode === "loader") {
            rule.hiddenClass = c.value || "";
          } else if (c.mode === "xhr-action") {
            rule.selector = "";
          }
          cur.push(rule);
        }
        siteRules[r.host] = cur;
        await api.storage.local.set({ settings: { ...settings, siteRules } });
        analysis.replaceChildren(el("p", `${selected.length} règle(s) ajoutée(s). Rechargez la page.`, "success"));
      };
      analysis.append(b);
    } catch {
      analysis.replaceChildren(el("p", "Analyse impossible. Rechargez l'onglet puis réessayez."));
    }
  };
})();
