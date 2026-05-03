# Pazaak Bot

Pazaak Bot hosts the server's pazaak table. Its job is simple: keep matches readable, move fake
credits around cleanly, and stay out of the way of the game itself.

The bot is designed to keep games fast and visible in-channel while keeping private hand
information off the public board.

## Persona

Pazaak Bot keeps responses short, readable, and table-focused. It does not slow the game down with
excessive dialogue.

Key voice notes:
- Clear and table-focused.
- Lightly playful without leaning on character roleplay.
- Credits transactions are framed as quick table updates.
- Does not repeat the same line twice in a row if avoidable.

## Game Rules

Pazaak is from KOTOR. These are the canonical KOTOR-flavored house rules in use on this server.

### Match Structure

- First player to **win 3 sets** wins the match and collects the wager.
- A **tie** (both players stand on the same total in the same set) plays another set with
  the same remaining side hands — unless exactly one player has played a Tiebreaker card, in which
  case that player wins the set.
- If **5 sets tie in a row**, the match is force-resolved by current set record to prevent an
  infinite loop.
- The loser of a set goes first in the next set. On a tie, the original coin-flip opener resumes.
  First set opener is random.

### Sets

Within each set:
- Players aim to get their board total as close to **20** as possible.
- Going over 20 on a draw opens one side-card recovery window. The player only busts if the turn
  resolves while they are still over 20, or if their one side card still leaves them over 20.
- Filling all **9 board slots** without busting wins the set automatically.

### Decks

| Deck | Contents |
|---|---|
| Main deck | Four copies of cards 1 through 10 (40 cards total) |
| Sideboard | Each player receives one exact canonical TSL side deck at match start, currently sampled from rows `10` (`VeryEasy`) through `14` (`VeryHard`) |
| Hand | 4 cards drawn from the sideboard once at match start; spent cards stay spent across sets and ties |

Private Activity lobbies can override the sideboard policy at table creation:
- `Runtime random`: default per-seat runtime random sideboards.
- `Each player active custom`: each human ready seat must have an active saved custom sideboard.
- `Host mirrored custom`: both ready seats use the host's active saved custom sideboard.

### Game modes

Player-facing copy for cards, strategy, deck limits, and bust probability is centralized in **`PAZAAK_RULEBOOK`** (`packages/pazaak-engine/src/rules.ts`).

- **Canonical** — Matchmaking, ranked tables, and wagered Discord challenges stay on TSL-verified cards only. Custom decks containing Wacky-only tokens fail validation.
- **Wacky** — Adds `%3`–`%6` (mod previous), `/2` (halve previous), and `00` (hard reset). Private casual lobbies (Discord `/pazaak lobby action:create mode:wacky` or Activity lobby UI with Ranked off) pass `gameMode: "wacky"` into `createDirectMatch`.

Side cards include the TSL-confirmed subset plus optional Wacky specials:

| Type | Variants | Behavior |
|---|---|---|
| Plus (`+1`…`+6`) | Fixed positive | Always adds the stated value |
| Minus (`-1`…`-6`) | Fixed negative | Always subtracts the stated value |
| Flip (`±1`…`±6`) | Toggleable | Player chooses + or − at play time |
| Value Change (`VV` / `1±2` / `±1/2`) | Special | Player chooses `+1`, `+2`, `-1`, or `-2` at play time |
| Copy (`D` / `$$`) | Special | Copies the resolved value of the previous board card; cannot be played onto an empty board |
| Tiebreaker (`±1T` / `TT`) | Special | Player chooses `+1` or `-1`; wins tied sets |
| Flip 2&4 (`F1`) | Special | Occupies a board slot with value `0`, then flips the sign of all main-deck, plus, and minus 2s and 4s on the board |
| Flip 3&6 (`F2`) | Special | Occupies a board slot with value `0`, then flips the sign of positive 3s and 6s already on the board |
| Mod previous (`%3`…`%6`) | Wacky | Replaces the previous board card with Python-style non-negative remainder modulo N |
| Halve previous (`/2`) | Wacky | Replaces the previous board card with `trunc(prev / 2)` (toward zero) |
| Hard reset (`00`) | Wacky | Places `0`, forces an immediate set tie, advances consecutive-tie counter |

### Turn Flow

1. Player draws a card from the main deck (mandatory — must draw before standing).
2. If the draw puts the total over 20, the player may still play one side card to recover before ending the turn.
3. The player may optionally play one side card, then stand or end the turn.
4. Playing a side card does not end the turn — the player still chooses to stand or end turn afterward.
5. Side cards can be played only once per match; one card maximum per turn.
6. If a side card puts or leaves the total over 20, the player busts immediately.

### Nine-Card Auto-Win

If a player fills all 9 board slots without busting, they win the set automatically.

## Commands

### `/pazaak challenge`

Issue a pazaak challenge to another server member.

**Options:**
| Option | Required | Description |
|---|---|---|
| `opponent` | yes | The user to challenge |
| `wager` | yes | Credits to put on the table (1–5000) |
| `deck` | no | Optional runtime TSL difficulty preset for your own sideboard: `Very Easy` (`10`) through `Very Hard` (`14`) |
| `use_custom` | no | Use your saved custom 10-card sideboard instead of a runtime TSL preset |
| `custom_name` | no | Optional saved custom sideboard name to use for this challenge |

Posts a public challenge embed with **Accept** and **Decline** buttons. Both players must have
enough credits to cover the wager or the challenge is rejected. If `deck` is supplied, the
challenge uses that exact canonical sideboard for the challenger. If `use_custom` is set, the
challenge uses the challenger's active saved custom 10-card sideboard instead. If `custom_name` is
set, the challenge uses that specific saved custom sideboard for the challenger without changing
which saved sideboard is globally active. If the opponent was not already seeded with a deck, their
Accept flow opens a private deck picker so they can choose a canonical runtime deck id, use their
saved preset shortcut, choose from their saved custom sideboards, or leave it on Auto before the
match starts. When they have a large saved custom-sideboard library, the custom-board portion of the
picker is paged so Discord's 25-option select-menu cap does not truncate entries. The public
challenge row and the private Accept deck picker both now include an **Open Activity Lobby** link so
players can jump straight into the Activity quick-switcher or full workshop before locking their
board choice.

---

### `/pazaak sideboard`

Shows, saves, activates, or clears your saved custom 10-card sideboards.

**Options:**
| Option | Required | Description |
|---|---|---|
| `cards` | no | Ten side-card tokens separated by spaces or commas, such as `+1 -2 *3 $$ TT F1 F2 VV +4 -5` |
| `name` | no | Optional sideboard name to save, activate, or clear |
| `clear` | no | Clear the active saved custom sideboard, or the named one if `name` is supplied |

Saved custom sideboards use the same token legend shown by `/pazaak decks`: `+/-` for fixed cards,
`*` for flip cards, `$$` or `D` for copy previous, `TT` for the tiebreaker, `F1` / `2&4` and
`F2` / `3&6` for board flips, and `VV` / `1±2` for the selectable `+1/+2/-1/-2` card. Regular fixed
or flip tokens can appear up to four times each; gold/special tokens can appear once each. Users can now keep multiple named custom
sideboards, and one of them is always active when at least one exists. The active saved custom
sideboard is the one used from `/pazaak challenge use_custom:true` and from the challenged-player
Accept picker. Running `/pazaak sideboard` with no options opens an ephemeral management screen with
an active-sideboard selector plus **Card Editor**, **Find Board**, **Build/Edit Sideboard**, and
**Clear Sideboard** controls; the builder still uses a modal with slots `1-5` and `6-10`. The
per-slot editor now pages three slots at a time so it can also expose slot-focus buttons,
left/right reorder controls, and a compact validation summary without exceeding Discord's component
row limits. When a user has a large saved-sideboard library, both the management selector and the
challenged-player Accept picker can now page through saved custom sideboards and open a name search
modal instead of truncating at Discord's 25-option select-menu cap.

Multiplayer flows enforce those duplicate limits in the match engine (public challenges, accept overrides, and private-lobby match start), so invalid sideboard compositions are rejected even if a client bypasses UI checks.

The browser Activity workshop extends that with local name filtering, explicit rename, duplication,
drag/drop slot reordering, and save-and-activate flows that are better suited to larger board
libraries than Discord components. The Activity lobby and live match board now also expose a quick
sideboard switcher so players can change which saved board is active for future challenges or
rematches without detouring through the full workshop. The Discord-side sideboard management screen
now includes its own **Open Activity Lobby** link too, so the heavier Activity editor is one click
away from the ephemeral slash-command panel.

---

### `/pazaak rules`

Paginated rulebook embed backed by `PAZAAK_RULEBOOK`.

**Options:**
| Option | Required | Description |
|---|---|---|
| `section` | no | Jump to `Basics`, `Cards`, `Strategy`, `Game Modes`, or `Tournaments` |

A select menu on the message switches sections without re-running the command.

---

### `/pazaak card`

**Options:**
| Option | Required | Description |
|---|---|---|
| `token` | yes | Side-deck token to describe (`+2`, `*4`, `$$`, `%5`, `/2`, …) |

Ephemeral response with rarity, copy limit, mechanic, coaching note, and TSL notes when present.

---

### `/pazaak strategy`

**Options:**
| Option | Required | Description |
|---|---|---|
| `total` | no | Highlight this board total (0–20) on the bust probability chart |

Ephemeral primer with doctrine excerpts and the uniform-shoe bust table used by the advisor UI.

---

### `/pazaak tournament`

Bracket lifecycle commands (`create`, `join`, `leave`, `list`, `start`, `bracket`, `standings`, `report`, `cancel`). Matches auto-schedule through `PazaakCoordinator`; settlement feeds `advanceTournament`. Admin overrides: `/pazaak-admin tournament force-report|reseed`.

---

### `/pazaak lobby`

Cross-platform lobby helper (`list`, `create`, `join`, `ready`, `leave`, `add_ai`, `start`). **`mode`** on `create` chooses `canonical` (default) or `wacky` (casual experimental cards, ranked off).

---

### `/pazaak decks`

Lists the player-facing runtime TSL match decks: `Very Easy` (`10`), `Easy` (`11`), `Average` (`12`),
`Hard` (`13`), and `Very Hard` (`14`). Use this when you want to know what Auto can roll in
normal public play or which preset to pick in `/pazaak challenge`.

Recovered testing/admin rows (`0`-`9`) are intentionally not shown here; those remain an admin-only
seeding surface through `/pazaak-admin challenge`.

The embed also includes a token legend for special cards such as `$$`, `TT`, `F1`, `F2`, and `VV`.

---

### `/pazaak spectate`

Posts a read-only mirror of the live board in the current channel.

**Options:**
| Option | Required | Description |
|---|---|---|
| `player` | no | Optional player whose active match should be mirrored |

If there is exactly one active match in the current channel, the command can infer it automatically.
If multiple matches are active in the same channel, `player` is required so the bot knows which
board to mirror. The spectator message refreshes with the live match state and includes a browser
watch link, but it does not expose any private controls or hidden hand information. Mirror message
tracking is persisted with the active match snapshot, so live spectator posts survive bot restarts
while that match remains active on disk. Each spectator post also includes a **Close Mirror** button
that only the user who created that mirror can use. If you run `/pazaak spectate` again for the
same active match, the bot refreshes your existing mirror instead of creating a duplicate.

---

### `/pazaak preset`

Shows, saves, or clears your default runtime TSL deck preset.

**Options:**
| Option | Required | Description |
|---|---|---|
| `difficulty` | no | Optional runtime TSL preset to save as your default (`Very Easy` through `Very Hard`) |
| `clear` | no | Clear your saved default preset instead of saving one |

If you save a preset here, normal `/pazaak challenge` automatically uses it whenever you omit the
`deck` option, and the challenged-player Accept picker also offers it as a shortcut when you are on
the receiving side of a normal public challenge. This is a saved runtime preset and remains
separate from `/pazaak sideboard`.

---

### `/pazaak wallet`

Shows your current credit balance, win/loss record, active streak, best streak, and top rivalry.
Includes a note about when your daily bonus next becomes available. If you have a saved runtime TSL
preset or a saved custom sideboard, the wallet embed also shows them.

---

### `/pazaak daily`

Claims your daily bonus credits. Default bonus is **200 credits** every 24 hours. If the cooldown
has not elapsed, the bot tells you how many hours remain.

Configurable via `PAZAAK_DAILY_BONUS` (credit amount) and `PAZAAK_DAILY_COOLDOWN_MS`
(cooldown in milliseconds, default 86400000 = 24 hours).

---

### `/pazaak leaderboard`

Shows the top 10 players sorted by credit balance.

---

### `/pazaak-admin challenge`

Admin-only command to seed a public pazaak challenge between two players.

**Options:**
| Option | Required | Description |
|---|---|---|
| `challenger` | yes | The player issuing the challenge |
| `opponent` | yes | The player who must accept it |
| `wager` | yes | Credits on the table (1–5000) |
| `challenger_deck` | no | Optional canonical TSL deck id for the challenger |
| `opponent_deck` | no | Optional canonical TSL deck id for the opponent |

If deck ids are provided, the challenge embed shows the seeded decks and the accepted match uses those exact canonical sideboards. This admin path can still seed the non-public recovered testing rows (`0`-`9`) when needed.

## Match Flow (Discord UX)

```
Player A: /pazaak challenge opponent:@Player-B wager:500
```

→ Public embed with Accept / Decline buttons.

```
Player B clicks Accept.
```

→ If Player B was not already seeded with a deck, they get a **private ephemeral deck picker** first with the runtime TSL preset ladder from Very Easy through Very Hard plus saved-preset and active-saved-custom-sideboard shortcuts when available.
→ After the deck is chosen (or left on Auto), the public board embed updates with the match state (totals, sets won, side cards remaining).
→ Each player receives a **private ephemeral control panel** with their hand, board state, and
  action buttons.

During the match, players use their private panel to:
- **Draw** — draw the next card from the main deck.
- **Stand** — end your turn without drawing.
- **Play side card** — after a draw, play one of your remaining side cards.
- **End Turn** — bank the current total without playing a side card.

The **Forfeit** button appears on the public board. Either player can forfeit to immediately award
the win to their opponent.

When the match ends, credits are transferred and a **Rematch** button replaces the action buttons
on the public board. Either participant can click Rematch to issue a fresh challenge at the same
wager, preserving the same fixed sideboards from the completed match whether they came from
canonical deck ids or saved custom sideboards, and refreshing participant names from current guild
display names when available.

Observers can also issue `/pazaak spectate` to spawn additional read-only board mirrors in-channel.

Inside the browser Activity, players also get a **Sideboard Workshop** button in the live board
header plus a lighter quick-switch strip under the status area. The quick switcher updates which
saved board is active for future challenges, Accept flows, and rematches, while the current live
match keeps the deck that was already seeded when the match began. Both the private Discord
controls panel and the live Activity board now also surface a **PazaakWorld Advisor** hint that
recommends the current best draw, stand, end-turn, or side-card line using the shared
`@openkotor/pazaak-engine` heuristics. Discord private controls can now cycle that advisor between
Easy, Hard, and Professional tiers, and the Activity board exposes direct tier buttons for the same
three recommendation profiles. The current advisor pass now distinguishes exact-hit finishes,
recovery plays, pressure lines against a standing opponent, and slower setup plays instead of
scoring everything as a simple total threshold check. It now also surfaces a richer snapshot around
that recommendation: confidence, play category, estimated bust risk on the next draw, and a few
fallback alternatives when more than one line is credible. The latest engine pass also gives
special TSL cards more explicit timing logic, so D, VV, Tiebreaker, and board-flip cards are scored
and explained as distinct tactical plays instead of generic point adjustments. It also now notices
when a safe side-card play would immediately win by filling the ninth board slot, and it lightly
adjusts stand-vs-push advice based on whether you are ahead or behind in set score.

## Credit Economy

| Event | Credit change |
|---|---|
| Match win | +wager amount |
| Match loss | −wager amount (floor: 0, never negative) |
| Daily bonus | +200 (default, configurable) |
| Starting balance | 1000 (default, configurable) |

This is a **closed fake-credit economy** — credits are server-internal and have no real-money
value. There is no cashout, no external marketplace, and no convertible rate.

## Privacy Model

- The public board shows both players' totals, sets won, side cards remaining, and standing status.
- **Individual hand card values are never shown on the public board.**
- Players see their own hand only through their ephemeral private control panel (`Open Controls`
  button or re-triggered by any private action).

## Configuration

| Variable | Default | Description |
|---|---|---|
| `PAZAAK_DATA_DIR` | `data/pazaak-bot` | Directory for wallet and match JSON storage |
| `PAZAAK_STARTING_CREDITS` | `1000` | Credit balance for first-time players |
| `PAZAAK_DAILY_BONUS` | `200` | Credits awarded per daily claim |
| `PAZAAK_DAILY_COOLDOWN_MS` | `86400000` | Daily cooldown in milliseconds |
| `PAZAAK_TURN_TIMEOUT_MS` | `300000` | Turn timeout before auto-forfeit (5 minutes) |

## Current Limitations

- The sideboard editor now supports both a modal-based bulk entry builder and a paged per-slot card
  picker with select menus, slot-focus controls, move-left/move-right reordering, and a compact
  validation summary. True drag/drop ordering still is not possible inside Discord message
  components, so richer editing belongs in the browser Activity surface.
- Auto still resolves to a random supported runtime TSL deck row unless a player explicitly chooses
  a runtime preset or their saved custom sideboard.
- Reverse-engineering and recovered `pazaakdecks.2da` rows now cover the real TSL difficulty decks
  `10` through `14`, so the bot no longer invents sideboard compositions for vanilla difficulty play.
- The `VV` / `0x16` card is now implemented from binary-backed behavior: the UI path shows it as a
  numeric card, allows sign toggling, and allows switching between magnitudes `1` and `2`.
  See `docs/pazaak-reverse-engineering.md`.

## Next Phase

- Expand the shared PazaakWorld-inspired advisor beyond its current exact/recovery/setup scoring pass so it can account for deeper TSL-specific special-card timing and opponent deck inference.

## Reverse Engineering Notes

Binary-verified findings for the TSL implementation live in the companion note at
`docs/pazaak-reverse-engineering.md`.
