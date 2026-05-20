import JSZip from 'jszip'

export async function createGameExportZip(games, filename = 'lorcana-games') {
  const zip = new JSZip()

  const manifest = {
    exportDate: new Date().toISOString(),
    exportedByUser: localStorage.getItem('lorcana_my_name') || 'Unknown',
    gameCount: games.length,
    games: games.map(g => ({
      id: g.id,
      p1Name: g.p1Name,
      p2Name: g.p2Name,
      winner: g.winner,
      playedAt: g.playedAt,
      turnCount: g.turnCount,
      myPlayerNum: g.myPlayerNum,
      myInkCombo: g.myInkCombo,
      oppInkCombo: g.oppInkCombo,
    })),
  }

  zip.file('manifest.json', JSON.stringify(manifest, null, 2))

  for (const game of games) {
    const gameData = {
      ...game,
      exportedAt: new Date().toISOString(),
    }
    const sanitizedId = game.id.replace(/[^a-z0-9-]/gi, '_').substring(0, 50)
    zip.file(`games/${sanitizedId}.json`, JSON.stringify(gameData, null, 2))
  }

  const blob = await zip.generateAsync({ type: 'blob' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${filename}-${new Date().toISOString().split('T')[0]}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
