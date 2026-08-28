let started = false;
const slowRequests = [];

(function patchXHR() {
  const OrigXHR = XMLHttpRequest;
  function PatchedXHR() {
    const xhr  = new OrigXHR();
    let method = 'GET';
    let url    = '';
    let t0     = 0;
    const origOpen = xhr.open.bind(xhr);
    const origSend = xhr.send.bind(xhr);
    xhr.open = function(m, u, ...rest) {
      method = (m || '').toUpperCase();
      url    = u || '';
      return origOpen(m, u, ...rest);
    };
    xhr.send = function(...args) {
      if (method === 'POST') {
        t0 = Date.now();
        xhr.addEventListener('loadend', () => {
          const ms = Date.now() - t0;
          if (ms >= 500) {
            try {
              const h = new URL(url, location.href).hostname.toLowerCase().replace(/^www\./, '');
              if (!slowRequests.some(r => r.url === url)) {
                slowRequests.push({ url, host: h, ms });
              }
            } catch {}
          }
        });
      }
      return origSend(...args);
    };
    return xhr;
  }
  PatchedXHR.prototype = OrigXHR.prototype;
  window.XMLHttpRequest = PatchedXHR;
})();

(function patchFetch() {
  const origFetch = window.fetch.bind(window);
  window.fetch = function(input, init, ...rest) {
    const method = ((init?.method) || 'GET').toUpperCase();
    const url    = typeof input === 'string' ? input : input?.url || '';
    if (method === 'POST') {
      const t0 = Date.now();
      return origFetch(input, init, ...rest).then(res => {
        const ms = Date.now() - t0;
        if (ms >= 500) {
          try {
            const h = new URL(url, location.href).hostname.toLowerCase().replace(/^www\./, '');
            if (!slowRequests.some(r => r.url === url)) {
              slowRequests.push({ url, host: h, ms });
            }
          } catch {}
        }
        return res;
      });
    }
    return origFetch(input, init, ...rest);
  };
})();

// --- Observation live du DOM pour l analyse ---
let liveObserver   = null;
let liveCandidates = null;

(function checkLiveAnalysisResume() {
  try {
    if (sessionStorage.getItem('fftll_live_analysis') === '1') {
      sessionStorage.removeItem('fftll_live_analysis');
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => startLiveAnalysis(), { once: true });
      } else {
        startLiveAnalysis();
      }
    }
  } catch {}
})();

function isDynamicId(id) {
  if (!id) return true;
  // GUID : xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
  if (/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(id)) return true;
  // Nombre long (> 6 chiffres)
  if (/\d{6,}/.test(id)) return true;
  // Prefixes generes
  if (/^ng-|^v-|^js-|__|:/.test(id)) return true;
  // IDs avec segments aleatoires : lettres+chiffres melanges (ex: popper_c0413saz_ctw7ta)
  if (/[a-z]\d[a-z]|\d[a-z]\d/i.test(id)) return true;
  // Trop long
  if (id.length > 60) return true;
  return false;
}

function normalizeId(id) {
  // Remplace les suffixes numeriques par un selecteur [id^=...]
  // ex: menu_container_28 -> [id^="menu_container_"]
  let m = id.match(/^(.+?)(_|-)(\d+)$/);
  if (m && m[1].length > 2) {
    return '[id^="' + m[1] + m[2] + '"]';
  }
  // ex: menuItem28 -> [id^="menuItem"]
  m = id.match(/^([a-zA-Z_-]{3,})(\d+)$/);
  if (m) {
    return '[id^="' + m[1] + '"]';
  }
  return '#' + id;
}

function selectorFor(el) {
  try {
    let tag  = el.tagName.toLowerCase();
    let cls  = [...el.classList]
      .filter(c => c.length > 1 && !/^ng-|^v-|^js-/.test(c) && !/\d{4,}/.test(c))
      .slice(0, 3)
      .map(c => '.' + c)
      .join('');
    let id   = (!isDynamicId(el.id) && el.id) ? normalizeId(el.id) : '';
    let role = el.getAttribute('role') ? '[role="' + el.getAttribute('role') + '"]' : '';
    let sel  = tag + (id || cls || role);
    // Rejette si contient encore un GUID ou nombre long
    if (/[0-9a-f]{8}-[0-9a-f]{4}/i.test(sel) || /\d{6,}/.test(sel)) return null;
    return sel || tag;
  } catch {
    return null;
  }
}

function startLiveAnalysis() {
  liveCandidates = new Map();

  function isLoaderLike(el) {
    const txt = (el.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
    const cls = (el.className || '').toLowerCase();
    const id  = (el.id || '').toLowerCase();
    return /load|spin|wait|progress|skeleton|overlay|backdrop|busy|charg/.test(cls + id + txt);
  }

  // Elements interactifs : jamais des loaders
  const NOT_LOADER_TAGS = new Set(['input', 'button', 'select', 'option', 'a', 'textarea', 'label', 'li', 'ul', 'ol', 'nav', 'header', 'footer', 'script', 'style', 'link', 'meta']);

  function recordElement(el) {
    try {
      if (!el || el.nodeType !== 1) return;
      if (NOT_LOADER_TAGS.has(el.tagName.toLowerCase())) return;
      const sel = selectorFor(el);
      if (!sel) return;
      const hiddenClasses = ['ng-hide', 'd-none', 'hidden', 'invisible', 'v-hidden'];
      const hasHiddenClass = hiddenClasses.some(c => el.classList.contains(c));
      const ariaHidden     = el.getAttribute('aria-hidden') === 'true';
      const isHidden       = hasHiddenClass || ariaHidden ||
                             getComputedStyle(el).display === 'none' ||
                             getComputedStyle(el).visibility === 'hidden';
      if (!isLoaderLike(el) && !isHidden) return;
      if (!liveCandidates.has(sel)) {
        const hiddenClass = hiddenClasses.find(c => el.classList.contains(c)) || '';
        const txt = (el.textContent || '').replace(/\s+/g, ' ').trim();
        const txtMatch = txt.match(/loading|chargement|please wait|patientez|charg/i);
        liveCandidates.set(sel, {
          selector:    sel,
          hiddenClass: hiddenClass,
          text:        txtMatch ? txtMatch[0] : '',
          changes:     0,
          hasText:     !!txtMatch
        });
      }
      liveCandidates.get(sel).changes++;
    } catch {}
  }

  liveObserver = new MutationObserver(mutations => {
    for (let mut of mutations) {
      if (mut.type === 'childList') {
        for (let n of [...mut.addedNodes, ...mut.removedNodes]) {
          recordElement(n);
        }
      }
      if (mut.type === 'attributes') recordElement(mut.target);
      if (mut.type === 'characterData' && mut.target.parentElement) recordElement(mut.target.parentElement);
    }
  });

  liveObserver.observe(document, {
    subtree:       true,
    childList:     true,
    characterData: true,
    attributes:    true,
    attributeFilter: ['class', 'style', 'aria-hidden', 'aria-busy', 'hidden']
  });
}

function stopLiveAnalysis() {
  if (liveObserver) {
    liveObserver.disconnect();
    liveObserver = null;
  }
}

function getLiveCandidates() {
  if (!liveCandidates) return [];
  let out = [];
  for (let [key, c] of liveCandidates.entries()) {
    if (c.changes < 1) continue;
    if (c.hasText && c.text) {
      out.push({ mode: 'text', selector: c.selector, value: c.text, label: 'Loader texte detecte en live : ' + c.selector });
    } else {
      out.push({ mode: 'loader', selector: c.selector, value: c.hiddenClass || 'ng-hide', label: 'Loader CSS detecte en live : ' + c.selector });
    }
  }
  return out;
}

async function monitor() {
  if (started) return;
  let c = await browser.runtime.sendMessage({ type: 'config', url: location.href });
  if (!c?.enabled) return;
  started = true;

  let session = false;
  let endTimer;
  let maxTimer;

  function active(r) {
    try {
      let es = [...document.querySelectorAll(r.selector || '')];
      if (r.mode === 'text') {
        return es.some(e => {
          let a = (e.textContent || '').replace(/\s+/g, ' ').trim();
          let b = (r.text || '').trim();
          if (!r.caseSensitive) { a = a.toLowerCase(); b = b.toLowerCase(); }
          return b && a.includes(b);
        });
      }
      return es.some(e =>
        e.isConnected &&
        !e.classList.contains(r.hiddenClass || 'ng-hide') &&
        e.getAttribute('aria-hidden') !== 'true' &&
        getComputedStyle(e).display !== 'none' &&
        getComputedStyle(e).visibility !== 'hidden'
      );
    } catch {
      return false;
    }
  }

  function stop() {
    if (!session) return;
    session = false;
    clearTimeout(maxTimer);
    browser.runtime.sendMessage({ type: 'visualEnd', host: c.host, time: Date.now() });
  }

  function check() {
    let any = c.rules.some(active);
    if (any && !session) {
      clearTimeout(endTimer);
      session = true;
      browser.runtime.sendMessage({ type: 'visualStart', host: c.host, time: Date.now() });
      maxTimer = setTimeout(stop, Math.max(...c.rules.map(r => +r.maxMs || 120000)));
    } else if (!any && session) {
      endTimer = setTimeout(() => {
        if (!c.rules.some(active)) stop();
      }, Math.max(...c.rules.map(r => +r.debounceMs || 300)));
    }
  }

  new MutationObserver(check).observe(document, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style', 'aria-hidden', 'aria-busy']
  });
  check();
}

function analyze() {
  let out  = [];
  let seen = new Set();

  const add = (mode, selector, value, label) => {
    let k = mode + selector + value;
    if (!seen.has(k)) {
      seen.add(k);
      out.push({ mode, selector, value, label });
    }
  };

  for (let s of [
    '.spinner-border',
    '.spinner-grow',
    '.spinner',
    '.loader',
    '.loading',
    '.loading-spinner',
    '.skeleton',
    '.skeleton-loader',
    '[aria-busy="true"]'
  ]) {
    if (document.querySelector(s)) {
      add('loader', s, s.includes('aria-busy') ? '' : 'd-none', 'Loader CSS detecte');
    }
  }

  for (let s of [
    '[role="status"]',
    '[role="alert"]',
    '.visually-hidden',
    '.sr-only',
    '.mx-aria-only'
  ]) {
    for (let e of document.querySelectorAll(s)) {
      let m = (e.textContent || '').match(/loading|chargement|please wait|patientez/i);
      if (m) {
        add('text', s, m[0], 'Loader texte detecte');
        break;
      }
    }
  }

  for (let c of getLiveCandidates()) {
    add(c.mode, c.selector, c.value, c.label);
  }

  if (slowRequests.length > 0) {
    const best = slowRequests.reduce((a, b) => b.ms > a.ms ? b : a);
    add('xhr-action', '', '', 'Requete POST lente detectee (' + best.ms + ' ms) - mesure XHR par action utilisateur');
  } else {
    const actionSelectors = [
      'form[action]',
      'form input[type="search"]',
      'input[type="search"]',
      '[role="search"]',
      'button[type="submit"]',
      '.search-form',
      '.search-bar',
      '.search-box',
      '#search',
      '#searchForm',
      '[data-search]'
    ];
    if (actionSelectors.some(s => document.querySelector(s))) {
      add('xhr-action', '', '', 'Formulaire / interaction detecte - mesure XHR par action utilisateur');
    }
  }

  return {
    host:       location.hostname.toLowerCase().replace(/^www\./, ''),
    candidates: out
  };
}

browser.runtime.onMessage.addListener(m => {
  if (m.type === 'analyzePage')       return Promise.resolve(analyze());
  if (m.type === 'startLiveAnalysis') { startLiveAnalysis(); return Promise.resolve({ ok: true }); }
  if (m.type === 'stopLiveAnalysis')  { stopLiveAnalysis();  return Promise.resolve({ ok: true }); }
  if (m.type === 'hasLiveResults')    return Promise.resolve({ ready: liveCandidates !== null && liveCandidates.size > 0 });
  if (m.type === 'markLiveAnalysis')  {
    try { sessionStorage.setItem('fftll_live_analysis', '1'); } catch {}
    return Promise.resolve({ ok: true });
  }
  return undefined;
});

document.readyState === 'loading'
  ? document.addEventListener('DOMContentLoaded', monitor, { once: true })
  : monitor();