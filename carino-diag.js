/* ============================================================
   carino-diag.js — opt-in "Sys. Status" panel for the shared navbar.
   ------------------------------------------------------------
   Drop this file into any NETWORK-oriented Carino project and add
   it AFTER carino-navbar.js:

     <script src="carino-navbar.js" data-app="AppName" defer></script>
     <script src="carino-diag.js" defer></script>

   It adds a "Sys. Status" button to the navbar's right cluster and
   a dropdown reporting the visitor's public IPv4/IPv6, ISP,
   connection type and round-trip time. This is the in-navbar
   replacement for the retired standalone IP-lookup site, so any
   network tool can carry it without its own subdomain.

   Two deliberate differences from the hub's dropdown:
     * Network only — no hardware/GPU/battery probing. Those belong
       to hardware.carino.systems, not to a network tool.
     * Lazy — nothing is requested until the panel is first opened,
       so simply loading the page contacts no third party.

   Self-contained: styles are inlined and scoped under #cnDiagBox /
   #cnDiagBtn with hard-coded colours (no CSS variables), so it is
   safe on light-themed or Tailwind pages and needs no CDN.
   ============================================================ */
(function () {
  'use strict';

  var A = '#eab308', BG = '#0f0f0f', BORDER = '#262626', MUTED = '#8a8a8a', TEXT = '#fff';
  var MONO = '"IBM Plex Mono",ui-monospace,SFMono-Regular,Menlo,monospace';

  var CSS = ''
    + '#cnDiagBtn{display:flex;align-items:center;gap:8px;background:transparent;border:1px solid ' + BORDER + ';'
    + 'color:' + MUTED + ';font-family:' + MONO + ';font-size:.72rem;text-transform:uppercase;letter-spacing:.1em;'
    + 'padding:0 14px;height:32px;border-radius:4px;cursor:pointer;transition:.2s;white-space:nowrap;}'
    + '#cnDiagBtn:hover{border-color:' + A + ';color:' + A + ';background:rgba(234,179,8,.08);}'
    + '#cnDiagBtn .cn-pulse{width:6px;height:6px;border-radius:50%;background:' + A + ';box-shadow:0 0 8px ' + A + ';'
    + 'animation:cnPulseGlow 2s ease-in-out infinite;flex-shrink:0;}'
    + '@keyframes cnPulseGlow{0%,100%{opacity:1;}50%{opacity:.4;}}'
    + '@keyframes cnScan{0%,100%{opacity:1;}50%{opacity:.25;}}'

    + '#cnDiagBox{position:fixed;top:70px;right:20px;width:360px;max-width:calc(100vw - 40px);'
    + 'background:' + BG + ';border:1px solid rgba(234,179,8,.45);padding:18px;border-radius:6px;'
    + 'box-shadow:0 10px 40px rgba(0,0,0,.8);opacity:0;pointer-events:none;transform:translateY(-10px);'
    + 'transition:all .3s cubic-bezier(.2,.8,.2,1);z-index:2147483001;font-family:' + MONO + ';'
    + 'text-align:left;color:' + TEXT + ';}'
    + '#cnDiagBox.open{opacity:1;pointer-events:auto;transform:translateY(0);}'
    + '#cnDiagBox *{box-sizing:border-box;}'
    + '#cnDiagBox .d-row{display:flex;justify-content:space-between;align-items:center;gap:12px;'
    + 'margin-bottom:8px;font-size:.75rem;line-height:1.4;}'
    + '#cnDiagBox .d-lbl{color:' + MUTED + ';text-transform:uppercase;letter-spacing:.05em;flex-shrink:0;}'
    + '#cnDiagBox .d-val{color:' + TEXT + ';text-align:right;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;}'
    + '#cnDiagBox .d-grp{display:flex;align-items:center;gap:6px;min-width:0;justify-content:flex-end;}'
    + '#cnDiagBox .d-sec{color:' + MUTED + ';font-size:.62rem;text-transform:uppercase;letter-spacing:.1em;'
    + 'margin:0 0 8px;opacity:.45;border-bottom:1px solid ' + BORDER + ';padding-bottom:3px;}'
    + '#cnDiagBox .d-head{border-bottom:1px solid ' + BORDER + ';padding-bottom:8px;margin-bottom:14px;}'
    + '#cnDiagBox .dot{width:5px;height:5px;border-radius:50%;display:inline-block;flex-shrink:0;background:#525252;}'
    + '#cnDiagBox .dot.ok{background:' + A + ';box-shadow:0 0 4px ' + A + ';}'
    + '#cnDiagBox .dot.bad{background:#dc2626;box-shadow:0 0 4px #dc2626;}'
    + '#cnDiagBox .dot.scan{background:#d4d4d4;animation:cnScan 1s infinite;}'
    + '#cnDiagBox .d-btn{display:flex;align-items:center;justify-content:center;gap:5px;width:100%;'
    + 'margin-top:14px;background:transparent;border:1px solid ' + BORDER + ';color:' + MUTED + ';'
    + 'font-family:' + MONO + ';font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;'
    + 'padding:7px;border-radius:4px;cursor:pointer;transition:.2s;}'
    + '#cnDiagBox .d-btn:hover{border-color:' + A + ';color:' + A + ';}'
    + '#cnDiagBox .d-btn svg{width:12px;height:12px;}'
    + '@media(max-width:520px){#cnDiagBtn span.lbl{display:none;}#cnDiagBtn{padding:0 10px;}}';

  var RETRY_PATH = '<path d="M23 4v6h-6"/><path d="M1 20v-6h6"/>'
    + '<path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>';

  var BOX = ''
    + '<div class="d-row d-head"><span class="d-lbl">Last Check</span>'
    + '<span class="d-val" id="cnDiagLast" style="color:' + A + '">--:--</span></div>'
    + '<div class="d-sec">Network</div>'
    + '<div class="d-row"><span class="d-lbl">IPv4</span><div class="d-grp">'
    + '<span class="d-val" id="cnDiagV4">--</span><span class="dot" id="cnDiagDot4"></span></div></div>'
    + '<div class="d-row"><span class="d-lbl">IPv6</span><div class="d-grp">'
    + '<span class="d-val" id="cnDiagV6">--</span><span class="dot" id="cnDiagDot6"></span></div></div>'
    + '<div class="d-row"><span class="d-lbl">ISP</span><span class="d-val" id="cnDiagISP">--</span></div>'
    + '<div class="d-row"><span class="d-lbl">Conn</span><span class="d-val" id="cnDiagConn">--</span></div>'
    + '<div class="d-row"><span class="d-lbl">RTT</span><span class="d-val" id="cnDiagPing">--</span></div>'
    + '<button class="d-btn" id="cnDiagRetry">'
    + '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">' + RETRY_PATH + '</svg>'
    + 'Refresh</button>';

  function $(id) { return document.getElementById(id); }
  function set(id, v) { var el = $(id); if (el) el.textContent = v; }
  function dot(id, cls) { var el = $(id); if (el) el.className = 'dot' + (cls ? ' ' + cls : ''); }

  /* ---- probes (same providers and fallback order as the hub) ---- */

  function fetchJSON(url, timeoutMs) {
    var ctrl = new AbortController();
    var t = setTimeout(function () { ctrl.abort(); }, timeoutMs || 4000);
    return fetch(url, { mode: 'cors', signal: ctrl.signal, cache: 'no-store' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .finally(function () { clearTimeout(t); });
  }

  // Walk the provider list in order, resolving on the first that answers.
  function tryProviders(list) {
    return list.reduce(function (chain, next) {
      return chain.catch(next);
    }, Promise.reject());
  }

  // Firefox's tracking protection blocks these endpoints outright, so a failure
  // there means "blocked", not "you have no address" — say so rather than
  // reporting a red failure the visitor cannot act on.
  var isFirefox = /Firefox\//.test(navigator.userAgent);

  function detectIPs() {
    set('cnDiagV4', '...'); set('cnDiagV6', '...');
    dot('cnDiagDot4', 'scan'); dot('cnDiagDot6', 'scan');

    var v4 = tryProviders([
      function () { return fetchJSON('https://api4.ipify.org?format=json').then(function (d) { return d.ip; }); },
      function () { return fetchJSON('https://api.ipify.org?format=json').then(function (d) { return d.ip; }); },
      function () { return fetchJSON('https://ipapi.co/json/').then(function (d) { return d.ip; }); }
    ]);
    var v6 = tryProviders([
      function () { return fetchJSON('https://api6.ipify.org?format=json').then(function (d) { return d.ip; }); },
      function () { return fetchJSON('https://api64.ipify.org?format=json').then(function (d) { return d.ip; }); },
      function () { return fetchJSON('https://ipapi.co/json/').then(function (d) { return d.ip; }); }
    ]);

    return Promise.allSettled([v4, v6]).then(function (r) {
      var a = r[0], b = r[1];
      if (a.status === 'fulfilled' && String(a.value).indexOf('.') > -1) {
        set('cnDiagV4', a.value); dot('cnDiagDot4', 'ok');
      } else {
        set('cnDiagV4', isFirefox ? 'Blocked by browser' : 'Unavailable');
        dot('cnDiagDot4', isFirefox ? '' : 'bad');
      }
      if (b.status === 'fulfilled' && String(b.value).indexOf(':') > -1) {
        set('cnDiagV6', b.value); dot('cnDiagDot6', 'ok');
      } else {
        set('cnDiagV6', isFirefox ? 'Blocked by browser' : 'Not detected');
        dot('cnDiagDot6', '');
      }
    });
  }

  function detectISP() {
    set('cnDiagISP', '...');
    return fetchJSON('https://ipapi.co/json/', 5000).then(function (d) {
      var org = (d.org || '').replace(/^AS\d+\s+/i, '').trim();
      set('cnDiagISP', org || 'Unknown');
    }).catch(function () {
      set('cnDiagISP', isFirefox ? 'Blocked by browser' : 'Unavailable');
    });
  }

  function detectConn() {
    var c = navigator.connection;
    if (!c) { set('cnDiagConn', 'N/A'); return; }
    var type = (c.type && c.type !== 'unknown') ? c.type : (c.effectiveType || null);
    set('cnDiagConn', type ? String(type).toUpperCase() : 'Unknown');
  }

  // Round-trip to this same page: no third party, and it measures the path the
  // visitor actually cares about.
  function checkPing() {
    var start = performance.now();
    return fetch(window.location.href, { method: 'HEAD', cache: 'no-store' })
      .then(function () { set('cnDiagPing', Math.round(performance.now() - start) + ' ms'); })
      .catch(function () { set('cnDiagPing', 'Timeout'); });
  }

  var running = false;
  function refresh() {
    if (running) return;
    running = true;
    detectConn();
    Promise.allSettled([detectIPs(), detectISP(), checkPing()]).then(function () {
      var d = new Date();
      set('cnDiagLast', String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'));
      running = false;
    });
  }

  /* ---- wiring ---- */

  function build(nav) {
    if ($('cnDiagBtn')) return;

    var style = document.createElement('style');
    style.id = 'carino-diag-style';
    style.textContent = CSS;
    document.head.appendChild(style);

    var btn = document.createElement('button');
    btn.id = 'cnDiagBtn';
    btn.type = 'button';
    btn.title = 'Public IP and connection status';
    btn.innerHTML = '<span class="lbl">Sys. Status</span><span class="cn-pulse"></span>';

    // Sit to the LEFT of the social icons, matching the hub's ordering.
    var right = nav.querySelector('.cn-right');
    if (!right) return;
    var social = right.querySelector('.social-row');
    if (social) right.insertBefore(btn, social); else right.appendChild(btn);

    var box = document.createElement('div');
    box.id = 'cnDiagBox';
    box.innerHTML = BOX;
    document.body.appendChild(box);

    var loaded = false;
    btn.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = box.classList.toggle('open');
      // Lazy: the first open is what triggers any outbound request.
      if (open && !loaded) { loaded = true; refresh(); }
    });

    $('cnDiagRetry').addEventListener('click', function (e) { e.stopPropagation(); refresh(); });
    box.addEventListener('click', function (e) { e.stopPropagation(); });
    document.addEventListener('click', function () { box.classList.remove('open'); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') box.classList.remove('open');
    });
  }

  // carino-navbar.js injects #carinoNav on DOMContentLoaded; both scripts are
  // deferred so order is not guaranteed. Watch for the navbar instead of
  // assuming it is already there.
  function start() {
    var nav = document.getElementById('carinoNav');
    if (nav) { build(nav); return; }
    var obs = new MutationObserver(function () {
      var n = document.getElementById('carinoNav');
      if (n) { obs.disconnect(); build(n); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(function () { obs.disconnect(); }, 10000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
