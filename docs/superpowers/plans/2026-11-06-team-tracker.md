# Team Tracker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A public team directory over the Tournament History archive, with dated memberships, manager editing, logos, dissolution, live-major discovery, and a team picker in Tournament Lookup replacing the localStorage "My Team" tag.

**Architecture:** Two new Supabase tables (`teams`, `team_members`) behind the existing `api/tournament-history.ts` dispatcher (service-role only, edge-cached public reads tagged `teams`, writes gated by a new `requireTeamEditor`). Pure logic in `api/_lib/teams.ts` (server) and `src/lib/teams.js` (client), both unit-tested. Four new pages (`/teams`, `/teams/:slug`, `/teams/:slug/manage`, `/admin/teams`), a team picker and live-majors list in `TournamentLookupPage`, team badges on `/results/players/:id`.

**Tech Stack:** React 19, React Router 7, Tailwind 4, Vercel functions (`@vercel/node`, `@vercel/functions` `dangerouslyDeleteByTag`), Supabase (service-role via `getSupabaseServiceClient`, Storage bucket `stream-logos`), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-06-team-tracker-design.md` (mockups: `docs/superpowers/specs/team-tracker-mocks/screen-*.png`)

## Global Constraints

- No new `api/*.ts` file: Vercel Hobby caps 12 functions, the count is 9; every endpoint joins `api/tournament-history.ts`'s `?endpoint=` switch.
- No `dark:` variants; palette utilities only. Use `ui/` building blocks (`Button`, `Card`, `PageHeader`, `Input`/`Select`, `Badge`, `Tabs`).
- `forge` for the one primary action or current selection; `bg-gray-900` for solid dark fills; status colors semantic.
- Page wrappers are `w-full px-6 py-8`.
- New catalog tools need an `icon` key in `src/lib/toolIcons.js` (`siteSections.test.js` enforces it).
- Service-role tables: RLS on, zero policies, header comment "Run this in the Supabase SQL editor".
- Commit messages end with the session's attribution lines; no model identifiers in any pushed artifact.
- Public team reads never return `manager_user_id` or any email.
- Lorcana has no sideboard: say "tech slots" if deck advice ever appears (it does not here).

## Review Focus

1. A membership whose `left_on` equals the event date must count for that event (a player who leaves the day of a final should still be on it). Pinned in Task 2 (`isMemberOn` boundary test).
2. Reinstating must not reopen a membership that ended before the dissolution: only rows whose `left_on` equals `disbanded_on` reopen. Lives in SQL (Task 1, `reinstate_team`); verified by hand in Task 12's preview smoke (dissolve a team with one earlier leaver, reinstate, check that leaver stays former).
3. A manager sending `slug` or `managerUserId` must get 403, not a silent drop; a manager on a disbanded team must get 409 on every write. Pinned in Task 2 (`canEditTeam` / `adminOnlyFieldsSent`) and Task 5.
4. `live-majors` must not return events whose `start_datetime` is null or in the past but still `upcoming` (stores forget to flip status). Pinned in Task 4 (`filterLiveCandidates` test).
5. A logo URL outside the `stream-logos` public path must be rejected with 400 (no hot-linking arbitrary images into a public page). Pinned in Task 2 (`isValidLogoUrl`).

---

## File map

| File | Responsibility |
|---|---|
| `supabase/migrations/031_teams.sql` | `teams`, `team_members`, `dissolve_team()`, `reinstate_team()` |
| `api/_lib/teams.ts` (+ `__tests__/teams.test.ts`) | Pure: `isMemberOn`, `groupTeamEvents`, `lastEventOf`, `canEditTeam`, `adminOnlyFieldsSent`, `isValidLogoUrl`, `SLUG_RE` |
| `api/_lib/teamsSupabase.ts` | Service-role queries for the two tables and the standings join |
| `api/_lib/tournamentDiscovery.ts` (+ test) | `filterLiveCandidates()` beside `filterRealCandidates()` |
| `api/_lib/requireAdmin.ts` | `requireTeamEditor()` |
| `api/tournament-history.ts` | New endpoints; `player` gains `teams` |
| `src/lib/tournamentHistoryApi.js` | Client functions |
| `src/lib/teams.js` (+ `__tests__/teams.test.js`) | `splitRoster`, `rosterMap`, `teamLiveSummary`, `formatMembership` |
| `src/lib/siteSections.js`, `src/lib/toolIcons.js` | Catalog entry + `users` icon |
| `src/components/TeamLogo.jsx` | Logo mark with initials fallback |
| `src/pages/TeamsPage.jsx`, `TeamPage.jsx`, `TeamManagePage.jsx`, `AdminTeamsPage.jsx` | The four pages |
| `src/pages/TournamentLookupPage.jsx`, `src/components/PlayerTags.jsx`, `src/components/EliminationBracket.jsx` | Team picker, live majors, display-only badge |
| `src/pages/ResultsPlayerPage.jsx` | Team badges |
| `src/pages/AdminPage.jsx`, `src/App.jsx` | Link and routes |
| `docs/agents/tournaments.md`, `docs/agents/api-routes.md`, `CLAUDE.md` | Docs |

---

### Task 1: Migration

**Files:**
- Create: `supabase/migrations/031_teams.sql`

**Interfaces:**
- Produces: tables `public.teams`, `public.team_members`; functions `public.dissolve_team(uuid) returns date`, `public.reinstate_team(uuid) returns integer`.

- [ ] **Step 1: Write the migration**

```sql
-- Run this in the Supabase SQL editor: https://supabase.com/dashboard/project/_/sql

-- Team Tracker (docs/superpowers/specs/2026-11-06-team-tracker-design.md):
-- a curated directory of teams and dated player memberships, joined to the
-- Tournament History archive by RPH's stable player id. Service-role only,
-- like the tournament_history_* tables: RLS on, zero policies; every read
-- and write goes through api/tournament-history.ts (api/_lib/teamsSupabase.ts).

CREATE TABLE IF NOT EXISTS public.teams (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  slug            text        NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' AND length(slug) BETWEEN 2 AND 48),
  name            text        NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
  url             text,                                              -- the team's own site or social link
  logo_url        text,                                              -- public URL in the stream-logos bucket (migration 016)
  manager_user_id uuid        REFERENCES auth.users(id) ON DELETE SET NULL,  -- may edit this team's roster
  disbanded_on    date,                                              -- set by dissolve_team(); read-only while non-null
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.team_members (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id       uuid        NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  rph_player_id text        NOT NULL,   -- the archive's join key (tournament_history_standings.rph_player_id)
  player_name   text        NOT NULL,   -- display only
  joined_on     date        NOT NULL DEFAULT current_date,
  left_on       date        CHECK (left_on IS NULL OR left_on >= joined_on),
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- One open membership per player per team; a player may rejoin after leaving.
CREATE UNIQUE INDEX IF NOT EXISTS team_members_open_idx ON public.team_members (team_id, rph_player_id) WHERE left_on IS NULL;
CREATE INDEX IF NOT EXISTS team_members_player_idx ON public.team_members (rph_player_id);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
-- Deliberately no policies: see header comment above.

-- Dissolve: stamp the team and close every open membership on the same date,
-- atomically. Returns the date used. Raises if already disbanded.
CREATE OR REPLACE FUNCTION public.dissolve_team(p_team_id uuid)
RETURNS date
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_today date := current_date;
  v_disbanded date;
BEGIN
  SELECT disbanded_on INTO v_disbanded FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team not found' USING ERRCODE = 'P0002'; END IF;
  IF v_disbanded IS NOT NULL THEN RAISE EXCEPTION 'team already disbanded' USING ERRCODE = 'P0003'; END IF;
  UPDATE public.team_members SET left_on = v_today WHERE team_id = p_team_id AND left_on IS NULL;
  UPDATE public.teams SET disbanded_on = v_today, updated_at = now() WHERE id = p_team_id;
  RETURN v_today;
END;
$$;

-- Reinstate (admins only, enforced in the API): clear the stamp and reopen
-- only the memberships the dissolution closed (left_on = disbanded_on); a
-- member who had left earlier stays former. Returns how many were reopened.
CREATE OR REPLACE FUNCTION public.reinstate_team(p_team_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_disbanded date;
  v_count integer;
BEGIN
  SELECT disbanded_on INTO v_disbanded FROM public.teams WHERE id = p_team_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'team not found' USING ERRCODE = 'P0002'; END IF;
  IF v_disbanded IS NULL THEN RAISE EXCEPTION 'team is not disbanded' USING ERRCODE = 'P0003'; END IF;
  UPDATE public.team_members SET left_on = NULL WHERE team_id = p_team_id AND left_on = v_disbanded;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  UPDATE public.teams SET disbanded_on = NULL, updated_at = now() WHERE id = p_team_id;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.dissolve_team(uuid) FROM public, anon, authenticated;
REVOKE ALL ON FUNCTION public.reinstate_team(uuid) FROM public, anon, authenticated;
```

- [ ] **Step 2: Apply it to the project** with the Supabase MCP `apply_migration` (name `teams`), then `list_tables` to confirm both tables exist. If the MCP is unavailable, stop and tell the user to run it in the SQL editor before the API tasks are tested against the live project.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/031_teams.sql
git commit -m "Teams: migration for teams, team_members, dissolve and reinstate"
```

---

### Task 2: Server pure logic `api/_lib/teams.ts`

**Files:**
- Create: `api/_lib/teams.ts`
- Test: `api/_lib/__tests__/teams.test.ts`

**Interfaces:**
- Produces:
  - `SLUG_RE: RegExp` (`/^[a-z0-9]+(-[a-z0-9]+)*$/`, length 2–48 checked separately as `isValidSlug(s)`)
  - `type MemberRow = { id: string; team_id: string; rph_player_id: string; player_name: string; joined_on: string; left_on: string | null }`
  - `type StandingJoinRow = { rph_player_id: string; player_name: string; rank: number | null; record: string | null; made_top_cut: boolean | null; made_day_two: boolean | null; inks: string[] | null; event: { id: string; rph_event_id: string; event_name: string; event_date: string | null; store_name: string | null; starting_player_count: number | null; top_cut_size: number | null; event_tier: string | null; event_url: string | null } | null }`
  - `isMemberOn(member: { joined_on: string; left_on: string | null }, date: string | null): boolean`
  - `groupTeamEvents(members: MemberRow[], rows: StandingJoinRow[]): TeamEvent[]` where `TeamEvent = { eventId, eventName, eventDate, storeName, startingPlayerCount, topCutSize, eventTier, eventUrl, results: Array<{ playerId, playerName, rank, record, madeTopCut, madeDayTwo, inks, former: boolean }> }`, newest first, results by rank (nulls last); `former` = the member's `left_on` is set.
  - `lastEventOf(events: TeamEvent[]): { eventId, eventName, eventDate, bestRank } | null`
  - `canEditTeam(user: { id: string; isAdmin: boolean }, team: { manager_user_id: string | null; disbanded_on: string | null }, action: 'write' | 'reinstate'): 'ok' | 'forbidden' | 'disbanded'`
  - `adminOnlyFieldsSent(body: Record<string, unknown>): boolean` (true if `slug` or `managerUserId` is present and not undefined)
  - `isValidLogoUrl(url: unknown, supabaseUrl: string): boolean` (must start with `${supabaseUrl}/storage/v1/object/public/stream-logos/`)

- [ ] **Step 1: Write the failing tests**

```ts
import { describe, it, expect } from 'vitest'
import {
  isMemberOn, groupTeamEvents, lastEventOf, canEditTeam, adminOnlyFieldsSent, isValidLogoUrl, isValidSlug,
} from '../teams'

const open = { joined_on: '2025-01-10', left_on: null }
const closed = { joined_on: '2025-01-10', left_on: '2026-10-30' }

describe('isMemberOn', () => {
  it('counts the join day, the leave day, and anything between', () => {
    expect(isMemberOn(open, '2025-01-10')).toBe(true)
    expect(isMemberOn(closed, '2026-10-30')).toBe(true)
    expect(isMemberOn(closed, '2026-01-01')).toBe(true)
  })
  it('excludes before joining and after leaving, and an event with no date', () => {
    expect(isMemberOn(open, '2025-01-09')).toBe(false)
    expect(isMemberOn(closed, '2026-10-31')).toBe(false)
    expect(isMemberOn(open, null)).toBe(false)
  })
})

const ev = (id: string, date: string) => ({
  id: `db-${id}`, rph_event_id: id, event_name: `Event ${id}`, event_date: date, store_name: 'S',
  starting_player_count: 100, top_cut_size: 8, event_tier: 'challenge', event_url: null,
})
const row = (pid: string, e: ReturnType<typeof ev>, rank: number | null) => ({
  rph_player_id: pid, player_name: `P${pid}`, rank, record: '5-2-0', made_top_cut: rank != null && rank <= 8,
  made_day_two: false, inks: null, event: e,
})
const members = [
  { id: 'm1', team_id: 't', rph_player_id: '1', player_name: 'P1', joined_on: '2025-01-01', left_on: null },
  { id: 'm2', team_id: 't', rph_player_id: '2', player_name: 'P2', joined_on: '2025-01-01', left_on: '2026-06-30' },
]

describe('groupTeamEvents', () => {
  it('groups by event newest first, drops a former member after leaving, keeps them before', () => {
    const early = ev('100', '2026-03-01')
    const late = ev('200', '2026-09-01')
    const events = groupTeamEvents(members, [row('2', late, 3), row('1', late, 40), row('2', early, 12), row('1', early, null)])
    expect(events.map((e) => e.eventId)).toEqual(['200', '100'])
    expect(events[0].results.map((r) => r.playerId)).toEqual(['1']) // P2 had left
    expect(events[1].results.map((r) => r.playerId)).toEqual(['2', '1']) // by rank, null last
    expect(events[1].results[0].former).toBe(true)
  })
  it('ignores rows whose event has no date', () => {
    expect(groupTeamEvents(members, [row('1', { ...ev('1', '2026-01-01'), event_date: null }, 1)])).toEqual([])
  })
})

describe('lastEventOf', () => {
  it('returns the newest event with its best rank, null when none', () => {
    const events = groupTeamEvents(members, [row('1', ev('9', '2026-09-01'), 40), row('2', ev('9', '2026-09-01'), 3)])
    expect(lastEventOf(events)).toEqual({ eventId: '9', eventName: 'Event 9', eventDate: '2026-09-01', bestRank: 40 })
    expect(lastEventOf([])).toBeNull()
  })
})

describe('canEditTeam', () => {
  const live = { manager_user_id: 'mgr', disbanded_on: null }
  const dead = { manager_user_id: 'mgr', disbanded_on: '2026-08-14' }
  it('admins and the manager may write a live team; others may not', () => {
    expect(canEditTeam({ id: 'x', isAdmin: true }, live, 'write')).toBe('ok')
    expect(canEditTeam({ id: 'mgr', isAdmin: false }, live, 'write')).toBe('ok')
    expect(canEditTeam({ id: 'other', isAdmin: false }, live, 'write')).toBe('forbidden')
  })
  it('a disbanded team refuses writes from everyone, and only an admin may reinstate', () => {
    expect(canEditTeam({ id: 'mgr', isAdmin: false }, dead, 'write')).toBe('disbanded')
    expect(canEditTeam({ id: 'x', isAdmin: true }, dead, 'write')).toBe('disbanded')
    expect(canEditTeam({ id: 'x', isAdmin: true }, dead, 'reinstate')).toBe('ok')
    expect(canEditTeam({ id: 'mgr', isAdmin: false }, dead, 'reinstate')).toBe('forbidden')
  })
})

describe('field guards', () => {
  it('flags admin-only fields when present', () => {
    expect(adminOnlyFieldsSent({ name: 'x' })).toBe(false)
    expect(adminOnlyFieldsSent({ slug: 'x' })).toBe(true)
    expect(adminOnlyFieldsSent({ managerUserId: null })).toBe(true)
  })
  it('accepts only logos under the stream-logos public path', () => {
    const base = 'https://abc.supabase.co'
    expect(isValidLogoUrl(`${base}/storage/v1/object/public/stream-logos/u/1.png`, base)).toBe(true)
    expect(isValidLogoUrl('https://evil.example/x.png', base)).toBe(false)
    expect(isValidLogoUrl(`${base}/storage/v1/object/public/other/1.png`, base)).toBe(false)
    expect(isValidLogoUrl(42, base)).toBe(false)
  })
  it('validates slugs', () => {
    expect(isValidSlug('inkborn-forge')).toBe(true)
    expect(isValidSlug('a')).toBe(false)
    expect(isValidSlug('Bad Slug')).toBe(false)
    expect(isValidSlug('-x')).toBe(false)
  })
})
```

- [ ] **Step 2: Run to verify failure**: `npx vitest run api/_lib/__tests__/teams.test.ts` → fails, module not found.

- [ ] **Step 3: Implement**

```ts
// Pure Team Tracker rules shared by api/tournament-history.ts's team
// endpoints (spec: docs/superpowers/specs/2026-11-06-team-tracker-design.md).
// Membership on a date is the one rule everything hangs on: a player counts
// for an event when joined_on <= event_date <= left_on (open-ended when
// left_on is null). Dates are ISO yyyy-mm-dd strings and compare lexically.

export const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function isValidSlug(slug: unknown): slug is string {
  return typeof slug === 'string' && slug.length >= 2 && slug.length <= 48 && SLUG_RE.test(slug)
}

export interface MemberRow {
  id: string
  team_id: string
  rph_player_id: string
  player_name: string
  joined_on: string
  left_on: string | null
}

export interface StandingJoinRow {
  rph_player_id: string
  player_name: string
  rank: number | null
  record: string | null
  made_top_cut: boolean | null
  made_day_two: boolean | null
  inks: string[] | null
  event: {
    id: string
    rph_event_id: string
    event_name: string
    event_date: string | null
    store_name: string | null
    starting_player_count: number | null
    top_cut_size: number | null
    event_tier: string | null
    event_url: string | null
  } | null
}

export interface TeamEventResult {
  playerId: string
  playerName: string
  rank: number | null
  record: string | null
  madeTopCut: boolean
  madeDayTwo: boolean
  inks: string[] | null
  former: boolean
}

export interface TeamEvent {
  eventId: string
  eventName: string
  eventDate: string
  storeName: string | null
  startingPlayerCount: number | null
  topCutSize: number | null
  eventTier: string | null
  eventUrl: string | null
  results: TeamEventResult[]
}

export function isMemberOn(member: { joined_on: string; left_on: string | null }, date: string | null): boolean {
  if (!date) return false
  return member.joined_on <= date && (member.left_on === null || member.left_on >= date)
}

const byRank = (a: TeamEventResult, b: TeamEventResult) => (a.rank ?? Infinity) - (b.rank ?? Infinity)

// Standing rows for the members' player ids, joined to their events, folded
// into one entry per event the team "played": a row counts when some
// membership of that player covers the event date (a player may have
// several memberships on the same team over time).
export function groupTeamEvents(members: MemberRow[], rows: StandingJoinRow[]): TeamEvent[] {
  const byPlayer = new Map<string, MemberRow[]>()
  for (const m of members) byPlayer.set(m.rph_player_id, [...(byPlayer.get(m.rph_player_id) ?? []), m])

  const events = new Map<string, TeamEvent>()
  for (const r of rows) {
    const e = r.event
    if (!e?.event_date) continue
    const membership = (byPlayer.get(r.rph_player_id) ?? []).find((m) => isMemberOn(m, e.event_date))
    if (!membership) continue
    let entry = events.get(e.rph_event_id)
    if (!entry) {
      entry = {
        eventId: e.rph_event_id,
        eventName: e.event_name,
        eventDate: e.event_date,
        storeName: e.store_name,
        startingPlayerCount: e.starting_player_count,
        topCutSize: e.top_cut_size,
        eventTier: e.event_tier,
        eventUrl: e.event_url,
        results: [],
      }
      events.set(e.rph_event_id, entry)
    }
    entry.results.push({
      playerId: r.rph_player_id,
      playerName: r.player_name,
      rank: r.rank,
      record: r.record,
      madeTopCut: Boolean(r.made_top_cut),
      madeDayTwo: Boolean(r.made_day_two),
      inks: r.inks,
      former: membership.left_on !== null,
    })
  }
  const out = Array.from(events.values())
  for (const e of out) e.results.sort(byRank)
  return out.sort((a, b) => (a.eventDate < b.eventDate ? 1 : a.eventDate > b.eventDate ? -1 : Number(b.eventId) - Number(a.eventId)))
}

export function lastEventOf(events: TeamEvent[]) {
  const e = events[0]
  if (!e) return null
  const ranks = e.results.map((r) => r.rank).filter((r): r is number => r != null)
  return { eventId: e.eventId, eventName: e.eventName, eventDate: e.eventDate, bestRank: ranks.length ? Math.min(...ranks) : null }
}

export type EditVerdict = 'ok' | 'forbidden' | 'disbanded'

export function canEditTeam(
  user: { id: string; isAdmin: boolean },
  team: { manager_user_id: string | null; disbanded_on: string | null },
  action: 'write' | 'reinstate'
): EditVerdict {
  if (action === 'reinstate') return user.isAdmin ? 'ok' : 'forbidden'
  if (!user.isAdmin && team.manager_user_id !== user.id) return 'forbidden'
  if (team.disbanded_on !== null) return 'disbanded'
  return 'ok'
}

export function adminOnlyFieldsSent(body: Record<string, unknown>): boolean {
  return body.slug !== undefined || body.managerUserId !== undefined
}

export function isValidLogoUrl(url: unknown, supabaseUrl: string): boolean {
  return typeof url === 'string' && url.startsWith(`${supabaseUrl}/storage/v1/object/public/stream-logos/`)
}
```

- [ ] **Step 4: Run tests** → PASS.
- [ ] **Step 5: Commit** `git add api/_lib/teams.ts api/_lib/__tests__/teams.test.ts && git commit -m "Teams: pure membership, grouping and permission rules"`

---

### Task 3: Service-role queries `api/_lib/teamsSupabase.ts`

**Files:**
- Create: `api/_lib/teamsSupabase.ts`

**Interfaces:**
- Consumes: `getSupabaseServiceClient` from `./discordSupabase.js`; `MemberRow`, `StandingJoinRow` from `./teams.js`.
- Produces (all `async`, all throw on Supabase error):
  - `TEAM_PUBLIC_COLUMNS = 'id, slug, name, url, logo_url, disbanded_on'`; `TEAM_ADMIN_COLUMNS = TEAM_PUBLIC_COLUMNS + ', manager_user_id, created_at'`
  - `listTeams()` → public columns, active (`disbanded_on` null) by `name`, then disbanded by `name`
  - `getTeamBySlug(slug)` → admin columns or null; `getTeamById(id)` → same
  - `listMembers(teamId)` → `MemberRow[]` by `joined_on`, then `player_name`
  - `listAllMembers()` → `MemberRow[]` for every team (the directory's `lastEvent`)
  - `getStandingsForPlayers(playerIds: string[])` → `StandingJoinRow[]` (select `rph_player_id, player_name, rank, record, made_top_cut, made_day_two, inks, event:tournament_history_events(id, rph_event_id, event_name, event_date, store_name, starting_player_count, top_cut_size, event_tier, event_url)`, `.in('rph_player_id', ids)`, paged 1,000 at a time via `.range()` like `recomputeRatings`; returns `[]` for an empty id list)
  - `upsertTeam(row: { id?: string; slug?: string; name: string; url: string | null; logo_url: string | null; manager_user_id?: string | null })` → the admin-column row (insert when `id` absent; update otherwise, only the keys present, plus `updated_at: now`)
  - `upsertMember(row: { id?: string; team_id: string; rph_player_id: string; player_name: string; joined_on: string; left_on: string | null })` → `MemberRow`
  - `deleteMember(id)` → void; `getMemberById(id)` → `MemberRow | null`
  - `dissolveTeam(teamId)` → `string` (date) via `.rpc('dissolve_team', { p_team_id })`; `reinstateTeam(teamId)` → `number` via `.rpc('reinstate_team', …)`
  - `listTeamsManagedBy(userId)` → `{ slug, name }[]` (active and disbanded)
  - `listTeamsForPlayer(playerId)` → `{ slug, name, joined_on, left_on, disbanded_on }[]` newest `joined_on` first (select from `team_members` with `team:teams(slug, name, disbanded_on)`)
  - `listTeamsWithManagerEmail()` → admin columns + `manager_email` (second query on `profiles` by `user_id in (...)`, joined in TS); `memberCounts()` → `Map<teamId, { current: number; former: number }>`
  - `findProfileByEmail(q)` → `{ user_id, email }[]` (`ilike`, limit 10) for the manager picker

- [ ] **Step 1: Implement** following `tournamentHistorySupabase.ts`'s style (one function per query, `if (error) throw error`). For the Postgres unique-violation on `team_members_open_idx`, let the error through: the handler maps `code === '23505'` to 409.

- [ ] **Step 2: Type-check**: `npx tsc --noEmit -p .` if the repo has a tsconfig covering `api/` (check `tsconfig*.json`); otherwise `npx vitest run` (imports compile under Vite's esbuild).

- [ ] **Step 3: Commit** `git add api/_lib/teamsSupabase.ts && git commit -m "Teams: service-role queries"`

---

### Task 4: Live-major discovery filter

**Files:**
- Modify: `api/_lib/tournamentDiscovery.ts` (after `filterRealCandidates`)
- Test: `api/_lib/__tests__/tournamentDiscovery.test.ts` (new)

**Interfaces:**
- Produces: `filterLiveCandidates(events: DiscoveredEvent[], now: Date, windowDays = 14): DiscoveredEvent[]` → in-progress first, then upcoming by start; `LIVE_WINDOW_DAYS = 14`.

- [ ] **Step 1: Failing test**

```ts
import { describe, it, expect } from 'vitest'
import { filterLiveCandidates } from '../tournamentDiscovery'

const now = new Date('2026-11-06T12:00:00Z')
const e = (id: number, display_status: string, start: string | null, store = 'Fanfinity') =>
  ({ id, name: `E${id}`, label: 'DLC', display_status, start_datetime: start, starting_player_count: 100, store: { id: 1, name: store } }) as any

describe('filterLiveCandidates', () => {
  it('keeps in-progress events and upcoming ones within the window, in that order', () => {
    const out = filterLiveCandidates([
      e(3, 'upcoming', '2026-11-15T10:00:00Z'),
      e(1, 'inProgress', '2026-11-06T09:00:00Z'),
      e(2, 'upcoming', '2026-11-08T10:00:00Z'),
    ], now)
    expect(out.map((x) => x.id)).toEqual([1, 2, 3])
  })
  it('drops complete, far-future, past-but-still-upcoming, undated and fake-store events', () => {
    const out = filterLiveCandidates([
      e(1, 'complete', '2026-11-01T10:00:00Z'),
      e(2, 'upcoming', '2026-12-25T10:00:00Z'),
      e(3, 'upcoming', '2026-10-01T10:00:00Z'),
      e(4, 'upcoming', null),
      e(5, 'inProgress', '2026-11-06T09:00:00Z', 'Ravensburger HQ'),
    ], now)
    expect(out).toEqual([])
  })
})
```

- [ ] **Step 2: Run** → fails (`filterLiveCandidates` not exported).

- [ ] **Step 3: Implement**

```ts
export const LIVE_WINDOW_DAYS = 14

// The live counterpart of filterRealCandidates: what a caster or team page
// wants to open now. In-progress events first, then upcoming ones that start
// within the window; an `upcoming` event whose start is already past is a
// store that never flipped the status, not a live event.
export function filterLiveCandidates(events: DiscoveredEvent[], now: Date, windowDays = LIVE_WINDOW_DAYS): DiscoveredEvent[] {
  const horizon = now.getTime() + windowDays * 86_400_000
  const live: DiscoveredEvent[] = []
  const upcoming: DiscoveredEvent[] = []
  for (const e of events) {
    if (FAKE_STORE_NAMES.has(e.store?.name ?? '') || !e.start_datetime) continue
    const t = Date.parse(e.start_datetime)
    if (e.display_status === 'inProgress') live.push(e)
    else if (e.display_status === 'upcoming' && t >= now.getTime() && t <= horizon) upcoming.push(e)
  }
  const byStart = (a: DiscoveredEvent, b: DiscoveredEvent) => Date.parse(a.start_datetime!) - Date.parse(b.start_datetime!)
  return [...live.sort(byStart), ...upcoming.sort(byStart)]
}
```

- [ ] **Step 4: Run** → PASS. **Step 5: Commit** `git commit -am "Teams: live-major discovery filter"` (add the new test file first).

---

### Task 5: `requireTeamEditor` and the endpoints

**Files:**
- Modify: `api/_lib/requireAdmin.ts` (append), `api/tournament-history.ts`

**Interfaces:**
- Consumes: Tasks 2–4.
- Produces (HTTP): `teams`, `team`, `live-majors`, `my-teams`, `admin-teams`, `admin-profile-search&q=`, POST `team-save`, `team-member-save`, `team-member-delete`, `team-dissolve`, `team-reinstate`; `player` adds `teams`.

- [ ] **Step 1: Add to `requireAdmin.ts`**

```ts
// Resolves the caller's session and admin flag without ending the response:
// the team endpoints decide between 401/403/409 themselves (api/_lib/teams.ts
// canEditTeam). Returns null after writing 401 when there is no valid session.
export async function requireUserWithTier(req: VercelRequest, res: VercelResponse): Promise<{ id: string; isAdmin: boolean } | null> {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Missing Bearer token' })
    return null
  }
  const supabase = getSupabaseServiceClient()
  const { data: userData, error } = await supabase.auth.getUser(auth.slice('Bearer '.length))
  if (error || !userData.user) {
    res.status(401).json({ error: 'Invalid session' })
    return null
  }
  const { data: profile } = await supabase.from('profiles').select('supporter_tier').eq('user_id', userData.user.id).maybeSingle()
  return { id: userData.user.id, isAdmin: profile?.supporter_tier === 'admin' }
}
```

- [ ] **Step 2: Endpoints in `tournament-history.ts`.** Add imports from `./_lib/teams.js`, `./_lib/teamsSupabase.js`, `filterLiveCandidates` from discovery, `requireUserWithTier`. Constants: `const TEAMS_CACHE_TAG = 'teams'`; `const SUPABASE_URL = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL` (check which env name `discordSupabase.ts` reads and reuse it). Handlers:

```ts
// `id` is the uuid writes address; it carries no access by itself.
function teamShape(t: any) {
  return { id: t.id, slug: t.slug, name: t.name, url: t.url ?? null, logoUrl: t.logo_url ?? null, disbandedOn: t.disbanded_on ?? null }
}
function memberShape(m: any) {
  return { id: m.id, playerId: m.rph_player_id, playerName: m.player_name, joinedOn: m.joined_on, leftOn: m.left_on }
}

async function handleTeams(_req, res) {
  try {
    const [teams, members] = await Promise.all([listTeams(), listAllMembers()])
    const ids = Array.from(new Set(members.map((m) => m.rph_player_id)))
    // ponytail: one standings query for every member of every team; page it per team if the directory passes a few thousand members
    const rows = await getStandingsForPlayers(ids)
    const out = teams.map((t) => {
      const mine = members.filter((m) => m.team_id === t.id)
      const events = groupTeamEvents(mine, rows.filter((r) => mine.some((m) => m.rph_player_id === r.rph_player_id)))
      return {
        ...teamShape(t),
        memberCount: mine.filter((m) => m.left_on === null).length,
        formerCount: mine.filter((m) => m.left_on !== null).length,
        lastEvent: lastEventOf(events),
      }
    })
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    res.setHeader('Vercel-Cache-Tag', TEAMS_CACHE_TAG)
    return res.status(200).json({ teams: out })
  } catch (err) { console.error('tournament-history teams failed:', msg(err)); return res.status(500).json({ error: 'Failed to load teams' }) }
}

async function handleTeam(req, res) {
  const slug = str(req.query.slug)
  if (!isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' })
  try {
    const team = await getTeamBySlug(slug)
    if (!team) return res.status(404).json({ error: 'Team not found' })
    const members = await listMembers(team.id)
    const rows = await getStandingsForPlayers(Array.from(new Set(members.map((m) => m.rph_player_id))))
    res.setHeader('Cache-Control', PUBLIC_CACHE)
    res.setHeader('Vercel-Cache-Tag', TEAMS_CACHE_TAG)
    return res.status(200).json({ team: teamShape(team), members: members.map(memberShape), events: groupTeamEvents(members, rows) })
  } catch (err) { … 500 'Failed to load team' }
}

async function handleLiveMajors(_req, res) {
  try {
    const live = filterLiveCandidates(await discoverCandidateEvents(), new Date())
    res.setHeader('Cache-Control', 's-maxage=300, stale-while-revalidate=3600')
    return res.status(200).json({
      events: live.map((e) => ({
        eventId: String(e.id), name: e.name, label: e.label, storeName: e.store?.name ?? null,
        startDatetime: e.start_datetime, displayStatus: e.display_status, playerCount: Math.max(e.registered_user_count ?? 0, e.starting_player_count ?? 0),
      })),
    })
  } catch (err) { … 502 'Failed to discover live events from Ravensburger Play Hub' }
}

async function handleMyTeams(req, res) {
  const user = await requireUserWithTier(req, res); if (!user) return
  try { return res.status(200).json({ admin: user.isAdmin, teams: await listTeamsManagedBy(user.id) }) } catch … 500
}

async function handleAdminTeams(req, res) {
  if (!(await requireAdmin(req, res))) return
  try {
    const [teams, counts] = await Promise.all([listTeamsWithManagerEmail(), memberCounts()])
    return res.status(200).json({ teams: teams.map((t) => ({ ...teamShape(t), id: t.id, managerUserId: t.manager_user_id, managerEmail: t.manager_email ?? null, ...(counts.get(t.id) ?? { current: 0, former: 0 }) })) })
  } catch … 500
}

async function handleAdminProfileSearch(req, res) {
  if (!(await requireAdmin(req, res))) return
  const q = str(req.query.q)?.trim()
  if (!q || q.length < 3) return res.status(200).json({ profiles: [] })
  try { return res.status(200).json({ profiles: await findProfileByEmail(q) }) } catch … 500
}

// Loads the team named by the body and applies canEditTeam; writes the
// 401/403/404/409 itself and returns null, or returns { user, team }.
async function loadEditableTeam(req, res, teamId: unknown, action: 'write' | 'reinstate') {
  const user = await requireUserWithTier(req, res); if (!user) return null
  if (typeof teamId !== 'string' || !UUID_RE.test(teamId)) { res.status(400).json({ error: 'Invalid team id' }); return null }
  const team = await getTeamById(teamId)
  if (!team) { res.status(404).json({ error: 'Team not found' }); return null }
  const verdict = canEditTeam(user, team, action)
  if (verdict === 'forbidden') { res.status(403).json({ error: 'Only this team\'s manager or an admin can do that' }); return null }
  if (verdict === 'disbanded') { res.status(409).json({ error: 'Team is disbanded' }); return null }
  return { user, team }
}

async function handleTeamSave(req, res) {
  const body = req.body ?? {}
  const { id, slug, name, url, logoUrl, managerUserId } = body
  if (typeof name !== 'string' || name.trim().length < 1 || name.length > 80) return res.status(400).json({ error: 'Name must be 1–80 characters' })
  if (url != null && url !== '' && !/^https?:\/\//.test(url)) return res.status(400).json({ error: 'Link must start with http' })
  if (logoUrl != null && logoUrl !== '' && !isValidLogoUrl(logoUrl, SUPABASE_URL)) return res.status(400).json({ error: 'Logo must be an uploaded file' })
  const patch = { name: name.trim(), url: url || null, logo_url: logoUrl || null }
  try {
    if (!id) {
      if (!(await requireAdmin(req, res))) return
      if (!isValidSlug(slug)) return res.status(400).json({ error: 'Slug must be 2–48 lowercase letters, digits and hyphens' })
      const row = await upsertTeam({ ...patch, slug, manager_user_id: managerUserId ?? null })
      await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
      return res.status(200).json({ team: { ...teamShape(row), id: row.id } })
    }
    const ctx = await loadEditableTeam(req, res, id, 'write'); if (!ctx) return
    if (!ctx.user.isAdmin && adminOnlyFieldsSent(body)) return res.status(403).json({ error: 'Only an admin can change the slug or manager' })
    if (slug !== undefined && !isValidSlug(slug)) return res.status(400).json({ error: 'Invalid slug' })
    if (managerUserId !== undefined && managerUserId !== null && !UUID_RE.test(managerUserId)) return res.status(400).json({ error: 'Invalid manager' })
    const row = await upsertTeam({ id, ...patch, ...(slug !== undefined && { slug }), ...(managerUserId !== undefined && { manager_user_id: managerUserId }) })
    await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ team: { ...teamShape(row), id: row.id } })
  } catch (err) {
    if ((err as any)?.code === '23505') return res.status(409).json({ error: 'That slug is taken' })
    … 500 'Failed to save team'
  }
}

async function handleTeamMemberSave(req, res) {
  const { id, teamId, playerId, playerName, joinedOn, leftOn } = req.body ?? {}
  if (typeof playerId !== 'string' || !ID_RE.test(playerId)) return res.status(400).json({ error: 'Invalid playerId' })
  if (typeof playerName !== 'string' || !playerName.trim()) return res.status(400).json({ error: 'playerName required' })
  if (!DATE_RE.test(joinedOn)) return res.status(400).json({ error: 'joinedOn must be yyyy-mm-dd' })
  if (leftOn != null && leftOn !== '' && !DATE_RE.test(leftOn)) return res.status(400).json({ error: 'leftOn must be yyyy-mm-dd' })
  if (leftOn && leftOn < joinedOn) return res.status(400).json({ error: 'leftOn is before joinedOn' })
  const ctx = await loadEditableTeam(req, res, teamId, 'write'); if (!ctx) return
  try {
    if (id) { const existing = await getMemberById(id); if (!existing || existing.team_id !== teamId) return res.status(404).json({ error: 'Member not found' }) }
    const row = await upsertMember({ ...(id && { id }), team_id: teamId, rph_player_id: playerId, player_name: playerName.trim(), joined_on: joinedOn, left_on: leftOn || null })
    await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ member: memberShape(row) })
  } catch (err) {
    if ((err as any)?.code === '23505') return res.status(409).json({ error: 'Already on this team' })
    … 500 'Failed to save member'
  }
}

async function handleTeamMemberDelete(req, res) {
  const { id } = req.body ?? {}
  if (typeof id !== 'string' || !UUID_RE.test(id)) return res.status(400).json({ error: 'Invalid id' })
  try {
    const existing = await getMemberById(id); if (!existing) return res.status(404).json({ error: 'Member not found' })
    const ctx = await loadEditableTeam(req, res, existing.team_id, 'write'); if (!ctx) return
    await deleteMember(id); await dangerouslyDeleteByTag(TEAMS_CACHE_TAG)
    return res.status(200).json({ ok: true })
  } catch … 500
}

async function handleTeamDissolve(req, res) {
  const ctx = await loadEditableTeam(req, res, req.body?.id, 'write'); if (!ctx) return
  try { const date = await dissolveTeam(ctx.team.id); await dangerouslyDeleteByTag(TEAMS_CACHE_TAG); return res.status(200).json({ disbandedOn: date }) } catch … 500
}

async function handleTeamReinstate(req, res) {
  const ctx = await loadEditableTeam(req, res, req.body?.id, 'reinstate'); if (!ctx) return
  if (!ctx.team.disbanded_on) return res.status(409).json({ error: 'Team is not disbanded' })
  try { const reopened = await reinstateTeam(ctx.team.id); await dangerouslyDeleteByTag(TEAMS_CACHE_TAG); return res.status(200).json({ reopened }) } catch … 500
}
```

Where `UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, `DATE_RE = /^\d{4}-\d{2}-\d{2}$/`, `msg(err)` the existing `err instanceof Error ? err.message : err` idiom. Write the real `catch` blocks in full (the `…` above is plan shorthand, not code to paste).

In `handlePlayer`, add `listTeamsForPlayer(playerId)` to the `Promise.all` and return `teams: teams.map((t) => ({ slug: t.team.slug, name: t.team.name, joinedOn: t.joined_on, leftOn: t.left_on, disbandedOn: t.team.disbanded_on }))`.

Dispatcher: the POST set becomes `['import', 'recompute-ratings', 'ink-pairs', 'team-save', 'team-member-save', 'team-member-delete', 'team-dissolve', 'team-reinstate']`; GET cases add `teams`, `team`, `live-majors`, `my-teams`, `admin-teams`, `admin-profile-search`. Update the route's header comment (auth per endpoint).

- [ ] **Step 3: Smoke test against the deployed preview later (Task 12)**; for now `npm test` and `npm run lint` pass.
- [ ] **Step 4: Commit** `git commit -am "Teams: API endpoints and team-editor auth"`

---

### Task 6: Client API and `src/lib/teams.js`

**Files:**
- Modify: `src/lib/tournamentHistoryApi.js`
- Create: `src/lib/teams.js`, `src/lib/__tests__/teams.test.js`

**Interfaces:**
- Produces (client API): `fetchTeams()`, `fetchTeam(slug)`, `fetchLiveMajors()`, `fetchMyTeams()`, `fetchAdminTeams()`, `searchProfiles(q)`, `saveTeam(body)`, `saveTeamMember(body)`, `deleteTeamMember(id)`, `dissolveTeam(id)`, `reinstateTeam(id)`; POSTs via `apiFetch(query, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })`.
- Produces (`teams.js`):
  - `splitRoster(members)` → `{ current, former }` (current by `joinedOn`; former by `leftOn` desc)
  - `rosterMap(members)` → `{ [playerId]: { name } }` for `leftOn === null` members
  - `teamLiveSummary(entries, topCutSize)` → `{ wins, draws, losses, bestRank, worstRank, inCut } | null` (the reduce currently inline in `TournamentLookupPage`, with `parseRecord` moved in beside it; `parseRecord` stays exported from wherever it lives today, check with grep)
  - `formatMembership(m)` → `"Jan 2025 – Oct 2026"` or `"Since Jan 2025"` using `new Date(yyyy-mm-dd + 'T00:00:00')` and `toLocaleDateString('en-US', { month: 'short', year: 'numeric' })`
  - `teamInitials(name)` → up to 2 uppercase initials from the first letters of the first two words

- [ ] **Step 1: Failing tests** covering: `splitRoster` ordering, `rosterMap` excludes former, `teamLiveSummary` on two entries with records `"3-0-1"`/`"2-2-0"` and ranks 3/40, topCutSize 32 → `{ wins: 5, draws: 1, losses: 2, bestRank: 3, worstRank: 40, inCut: 1 }`, null for empty, `formatMembership` both branches, `teamInitials('Inkborn Forge') === 'IF'`, `teamInitials('Gloomstone') === 'G'`.
- [ ] **Step 2: Run** → fail. **Step 3: Implement.** **Step 4: Run** → pass.
- [ ] **Step 5: Commit** `git add src/lib/teams.js src/lib/__tests__/teams.test.js src/lib/tournamentHistoryApi.js && git commit -m "Teams: client API and pure roster helpers"`

---

### Task 7: `TeamLogo`, catalog entry, routes, `/teams` directory

**Files:**
- Create: `src/components/TeamLogo.jsx`, `src/pages/TeamsPage.jsx`
- Modify: `src/lib/toolIcons.js` (add `users`), `src/lib/siteSections.js` (Tournament Tools, after Player Ratings), `src/App.jsx` (imports + routes `/teams`, `/teams/:slug`, `/teams/:slug/manage`, `/admin/teams`; the latter three pages are created in Tasks 8 and 10, so add their routes in those tasks)

- [ ] **Step 1: `TeamLogo`**

```jsx
import { teamInitials } from '../lib/teams'

// A team's logo, or an initials mark when it has none. `size` is the Tailwind
// box class; `muted` for disbanded teams.
export function TeamLogo({ name, logoUrl, size = 'h-8 w-8', muted = false, className = '' }) {
  const box = `${size} shrink-0 grid place-items-center rounded overflow-hidden ${className}`
  if (logoUrl) return <img src={logoUrl} alt="" className={`${box} object-contain bg-white border border-gray-200`} />
  return (
    <span className={`${box} font-display text-xs tracking-wide ${muted ? 'bg-gray-200 text-gray-500' : 'bg-gray-900 text-white'}`} aria-hidden="true">
      {teamInitials(name)}
    </span>
  )
}
```

- [ ] **Step 2: Icon and catalog.** `users: ['M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2', 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8z', 'M22 21v-2a4 4 0 0 0-3-3.9', 'M16 3.1a4 4 0 0 1 0 7.8']`. Catalog entry: `{ path: '/teams', name: 'Team Tracker', icon: 'users', description: "Every team's current roster and how it finished at the majors in the Tournament History archive, with the live events its players are in now." }`. Run `npx vitest run src/lib/__tests__/siteSections.test.js` → pass.

- [ ] **Step 3: `TeamsPage`** (mock screen 1): `PageHeader` title "Team Tracker"; loads `fetchTeams()`; `ArchiveLoading`/`ArchiveError`; a `Card` with the table (columns Team with `TeamLogo` + `Link to=/teams/:slug`, Members, Last major (`Link to=/results/events/:id`), Date (`formatEventDate`), Best finish (`ordinal`)), then, if any `disbandedOn`, a muted "Former teams" table with `Badge tone="neutral"` "Disbanded <Mon YYYY>" and "0 · N former". Footnote: "Teams are curated by the site. Missing yours, or a roster out of date? Tell us on Discord." (link the same Discord URL the Footer uses; grep `discord.gg` in `src/components/Footer.jsx`).

- [ ] **Step 4: Routes.** `<Route path="/teams" element={<TeamsPage />} />` beside the results routes. Dev server check: `npm run dev`, open `/teams` (the API needs Vercel; locally the fetch 404s, so the error state renders. That is expected; the real check is in Task 12 against the preview with real data, and in Task 11 with mocked fetches for screenshots).

- [ ] **Step 5: Lint + test + commit** `git commit -m "Teams: directory page, catalog entry and logo mark"`

---

### Task 8: `/teams/:slug` team page

**Files:**
- Create: `src/pages/TeamPage.jsx`
- Modify: `src/App.jsx` (route `/teams/:slug`)

**Interfaces:**
- Consumes: `fetchTeam(slug)`, `fetchLiveMajors()`, `fetchMyTeams()` (only when `useSupporter().user` is set), `fetchAllRegistrations(eventId)` from `src/lib/tournamentApi.js` (returns registrations with `r.user.id`), `splitRoster`, `formatMembership`, `TeamLogo`, `formatEventDate`, `ordinal`, `InkIcons`, `Badge`, `StatCard`.

- [ ] **Step 1: Build the page** (mock screens 2 and 8):
  - Header: `TeamLogo size="h-16 w-16"`, `PageHeader` title = name, description "N current members · M former · <link>", actions: `Badge` "Playing now · <event>" when a live event has ≥1 registered member, `Button to="/teams/:slug/manage"` "Manage roster" when `myTeams.admin || myTeams.teams.some(t => t.slug === slug)`. Disbanded: `Badge tone="neutral"` "Disbanded <date>", muted title.
  - Stat tiles (`StatCard`): current members, archived majors played (`events.length`), top cuts (count of results with `madeTopCut`), best finish (min rank across events, with event name).
  - **Live and upcoming majors** `Card` (hidden when disbanded or when `fetchLiveMajors` fails or returns none): rows per event: status pill (green "Live" dot for `inProgress`, amber "In N days"/"Mon D" for upcoming), `label` badge, name, store · players, registered count `"{n} of {current.length} registered"` computed by `fetchAllRegistrations(eventId)` per event in parallel after load (state `registered: { [eventId]: number | 'loading' | 'error' }`), and a `Button` to `/tournament-lookup?event=<id>&tab=team&team=<slug>` ("View team live →" primary when n > 0, else quiet "Open in Tournament Lookup →"). Footnote text from the mock.
  - **Roster** `Card`: current members table (name → `/results/players/:id`, "Since Mon YYYY"); a `<details>` "Former members (N)" with `formatMembership`. Disbanded: one "Former members" table.
  - **Results**: one `Card` per event (first 5, "Show all" button reveals the rest): heading link to `/results/events/:id`, meta line, `Badge` "Best Nth", table Rank · Player (→ player page; `Badge tone="neutral"` "Former" when `former`) · Record · `InkIcons` · Top cut / Day 2 badge. Empty: "No archived events with a member on the team yet."
- [ ] **Step 2: Route** `<Route path="/teams/:slug" element={<TeamPage />} />`.
- [ ] **Step 3: Lint, commit** `git commit -m "Teams: team page with roster, results and live majors"`

---

### Task 9: Tournament Lookup: team picker, live majors, display-only badge

**Files:**
- Modify: `src/pages/TournamentLookupPage.jsx`, `src/components/PlayerTags.jsx`, `src/components/EliminationBracket.jsx`

- [ ] **Step 1: `PlayerTags.jsx`**: `TeamBadge` becomes `({ className = '' })` rendering a non-interactive `<span title="Team member" className="w-5 h-5 rounded-sm text-[10px] font-bold leading-none flex items-center justify-center bg-forge text-on-forge ...">T</span>`. Update the file header comment.
- [ ] **Step 2: `EliminationBracket.jsx`**: drop the `toggleTeam` prop everywhere; render `<TeamBadge />` only when `p1OnTeam` / `p2OnTeam`.
- [ ] **Step 3: `TournamentLookupPage.jsx`**:
  - Delete `TEAM_KEY`, `getTeam`, `toggleTeamStorage`, `toggleTeam`, the `toggleTeam` props on `RosterTable`, `MatchesTab`, `EliminationBracket`, and every `<TeamBadge active onToggle>`; render `{onTeam && <TeamBadge />}` in its place (Standings row, `RosterTable`, Matches rows).
  - New state: `const [teams, setTeams] = useState([])` loaded once with `fetchTeams()` (active only: `filter(t => !t.disbandedOn)`); `const [teamSlug, setTeamSlug] = useState(() => searchParams.get('team'))`; `const [teamMembers, setTeamMembers] = useState([])` loaded with `fetchTeam(teamSlug)` whenever `teamSlug` changes (clear when null); `const team = useMemo(() => rosterMap(teamMembers), [teamMembers])` keeps the `{ [id]: { name } }` shape every consumer already reads.
  - URL sync: add `if (teamSlug) next.set('team', teamSlug); else next.delete('team')` to the existing sync effect (deps add `teamSlug`). `initialParams` gains `team`.
  - `teamSummary` → `teamLiveSummary(teamEntries, structure?.topCutSize)`; delete the inline reduce (and `parseRecord` if it moved into `teams.js`).
  - Tab label "Team" (`MATCH_FILTER_OPTIONS` entry label "Team" too). Team tab body: a `Select` (`value={teamSlug ?? ''}`, first option "Pick a team…", one per team) with "Team page →" link and "N of M members in this event"; when no team: empty panel "Pick a team to see its players in this event's standings and pairings." When a team: the tiles and `RosterTable` as today with `emptyMessage="None of this team's current members are in this event."`.
  - Roster-mode copy: replace "favorite or team-tag players" with "favorite players".
  - Landing: below the form, a two-column block: left "Live and upcoming majors" from `fetchLiveMajors()` (loaded once on mount; hidden on error or empty; rows as in mock screen 3; click → `loadStandings('https://tcg.ravensburgerplay.com/events/' + eventId)`), right the existing Recents. Keep Recents' current markup.
- [ ] **Step 4: Lint, `npm test`, commit** `git commit -m "Tournament Lookup: directory team picker and live majors replace the My Team tag"`

---

### Task 10: Manage page, admin teams page, admin link

**Files:**
- Create: `src/pages/TeamManagePage.jsx`, `src/pages/AdminTeamsPage.jsx`
- Modify: `src/pages/AdminPage.jsx` (a "Teams" `Card` with `Button to="/admin/teams"` "Manage teams"), `src/App.jsx` (routes `/teams/:slug/manage`, `/admin/teams`)

**Interfaces:**
- Consumes: `fetchTeam`, `fetchMyTeams`, `fetchAdminTeams`, `searchProfiles`, `saveTeam`, `saveTeamMember`, `deleteTeamMember`, `dissolveTeam`, `reinstateTeam`, `searchTournamentPlayers`, `uploadLogo` from `src/lib/streamTables.js`, `useSupporter`.

- [ ] **Step 1: `TeamManagePage`** (mock screens 7 and 8 bottom):
  - Gate: `useSupporter()`; while loading show `ArchiveLoading`; if no user → `navigate('/login')`; load `fetchMyTeams()` and `fetchTeam(slug)`; `canEdit = my.admin || my.teams.some(t => t.slug === slug)`; otherwise render the message "Only this team's manager or an admin can edit the roster." with a link back. The team's `id` for writes comes from `fetchTeam` (`teamShape` includes `id`).
  - Logo block: `TeamLogo size="h-16 w-16"`, hidden `<input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif">`, Replace / Remove buttons; on choose: `uploadLogo(file)` then `saveTeam({ id, name, url, logoUrl })`; Remove saves `logoUrl: null`. Errors shown inline.
  - Name + Link inputs, Save → `saveTeam({ id, name, url, logoUrl })`. Meta line: "Slug `<slug>` · Manager: you | <none> · set by an admin".
  - Add member: `Input` with debounced `searchTournamentPlayers(q)` dropdown (copy `PlayerSearch` from `ResultsPage.jsx` and pick instead of navigating), `Input type="date"` joined (default today `new Date().toISOString().slice(0,10)`), Add → `saveTeamMember({ teamId, playerId, playerName, joinedOn, leftOn: null })`; 409 shows "Already on this team".
  - Members table: name (→ player page) + id, `Input type="date"` joined and left per row saving on blur via `saveTeamMember({ id, teamId, playerId, playerName, joinedOn, leftOn })`, Delete (`confirm()` then `deleteTeamMember`). Former rows muted with `Badge tone="neutral"` "Former".
  - Danger zone `Card` with red-toned border classes (`border-red-200 bg-red-50`): copy from the mock, `Button variant="danger"` "Dissolve <name>…" → a confirm step asking to type the team name (an `Input` and a disabled-until-match button), then `dissolveTeam(id)`, then reload.
  - Disbanded state: notice panel at top ("This team was disbanded on <date> and is read-only…"), every control `disabled`, no danger zone; admin sees `Button variant="primary"` "Reinstate team" → `reinstateTeam(id)` → reload. A 409 from any write shows "This team is disbanded; an admin can reinstate it."
  - After every successful write, re-run `fetchTeam(slug)` (the cache tag was purged server-side).
- [ ] **Step 2: `AdminTeamsPage`** (mock screen 6): admin gate like `AdminTournamentImportPage` (`useEffect` redirect). Left `Card` "New team": Name, Slug (auto-filled from name: lowercase, non-alphanumerics → `-`, trimmed, editable), Link, `Button variant="primary"` "Create team" → `saveTeam({ name, slug, url })`. Right `Card` "Teams": table Team (link to team page, slug) · Members · Manager (email or "No manager"; "Change"/"Assign" opens an inline `Input` with debounced `searchProfiles(q)` dropdown; picking → `saveTeam({ id, name, url, logoUrl, managerUserId })`; "Remove" → `managerUserId: null`) · a "Manage roster" `Button to=/teams/:slug/manage`; disbanded rows muted with the date and `Button` "Reinstate" → `reinstateTeam`. Footnote from the mock.
- [ ] **Step 3: `AdminPage` card + routes.**
- [ ] **Step 4: Lint, commit** `git commit -m "Teams: manage page for managers and admins, admin teams page"`

---

### Task 11: Player page badges, screenshots

**Files:**
- Modify: `src/pages/ResultsPlayerPage.jsx`
- Create: `docs/screenshots/team-tracker-*.png` (via the recipe in `docs/agents/ui-screenshots.md`)

- [ ] **Step 1: Badges** under the `PageHeader` (`data.teams`): current (`leftOn === null && !disbandedOn`) as `<Link to=/teams/:slug><Badge>name</Badge></Link>`; others as `Badge tone="neutral"` "name · YYYY–YYYY" (years from `joinedOn`/`leftOn ?? disbandedOn`).
- [ ] **Step 2: Screenshots.** Follow `docs/agents/ui-screenshots.md`: local Vite server, mock `fetch` for `/api/tournament-history?endpoint=teams|team|live-majors|my-teams|player` and `/api/tournament?type=registrations` with the sample data from the mockups, capture at 1440×900, deviceScaleFactor 2: `/teams`, `/teams/inkborn-forge`, `/tournament-lookup?event=…&tab=team&team=inkborn-forge` (needs a supporter session or the doc's gating mock), `/teams/inkborn-forge/manage`, `/admin/teams`. Save under `docs/screenshots/`.
- [ ] **Step 3: Commit** `git commit -m "Teams: player page badges and screenshots"`

---

### Task 12: Docs, verification, PR

**Files:**
- Modify: `docs/agents/tournaments.md` (new "## Teams" section: tables, membership rule, roles, dissolution, endpoints, pages, logo bucket reuse, the `teams` cache tag), `docs/agents/api-routes.md` (endpoint list and auth), `CLAUDE.md` (routes table: `/teams`, `/teams/:slug`, `/teams/:slug/manage`, `/admin/teams`; Storage table Supabase row adds `teams`, `team_members`; libs table adds `teams.js`; components add `TeamLogo`; localStorage row drops nothing new but note `lorcana_tournament_team` is gone)

- [ ] **Step 1: Write the docs.**
- [ ] **Step 2: Verify**: `npm run lint`, `npm test`, `npm run build` (restore `public/lorcana-extension.zip` afterwards per CLAUDE.md). Paste the outputs into the final report.
- [ ] **Step 3: Push, open the PR** (ready for review) with the `vercel-preview-url` skill's link once the vercel[bot] comment exists, the screenshots by raw URL, and the spec/plan links; subscribe to PR activity.
- [ ] **Step 4: Smoke the preview**: create a team on `/admin/teams`, add a member who is in the archive, open `/teams/<slug>` and `/results/players/<id>`, dissolve and reinstate. Report what worked and anything that did not.
