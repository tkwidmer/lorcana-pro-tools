# Team Tracker: a public team directory over the Tournament History archive and live Play Hub events

**Status:** approved in conversation on 2026-11-06 (admin-curated directory with one assignable team manager per team; replaces the localStorage "My Team" tag). Public on `/teams/*`; edited on `/admin/teams`; used live in Tournament Lookup.

## Player problem

Teams are how the competitive scene organises itself (Team Cavalier, Inkborn, …), but the site knows nothing about them. The archive answers "how did this player do at DLC Bangkok?" and nothing answers "how did this team do?". Tournament Lookup's "My Team" is a one-team localStorage tag, ticked player by player, which is the favorites feature under a second name. And finding the live majors to inspect means knowing the Play Hub URL already.

## What ships

1. A **team directory**: `/teams` lists every team; `/teams/:slug` shows the current roster, former members, and the team's results at every archived event a member played while on the team.
2. **Memberships with dates**: a player may belong to many teams over time. A membership has `joined_on` and an optional `left_on`; a former member stays on the team's past events and disappears from its future ones.
3. **Live and upcoming majors**: the discovery sweep behind the admin import, filtered to events that are in progress or start within 14 days, on the Tournament Lookup landing and on each team page.
4. **Team view in Tournament Lookup**: the "My Team" tab becomes "Team", a picker over the directory. Pick a team and the tab shows its current members in the live standings with the existing combined record / rank spread / in-cut summary; the Matches tab's team filter and the activity ticker use the same roster. The per-player "T" toggle and the `lorcana_tournament_team` key are removed.
5. **Editing**: an admin creates teams on `/admin/teams` and may assign each team a **manager**, any signed-in user, found by email as `/admin` finds supporters. The roster editor at `/teams/:slug/manage` is open to admins and to that team's manager: rename the team, set its link, add a member from the archive's player search, set a member's leaving date, delete a mistaken row. Only an admin can create a team, change its slug or change its manager.

Not in scope: the Discord bot's favorites, personal favorites, ratings, team logos, user-created teams (a manager edits a roster, never creates a team), aggregate team ratings.

## Data

Migration `supabase/migrations/031_teams.sql`. Service-role only, RLS on with zero policies, like the `tournament_history_*` tables.

```sql
CREATE TABLE public.teams (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug       text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 48),
  name       text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  url        text,                      -- the team's own site or social link, optional
  manager_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,  -- may edit this team's roster
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_members (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  rph_player_id text NOT NULL,          -- RPH's stable player id, the archive's join key
  player_name   text NOT NULL,          -- display only; the archive's latest name wins on screen
  joined_on     date NOT NULL DEFAULT current_date,
  left_on       date CHECK (left_on IS NULL OR left_on >= joined_on),
  created_at    timestamptz NOT NULL DEFAULT now()
);
-- One open membership per player per team; a player may rejoin after leaving.
CREATE UNIQUE INDEX team_members_open_idx ON public.team_members (team_id, rph_player_id) WHERE left_on IS NULL;
CREATE INDEX team_members_player_idx ON public.team_members (rph_player_id);
```

**Membership on a date** (`isMemberOn(member, date)`, one implementation in `api/_lib/teams.ts`, unit-tested): `joined_on <= date AND (left_on IS NULL OR left_on >= date)`. An event counts for the team when its `event_date` satisfies this for at least one member. Live events always use the current roster (`left_on IS NULL`). Concurrent membership on two teams is allowed; the database only forbids two open rows on the same team.

## API

All in `api/tournament-history.ts` (`?endpoint=`), no new function. Team reads carry `Vercel-Cache-Tag: teams` and `PUBLIC_CACHE`; every write purges that tag, so an edit is visible on the next request. The public reads never return `manager_user_id` or the manager's email.

**Who may write.** `requireTeamEditor(req, res, teamId)` in `api/_lib/requireAdmin.ts`: a valid session whose user is an admin or is `teams.manager_user_id` for that team; otherwise 403. Creating a team, changing a slug and setting `managerUserId` are admin-only: a manager who sends either field gets 403 rather than having it dropped.

| Endpoint | Auth | Returns |
|---|---|---|
| `teams` | public | `{ teams: [{ slug, name, url, memberCount, lastEvent: { eventId, eventName, eventDate, bestRank } \| null }] }`, by name |
| `team&slug=` | public | `{ team: { slug, name, url }, members: [{ id, playerId, playerName, joinedOn, leftOn }], events: [{ ...eventShape, results: [{ playerId, playerName, rank, record, madeTopCut, madeDayTwo, inks }] }] }`, events newest first, results by rank |
| `live-majors` | public, `s-maxage=300, stale-while-revalidate=3600` | `{ events: [{ eventId, name, label, storeName, startDatetime, displayStatus, playerCount }] }`: `discoverCandidateEvents()` kept where `display_status` is `inProgress`, or `upcoming` with `start_datetime` within 14 days, not a fake store; in progress first, then by start |
| `player` (existing) | public | adds `teams: [{ slug, name, joinedOn, leftOn }]` |
| `my-teams` | session | `{ admin, teams: [{ slug, name }] }`: the teams the caller manages; tells the team page and the manage page whether to offer editing |
| `team-save` (POST) | admin, or the team's manager for `name`/`url` only | `{ id?, slug?, name, url, managerUserId? }` → upsert; returns the row |
| `team-member-save` (POST) | admin or manager | `{ id?, teamId, playerId, playerName, joinedOn, leftOn }` → upsert; the unique index rejects a second open membership |
| `team-member-delete` (POST) | admin or manager | `{ id }` |
| `admin-teams` | admin | every team with `managerEmail` (joined from `profiles`), for `/admin/teams` |

`team`'s server work: load members, load `tournament_history_standings` for their player ids joined to events (one query, `.in('rph_player_id', ids)`), keep rows where `isMemberOn()` holds for that row's event date, group by event. `teams`' `lastEvent` is the newest such event per team, computed the same way over all teams in one standings query (a few hundred rows at most for the foreseeable directory; ponytail ceiling noted in code).

Supabase helpers join `api/_lib/tournamentHistorySupabase.ts`; the pure grouping and membership logic is `api/_lib/teams.ts` with `api/_lib/__tests__/teams.test.ts`.

## Client

- `src/lib/tournamentHistoryApi.js`: `fetchTeams`, `fetchTeam(slug)`, `fetchLiveMajors`, `fetchMyTeams`, `fetchAdminTeams`, `saveTeam`, `saveTeamMember`, `deleteTeamMember`.
- `src/lib/teams.js` (pure, `src/lib/__tests__/teams.test.js`): `splitRoster(members)` → `{ current, former }`; `rosterMap(members)` → `{ [playerId]: { name } }`, the shape Tournament Lookup already threads as `team`; `teamLiveSummary(entries, topCutSize)`, the combined W-L-D / rank spread / in-cut reduce moved out of `TournamentLookupPage`.

### Pages and routes

| Route | Page | Content |
|---|---|---|
| `/teams` | `TeamsPage` | Table: team, current members, last major (name, date, best finish). Catalog entry "Team Tracker" under Tournament Tools, icon `users` (new in `toolIcons.js`). Public. |
| `/teams/:slug` | `TeamPage` | Header (name, link; a "Manage roster" button when `my-teams` says the viewer may). **Live and upcoming majors** card: each event with status, player count and, for the current roster, how many are registered (client-side `fetchAllRegistrations` per event, intersected with the roster), linking to `/tournament-lookup?event=<id>&tab=team&team=<slug>`. **Roster**: current members (name → `/results/players/:id`, joined), former members collapsed with dates. **Results**: one block per archived event, newest first, members' rank / record / top-cut badge, event name → `/results/events/:id`. Public. |
| `/admin/teams` | `AdminTeamsPage` | Linked from `/admin`. Create a team (name, slug, link); the list of teams with each one's manager and a **Manager** picker (email search over `profiles`, as `/admin`'s grant form does; "Remove" clears it); "Manage roster" link per team. Enforces admin like `AdminPage`. |
| `/teams/:slug/manage` | `TeamManagePage` | For an admin or the team's manager (anyone else sees the gate message and a link back). Name and link editable; slug and manager shown read-only with "set by an admin". Add member (name search via the existing `search-players`, joined date defaults to today), `left_on` date per row (clearing it reinstates), delete row. |
| `/results/players/:id` | existing | Team badges under the name: current teams link to `/teams/:slug`; former teams muted with years. |

### Tournament Lookup changes

- Landing: a **Live and upcoming majors** list beside Recents (from `live-majors`); clicking loads the event.
- `?team=<slug>` URL param, read like `event` and `tab`. The Team tab holds a `Select` of directory teams (from `teams`); choosing writes the param. No localStorage. With a team selected, `team` (the id → name map) comes from `rosterMap(members)` of that team's current roster, so `RosterTable`, `matchInvolvesFilter`, `matchPriority`, `describeTrackedMatch` and the ticker keep their signatures.
- Removed: `TEAM_KEY`, `getTeam`, `toggleTeamStorage`, `toggleTeam`, the `TeamBadge` toggles and the `toggleTeam` prop. `TeamBadge` becomes display-only (team members still get the badge in Standings, Roster and Matches), and the empty state says "Pick a team to see its players here".

## Error handling

Team reads 404 on an unknown slug (page shows `ArchiveError`). Writes return the Supabase error message; the duplicate-open-membership case is surfaced as "already on this team". A manager who tries an admin-only field gets 403 and the manage page says "Only an admin can change that". `live-majors` is best effort: on an upstream failure it returns 502 and both surfaces hide the card, as the admin suggested list does today.

## Testing

- `api/_lib/__tests__/teams.test.ts`: `canEditTeam(user, team)` (admin, manager, other), `isMemberOn` boundaries (join day, leave day, open), event grouping drops a former member's later events and keeps earlier ones, `lastEvent` picks the newest.
- `src/lib/__tests__/teams.test.js`: `splitRoster`, `rosterMap`, `teamLiveSummary` (ported cases from the inline reduce).
- `access.test.js`'s catalog icon test covers the new entry.
- Browser check per `docs/agents/ui-screenshots.md`: `/teams`, `/teams/:slug`, the Tournament Lookup Team tab with a picked team, `/admin/teams`, `/teams/:slug/manage`; screenshots under `docs/screenshots/` for the PR.

## Docs

`docs/agents/tournaments.md` gains a "Teams" section; `CLAUDE.md` route table, Storage (Supabase row) and the `src/lib` table; `docs/agents/api-routes.md` endpoint list.
