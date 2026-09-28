// Card-count difference between two decklists, each a Map of card name → count.
// Returns what to add and remove to turn `currentMap` into `newMap`, largest
// changes first. Shared by the Deck Comparison page and deck versions.
export function computeDelta(currentMap, newMap) {
  const toAdd = []
  const toRemove = []

  for (const [name, newCount] of newMap) {
    const currentCount = currentMap.get(name) || 0
    if (newCount > currentCount) {
      toAdd.push({ name, count: newCount - currentCount })
    }
  }

  for (const [name, currentCount] of currentMap) {
    const newCount = newMap.get(name) || 0
    if (currentCount > newCount) {
      toRemove.push({ name, count: currentCount - newCount })
    }
  }

  toAdd.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  toRemove.sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))

  return { toAdd, toRemove }
}
