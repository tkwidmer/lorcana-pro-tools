export function downloadGameIds(scoutingIds, libraryIds) {
  const data = {
    exportedAt: new Date().toISOString(),
    scoutingLibrary: scoutingIds,
    gameLibrary: libraryIds,
  }

  const json = JSON.stringify(data, null, 2)
  const blob = new Blob([json], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `game-ids-${new Date().toISOString().split('T')[0]}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
