import { useEffect, useMemo } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useCards } from '../hooks/useCards'
import { parseDeckList } from '../lib/parseDeckList'
import { buildCardIndex, toSimpleName } from '../lib/cardAnalysis'
import { BUCKET_ORDER, BUCKET_LABEL, decodeDeckParam, buildBuckets } from '../lib/decklistShared'
import { CardBar } from '../components/DecklistCardBar'

// A chrome-less, read-only render of a decklist meant to be added as an OBS
// Browser Source and cropped into a stream scene. Unlike DecklistInspectorPage
// it carries no local state: the deck comes entirely from the `deck` URL
// param, since a Browser Source has its own isolated storage separate from
// the tab the deck was copied from. It's also unguarded (see App.jsx) — a
// Browser Source has no Supabase session, and this view exposes no account
// data, only whatever decklist is encoded in the link.
export function DecklistOverlayPage() {
  const { cards } = useCards()
  const [searchParams] = useSearchParams()
  const deckText = decodeDeckParam(searchParams.get('deck') ?? '') ?? ''

  // OBS composites a Browser Source's page background as-is, so this view
  // needs a genuinely transparent <html>/<body> rather than the app's normal
  // light/dark surface color.
  useEffect(() => {
    const html = document.documentElement
    const prevHtmlBg = html.style.background
    const prevBodyBg = document.body.style.background
    html.style.background = 'transparent'
    document.body.style.background = 'transparent'
    return () => {
      html.style.background = prevHtmlBg
      document.body.style.background = prevBodyBg
    }
  }, [])

  const cardIndex = useMemo(() => buildCardIndex(cards), [cards])
  const parsed = useMemo(() => parseDeckList(deckText), [deckText])
  const matchedEntries = useMemo(() => {
    return parsed
      .map(({ name, count }) => ({ key: name, name, count, card: cardIndex.get(toSimpleName(name)) }))
      .filter(e => e.card)
  }, [parsed, cardIndex])
  const buckets = useMemo(() => buildBuckets(matchedEntries), [matchedEntries])

  return (
    <div className="w-[340px] px-3 py-3 space-y-2.5">
      {BUCKET_ORDER.map(type => (
        buckets[type].length > 0 && (
          <div key={type}>
            <h3 className="text-xs font-bold uppercase tracking-wide text-gray-500 mb-1">
              {BUCKET_LABEL[type]} ({buckets[type].reduce((s, e) => s + e.count, 0)})
            </h3>
            <div className="space-y-0.5">
              {buckets[type].map(entry => (
                <CardBar key={entry.key} entry={entry} />
              ))}
            </div>
          </div>
        )
      ))}
    </div>
  )
}
