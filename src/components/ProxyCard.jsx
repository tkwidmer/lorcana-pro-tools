const LORE_PIP = '◇'

const commonCardStyle = {
  border: '2px solid black',
  borderRadius: '6pt',
  display: 'flex',
  flexDirection: 'column',
  boxSizing: 'border-box',
  padding: '0.1in',
  backgroundColor: 'white',
  overflow: 'hidden',
  fontFamily: 'Georgia, serif',
  fontSize: '7.5pt',
  lineHeight: '1.25',
  color: 'black',
}

const portraitCard = {
  ...commonCardStyle,
  width: '2.5in',
  height: '3.5in',
  breakInside: 'avoid',
  pageBreakInside: 'avoid',
}

// Location cards are landscape content rotated into a portrait slot.
// The wrapper holds the portrait layout footprint; the inner div is
// landscape-dimensioned and rotated 90° so it fills the slot exactly.
const locationWrapper = {
  width: '2.5in',
  height: '3.5in',
  position: 'relative',
  flexShrink: 0,
  breakInside: 'avoid',
  pageBreakInside: 'avoid',
}

const locationCard = {
  ...commonCardStyle,
  width: '3.5in',
  height: '2.5in',
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%) rotate(90deg)',
}

const removeButtonStyle = {
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
  if (isLocation) stats = `${c.moveCost != null ? `Move:${c.moveCost}  ` : ''}W:${c.willpower}`

  return (
    <div style={{
      borderTop: '1.5px solid black',
      borderBottom: '1.5px solid black',
      padding: '3pt 0',
      marginBottom: '4pt',
      flexShrink: 0,
      fontFamily: 'Arial, sans-serif',
    }}>
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
  // effect is italic when it looks like a parenthetical keyword explanation
  const effectIsItalic = ability.effect && ability.effect.trimStart().startsWith('(')
  return (
    <div style={{ marginBottom: '3pt' }}>
      {!first && (
        <div style={{ borderTop: '0.5pt solid #bbb', marginBottom: '3pt' }} />
      )}
      {ability.name
        ? (
          <span>
            <span style={{ fontWeight: 'bold', fontFamily: 'Arial, sans-serif' }}>
              {ability.name}{ability.effect ? ' ' : ''}
            </span>
            {ability.effect && (
              <span style={{ fontStyle: effectIsItalic ? 'italic' : 'normal' }}>{ability.effect}</span>
            )}
          </span>
        )
        : <span style={{ whiteSpace: 'pre-wrap' }}>{ability.fullText}</span>
      }
    </div>
  )
}

function EffectText({ text, first, hasAbilities }) {
  return (
    <div style={{ marginBottom: '3pt' }}>
      {(!first || hasAbilities) && (
        <div style={{ borderTop: '0.5pt solid #bbb', marginBottom: '3pt' }} />
      )}
      <span>{text}</span>
    </div>
  )
}

function CardInner({ c }) {
  const hasLore = c.lore > 0
  const hasAbilities = c.abilities?.length > 0
  const hasEffects = c.effects?.length > 0
  const hasFlavorText = !!c.flavorText

  return (
    <>
      {/* Header: cost · name */}
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

      {/* Stats bar */}
      <StatsBar card={c} />

      {/* Text body: abilities + lore pips */}
      <div style={{ flex: 1, display: 'flex', gap: '4pt', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflow: 'hidden' }}>
          {hasAbilities && c.abilities.map((ability, i) => (
            <AbilityText key={i} ability={ability} first={i === 0} />
          ))}
          {hasEffects && c.effects.map((effect, i) => (
            <EffectText key={i} text={effect} first={i === 0} hasAbilities={hasAbilities} />
          ))}
          {hasFlavorText && (
            <div style={{
              marginTop: (hasAbilities || hasEffects) ? '4pt' : 0,
              paddingTop: (hasAbilities || hasEffects) ? '3pt' : 0,
              borderTop: (hasAbilities || hasEffects) ? '0.5pt solid #bbb' : 'none',
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

      {/* Footer */}
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
    </>
  )
}

export function ProxyCard({ card: c, onRemove }) {
  if (c.type === 'Location') {
    return (
      <div style={locationWrapper}>
        <div style={locationCard}>
          <CardInner c={c} />
        </div>
        {onRemove && (
          <button onClick={onRemove} className="no-print" style={removeButtonStyle}>×</button>
        )}
      </div>
    )
  }

  return (
    <div style={portraitCard}>
      <CardInner c={c} />
      {onRemove && (
        <button onClick={onRemove} className="no-print" style={removeButtonStyle}>×</button>
      )}
    </div>
  )
}
