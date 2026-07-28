import { resolveColors, VALID_INKS } from './inkColors'

export const MIN_DECK_SIZE = 60
export const MAX_INKS = 3

// Every card in a Coconut deck is limited to 1 copy, except:
//  - up to 4 copies of the card matching the chosen Coconut card's baseFullName
//  - up to `coconutCard.extraCopy.maxCopies` copies of an item named
//    `coconutCard.extraCopy.name` (only Nick Wilde — Wily Fox grants this, for Pawpsicle)
export function getCardLimit(card, coconutCard) {
  if (!card) return 1
  if (coconutCard && card.fullName?.toLowerCase() === coconutCard.baseFullName.toLowerCase()) {
    return 4
  }
  if (coconutCard?.extraCopy && card.name?.toLowerCase() === coconutCard.extraCopy.name.toLowerCase()) {
    return coconutCard.extraCopy.maxCopies
  }
  return 1
}

export function isCardInkLegal(card, lockedInks) {
  if (!card) return false
  const cardInks = resolveColors([card.color])
  if (cardInks.length === 0) return true
  return cardInks.every(ink => lockedInks.includes(ink))
}

// A deck's ink selection must include the Coconut card's own ink, plus up to
// two more, from the 6 canonical inks.
export function isValidInkSelection(lockedInks, coconutCard) {
  if (!Array.isArray(lockedInks) || lockedInks.length === 0 || lockedInks.length > MAX_INKS) return false
  if (coconutCard && !lockedInks.includes(coconutCard.ink)) return false
  return lockedInks.every(ink => VALID_INKS.includes(ink))
}

// entries: [{ fullName, name, qty, color, ... }]
export function validateDeck(entries, coconutCard, lockedInks) {
  const totalCount = entries.reduce((sum, e) => sum + e.qty, 0)
  const issues = []

  if (totalCount < MIN_DECK_SIZE) {
    issues.push(`Deck has ${totalCount} card${totalCount === 1 ? '' : 's'} — needs at least ${MIN_DECK_SIZE}.`)
  }

  for (const entry of entries) {
    const limit = getCardLimit(entry, coconutCard)
    if (entry.qty > limit) {
      issues.push(`${entry.fullName}: ${entry.qty} cop${entry.qty === 1 ? 'y' : 'ies'} (max ${limit}).`)
    }
    if (!isCardInkLegal(entry, lockedInks)) {
      issues.push(`${entry.fullName} isn't in your deck's ink colors.`)
    }
  }

  return { totalCount, issues, isValid: issues.length === 0 }
}
