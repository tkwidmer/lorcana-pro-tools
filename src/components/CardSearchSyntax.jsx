import { Link } from 'react-router-dom'

// The query language, one row per key, in the order a player reaches for
// them. Keep in step with cardQuery.js and docs/agents/cards.md.
const ROWS = [
  ['word, n:, name:', 'Card name (accent- and case-insensitive); !"Exact Name" for an exact match', 'elsa · !"Elsa - Spirit of Winter"'],
  ['o:, text:', 'Rules text; ~ is the card\'s own name; /regex/ allowed', 'o:"draw a card" · o:/banish .* item/'],
  ['t:, type:', 'Type or subtype; t= for the exact type', 't:song · t:floodborn · t=location'],
  ['k:, keyword:', 'A keyword ability', 'k:shift · k:evasive'],
  ['c:, ink:', 'Inks: c: at least, c= exactly, c<= within, c:m dual-ink, c:colorless', 'c:amethyst · c=amber,steel'],
  ['ci:, id:', 'Deck identity: every ink of the card within these', 'ci:amber,steel'],
  ['cost:', 'Ink cost', 'cost<=3 · cost=7'],
  ['str:, will:, lore:, move:', 'Strength, willpower, lore, move cost; compare to a number or another stat', 'str>=4 · will>str · lore>=3'],
  ['r:, rarity:', 'Rarity, ordered (c u r sr l e s)', 'r:legendary · r>=rare'],
  ['s:, set:', 'Set code or set name', 's:9 · s:q1 · set:fabled'],
  ['cn:, number:', 'Collector number', 'cn:4c · cn<10'],
  ['year:', 'Set release year', 'year>=2026'],
  ['f:, legal:, banned:', 'Format legality: core, infinity, coconut', 'f:core · banned:infinity'],
  ['is:, not:', 'inkable, uninkable, dual, promo, enchanted, reprint, variant, quest, banned, errata', 'is:inkable · -is:promo'],
  ['ft:, a:, story:, v:', 'Flavor text, artist, story, version (the subtitle)', 'a:"matthew robert davies" · story:frozen'],
  ['or, -, ( )', 'Any term, negation, grouping', '(t:song or k:rush) -c:ruby'],
  ['order:, dir:, unique:', 'name cost set rarity strength willpower lore released number · asc desc · cards prints', 'order:cost dir:desc unique:prints'],
]

const EXAMPLES = [
  'k:shift c:amethyst f:core order:cost',
  'o:"draw a card" is:inkable t=action',
  't:song cost<=3 ci:amber,steel',
  'will>str lore>=3 f:core',
  'is:banned',
  'r>=enchanted s:14 unique:prints',
]

export function CardSearchSyntax() {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {EXAMPLES.map(q => (
          <Link key={q} to={`/cards?q=${encodeURIComponent(q)}`} className="font-mono text-xs bg-gray-100 text-gray-700 rounded px-2 py-1 hover:bg-gray-200">
            {q}
          </Link>
        ))}
      </div>
      <table className="w-full text-sm">
        <tbody>
          {ROWS.map(([keys, what, example]) => (
            <tr key={keys} className="border-t border-gray-200 align-top">
              <td className="py-2 pr-4 font-mono text-xs whitespace-nowrap text-gray-900">{keys}</td>
              <td className="py-2 pr-4 text-gray-700">{what}</td>
              <td className="py-2 font-mono text-xs text-gray-500">{example}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
