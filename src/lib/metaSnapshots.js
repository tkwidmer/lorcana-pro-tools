import { getTx, promisify } from './db'

const STORE = 'metaSnapshots'

function todayDateStr() {
  return new Date().toISOString().slice(0, 10) // YYYY-MM-DD, UTC
}

function snapshotId(queue, period, ranks, dateStr) {
  const ranksKey = [...ranks].sort().join(',')
  return `${queue}|${period}|${ranksKey}|${dateStr}`
}

// Saves today's matchup stats for this queue/period/ranks config, if a snapshot
// for that exact config hasn't already been saved today — one snapshot per
// config per day, so repeated page visits don't pile up duplicates.
export async function saveSnapshotIfNew(queue, period, ranks, stats) {
  const dateStr = todayDateStr()
  const id = snapshotId(queue, period, ranks, dateStr)
  const store = await getTx(STORE, 'readwrite')
  const existing = await promisify(store.get(id))
  if (existing) return existing

  const record = {
    id,
    queue,
    period,
    ranks: [...ranks].sort(),
    dateStr,
    capturedAt: Date.now(),
    matchups: stats.matchups ?? [],
    colorPairs: stats.colorPairs ?? [],
    activity: stats.activity ?? null,
  }
  await promisify(store.put(record))
  return record
}

// All saved snapshots for a given queue/period/ranks config, oldest first.
export async function getSnapshotsForConfig(queue, period, ranks) {
  const ranksKey = [...ranks].sort().join(',')
  const store = await getTx(STORE, 'readonly')
  const all = await promisify(store.getAll())
  return all
    .filter(s => s.queue === queue && s.period === period && [...s.ranks].sort().join(',') === ranksKey)
    .sort((a, b) => a.dateStr.localeCompare(b.dateStr))
}

export async function deleteSnapshot(id) {
  const store = await getTx(STORE, 'readwrite')
  return promisify(store.delete(id))
}
