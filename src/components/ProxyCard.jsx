const LORE_PIP = '◇'

const card = {
  width: '2.5in',
  height: '3.5in',
  border: '2px solid black',
  borderRadius: '6pt',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  padding: '0.1in',
  backgroundColor: 'white',
  overflow: 'hidden',
  breakInside: 'avoid',
  pageBreakInside: 'avoid',
  fontFamily: 'Georgia, serif',
  fontSize: '7.5pt',
  lineHeight: '1.25',
  color: 'black',
}

function CostBadge({ cost }) {
  return (
    <div style={{
      border: '2px solid black',
      borderRadius: '50%',
      width: '20pt',
      height: '20pt',
      minWidth: '20pt',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontSize: '10pt',
      fontWeight: 'bold',
      fontFamily: 'Arial, sans-serif',
      lineHeight: 1,
    }}>
      {cost}
    </div>
  )
}

function StatsBar({ card: c }) {
  const isCharacter = c.type === 'Character'
  const isLocation = c.type === 'Location'
  const showStats = isCharacter || isLocation

  let stats = null
  if (isCharacter) stats = `S:${c.strength}  W:${c.willpower}`
  if (isLocation) stats = `${c.move_cost != null ? `Move:${c.move_cost}  ` : ''}W:${c.willpower}`

  return (
    <div style={{
      borderTop: '1.5px solid black',
      borderBottom: '1.5px solid black',
      padding: '3pt 0',
      marginBottom: '4pt',
      flexShrink: 0,
      fontFamily: 'Arial, sans-serif',
    }}>
      {/* Line 1: Ink color (left) · Stats (right) — same size */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: '8pt',
        fontWeight: 'bold',
        marginBottom: '2pt',
      }}>
        <span style={{ fontStyle: 'italic' }}>{c.color}</span>
        {showStats && <span>{stats}</span>}
      </div>
      {/* Line 2: Subtypes (left) · Inkable (right) */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'baseline',
        fontSize: '7pt',
      }}>
        <span>{c.subtypes?.join(', ')}</span>
        <span style={{ fontStyle: 'italic', color: c.inkwell ? 'black' : '#888' }}>
          {c.inkwell ? 'Inkable' : 'Non-inkable'}
        </span>
      </div>
    </div>
  )
}

function AbilityText({ ability, first }) {
  return (
    <div style={{ marginBottom: '3pt' }}>
      {!first && (
        <div style={{ borderTop: '0.5pt solid #bbb', marginBottom: '3pt' }} />
      )}
      {ability.name
        ? (
          <span>
            <span style={{ fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>
              {ability.name}{' '}
            </span>
            <span style={{ fontStyle: 'italic' }}>{ability.effect}</span>
          </span>
        )
        : <span>{ability.fullText}</span>
      }
    </div>
  )
}

export function ProxyCard({ card: c, onRemove }) {
  const hasLore = c.lore > 0
  const hasAbilities = c.abilities?.length > 0
  const hasFlavorText = !!c.flavorText

  return (
    <div style={card}>
      {/* Header: cost · name · inkable */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: '6pt', marginBottom: '4pt', flexShrink: 0 }}>
        <CostBadge cost={c.cost} />
        <div style={{ flex: 1, textAlign: 'center', minWidth: 0 }}>
          <div style={{
            fontSize: '12pt',
            fontWeight: '900',
            fontFamily: 'Arial Black, Arial, sans-serif',
            textTransform: 'uppercase',
            lineHeight: 1.05,
            letterSpacing: '0.02em',
            wordBreak: 'break-word',
          }}>
            {c.name}
          </div>
          {c.version && (
            <div style={{
              fontSize: '8pt',
              fontStyle: 'italic',
              fontFamily: 'Georgia, serif',
              marginTop: '2pt',
              lineHeight: 1.1,
            }}>
              {c.version}
            </div>
          )}
        </div>
      </div>

      {/* Stats bar: color · subtypes · S/W */}
      <StatsBar card={c} />

      {/* Text body: abilities + lore pips */}
      <div style={{ flex: 1, display: 'flex', gap: '4pt', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {hasAbilities && c.abilities.map((ability, i) => (
            <AbilityText key={i} ability={ability} first={i === 0} />
          ))}
          {hasFlavorText && (
            <div style={{
              marginTop: hasAbilities ? '4pt' : 0,
              paddingTop: hasAbilities ? '3pt' : 0,
              borderTop: hasAbilities ? '0.5pt solid #bbb' : 'none',
              fontStyle: 'italic',
              color: '#444',
              lineHeight: '1.3',
            }}>
              {c.flavorText}
            </div>
          )}
        </div>
        {hasLore && (
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'flex-start',
            alignItems: 'center',
            paddingTop: '2pt',
            gap: '3pt',
            fontSize: '10pt',
            flexShrink: 0,
          }}>
            {Array.from({ length: c.lore }).map((_, i) => (
              <span key={i}>{LORE_PIP}</span>
            ))}
          </div>
        )}
      </div>

      {/* Footer: artist · set/number · rarity */}
      <div style={{
        borderTop: '1px solid black',
        marginTop: '3pt',
        paddingTop: '2pt',
        display: 'flex',
        justifyContent: 'space-between',
        fontSize: '5.5pt',
        color: '#444',
        fontFamily: 'Arial, sans-serif',
        flexShrink: 0,
      }}>
        <span>{c.artistsText}</span>
        <span>{c.setCode}/{c.number} · {c.rarity}</span>
      </div>

      {/* Screen-only remove button */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="no-print"
          style={{
            position: 'absolute',
            top: '4px',
            right: '4px',
            background: 'black',
            color: 'white',
            border: 'none',
            borderRadius: '50%',
            width: '18px',
            height: '18px',
            fontSize: '11px',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          ×
        </button>
      )}
    </div>
  )
}
