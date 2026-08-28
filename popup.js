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

  function highlightDesc(text) {
    let span = document.createElement("span");
    let regex = /(load|charge)/gi;
    let last = 0, match;
    while ((match = regex.exec(text)) !== null) {
      if (match.index > last) span.appendChild(document.createTextNode(text.slice(last, match.index)));
      let b = document.createElement("b");
      b.textContent = match[0];
      span.appendChild(b);
      last = regex.lastIndex;
    }
    if (last < text.length) span.appendChild(document.createTextNode(text.slice(last)));
    return span;
  }

  function showResults(r) {
    let checks = [];
    analysis.replaceChildren(el("h3", "Suggestions pour " + r.host));
    if (!r.candidates || r.candidates.length === 0) {
      analysis.append(el("p", "Aucun loader detecte. Essayez sur une page avec du chargement visible."));
    }
    for (let c of r.candidates || []) {
      let label = el("label", undefined, "candidate");
      let box   = el("input");
      box.type    = "checkbox";
      box.checked = false;
      let desc = c.mode === "xhr-action"
        ? c.label
        : c.label + " : " + c.selector + (c.mode === "text" ? " -> " + c.value : "");
      label.append(box, highlightDesc(desc));
      analysis.append(label);
      checks.push([box, c]);
    }
    let b = el("button", checks.length ? "Ajouter les regles selectionnees" : "Ajouter une regle XHR", "suggest");
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
        // Evite les doublons : on ne rajoute pas une regle identique
        const isDuplicate = cur.some(existing =>
          existing.mode === rule.mode &&
          (existing.selector || "") === (rule.selector || "") &&
          (existing.hiddenClass || "") === (rule.hiddenClass || "") &&
          (existing.text || "") === (rule.text || "")
        );
        if (!isDuplicate) cur.push(rule);
      }
      siteRules[r.host] = cur;
      await api.storage.local.set({ settings: { ...settings, siteRules } });
      analysis.replaceChildren(el("p", selected.length + " regle(s) ajoutee(s). Rechargez la page.", "success"));
    };
    analysis.append(b);
  }

  analyze.disabled = !h;
  analyze.onclick = async () => {
    try {
      // Verifie si des resultats live sont deja disponibles
      let check = await api.tabs.sendMessage(tab.id, { type: "hasLiveResults" });
      if (check?.ready) {
        analysis.replaceChildren(el("p", "Collecte des resultats..."));
        await api.tabs.sendMessage(tab.id, { type: "stopLiveAnalysis" });
        let r = await api.tabs.sendMessage(tab.id, { type: "analyzePage" });
        showResults(r);
        return;
      }
    } catch {}
    // Pas de resultats : propose le rechargement
    analysis.replaceChildren(
      el("p", "L'analyse va recharger la page et observer les loaders en temps reel."),
      el("p", "Rouvrez le popup apres le chargement pour voir les resultats.")
    );
    let b = el("button", "Recharger et analyser", "suggest");
    b.type = "button";
    b.onclick = async () => {
      try {
        await api.tabs.sendMessage(tab.id, { type: "markLiveAnalysis" });
      } catch {}
      await api.tabs.reload(tab.id);
      window.close();
    };
    analysis.append(b);
  };

  // Auto-affichage si resultats live disponibles a l'ouverture du popup
  try {
    let check = await api.tabs.sendMessage(tab.id, { type: "hasLiveResults" });
    if (check?.ready) {
      await api.tabs.sendMessage(tab.id, { type: "stopLiveAnalysis" });
      let r = await api.tabs.sendMessage(tab.id, { type: "analyzePage" });
      showResults(r);
    }
  } catch {}
})();