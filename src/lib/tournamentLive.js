import Pusher from 'pusher-js'

// Discovered from tcg.ravensburgerplay.com's own JS bundle — see the "Live
// updates" section of .claude/skills/ravensburger-tournament-api/SKILL.md
// for how this was found and what's confirmed vs. still unverified about
// the payload shape. Public app key, unauthenticated channel — no secret
// or session needed to listen.
const PUSHER_KEY = '09b48f339d5acd1ffeb6'
const PUSHER_CLUSTER = 'us2'

// A single shared connection, reused across subscribe calls (Pusher's own
// guidance — one connection per app, many channel subscriptions on it).
let sharedPusher = null

function getPusher() {
  if (!sharedPusher) {
    sharedPusher = new Pusher(PUSHER_KEY, { cluster: PUSHER_CLUSTER, disableStats: true })
  }
  return sharedPusher
}

// Subscribes to live updates for one tournament event's `player-event-{id}`
// channel. `onMessage` fires with the parsed payload of every "message"
// event Ravensburger's backend broadcasts on it — the payload shape isn't
// fully confirmed yet, so callers should treat it as "something changed,
// go refetch" rather than relying on specific fields. `onStatusChange`
// fires with the underlying Pusher connection state
// ('connecting' | 'connected' | 'unavailable' | 'failed' | 'disconnected').
// Returns an unsubscribe function.
export function subscribeToTournamentLive(eventId, { onMessage, onStatusChange } = {}) {
  if (!eventId) return () => {}

  const pusher = getPusher()
  const channelName = `player-event-${eventId}`
  const channel = pusher.subscribe(channelName)

  const handleMessage = (data) => onMessage?.(data)
  const handleStateChange = (states) => onStatusChange?.(states.current)

  channel.bind('message', handleMessage)
  pusher.connection.bind('state_change', handleStateChange)
  onStatusChange?.(pusher.connection.state)

  return () => {
    channel.unbind('message', handleMessage)
    pusher.connection.unbind('state_change', handleStateChange)
    pusher.unsubscribe(channelName)
    // Fully tear down the socket once nothing is listening anymore, rather
    // than leaving it open (and reconnecting on drops) for the rest of the
    // SPA session after the user navigates away from this page.
    if (pusher.channels.all().length === 0) {
      pusher.disconnect()
      sharedPusher = null
    }
  }
}
