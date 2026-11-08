# Coaching reference

## Concepts, in the terms the report uses

- **The lore race.** First to 20. For each side, lore per turn over the last two turns gives turns-to-20; whoever is fewer turns away is winning, whatever the board looks like. Every decision is judged against the race: does it shorten yours or lengthen theirs?
- **Tempo.** Ink spent on board per turn. A turn that leaves ink unspent, or spends it on cards that do not touch the board or the race, gives the opponent a free turn. Missing an ink drop before turn 6 is a tempo loss that compounds.
- **Card advantage.** Cards in hand plus bodies on board, yours against theirs. A sweep that kills three for one card is +2. A draw spell is +n only if those cards get cast before the game ends; drawing five when the opponent is two turns from 20 is zero.
- **Inking.** Ink the card you will not cast in the next two turns, and keep an inkable in hand for every future turn until you reach the deck's working ink. Uninkable cards are the usual cause of ink stalls (`metrics.txt` noInk, stall, dead).
- **Quest or challenge.** Quest by default. Challenge when it removes more of their lore-per-turn than it gives up of yours, or when it kills a card that generates value every turn (a Support body, a draw engine), or when the challenger would die to their removal anyway. A challenger that dies without killing was almost always a quest.
- **Ward, Evasive, Resist, Bodyguard.** Ward cannot be chosen by effects; a Warded body is the threat single-target removal cannot answer. Evasive can only be challenged by Evasive. Resist reduces damage taken. Bodyguard must be challenged first. Characters cannot quest or challenge the turn they are played unless they have Rush.
- **Shift lines.** A cheap body on turn 1 that a later copy shifts onto is a tempo plan; if the body dies before the shift turn, the plan slips 2 turns. Protecting the shift target is part of the plan.
- **Songs.** A character of cost at least the song's cost can exert to sing it for free: a sweep song sung off a body is the sweep plus a body on the same ink.
- **Lorcana has no sideboard.** Matchup answers are main-deck tech slots, ideally inkable so they are never dead elsewhere.

## Mistake taxonomy, with how each looks in `narratives.txt`

Line format: `T<n> ME|OPP ink=<pool> hand[k]=[...] action | action`. `ink X` inked X (`(undone)` = taken back with the free undo, not counted), `play X(cost)`, `shift X(cost) onto Y`, `sing X off Y` (a song sung by exerting Y, no ink spent), `Q X+n=total` quest, `support X->Y +n` (X's Support added to Y's strength this turn; Y can be an opposing character, which is how a 3-strength body ends up in range of a "banish 5 strength or more" effect), `CHAL A->B (str+bonus vs str)` challenge, `Xme:`/`Xopp:` a character banished, `act` an activated ability, `bounce` returned to deck, `dmg`, `[Card: effect]` a triggered ability, `+ink(deck)` a card put into the inkwell by an effect. The hand shown is the hand at the start of that turn.

**Deckbuilding** (from `versions.txt` and `metrics.txt`)
- Uninkable count of the current list against the stall figures. Stalls of 3+ turns with `dead` of 2+ point at the uninkables, not at luck.
- A flex card whose record trails the deck's by 10+ points over 20+ games.
- Versions with fewer than 5 games: churn. Say which change the data supports and which it does not.
- The `killedBy` column: which opposing card keeps answering the player's bodies, and whether the list has anything for it. When a conditional banish (5+ strength) keeps hitting a smaller body, look for a `support ->` line on the opponent's turn just before it.
- The `gift` column in `metrics.txt`: wins the opponent handed over. Subtract them for the earned record.
- Blank early turns across many games: a curve hole, visible as `T2 ME ... ink X` with no `play`.

**Mulligan** (the `mulligan:` line)
- Kept a 7+ cost card or an uninkable 5+ without the enabler that casts it early.
- Kept two copies of any 5+ cost card.
- Sent the engine (the draw body, the shift target, the cheap removal) while keeping filler.
- On the draw, kept no 1-2 drop.

**Inking** (`ink X` against the hand on that line)
- Inked a sweeper, engine or the only copy of a matchup card while holding an inkable spare.
- A turn with no `ink` while an inkable card sat in hand (a missed drop).
- Inked the shift target or the body the item needs, with the payoff in hand.

**Play**
- Blank turn: ink available, castable cards in hand, no `play`.
- Floating ink: play costs well under the pool with castables in hand.
- A 5+ strength body played into a known banish effect without doing anything the turn it landed.
- Draw spell cast while behind in the race by more than a turn.
- Overextension into a known board wipe once the opponent reaches its ink cost.
- An item played without the ink to activate it the same turn, into a deck that answers items.
- A Warded or Evasive body that spent a turn not questing.

**Challenges**
- `CHAL A->B` followed by `Xme:A` and no `Xopp:B`: attacker died for nothing.
- Trading a body whose value is an end-of-turn trigger or a quest for 2+.
- Challenging while ahead in the race when questing would have ended it sooner.
- Leaving an exerted Support body or draw engine alive when a cheap challenge killed it.

## Report contract

Write these sections in this order. Each finding carries date, turn, and the replay link from the narrative header. Patterns need 3+ games and state the count; anything with fewer is listed as a one-off.

1. **Record.** Raw W-L; earned W-L after removing non-games (concession before turn 5, disconnect) and wins the opponent gave away (conceded while ahead, stalled on ink); the split going first and second. One line on sample size.
2. **How the matchup is decided.** One paragraph: how they win, how you win, from the metrics and the narratives.
3. **Patterns to change.** 3 to 6. For each: the behavior, the count over N games, two or three citations, and the replacement habit stated as a rule the player can apply at the table.
4. **One-off mistakes.** A list, one line each, date and turn.
5. **The list.** Keep, cut, add. Every cut and add names the games behind it. Give the uninkable count and the stall numbers next to it. Call matchup cards tech slots.
6. **Post-game checklist.** Five to seven yes/no questions built from sections 3 and 5.
