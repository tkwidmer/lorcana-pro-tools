import { useMemo } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { useCardPrices } from '../hooks/useCardPrices'
import { findPrinting, groupPrintings, cardPath, printingNumber } from '../lib/cardPrintings'
import { printingPrice, priceLabel } from '../lib/cardPrices'
import { FORMATS, legality } from '../lib/cardLegality'
import { resolveColors } from '../lib/inkColors'
import { InkIcons } from '../components/InkIcons'
import { CostBadge } from '../components/DecklistCardBar'
import { CardMetaSection } from '../components/CardMetaSection'
import { Button } from '../components/ui/Button'

const STATUS = {
  legal: { label: 'Legal', cls: 'bg-green-50 text-green-700 border-green-200' },
  banned: { label: 'Banned', cls: 'bg-red-50 text-red-700 border-red-200' },
  rotated: { label: 'Rotated', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
  not_legal: { label: 'Not legal', cls: 'bg-gray-100 text-gray-600 border-gray-200' },
}

const usd = n => (n == null ? '—' : `$${n.toFixed(2)}`)

const search = q =>`/cards?q=${encodeURIComponent(q)}`

function Chip({ q, children }) {
  return <Link to={search(q)} className="font-mono text-xs bg-gray-100 text-gray-700 rounded px-2 py-0.5 hover:bg-gray-200">{children}</Link>
}

// Keyword abilities bold with their reminder in italics; named abilities
// with the name bold; everything else as written.
function Ability({ ability }) {
  if (ability.type === 'keyword') {
    return (
      <p>
        <b>{ability.keyword}{ability.keywordValue ? ` ${ability.keywordValue}` : ''}</b>
        {ability.reminderText && <i className="text-gray-500"> ({ability.reminderText})</i>}
      </p>
    )
  }
  return (
    <p>
      {ability.name && <b>{ability.name} </b>}
      {ability.effect ?? ability.fullText}
    </p>
  )
}

function Section({ title, children }) {
  return (
    <section>
      <h2 className="font-display uppercase tracking-wide text-sm text-gray-500 mb-2">{title}</h2>
      {children}
    </section>
  )
}

export function CardPage() {
  const { setCode, number } = useParams()
  const { cards, sets, loading, error } = useCards()
  const { prices, updatedAt, error: pricesError } = useCardPrices()
  const card = useMemo(() => findPrinting(cards, setCode, number), [cards, setCode, number])
  const printings = useMemo(() => (card ? groupPrintings(cards).get(card) : []), [cards, card])

  if (loading) return <div className="w-full px-6 py-8 text-sm text-gray-500">Loading card data…</div>
  if (error) return <div className="w-full px-6 py-8 text-sm text-red-700">{error}</div>
  if (!card) {
    return (
      <div className="w-full px-6 py-8">
        <p className="text-gray-700 mb-4">No card is printed as {setCode}-{number}.</p>
        <Button to="/cards">Card Search</Button>
      </div>
    )
  }

  const set = sets[card.setCode]
  const colors = resolveColors([card.color])
  const status = legality(card)
  // An Action's effect is in `effects`, not `abilities` (a song's abilities
  // hold only its sing reminder), so the rules text is both, in that order.
  const abilities = [...(card.abilities ?? []), ...(card.effects ?? []).map(fullText => ({ fullText }))]
  const quickSearches = [
    ...(card.subtypes ?? []).map(s => ['t', s]),
    ...(card.keywordAbilities ?? []).map(k => ['k', k]),
    ['a', card.artistsText],
    ['story', card.story],
  ]

  return (
    <div className="w-full px-6 py-8">
      <div className="mb-6">
        <Link to="/cards" className="text-xs font-semibold uppercase tracking-widest text-forge-ink">Card Search</Link>
        <h1 className="text-3xl sm:text-4xl font-medium leading-tight text-gray-900 mt-1">{card.fullName}</h1>
        <p className="text-gray-500">{set?.name ?? `Set ${card.setCode}`} · #{printingNumber(card)} · {card.rarity}{card.promoSource ? ` · ${card.promoSource}` : ''}</p>
      </div>

      <div className="grid gap-8 md:grid-cols-[minmax(0,380px)_1fr]">
        <img src={card.images.full} alt={card.fullName} className="w-full rounded-xl" />

        <div className="space-y-8 min-w-0">
          <div className="flex flex-wrap items-center gap-3 text-sm text-gray-700">
            <InkIcons colors={colors} size={24} />
            <CostBadge cost={card.cost} inkable={card.inkwell} />
            <span>{card.inkwell ? 'Inkable' : 'Uninkable'}</span>
            <span>·</span>
            <span>{card.type}{card.subtypesText ? ` • ${card.subtypesText}` : ''}</span>
            {card.type === 'Character' && <span>· {card.strength} ¤ / {card.willpower} ⛉ / {card.lore} ◆</span>}
            {card.type === 'Location' && <span>· {card.willpower} ⛉ / {card.lore} ◆ · move {card.moveCost}</span>}
          </div>

          {abilities.length > 0 && (
            <div className="space-y-2 text-gray-900 leading-relaxed">
              {abilities.map((a, i) => <Ability key={i} ability={a} />)}
            </div>
          )}
          {card.flavorText && <p className="italic text-gray-500 whitespace-pre-line">{card.flavorText}</p>}
          <p className="text-sm text-gray-500">Illustrated by {card.artistsText} · {card.story} · {card.fullIdentifier}</p>

          <Section title="Legality">
            <ul className="flex flex-wrap gap-2">
              {FORMATS.map(f => {
                const s = status[f.key]
                const tone = STATUS[s.status]
                return (
                  <li key={f.key} className={`border rounded px-3 py-1.5 text-sm ${tone.cls}`}>
                    <span className="font-semibold">{f.label}</span> · {tone.label}
                    {s.since && <span className="text-xs"> since {s.since}</span>}
                    {s.until && <span className="text-xs"> until {s.until}</span>}
                  </li>
                )
              })}
            </ul>
            {card.maxCopiesInDeck != null && <p className="text-sm text-gray-700 mt-2">Up to {card.maxCopiesInDeck} copies in a deck.</p>}
          </Section>

          <CardMetaSection printings={printings} />

          <Section title={`Printings (${printings.length})`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wider text-gray-500 border-b border-gray-200">
                    <th className="py-1.5 pr-3 font-semibold">Set</th>
                    <th className="py-1.5 pr-3 font-semibold">#</th>
                    <th className="py-1.5 pr-3 font-semibold">Rarity</th>
                    <th className="py-1.5 pr-3 font-semibold">Source / finish</th>
                    <th className="py-1.5 pr-3 font-semibold text-right">Normal</th>
                    <th className="py-1.5 font-semibold text-right">Foil</th>
                  </tr>
                </thead>
                <tbody>
                  {printings.map(p => {
                    const current = p === card
                    const price = printingPrice(prices, p)
                    return (
                      <tr key={cardPath(p)} className={`border-b border-gray-100 ${current ? 'font-semibold text-forge-ink' : 'text-gray-700'}`}>
                        <td className="py-1.5 pr-3"><Link to={cardPath(p)} className="hover:underline">{sets[p.setCode]?.name ?? `Set ${p.setCode}`}</Link></td>
                        <td className="py-1.5 pr-3 whitespace-nowrap">#{printingNumber(p)}</td>
                        <td className="py-1.5 pr-3">{p.rarity}</td>
                        <td className="py-1.5 pr-3 text-gray-500">{p.promoSource ?? (p.foilTypes ?? []).filter(f => f !== 'None').join(', ')}</td>
                        <td className="py-1.5 pr-3 text-right tabular-nums">{usd(price?.normal)}</td>
                        <td className="py-1.5 text-right tabular-nums">{usd(price?.foil)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-xs text-gray-500 mt-2">
              {pricesError ?? (updatedAt ? `TCGplayer market price (USD) via duels.ink, ${updatedAt.slice(0, 10)}` : 'Loading prices…')}
            </p>
          </Section>

          {(card.clarifications?.length || card.errata?.length || card.historicData?.length) ? (
            <Section title="Rulings">
              <div className="space-y-3 text-sm text-gray-700">
                {(card.errata ?? []).map((e, i) => <p key={`e${i}`} className="whitespace-pre-line"><b>Errata.</b> {e}</p>)}
                {(card.clarifications ?? []).map((c, i) => <p key={`c${i}`} className="whitespace-pre-line">{c}</p>)}
                {(card.historicData ?? []).map((h, i) => (
                  <p key={`h${i}`} className="whitespace-pre-line text-gray-500"><b>Text until {h.usedUntil}.</b> {h.fullText}</p>
                ))}
              </div>
            </Section>
          ) : null}

          <Section title="Search">
            <div className="flex flex-wrap gap-2">
              {quickSearches.filter(([, v]) => v).map(([k, v]) => (
                <Chip key={`${k}:${v}`} q={`${k}:"${v}"`}>{k}:{v}</Chip>
              ))}
            </div>
          </Section>

          {card.externalLinks && (
            <Section title="Buy">
              <p className="text-lg text-gray-900 tabular-nums mb-3">{priceLabel(printingPrice(prices, card))}</p>
              <div className="flex flex-wrap gap-2">
                {card.externalLinks.tcgPlayerUrl && <Button size="sm" href={card.externalLinks.tcgPlayerUrl} target="_blank" rel="noreferrer">TCGplayer</Button>}
                {card.externalLinks.cardmarketUrl && <Button size="sm" href={card.externalLinks.cardmarketUrl} target="_blank" rel="noreferrer">Cardmarket</Button>}
                {card.externalLinks.cardTraderUrl && <Button size="sm" href={card.externalLinks.cardTraderUrl} target="_blank" rel="noreferrer">CardTrader</Button>}
              </div>
            </Section>
          )}
        </div>
      </div>
    </div>
  )
}
