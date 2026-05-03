# Pazaak — How to Play

Pazaak Bot runs the pazaak table on this server. Pazaak is a card game from Knights of the Old Republic. You play against other server members for fake credits — no real money involved.

---

## Quick Start

1. Type **`/pazaak wallet`** to see your credits. Every new player starts with **1,000 credits**.
2. Type **`/pazaak challenge`**, pick someone to play against, and set a wager.
3. Both of you play sets of cards trying to reach exactly **20** without ending the turn over 20.
4. First person to win **3 sets** wins the match and takes the wager.

---

## Canonical vs Wacky mode

- **Canonical** — Only TSL-verified cards. Used for ranked play, matchmaking queues, and wagered Discord challenges. Custom sideboards that include Wacky-only tokens (`%3`–`%6`, `/2`, `00`) are rejected.
- **Wacky** — Canonical pool **plus** experimental cards: **mod previous** (`%N`), **halve previous** (`/2`), and **hard reset** (`00`). Available in casual private lobbies and local practice when the table explicitly opts in. Ranked lobbies force Canonical regardless of UI.

Create a Wacky Discord lobby with **`/pazaak lobby action:create mode:wacky`** (ranked is implicitly off). In the Activity lobby form, pick **Mode: Wacky** when **Ranked** is unchecked.

Authoritative card text, strategy notes, bust probability tables, and rarity metadata live in **`PAZAAK_RULEBOOK`** (`packages/pazaak-engine/src/rules.ts`) — Discord embeds, the Activity rulebook panel, and this guide should not duplicate prose elsewhere.

---

## Commands

### `/pazaak challenge`

Start a game against another player.

| What to fill in | What it means |
|---|---|
| **opponent** | The person you want to play against (type `@` and pick them) |
| **wager** | How many credits to bet (minimum 1, maximum 5,000) |
| **deck** | Optional runtime TSL preset (`Very Easy` through `Very Hard`) for your own sideboard |
| **use_custom** | Use your saved custom 10-card sideboard instead of a runtime preset |
| **custom_name** | Optional saved custom sideboard name for this one challenge |

After you run this command, a message appears in the channel with **Accept**, **Decline**, and **Open Activity Lobby**. Your opponent has 5 minutes to accept before the challenge expires. Both players need enough credits to cover the wager. If you leave `deck` empty, the bot falls back to your saved runtime preset when you have one; if you set `use_custom`, it uses your active saved custom sideboard instead; if you set `custom_name`, it uses that specific saved custom sideboard just for this challenge.

### `/pazaak sideboard`

Save or review custom 10-card sideboards. You can keep multiple named sideboards and switch which one is active. The active one is what `/pazaak challenge use_custom:true` and the private Accept picker will use. If you run the command without options, the bot shows a private management screen with a sideboard selector plus four main actions. If you save a lot of sideboards, the selector pages through them instead of cutting the list off:

- **Card Editor** — A paged per-slot picker that lets you browse all available card types from dropdown menus, focus one visible slot at a time, move that slot left or right, and review a quick validation summary without remembering token syntax.
- **Sideboard Workshop** — In the browser Activity lobby or from the live Activity board header, open the workshop to manage named boards with drag/drop slot reordering, per-slot token pickers, save-and-activate controls, explicit rename, duplication, and fast name filtering outside Discord's component limits. The Activity lobby and live match board now also expose a lighter quick-switch panel so you can swap the active saved board without opening the full workshop.
- **PazaakWorld Advisor** — During practice matches, both the private Discord controls and the Activity board show a move recommendation based on the shared PazaakWorld-inspired advisor logic. It can suggest when to draw, stand, end the turn, or commit a specific side card, and you can switch between Easy, Hard, and Professional advisor tiers. The advisor is hidden for wagered head-to-head matches.
- The advisor now treats exact-hit finishes, recovery cards, standing-pressure lines, and slower setup plays as different categories, so its suggestions should feel less like a flat score threshold and more like actual match guidance.
- The advisor now also shows a richer snapshot around that recommendation: confidence, the category behind the play, estimated bust risk on the next draw, and a few fallback alternatives when another line is still reasonable.
- The latest advisor pass also treats special TSL cards more deliberately: D, VV, Tiebreaker, and the Flip 2&4 / Flip 3&6 cards now get their own tactical timing and rationale instead of being treated like ordinary point shifts.
- The advisor also now recognizes nine-card auto-win pressure and basic match score pressure, so it becomes more willing to push when you are trailing the match and more willing to protect a lead when you are already ahead in sets.
- **Find Board** — Opens a small search modal so you can filter large named-sideboard libraries by name.
- **Build/Edit Sideboard** — Opens a modal with two text areas (slots 1-5 and 6-10) for quick bulk entry using tokens like `+1`, `-2`, `*3`, `$$`, `TT`, `F1`, `F2`, and `VV`.
- **Clear Sideboard** — Removes your active sideboard, or a named sideboard if you target it from the slash command.

Custom multiplayer sideboards must contain exactly 10 cards. Regular fixed or flip cards can appear up to 4 times each; gold/special cards (`D`/`$$`, `±1T`/`TT`, `1±2`/`VV`, `2&4`/`F1`, `3&6`/`F2`) can appear once each.

These limits are enforced by the multiplayer match engine for public challenges, challenge accept overrides, and private-lobby starts, so invalid custom boards cannot slip through by bypassing UI validation.

The sideboard management screen and the challenged-player deck picker both now include an **Open Activity Lobby** link so you can jump directly into the browser-side quick switcher or full workshop while deciding which saved board should be active.

You can also manage names directly from the slash command:

- `/pazaak sideboard cards:...` saves over your current active sideboard.
- `/pazaak sideboard name:aggressive cards:...` saves that named sideboard and makes it active.
- `/pazaak sideboard name:aggressive` switches your active sideboard to `aggressive`.
- `/pazaak sideboard name:aggressive clear:true` removes that named sideboard.

### `/pazaak wallet`

Check your credits, win/loss record, current win streak, best streak, and your top rivalry. Also shows when your next daily bonus is available. Only you can see the response.

### `/pazaak daily`

Claim **200 free credits** once every 24 hours. If you have a win streak going, you get a bonus multiplier:

| Win streak | Multiplier | Daily bonus |
|---|---|---|
| 0–1 wins | 1x | 200 credits |
| 2–4 wins | 1.25x | 250 credits |
| 5–9 wins | 1.5x | 300 credits |
| 10+ wins | 2x | 400 credits |

If you already claimed today, the bot tells you how many hours are left until you can claim again. Only you can see the response.

### `/pazaak rules`

Opens an interactive rulebook embed sourced from `packages/pazaak-engine/src/rules.ts` (`PAZAAK_RULEBOOK`). Use optional **`section`** (`Basics`, `Cards`, `Strategy`, `Game Modes`, `Tournaments`) to jump directly; otherwise pick a section from the attached select menu. Sections mirror the PazaakWorld **Open full rulebook** panel.

### `/pazaak card`

Private lookup for one side-deck token (`token` required). Shows rarity, sideboard copy limit, mechanic, coaching note, and any TSL verification notes. Supports canonical tokens (`+3`, `*2`, `$$`, `VV`, `TT`, `F1`, `F2`) and Wacky tokens (`%4`, `/2`, `00`).

### `/pazaak strategy`

Private strategy primer with subtract-first doctrine excerpts and a **bust probability chart** (uniform 40-card shoe). Optional **`total`** (0–20) highlights your row on the chart.

### `/pazaak tournament`

Create and run brackets without leaving Discord:

| Subcommand | Purpose |
|---|---|
| `create` | Pick format (single / double / Swiss), seats, organizer |
| `join` / `leave` | Register or withdraw before start |
| `list` | Inspect open events |
| `start` | Lock roster and generate bracket |
| `bracket` / `standings` | View pairings or Swiss table |
| `report` | Submit results when auto-settlement cannot resolve |
| `cancel` | Organizer closes the event |

Moderators use `/pazaak-admin tournament` for `force-report` and `reseed`. The Activity **Tournaments** hub consumes the same engine via worker REST + WebSockets.

### `/pazaak leaderboard`

Shows the top 10 players sorted by credit balance. Visible to everyone in the channel.

### `/pazaak rivalry`

Shows your head-to-head record against every opponent you have played. Lists up to 10 opponents sorted by how many matches you have played together. Only you can see the response.

---

## How a Match Works

### Step 1 — Challenge and Accept

You type `/pazaak challenge`, pick an opponent and a wager. A public message appears:

> **Pazaak Bot** — Pazaak Challenge
> @You challenges @Opponent for 500 credits!
> [ Accept ] [ Decline ]

Your opponent clicks **Accept**. If they were not already seeded with a deck, they get a private picker first where they can leave the match on Auto, choose a runtime TSL preset, use their saved runtime preset, or choose from their saved custom sideboards. If they have a lot of saved custom sideboards, that custom-board list can be paged or searched by name so nothing gets cut off, and the picker also includes an **Open Activity Lobby** link so they can adjust their active saved board before they lock in the match. After that, the game begins and a random coin flip decides who goes first.

### Step 2 — Your Sideboard and Hand

At the start of the match, each player receives a **10-card sideboard**. In normal public play that sideboard is either one of the canonical runtime TSL decks (`Very Easy` through `Very Hard`), or the player's active saved custom sideboard if they explicitly chose it. The game draws **4 cards** from that sideboard into your hand once when the match begins.

Private Activity lobbies expose a sideboard mode modifier when the host creates the table:
- `Runtime random` keeps per-seat runtime random sideboards.
- `Each player active custom` requires every human ready seat to have an active saved custom sideboard; each player keeps their own board.
- `Host mirrored custom` uses the host's active saved custom sideboard for both ready seats.

Your hand is **not refreshed** between sets or after ties. A side card can be used once per match, so the timing of each card matters.

### Step 3 — The Board

A **public board** message appears in the channel. It shows:

- Both players' names (the active player is marked)
- Each player's board total (the sum of their played cards)
- How many sets each player has won
- How many side cards each player has left
- Whether a player is standing

Two buttons are on the public board:
- **Open Controls** — opens your private control panel
- **Forfeit** — instantly lose the match (the other player gets the wager)

Inside the browser Activity, players also get a **Sideboard Workshop** button in the live board header. That lets you jump into named-board management mid-match, then return to the same Activity session without backing out to Discord first. The Activity lobby is now linked directly from Discord challenge and sideboard-management surfaces too, so pre-match deck switching no longer depends on opening the workshop only after you are already inside the Activity.

### Step 4 — Your Private Controls

Each player gets their own **private control panel** that only they can see. This shows:

- Your current credit balance
- Your hand (side cards)
- Your board (cards you have played and your total)
- Your opponent's board and total
- Action buttons

**You never see your opponent's hand. They never see yours.**

### Step 5 — Taking Your Turn

On your turn you **must draw first** — a card from the main deck is added to your board.

If the draw puts you over 20, you get one normal side-card window before the turn resolves. A negative, flip, D, VV, or board-flip special can still recover the total. If you end the turn while still over 20, or your one side card still leaves you over 20, you bust and lose the set.

After drawing, you have three choices:

1. **Play a side card** — pick one of your side cards to modify your total, then stand or end the turn
2. **Stand** — stop drawing and lock in your current total for this set
3. **End Turn** — keep your total as-is and pass the turn

You can only play **one side card per turn**, and each side card can only be used **once per match**. After playing a card you can still stand or end the turn — playing a card does not automatically end your turn unless it wins or busts the set.

### Step 6 — Side Cards (Card Types)

Your sideboard can contain any of these card types:

#### Basic Cards

| Type | Examples | What it does |
|---|---|---|
| **Plus** | `+1`, `+2`, `+3`, `+4`, `+5`, `+6` | Adds that number to your total |
| **Minus** | `-1`, `-2`, `-3`, `-4`, `-5`, `-6` | Subtracts that number from your total |
| **Flip** | `±1`, `±2`, `±3`, `±4`, `±5`, `±6` | You choose whether to add or subtract |

Flip cards show two buttons — one for plus, one for minus — so you choose at play time.

#### Special Cards

| Type | Label | What it does |
|---|---|---|
| **Copy** | `D` | Copies the resolved value of the previous board card. You cannot play it as your first board card. |
| **Tiebreaker** | `±1T` | You choose `+1` or `-1`. If the set ends in a tie, the player who played the Tiebreaker wins instead. |
| **Value Change** | `1±2` | You choose `+1`, `+2`, `-1`, or `-2`. In bot token syntax this is `VV`. |
| **Flip 2&4** | `Flip 2&4` | Occupies a board slot with value `0`, then flips the sign of every 2 and 4 on your board that came from the main deck or a plus/minus card. Flip and other special cards are not affected. |
| **Flip 3&6** | `Flip 3&6` | Occupies a board slot with value `0`, then flips the sign of positive 3s and 6s on your board. |

**When to use side cards:**
- Your total is 18 and you have a `+2` → play it to hit exactly 20
- Your total is 14 and you have a `±6` → play `+6` to hit 20
- Your last board card is `-4` and you have `D` → play it to copy that `-4`
- Your board has 10+4+8 = 22 and you play Flip 2&4 → the 4 becomes -4, total drops to 14

### Step 7 — Winning a Set

A set ends when both players have stood or one player busts:

- If your draw puts you **over 20**, you may recover with one side card before the turn ends.
- If you end the turn over 20, or a side card you play still leaves you over 20, you bust and lose the set.
- If both players stand, whoever is **closer to 20** wins the set.
- If both players stand on the **same total**, the set is a **tie** — unless one player has played a **Tiebreaker** card, in which case that player wins.
- On a true tie (no tiebreaker), a new set starts with the same remaining side hand.
- If **5 sets tie in a row**, the match is force-resolved by current set record.

### Step 8 — Who Goes First Next

- The **loser** of a set goes first in the next set.
- On a tie, the original **coin-flip opener** resumes.
- The very first set uses a random coin flip.

### Step 9 — Winning the Match

First player to win **3 sets** wins the match. The winner's credits go up by the wager amount. The loser's credits go down by the wager amount (but never below 0).

After the match ends, a **Rematch** button appears. Either player can click it to start a new challenge at the same wager, and if the completed match used fixed sideboards those same sideboards carry forward into the rematch.

### Nine-Card Rule

If your board reaches **9 cards** without going over 20, you **automatically win the set**. This is rare but powerful.

### Turn Timer

If you do not take any action for **5 minutes**, you automatically forfeit the match. The other player wins the wager.

---

## Credits

| Event | Credits |
|---|---|
| Starting balance (new player) | +1,000 |
| Daily bonus | +200 (multiplied by streak bonus) |
| Winning a match | +wager amount |
| Losing a match | −wager amount |
| Lowest possible balance | 0 (you can never go negative) |

Credits are fake. They are just for fun on this server. There is no way to convert them to real money or trade them outside the server.

---

## Tips

- **Stand early if you are close to 20.** If your total is 17–20 and you have no good recovery cards, standing is often safer than drawing.
- **Play side cards to fine-tune your total before standing.** A `+2` when you are at 18 locks in a perfect 20.
- **Minus and flip cards are your recovery tools.** They are strongest when a draw pushes you over 20 or when you need to force a safer standing total.
- **Tiebreaker cards are insurance.** They still win ties, but you can choose either `+1T` or `-1T` when you play them.
- **D copies your last resolved board value.** If the previous card was negative or came from another side card, D copies that resolved number. You cannot open a board with D.
- **Flip 2&4 affects main-deck draws and plus/minus cards only.** It will not flip cards placed by other side cards.
- **Flip 2&4 and Flip 3&6 still consume a board slot.** Their own printed value is 0, but they count toward the 9-card auto-win.
- **Flip 3&6 should be treated as a targeted board-flip card, not a generic sign toggle.**
- **Claim your daily bonus every day.** Free credits add up, especially with a win streak multiplier.
- **Watch your opponent's side card count.** If they have no side cards left, they cannot adjust their total after drawing.
- **Do not wager more than you can afford to lose.** If your balance hits 0, you have to wait for daily bonuses to build it back up.

---

## Admin Commands

Server moderators (with **Manage Server** permission) have access to extra commands:

### `/pazaak-admin give`

Add credits to a player's wallet.

| What to fill in | What it means |
|---|---|
| **player** | The person to give credits to |
| **amount** | How many credits to add (1–1,000,000) |

### `/pazaak-admin take`

Remove credits from a player's wallet. Their balance cannot go below 0.

| What to fill in | What it means |
|---|---|
| **player** | The person to take credits from |
| **amount** | How many credits to remove (1–1,000,000) |
