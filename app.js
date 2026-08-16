/* ══════════════════════════════════════════════════════════════
   CARINO OFFLINE — start · triage · stack · iron · sneakernet · playbook
   Six local JSON files, no dependencies, no network beyond the
   six same-origin fetches. State lives in localStorage only.

   Markup here is written against the class vocabulary defined in
   index.html's single <style> block. app.js owns no CSS.
   ══════════════════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ─────────────────────────────────────────────────────────────
     1. NAMESPACE & CONSTANTS
     ───────────────────────────────────────────────────────────── */

  const OFFLINE = (window.OFFLINE = window.OFFLINE || {});

  const K_GRAB  = 'carino.offline.grab';    // array of checked grab-item ids
  const K_PHASE = 'carino.offline.phases';  // array of "phaseId::taskIndex"

  /* tab key → panel id, hash, data file, and the app-bar header it sets.
     The hash names are the fleet-hub contract; do not rename them. */
  const SECTIONS = [
    { key: 'start', panel: 'panel-start', tab: 'tab-start', hash: 'start',      file: 'data/start.json',
      eyebrow: '00 — Start',
      title: 'Where to begin',
      desc: 'Five editable data files behind one plan: <b>what to download</b>, what to run, what to buy, how to move it physically, and what still breaks. Pick a section, or search all five at once — this page recommends, it configures nothing.',
      ph: 'Search all five sections — a tool, a disc, a threat, a line item…' },
    { key: 'grab',  panel: 'panel-grab',  tab: 'tab-grab',  hash: 'triage',     file: 'data/grablist.json',
      eyebrow: '01 — Triage',
      title: 'The Grab List',
      desc: 'The internet may go away. This is the order to pull things down in, and what fits in the time you actually have. Tick what you already hold — the totals and the readiness bar recompute as you go.',
      ph: 'Search the grab list — a tool, a mirror, a reason…' },
    { key: 'stack', panel: 'panel-stack', tab: 'tab-stack', hash: 'stack',      file: 'data/software.json',
      eyebrow: '02 — Stack',
      title: 'Software that survives the outage',
      desc: 'Every entry carries an offline rating: <b>full</b> works forever with the WAN unplugged, <b>sync</b> needs a periodic refresh to stay useful, <b>tethered</b> needs someone else\'s cloud and is listed as a warning.',
      ph: 'Search software — name, role, licence, tag…' },
    { key: 'iron',  panel: 'panel-iron',  tab: 'tab-iron',  hash: 'iron',       file: 'data/hardware.json',
      eyebrow: '03 — Iron',
      title: 'What the box costs',
      desc: 'A bill of materials for Mexico, mid-2026. Switch tiers to re-price the whole build. Anything that needs a vendor cloud to function is flagged with the way out — or with the advice not to buy it.',
      ph: 'Search hardware — part, spec, group, tag…' },
    { key: 'sneak', panel: 'panel-sneak', tab: 'tab-sneak', hash: 'sneakernet', file: 'data/sneakernet.json',
      eyebrow: '04 — Sneakernet',
      title: 'The physical layer',
      desc: 'Optical, print, NFC, 3D printing, USB and radio treated as infrastructure with real throughput. A car full of BD-R still beats a filtered link, and nothing here can be blocked at the resolver.',
      ph: 'Search media, recipes, artifacts, uses…' },
    { key: 'plan',  panel: 'panel-plan',  tab: 'tab-plan',  hash: 'playbook',   file: 'data/playbook.json',
      eyebrow: '05 — Playbook',
      title: 'Threats, phases, rhythm',
      desc: 'What fails, what actually keeps working, and the countermeasures people buy that solve nothing — including an honest list of the things that have no offline answer at all.',
      ph: 'Search threats, phases, tasks, breaks…' }
  ];

  const SEC_BY_KEY  = {};
  const SEC_BY_HASH = {};
  SECTIONS.forEach(s => { SEC_BY_KEY[s.key] = s; SEC_BY_HASH[s.hash] = s; });

  /* budget id → wall-clock minutes available. 'all' means no ceiling. */
  const BUDGETS = [
    { id: '1',   label: '1 hour',     sub: '60 min',  minutes: 60 },
    { id: '3',   label: '3 hours',    sub: '180 min', minutes: 180 },
    { id: '14',  label: '14 hours',   sub: 'a long night', minutes: 840 },
    { id: 'all', label: 'Everything', sub: 'no ceiling',   minutes: Infinity }
  ];

  const RATINGS = {
    full:     { accent: 'ok',     label: 'Full offline', copy: 'works indefinitely with the WAN cable pulled' },
    sync:     { accent: 'info',   label: 'Needs sync',   copy: 'works offline, but rots without a periodic refresh' },
    tethered: { accent: 'danger', label: 'Tethered',     copy: 'needs a vendor account or cloud to function' }
  };

  const LIKELIHOOD = { high: 'danger', medium: 'warn', low: 'info' };
  const SEVERITY   = { hard: 'danger', soft: 'warn', avoidable: 'info' };

  /* ─────────────────────────────────────────────────────────────
     2. HELPERS
     ───────────────────────────────────────────────────────────── */

  /* i18n bridge. carino-lang.js/i18n.js load after app.js, so during the
     first paint TT is the identity function and the page is plain English. */
  function TT(s) { return (typeof window.t === 'function') ? window.t(s) : s; }

  function $(id) { return document.getElementById(id); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /* Every array coming out of a JSON file goes through this, so a file that
     is half-written renders an empty section instead of throwing. */
  function arr(v) { return Array.isArray(v) ? v : []; }
  function obj(v) { return (v && typeof v === 'object') ? v : {}; }
  function num(v, d) { const n = Number(v); return isFinite(n) ? n : (d || 0); }
  function str(v) { return v == null ? '' : String(v); }

  /* data-driven accent → the utility classes index.html defines */
  const ACCENTS = { ok: 'ok', info: 'info', warn: 'warn', danger: 'danger', accent: 'accent' };
  function badgeClass(a) { return ACCENTS[str(a)] || 'accent'; }
  function textClass(a) { return 't-' + (ACCENTS[str(a)] || 'accent'); }

  function fmtSize(gb) {
    const n = num(gb, 0);
    if (n <= 0) return '0 GB';   // always a number: these are running totals
    if (n < 1) return Math.round(n * 1024) + ' MB';
    if (n >= 1024) return (n / 1024).toFixed(n / 1024 >= 10 ? 0 : 2) + ' TB';
    return (n < 10 ? n.toFixed(1) : Math.round(n)) + ' GB';
  }

  function fmtMins(m) {
    const n = Math.max(0, Math.round(num(m, 0)));
    if (n === 0) return '0 min';
    if (n < 60) return n + ' min';
    const h = Math.floor(n / 60), r = n % 60;
    return r ? h + ' h ' + r + ' m' : h + ' h';
  }

  function fmtUSD(n) { return '$' + Math.round(num(n, 0)).toLocaleString('en-US'); }

  /* MXN figures are conversions of USD estimates at a single rate — rounding
     to `step` stops them reading as more precise than they are. */
  function fmtMXN(n, step) {
    const s = step || 100;
    return 'MXN ' + (Math.round(num(n, 0) / s) * s).toLocaleString('en-US');
  }

  function show(el, on) {
    if (!el) return;
    el.classList.toggle('hidden', !on);
    el.hidden = !on;
    el.style.display = on ? '' : 'none';
  }

  function setHTML(el, html) { if (el) el.innerHTML = html; }

  /* localStorage is optional — a locked-down browser, or file:// in some
     configurations, throws on access, and the page must still work. */
  function lsGet(key, fallback) {
    try {
      const raw = window.localStorage.getItem(key);
      if (!raw) return fallback;
      const v = JSON.parse(raw);
      return v == null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function lsSet(key, value) {
    try { window.localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* non-fatal */ }
  }

  /* .code and .copybtn both style a .copied state, so feedback is a class. */
  function copyText(text, el) {
    const mark = () => {
      if (!el) return;
      el.classList.add('copied');
      setTimeout(() => el.classList.remove('copied'), 1300);
    };
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(mark, () => fallbackCopy(text, mark));
    } else {
      fallbackCopy(text, mark);
    }
  }
  /* execCommand is deprecated, but it is the only path that works when the
     page is opened from a USB stick over file:// in some browsers. */
  function fallbackCopy(text, done) {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.cssText = 'position:fixed;top:-1000px;opacity:0';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      done();
    } catch (e) { /* clipboard unavailable; the text is still on screen */ }
  }

  function downloadBlob(filename, mime, text) {
    const blob = new Blob([text], { type: mime + ';charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.style.display = 'none';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  }

  function flash(el, msg) {
    if (!el) return;
    const prev = el.getAttribute('data-label') || el.textContent;
    el.setAttribute('data-label', prev);
    el.textContent = msg;
    setTimeout(() => { el.textContent = prev; }, 1300);
  }

  function todayStamp() {
    const d = new Date();
    const p = n => String(n).padStart(2, '0');
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  }

  /* Single-quoted bash literal — the only safe way to embed arbitrary text. */
  function shq(s) { return "'" + String(s == null ? '' : s).replace(/'/g, "'\\''") + "'"; }
  /* A shell comment must stay on one line or the '#' stops protecting it. */
  function shComment(s) { return String(s == null ? '' : s).replace(/\s+/g, ' ').trim(); }

  function haystack() {
    let out = '';
    for (let i = 0; i < arguments.length; i++) {
      const v = arguments[i];
      if (v == null) continue;
      if (Array.isArray(v)) out += ' ' + v.map(x => (x && typeof x === 'object') ? JSON.stringify(x) : x).join(' ');
      else if (typeof v === 'object') out += ' ' + JSON.stringify(v);
      else out += ' ' + v;
    }
    return out.toLowerCase();
  }

  /* ─────────────────────────────────────────────────────────────
     3. SHARED MARKUP FRAGMENTS
     ───────────────────────────────────────────────────────────── */

  function badge(text, accent, big) {
    if (!text) return '';
    return `<span class="badge ${badgeClass(accent)}${big ? ' big' : ''}">${escapeHtml(text)}</span>`;
  }

  function link(url, label) {
    if (!url) return '';
    const shown = label || str(url).replace(/^https?:\/\//, '').replace(/\/$/, '');
    return `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(shown)} ↗</a>`;
  }

  /* The whole block is the copy affordance — index.html styles .code with a
     ::after label and a .copied state, so no separate button is needed. */
  function code(cmd) {
    if (!cmd) return '';
    const body = escapeHtml(str(cmd)).split('\n')
      .map(l => /^\s*#/.test(l) ? `<span class="cm">${l}</span>` : l).join('\n');
    return `<div class="code" role="button" tabindex="0" data-act="copy" data-copy="${escapeHtml(cmd)}" title="${escapeHtml(TT('Click to copy'))}">${body}</div>`;
  }

  function altsRow(alts, label) {
    const a = arr(alts);
    if (!a.length) return '';
    return `<div class="alts"><span class="ctl-lbl">${escapeHtml(TT(label || 'Instead'))}</span>${
      a.map(x => `<span class="alt">${escapeHtml(str(x && x.t))}${x && x.note ? ' — ' + escapeHtml(x.note) : ''}</span>`).join('')
    }</div>`;
  }

  function tagBits(tags) {
    return arr(tags).map(t => `<span>#${escapeHtml(t)}</span>`).join('');
  }

  function groupHead(label, lead, count) {
    return `<div class="group-h"><span>${escapeHtml(label)}</span>${
      lead ? `<span class="lead">${escapeHtml(lead)}</span>` : ''}${
      count != null ? `<span class="count">${escapeHtml(String(count))}</span>` : ''}</div>`;
  }

  function emptyBlock(msg) { return `<div class="empty">${escapeHtml(msg)}</div>`; }

  function stamp(updated) {
    if (!updated) return '';
    return `<span class="t-dim">${escapeHtml(TT('data reviewed'))} ${escapeHtml(updated)}</span>`;
  }

  /* ─────────────────────────────────────────────────────────────
     4. STATE
     ───────────────────────────────────────────────────────────── */

  const DATA = { start: null, grab: null, stack: null, iron: null, sneak: null, plan: null };

  const state = {
    panel: 'start',
    q: '',
    chip: { start: '', grab: '', stack: '', iron: '', sneak: '', plan: '' },
    budget: 'all',
    ironTier: 'balanced',
    sneakChannel: '',
    sneakSub: 'media',  // sneakernet sub-view; only one block is on screen at a time
    planSub: 'threats', // playbook sub-view, same reason
    collapsed: {},     // grab tier id → true (view state, deliberately not persisted)
    grabChecked: {},   // id → true
    phaseChecked: {}   // "phaseId::index" → true
  };

  (function hydrate() {
    arr(lsGet(K_GRAB, [])).forEach(id => { state.grabChecked[str(id)] = true; });
    arr(lsGet(K_PHASE, [])).forEach(k => { state.phaseChecked[str(k)] = true; });
  })();

  function persistGrab() { lsSet(K_GRAB, Object.keys(state.grabChecked).filter(k => state.grabChecked[k])); }

  /* Stored ticks outlive the data file. Once the real list is in hand, drop ids
     it no longer carries, and ids that have since moved into the "Wouldn't"
     tier — those rows render no checkbox, so such a tick can never be cleared
     from the UI and would otherwise export as excluded:true, checked:true. */
  function pruneGrabChecked() {
    const items = arr(DATA.grab && DATA.grab.items);
    if (!items.length) return;   // a failed fetch must not wipe anyone's ticks
    const live = {};
    items.forEach(it => { if (!isWont(it)) live[str(it.id)] = true; });
    let dropped = false;
    Object.keys(state.grabChecked).forEach(id => {
      if (!live[id]) { delete state.grabChecked[id]; dropped = true; }
    });
    if (dropped) persistGrab();
  }
  function persistPhases() { lsSet(K_PHASE, Object.keys(state.phaseChecked).filter(k => state.phaseChecked[k])); }

  /* ─────────────────────────────────────────────────────────────
     5. FETCH / BOOT
     ───────────────────────────────────────────────────────────── */

  const loadErrors = [];
  let booted = false;   // true once every section fetch has settled, ok or not

  function fetchJSON(file) {
    return fetch(file, { cache: 'no-cache' })
      .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.json(); })
      .catch(e => { loadErrors.push({ file: file, message: str(e && e.message || e) }); return null; });
  }

  function reportErrors() {
    const el = $('loadErr');
    if (!el) return;
    if (!loadErrors.length) { show(el, false); return; }
    const files = loadErrors.map(e => `<b>${escapeHtml(e.file)}</b> (${escapeHtml(e.message)})`).join(', ');
    setHTML(el, `<span aria-hidden="true">⚠</span><span>${TT('Failed to load')} ${files}. ${
      TT('If you opened this page from the filesystem, most browsers block fetch() over file:// — serve the folder instead, e.g.')} <code>python3 -m http.server</code>.</span>`);
    show(el, true);
  }

  /* Wrap each renderer: a malformed section degrades to a visible note
     rather than killing every panel below it. */
  function safe(label, fn) {
    try { fn(); }
    catch (e) {
      loadErrors.push({ file: label, message: TT('render failed: ') + str(e && e.message || e) });
      reportErrors();
    }
  }

  /* A panel whose file never arrived says so in place, rather than sitting
     empty and looking like a section nobody wrote. */
  const MOUNT = { start: 'startBody', grab: 'grabTiers', stack: 'stackGrid', iron: 'ironGroups', sneak: 'sneakBody', plan: 'planBody' };
  function dataMissing(key) {
    if (DATA[key]) return false;
    if (!booted) return true;   // still in flight: leave the panel alone
    const sec = SEC_BY_KEY[key];
    setHTML($(MOUNT[key]), `<div class="empty"><b>${TT('Could not load')} ${escapeHtml(sec ? sec.file : key)}</b><br>${
      TT('The rest of the site still works.')}</div>`);
    return true;
  }

  function boot() {
    Promise.all(SECTIONS.map(s => fetchJSON(s.file))).then(res => {
      SECTIONS.forEach((s, i) => { DATA[s.key] = res[i]; });   // positional, so a new section cannot desync the map
      OFFLINE.data = DATA;
      booted = true;

      // defaults that depend on the data being present
      const tiers = arr(DATA.iron && DATA.iron.tiers);
      const rec = tiers.filter(t => t && t.recommended)[0] || tiers.filter(t => t && t.id === 'balanced')[0] || tiers[0];
      if (rec && rec.id) state.ironTier = str(rec.id);
      const chans = arr(DATA.sneak && DATA.sneak.channels);
      if (chans[0] && chans[0].id) state.sneakChannel = str(chans[0].id);

      reportErrors();
      pruneGrabChecked();
      routeFromLocation();
      renderAll();
    });
  }

  /* ═════════════════════════════════════════════════════════════
     6. PANEL — START (the default)

     One screen: the argument in a sentence, the five sections with
     live counts, the numbered route through them, the image that
     serves the LAN, and the honest limits. Every long paragraph is
     a click away in the same dialog the other panels use.
     ═════════════════════════════════════════════════════════════ */

  /* Counts are read out of the other five files at render time, so a number on
     the Start screen can never disagree with the list it points at. */
  const START_COUNT = {
    grab:  () => ({ n: arr(DATA.grab && DATA.grab.items).length,  unit: 'items' }),
    stack: () => ({ n: arr(DATA.stack && DATA.stack.items).length, unit: 'entries' }),
    /* the tier the Iron panel will arrive on, not the whole file: the card has
       to agree with the LINES figure the panel prints on landing */
    iron:  () => ({ n: arr(DATA.iron && DATA.iron.items).filter(it => inTier(it, state.ironTier)).length,
                    unit: 'line items' }),
    sneak: () => { const s = obj(DATA.sneak);
      return { n: arr(s.media).length + arr(s.recipes).length + arr(s.artifacts).length + arr(s.uses).length,
               unit: 'entries' }; },
    /* every list the Playbook's five sub-views render, so the card equals the
       sum of the sub-nav counts: threats + rollout + won't work + rhythm + principles */
    plan:  () => { const p = obj(DATA.plan);
      return { n: arr(p.threats).length + arr(p.phases).length + arr(p.breaks).length
                  + arr(p.drills).length + arr(p.cadence).length
                  + arr(p.principles).length + arr(p.layers).length, unit: 'entries' }; }
  };

  /* A section whose file failed shows a dash rather than a confident zero. */
  function startCount(key) {
    if (!DATA[key] || !START_COUNT[key]) return '';
    const c = START_COUNT[key]();
    return c.n ? c.n + ' ' + TT(c.unit) : '';
  }

  function startSection(key) {
    return arr(DATA.start && DATA.start.sections).filter(s => str(s.key) === str(key))[0] || null;
  }

  /* Every record the dialog can already open, flattened per query, so a Start
     search reaches across all five files and hands each hit to openDetail()
     with the kind its own section uses. */
  function startHits(term) {
    const t = str(term).toLowerCase();
    const s = obj(DATA.sneak), p = obj(DATA.plan);
    const groups = [
      { sec: 'grab', sets: [
        { kind: 'grab', list: arr(DATA.grab && DATA.grab.items), name: r => r.name, sub: r => str(r.what) || str(r.why),
          hay: r => haystack(r.name, r.what, r.why, r.store, r.note, r.tier, r.cat, r.tags) } ] },
      { sec: 'stack', sets: [
        { kind: 'stack', list: arr(DATA.stack && DATA.stack.items), name: r => r.name, sub: r => str(r.does),
          hay: r => haystack(r.name, r.does, r.why, r.escape, r.license, r.lang, r.role, r.tags) } ] },
      { sec: 'iron', sets: [
        { kind: 'iron', list: arr(DATA.iron && DATA.iron.items), name: r => r.name,
          sub: r => str(obj(r.tierSpec)[state.ironTier] || r.spec),
          hay: r => haystack(r.name, r.spec, r.why, r.escape, r.mx, r.group, r.tags) } ] },
      { sec: 'sneak', sets: [
        { kind: 'media', list: arr(s.media), name: r => r.name, sub: r => str(r.use),
          hay: r => haystack(r.name, r.use, r.note, r.cap, r.life, r.cost) },
        { kind: 'recipe', list: arr(s.recipes), name: r => r.name, sub: r => str(r.why),
          hay: r => haystack(r.name, r.why, r.steps) },
        { kind: 'artifact', list: arr(s.artifacts), name: r => r.name, sub: r => str(r.what),
          hay: r => haystack(r.name, r.what, r.why, r.how, r.reprint) },
        { kind: 'use', list: arr(s.uses), name: r => r.name, sub: r => str(r.why),
          hay: r => haystack(r.name, r.why, r.tag, r.payload, r.material, r.time) } ] },
      { sec: 'plan', sets: [
        { kind: 'threat', list: arr(p.threats), name: r => r.failure, sub: r => str(r.works),
          hay: r => haystack(r.failure, r.works, r.useless, r.note, r.layer, r.likelihood) },
        { kind: 'phase', list: arr(p.phases), name: r => r.name, sub: r => str(r.deliverable),
          hay: r => haystack(r.name, r.deliverable, r.tasks, r.exit, r.window) },
        { kind: 'brk', list: arr(p.breaks), name: r => r.thing, sub: r => str(r.mitigation),
          hay: r => haystack(r.thing, r.why, r.mitigation, r.severity) },
        { kind: 'drill', list: arr(p.drills), name: r => r.name, sub: r => str(r.how),
          hay: r => haystack(r.name, r.how, r.pass, r.steps, r.cadence) },
        { kind: 'layer', list: arr(p.layers), name: r => r.label, sub: r => str(r.d),
          hay: r => haystack(r.label, r.d, r.rule) } ] }
    ];

    /* Rank before anything is cut: a row whose name carries the term beats one
       whose sub-line does, which beats a match in a field the row never shows
       (why, note, tags). Sections follow their best row, so the four survivors
       of the cap are the four a reader would have picked. */
    const score = (name, sub) => {
      const i = name.toLowerCase().indexOf(t);
      if (i === 0) return 4;
      if (i > 0) return 3;
      return sub.toLowerCase().indexOf(t) !== -1 ? 2 : 1;
    };

    return groups.map(g => {
      const rows = [];
      g.sets.forEach(set => set.list.forEach((r, i) => {
        if (set.hay(r).indexOf(t) === -1) return;
        /* threats, breaks, drills and layers carry no id in the data, so the
           index is their key — exactly what findRec() falls back to. */
        const name = str(set.name(r)), sub = str(set.sub(r));
        rows.push({ kind: set.kind, rec: str(r.id) || String(i),
                    name: name, sub: sub, score: score(name, sub) });
      }));
      /* sort is stable, so equal scores keep the order of the data file */
      rows.sort((a, b) => b.score - a.score);
      return { sec: g.sec, rows: rows, best: rows.length ? rows[0].score : 0 };
    }).filter(g => g.rows.length).sort((a, b) => b.best - a.best);
  }

  const START_MAX_ROWS = 4;   // per section: the Start panel must not become a scroll

  function renderStartSearch(host) {
    const groups = startHits(state.q);
    const total = groups.reduce((n, g) => n + g.rows.length, 0);
    if (!total) { setHTML(host, emptyBlock(TT('Nothing matches that search in any section.'))); return; }

    let shown = 0, html = '';
    groups.forEach(g => {
      const sec = SEC_BY_KEY[g.sec], meta = startSection(g.sec);
      const rows = g.rows.slice(0, START_MAX_ROWS);
      const rest = g.rows.length - rows.length;
      shown += rows.length;
      /* the head counts what is on screen; anything cut is offered as its own
         row, which opens the section with the same term still in the box */
      html += `<section class="group">
        ${groupHead(TT(sec.title), '', rest ? rows.length + ' / ' + g.rows.length : rows.length)}
        ${rows.map(r => `<article class="row" data-act="detail" data-kind="${escapeHtml(r.kind)}"
             data-rec="${escapeHtml(r.rec)}" tabindex="0" role="button">
          <span class="row-main">
            <span class="row-name">${escapeHtml(r.name)}</span>
            <span class="row-sub">${escapeHtml(r.sub)}</span>
          </span>
          <span class="row-num t-dim">${escapeHtml(meta ? str(meta.num) : '')}</span>
        </article>`).join('')}
        ${rest ? `<article class="row" data-act="go" data-panel="${escapeHtml(g.sec)}" tabindex="0" role="button">
          <span class="row-main"><span class="row-sub t-accent">+${rest} ${TT('more in this section')}</span></span>
          <span class="row-num t-dim">${escapeHtml(meta ? str(meta.num) : '')}</span>
        </article>` : ''}
      </section>`;
    });
    if (total > shown) {
      html += `<p class="d-p t-dim">${total - shown} ${TT('more matches, not shown — open a section to see the rest.')}</p>`;
    }
    setHTML(host, html);
  }

  function renderStart() {
    const host = $('startBody');
    /* The hero is static markup in index.html, so it survives a failed
       data/start.json — but it has no business sitting above a list of search
       hits from five files. */
    const hero = $('startHero');
    if (hero) hero.hidden = !!state.q;
    if (!host || dataMissing('start')) return;
    if (state.q) { renderStartSearch(host); return; }

    const d = obj(DATA.start);
    const premise = arr(d.premise);

    /* Only the pills. The sentence that used to open this panel said what the
       hero above now says at hero size, and saying it twice cost the vertical
       room the hero needed. The three premises still expand in the dialog. */
    let html = premise.length ? `<div class="lede">
      <div class="alts">${premise.map(pz =>
        `<button class="alt" type="button" data-act="detail" data-kind="premise"
           data-rec="${escapeHtml(str(pz.id))}">${escapeHtml(str(pz.title))} →</button>`).join('')}</div>
    </div>` : '';

    const cards = arr(d.sections).filter(sc => SEC_BY_KEY[str(sc.key)]);
    if (cards.length) {
      html += `<div class="d-lbl">${TT('The five sections')}</div>
        <div class="tiles start-tiles">${cards.map(sc => {
          const n = startCount(str(sc.key));
          return `<article class="tile start-card" data-act="go" data-panel="${escapeHtml(str(sc.key))}"
                   tabindex="0" role="button" title="${escapeHtml(str(sc.lead))}">
            <span class="tile-dot num t-accent">${escapeHtml(str(sc.num))}</span>
            <span class="tile-main">
              <span class="tile-name">${escapeHtml(TT(str(sc.name)))}</span>
              <span class="tile-sub">${escapeHtml(str(sc.what))}</span>
              <span class="tile-n num t-dim">${escapeHtml(n || '—')}</span>
            </span>
          </article>`;
        }).join('')}</div>`;
    }

    const steps = arr(d.steps);
    if (steps.length) {
      html += `<div class="d-lbl">${TT('Start here')}</div>` + steps.map(st => {
        const meta = startSection(st.goes);
        return `<article class="row start-step" data-act="go" data-panel="${escapeHtml(str(st.goes))}"
                 tabindex="0" role="button" aria-label="${escapeHtml(str(st.title))}">
          <span class="step-n num">${escapeHtml(str(st.n))}</span>
          <span class="row-main">
            <span class="row-name">${escapeHtml(str(st.title))}</span>
            <span class="row-sub">${escapeHtml(str(st.what))}</span>
          </span>
          <span class="row-cat">${escapeHtml(meta ? str(meta.num) + ' · ' + TT(str(meta.name)) : '')}</span>
          <button class="copybtn" type="button" data-act="detail" data-kind="step"
                  data-rec="${escapeHtml(str(st.id))}">${TT('why')}</button>
        </article>`;
      }).join('');
    }

    const img = obj(d.image);
    if (img.name) {
      html += `<div class="d-lbl">${TT('The box that serves the LAN')}</div>
        <article class="row" data-act="detail" data-kind="image" data-rec="0" tabindex="0" role="button">
          <span class="row-main">
            <span class="row-name num">${escapeHtml(str(img.name))}</span>
            <span class="row-sub">${escapeHtml(str(img.what))}</span>
          </span>
          <span class="row-num t-dim">${escapeHtml(str(img.repo))}</span>
        </article>`;
    }

    const limits = arr(d.limits);
    if (limits.length) {
      html += `<div class="d-lbl">${TT('What this does not do')} ${stamp(d.updated)}</div>
        <div class="alts">${limits.map(l =>
          `<button class="alt" type="button" data-act="detail" data-kind="limit"
             data-rec="${escapeHtml(str(l.id))}">${escapeHtml(str(l.name))}</button>`).join('')}</div>`;
    }

    setHTML(host, html);
  }

  /* ═════════════════════════════════════════════════════════════
     6a. PANEL — GRAB LIST (the flagship)
     ═════════════════════════════════════════════════════════════ */

  function grabTiers() {
    return arr(DATA.grab && DATA.grab.tiers).slice().sort((a, b) => num(a.order, 99) - num(b.order, 99));
  }
  function grabTierById(id) { return grabTiers().filter(t => str(t.id) === str(id))[0] || null; }
  function grabCatById(id) { return arr(DATA.grab && DATA.grab.cats).filter(c => str(c.id) === str(id))[0] || null; }

  /* The "Wouldn't" tier is a decision, not a task: excluded from every
     total, never budgeted, never checkable. */
  function isWont(item) {
    const t = grabTierById(item && item.tier);
    return !!(t && (str(t.id) === 'wont' || (num(t.hours, -1) === 0 && str(t.budget) === '-')));
  }

  /* Acquisition order: tier order, then per-item priority, then name. */
  function grabOrdered() {
    const order = {};
    grabTiers().forEach((t, i) => { order[str(t.id)] = num(t.order, i + 1); });
    return arr(DATA.grab && DATA.grab.items).slice().sort((a, b) => {
      const ta = num(order[str(a.tier)], 99), tb = num(order[str(b.tier)], 99);
      if (ta !== tb) return ta - tb;
      const pa = num(a.priority, 99), pb = num(b.priority, 99);
      if (pa !== pb) return pa - pb;
      return str(a.name).localeCompare(str(b.name));
    });
  }

  function budgetMinutes() {
    const b = BUDGETS.filter(x => x.id === state.budget)[0];
    return b ? b.minutes : Infinity;
  }

  /* id → does this item still fit in the budget? Checked items are skipped
     when accumulating: you already have them, they cost no wall clock. */
  function computeFits() {
    const cap = budgetMinutes();
    const fits = {};
    let used = 0;
    grabOrdered().forEach(it => {
      const id = str(it.id);
      if (isWont(it) || state.grabChecked[id]) { fits[id] = true; return; }
      const m = num(it.minutes, 0);
      if (used + m <= cap) { fits[id] = true; used += m; }
      else fits[id] = false;
    });
    return fits;
  }

  function grabMatches(it) {
    const chip = state.chip.grab;
    if (chip) {
      const k = chip.split(':')[0], v = chip.split(':')[1];
      if (k === 'tier' && str(it.tier) !== v) return false;
      if (k === 'cat' && str(it.cat) !== v) return false;
      if (k === 'store' && str(it.store) !== v) return false;
    }
    if (!state.q) return true;
    return haystack(it.name, it.what, it.why, it.size, it.store, it.note, it.get, it.verify,
      it.tier, it.cat, it.tags).indexOf(state.q) !== -1;
  }

  function renderGrab() {
    const host = $('grabTiers');
    if (!host || dataMissing('grab')) return;

    renderGrabControls();
    const items = grabOrdered().filter(grabMatches);

    if (!items.length) {
      setHTML(host, '');
      show($('grabEmpty'), true);
      renderGrabSummary();
      return;
    }
    show($('grabEmpty'), false);

    let html = '';
    grabTiers().forEach(tier => {
      const tid = str(tier.id);
      const mine = items.filter(it => str(it.tier) === tid);
      if (!mine.length) return;
      const wont = tid === 'wont';
      const gb = wont ? 0 : mine.reduce((s, it) => s + num(it.gb, 0), 0);
      const mins = wont ? 0 : mine.reduce((s, it) => s + num(it.minutes, 0), 0);
      const collapsed = !!state.collapsed[tid];
      const meta = wont
        ? mine.length + ' ' + TT('deliberate non-goals')
        : mine.length + ' ' + TT('items') + ' · ' + fmtSize(gb) + ' · ' + fmtMins(mins);

      html += `<section class="tier${wont ? ' wont' : ''}${collapsed ? ' collapsed' : ''}" data-tier="${escapeHtml(tid)}">
        <button class="tier-h" type="button" data-act="tier-toggle" data-tier="${escapeHtml(tid)}"
                aria-expanded="${collapsed ? 'false' : 'true'}">
          <span class="tier-name ${wont ? '' : textClass(tier.accent)}">${escapeHtml(tier.label)}</span>
          <span class="tier-lead">${escapeHtml(tier.budget)}${tier.blurb ? ' — ' + escapeHtml(tier.blurb) : ''}</span>
          <span class="tier-meta">${escapeHtml(meta)}</span>
        </button>
        <div class="tier-body">${mine.map(it => grabItemHTML(it, wont)).join('')}</div>
      </section>`;
    });

    setHTML(host, html);
    applyGrabBudget();
    renderGrabSummary();
  }

  /* One line per item: tick, name, one-clause gist, size and time.
     Everything else is a click away — see openDetail(). */
  function grabItemHTML(it, wont) {
    const id = str(it.id);
    const checked = !!state.grabChecked[id];
    const cat = grabCatById(it.cat);

    /* The row is a button that contains its own checkbox, so without an explicit
       label its accessible name would be the whole concatenated row text. */
    return `<article class="row${wont ? ' wont' : ''}${checked ? ' done' : ''}" data-id="${escapeHtml(id)}"
             data-act="detail" data-kind="grab" data-rec="${escapeHtml(id)}" tabindex="0" role="button"
             aria-label="${escapeHtml(str(it.name))}">
      ${wont ? '<span class="row-x" aria-hidden="true">✕</span>'
             : `<input type="checkbox" data-act="grab-toggle" data-id="${escapeHtml(id)}"${checked ? ' checked' : ''}
                  aria-label="${escapeHtml(str(it.name))}">`}
      <span class="row-main">
        <span class="row-name">${escapeHtml(it.name)}</span>
        <span class="row-sub">${escapeHtml(str(it.what) || str(it.why))}</span>
      </span>
      ${cat ? `<span class="row-cat">${escapeHtml((cat.icon ? cat.icon + ' ' : '') + str(cat.label))}</span>` : ''}
      <span class="row-num">${wont ? '—' : escapeHtml(str(it.size) || fmtSize(it.gb))}</span>
      <span class="row-num t-dim">${wont ? '' : escapeHtml(fmtMins(it.minutes))}</span>
    </article>`;
  }

  function renderGrabControls() {
    const host = $('grabControls');
    if (!host) return;

    const budgets = BUDGETS.map(b =>
      `<button class="seg-btn${state.budget === b.id ? ' active' : ''}" type="button" data-act="budget" data-budget="${b.id}">
        ${escapeHtml(TT(b.label))}<span class="sub">${escapeHtml(TT(b.sub))}</span>
      </button>`).join('');

    /* One row, not three: the budget is the primary control, and the two menus
       hold what used to be six always-visible buttons. */
    setHTML(host, `
      <div class="ctl">
        <span class="ctl-lbl">${TT('Time budget')}</span>
        <div class="seg">${budgets}</div>
        <div class="menu-wrap">
          <button class="btn" type="button" data-act="menu" data-menu="select"
                  aria-haspopup="true" aria-expanded="false" aria-controls="menu-select">${TT('Select')} ▾</button>
          <div class="menu" id="menu-select" role="menu" hidden>
            <button class="menu-i" type="button" role="menuitem" data-act="grab-inbudget">${TT('Tick what fits')}</button>
            <button class="menu-i" type="button" role="menuitem" data-act="grab-all">${TT('Tick all')}</button>
            <button class="menu-i danger" type="button" role="menuitem" data-act="grab-none">${TT('Clear')}</button>
          </div>
        </div>
        <div class="menu-wrap">
          <button class="btn primary" type="button" data-act="menu" data-menu="export"
                  aria-haspopup="true" aria-expanded="false" aria-controls="menu-export">${TT('Export')} ▾</button>
          <div class="menu" id="menu-export" role="menu" hidden>
            <button class="menu-i" type="button" role="menuitem" data-act="export-md">${TT('Copy as Markdown')}</button>
            <button class="menu-i" type="button" role="menuitem" data-act="export-sh">${TT('fetch-list.sh')}</button>
            <button class="menu-i" type="button" role="menuitem" data-act="export-json">${TT('JSON')}</button>
          </div>
        </div>
      </div>`);
  }

  /* Dimming is a class toggle over existing nodes — no innerHTML rebuild, so
     ticking a box with 75 items on screen is instant. */
  function applyGrabBudget() {
    const fits = computeFits();
    $$('#grabTiers .row[data-id]').forEach(row => {
      const id = row.getAttribute('data-id');
      row.classList.toggle('dim', fits[id] === false);
      const done = !!state.grabChecked[id];
      row.classList.toggle('done', done);
      const box = row.querySelector('input[type=checkbox]');
      if (box) box.checked = done;
    });
  }

  function grabTotals() {
    const fits = computeFits();
    const scope = grabOrdered().filter(it => !isWont(it) && grabMatches(it));
    let total = 0, checked = 0, gbAll = 0, gbChecked = 0, minsLeft = 0, inBudget = 0, gbBudget = 0, minsBudget = 0;
    scope.forEach(it => {
      const id = str(it.id);
      const gb = num(it.gb, 0), m = num(it.minutes, 0);
      total++; gbAll += gb;
      if (state.grabChecked[id]) { checked++; gbChecked += gb; }
      else {
        minsLeft += m;
        if (fits[id] !== false) { inBudget++; gbBudget += gb; minsBudget += m; }
      }
    });
    return { total, checked, gbAll, gbChecked, minsLeft, inBudget, gbBudget, minsBudget,
             pct: total ? Math.round((checked / total) * 100) : 0 };
  }


  function renderGrabSummary() {
    const el = $('grabSummary');
    if (!el) return;
    const t = grabTotals();
    const capped = state.budget !== 'all';
    const filtered = !!(state.q || state.chip.grab);

    /* One strip instead of four stat tiles plus a labelled bar: the same
       numbers, about a fifth of the vertical space. The caveats moved into
       a title tooltip — they matter once, not on every glance. */
    const notes = [TT('The "Wouldn\'t" tier is excluded from every total — it is a decision, not a task.')];
    if (capped) notes.push(TT('Ticked items free up budget, so the ceiling stretches as you acquire.'));
    if (filtered) notes.push(TT('Totals follow the current filter.'));

    const cell = (v, k) => `<span class="sm-c"><b>${v}</b> <span class="sm-k">${escapeHtml(k)}</span></span>`;

    setHTML(el, `
      <div class="summary" title="${escapeHtml(notes.join(' '))}">
        ${cell(t.checked + '<span class="sm-of">/' + t.total + '</span>', TT('acquired'))}
        ${cell(escapeHtml(fmtSize(t.gbChecked)) + '<span class="sm-of">/' + escapeHtml(fmtSize(t.gbAll)) + '</span>', TT('held'))}
        ${cell(escapeHtml(fmtMins(t.minsLeft)), TT('still to pull'))}
        ${capped
          ? cell(t.inBudget + '<span class="sm-of">·' + escapeHtml(fmtSize(t.gbBudget)) + '</span>', TT('fits budget'))
          : cell(grabOrdered().filter(it => isWont(it) && grabMatches(it)).length, TT('non-goals'))}
        <span class="sm-bar" role="progressbar" aria-valuenow="${t.pct}" aria-valuemin="0" aria-valuemax="100"
              aria-label="${TT('Readiness')}"><span class="bar-fill" style="width:${t.pct}%"></span></span>
        <span class="sm-pct">${t.pct}%</span>
      </div>`);
  }

  /* ── grab exports ───────────────────────────────────────────── */

  /* "checked-or-all": if nothing is ticked, the export is the whole list;
     otherwise it is exactly what was ticked. */
  function grabPicked() {
    return grabOrdered().filter(it => !isWont(it) && state.grabChecked[str(it.id)]);
  }

  function grabExportSet() {
    const picked = grabPicked();
    return picked.length ? picked : grabOrdered().filter(it => !isWont(it));
  }

  function exportMarkdown() {
    const g = obj(DATA.grab);
    const t = grabTotals();
    const lines = [];
    lines.push('# ' + TT('Offline grab list') + (g.updated ? ' — ' + g.updated : ''));
    lines.push('');
    lines.push('> ' + TT('Generated') + ' ' + todayStamp() + ' · ' + t.checked + '/' + t.total + ' ' +
               TT('acquired') + ' · ' + fmtSize(t.gbChecked) + ' ' + TT('of') + ' ' + fmtSize(t.gbAll) +
               ' · ' + fmtMins(t.minsLeft) + ' ' + TT('left to pull'));
    lines.push('');
    grabTiers().forEach(tier => {
      const tid = str(tier.id);
      const mine = grabOrdered().filter(it => str(it.tier) === tid);
      if (!mine.length) return;
      const wont = tid === 'wont';
      lines.push('## ' + str(tier.label) + (tier.budget && tier.budget !== '-' ? ' — ' + tier.budget : ''));
      if (tier.blurb) { lines.push(''); lines.push('_' + str(tier.blurb) + '_'); }
      lines.push('');
      mine.forEach(it => {
        const bits = [];
        if (!wont && it.size) bits.push(str(it.size));
        if (!wont && num(it.minutes, 0)) bits.push(fmtMins(it.minutes));
        if (it.store) bits.push(str(it.store));
        const meta = bits.length ? ' · ' + bits.join(' · ') : '';
        if (wont) {
          lines.push('- ~~' + str(it.name) + '~~' + meta + (it.why ? ' — ' + str(it.why) : ''));
          if (it.note) lines.push('  - ' + TT('Instead:') + ' ' + str(it.note));
        } else {
          lines.push('- ' + (state.grabChecked[str(it.id)] ? '[x]' : '[ ]') + ' **' + str(it.name) + '**' +
                     meta + (it.what ? ' — ' + str(it.what) : ''));
          if (it.url) lines.push('  - ' + str(it.url));
          if (it.get) lines.push('  - `' + str(it.get).replace(/\n/g, ' ; ') + '`');
        }
      });
      lines.push('');
    });
    return lines.join('\n');
  }

  function exportScript() {
    const g = obj(DATA.grab);
    const set = grabExportSet();
    const byTier = {};
    set.forEach(it => { (byTier[str(it.tier)] = byTier[str(it.tier)] || []).push(it); });

    const gb = set.reduce((s, it) => s + num(it.gb, 0), 0);
    const mins = set.reduce((s, it) => s + num(it.minutes, 0), 0);
    // decided by what was ticked, not by set size — ticking everything is still a choice
    const partial = grabPicked().length > 0;

    const L = [];
    L.push('#!/usr/bin/env bash');
    L.push('#');
    L.push('# fetch-list.sh — generated ' + todayStamp() + ' by offline.carino.systems');
    L.push('# Source: data/grablist.json' + (g.updated ? ' (' + g.updated + ')' : ''));
    L.push('#');
    L.push('# ' + set.length + ' items · ' + fmtSize(gb) + ' · roughly ' + fmtMins(mins) + ' of wall clock at ~100 Mbit.');
    L.push('# ' + (partial ? 'Contains the items ticked on the site.' : 'Contains the whole list (nothing was ticked).'));
    L.push('#');
    L.push('# This is a starting point, not a turnkey mirror. Lines marked TODO have no');
    L.push('# recorded command because the source needs a browser, an account, or a choice');
    L.push('# of edition. Read it before you run it.');
    L.push('#');
    L.push('# set -e means the first failure aborts the run. That is deliberate: a half-');
    L.push('# downloaded mirror you believe in is worse than one you know is missing.');
    L.push('#');
    L.push('# Usage:  bash fetch-list.sh [destination]     (default: ./offline-cache)');
    L.push('');
    L.push('set -euo pipefail');
    L.push('');
    L.push('DEST="${1:-./offline-cache}"');
    L.push('mkdir -p "$DEST"');
    L.push('cd "$DEST"');
    L.push('');
    L.push('say() { printf \'\\n==> %s\\n\' "$*"; }');
    L.push('');

    grabTiers().forEach(tier => {
      const tid = str(tier.id);
      if (tid === 'wont') return;
      const mine = arr(byTier[tid]);
      if (!mine.length) return;
      const tGb = mine.reduce((s, it) => s + num(it.gb, 0), 0);
      const tMin = mine.reduce((s, it) => s + num(it.minutes, 0), 0);
      const plural = mine.length === 1 ? ' item' : ' items';

      L.push('# ' + '─'.repeat(66));
      L.push('# ' + shComment(tier.label) + ' — ' + shComment(tier.budget) +
             '  (' + mine.length + plural + ', ' + fmtSize(tGb) + ', ~' + fmtMins(tMin) + ')');
      L.push('# ' + '─'.repeat(66));
      L.push('say ' + shq(str(tier.label) + ' — ' + mine.length + plural + ', ' + fmtSize(tGb)));
      L.push('');

      mine.forEach(it => {
        const bits = [];
        if (it.size) bits.push(str(it.size));
        if (num(it.minutes, 0)) bits.push(fmtMins(it.minutes));
        if (it.store) bits.push('store: ' + str(it.store));
        L.push('# ' + shComment(it.name) + (bits.length ? '  (' + shComment(bits.join(', ')) + ')' : ''));
        if (it.what) L.push('#   ' + shComment(it.what));
        if (it.url) L.push('#   ' + shComment(it.url));
        if (it.verify) L.push('#   verify: ' + shComment(it.verify));
        if (it.note) L.push('#   note: ' + shComment(it.note));
        if (it.get) {
          const get = str(it.get);
          L.push('mkdir -p ' + shq(str(it.id)));
          if (get.indexOf('\n') === -1) {
            L.push('( cd ' + shq(str(it.id)) + ' && ' + get + ' )');
          } else {
            // multi-line recipes get their own subshell block so the cd sticks
            L.push('(');
            L.push('  cd ' + shq(str(it.id)));
            get.split('\n').forEach(line => L.push('  ' + line));
            L.push(')');
          }
        } else {
          L.push('# TODO: no fetch command recorded — collect this one by hand.');
          if (!it.url) L.push('#       (no URL recorded either; see the site entry)');
        }
        L.push('');
      });
    });

    const wont = grabOrdered().filter(isWont);
    if (wont.length) {
      L.push('# ' + '─'.repeat(66));
      L.push('# Deliberately not fetched');
      L.push('# ' + '─'.repeat(66));
      wont.forEach(it => {
        L.push('# ' + shComment(it.name) + (it.why ? ' — ' + shComment(it.why) : ''));
        if (it.note) L.push('#   ' + shComment(it.note));
      });
      L.push('');
    }

    L.push('say ' + shq('Done. Verify checksums before you trust any of it.'));
    L.push('');
    return L.join('\n');
  }

  function exportJSON() {
    const g = obj(DATA.grab);
    const t = grabTotals();
    return JSON.stringify({
      generated: new Date().toISOString(),
      source: 'data/grablist.json',
      updated: g.updated || null,
      budget: state.budget,
      totals: {
        items: t.total, checked: t.checked,
        gbTotal: Number(t.gbAll.toFixed(2)), gbChecked: Number(t.gbChecked.toFixed(2)),
        minutesRemaining: t.minsLeft, readinessPercent: t.pct
      },
      checked: Object.keys(state.grabChecked).filter(k => state.grabChecked[k]).sort(),
      items: grabOrdered().map(it => ({
        id: str(it.id), tier: str(it.tier), cat: str(it.cat), name: str(it.name),
        size: str(it.size), gb: num(it.gb, 0), minutes: num(it.minutes, 0),
        store: str(it.store), url: it.url || null, get: it.get || null, verify: it.verify || null,
        excluded: isWont(it) || undefined,
        checked: !!state.grabChecked[str(it.id)]
      }))
    }, null, 2);
  }

  /* ═════════════════════════════════════════════════════════════
     6b. PANEL — STACK
     ═════════════════════════════════════════════════════════════ */

  function stackMatches(it) {
    const chip = state.chip.stack;
    if (chip) {
      const k = chip.split(':')[0], v = chip.split(':')[1];
      if (k === 'role' && str(it.role) !== v) return false;
      if (k === 'offline' && str(it.offline) !== v) return false;
    }
    if (!state.q) return true;
    return haystack(it.name, it.does, it.why, it.escape, it.license, it.lang, it.platform,
      it.ram, it.disk, it.install, it.role, it.alts, it.tags).indexOf(state.q) !== -1;
  }

  function renderStack() {
    const host = $('stackGrid');
    if (!host || dataMissing('stack')) return;
    const d = obj(DATA.stack);
    const items = arr(d.items).filter(stackMatches);

    const ctl = $('stackControls');
    if (ctl) {
      /* The section description already defines full/sync/tethered, so the
         legend is just the three swatches — the words would be a second copy. */
      const legend = ['full', 'sync', 'tethered'].map(k =>
        `<span class="lg" title="${escapeHtml(TT(RATINGS[k].copy))}"><span class="${textClass(RATINGS[k].accent)}">●</span> ${escapeHtml(TT(RATINGS[k].label))}</span>`
      ).join('');
      setHTML(ctl, `
        <div class="ctl">
          <span class="ctl-lbl">${TT('Showing')}</span>
          <span class="num t-mut">${items.length} / ${arr(d.items).length}</span>
          <span class="legend">${legend}</span>${stamp(d.updated)}
        </div>`);
    }

    if (!items.length) { setHTML(host, ''); show($('stackEmpty'), true); return; }
    show($('stackEmpty'), false);

    let html = '';
    arr(d.roles).forEach(role => {
      const mine = items.filter(it => str(it.role) === str(role.id));
      if (!mine.length) return;
      html += `<section class="group" data-role="${escapeHtml(role.id)}">
        ${groupHead((role.icon ? role.icon + ' ' : '') + str(role.label), role.blurb, mine.length)}
        <div class="tiles">${mine.map(stackCardHTML).join('')}</div>
      </section>`;
    });
    // items whose role id is not declared in roles[] must still appear
    const known = arr(d.roles).map(r => str(r.id));
    const orphan = items.filter(it => known.indexOf(str(it.role)) === -1);
    if (orphan.length) {
      html += `<section class="group">${groupHead(TT('Unfiled'), '', orphan.length)}
        <div class="tiles">${orphan.map(stackCardHTML).join('')}</div></section>`;
    }
    setHTML(host, html);
  }

  /* A tile is a name, the offline verdict, and one clause of what it does.
     The rating dot is the thing you scan for, so it leads. */
  function stackCardHTML(it) {
    const rating = str(it.offline);
    const r = RATINGS[rating] || { accent: 'accent', label: rating || '?' };

    return `<article class="tile rate-${escapeHtml(rating || 'none')}" data-id="${escapeHtml(it.id)}"
             data-act="detail" data-kind="stack" data-rec="${escapeHtml(it.id)}" tabindex="0" role="button">
      <span class="tile-dot ${textClass(r.accent)}" title="${escapeHtml(TT(r.label))}" aria-hidden="true">●</span>
      <span class="tile-main">
        <span class="tile-name">${escapeHtml((it.icon ? it.icon + ' ' : '') + str(it.name))}</span>
        <span class="tile-sub">${escapeHtml(str(it.does))}</span>
      </span>
    </article>`;
  }

  /* ═════════════════════════════════════════════════════════════
     6c. PANEL — IRON
     ═════════════════════════════════════════════════════════════ */

  function ironTiers() {
    return arr(DATA.iron && DATA.iron.tiers).slice().sort((a, b) => num(a.order, 99) - num(b.order, 99));
  }
  function ironTierById(id) { return ironTiers().filter(t => str(t.id) === str(id))[0] || null; }
  function inTier(it, tierId) { return arr(it.tiers).map(String).indexOf(str(tierId)) !== -1; }

  function ironMatches(it) {
    if (!inTier(it, state.ironTier)) return false;
    const chip = state.chip.iron;
    if (chip) {
      const k = chip.split(':')[0], v = chip.split(':')[1];
      if (k === 'group' && str(it.group) !== v) return false;
      if (k === 'cloud' && it.cloudFree !== false) return false;
    }
    if (!state.q) return true;
    return haystack(it.name, it.spec, it.why, it.escape, it.spare, it.mx, it.group,
      it.alts, it.tags, obj(it.tierSpec)[state.ironTier]).indexOf(state.q) !== -1;
  }

  function renderIron() {
    if (dataMissing('iron')) return;
    const d = obj(DATA.iron);
    const fx = num(d.fx, 0) || 18.5;
    const tier = ironTierById(state.ironTier);

    const tHost = $('ironTiers');
    if (tHost) {
      const btns = ironTiers().map(t => {
        const on = str(t.id) === str(state.ironTier);
        return `<button class="seg-btn${on ? ' active' : ''}" type="button" data-act="iron-tier" data-tier="${escapeHtml(t.id)}">
          ${escapeHtml(t.label)}${t.recommended ? `<span class="rec">${TT('recommended')}</span>` : ''}
          <span class="sub">${escapeHtml(fmtUSD(t.usd))}</span>
        </button>`;
      }).join('');
      setHTML(tHost, `<span class="ctl-lbl">${TT('Budget tier')}</span><div class="seg">${btns}</div>
        ${tier && tier.who ? `<span class="sec-desc"><b>${escapeHtml(tier.who)}</b> ${escapeHtml(str(tier.blurb))}</span>` : ''}`);
    }

    /* The BOM total is deliberately computed over the whole tier, not the
       filtered view — typing in the search box must not change the price. */
    const tierItems = arr(d.items).filter(it => inTier(it, state.ironTier));
    const sumUSD = tierItems.reduce((s, it) => s + num(it.usd, 0) * num(it.qty, 1), 0);
    const units = tierItems.reduce((s, it) => s + num(it.qty, 1), 0);
    const declared = tier ? num(tier.usd, 0) : 0;
    const drift = declared ? Math.round(((sumUSD - declared) / declared) * 100) : 0;
    const tethered = tierItems.filter(it => it.cloudFree === false).length;

    const tot = $('ironTotal');
    if (tot) {
      setHTML(tot, `
        <span class="lbl">${TT('CAPEX')}</span>
        <span class="big">${escapeHtml(fmtUSD(sumUSD))}</span>
        <span class="sub">${escapeHtml(fmtMXN(sumUSD * fx, 100))} ${TT('at')} ${escapeHtml(String(fx))}</span>
        <span class="lbl">${TT('Lines')}</span>
        <span class="big">${tierItems.length}</span>
        <span class="sub">${units} ${TT('units')}</span>
        <span class="lbl">${TT('Plan figure')}</span>
        <span class="sub">${escapeHtml(fmtUSD(declared))} ${drift ? `<b class="${Math.abs(drift) > 5 ? 't-warn' : 't-dim'}">${drift > 0 ? '+' : ''}${drift}%</b>` : '<b class="t-ok">✓</b>'}</span>
        ${tethered ? `<span class="sub t-danger">${tethered} ${TT(tethered === 1 ? 'cloud-tethered line' : 'cloud-tethered lines')}</span>` : ''}
        <span class="sub">${stamp(d.updated)}</span>`);
    }

    const host = $('ironGroups');
    if (host) {
      const items = arr(d.items).filter(ironMatches);
      if (!items.length) { setHTML(host, ''); show($('ironEmpty'), true); }
      else {
        show($('ironEmpty'), false);
        let html = '';
        arr(d.groups).forEach(g => {
          const mine = items.filter(it => str(it.group) === str(g.id));
          if (!mine.length) return;
          const gSum = mine.reduce((s, it) => s + num(it.usd, 0) * num(it.qty, 1), 0);
          html += `<section class="group" data-group="${escapeHtml(g.id)}">
            ${groupHead((g.icon ? g.icon + ' ' : '') + str(g.label), '', fmtUSD(gSum))}
            ${mine.map(it => ironItemHTML(it, fx)).join('')}
          </section>`;
        });
        const known = arr(d.groups).map(g => str(g.id));
        const orphan = items.filter(it => known.indexOf(str(it.group)) === -1);
        if (orphan.length) {
          html += `<section class="group">${groupHead(TT('Unfiled'), '', orphan.length)}
            ${orphan.map(it => ironItemHTML(it, fx)).join('')}</section>`;
        }
        setHTML(host, html);
      }
    }

    const rules = $('ironRules');
    if (rules) {
      const rHTML = arr(d.rules).map(r =>
        `<li><b>${escapeHtml(r.t)}</b> — ${escapeHtml(r.d)}</li>`).join('');
      const rec = arr(d.recurring);
      const recHTML = rec.length ? `
        <section class="group">
          ${groupHead(TT('Recurring cost'), TT('the part that never finishes being paid'), rec.length)}
          <div class="tblwrap"><table class="tbl">
            <thead><tr><th>${TT('Line')}</th><th class="num">${TT('Cost')}</th><th>${TT('Why')}</th></tr></thead>
            <tbody>${rec.map(r => `<tr>
              <td class="key">${escapeHtml(r.t)}</td>
              <td class="num">${escapeHtml(fmtUSD(r.usd))} / ${escapeHtml(TT(str(r.per) || 'month'))}</td>
              <td>${escapeHtml(r.d)}</td></tr>`).join('')}</tbody>
          </table></div>
        </section>` : '';
      setHTML(rules, (rHTML
        ? `<section class="group">${groupHead(TT('Purchasing rules'), TT('non-negotiable'), arr(d.rules).length)}
           <ol class="rules">${rHTML}</ol></section>` : '') + recHTML);
    }
  }

  /* Name, spec, price. The cloud-tether flag stays on the row because it is a
     buying decision, not a detail — everything else moves into the modal. */
  function ironItemHTML(it, fx) {
    const qty = num(it.qty, 1);
    const line = num(it.usd, 0) * qty;
    const spec = obj(it.tierSpec)[state.ironTier] || it.spec;
    const tethered = it.cloudFree === false;

    return `<article class="row${tethered ? ' tether' : ''}" data-id="${escapeHtml(it.id)}"
             data-act="detail" data-kind="iron" data-rec="${escapeHtml(it.id)}" tabindex="0" role="button">
      <span class="row-main">
        <span class="row-name">${escapeHtml(it.name)}${qty > 1 ? ` <span class="t-dim num">×${qty}</span>` : ''}${
          tethered ? ' <span class="row-flag" title="cloud-tethered">☁</span>' : ''}</span>
        <span class="row-sub num">${escapeHtml(str(spec))}</span>
      </span>
      <span class="row-num">${escapeHtml(fmtUSD(line))}</span>
      <span class="row-num t-dim">${escapeHtml(fmtMXN(line * fx, 10))}</span>
    </article>`;
  }

  /* ═════════════════════════════════════════════════════════════
     6d. PANEL — SNEAKERNET
     ═════════════════════════════════════════════════════════════ */

  function sneakChannels() { return arr(DATA.sneak && DATA.sneak.channels); }
  function sneakChannelById(id) { return sneakChannels().filter(c => str(c.id) === str(id))[0] || null; }

  function sneakRowMatch(o) {
    if (!state.q) return true;
    return haystack(o.name, o.what, o.why, o.how, o.use, o.note, o.payload, o.tag,
      o.material, o.time, o.cap, o.life, o.cost, o.costPerTB, o.reprint).indexOf(state.q) !== -1;
  }

  function renderSneak() {
    if (dataMissing('sneak')) return;
    const d = obj(DATA.sneak);
    const chans = sneakChannels();
    if (!state.sneakChannel && chans[0]) state.sneakChannel = str(chans[0].id);

    const sel = $('sneakChannels');
    if (sel) {
      const btns = chans.map(c => {
        const on = str(c.id) === str(state.sneakChannel);
        return `<button class="seg-btn${on ? ' active' : ''}" type="button" data-act="sneak-chan" data-chan="${escapeHtml(c.id)}">
          ${escapeHtml((c.icon ? c.icon + ' ' : '') + str(c.label))}
        </button>`;
      }).join('');
      setHTML(sel, `<span class="ctl-lbl">${TT('Channel')}</span><div class="seg">${btns}</div>`);
    }

    const host = $('sneakBody');
    if (!host) return;
    const c = sneakChannelById(state.sneakChannel);
    /* The sub-nav is rebuilt further down; an early return has to clear it, or the
       previous channel's buttons and counts sit over an empty body. */
    if (!c) { setHTML($('sneakSub'), ''); setHTML(host, ''); show($('sneakEmpty'), true); return; }

    const media = arr(d.media).filter(m => str(m.channel) === str(c.id) && sneakRowMatch(m));
    const recipes = arr(d.recipes).filter(r => str(r.channel) === str(c.id) &&
      (sneakRowMatch(r) || arr(r.steps).some(s => haystack(s.do, s.detail, s.cmd).indexOf(state.q) !== -1)));
    const artifacts = arr(d.artifacts).filter(a => str(a.channel) === str(c.id) && sneakRowMatch(a));
    const uses = arr(d.uses).filter(u => str(u.channel) === str(c.id) && sneakRowMatch(u));
    const nothing = !media.length && !recipes.length && !artifacts.length && !uses.length;

    if (state.q && nothing) { setHTML($('sneakSub'), ''); setHTML(host, ''); show($('sneakEmpty'), true); return; }
    show($('sneakEmpty'), false);

    /* Sub-views instead of five stacked blocks: the channel's own facts plus
       one list at a time, so the panel is a screen rather than a scroll. */
    const subs = [
      { id: 'media',     label: TT('Media'),     n: media.length },
      { id: 'recipes',   label: TT('Recipes'),   n: recipes.length },
      { id: 'artifacts', label: TT('Artifacts'), n: artifacts.length },
      { id: 'uses',      label: TT('Uses'),      n: uses.length }
    ].filter(s => s.n);

    if (!subs.some(s => s.id === state.sneakSub) && subs[0]) state.sneakSub = subs[0].id;

    const facts = [['Throughput', c.throughput], ['Lifespan', c.lifespan],
                   ['Best for', c.bestFor], ['Worst for', c.worstFor]].filter(f => f[1]);

    const subHost = $('sneakSub');
    if (subHost) {
      setHTML(subHost, subs.length ? `<div class="seg sub">${subs.map(s =>
        `<button class="seg-btn${s.id === state.sneakSub ? ' active' : ''}" type="button"
           data-act="sneak-sub" data-sub="${escapeHtml(s.id)}">${escapeHtml(s.label)}
           <span class="sub">${s.n}</span></button>`).join('')}</div>` : '');
    }

    let html = c.blurb || facts.length
      ? `<div class="lede">${c.blurb ? `<p>${escapeHtml(c.blurb)}</p>` : ''}
           ${facts.length ? `<div class="d-facts tight">${facts.map(f =>
             `<span class="d-k">${escapeHtml(TT(f[0]))}</span><span class="d-v">${escapeHtml(f[1])}</span>`).join('')}</div>` : ''}
         </div>` : '';

    const sub = state.sneakSub;

    if (sub === 'media') {
      html += media.map(m => `<article class="row" data-act="detail" data-kind="media" data-rec="${escapeHtml(m.id)}" tabindex="0" role="button">
        <span class="row-main"><span class="row-name">${escapeHtml(m.name)}</span>
          <span class="row-sub">${escapeHtml(str(m.use))}</span></span>
        <span class="row-num">${escapeHtml(str(m.cap))}</span>
        <span class="row-num t-dim">${escapeHtml(str(m.costPerTB))}</span>
      </article>`).join('');
    } else if (sub === 'recipes') {
      html += recipes.map(r => `<article class="row" data-act="detail" data-kind="recipe" data-rec="${escapeHtml(r.id)}" tabindex="0" role="button">
        <span class="row-main"><span class="row-name">${escapeHtml(r.name)}</span>
          <span class="row-sub">${escapeHtml(str(r.why))}</span></span>
        <span class="row-num t-dim">${arr(r.steps).length} ${TT('steps')}</span>
      </article>`).join('');
    } else if (sub === 'artifacts') {
      html += artifacts.map(a => `<article class="row" data-act="detail" data-kind="artifact" data-rec="${escapeHtml(a.id)}" tabindex="0" role="button">
        <span class="row-main"><span class="row-name">${escapeHtml(a.name)}</span>
          <span class="row-sub">${escapeHtml(str(a.what))}</span></span>
      </article>`).join('');
    } else if (sub === 'uses') {
      html += uses.map(u => `<article class="row" data-act="detail" data-kind="use" data-rec="${escapeHtml(u.id)}" tabindex="0" role="button">
        <span class="row-main"><span class="row-name">${escapeHtml(u.name)}</span>
          <span class="row-sub">${escapeHtml(str(u.why))}</span></span>
        <span class="row-num t-dim">${escapeHtml(str(u.tag) || str(u.material) || '')}</span>
      </article>`).join('');
    }

    if (nothing) html += emptyBlock(TT('Nothing recorded for this channel yet.'));

    setHTML(host, html);
  }

  /* ═════════════════════════════════════════════════════════════
     6e. PANEL — PLAYBOOK
     ═════════════════════════════════════════════════════════════ */

  function planMatch(o) {
    if (!state.q) return true;
    return haystack(o.t, o.d, o.name, o.failure, o.works, o.useless, o.note, o.why,
      o.mitigation, o.thing, o.deliverable, o.exit, o.window, o.how, o.pass, o.tasks,
      o.task, o.every, o.cadence, o.steps, o.label, o.rule).indexOf(state.q) !== -1;
  }

  function phaseKey(phaseId, idx) { return str(phaseId) + '::' + idx; }

  function renderPlan() {
    if (dataMissing('plan')) return;
    const d = obj(DATA.plan);
    const chip = state.chip.plan;
    const likeChip = chip.indexOf('like:') === 0 ? chip.split(':')[1] : '';
    const sevChip  = chip.indexOf('sev:') === 0 ? chip.split(':')[1] : '';

    /* Five stacked blocks was the worst scroll on the site. One at a time. */
    const threats  = arr(d.threats).filter(t => !sevChip && (!likeChip || str(t.likelihood) === likeChip) && planMatch(t));
    const phases   = arr(d.phases).filter(p => !chip && planMatch(p));
    const breaks   = arr(d.breaks).filter(b => !likeChip && (!sevChip || str(b.severity) === sevChip) && planMatch(b));
    const rhythm   = arr(d.drills).filter(x => !chip && planMatch(x)).length + arr(d.cadence).filter(x => !chip && planMatch(x)).length;
    const basis    = arr(d.principles).filter(planMatch).length + arr(d.layers).filter(planMatch).length;

    const subs = [
      { id: 'threats', label: TT('Threats'),    n: threats.length },
      { id: 'phases',  label: TT('Rollout'),    n: phases.length },
      { id: 'breaks',  label: TT('Won\'t work'), n: breaks.length },
      { id: 'rhythm',  label: TT('Rhythm'),     n: rhythm },
      { id: 'basis',   label: TT('Principles'), n: basis }
    ].filter(s => s.n);

    if (!subs.some(s => s.id === state.planSub) && subs[0]) state.planSub = subs[0].id;

    const subHost = $('planSub');
    if (subHost) {
      setHTML(subHost, subs.length ? `<div class="seg sub">${subs.map(s =>
        `<button class="seg-btn${s.id === state.planSub ? ' active' : ''}" type="button"
           data-act="plan-sub" data-sub="${escapeHtml(s.id)}">${escapeHtml(s.label)}
           <span class="sub">${s.n}</span></button>`).join('')}</div>` : '');
    }

    const body = $('planBody');
    if (body) {
      const v = state.planSub;
      let html = '';

      if (v === 'threats') {
        html = threats.length ? threats.map(t => {
          const idx = arr(d.threats).indexOf(t);
          return `<article class="row" data-act="detail" data-kind="threat" data-rec="${idx}" tabindex="0" role="button">
            <span class="row-main"><span class="row-name">${escapeHtml(t.failure)}</span>
              <span class="row-sub t-ok">${escapeHtml(str(t.works))}</span></span>
            <span class="row-cat">${escapeHtml(str(t.layer).toUpperCase())}</span>
            <span class="row-num">${badge(TT(str(t.likelihood)), LIKELIHOOD[str(t.likelihood)])}</span>
          </article>`;
        }).join('') : emptyBlock(TT('No threat matches that filter.'));
      } else if (v === 'phases') {
        html = phases.length ? phases.map(phaseHTML).join('') : emptyBlock(TT('No phase matches that filter.'));
      } else if (v === 'breaks') {
        html = breaks.length ? breaks.map(b => {
          const idx = arr(d.breaks).indexOf(b);
          return `<article class="row" data-act="detail" data-kind="brk" data-rec="${idx}" tabindex="0" role="button">
            <span class="row-main"><span class="row-name">${escapeHtml(b.thing)}</span>
              <span class="row-sub">${escapeHtml(str(b.mitigation))}</span></span>
            <span class="row-num">${badge(TT(str(b.severity)), SEVERITY[str(b.severity)])}</span>
          </article>`;
        }).join('') : emptyBlock(TT('No entry matches that filter.'));
      } else if (v === 'rhythm') {
        const drills = arr(d.drills).filter(x => !chip && planMatch(x));
        const cadence = arr(d.cadence).filter(x => !chip && planMatch(x));
        html = drills.map(dr => {
          const idx = arr(d.drills).indexOf(dr);
          return `<article class="row" data-act="detail" data-kind="drill" data-rec="${idx}" tabindex="0" role="button">
            <span class="row-main"><span class="row-name">${escapeHtml(dr.name)}</span>
              <span class="row-sub">${escapeHtml(str(dr.how))}</span></span>
            <span class="row-num">${badge(TT(str(dr.cadence)), 'warn')}</span>
          </article>`;
        }).join('')
        + (cadence.length ? `<div class="d-lbl">${TT('Maintenance rhythm')}</div>
            <div class="d-facts">${cadence.map(c2 =>
              `<span class="d-k">${escapeHtml(c2.task)}</span><span class="d-v">${escapeHtml(c2.every)}</span>`).join('')}</div>` : '');
      } else if (v === 'basis') {
        const principles = arr(d.principles).filter(planMatch);
        const layers = arr(d.layers).filter(planMatch);
        html = principles.map(p => `<article class="row static">
            <span class="row-main"><span class="row-name t-accent">${escapeHtml(p.t)}</span>
              <span class="row-sub">${escapeHtml(str(p.d))}</span></span>
          </article>`).join('')
          + (layers.length ? `<div class="d-lbl">${TT('The layer stack')}</div>` : '')
          + layers.slice().reverse().map(l => {
              const idx = arr(d.layers).indexOf(l);
              return `<article class="row" data-act="detail" data-kind="layer" data-rec="${idx}" tabindex="0" role="button">
                <span class="row-main"><span class="row-name t-accent">${escapeHtml(l.label)}</span>
                  <span class="row-sub">${escapeHtml(str(l.d))}</span></span>
              </article>`;
            }).join('');
      }

      setHTML(body, html || emptyBlock(TT('Nothing in this section matches that search.')));
    }
  }

  /* A phase collapses to one line with its progress; the task checklist opens
     in the modal, where there is room for it. */
  function phaseHTML(p) {
    const tasks = arr(p.tasks);
    const done = tasks.filter((_, i) => state.phaseChecked[phaseKey(p.id, i)]).length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
    const cls = tasks.length && done === tasks.length ? ' done' : (done ? ' wip' : '');

    return `<article class="row phase${cls}" data-phase="${escapeHtml(str(p.id))}"
             data-act="detail" data-kind="phase" data-rec="${escapeHtml(str(p.id))}" tabindex="0" role="button">
      <span class="row-main">
        <span class="row-name">${escapeHtml(p.name)}</span>
        <span class="row-sub">${escapeHtml(str(p.deliverable))}</span>
        ${tasks.length ? `<span class="bar mini"><span class="bar-fill" data-fill="${escapeHtml(str(p.id))}" style="width:${pct}%"></span></span>` : ''}
      </span>
      <span class="row-cat">${escapeHtml(str(p.window))}</span>
      <span class="row-num num" data-progress="${escapeHtml(str(p.id))}">${done}/${tasks.length}</span>
    </article>`;
  }

  /* Progress lives in two places at once — the row behind the modal and the
     checklist inside it — so update every mount that claims this phase id. */
  function updatePhaseProgress(phaseId) {
    const phase = arr(DATA.plan && DATA.plan.phases).filter(p => str(p.id) === str(phaseId))[0];
    if (!phase) return;
    const tasks = arr(phase.tasks);
    const done = tasks.filter((_, i) => state.phaseChecked[phaseKey(phase.id, i)]).length;
    const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

    // attribute values here can be bare numbers, so match by walking rather
    // than by building a selector that would need escaping
    $$('[data-progress]').forEach(el => {
      if (el.getAttribute('data-progress') === str(phaseId)) el.textContent = done + '/' + tasks.length;
    });
    $$('[data-fill]').forEach(el => {
      if (el.getAttribute('data-fill') === str(phaseId)) el.style.width = pct + '%';
    });
    $$('.row.phase').forEach(el => {
      if (el.getAttribute('data-phase') !== str(phaseId)) return;
      el.classList.toggle('done', !!tasks.length && done === tasks.length);
      el.classList.toggle('wip', done > 0 && done < tasks.length);
    });
  }

  /* ─────────────────────────────────────────────────────────────
     7. CHIPS + SEARCH
     ───────────────────────────────────────────────────────────── */

  function chipDefs(panel) {
    const out = [];
    if (panel === 'start') {
      /* no chips: Start is the map of the site, and its search already spans
         every section — a filter row here would be filtering nothing. */
    } else if (panel === 'grab') {
      grabTiers().forEach(t => out.push({ key: 'tier:' + str(t.id), label: str(t.label) }));
      arr(DATA.grab && DATA.grab.cats).forEach(c =>
        out.push({ key: 'cat:' + str(c.id), label: (c.icon ? c.icon + ' ' : '') + str(c.label) }));
    } else if (panel === 'stack') {
      ['full', 'sync', 'tethered'].forEach(k => out.push({ key: 'offline:' + k, label: TT(RATINGS[k].label) }));
      arr(DATA.stack && DATA.stack.roles).forEach(r =>
        out.push({ key: 'role:' + str(r.id), label: (r.icon ? r.icon + ' ' : '') + str(r.label) }));
    } else if (panel === 'iron') {
      out.push({ key: 'cloud:no', label: TT('cloud-tethered only') });
      arr(DATA.iron && DATA.iron.groups).forEach(g =>
        out.push({ key: 'group:' + str(g.id), label: (g.icon ? g.icon + ' ' : '') + str(g.label) }));
    } else if (panel === 'sneak') {
      /* no chips: the channel segmented control in the panel already does this,
         and two selectors for one choice is just confusing */
    } else if (panel === 'plan') {
      ['high', 'medium', 'low'].forEach(k => out.push({ key: 'like:' + k, label: TT('likelihood') + ': ' + TT(k) }));
      ['hard', 'soft', 'avoidable'].forEach(k => out.push({ key: 'sev:' + k, label: TT('breaks') + ': ' + TT(k) }));
    }
    return out;
  }

  function renderChips() {
    const host = $('chips');
    if (!host) return;
    const panel = state.panel;
    const defs = chipDefs(panel);
    if (!defs.length) { setHTML(host, ''); return; }

    const active = state.chip[panel];

    setHTML(host, `<span class="chip-lbl">${TT('Filter')}</span>` +
      defs.map(c => `<button class="chip${c.key === active ? ' active' : ''}" type="button"
        data-act="chip" data-key="${escapeHtml(c.key)}">${escapeHtml(c.label)}</button>`).join('') +
      (state.chip[panel] ? `<button class="chip active" type="button" data-act="chip" data-key="">${TT('clear')} ✕</button>` : ''));
  }

  function setChip(key) {
    const panel = state.panel;
    state.chip[panel] = (state.chip[panel] === key) ? '' : key;
    renderChips();
    renderActive();
  }

  /* Count matches per panel so an inbound hub query lands where the answers
     are, instead of on whatever tab happened to be open. */
  function bestPanelFor(term) {
    if (!term) return null;
    const t = term.toLowerCase();
    const s = obj(DATA.sneak), p = obj(DATA.plan);
    const counts = {
      grab: arr(DATA.grab && DATA.grab.items).filter(it =>
        haystack(it.name, it.what, it.why, it.tags, it.cat, it.tier).indexOf(t) !== -1).length,
      stack: arr(DATA.stack && DATA.stack.items).filter(it =>
        haystack(it.name, it.does, it.why, it.tags, it.role, it.license, it.lang).indexOf(t) !== -1).length,
      iron: arr(DATA.iron && DATA.iron.items).filter(it =>
        haystack(it.name, it.spec, it.why, it.tags, it.group).indexOf(t) !== -1).length,
      sneak: arr(s.media).concat(arr(s.recipes), arr(s.artifacts), arr(s.uses)).filter(o =>
        haystack(o.name, o.what, o.why, o.use, o.payload).indexOf(t) !== -1).length,
      plan: arr(p.threats).concat(arr(p.breaks), arr(p.phases), arr(p.principles)).filter(o =>
        haystack(o.failure, o.thing, o.name, o.t, o.d, o.why, o.works, o.tasks).indexOf(t) !== -1).length
    };
    let best = null, n = 0;
    Object.keys(counts).forEach(k => { if (counts[k] > n) { n = counts[k]; best = k; } });
    return n ? best : null;
  }

  /* ─────────────────────────────────────────────────────────────
     8. PANEL SWITCHING, ROUTING, WIRING
     ───────────────────────────────────────────────────────────── */

  let suppressHash = false;

  function setPanel(key, opts) {
    const sec = SEC_BY_KEY[key];
    if (!sec) return;
    closeDetail();          // a modal from the previous section must not survive the switch
    state.panel = key;

    SECTIONS.forEach(s => {
      const p = $(s.panel);
      if (p) p.classList.toggle('active', s.key === key);
      const t = $(s.tab);
      if (t) {
        t.classList.toggle('active', s.key === key);
        t.setAttribute('aria-selected', s.key === key ? 'true' : 'false');
        /* Roving tabindex: one stop for the whole strip, arrows move inside it. */
        t.setAttribute('tabindex', s.key === key ? '0' : '-1');
      }
    });

    /* On Start the hero inside the panel is the page header, so the app bar's
       own title is hidden (see .ohero in index.html). It is still written
       below: switching away has to find it already correct. */
    document.body.classList.toggle('is-start', key === 'start');

    const eb = $('appEyebrow'), ti = $('appTitle'), de = $('appDesc'), q = $('q');
    if (eb) eb.textContent = TT(sec.eyebrow);
    if (ti) ti.textContent = TT(sec.title);
    if (de) de.innerHTML = TT(sec.desc);
    if (q) q.placeholder = TT(sec.ph);

    if (!(opts && opts.silent)) {
      suppressHash = true;
      try { location.hash = sec.hash; } catch (e) { /* file:// edge case */ }
      setTimeout(() => { suppressHash = false; }, 0);
    }

    const panelEl = $(sec.panel);
    if (panelEl) panelEl.scrollTop = 0;
    /* Start scrolls the wrap rather than the panel (see body.is-start in
       index.html), so the wrap needs the same reset or you come back to a
       landing page already scrolled past its own hero. */
    const wrapEl = document.querySelector('.wrap');
    if (wrapEl) wrapEl.scrollTop = 0;

    renderChips();
    renderActive();
  }

  const RENDERERS = { start: renderStart, grab: renderGrab, stack: renderStack, iron: renderIron,
                      sneak: renderSneak, plan: renderPlan };

  function renderActive() { safe(state.panel, RENDERERS[state.panel] || function () {}); }

  function renderAll() {
    renderChips();
    SECTIONS.forEach(s => safe(s.file, RENDERERS[s.key]));
  }

  /* Hub convention: #<panel-hash> selects a panel; any other #tag, or a ?q=,
     is treated as a search term and routed to the panel that answers it. */
  function routeFromLocation() {
    let term = '';
    try {
      const params = new URLSearchParams(location.search || '');
      term = str(params.get('q') || params.get('tag') || '');
    } catch (e) { /* absent URLSearchParams is not fatal */ }

    const hash = str(location.hash || '').replace(/^#/, '').trim();
    /* A hub link may append its own query to a panel hash (#triage?ref=hub); the
       raw fragment still wins so a search term containing ? or & survives. */
    const sec = SEC_BY_HASH[hash] || SEC_BY_HASH[hash.split(/[?&]/)[0]];

    if (sec) setPanel(sec.key, { silent: true });
    else if (hash && !term) {
      // a malformed escape (#%) must not throw the whole first paint away
      try { term = decodeURIComponent(hash.replace(/\+/g, ' ')); }
      catch (e) { term = hash; }
    }

    if (term) {
      const q = $('q');
      if (q) q.value = term;
      state.q = term.toLowerCase();
      const best = bestPanelFor(term);
      if (best && !sec) setPanel(best, { silent: true });
    }
    if (!sec && !term) setPanel(state.panel, { silent: true });
  }

  function onSearch() {
    const q = $('q');
    state.q = q ? q.value.trim().toLowerCase() : '';
    renderActive();
  }

  /* Horizontal tablist: Left/Right step, Home/End jump. */
  const TAB_STEP = { ArrowLeft: -1, ArrowRight: 1, Home: 'first', End: 'last' };

  /* Panel controls live inside the container their own click rebuilds, so the
     clicked button is detached and focus falls back to <body>. Re-find the
     equivalent node afterwards and keep the keyboard user where they were. */
  const CTL_KEYS = ['data-budget', 'data-tier', 'data-chan', 'data-sub', 'data-key'];

  function keepFocus(el, fn) {
    const held = document.activeElement === el;
    const act = el.getAttribute('data-act');
    let sel = act ? '[data-act="' + act + '"]' : '';
    CTL_KEYS.forEach(a => {
      const v = el.getAttribute(a);
      if (sel && v !== null) sel += '[' + a + '="' + v + '"]';
    });
    fn();
    if (!held || !sel || document.contains(el)) return;
    let next = null;
    // the cleared chip has no successor of its own, so fall back to its strip
    try { next = document.querySelector(sel) || document.querySelector('[data-act="' + act + '"]'); }
    catch (e) { next = null; }   // an id with a quote in it is not worth throwing over
    if (next && next.focus) next.focus();
  }

  function wire() {
    const q = $('q');
    if (q) {
      q.addEventListener('input', onSearch);
      q.addEventListener('search', onSearch);   // the type=search clear button
    }

    /* Tabs are delegated: carino-navbar.js relocates the whole
       <nav class="tabs"> node into the shared navbar after this runs. */
    document.addEventListener('click', e => {
      const tab = e.target.closest && e.target.closest('.tab[data-panel]');
      if (tab && SEC_BY_KEY[tab.getAttribute('data-panel')]) setPanel(tab.getAttribute('data-panel'));
    });

    // any click outside an open menu dismisses it
    document.addEventListener('click', e => {
      if (!(e.target.closest && e.target.closest('.menu-wrap'))) closeMenus();
    });

    document.addEventListener('click', e => {
      const el = e.target.closest && e.target.closest('[data-act]');
      if (!el) return;
      const act = el.getAttribute('data-act');
      // picking an item from a menu closes it
      if (el.classList.contains('menu-i')) setTimeout(closeMenus, 0);

      if (act === 'copy') { copyText(el.getAttribute('data-copy') || '', el); return; }
      if (act === 'chip') { keepFocus(el, () => setChip(el.getAttribute('data-key') || '')); return; }
      /* Start's section cards and step rows route; setPanel closes any open dialog. */
      if (act === 'go') { setPanel(el.getAttribute('data-panel') || state.panel); return; }

      if (act === 'menu') {
        const id = 'menu-' + el.getAttribute('data-menu');
        const m = $(id), wasOpen = m && !m.hidden;
        closeMenus();
        if (m && !wasOpen) { m.hidden = false; el.setAttribute('aria-expanded', 'true'); }
        return;
      }

      if (act === 'budget') {
        state.budget = el.getAttribute('data-budget') || 'all';
        keepFocus(el, () => { renderGrabControls(); applyGrabBudget(); renderGrabSummary(); });
        return;
      }
      if (act === 'tier-toggle') {
        const t = el.getAttribute('data-tier');
        state.collapsed[t] = !state.collapsed[t];
        const sec = el.closest('.tier');
        if (sec) sec.classList.toggle('collapsed', !!state.collapsed[t]);
        el.setAttribute('aria-expanded', state.collapsed[t] ? 'false' : 'true');
        return;
      }
      if (act === 'iron-tier') { state.ironTier = el.getAttribute('data-tier') || state.ironTier; keepFocus(el, renderIron); return; }
      if (act === 'sneak-chan') { state.sneakChannel = el.getAttribute('data-chan') || state.sneakChannel; keepFocus(el, () => { renderChips(); renderSneak(); }); return; }
      if (act === 'sneak-sub') { state.sneakSub = el.getAttribute('data-sub') || state.sneakSub; keepFocus(el, renderSneak); return; }
      if (act === 'plan-sub') { state.planSub = el.getAttribute('data-sub') || state.planSub; keepFocus(el, renderPlan); return; }

      /* A row opens its detail — except when the click landed on the row's own
         checkbox or a link, which have their own jobs. */
      if (act === 'detail') {
        if (e.target.closest('input,a,.code')) return;
        openDetail(el.getAttribute('data-kind'), el.getAttribute('data-rec'));
        return;
      }
      if (act === 'modal-close') { closeDetail(); return; }

      if (act === 'grab-all' || act === 'grab-none' || act === 'grab-inbudget') {
        const fits = computeFits();
        grabOrdered().forEach(it => {
          if (isWont(it)) return;
          const id = str(it.id);
          if (act === 'grab-none') delete state.grabChecked[id];
          else if (act === 'grab-all') state.grabChecked[id] = true;
          else if (fits[id] !== false) state.grabChecked[id] = true;
        });
        persistGrab(); applyGrabBudget(); renderGrabSummary();
        return;
      }

      /* The menu item is hidden a tick later by closeMenus, so the confirmation
         has to land on the trigger that stays on screen. */
      if (act === 'export-md') {
        const wrap = el.closest('.menu-wrap');
        copyText(exportMarkdown(), null);
        flash((wrap && wrap.querySelector('.btn')) || el, TT('Copied ✓'));
        return;
      }
      if (act === 'export-sh') { downloadBlob('fetch-list.sh', 'text/x-shellscript', exportScript()); return; }
      if (act === 'export-json') { downloadBlob('grab-list.json', 'application/json', exportJSON()); return; }
    });

    // keyboard parity for the .code blocks and rows, which are divs acting as buttons
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') { closeMenus(); closeDetail(); return; }

      /* role=tablist comes with a keyboard contract: arrows move between tabs,
         Home/End jump to the ends, and moving selects. */
      const onTab = e.target.closest && e.target.closest('.tab[data-panel]');
      if (onTab && TAB_STEP[e.key] !== undefined) {
        const tabs = $$('.tab[data-panel]');
        const here = tabs.indexOf(onTab);
        if (here === -1 || !tabs.length) return;
        const step = TAB_STEP[e.key];
        const next = step === 'first' ? tabs[0]
                   : step === 'last'  ? tabs[tabs.length - 1]
                   : tabs[(here + step + tabs.length) % tabs.length];
        if (!next) return;
        e.preventDefault();
        setPanel(next.getAttribute('data-panel'));
        next.focus();
        return;
      }

      if (e.key !== 'Enter' && e.key !== ' ') return;
      /* A form control keeps its own keys: Space must tick the row's checkbox,
         not open the detail of the row that wraps it. */
      if (e.target.matches && e.target.matches('input,select,textarea')) return;
      const code = e.target.closest && e.target.closest('.code[data-act="copy"]');
      if (code) { e.preventDefault(); copyText(code.getAttribute('data-copy') || '', code); return; }
      const row = e.target.closest && e.target.closest('[data-act="detail"]');
      if (row) { e.preventDefault(); openDetail(row.getAttribute('data-kind'), row.getAttribute('data-rec')); return; }
      const go = e.target.closest && e.target.closest('[data-act="go"]');
      if (go) { e.preventDefault(); setPanel(go.getAttribute('data-panel') || state.panel); }
    });

    // click on the backdrop (but not the dialog) dismisses
    const backdrop = $('modal');
    if (backdrop) backdrop.addEventListener('click', e => { if (e.target === backdrop) closeDetail(); });

    document.addEventListener('change', e => {
      const el = e.target;
      if (!el || !el.getAttribute) return;
      const act = el.getAttribute('data-act');

      if (act === 'grab-toggle') {
        const id = el.getAttribute('data-id');
        if (el.checked) state.grabChecked[id] = true; else delete state.grabChecked[id];
        persistGrab();
        applyGrabBudget();     // a tick frees budget, so the dimming has to follow
        renderGrabSummary();
        return;
      }

      if (act === 'phase-toggle') {
        const key = phaseKey(el.getAttribute('data-phase'), Number(el.getAttribute('data-idx')));
        if (el.checked) state.phaseChecked[key] = true; else delete state.phaseChecked[key];
        persistPhases();
        const lbl = el.closest('.task');
        if (lbl) lbl.classList.toggle('done', el.checked);
        updatePhaseProgress(el.getAttribute('data-phase'));
        return;
      }
    });

    window.addEventListener('hashchange', () => {
      if (suppressHash) { suppressHash = false; return; }   // our own write
      routeFromLocation();
      renderActive();
    });

    // The locale switcher re-renders every JS-built surface; state is untouched.
    window.addEventListener('carino:langchange', () => {
      setPanel(state.panel, { silent: true });
      renderAll();
    });
  }

  /* ─────────────────────────────────────────────────────────────
     8b. DETAIL MODAL

     The density control. A row carries a name and the two or three
     numbers you actually scan by; prose, commands, alternatives and
     caveats live in here, one click away. That is what keeps a
     66-item list readable as a list instead of an essay.
     ───────────────────────────────────────────────────────────── */

  let lastFocus = null;

  /* kind → where the record lives and what titles it */
  const DETAIL = {
    premise:   { list: () => arr(DATA.start && DATA.start.premise),  title: r => str(r.title) },
    step:      { list: () => arr(DATA.start && DATA.start.steps),    title: r => str(r.n) + '. ' + str(r.title) },
    /* one object, not an array — findRec()'s index fallback picks it up as "0" */
    image:     { list: () => { const i = obj(DATA.start && DATA.start.image); return i.name ? [i] : []; },
                 title: r => str(r.name) },
    limit:     { list: () => arr(DATA.start && DATA.start.limits),   title: r => str(r.name) },
    grab:      { list: () => arr(DATA.grab && DATA.grab.items),      title: r => r.name },
    stack:     { list: () => arr(DATA.stack && DATA.stack.items),    title: r => (r.icon ? r.icon + ' ' : '') + str(r.name) },
    iron:      { list: () => arr(DATA.iron && DATA.iron.items),      title: r => r.name },
    media:     { list: () => arr(DATA.sneak && DATA.sneak.media),    title: r => r.name },
    recipe:    { list: () => arr(DATA.sneak && DATA.sneak.recipes),  title: r => r.name },
    artifact:  { list: () => arr(DATA.sneak && DATA.sneak.artifacts),title: r => r.name },
    use:       { list: () => arr(DATA.sneak && DATA.sneak.uses),     title: r => r.name },
    threat:    { list: () => arr(DATA.plan && DATA.plan.threats),    title: r => r.failure },
    phase:     { list: () => arr(DATA.plan && DATA.plan.phases),     title: r => r.name },
    brk:       { list: () => arr(DATA.plan && DATA.plan.breaks),     title: r => r.thing },
    drill:     { list: () => arr(DATA.plan && DATA.plan.drills),     title: r => r.name },
    layer:     { list: () => arr(DATA.plan && DATA.plan.layers),     title: r => str(r.label) }
  };

  /* breaks/threats/layers have no id of their own in the data, so index is the key */
  function findRec(kind, id) {
    const def = DETAIL[kind];
    if (!def) return null;
    const list = def.list();
    const byId = list.filter(x => str(x.id) === str(id))[0];
    if (byId) return byId;
    const n = Number(id);
    return isFinite(n) && list[n] ? list[n] : null;
  }

  function dPara(label, text, cls) {
    if (!text) return '';
    return `<p class="d-p${cls ? ' ' + cls : ''}">${label ? `<b>${escapeHtml(TT(label))}</b> — ` : ''}${escapeHtml(text)}</p>`;
  }
  function dFacts(pairs) {
    const rows = pairs.filter(p => p[1] !== '' && p[1] != null);
    if (!rows.length) return '';
    return `<div class="d-facts">${rows.map(p =>
      `<span class="d-k">${escapeHtml(TT(p[0]))}</span><span class="d-v">${escapeHtml(String(p[1]))}</span>`).join('')}</div>`;
  }
  function dSteps(steps) {
    const s = arr(steps);
    if (!s.length) return '';
    return `<ol class="steps">${s.map(x => {
      if (typeof x === 'string') return `<li class="step"><div class="step-t">${escapeHtml(x)}</div></li>`;
      return `<li class="step">
        <div class="step-t"><b>${escapeHtml(str(x.do))}</b>${x.detail ? ` <span class="why">— ${escapeHtml(x.detail)}</span>` : ''}</div>
        ${x.cmd ? code(x.cmd) : ''}</li>`;
    }).join('')}</ol>`;
  }

  function detailBody(kind, r) {
    const foot = () => `<div class="d-foot">${r.url ? link(r.url, TT('source')) : ''}${tagBits(r.tags)}</div>`;

    if (kind === 'premise') return dPara('', r.body);

    if (kind === 'step') {
      const sec = SEC_BY_KEY[str(r.goes)];
      return dPara('', r.what) + dPara('Why', r.why)
        + (sec ? `<div class="d-foot"><button class="btn primary" type="button" data-act="go" data-panel="${escapeHtml(sec.key)}">${escapeHtml(TT(sec.title))} →</button></div>` : '');
    }

    if (kind === 'image') {
      return dPara('', r.what) + dPara('Why an image', r.why)
        + (r.install ? `<div class="d-lbl">${TT('Switch to it')}</div>` + code(r.install) : '')
        + (r.note ? dPara('Note', r.note, 't-warn') : '')
        + dFacts([['Repository', r.repo]])
        + (r.url ? `<div class="d-foot">${link(r.url)}</div>` : '');
    }

    if (kind === 'limit') return dPara('', r.what) + dPara('Why', r.why);

    if (kind === 'grab') {
      const cat = grabCatById(r.cat);
      return dPara('', r.what) + dPara('', r.why)
        + (r.note ? dPara(isWont(r) ? 'Instead' : 'Note', r.note, isWont(r) ? 't-ok' : '') : '')
        + (r.get ? `<div class="d-lbl">${TT('How to fetch it')}</div>` + code(r.get) : '')
        + dFacts([
            ['Size', isWont(r) ? '—' : (str(r.size) || fmtSize(r.gb))],
            ['Time', isWont(r) ? '—' : fmtMins(r.minutes)],
            ['Category', cat ? str(cat.label) : ''],
            ['Store on', r.store], ['Verify', r.verify]
          ]) + foot();
    }

    if (kind === 'stack') {
      const rt = RATINGS[str(r.offline)] || {};
      return dPara('', r.does) + dPara('', r.why)
        + (r.escape ? dPara(str(r.offline) === 'tethered' ? 'Cutting the cord' : 'Keeping it fed', r.escape, 't-info') : '')
        + (r.install ? `<div class="d-lbl">${TT('Install')}</div>` + code(r.install) : '')
        + dFacts([
            ['Offline', TT(str(rt.label || r.offline))], ['Licence', r.license], ['Written in', r.lang],
            ['Platform', arr(r.platform).join(' · ')], ['RAM', r.ram], ['Disk', r.disk]
          ])
        + altsRow(r.alts, 'Or') + foot();
    }

    if (kind === 'iron') {
      const fx = num(DATA.iron && DATA.iron.fx, 18.5);
      const qty = num(r.qty, 1), line = num(r.usd, 0) * qty;
      const spec = obj(r.tierSpec)[state.ironTier] || r.spec;
      return dPara('', r.why)
        + (r.cloudFree === false
            ? `<div class="escape"><b>${TT('Escape')}</b> — ${escapeHtml(str(r.escape) || TT('None documented. It does not enter the building.'))}</div>`
            : (r.escape ? dPara('Escape', r.escape) : ''))
        + (r.spare ? dPara('Spare', r.spare, 't-warn') : '')
        + dFacts([
            ['Spec', spec], ['Unit', fmtUSD(r.usd)], ['Quantity', qty],
            ['Line total', fmtUSD(line) + ' · ' + fmtMXN(line * fx, 10)],
            ['In tiers', arr(r.tiers).join(' · ')], ['Source in MX', r.mx]
          ])
        + altsRow(r.alts, 'Or') + foot();
    }

    if (kind === 'media') {
      return dPara('', r.use) + dPara('', r.note)
        + dFacts([['Capacity', r.cap], ['Life', r.life], ['Cost', r.cost], ['Per TB', r.costPerTB]]);
    }
    if (kind === 'recipe')   return dPara('', r.why) + dSteps(r.steps);
    if (kind === 'artifact') return dPara('', r.what) + dPara('Why', r.why) + dPara('How', r.how) + dPara('Reprint', r.reprint, 't-dim');
    if (kind === 'use')      return dPara('', r.why)
        + dFacts([[r.material ? 'Material' : 'Carrier', str(r.tag) || str(r.material)],
                  [r.time ? 'Print time' : 'Payload', str(r.payload) || str(r.time)]]);

    if (kind === 'threat') {
      return dPara('What keeps working', r.works, 't-ok')
        + dPara('What does not help', r.useless, 't-dim')
        + dPara('', r.note)
        + dFacts([['Likelihood', TT(str(r.likelihood))], ['Layer', str(r.layer).toUpperCase()]]);
    }
    if (kind === 'brk')   return dPara('Why', r.why) + dPara('Mitigation', r.mitigation)
        + dFacts([['Severity', TT(str(r.severity))]]);
    if (kind === 'drill') return dPara('Rules', r.how) + dSteps(r.steps) + dPara('Pass', r.pass, 't-ok')
        + dFacts([['Cadence', r.cadence]]);
    if (kind === 'layer') return dPara('', r.d) + (r.rule ? dPara('Rule', r.rule, 't-accent') : '');

    if (kind === 'phase') {
      const tasks = arr(r.tasks);
      const done = tasks.filter((_, i) => state.phaseChecked[phaseKey(r.id, i)]).length;
      const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;
      return dPara('Deliverable', r.deliverable)
        + (tasks.length ? `<div class="d-lbl">${TT('Tasks')} <span class="num t-dim" data-progress="${escapeHtml(str(r.id))}">${done}/${tasks.length}</span></div>
             <div class="bar"><span class="bar-fill" data-fill="${escapeHtml(str(r.id))}" style="width:${pct}%"></span></div>` : '')
        + tasks.map((task, i) => {
            const on = !!state.phaseChecked[phaseKey(r.id, i)];
            return `<label class="task${on ? ' done' : ''}">
              <input type="checkbox" data-act="phase-toggle" data-phase="${escapeHtml(str(r.id))}" data-idx="${i}"${on ? ' checked' : ''}>
              <span>${escapeHtml(task)}</span></label>`;
          }).join('')
        + (r.exit ? `<div class="tl-exit"><b>${TT('Exit')}</b> — ${escapeHtml(r.exit)}</div>` : '')
        + dFacts([['Window', r.window]]);
    }
    return '';
  }

  function openDetail(kind, id) {
    const rec = findRec(kind, id);
    const box = $('modal'), ttl = $('modalTitle'), body = $('modalBody');
    if (!rec || !box || !ttl || !body) return;
    lastFocus = document.activeElement;
    ttl.textContent = str(DETAIL[kind].title(rec));
    body.innerHTML = detailBody(kind, rec) || `<p class="d-p t-dim">${TT('Nothing further recorded.')}</p>`;
    box.classList.add('open');
    box.setAttribute('aria-hidden', 'false');
    /* aria-modal only describes intent; inert is what actually keeps Tab inside.
       Every body child is inerted because carino-navbar.js moves the tabs and
       header controls out of .wrap, so inerting .wrap alone would miss them. */
    setBackgroundInert(box, true);
    const close = $('modalClose');
    if (close) close.focus();
  }

  function setBackgroundInert(box, on) {
    Array.prototype.slice.call(document.body.children).forEach(el => {
      if (el === box) return;
      if (on) el.inert = true; else el.inert = false;
    });
  }

  function closeMenus() {
    $$('.menu').forEach(m => { m.hidden = true; });
    $$('[data-act="menu"]').forEach(b => b.setAttribute('aria-expanded', 'false'));
  }

  function closeDetail() {
    const box = $('modal');
    if (!box || !box.classList.contains('open')) return;
    box.classList.remove('open');
    box.setAttribute('aria-hidden', 'true');
    setBackgroundInert(box, false);
    if (lastFocus && lastFocus.focus) lastFocus.focus();
    lastFocus = null;
  }

  /* ─────────────────────────────────────────────────────────────
     9. PUBLIC SURFACE + START
     ───────────────────────────────────────────────────────────── */

  OFFLINE.data = DATA;
  OFFLINE.state = state;
  OFFLINE.setPanel = setPanel;
  OFFLINE.render = renderAll;
  OFFLINE.reload = boot;
  OFFLINE.totals = grabTotals;
  OFFLINE.exportMarkdown = exportMarkdown;
  OFFLINE.exportScript = exportScript;
  OFFLINE.exportJSON = exportJSON;
  OFFLINE.openDetail = openDetail;
  OFFLINE.closeDetail = closeDetail;

  function start() {
    wire();
    setPanel(state.panel, { silent: true });   // paints the app bar before data lands
    boot();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();

})();
