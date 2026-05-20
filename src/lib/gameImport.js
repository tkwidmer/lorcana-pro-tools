import JSZip from 'jszip'
import { saveGamelog } from './gamelogHistory'

export async function importGamesFromZip(zipFile) {
  const zip = new JSZip()
  await zip.loadAsync(zipFile)

  const importedGames = []
  const errors = []

  for (const filename of Object.keys(zip.files)) {
    if (!filename.startsWith('games/') || !filename.endsWith('.json')) continue

    try {
      const content = await zip.files[filename].async('string')
      const gameData = JSON.parse(content)

      if (gameData.id && gameData.p1 && gameData.p2) {
        const record = await saveGamelog(gameData.id, gameData, gameData._rawLogs)
        importedGames.push(record)
      }
    } catch (e) {
      errors.push({ file: filename, error: e.message })
    }
  }

  return { importedGames, errors }
}
