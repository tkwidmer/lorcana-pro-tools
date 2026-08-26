---
name: tournament-history-sync
description: Run this to discover new Disney Lorcana Challenge (DLC) and Challenge Championship Qualifier (CCQ) events on the Ravensburger Play Hub and import any that aren't yet in the Tournament History archive, via /admin/tournament-import's underlying API. Use when the user asks to "sync tournament history", "pick up new DLCs/CCQs", "import events that haven't been imported yet", or similar recurring-import requests.
---

# Tournament History Sync (DLC + CCQ)

Discovers and bulk-imports Disney Lorcana Challenge (DLC) and Challenge
Championship Qualifier (CCQ) events from the Ravensburger Play Hub into this
app's Tournament History archive (`tournament_history_events`/`_standings`/
`_matches` tables, see CLAUDE.md's "Tournament History Archive" section).

The admin import page (`/admin/tournament-import`) only takes one event URL
at a time. There is no upstream "list all DLCs/CCQs" endpoint — DLCs share a
real event-configuration-template, but CCQs are independently named by each
store with no shared tag, so CCQ discovery works by a name search instead.
Both discovery mechanisms were reverse-engineered from the Play Hub's own
frontend bundle; see the "How discovery works" section below before
changing anything.

## How to run this

1. **Get an admin Supabase access token.** These expire in ~1 hour and are
   never stored long-term, so this has to be re-obtained per run:
   - Ask the user to sign into `https://lorcana-pro-tools.vercel.app` as
     their admin account, open DevTools → Application → Local Storage,
     find the key shaped like `sb-<project-ref>-auth-token`, and copy the
     `access_token` field out of the JSON value.
   - If the user doesn't have one handy, ask them for it directly — don't
     guess or reuse a token from an earlier session (it will have expired).
2. **Run the script:**
   ```bash
   python3 .claude/skills/tournament-history-sync/scripts/sync_import.py --token "$TOKEN"
   ```
   Write the token to a scratchpad file first rather than putting it
   directly on the command line (shell history / process list exposure) —
   same pattern as the manual bulk-import session this skill was built
   from. Never print the full token in chat or logs.
3. **Report the summary** the script prints at the end: how many newly
   imported, how many skipped as already-cached, how many hit "no
   standings yet" (added to the dead list), how many transient errors
   (worth a manual retry).
4. Delete the scratchpad token file when done.

Useful flags:
- `--dry-run` — discover and diff against the caches without calling the
  import endpoint or needing a token. Good for "how many new events are
  there" without committing to a real import run.
- `--force` — re-import events already in `imported_cache.json` (useful if
  you suspect standings changed after a later round completed, though the
  script only considers `display_status: complete` events as candidates in
  the first place, so this is rarely needed).
- `--force-dead` — retry events already in `dead_cache.json`, in case a
  store retroactively entered results into the Play Hub after previously
  leaving the event empty.

## State files (committed alongside this skill)

- `scripts/imported_cache.json` — every event ID successfully imported
  before, with name/date/standings/matches counts. Skipped on repeat runs
  (completed events don't change) unless `--force`.
- `scripts/dead_cache.json` — event IDs confirmed to have **zero rounds
  ever recorded** on the Play Hub, even though the store flagged the event
  `complete`. These are permanently un-importable unless the store goes
  back and retroactively enters results — see "Why some events can never
  be imported" below. Skipped unless `--force-dead`.

Both are safe to commit — they're just a growing list of RPH event IDs and
names, no secrets. Keeping them in the repo means the skill gets faster
over time as the "already handled" set grows, and a re-run after weeks away
only touches genuinely new events.

## How discovery works

Both use `GET https://api.ravensburgerplay.com/api/v2/events/` (the
`RAVEN_BASE` host — see the `ravensburger-tournament-api` skill), which is
the same public endpoint `api/tournament.ts` proxies for the `event`/
`registrations`/`standings` types, but hit directly here since this is an
offline discovery script rather than a browser-facing feature.

- **DLC**: filter by `event_configuration_template_id=a1b77361-c19e-4942-8741-f6b96bb24a80`
  (the "Disney Lorcana Challenge" template — confirmed via
  `GET /api/v2/event-configuration-templates/?game_slug=disney-lorcana`,
  which lists the 9 official templates for this game). This is a real,
  intentional tag the Play Hub applies to every DLC weekend's parent event.
- **CCQ**: filter by `name=CCQ`. This param is a **contains-match**, not an
  exact match, despite the plain name suggesting otherwise (confirmed
  empirically — `name=CCQ` returns "CCQ - PlayInk Lorcana - Annecy",
  "Lorcana Cardiff CCQ", etc., not just events literally named "CCQ").
  There's no template for CCQs; they're independently run by third-party
  organizers under whatever name they like, so this text search is the
  only signal available. **This means the discovery is only as good as the
  word "CCQ" appearing in an event's name** — a CCQ that a store named
  something else entirely (no "CCQ" substring) will not be found this way.
  If the user reports a known CCQ missing from the archive, check its name
  first before assuming a script bug.
- Other params that look like they should work but don't (silently
  ignored, not filtered): `ordering`/`sort`/`order_by` (no-op — the
  response is unsorted by anything you pass), `event_type` (no-op — always
  returns the full unfiltered set), `registered_user_count__gte`/
  `capacity__gte`/`starting_player_count__gte` (no-op). Don't assume a new
  filter param works without testing it the way `is_headlining_event=true`
  and `event_configuration_template_id`/`name` were confirmed to.
- Only events with `display_status == "complete"` are considered import
  candidates — an event still `upcoming` naturally gets picked up on some
  future run once it actually happens, no special handling needed.

## Why some events can never be imported

The import endpoint (`api/tournament-history.ts`'s `handleImport`) requires
a tournament phase with a round that's `COMPLETE` (or `IN_PROGRESS`) *and*
`standings_status: GENERATED`. Some small-store CCQ events are flagged
`display_status: complete` by the organizer but have **zero rounds ever
recorded** in the Play Hub's own data (`tournament_phases[].rounds` is
`[]` even though the phase itself shows `COMPLETE`) — the store ran the
event on paper or a different platform and never entered results into
Ravensburger's system. There is nothing to import for these; it's not a
bug in this script or the app's import logic. `sync_import.py` detects
this via the "no completed round with generated standings yet" error and
auto-adds the event to `dead_cache.json` so future runs don't retry it.

If a rankless "at least list of attendees" partial import is ever wanted
for these (from the event's `/registrations/` endpoint, which has no rank/
record data), that requires a real schema + `api/tournament-history.ts`
code change — nullable rank on `tournament_history_standings`, and an
import path that accepts `structure.finalRoundId === null` and falls back
to registrations. Out of scope for this discovery/import skill as it
stands; flag it to the user rather than building it ad hoc if it comes up.
