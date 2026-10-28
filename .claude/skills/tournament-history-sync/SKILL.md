---
name: tournament-history-sync
description: Discover new DLC, CCQ, ACQ and big-money Play Hub events and import the missing ones into the Tournament History archive. Use for "sync tournament history", "import events we haven't imported".
---

# Tournament History Sync (DLC + CCQ + ACQ + big-money events)

Discovers and bulk-imports Disney Lorcana Challenge (DLC), Challenge
Championship Qualifier (CCQ), Asia Championship Qualifier (ACQ), and
independently-run big-money events (named things like "$5K", "10k Weekend",
"$25,000 Cash Tournament") from the Ravensburger Play Hub into this app's
Tournament History archive (`tournament_history_events`/`_standings`/
`_matches` tables, see `docs/agents/tournaments.md`).

The admin import page (`/admin/tournament-import`) only takes one event URL
at a time. There is no upstream "list all DLCs/CCQs/ACQs/big events"
endpoint — DLCs are *usually* tagged by a real event-configuration-template,
but that tag isn't fully reliable (some stores mistag their DLC's parent
event — confirmed for Melbourne and Taipei), and CCQs/ACQs/big-money events
have no shared tag at all, independently named by each store. So all of
this works by name search, with the DLC template as a first-pass net and a
name-search backstop behind it. All discovery mechanisms were
reverse-engineered from the Play Hub's own frontend bundle and by
empirically probing its query params; see the "How discovery works" section
below before changing anything.

**This is inherently incomplete, and always will be.** Every category here
was found by guessing a naming convention and testing it against the live
API — CCQ, then ACQ, then DLC's mistagging, then prize-pool spellings.
There is no way to enumerate every possible naming convention a store might
use, and even a name match doesn't guarantee genuine turnout: several
well-known "big" community events (Charlie's Collectible Show's "$25,000
Weekend", Ink Inc's "$3k" opens) show only a handful of Play-Hub-tracked
registrants, because the real event ran mostly outside the platform (paper
brackets, or a separate qualifier system) — Ravensburger's own data for
those events genuinely doesn't reflect their real-world size. Treat this
skill's discovery as a floor, not a ceiling: it catches everything that
matches a known pattern, not everything that's actually major. When a user
names a specific event or organizer they know is significant, search for it
by name directly (`name=<term>`) rather than assuming this skill's existing
categories cover it — see "Investigating a user-named event or organizer"
below for the pattern to follow.

## How to run this

Discovery and import both live in the app now; there is no script.

1. Sign in as the admin and open `/admin/tournament-import`.
2. The **Suggested events** card runs discovery on load (`GET
   /api/tournament-history?endpoint=suggested-imports`, admin-only, edge-
   cached 5 minutes — "Refresh" re-runs it): every discoverable event that
   is complete, has at least one round with generated standings, isn't a
   Ravensburger test fixture, and isn't in the archive yet. The header line
   is the summary — how many events and how many players — and each row
   carries its category label (DLC, Championship, LCQ, CCQ, ACQ, PRIZE).
3. **Import all** imports them one at a time (each is its own serverless
   call); imported rows leave the list, a failed one stays with its error.
   Per-row Import still works for cherry-picking.
4. An event discovery can't match (a misspelled name, a one-off a user
   names) goes in the "Import an event" box by URL, as always.

The archive itself is the "already imported" set — there is no cache file
to keep, and nothing is ever re-imported by the suggested list. The "no
standings on the Play Hub" case is filtered out up front: the events list
response carries every round's `standings_status`, so the discovery module
applies the import's own precondition without a per-event fetch (see "Why
some events can never be imported" below).

The implementation is `api/_lib/tournamentDiscovery.ts` (the template ids,
the search terms, `discoverCandidateEvents()` and `filterRealCandidates()`)
and `handleSuggestedImports()` in `api/tournament-history.ts`. When this
skill's notes say "add a search term", that file is where.

To check discovery from a session without a browser, run the module in Node
against the live API (no token needed; it's the public events list):
`node --experimental-strip-types` with a one-off `.ts` that imports
`discoverCandidateEvents`/`filterRealCandidates` and diffs against the
archive's ids (`GET /api/tournament-history?endpoint=events`, public).

## How discovery works

All categories use `GET https://api.ravensburgerplay.com/api/v2/events/`
(the `RAVEN_BASE` host — see the `ravensburger-tournament-api` skill),
which is the same public endpoint `api/tournament.ts` proxies for the
`event`/`registrations`/`standings` types, but hit directly here since this
is an offline discovery script rather than a browser-facing feature.

- **DLC** (the DLC template pass): filter by
  `event_configuration_template_id=a1b77361-c19e-4942-8741-f6b96bb24a80`
  (the "Disney Lorcana Challenge" template — confirmed via
  `GET /api/v2/event-configuration-templates/?game_slug=disney-lorcana`,
  which lists the 9 official templates for this game) **plus** a
  `name=Disney Lorcana Challenge` contains-match search as a backstop,
  deduped by event ID. The backstop exists because the template tag isn't
  fully reliable — Melbourne (id 402587) and Taipei (id 448653) were both
  real DLC weekends with fully generated standings, but their store tagged
  the parent event `Weekly Play (Constructed)` instead of the DLC template,
  so the template-only filter missed them entirely. The name search also
  turned up a DLC the template filter alone never would have (id 456247,
  "Jeudisney Lorcana Challenge... @ Ikigai Manga Shop") — treat this
  backstop as load-bearing, not optional.
- **LCQ** (the LCQ template pass): filter by
  `event_configuration_template_id=4881658d-a6ef-4f98-9c2a-1baf9ef12b82`
  (the official "Last Chance Qualifier" template). The two LCQs at a
  Championship weekend (NACC, EUCC) draw ~500 players each and have a top
  cut, so they're pedigree in their own right. Added after the 2026-10-22
  attendance crawl found the EU Championship's two LCQs missing while the
  NA ones had only been imported by hand.
- **Side events** (the store pass): every event at a DLC / Championship
  parent's store within ±3 days of the parent with 200+ players
  (`max(registered_user_count, starting_player_count)`) and 5+ rounds run
  (`tournament_phases[].rounds` summed across phases — the list carries
  them), labeled `Side`. The round line keeps out the big short-format
  events: of the 18 side events over 200 players on 2026-10-22, the NACC
  and EUCC Double-Ups and Milwaukee's Amethyst/Amber Core Constructed ran
  under five rounds and dropped; the 10 left run 6–11 rounds.
  Owner's call (2026-10-22): the big side events — Fanfinity's 6-round and
  Double-Up events (200–500), Pastimes' Indy "Pregame Ticket Quest" (1,293),
  Milwaukee's "Infinity Spectacular" (798) — draw strong fields of players
  who aren't in the main event; the drafts, sealed and Ink Sprints under the
  line don't. One `store=<id>` fetch per parent store (Fanfinity and Pastimes
  host many weekends), `page_size=250`, matched against every parent there.
  DLC Melbourne's side events are missed because its parent is mistagged
  (see the DLC bullet) and so isn't a parent here.
- **CCQ** (`name=CCQ`): filter by `name=CCQ`. This param is a
  **contains-match**, not an exact match, despite the plain name suggesting
  otherwise (confirmed empirically — `name=CCQ` returns "CCQ - PlayInk
  Lorcana - Annecy", "Lorcana Cardiff CCQ", etc., not just events literally
  named "CCQ"). There's no template for CCQs; they're independently run by
  third-party organizers under whatever name they like, so this text search
  is the only signal available. **This means the discovery is only as good
  as the word "CCQ" appearing in an event's name** — a CCQ that a store
  named something else entirely (no "CCQ" substring) will not be found this
  way. If the user reports a known CCQ missing from the archive, check its
  name first before assuming a script bug.
- **ACQ** (the ACQ terms): filter by `name=Asia Championship Qualifier`
  and by `name=亞洲冠軍資格賽`, the same words in Chinese — Saka Saka
  Taiwan names its stop that way (id 773496, 84 players), which the English
  search never saw.
  Same shape as a CCQ — a regional qualifier series (Singapore, Philippines,
  Thailand, Malaysia, Hong Kong, ...) run by the Saka Saka store network —
  but branded "ACQ" instead of "CCQ", so the CCQ name search never caught
  it. Discovered by checking a single store's (Saka Saka Hong Kong) full
  event history and noticing the naming pattern; if another regional
  qualifier brand turns up the same way, add it here rather than assuming
  CCQ/ACQ are exhaustive.
- **Full-name CCQ** (the full-name term): filter by
  `name=Challenge Championship Qualifier` — the term spelled out in full,
  no "CCQ" abbreviation. Turned up during a real-attendance crawl (see
  "Finding major events by attendance" below) at UK Games Expo, GenCon,
  Millennium Games, and LDXP Tacoma — none of which matched the plain
  "CCQ" substring search. Labeled `CCQ` in output (same category, just a
  different discovery path).
- **Big-money events** (the prize terms): same `name=` contains-match
  trick, run once per term in `NAME_SEARCH_TERMS` (`5K`/`10K`/`15K`/`20K`/
  `25K`/`50K` and comma-formatted `5,000`/`10,000`/etc., since a store might
  spell a prize pool either way — "$25,000 Weekend" won't match "25K" and
  vice versa). Case-insensitive (`5K` also matches lowercase "5k" in event
  names — confirmed empirically). Results across all terms are deduped by
  event ID before diffing against the caches. This is inherently a
  best-effort net: it only catches events whose *name* mentions the prize
  amount — a big-money event with an unrelated name (e.g. just a store's own
  branded event name) won't surface here, only through a manual event URL
  import. If a user reports a known big event missing, extend
  `NAME_SEARCH_TERMS` with whatever spelling it uses (e.g. "1K" for smaller
  cash tournaments, or a spelled-out amount) rather than assuming the script
  is broken.
- `paginateEvents()` builds the query with `URLSearchParams`, so multi-word
  and non-ASCII terms are encoded; the upstream API accepts the encoded
  comma in `name=5%2C000` as well as a literal one.
- Other params that look like they should work but don't (silently
  ignored, not filtered): `ordering`/`sort`/`order_by` (no-op — the
  response is unsorted by anything you pass), `event_type` (no-op — always
  returns the full unfiltered set), `registered_user_count__gte`/
  `capacity__gte`/`starting_player_count__gte`/`featured=true` (no-op).
  Don't assume a new filter param works without testing it the way
  `is_headlining_event=true` and `event_configuration_template_id`/`name`
  were confirmed to. There is **no way to filter or sort by attendee count
  server-side** — if a task needs "biggest events regardless of name," the
  only option is a full crawl (see "Finding major events by attendance"
  below), not a filter param.
- Only events with `display_status == "complete"` are considered import
  candidates — an event still `upcoming` naturally gets picked up on some
  future run once it actually happens, no special handling needed.
- Precedence when an event matches more than one category (e.g. a CCQ whose
  name also contains "10K"): DLC wins over CCQ wins over ACQ wins over
  PRIZE, purely for the `[label]` shown in output — it's cosmetic, the
  import behavior is identical either way.

## Investigating a user-named event or organizer

When a user names a specific event, series, or organizer they believe is
significant (e.g. "SSG used to do release tournaments," "check out the Diet
Coke Invitational"), don't assume it falls into one of the categories
above. Search for it directly:

```
GET {RAVEN_BASE}/events/?game_slug=disney-lorcana&name=<term>&page_size=100
```

Things this has turned up in practice, worth expecting again:
- **The name search finds nothing at all.** This can mean the event predates
  Ravensburger Play Hub's launch as the exclusive platform (~June 2025 —
  see the `RPH Launch Celebration` events around that date as a landmark).
  Anything run on the old system (melee.gg) before that simply isn't in
  this database. Say so rather than concluding the search is broken.
- **The name search finds the event, but `registered_user_count` is tiny**
  (single digits) despite the event's real-world reputation as "big."
  Confirmed for Charlie's Collectible Show's "$25,000 Weekend" (8
  registered) and Ink Inc's "$3k" opens (1-5 registered) — the branding
  reflects the event's real prize pool/scale, but only a fraction of it (an
  official qualifier bracket, say) was ever tracked through the Play Hub;
  the rest ran on paper or a different system. The event is still real and
  still worth importing (whatever standings exist are genuine), but don't
  report its Play-Hub attendee count as the event's true size.
- **The name search finds a qualifier series building toward a future
  final** (e.g. "PICCS" — several small qualifiers feeding an upcoming
  "PICCS Core Cup"). Not yet importable; note the final's date and that it
  isn't run yet, same treatment as any other `display_status: upcoming`
  event.

## Finding major events by attendance (not by name)

Since there's no server-side attendee-count filter, the only way to find
genuinely major events regardless of what they're named is a full crawl of
every event via `GET {RAVEN_BASE}/events/?game_slug=disney-lorcana` (no
`name=`/template filter), paginated with `page_size=250` (the observed max
— larger values are silently capped) across all ~640 pages (~160k events
total as of this writing). This is expensive but not prohibitive: a
`ThreadPoolExecutor` with ~10 workers completed the full crawl in under 5
minutes in practice, despite an initial sequential sample suggesting it
would take an hour — don't extrapolate total runtime from the first ~100
pages, sustained throughput is much better than that early sample.

This is deliberately **not** part of the suggested-imports endpoint (too
slow/heavy for a page load) — it's an ad-hoc investigation pattern, not
a maintained script in this directory. When a user asks for something like
"find major events by real attendance, not by name," write a one-off script
following this shape:

1. Crawl every page, keeping only events with `registered_user_count` above
   whatever threshold the user wants (ask; 100 and 50 have both been used).
2. Build exclusion windows from every known DLC/Championship-template
   parent event (`store_id`, `start_datetime ± 3 days`) — a side event of a
   multi-day tournament at the same store on the same weekend should not
   be reported as its own "independent major event." **Check every
   structured-tournament template that exists**, not just the DLC one — a
   Fanfinity-run North American Championship uses a third template
   entirely (`b8c2e34b-2ff2-45b6-b725-18528c56a7cc`, "Challenge
   Championship"), separate from both the DLC template and CCQ/ACQ's
   name-only discovery. Missing this exclusion category surfaced 8 spurious
   "new major events" that were actually NACC side events on one run.
3. Filter against the archive's event ids (`?endpoint=events`) and
   `filterRealCandidates()`.
4. **Filter out Ravensburger's own internal test/QA fixtures.** A crawl at
   threshold 100 turned up "Match Report Test Tournament", "largeTest",
   "Temp User Generation Event", and "Riccardo Impact Test" — all hosted at
   obviously-fake stores ("Ravensburger HQ", "Totally Legit Card Shack")
   with 500-2000 "registered" players. Filter by store name, not just by
   attendee count.
5. **Sanity-check outliers by hand before reporting them as real.** A
   "Tuesday Early Morning Weekly Play" with 126 registered players is not
   plausible for a recurring local weekly — cross-check against the
   store's other data quality (had this store produced other suspicious
   rows before?) rather than taking the number at face value.
6. **What the 2026-10-22 crawl found, so the next one needn't re-decide
   it.** At threshold 50: 428 kept, 282 completed and not yet archived, of
   which 122 were side events of a DLC/Championship weekend (the Fanfinity
   6-round and Double-Up events at Ghent/Dortmund/NACC/EUCC, the Pastimes
   Indy "Pregame Ticket Quest" at 1,293, Milwaukee's "Infinity
   Spectacular" at 798). Of the 160 "main" rows, the real misses were the
   two EU LCQs, the Chinese-named Taiwan ACQ and the misspelled Pastimes
   CCQ (imported by URL) — all now covered above; the 200+ side events
   became the `Side` category. Everything else was local: prereleases,
   Set Championships, store cups, case tournaments and weeklies. Left out
   on purpose, as judgment calls for the owner: Saka Saka's **"Asia
   Circuit"** series (Jan 2026 main events in Thailand 86, Singapore 60,
   Philippines 53, Malaysia 48, HK 32, Taiwan 31 — the ACQ's predecessor),
   **Iconic Tour Vienna** (91; a later stop of that series was a CCQ),
   cash events below the 5K line (SCG CON Las Vegas $1K at 94, Namur "8K
   PRIZE POOL" at 99, Road To Nationals $4k at 78, several $2K–$3K
   case events), and DLC-weekend side events under 200 players (37 in the
   100–199 band, 66 in 50–99). DLC Melbourne's own side events (157 and 72 players) are
   not excluded by the weekend windows because its parent is mistagged (see
   the DLC bullet), so they show up as "main" rows every time; skip them.
7. Lowering the threshold much below ~50 stops being useful — a threshold
   of 15 returned 6,715 events, overwhelmingly ordinary Set Championships,
   prereleases, and local weeklies (the kind of event a user chasing "high
   profile" tournaments has already said not to bother with). Below ~50,
   the signal-to-noise ratio degrades fast; don't assume a lower threshold
   finds more real majors; it mostly finds more locals.

## Why some events can never be imported

The import endpoint (`api/tournament-history.ts`'s `handleImport`) requires
a tournament phase with a round that's `COMPLETE` (or `IN_PROGRESS`) *and*
`standings_status: GENERATED`. Some small-store CCQ events are flagged
`display_status: complete` by the organizer but have **zero rounds ever
recorded** in the Play Hub's own data (`tournament_phases[].rounds` is
`[]` even though the phase itself shows `COMPLETE`) — the store ran the
event on paper or a different platform and never entered results into
Ravensburger's system. There is nothing to import for these; it's not a
bug in this script or the app's import logic. `filterRealCandidates()` drops
these before they're ever shown: the events list carries each round's
`standings_status`, and an event with no round at `GENERATED` has nothing
the import endpoint could use. (Verified 2026-10-22: the filter drops
exactly the 13 events the old script had learned were dead by failing on
them.)

If a rankless "at least list of attendees" partial import is ever wanted
for these (from the event's `/registrations/` endpoint, which has no rank/
record data), that requires a real schema + `api/tournament-history.ts`
code change — nullable rank on `tournament_history_standings`, and an
import path that accepts `structure.finalRoundId === null` and falls back
to registrations. Out of scope for this discovery/import skill as it
stands; flag it to the user rather than building it ad hoc if it comes up.
