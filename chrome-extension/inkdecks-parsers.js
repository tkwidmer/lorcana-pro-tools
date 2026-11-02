// inkdecks-parsers.js — DOM parsers for inkDecks pages (decks, metagame, matchups,
// tournaments). They run on a parsed Document, so the same code works for HTML the
// popup fetches AND for the page already open in the tab.

const INK_ALT = /^(amber|amethyst|emerald|ruby|sapphire|steel)$/i;

const norm = (s) => (s || '').replace(/\s+/g, ' ').trim();

const DECK_RE = /\/lorcana-metagame\/deck-.*?-(\d+)$/;
const TOURN_RE = /\/lorcana-tournaments\/(.+?-tournament-decks-)(\d+)$/;

function inks(el) {
  return [...el.querySelectorAll('img[alt]')].map((i) => i.alt).filter((a) => INK_ALT.test(a));
}

// ---------------------------------------------------------------- decks
function parseDecks(doc) {
  const out = [];
  const seen = new Set();
  for (const tr of doc.querySelectorAll('tr')) {
    const href = tr.getAttribute('data-href') || '';
    const m = href.match(DECK_RE);
    if (!m) continue;
    const id = m[1];
    if (seen.has(id)) continue; // per-page dedupe; caller dedupes across pages
    seen.add(id);

    const tds = [...tr.querySelectorAll('td')];
    const txt = tds.map((td) => norm(td.textContent));
    const rec = {
      deck_id: id, url: href, rank: null, record: null, name: null, author: null,
      set: null, format: null, archetype: null, inks: [], price_usd: null, spiciness: null,
    };
    if (txt[0]) {
      const rm = txt[0].match(/^(1st|2nd|3rd|4th|Top4|Top8|Top16|Top32|Top64|\d+)\b/);
      if (rm) rec.rank = rm[1];
      const dm = txt[0].match(/\b(\d+-\d+-\d+)\b/);
      if (dm) rec.record = dm[1];
    }
    if (tds[1]) {
      const a = tds[1].querySelector('a');
      if (a) rec.name = norm(a.textContent);
      // author lives in its own small/secondary div prefixed "by"; scan those divs
      // rather than regex-ing "by" out of the cell, because deck names contain "by"
      for (const div of tds[1].querySelectorAll('div.small.text-secondary')) {
        const t = norm(div.textContent);
        if (/^by\b/i.test(t)) { rec.author = t.slice(2).trim() || null; break; }
      }
    }
    if (tds[2]) {
      const badge = tds[2].querySelector('.badge');
      rec.set = badge ? norm(badge.textContent) : null;
      const fm = norm(tds[2].textContent).match(/\b(Core|Infinity)\b/);
      if (fm) rec.format = fm[1];
    }
    if (tds[3]) {
      rec.archetype = norm(tds[3].textContent) || null;
      rec.inks = inks(tds[3]);
    }
    if (tds[4]) {
      const pm = norm(tds[4].textContent).match(/\$([\d,]+\.\d{2})/);
      if (pm) rec.price_usd = parseFloat(pm[1].replace(/,/g, ''));
    }
    if (tds[5]) {
      const sm = norm(tds[5].textContent).match(/(\d+)%/);
      if (sm) rec.spiciness = parseFloat(sm[1]);
    }
    out.push(rec);
  }
  return out;
}

// ---------------------------------------------------------------- metagame
function parseMeta(doc) {
  const out = [];
  for (const tr of doc.querySelectorAll('tr')) {
    const nameTd = tr.querySelector('td[data-name]');
    if (!nameTd) continue;
    const rec = { archetype: nameTd.getAttribute('data-name') };
    const g = (sel, attr, cast) => {
      const el = tr.querySelector(sel);
      if (el && el.getAttribute(attr) !== null && el.getAttribute(attr) !== '') {
        rec[cast.as] = cast.fn(el.getAttribute(attr));
      }
    };
    g('td[data-metashare]', 'data-metashare', { as: 'metashare', fn: parseFloat });
    g('td[data-winrate]', 'data-winrate', { as: 'winrate', fn: parseFloat });
    g('td[data-fieldconv]', 'data-fieldconv',
      { as: 'field_conv', fn: (v) => Math.round(parseFloat(v) * 1000) / 1000 });
    g('td[data-totaldecks]', 'data-totaldecks', { as: 'total_decks', fn: (v) => parseInt(v, 10) });
    g('td[data-tier]', 'data-tier', { as: 'tier', fn: (v) => v });
    const trendEl = tr.querySelector('td[data-trend]');
    if (trendEl) rec.trend = trendEl.getAttribute('data-trend') || null;
    const a = nameTd.querySelector('a');
    rec.url = a ? a.getAttribute('href') : null;
    rec.inks = inks(nameTd);
    out.push(rec);
  }
  return out;
}

// ---------------------------------------------------------------- matchups
function parseMatchups(doc) {
  const out = [];
  let pending = null;
  for (const tr of doc.querySelectorAll('tr')) {
    const cells = [...tr.querySelectorAll('td,th')];
    if (!cells.length) continue;
    const texts = cells.map((c) => norm(c.textContent));
    const first = texts[0] || '';
    const head = first.match(/^(.{1,60}?)\s(\d+-\d+-\d+)$/);
    if (head) {
      if (pending) out.push(pending);
      pending = { archetype: head[1], record: head[2], winrate: null,
                  favored: [], even: [], unfavored: [] };
      if (texts[1] && texts[1].endsWith('%')) pending.winrate = parseFloat(texts[1]);
      continue;
    }
    const blob = texts.filter(Boolean).join(' ');
    if (!pending || !blob) continue;
    let bucket = null;
    const re = /(FAVORED \(\d+\)|EVEN \(\d+\)|UNFAVORED \(\d+\)|No matchups\.|[A-Za-z][A-Za-z &'!-]*?\s\d{1,3}%)/g;
    let m;
    while ((m = re.exec(blob))) {
      const tok = m[0];
      if (tok.startsWith('FAVORED')) { bucket = 'favored'; continue; }
      if (tok.startsWith('EVEN')) { bucket = 'even'; continue; }
      if (tok.startsWith('UNFAVORED')) { bucket = 'unfavored'; continue; }
      if (tok.startsWith('No matchups')) continue;
      if (!bucket) continue;
      const g = tok.match(/^(.*)\s(\d{1,3})%$/);
      if (g) pending[bucket].push({ vs: g[1].trim(), winrate: parseFloat(g[2]) });
    }
  }
  if (pending) out.push(pending);
  return out;
}

// ---------------------------------------------------------------- tournament index
function parseTournaments(doc) {
  const map = new Map();
  for (const tr of doc.querySelectorAll('tr')) {
    const href = tr.getAttribute('data-href') || '';
    const m = href.match(TOURN_RE);
    if (!m) continue;
    const id = m[2];
    const tds = [...tr.querySelectorAll('td')];
    const txt = tds.map((td) => norm(td.textContent));
    const rec = {
      tournament_id: parseInt(id, 10), slug: m[1] + m[2], url: href,
      date: null, set: null, format: null, name: null, organizer: null,
      players: null, tier: null, country: null,
    };
    if (txt[0]) { const dm = txt[0].match(/\d{4}-\d{2}-\d{2}/); if (dm) rec.date = dm[0]; }
    if (tds[1]) {
      const b = tds[1].querySelector('.badge');
      rec.set = b ? norm(b.textContent) : null;
      const fm = norm(tds[1].textContent).match(/\b(Core|Infinity|Poorcana)\b/);
      if (fm) rec.format = fm[1];
    }
    if (tds[2]) {
      const a = tds[2].querySelector('a');
      if (a) rec.name = norm(a.textContent);
      const org = tds[2].querySelector('div.text-muted');
      if (org) {
        rec.organizer = norm(org.textContent).replace(/\s*New\s*$/, '').replace(/^@\s*/, '').trim() || null;
      }
    }
    if (txt[3]) { const pm = txt[3].match(/\d+/); if (pm) rec.players = parseInt(pm[0], 10); }
    if (tds[4]) rec.tier = (tds[4].innerHTML.match(/ti-star-filled/g) || []).length;
    if (tds[5]) {
      const cm = tds[5].innerHTML.match(/flag-country-([a-z]{2})/);
      if (cm) rec.country = cm[1].toUpperCase();
    }
    // the index renders a desktop AND a mobile table: keep the populated row
    const prev = map.get(id);
    if (!prev || (prev.date === null && rec.date)) map.set(id, rec);
  }
  return [...map.values()];
}

// ---------------------------------------------------------------- coverage
function checkDeckCoverage(rows) {
  const ids = rows.map((r) => parseInt(r.deck_id, 10)).sort((a, b) => a - b);
  if (!ids.length) return { ok: false, reason: 'no rows' };
  const set = new Set(ids);
  const missing = [];
  for (let i = ids[0]; i <= ids[ids.length - 1]; i++) if (!set.has(i)) missing.push(i);
  const runs = [];
  if (missing.length) {
    let s = missing[0], p = missing[0];
    for (const v of missing.slice(1)) {
      if (v === p + 1) { p = v; continue; }
      runs.push([s, p]); s = p = v;
    }
    runs.push([s, p]);
  }
  return {
    ok: missing.length === 0 && ids.length === set.size,
    rows: ids.length, unique: set.size, duplicate_rows: ids.length - set.size,
    id_range: [ids[0], ids[ids.length - 1]],
    missing_count: missing.length, missing_runs: runs,
  };
}

// ---------------------------------------------------------------- routing
// Maps an inkDecks URL to the operation the popup runs. Pure logic.
function route(rawUrl) {
  let u;
  try { u = new URL(rawUrl); } catch { throw new Error('not a valid URL'); }
  if (!/(^|\.)inkdecks\.com$/.test(u.hostname)) {
    throw new Error('only inkdecks.com links are handled (got ' + u.hostname + ')');
  }
  const parts = u.pathname.split('/').filter(Boolean);
  const q = u.searchParams;
  if (!parts.length) throw new Error('no path in URL');

  if (parts[0] === 'lorcana-metagame') {
    if (parts.length > 2) {
      throw new Error("archetype detail pages aren't supported — use the metagame list "
        + 'or a tournament link');
    }
    const raw = q.get('metagame_id');
    if (raw !== null && !/^\d+$/.test(raw)) {
      throw new Error('metagame_id must be a number, got ' + JSON.stringify(raw));
    }
    return { kind: 'meta', format: parts[1] || 'core',
             metagame_id: raw === null ? null : Number(raw) };
  }
  if (parts[0] === 'lorcana-tournaments') {
    if (parts.length === 1) return { kind: 'tournaments', format: 'core' };
    const head = parts[1];
    if (parts.length === 2) {
      if (['core', 'infinity', 'poorcana'].includes(head)) {
        return { kind: 'tournaments', format: head };
      }
      return { kind: 'decks', slug: head };
    }
    const tail = parts[2];
    if (tail === 'matchups-analysis') {
      return { kind: 'matchups', slug: head, group_by: q.get('group_by') || 'archetypes' };
    }
    if (tail === 'winrates' || tail === 'performance') {
      // the site's other tabs; the matchup matrix is the useful form
      return { kind: 'matchups', slug: head, group_by: 'archetypes' };
    }
    throw new Error('unsupported tournament tab "' + tail + '"');
  }
  if (parts[0] === 'cards') return { kind: 'cards' };
  throw new Error("don't know how to handle /" + parts[0]);
}

const API = { parseDecks, parseMeta, parseMatchups, parseTournaments, checkDeckCoverage, route };
if (typeof globalThis !== 'undefined') globalThis.InkdecksParsers = API;