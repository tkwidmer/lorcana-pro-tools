// Scryfall-style search over LorcanaJSON printings. parseQuery turns a query
// string into one predicate plus the order/unique directives; runQuery
// applies it. Unknown keys or values throw QuerySyntaxError, which the
// search page shows verbatim.
import { legality } from './cardLegality'
import { groupPrintings, primaryPrinting, setOrder } from './cardPrintings'
import { printingPrice, usdOf } from './cardPrices'

export class QuerySyntaxError extends Error {}

export const norm = s =>
  String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim()

const INKS = ['amber', 'amethyst', 'emerald', 'ruby', 'sapphire', 'steel']
const inks = c => (c.color ?? '').split('-').filter(Boolean).map(s => s.toLowerCase())

const RARITY_RANK = { common: 0, uncommon: 1, rare: 2, 'super rare': 3, legendary: 4, enchanted: 5, special: 6, epic: 7, iconic: 8 }
const RARITY_ALIAS = { c: 'common', u: 'uncommon', r: 'rare', sr: 'super rare', 'super-rare': 'super rare', l: 'legendary', e: 'enchanted', s: 'special' }
const FORMAT_KEY = { core: 'Core', infinity: 'Infinity', coconut: 'FormatCoconut' }

const COMPARE = {
  '=': (a, b) => a === b,
  '!=': (a, b) => a !== b,
  '<': (a, b) => a < b,
  '<=': (a, b) => a <= b,
  '>': (a, b) => a > b,
  '>=': (a, b) => a >= b,
}
const cmpOp = op => COMPARE[op === ':' ? '=' : op]

// o: searches the rules text without reminder text (Lorcana puts every
// reminder in parentheses); fo: searches all of it, like Scryfall.
const rulesText = c => (c.fullText ?? '').replace(/\([^)]*\)/g, '')

const TEXT = {
  n: c => c.fullName, name: c => c.fullName,
  o: rulesText, text: rulesText, oracle: rulesText,
  fo: c => c.fullText, fulloracle: c => c.fullText,
  ft: c => c.flavorText, flavor: c => c.flavorText,
  a: c => c.artistsText, artist: c => c.artistsText,
  story: c => c.story,
  v: c => c.version, version: c => c.version,
}
const STAT = {
  cost: 'cost', mv: 'cost', manavalue: 'cost', cmc: 'cost',
  str: 'strength', strength: 'strength', pow: 'strength', power: 'strength',
  will: 'willpower', willpower: 'willpower', tou: 'willpower', toughness: 'willpower',
  lore: 'lore', l: 'lore',
  move: 'moveCost', movecost: 'moveCost',
}
const IS = {
  inkable: c => c.inkwell === true,
  inkwell: c => c.inkwell === true,
  uninkable: c => c.inkwell === false,
  dual: c => inks(c).length === 2,
  promo: c => !!c.promoGrouping,
  enchanted: c => c.rarity === 'Enchanted',
  reprint: c => !!c.reprintOfId,
  variant: c => !!c.variant,
  quest: c => c.setCode.startsWith('Q'),
  banned: c => Object.values(legality(c)).some(s => s.status === 'banned'),
  errata: c => (c.errata?.length ?? 0) > 0,
}
const ORDER_ALIAS = { cmc: 'cost', mv: 'cost', power: 'strength', pow: 'strength', toughness: 'willpower', tou: 'willpower' }
export const ORDERS = ['name', 'cost', 'set', 'rarity', 'strength', 'willpower', 'lore', 'color', 'artist', 'released', 'number', 'usd']

// --- tokenizer ---------------------------------------------------------------

// Groups: 1 "(" · 2 ")" · 3 "-" · 4 "!" + 5 its value · 6 or · 7 key 8 op 9 value · 10 quoted word · 11 bare word
const TOKEN = /\s*(?:(\()|(\))|(-)|(!)("(?:[^"\\]|\\.)*"|[^\s()]+)|(or)(?=[\s()]|$)|([A-Za-z]+)(!=|<=|>=|:|=|<|>)("(?:[^"\\]|\\.)*"|\/(?:[^/\\]|\\.)*\/|[^\s()]+)|("(?:[^"\\]|\\.)*")|([^\s()]+))/iy

function unquote(v) {
  if (!v.startsWith('"')) return v
  if (v.length < 2 || !v.endsWith('"')) throw new QuerySyntaxError('Missing closing quote')
  return v.slice(1, -1).replace(/\\(.)/g, '$1')
}

function tokenize(q) {
  const tokens = []
  const src = q.trim()
  let pos = 0
  while (pos < src.length) {
    TOKEN.lastIndex = pos
    const m = TOKEN.exec(src)
    if (!m) throw new QuerySyntaxError(`Can't read the query at "${src.slice(pos, pos + 12)}"`)
    pos = TOKEN.lastIndex
    const text = m[0].trim()
    if (m[1]) tokens.push({ type: '(', text })
    else if (m[2]) tokens.push({ type: ')', text })
    else if (m[3]) tokens.push({ type: '-', text })
    else if (m[4]) tokens.push({ type: 'exact', value: unquote(m[5]), text })
    else if (m[6]) tokens.push({ type: 'or', text })
    else if (m[7]) tokens.push({ type: 'term', key: m[7].toLowerCase(), op: m[8], raw: m[9], text })
    else if (m[10]) tokens.push({ type: 'term', key: 'name', op: ':', raw: m[10], text })
    else tokens.push({ type: 'term', key: 'name', op: ':', raw: m[11], text })
  }
  return tokens
}

// --- term compilers ----------------------------------------------------------

const isRegex = raw => raw.length >= 2 && raw.startsWith('/') && raw.endsWith('/')

function toRegex(raw) {
  try {
    return new RegExp(raw.slice(1, -1), 'i')
  } catch (e) {
    throw new QuerySyntaxError(`Invalid regex: ${e.message}`)
  }
}

function textPredicate(get, op, raw) {
  if (isRegex(raw)) {
    const re = toRegex(raw)
    return c => re.test(norm(get(c)))
  }
  const value = norm(unquote(raw))
  const needle = value.includes('~') ? c => value.replaceAll('~', norm(c.name)) : () => value
  if (op === ':') return c => norm(get(c)).includes(needle(c))
  if (op === '=') return c => norm(get(c)) === needle(c)
  throw new QuerySyntaxError(`"${op}" can't be used with a text field`)
}

function statPredicate(field, op, value) {
  const other = STAT[value.toLowerCase()]
  const n = Number(value)
  if (!other && (value === '' || Number.isNaN(n))) throw new QuerySyntaxError(`"${value}" isn't a number or a stat`)
  const rhs = other ? c => c[other] : () => n
  const cmp = cmpOp(op)
  return c => {
    const a = c[field]
    const b = rhs(c)
    return typeof a === 'number' && typeof b === 'number' && cmp(a, b)
  }
}

function parseInks(value) {
  const v = norm(value)
  if (v === 'colorless' || v === 'c') return []
  return v.split(/[\s,/-]+/).filter(Boolean).map(ink => {
    if (!INKS.includes(ink)) throw new QuerySyntaxError(`Unknown ink "${ink}"`)
    return ink
  })
}

const subset = (a, b) => a.every(x => b.includes(x))

function colorPredicate(op, value, identity) {
  if (!identity && op === ':' && /^(m|multi|multicolor)$/i.test(value)) return c => inks(c).length >= 2
  if (!identity && /^\d+$/.test(value)) {
    const n = Number(value)
    const cmp = cmpOp(op)
    return c => cmp(inks(c).length, n)
  }
  const q = parseInks(value)
  if (q.length === 0) return c => inks(c).length === 0
  const effective = op === ':' ? (identity ? '<=' : '>=') : op
  switch (effective) {
    case '>=': return c => subset(q, inks(c))
    case '<=': return c => subset(inks(c), q)
    case '=': return c => subset(q, inks(c)) && subset(inks(c), q)
    case '!=': return c => !(subset(q, inks(c)) && subset(inks(c), q))
    case '>': return c => subset(q, inks(c)) && inks(c).length > q.length
    case '<': return c => subset(inks(c), q) && inks(c).length < q.length
    default: throw new QuerySyntaxError(`"${op}" can't be used with colors`)
  }
}

function rarityPredicate(op, value) {
  const v = norm(value)
  const name = RARITY_ALIAS[v] ?? v
  if (!(name in RARITY_RANK)) throw new QuerySyntaxError(`Unknown rarity "${value}"`)
  const cmp = cmpOp(op)
  return c => {
    const rank = RARITY_RANK[norm(c.rarity)]
    return rank != null && cmp(rank, RARITY_RANK[name])
  }
}

function formatOf(value) {
  const key = FORMAT_KEY[norm(value)]
  if (!key) throw new QuerySyntaxError(`Unknown format "${value}" (core, infinity, coconut)`)
  return key
}

// Keys that only test membership: ":" and "=" mean the same, anything else is an error.
const EQUALITY_ONLY = new Set(['k', 'kw', 'keyword', 's', 'set', 'e', 'edition', 'f', 'format', 'legal', 'banned', 'is', 'not', 'order', 'dir', 'direction', 'unique', 'display'])

function compileTerm({ key, op, raw }, sets, opts, prices) {
  const value = unquote(raw)
  if (key in TEXT) return textPredicate(TEXT[key], op, raw)
  if (key in STAT) return statPredicate(STAT[key], op, value)
  if (EQUALITY_ONLY.has(key) && op !== ':' && op !== '=') throw new QuerySyntaxError(`"${op}" can't be used with ${key}:`)
  switch (key) {
    case 'c': case 'color': case 'ink':
      return colorPredicate(op, value, false)
    case 'ci': case 'id': case 'identity':
      return colorPredicate(op, value, true)
    case 't': case 'type': {
      // A regex is tested against the type and each subtype on its own, so
      // anchors work: t:/^(prince|princess)$/.
      if (isRegex(raw)) {
        const re = toRegex(raw)
        return c => [c.type, ...(c.subtypes ?? [])].some(t => re.test(norm(t)))
      }
      const v = norm(value)
      if (op === '=') return c => norm(c.type) === v
      if (op === ':') return c => norm(`${c.type} ${c.subtypesText ?? ''}`).includes(v)
      throw new QuerySyntaxError(`"${op}" can't be used with type`)
    }
    case 'k': case 'kw': case 'keyword': {
      const v = norm(value)
      return c => (c.keywordAbilities ?? []).some(k => norm(k) === v)
    }
    case 'r': case 'rarity':
      return rarityPredicate(op, value)
    case 's': case 'set': case 'e': case 'edition': {
      const v = norm(value)
      return c => norm(c.setCode) === v || norm(sets[c.setCode]?.name).includes(v)
    }
    case 'cn': case 'number': {
      if (op === ':' || op === '=') { const v = norm(value); return c => norm(`${c.number}${c.variant ?? ''}`) === v }
      const n = Number(value)
      if (Number.isNaN(n)) throw new QuerySyntaxError(`"${value}" isn't a number`)
      const cmp = cmpOp(op)
      return c => cmp(c.number, n)
    }
    case 'year': {
      const n = Number(value)
      if (Number.isNaN(n)) throw new QuerySyntaxError(`"${value}" isn't a year`)
      const cmp = cmpOp(op)
      return c => {
        const date = sets[c.setCode]?.releaseDate
        return !!date && cmp(Number(date.slice(0, 4)), n)
      }
    }
    case 'date': {
      const v = norm(value)
      const bySet = Object.entries(sets).find(([code]) => norm(code) === v)?.[1]?.releaseDate
      const target = bySet ?? (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)
      if (!target) throw new QuerySyntaxError(`"${value}" isn't a yyyy-mm-dd date or a set code`)
      const cmp = cmpOp(op)
      // ISO dates compare correctly as strings.
      return c => {
        const date = sets[c.setCode]?.releaseDate
        return !!date && cmp(date, target)
      }
    }
    case 'f': case 'format': case 'legal': {
      const fmt = formatOf(value)
      return c => legality(c)[fmt].status === 'legal'
    }
    case 'banned': {
      const fmt = formatOf(value)
      return c => legality(c)[fmt].status === 'banned'
    }
    case 'is': case 'not': {
      const p = IS[norm(value)]
      if (!p) throw new QuerySyntaxError(`Unknown is: value "${value}" (${Object.keys(IS).join(', ')})`)
      return key === 'is' ? p : c => !p(c)
    }
    case 'order': {
      const v = ORDER_ALIAS[norm(value)] ?? norm(value)
      if (!ORDERS.includes(v)) throw new QuerySyntaxError(`Unknown order "${value}" (${ORDERS.join(', ')})`)
      opts.order = v
      return () => true
    }
    case 'dir': case 'direction': {
      const v = norm(value)
      if (v !== 'asc' && v !== 'desc') throw new QuerySyntaxError(`direction must be asc or desc`)
      opts.direction = v
      return () => true
    }
    case 'usd': {
      if (!prices) throw new QuerySyntaxError('Prices are not loaded')
      const n = Number(value)
      if (value === '' || Number.isNaN(n)) throw new QuerySyntaxError(`"${value}" isn't a price`)
      const cmp = cmpOp(op)
      return c => {
        const p = usdOf(printingPrice(prices, c))
        return p != null && cmp(p, n)
      }
    }
    case 'display': {
      const v = norm(value)
      const display = v === 'checklist' ? 'list' : v
      if (display !== 'grid' && display !== 'list') throw new QuerySyntaxError('display must be grid or list')
      opts.display = display
      return () => true
    }
    case 'unique': {
      const v = norm(value)
      if (v !== 'cards' && v !== 'prints') throw new QuerySyntaxError(`unique must be cards or prints`)
      opts.unique = v
      return () => true
    }
    default:
      throw new QuerySyntaxError(`Unknown search key "${key}"`)
  }
}

// --- parser ------------------------------------------------------------------
// expr := and ("or" and)* ; and := unary+ ; unary := "-" unary | "(" expr ")" | term | exact

function parse(tokens, sets, opts, prices) {
  let i = 0
  const peek = () => tokens[i]
  const next = () => tokens[i++]

  function parseOr() {
    let left = parseAnd()
    while (peek()?.type === 'or') {
      next()
      const right = parseAnd()
      const l = left, r = right
      left = c => l(c) || r(c)
    }
    return left
  }

  function parseAnd() {
    const parts = []
    while (peek() && peek().type !== ')' && peek().type !== 'or') parts.push(parseUnary())
    if (parts.length === 0) throw new QuerySyntaxError('Expected a search term')
    return c => parts.every(p => p(c))
  }

  function parseUnary() {
    const t = next()
    if (!t) throw new QuerySyntaxError('Expected a search term at the end')
    if (t.type === '-') { const p = parseUnary(); return c => !p(c) }
    if (t.type === '(') {
      const p = parseOr()
      if (next()?.type !== ')') throw new QuerySyntaxError('Missing ")"')
      return p
    }
    if (t.type === 'exact') { const v = norm(t.value); return c => norm(c.fullName) === v || norm(c.name) === v }
    if (t.type === 'term') return compileTerm(t, sets, opts, prices)
    throw new QuerySyntaxError(`Unexpected "${t.type}"`)
  }

  const predicate = parseOr()
  if (i < tokens.length) throw new QuerySyntaxError(`Unexpected "${tokens[i].type === ')' ? ')' : 'input'}"`)
  return predicate
}

export function parseQuery(q, sets, prices = null) {
  const opts = { order: 'set', direction: 'asc', unique: 'cards', display: 'grid' }
  const tokens = tokenize(q)
  const predicate = tokens.length ? parse(tokens, sets, opts, prices) : () => true
  if (opts.order === 'usd' && !prices) throw new QuerySyntaxError('Prices are not loaded')
  return { predicate, ...opts }
}

// --- running a query ---------------------------------------------------------

const ORDER_KEY = {
  name: () => c => norm(c.fullName),
  cost: () => c => c.cost ?? -1,
  // Set, then its regular cards by number, then its promos by number (the default).
  set: () => c => setOrder(c) * 100000 + (c.promoGrouping ? 50000 : 0) + c.number,
  rarity: () => c => RARITY_RANK[norm(c.rarity)] ?? -1,
  strength: () => c => c.strength ?? -1,
  willpower: () => c => c.willpower ?? -1,
  lore: () => c => c.lore ?? -1,
  color: () => c => c.color ?? '',
  artist: () => c => norm(c.artistsText),
  released: sets => c => sets[c.setCode]?.releaseDate ?? '',
  number: () => c => c.number,
  usd: (sets, prices) => c => usdOf(printingPrice(prices, c)),
}

const compare = (a, b) => (a < b ? -1 : a > b ? 1 : 0)

export function runQuery(cards, sets, q, prices = null) {
  if (!q.trim()) return { cards: [], display: 'grid', order: 'set', direction: 'asc' }
  const { predicate, order, direction, unique, display } = parseQuery(q, sets, prices)
  let hits = cards.filter(predicate)
  if (unique === 'cards') {
    // One row per card: the best matching printing among that card's printings.
    const groups = groupPrintings(cards)
    const matching = new Map()
    for (const c of hits) {
      const g = groups.get(c)
      if (!matching.has(g)) matching.set(g, [])
      matching.get(g).push(c)
    }
    hits = [...matching.values()].map(primaryPrinting)
  }
  const key = ORDER_KEY[order](sets, prices)
  const sign = direction === 'desc' ? -1 : 1
  // Only usd yields null (an unpriced printing): it sorts last either way.
  const missingLast = (a, b) => (a == null) - (b == null)
  hits.sort((a, b) => {
    const ka = key(a), kb = key(b)
    return missingLast(ka, kb) ||
      sign * compare(ka, kb) ||
      compare(norm(a.fullName), norm(b.fullName)) ||
      setOrder(a) - setOrder(b) ||
      (a.promoGrouping ? 1 : 0) - (b.promoGrouping ? 1 : 0) ||
      a.number - b.number ||
      (a.variant ?? '').localeCompare(b.variant ?? '')
  })
  return { cards: hits, display, order, direction }
}

// Rewrites one directive inside a query string, leaving every other token,
// quoted values included, untouched; value null removes it. Every alias of
// the key goes (dir: and direction:).
const DIRECTIVE_ALIASES = { dir: ['dir', 'direction'] }

export function withDirective(q, key, value) {
  const keys = DIRECTIVE_ALIASES[key] ?? [key]
  const kept = tokenize(q).filter(t => !(t.type === 'term' && keys.includes(t.key)))
  const text = kept.map(t => t.text).join(' ')
  return value == null ? text : `${text} ${key}:${value}`.trim()
}
