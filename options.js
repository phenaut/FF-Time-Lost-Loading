const DEFAULTS = {
  enabled: true,
  excludePatterns: ["localhost", "127.0.0.1"],
  slowThresholdMs: 3000
};

let settings;

(async () => {
  let o = await api.storage.local.get("settings");
  let s = o.settings || {};
  settings = { ...DEFAULTS, ...s };
  enabled.checked = settings.enabled;
  excludePatterns.value = (settings.excludePatterns || []).join("\n");
  slowThresholdMs.value = settings.slowThresholdMs;
})();

form.onsubmit = async e => {
  e.preventDefault();

  const lines = id => document.getElementById(id).value
    .split(/\r?\n/)
    .map(x => x.trim().toLowerCase())
    .filter(Boolean);

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
      excludePatterns: newExclude,
      slowThresholdMs: Number(slowThresholdMs.value)
    }
  });
  settings.excludePatterns = newExclude;
  saved.textContent = "Enregistre";
};

reset.addEventListener("click", async () => {
  if (!confirm("Effacer toutes les mesures ?")) return;
  await api.storage.local.remove(["stats", "dailyStats"]);
  saved.textContent = "Mesures supprimees";
});