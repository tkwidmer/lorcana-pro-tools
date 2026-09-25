# InkbornForge Tools Guide

A player's guide to every tool in Lorcana Pro Tools. It covers what each tool is for, how to use it, what it needs from you, and where it stops being useful.

Tools marked **Supporter** need an active supporter account (see [Getting started](#getting-started)). Everything else is free and most of it works without signing in.

- [Getting started](#getting-started)
- [Which tool should I use?](#which-tool-should-i-use)
- [Resources](#resources): Proxy Generator, Limited Guide, Rules
- [Deckbuilding](#deckbuilding): Deck Insights, Deck Comparison, Coconut Deck Builder
- [Coaching](#coaching): Match History, Analytics, Practice Plan, Gamelog Viewer
- [Metagame](#metagame): Winrate Matrix, Meta Synthesis, Leaderboard
- [Tournament](#tournament): Cut Calculator, Tournament Lookup, Lore Tracker, Store Lookup
- [Scouting](#scouting): Game Scraper, Scouting Library, Player Profiles
- [Content creators](#content-creators): Decklist Inspector and its OBS overlay
- [Discord bot](#discord-bot)
- [Data & privacy](#data--privacy)

---

## Getting started

**Signing in.** Use *Sign in with Google* on `/login`. You don't need an account for the free tools, but you do need one for Supporter tools and for saving duels.ink tokens.

**Becoming a Supporter.** Subscribe to the **"The Forge"** tier of the InkbornForge Metafy community, then open **Settings → Metafy → Connect Metafy**. Access is granted as soon as you connect. The community's other tier ("Supporter", for Metafy-side guides) does *not* unlock these tools. Subscriptions are rechecked every 30 minutes, so access ends shortly after a subscription lapses.

**Connecting duels.ink.** Most coaching tools read your games from [duels.ink](https://duels.ink):
1. Get an API token from your duels.ink account.
2. Go to **Settings → duels.ink API Tokens** and paste it in. You can add a label and your duels.ink username, and you can save several accounts and switch which one is active.
3. Tokens are encrypted and stored with your account, so they follow you across devices.

**Chrome extension (scouting).** The Game Scraper page has a *Download the extension* link. Unzip the download, open `chrome://extensions`, turn on **Developer mode**, click **Load unpacked**, and select the extracted folder. After that, any duels.ink game you spectate is captured automatically.

**Dark mode.** Go to **Settings → Appearance** and choose Light, Dark, or System (System is the default and follows your OS setting). Printed pages always come out light.

**The home page** (`/`) lists every tool by section, and `/sitemap` gives the same list as plain links. The **Blog** (`/blog`, linked in the top bar) has articles and announcements.

---

## Which tool should I use?

| I want to… | Start with | Then |
|---|---|---|
| Prepare for an upcoming tournament | [Practice Plan](#practice-plan) | [Meta Synthesis](#meta-synthesis), [Cut Calculator](#cut-calculator) |
| Know if a deck list is consistent | [Deck Insights](#deck-insights) | [Winrate Matrix](#winrate-matrix) for how it fares in the meta |
| Find out which cards in my deck are pulling their weight | [Analytics → Card Impact (WAR)](#analytics) | [Deck Comparison](#deck-comparison) to plan the swaps |
| See how I'm doing lately | [Match History](#match-history) | [Analytics](#analytics) trends |
| Stop making the same mistakes | [Analytics → leak report](#analytics) | [Practice Plan → Skills to drill](#practice-plan) |
| Scout an opponent | [Scouting Library → Players](#scouting-library) | [Game Scraper](#game-scraper) to capture more games |
| Understand the current meta | [Meta Synthesis](#meta-synthesis) | [Winrate Matrix](#winrate-matrix), [Leaderboard](#leaderboard) |
| Follow a live event, as a player or a caster | [Tournament Lookup](#tournament-lookup) | [Discord bot `/favorite`](#discord-bot) |
| Decide whether to take an intentional draw | [Tournament Lookup → ID analysis](#tournament-lookup) | [Cut Calculator](#cut-calculator) |
| Settle a rules question | [Rules](#rules) | |
| Playtest cards I don't own | [Proxy Generator](#proxy-generator) | |
| Move my paper deck to a new list | [Deck Comparison](#deck-comparison) | |

---

## Resources

### Proxy Generator
`/proxy` · Free

Builds printable proxy sheets (US Letter, 9 cards per page) for playtesting.

- **Search** any card by name, pick a quantity (×1–×4), and add it to the sheet. Normal cards print in a grayscale text layout that saves ink.
- **Custom card**: type in your own card (name, type, ink, cost, stats, subtypes, ability text) to test homebrew or unrevealed cards.
- **[Format Coconut] cards**: add any Coconut face, or every one at once with *Add all*. These print as full-color art.
- Print from the browser. Printing always uses the light theme.

### Limited Guide
`/limited-guide` · Free

A reference sheet for Sealed and Draft. It covers the **BREAD** pick-order framework (Bombs, Removal, Evasive, Approach, Draw), target ink curves, and how many uninkable cards to aim for in each format.

### Rules
`/rules` · Free

Chaptered versions of the official documents: Comprehensive Rules, Tournament Rules, Play Correction Guidelines, CORE Lore Guide, Community Code, Pack Rush Rules, [Format Coconut] Beta Rules, CCQ Event Term Sheet, Artist Policy, and the Diversity & Inclusion Policy.

- Pick a document, then browse it by chapter from the sidebar.
- **Version picker**: older releases are kept, so you can read the rules as they stood on a past date.
- **What changed**: each new version shows a change summary and highlights edited rules word by word (`/rules/<doc>/changes`). Read this whenever a new rules update drops.

---

## Deckbuilding

### Deck Insights
`/deck-insights` · **Supporter**

Paste a deck list to get a full consistency report. Choose whether you're on the play or the draw, and your mulligan settings, in **Settings**.

| Section | What it answers |
|---|---|
| Format Legality | Is this deck legal in **Core** and **Infinity**? Flags banned cards, and cards at risk of rotating out. |
| Ink Curve / Ink Color Balance | Where does my curve sit, and is my ink split sensible? |
| Curve Probability | What are the odds I have a play on each turn? |
| Brickability | How often do I get an uninkable hand, or dead draws? |
| Targeted Card Odds | What are the odds I see a specific card, or any card from a group, by turn N? Uses exact hypergeometric odds, plus simulation when mulligans or scry are involved. |
| Card Groups / Joint Probability | What are the odds I have card A *and* card B (for example a combo, or a Shift and its base) by turn N? |
| Mulligan Advisor | Sorts every card in the deck into **Keep**, **Flexible**, or **Toss** for opening hands, based on its role and cost. |
| Draw Effects / Scry Sources | Which cards draw or dig, and how much do they help? |
| Keyword Analysis / Shift Coverage | How dense is each keyword, and do my Shift cards have enough bases? |
| Lore Density / Quest Pressure / Win Turn | How fast does this deck realistically get to 20 lore? Answered by a 12-turn simulation. |

The *Methodology* notes on the page explain the maths. Your settings are saved in your browser, and *Copy link* shares the deck.

### Deck Comparison
`/deck-comparison` · Free

Paste **your current physical deck** and **the updated list you want to play**. You get the exact cards to remove and add, plus a total swap count, so you don't mis-register when moving from online testing to paper.

### Coconut Deck Builder
`/coconut-deck-builder` · Free

A guided builder for the [Format Coconut] multiplayer format:
1. **Choose your Coconut card** from the current set. New ones are added as they're released.
2. **Choose your inks.** You get up to three, and they must include all of the Coconut card's inks. Duo cards lock two.
3. **Build** a singleton deck of 60+ cards. You can run 4 copies of your Coconut card's base card, and Nick Wilde – Wily Fox also allows 4 Pawpsicle. The page filters and sorts the card pool and enforces the rules as you go.

Decks autosave in your browser. **Copy / Import Decklist** uses the text format that duels.ink accepts, so you can paste the list straight into duels.ink to test, or import a list copied from there.

---

## Coaching

### Match History
`/match-history` · **Supporter** · needs a duels.ink token

Your ranked duels.ink games: result, your deck and colors, opponent and their colors, lore scores, turns, and MMR change.

- **Cascading filters**: date (Today, Last 7 days, This month, Last 30 days, Custom), then queue, your colors, and opponent colors. Each filter only offers options that still exist after the ones before it.
- **By Deck** groups results per deck. You can name your decks, and names are saved in your browser.
- **Importing gamelogs** pulls the full gamelogs for the listed games into [Analytics](#analytics).

### Analytics
`/analytics` · **Supporter**

This is the main place to study your own play. You can import:
- your games from duels.ink (via Match History),
- a `.zip` game export or a raw `.logs.gz` gamelog, by dropping it on the page, or
- teammates' shared exports, for team-wide views.

Filter by queue, date range, your colors, opponent colors, MMR range, and deck. Then:

| View | What it shows |
|---|---|
| Overall | Total games, win rate going 1st vs 2nd, average turns, play time, and Bo3 matches |
| Trends | Win rate, MMR, and inkwell & turns over time |
| Matchup Matrix / Opponent Metagame | Your win rate against each opposing color pair, and what you're actually facing |
| Personal stats | Most-played and most-mulliganed cards, and how multiple copies behave in mulligans |
| **Card Impact (WAR)** | For each card, your wins above what the deck would have won without it. Includes **Kept % / Sent %**, your win rate when you kept the card versus sent it back. With a duels.ink token, cards cut in later deck versions aren't counted against them. |
| WAR Trends Over Time | How a card's impact changes month to month |
| Leak report | Places you gave away information about your hand |
| Game Detail | One game in depth: opening hand, what you sent back, draw sequence, challenges, and lore. It links to the duels.ink replay. |

**Tip:** Set *Opp Colors* and pick one deck. The Card Impact and Kept/Sent columns then become a matchup-specific card and mulligan guide.

### Practice Plan
`/practice-plan` · **Supporter**

Pre-event prep. Choose **your deck**, the **queue** (for public stats), and the **expected meta** (or accept the defaults from the public matrix). You get:

- **Matchup table**: for each opponent, your estimated win rate. It blends your own record with the public matrix, treating the public number as worth 10 games, so a 1–3 start doesn't swing it (a Bayesian shrinkage estimate). Each row also shows a 95% confidence range and a play/draw split.
- **Tournament outlook**: 20,000 simulated events, in Bo1 or Bo3, for your number of rounds. It gives your chance of going undefeated, X-1, or X-2, and your expected match win rate.
- **Practice rep allocation**: splits your practice budget by how much each matchup could move your *event* result, not just by which ones you lose most.
- **Practice ceiling**: how much your event result could improve if you practised every matchup up to a realistic best.
- **Skills to drill**: recurring leaks found in your saved gamelogs for this deck.
- **Better deck for this meta?**: expected win rate for other ink pairs you've played 20 or more games with.

Decks under a small "rogue" share of the meta are left out of the meta by default. You can add them back manually if you expect to face them.

### Gamelog Viewer
`/gamelog?id=<gamelog id>` · Free · needs a duels.ink token

A bare-bones view of one duels.ink gamelog: your opening hand, then what each player played, inked, discarded, and lost. It also has a raw data inspector. Most players will find the Game Detail view in Analytics more useful.

---

## Metagame

### Winrate Matrix
`/winrate-matrix` · Free

Public duels.ink stats for every queue: head-to-head win rates between color pairs and archetypes, play rate, and first-player advantage, by week or all-time. Click an archetype to see its matchups.

**Meta Drift** compares two saved dates for the same queue and period, showing which matchups moved and by how much. Snapshots are saved in your browser each day you visit, so drift history only starts from your first visit.

### Meta Synthesis
`/meta-synthesis` · **Supporter**

A plain-English read of the current meta, based on your own rank band by default (it uses your MMR if you've connected a token) and on the latest week. It covers:
- the most-played and best-performing archetypes, plus the weakest ones,
- how the meta differs between higher and lower ranks, and between this week and last,
- an archetype's matchup spread and its best and worst signature cards,
- *Your Deck*: how your archetype is placed.

You can switch between Core and Infinity, and between Bo1 and Bo3. There's also a share image.

### Leaderboard
`/leaderboard` · Free

The top 50 ranked duels.ink players in each queue, with links to their Twitch, X, and YouTube where known. Also shows the MMR distribution, the rank tier thresholds, and current season info.

---

## Tournament

### Cut Calculator
`/cut-calculator` · Free

Enter the number of **players**, **Swiss rounds**, and **top cut** size. Optionally add how many players already have draws, which you can read off the standings. Then step in your current wins, losses, and draws.

It estimates the points needed to make the cut as a range, from a pessimistic cut line that assumes no IDs to an optimistic one that accounts for IDs in the field. It then rates an intentional draw (ID) as *Safe to ID*, *Probably safe to ID*, or *Risky ID — field dependent*.

### Tournament Lookup
`/tournament-lookup` · **Supporter**

Paste a Ravensburger Play Hub event URL (for example `https://tcg.ravensburgerplay.com/events/528227`).

- **Standings**: live rank, record, points, and tiebreakers. Search by name to find yourself.
- **ID analysis**: *Safe to ID*, *Borderline — check tiebreakers*, or *Do not ID — you need the win*. It counts how many players below you could pass you if they win, and compares your points (after a win or an ID) with the cut line.
- **Matches**: round-by-round pairings, with the latest round expanded. Click a pairing to open **Pairing History**: both players' results from past major events in the Tournament History archive, and whether they've met before.
- **Badges**: a badge marks players who have made top cut at a Challenge or Challenge Championship, and pairings between players who have met before. Both come from the Tournament History archive.
- **Bracket**: the top-cut elimination bracket.
- **Favorites / My Team**: star players, or tag your teammates. Both lists carry across events, get their own tabs, and are shown first in large rounds. A *Tracked Player Activity* feed shows their results as they come in while the page is open.
- **Roster**: registered players before round 1.
- **Player detail**: a player's round-by-round results. You can note your opponents' colors and whether you were on the play or draw, and make a share card.

Standings refresh live when the event updates, and recent events are remembered.

### Lore Tracker
`/lore-tracker` · Free

A full-screen lore counter for your phone during paper games. Tap the left side to subtract and the right side to add, per player, from 0 to 20. Every change goes into an audit log, so you can settle "wait, what's the score?" disputes.

### Store Lookup
`/store-lookup` · Free

Paste one or more Ravensburger Play store IDs or URLs to see each store's address, contact details, seat count, and store types. It also shows the store's tier status: progress toward pro-rated Legendary in the current window (events, unique fans, tickets, and whether it ran a Hyperia City Prerelease), and its standing tier over the trailing four set seasons.

---

## Scouting

### Game Scraper
`/game-scraper` · **Supporter** · needs the Chrome extension

Open any `duels.ink/spectate/<id>` game with the extension installed, and it appears here live. You see both players' lore, ink, board, hand and deck counts, an action log, and a prediction of the cards the player is likely holding. Every captured game is saved to your Scouting Library automatically. A bookmarklet is available if you can't install the extension.

### Scouting Library
`/library` · **Supporter**

- **Saved games** (`?tab=history`): every game you've scouted or imported, as a snapshot file or pasted JSON. Stats dashboards show win rates by ink, most-played cards, and average ink by turn. Click a game to replay it at `/scouting/game/<id>`.
- **Players** (`?tab=players`): one entry per opponent, combining scouted games and your imported duels.ink gamelogs against them.

### Player Profiles
`/players/<name>` · **Supporter**

Everything known about one opponent: their record, the decks they've played (grouped by colors), an **inferred decklist** with estimated copies, and every card seen played, inked, discarded, or destroyed. For scouted decks it also shows play patterns (quests per turn, ink rate, how often they went first).

---

## Content creators

### Decklist Inspector
`/decklist-inspector` · **Supporter**

Paste a deck list to browse it by card type and cost, and see deck stat charts. Click up to 4 cards to pin their full art. This view is built for recording videos.

**Copy OBS overlay link** gives a URL (`/decklist-inspector/overlay?deck=…`) to add as an OBS *Browser Source*. It needs no sign-in, because the deck is stored in the link itself.

---

## Discord bot

Invite it from the **Community** section of the home page.

| Command | What it does |
|---|---|
| Right-click a message with a deck image → **Apps → Decode Deck QR** | Reads the deck QR code in the image and replies with a clickable duels.ink deck link |
| `/tournament url:<event> [player:<name>]` | Shows an event's standings, or one player's result |
| `/favorite url:<event> player:<name>` | Tracks a player in this channel. The bot posts an update when their rank or record changes (checked every 30 minutes) and stops when the event ends. |
| `/unfavorite player:<name>` | Stops tracking a player |
| `/favorites` | Lists the players tracked in this channel |

---

## Data & privacy

Your own game data stays in **your browser** unless the table below says otherwise. Clearing site data removes it, and it doesn't sync between devices.

| Data | Where it lives |
|---|---|
| Imported gamelogs, scouted games, Coconut decks, meta snapshots, card cache | Your browser (IndexedDB) |
| Deck names, tool settings, theme, lore tracker, tournament favorites/team/notes | Your browser (localStorage) |
| Games captured while spectating | The Chrome extension's storage, cleared after 2 hours |
| Sign-in session, supporter status | Supabase (with your account) |
| duels.ink API tokens | Supabase, **encrypted**, so they follow you across devices |
| Metafy link | Supabase: your Metafy user ID and access status only, never your Metafy login |
| Discord favorites | Supabase, per Discord channel |
| Tournament History archive | Supabase: public standings and results from major events, imported by admins |

Your email is added to the InkbornForge Substack free list when you sign in.

## Other URLs

- `/settings`: account, Appearance, Metafy, and duels.ink tokens (see [Getting started](#getting-started)).
- `/admin` and `/admin/tournament-import`: admin-only. Used to grant supporter access and to import completed major events into the Tournament History archive.
- Old links still work and redirect to their new home: `/replay-analyzer`, `/gamelog-analyzer`, `/team-analytics`, and `/game-library` go to Analytics; `/shared` goes to the Scouting Library; `/opponent-directory` goes to its Players tab; `/legality-checker` goes to Deck Insights.
