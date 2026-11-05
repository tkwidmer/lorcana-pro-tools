// duels.ink replay files (/r/<id>) hold the same events as gamelogs (/g/<id>), but move card
// names out of `data` into `cardRefs` (in the order of the message's {card:N} slots) and put
// instanceId at the top level of the event. This rebuilds the gamelog shape so parseGamelog
// reads both alike. The mapping was checked event by event against both files of one game.
// Not recoverable from a replay: CARD_DESTROYED's abilitySource, so a banish that no earlier
// ABILITY_TRIGGERED names goes uncredited in the banishing card's effectRemovals.
export function replayLogsToGamelog(logs) {
  return logs.map(entry => {
    const refs = entry.cardRefs ?? []
    const d = { ...entry.data }
    if (entry.instanceId && d.instanceId == null) d.instanceId = entry.instanceId
    const fill = (nameKey, idKey, i) => {
      if (refs[i] && d[nameKey] == null) {
        d[nameKey] = refs[i].name
        d[idKey] = refs[i].id
      }
    }
    switch (entry.type) {
      case 'ABILITY_TRIGGERED':
        fill('abilitySourceCardName', 'abilitySourceCardId', 0)
        fill('targetCardName', 'targetCardId', 1)
        break
      case 'ABILITY_CONDITION_FAILED':
        fill('abilitySourceCardName', 'abilitySourceCardId', 0)
        break
      case 'DAMAGE_DEALT':
        fill('abilitySourceCardName', 'abilitySourceCardId', 1)
        break
      case 'CARD_ATTACK':
        fill('targetCardName', 'targetCardId', 1)
        // Gamelogs carry both; they matched in all 42 challenges checked across 7 gamelogs.
        if (d.defenderBaseStrength == null && d.rawDamageToAttacker != null) d.defenderBaseStrength = d.rawDamageToAttacker
        break
      case 'CARD_MOVED':
        fill('locationName', 'locationId', 1)
        break
      case 'INITIAL_HAND':
        if (refs.length) d.initialHandCards = refs
        break
      case 'MULLIGAN':
        if (refs.length) {
          d.mulliganedCards = refs.slice(0, d.mulliganCount)
          d.drawnCards = refs.slice(d.mulliganCount)
        }
        break
    }
    return { ...entry, data: d }
  })
}
