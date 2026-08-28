const DEFAULTS = {
  enabled: true,
  includePatterns: [],
  excludePatterns: ["localhost", "127.0.0.1"],
  slowThresholdMs: 3000,
  siteRules: {
    "example.com": [
      { mode: "loader", selector: ".mx-grid-loading", hiddenClass: "ng-hide", debounceMs: 300, maxMs: 120000 },
      { mode: "text", selector: ".mx-aria-only", text: "Chargement", caseSensitive: false, debounceMs: 300, maxMs: 120000 }
    ]
  }
};

let settings;

function row(h = "", r = { mode: "xhr" }) {
  let d   = el("div", undefined, "rule");
  let hi  = el("input");
  let mode = el("select");
  let sel = el("input");
  let val = el("input");
  let cl  = el("label", undefined, "case");
  let cb  = el("input");
  let del = el("button", "×", "del");

  hi.className = "rh";
  hi.placeholder = "domaine";
  hi.value = h;

  mode.className = "rm";
  for (let [v, t] of [["xhr", "XHR + calme 5 s"], ["xhr-action", "XHR action utilisateur"], ["loader", "Loader CSS"], ["text", "Loader texte"]]) {
    let o = el("option", t);
    o.value = v;
    mode.append(o);
  }
  mode.value = r.mode;

  sel.className = "rs";
  sel.placeholder = "Sélecteur CSS";
  sel.value = r.selector || "";

  val.className = "rv";

  cb.type = "checkbox";
  cb.className = "rcase";
  cb.checked = !!r.caseSensitive;
  cl.append(cb, el("span", "Respecter la casse"));

  del.type = "button";
  del.onclick = () => d.remove();

  function adapt(reset = false) {
    if (reset) val.value = "";
    val.placeholder = mode.value === "text" ? "Texte contenu" : "Classe cachée";
    if (!reset) val.value = mode.value === "text" ? (r.text || "") : (r.hiddenClass || "");
    cl.style.display = mode.value === "text" ? "flex" : "none";
  }

  mode.onchange = () => adapt(true);
  adapt();

  d.append(hi, mode, sel, val, cl, del);
  rules.append(d);
}

(async () => {
  let o = await api.storage.local.get("settings");
  let s = o.settings || {};
  let raw = { ...DEFAULTS.siteRules, ...(s.siteRules || {}) };
  let siteRules = {};
  for (let [h, v] of Object.entries(raw)) siteRules[h] = Array.isArray(v) ? v : v ? [v] : [];
  settings = { ...DEFAULTS, ...s, siteRules };
  enabled.checked = settings.enabled;
  includePatterns.value = settings.includePatterns.join("\n");
  excludePatterns.value = settings.excludePatterns.join("\n");
  slowThresholdMs.value = settings.slowThresholdMs;
  for (let [h, list] of Object.entries(siteRules).sort(([a], [b]) => a.localeCompare(b))) {
    for (let r of list) row(h, r);
  }
})();

add.onclick = () => row();

template.onchange = () => {
  let v = template.value;
  if (v === "xhr")       row("example.com", { mode: "xhr" });
  if (v === "xhr-action") row("example.com", { mode: "xhr-action" });
  if (v === "bootstrap") row("example.com", { mode: "loader", selector: ".spinner-border", hiddenClass: "d-none" });
  if (v === "aria")     row("example.com", { mode: "text", selector: '[role="status"]', text: "Loading" });
  if (v === "skeleton") row("example.com", { mode: "loader", selector: ".skeleton, .skeleton-loader", hiddenClass: "d-none" });
  if (v === "business") {
    row("example.com", { mode: "loader", selector: ".mx-grid-loading", hiddenClass: "ng-hide" });
    row("example.com", { mode: "text", selector: ".mx-aria-only", text: "Chargement" });
  }
  template.value = "";
};

form.onsubmit = async e => {
  e.preventDefault();
  let siteRules = {};
  for (let d of document.querySelectorAll(".rule")) {
    let h        = d.querySelector(".rh").value.trim().toLowerCase();
    let mode     = d.querySelector(".rm").value;
    let selector = d.querySelector(".rs").value.trim();
    let v        = d.querySelector(".rv").value.trim();
    if (!h) continue;
    let rule = { mode, selector, debounceMs: 300, maxMs: 120000 };
    if (mode === "text") {
      rule.text = v;
      rule.caseSensitive = d.querySelector(".rcase").checked;
    } else if (mode === "loader") {
      rule.hiddenClass = v;
    }
    (siteRules[h] ||= []).push(rule);
  }

  const lines = id => document.getElementById(id).value.split(/\r?\n/).map(x => x.trim().toLowerCase()).filter(Boolean);
  const newExclude  = lines("excludePatterns");
  const prevExclude = settings.excludePatterns || [];
  const newlyExcluded = newExclude.filter(p => !prevExclude.includes(p));

  if (newlyExcluded.length) {
    let o2 = await api.storage.local.get(["stats", "dailyStats"]);
    let S  = o2.stats || {};
    let D  = o2.dailyStats || {};

    function matchExclude(h, p) {
      p = p.trim().toLowerCase();
      if (p.startsWith("*.")) {
        let x = p.slice(2);
        return h === x || h.endsWith("." + x);
      }
      return h === p || h.endsWith("." + p);
    }

    for (let h of Object.keys(S)) {
      if (newlyExcluded.some(p => matchExclude(h, p))) delete S[h];
    }
    for (let h of Object.keys(D)) {
      if (newlyExcluded.some(p => matchExclude(h, p))) delete D[h];
    }
    await api.storage.local.set({ stats: S, dailyStats: D });
  }

  await api.storage.local.set({
    settings: {
      ...settings,
      enabled: enabled.checked,
      includePatterns: lines("includePatterns"),
      excludePatterns: newExclude,
      slowThresholdMs: Number(slowThresholdMs.value),
      siteRules
    }
  });
  saved.textContent = "Enregistré";
};

reset.addEventListener("click", async () => {
  if (!confirm("Effacer toutes les mesures ?")) return;
  await api.storage.local.remove(["stats", "dailyStats"]);
  saved.textContent = "Mesures supprimées";
});