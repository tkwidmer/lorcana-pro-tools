const SNAPSHOT_VERSION = 1
const SNAPSHOT_MAGIC = 'lorcana-pro-tools-game-snapshot'

export function exportSnapshot(uuid, game, meta = {}) {
  return {
    magic: SNAPSHOT_MAGIC,
    version: SNAPSHOT_VERSION,
    exportedAt: Date.now(),
    uuid,
    ...meta,
    game,
  }
}

export function downloadSnapshot(uuid, game, meta = {}) {
  const data = exportSnapshot(uuid, game, meta)
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  const turn = game?.currentTurn != null ? `-t${game.currentTurn}` : ''
  const short = uuid ? `-${uuid.slice(0, 8)}` : ''
  a.href = url
  a.download = `lorcana-game${short}${turn}.json`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function parseSnapshot(text) {
  let data
  try {
    data = JSON.parse(text)
  } catch (e) {
    throw new Error(`Invalid JSON: ${e.message}`, { cause: e })
  }
  // Accept anything with a recognizable game object — strict version check
  // would lock out older exports unnecessarily.
  const game = data?.game ?? data
  if (!game || typeof game !== 'object') {
    throw new Error('No game data found in file.')
  }
  if (!game.p1Name && !game.p2Name && !game.log) {
    throw new Error('File does not look like a Lorcana game snapshot.')
  }
  return {
    uuid: data.uuid ?? game.uuid ?? null,
    game,
    exportedAt: data.exportedAt ?? null,
    version: data.version ?? null,
  }
}
