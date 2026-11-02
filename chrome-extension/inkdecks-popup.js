/* global chrome */
// inkdecks-popup.js — the popup's one-click inkDecks collector.
//
// Two modes, deliberately:
//   FETCH  — requests every page (needed for a full paginated deck list). Goes through
//            the browser's own network stack, so it carries the browser fingerprint and
//            the cf_clearance session that already get through. host_permissions lets it
//            read cross-origin responses, which is the CORS wall a plain web page hits.
//   DOM    — zero network: reads the page you already have open. Works even when
//            fetching is refused, but only covers that one page.

const BASE = 'https://inkdecks.com';
const P = globalThis.InkdecksParsers;

const $ = (id) => document.getElementById(id);
const state = { rows: null, op: null, warnings: [] };

function setStatus(msg, cls = '') {
  $('st').className = cls;
  $('st').textContent = msg;
}

// ------------------------------------------------------------------ fetching
async function fetchDoc(url) {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) {
    const err = new Error('HTTP ' + r.status + ' — fetching refused. Try "Parse this page".');
    err.status = r.status;
    throw err;
  }
  return new DOMParser().parseFromString(await r.text(), 'text/html');
}

async function collectDecks(slug) {
  const seen = new Set();
  const rows = [];
  const MAX = 40;
  for (let p = 1; p <= MAX; p++) {
    const url = BASE + '/lorcana-tournaments/' + slug + (p > 1 ? '?sort=id&page=' + p : '?sort=id');
    setStatus('fetching page ' + p + '… (' + rows.length + ' decks so far)');
    const doc = await fetchDoc(url);
    const got = P.parseDecks(doc);
    if (!got.length) break;
    let added = 0;
    for (const r of got) {
      if (seen.has(r.deck_id)) continue;
      seen.add(r.deck_id); rows.push(r); added++;
    }
    if (added === 0) {
      // a page that adds nothing means either the list ended or the site served a
      // repeated slice — the failure mode that silently dropped 66 decks once
      state.warnings.push('page ' + p + ' contained no new decks — stopped there');
      break;
    }
    const hasNext = [...doc.querySelectorAll('a[href]')]
      .some((a) => (a.getAttribute('href') || '').includes('page=' + (p + 1)));
    if (!hasNext) break;
  }
  return rows;
}

async function collect(op) {
  if (op.kind === 'decks') return collectDecks(op.slug);
  if (op.kind === 'meta') {
    const url = BASE + '/lorcana-metagame/' + op.format
      + (op.metagame_id ? '?metagame_id=' + encodeURIComponent(op.metagame_id) : '');
    return P.parseMeta(await fetchDoc(url));
  }
  if (op.kind === 'matchups') {
    const url = BASE + '/lorcana-tournaments/' + op.slug
      + '/matchups-analysis?group_by=' + encodeURIComponent(op.group_by);
    return P.parseMatchups(await fetchDoc(url));
  }
  if (op.kind === 'tournaments') {
    return P.parseTournaments(await fetchDoc(BASE + '/lorcana-tournaments/' + op.format));
  }
  if (op.kind === 'cards') {
    const r = await fetch(BASE + '/cards/autocomplete', { credentials: 'include' });
    if (!r.ok) throw new Error('HTTP ' + r.status + ' fetching the card database');
    return r.json();
  }
  throw new Error('unsupported kind ' + op.kind);
}

// ------------------------------------------------------------------ reporting
function report(rows, op) {
  state.rows = rows;
  state.op = op;
  let msg = rows.length + ' rows · ' + op.kind;
  let cls = 'ok';
  if (op.kind === 'decks') {
    const cov = P.checkDeckCoverage(rows);
    msg += '\n' + cov.unique + ' unique decks, ids ' + cov.id_range[0] + '–' + cov.id_range[1];
    if (cov.missing_count) {
      msg += '\n⚠ ' + cov.missing_count + ' deck ids missing ' + JSON.stringify(cov.missing_runs)
           + ' — fetch again; do NOT trust this pull';
      cls = 'err';
    } else if (cov.duplicate_rows) {
      msg += '\n⚠ ' + cov.duplicate_rows + ' duplicate rows';
      cls = 'warn';
    } else {
      msg += '\nno gaps, no duplicates';
    }
  }
  if (state.warnings.length) {
    msg += '\n⚠ ' + state.warnings.join('; ');
    if (cls === 'ok') cls = 'warn';
  }
  setStatus(msg, cls);
  $('acts').classList.add('on');
  $('hint').hidden = false;
}

function filename(op) {
  if (op.kind === 'decks') return op.slug + '.json';
  if (op.kind === 'matchups') return op.slug + '-matchups-' + op.group_by + '.json';
  return 'inkdecks-' + op.kind + '.json';
}

async function download() {
  const blob = new Blob([JSON.stringify(state.rows, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename(state.op);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

async function copy() {
  await navigator.clipboard.writeText(JSON.stringify(state.rows, null, 2));
  const b = $('cp');
  const old = b.textContent;
  b.textContent = 'Copied';
  setTimeout(() => { b.textContent = old; }, 1200);
}

// ------------------------------------------------------------------ wiring
async function init() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && /inkdecks\.com/.test(tab.url)) {
    $('u').value = tab.url;
    setStatus('Ready. "Fetch all pages" pulls everything; "Parse this page" uses no network.');
  } else {
    setStatus('Open an inkDecks page, or paste a link below.', 'warn');
  }
}

async function busy(fn) {
  for (const id of ['fetch', 'dom', 'dl', 'cp']) $(id).disabled = true;
  state.warnings = [];
  try { await fn(); }
  catch (e) {
    setStatus(String(e.message || e), 'err');
    if (e.status === 403) {
      setStatus(String(e.message) + '\nFetching is refused from this network — ' +
        'use "Parse this page" instead (no network needed).', 'err');
    }
  } finally {
    for (const id of ['fetch', 'dom']) $(id).disabled = false;
    $('dl').disabled = false; $('cp').disabled = false;
  }
}

$('fetch').addEventListener('click', () => busy(async () => {
  const op = P.route($('u').value.trim());
  setStatus('starting…');
  const rows = await collect(op);
  report(rows, op);
}));

$('dom').addEventListener('click', () => busy(async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.url) throw new Error('no active tab');
  const op = P.route(tab.url);
  setStatus('reading the open page (no network)…');
  const [res] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => document.documentElement.outerHTML,
  });
  const doc = new DOMParser().parseFromString(res.result, 'text/html');
  const rows = op.kind === 'decks' ? P.parseDecks(doc)
             : op.kind === 'meta' ? P.parseMeta(doc)
             : op.kind === 'matchups' ? P.parseMatchups(doc)
             : op.kind === 'tournaments' ? P.parseTournaments(doc)
             : [];
  if (op.kind !== 'decks') { report(rows, op); return; }
  // single page only — say so rather than implying the list is complete
  state.rows = rows; state.op = op;
  state.warnings.push('this is ONE page only — use "Fetch all pages" for the full list');
  report(rows, op);
}));

$('dl').addEventListener('click', download);
$('cp').addEventListener('click', copy);

init();