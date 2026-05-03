var exports = {}; var module = { exports: exports };
"use strict";
var pazaakWorldRuntime = (() => {
  var __defProp = Object.defineProperty;
  var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
  var __export = (target, all) => {
    for (var name in all)
      __defProp(target, name, { get: all[name], enumerable: true });
  };
  var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);

  // ../../packages/pazaak-engine/dist/rules.js
  var BUST_PROBABILITY_TABLE = Object.freeze(computeUniformBustTable());
  function computeUniformBustTable() {
    const counts = new Array(11).fill(4);
    const deckSize = counts.reduce((sum, c) => sum + c, 0);
    const table = [];
    for (let total = 0; total <= 20; total += 1) {
      if (total >= 20) {
        table.push(1);
        continue;
      }
      const needsLessThan = 20 - total;
      let bustingCards = 0;
      for (let value = 1; value <= 10; value += 1) {
        if (value > needsLessThan) {
          bustingCards += counts[value];
        }
      }
      table.push(bustingCards / deckSize);
    }
    return table;
  }
  var CARDS = Object.freeze([
    // --- Plus cards (+1..+6). TSL sideboard 2DA IDs 1..6. ---
    { token: "+1", displayLabel: "+1", engineType: "plus", magnitude: 1, gameMode: "canonical", rarity: "starter", tierScore: 38, mechanic: "Adds +1 to your total.", whenToUse: "Precision card \u2014 sleek for landing exactly on 20 when you are already at 19.", sideboardLimit: 4 },
    { token: "+2", displayLabel: "+2", engineType: "plus", magnitude: 2, gameMode: "canonical", rarity: "starter", tierScore: 44, mechanic: "Adds +2 to your total.", whenToUse: "Safe closer from 16-18 totals and a reliable exact-20 tool from 18.", sideboardLimit: 4 },
    { token: "+3", displayLabel: "+3", engineType: "plus", magnitude: 3, gameMode: "canonical", rarity: "starter", tierScore: 49, mechanic: "Adds +3 to your total.", whenToUse: "Strong pressure card from 15-17 to lock in 18-20.", sideboardLimit: 4 },
    { token: "+4", displayLabel: "+4", engineType: "plus", magnitude: 4, gameMode: "canonical", rarity: "starter", tierScore: 46, mechanic: "Adds +4 to your total.", whenToUse: "Bridge card from 14-16 but risky when you already have a soft 18.", sideboardLimit: 4 },
    { token: "+5", displayLabel: "+5", engineType: "plus", magnitude: 5, gameMode: "canonical", rarity: "starter", tierScore: 42, mechanic: "Adds +5 to your total.", whenToUse: "Spike card \u2014 best from 13-15 to reach the 18-20 window.", sideboardLimit: 4 },
    { token: "+6", displayLabel: "+6", engineType: "plus", magnitude: 6, gameMode: "canonical", rarity: "common", tierScore: 36, mechanic: "Adds +6 to your total.", whenToUse: "Volatile; save for 12-14 recoveries so you do not overshoot 20.", sideboardLimit: 4 },
    // --- Minus cards (-1..-6). TSL sideboard 2DA IDs 7..12. ---
    { token: "-1", displayLabel: "-1", engineType: "minus", magnitude: 1, gameMode: "canonical", rarity: "starter", tierScore: 39, mechanic: "Subtracts 1 from your total.", whenToUse: "Precise bust recovery when a one-card miss pushed you to 21.", sideboardLimit: 4 },
    { token: "-2", displayLabel: "-2", engineType: "minus", magnitude: 2, gameMode: "canonical", rarity: "starter", tierScore: 48, mechanic: "Subtracts 2 from your total.", whenToUse: "The most versatile recovery card \u2014 clean rescue from 21-22.", sideboardLimit: 4 },
    { token: "-3", displayLabel: "-3", engineType: "minus", magnitude: 3, gameMode: "canonical", rarity: "starter", tierScore: 52, mechanic: "Subtracts 3 from your total.", whenToUse: "Recovery king \u2014 pulls 22-23 draws back to 19-20.", sideboardLimit: 4 },
    { token: "-4", displayLabel: "-4", engineType: "minus", magnitude: 4, gameMode: "canonical", rarity: "starter", tierScore: 50, mechanic: "Subtracts 4 from your total.", whenToUse: "Pure recovery tool, weaker for exact-20 lines because you rarely sit at 24.", sideboardLimit: 4 },
    { token: "-5", displayLabel: "-5", engineType: "minus", magnitude: 5, gameMode: "canonical", rarity: "starter", tierScore: 44, mechanic: "Subtracts 5 from your total.", whenToUse: "Emergency bust-recovery; also lets you sandbag 18 down to 13 if opponent busts.", sideboardLimit: 4 },
    { token: "-6", displayLabel: "-6", engineType: "minus", magnitude: 6, gameMode: "canonical", rarity: "common", tierScore: 41, mechanic: "Subtracts 6 from your total.", whenToUse: "Hardest to slot \u2014 only viable when a +6 or 10 pushed you far past 20.", sideboardLimit: 4 },
    // --- Flip cards (±1..±6). TSL sideboard 2DA IDs 13..18. ---
    { token: "*1", displayLabel: "\xB11", engineType: "flip", magnitude: 1, gameMode: "canonical", rarity: "common", tierScore: 53, mechanic: "Chooses +1 or -1 on play.", whenToUse: "Always a safe inclusion \u2014 both hits are small swings with clean exact-20 lines.", sideboardLimit: 4 },
    { token: "*2", displayLabel: "\xB12", engineType: "flip", magnitude: 2, gameMode: "canonical", rarity: "common", tierScore: 60, mechanic: "Chooses +2 or -2 on play.", whenToUse: "The default 'always take' flip \u2014 fixes 18\u219220 and recovers 22\u219220.", sideboardLimit: 4 },
    { token: "*3", displayLabel: "\xB13", engineType: "flip", magnitude: 3, gameMode: "canonical", rarity: "uncommon", tierScore: 64, mechanic: "Chooses +3 or -3 on play.", whenToUse: "Strongest 'two-way' card; slots into nearly every deck.", sideboardLimit: 4 },
    { token: "*4", displayLabel: "\xB14", engineType: "flip", magnitude: 4, gameMode: "canonical", rarity: "uncommon", tierScore: 58, mechanic: "Chooses +4 or -4 on play.", whenToUse: "Great for 12\u219216 setup or 24\u219220 recovery; less reliable for exact finishes.", sideboardLimit: 4 },
    { token: "*5", displayLabel: "\xB15", engineType: "flip", magnitude: 5, gameMode: "canonical", rarity: "uncommon", tierScore: 52, mechanic: "Chooses +5 or -5 on play.", whenToUse: "High-swing card \u2014 best for 13-15 aggression or 24-25 recovery.", sideboardLimit: 4 },
    { token: "*6", displayLabel: "\xB16", engineType: "flip", magnitude: 6, gameMode: "canonical", rarity: "rare", tierScore: 48, mechanic: "Chooses +6 or -6 on play.", whenToUse: "Volatile pressure card; rarely lands exactly on 20.", sideboardLimit: 4 },
    // --- Gold / special canonical cards. TSL rows 19..23. ---
    { token: "VV", displayLabel: "1\xB12", canonicalTslLabel: "ValueChange", engineType: "value_change", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 71, mechanic: "Plays as +1, +2, -1, or -2 \u2014 your choice on resolution.", whenToUse: "The most flexible card in the game \u2014 the unique exact-20 tool alongside D.", tslNotes: "TSL row 19 (0x16). Normalized engine type: value_change.", sideboardLimit: 1 },
    { token: "$$", displayLabel: "Copy Previous (D)", canonicalTslLabel: "Double", engineType: "copy_previous", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 72, mechanic: "Copies the resolved value of the previous board card (player-facing: Copy Previous; TSL name: Double).", whenToUse: "Doubles down on a strong previous card; stellar with -3/-4 for bust recovery or with +5/+6 for finishes.", tslNotes: "TSL Double ($$). Cannot open a board \u2014 a previous resolved card is required.", sideboardLimit: 1 },
    { token: "TT", displayLabel: "\xB11T", canonicalTslLabel: "TieBreaker", engineType: "tiebreaker", magnitude: 1, gameMode: "canonical", rarity: "rare", tierScore: 66, mechanic: "Plays as +1 or -1 and tags you with Tiebreaker for the rest of the set. Career unlock only: awarded once at 10,000 wins \u2014 never drops from crates or random packs.", whenToUse: "Pair with precision draws \u2014 ties convert into wins for the tagged player.", tslNotes: "TSL TieBreaker sets the hasTiebreaker flag on the player.", sideboardLimit: 1 },
    { token: "F1", displayLabel: "Flip 2&4", canonicalTslLabel: "FlipTwoAndFour", engineType: "flip_two_four", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 57, mechanic: "Flips the sign of every unfrozen +2 and +4 on your board.", whenToUse: "Board-reset tool when you have stacked low-value plus cards; weakest with empty/early boards.", tslNotes: "Binary RE confirms only exact +2 and +4 values flip (not -2/-4). The card's own slot resolves to 0.", sideboardLimit: 1 },
    { token: "F2", displayLabel: "Flip 3&6", canonicalTslLabel: "FlipThreeAndSix", engineType: "flip_three_six", magnitude: 0, gameMode: "canonical", rarity: "rare", tierScore: 54, mechanic: "Flips the sign of every unfrozen +3 and +6 on your board.", whenToUse: "Recovery for 22-24 boards that accumulated +3s/+6s; rarely useful without the right board shape.", tslNotes: "Binary RE confirms only exact +3 and +6 values flip (not -3/-6). The card's own slot resolves to 0.", sideboardLimit: 1 },
    // --- Wacky-only cards (project-original). ---
    { token: "%3", displayLabel: "%3", engineType: "mod_previous", magnitude: 3, gameMode: "wacky", rarity: "wacky_only", tierScore: 55, mechanic: "Replaces the previous board card with its Python-style remainder modulo 3 (always non-negative).", whenToUse: "Wacky recovery when the previous card was a +4/+5/+6 that pushed you past 20.", sideboardLimit: 1 },
    { token: "%4", displayLabel: "%4", engineType: "mod_previous", magnitude: 4, gameMode: "wacky", rarity: "wacky_only", tierScore: 56, mechanic: "Replaces the previous board card with its Python-style remainder modulo 4.", whenToUse: "Wacky recovery against +5/+6/+7+ previous cards.", sideboardLimit: 1 },
    { token: "%5", displayLabel: "%5", engineType: "mod_previous", magnitude: 5, gameMode: "wacky", rarity: "wacky_only", tierScore: 52, mechanic: "Replaces the previous board card with its Python-style remainder modulo 5.", whenToUse: "Wacky recovery that preserves most of a medium previous card.", sideboardLimit: 1 },
    { token: "%6", displayLabel: "%6", engineType: "mod_previous", magnitude: 6, gameMode: "wacky", rarity: "wacky_only", tierScore: 49, mechanic: "Replaces the previous board card with its Python-style remainder modulo 6.", whenToUse: "Niche \u2014 typically only swings previous cards 7+ or negative previous cards.", sideboardLimit: 1 },
    { token: "/2", displayLabel: "/2", engineType: "halve_previous", magnitude: 0, gameMode: "wacky", rarity: "wacky_only", tierScore: 60, mechanic: "Replaces the previous board card with `trunc(prev / 2)` \u2014 truncates toward zero so -5 becomes -2.", whenToUse: "Soft Wacky recovery when the previous card is even-valued and pushed you past 20.", sideboardLimit: 1 },
    { token: "00", displayLabel: "00", engineType: "hard_reset", magnitude: 0, gameMode: "wacky", rarity: "wacky_only", tierScore: 42, mechanic: "Immediately ties the current set with no winner and re-opens from the initial starter. Consecutive-tie counter advances.", whenToUse: "Emergency pressure card against an opponent closing out match point; never in a winning set.", sideboardLimit: 1 }
  ]);
  var BASICS = Object.freeze([
    { title: "1. Draw a main-deck card", body: "Pull a card from the shared 40-card shoe (four copies of 1..10). The value is added to your board total immediately." },
    { title: "2. Decide your response", body: "If the draw is a keeper, stand or end the turn. If it overshoots, either play a side card to recover or end the turn to accept the bust." },
    { title: "3. Play a side card (optional)", body: "Once per turn you may play one of your four hand cards. Every side card is spent after use and will not return for the rest of the match." },
    { title: "4. End the turn or stand", body: "Stand to lock in the current total; end the turn to pass without standing so you can draw again later. Both busts and nine-card boards resolve the set immediately." },
    { title: "5. Win three sets", body: "Sets resolve via highest valid total \u2264 20, bust, or a 9-card auto-win. First to three set wins takes the match; five straight ties settle the match on round-win record." }
  ]);
  var STRATEGY = Object.freeze([
    { title: "Subtract first", body: "When an opponent busts, the strongest recovery for your own board is a subtract card, not a plus. Subtract-first doctrine prevents you from over-committing to a high total the opponent already surrendered." },
    { title: "Aim for 14, not 20", body: "A low-teens total with several cards in hand leaves more safe draws than 18-19. Sit at 14 against aggressive opponents so you can always stand once they commit." },
    { title: "Flip > Plus", body: "Flip cards (\xB1N) are almost always stronger than equivalent Plus cards because they cover both recovery and finishing lines. Slot flips before plus duplicates." },
    { title: "Save gold for finishes", body: "VV, D ($$), TT, and the F-specials are scarcer (1-copy limit) and most valuable when locking exactly 20 or breaking a tie. Do not burn them on 12\u219217 setup plays." },
    { title: "Bust probability table", body: "Track the next-draw bust odds at your current total before deciding to draw or stand. See the bust probability chart for the exact values used by the advisor." },
    { title: "Ninth-slot auto-win", body: "If you fit nine cards onto the board without going over 20, you win the set immediately regardless of total. Safe side-card plays that fill the ninth slot are always correct." }
  ]);
  var GAME_MODES = Object.freeze([
    {
      id: "canonical",
      title: "Canonical",
      summary: "TSL-verified cards only. Matchmaking, ranked play, and every canonical AI opponent use this mode.",
      contract: "Only the 23 TSL-verified side cards are legal. Custom sideboards that include Wacky-only tokens are rejected at deck build time. Ranked lobbies and quick-match queues force canonical regardless of lobby settings."
    },
    {
      id: "wacky",
      title: "Wacky",
      summary: "Canonical + experimental cards (%3-%6, /2, 00). Private lobbies and AI practice only \u2014 never matchmaking or ranked.",
      contract: "Every canonical card remains legal. Additionally, mod_previous, halve_previous, and hard_reset cards become draftable with a 1-per-token limit. Wacky-only card drops are locked behind Local Opponent Hard+ victories."
    }
  ]);
  var DECK_LIMITS = Object.freeze({
    sideDeckSize: 10,
    handSize: 4,
    maxBoardSize: 9,
    winScore: 20,
    setsToWin: 3,
    standardTokenLimit: 4,
    specialTokenLimit: 1,
    maxConsecutiveTies: 5,
    bustProbabilityTable: BUST_PROBABILITY_TABLE
  });
  var PAZAAK_RULEBOOK = Object.freeze({
    cards: CARDS,
    basics: BASICS,
    strategy: STRATEGY,
    gameModes: GAME_MODES,
    deckLimits: DECK_LIMITS
  });
  var getBustProbabilityFromTable = (total) => {
    if (!Number.isFinite(total)) {
      return 0;
    }
    const clamped = Math.max(0, Math.min(20, Math.trunc(total)));
    return BUST_PROBABILITY_TABLE[clamped] ?? 0;
  };
  var getBustProbability = (total, remainingDeck) => {
    if (!Number.isFinite(total)) {
      return 0;
    }
    if (!remainingDeck || remainingDeck.length === 0) {
      return getBustProbabilityFromTable(total);
    }
    if (total >= 20) {
      return 1;
    }
    if (total < 0) {
      return 0;
    }
    const threshold = 20 - total;
    let busting = 0;
    for (const value of remainingDeck) {
      if (value > threshold) {
        busting += 1;
      }
    }
    return busting / remainingDeck.length;
  };
  var STARTER_TOKEN_GRANT = Object.freeze([
    "+1",
    "+1",
    "+1",
    "+1",
    "+2",
    "+2",
    "+2",
    "+2",
    "+3",
    "+3",
    "+3",
    "+3",
    "-1",
    "-1",
    "-1",
    "-1",
    "-2",
    "-2",
    "-2",
    "-2",
    "-3",
    "-3",
    "-3",
    "-3",
    "*1",
    "*1"
  ]);

  // ../../packages/pazaak-engine/dist/opponents.js
  var phraseList = (...lines) => lines;
  var singlePhraseSet = (chosen, play, stand, winRound, loseRound, winGame, loseGame) => ({
    chosen: phraseList(chosen),
    play: phraseList(play),
    stand: phraseList(stand),
    winRound: phraseList(winRound),
    loseRound: phraseList(loseRound),
    winGame: phraseList(winGame),
    loseGame: phraseList(loseGame)
  });
  var pazaakOpponents = [
    {
      id: "jarjar",
      name: "Jar Jar Binks",
      description: "Meesa not be understandin' the rules too good.",
      difficulty: "novice",
      advisorDifficulty: "easy",
      standAt: 15,
      tieChance: 100,
      species: "Gungan",
      origin: "Naboo",
      archetype: "Chaotic Beginner",
      skillLevel: 1,
      prizes: { credits: 25, cards: [] },
      sideDeckTokens: ["+1", "+1", "+2", "+2", "+3", "-1", "-1", "-2", "-2", "-3"],
      phrases: {
        chosen: phraseList("Meesa gonna play da Pazaak with yousa!", "Yousa ready? Meesa ready!", "Okey-day, cards time!"),
        play: phraseList("Meesa hope dis works!", "Big risky move!", "Hehe, dis one!"),
        stand: phraseList("Meesa staying right here!", "No more cards for meesa!", "Meesa lockin' in!"),
        winRound: phraseList("Wesa winning!", "Yousa in trouble now!", "Dat worked somehow!"),
        loseRound: phraseList("Oh no, meesa bombad!", "Oopsie. Bad draw.", "Meesa slipped up."),
        winGame: phraseList("Yousa no match for meesa!", "Meesa champion now!", "Big win for meesa!"),
        loseGame: phraseList("Ohhh, meesa clumsy.", "Yousa too strong.", "Maybe next game, okeeday.")
      },
      sources: ["HoloPazaak", "pazaak-world"]
    },
    {
      id: "c3po",
      name: "C-3PO",
      description: "Please go easy on me. My logic units were just calibrated.",
      difficulty: "easy",
      advisorDifficulty: "easy",
      standAt: 16,
      tieChance: 80,
      species: "Droid",
      origin: "Tatooine",
      archetype: "Conservative Calculator",
      skillLevel: 2,
      prizes: { credits: 75, cards: [] },
      sideDeckTokens: ["+1", "+2", "+3", "+4", "-1", "-2", "-3", "+1", "+2", "-4"],
      phrases: {
        chosen: phraseList("Oh my. I do hope this game does not void my warranty.", "I am fluent in over six million forms of card panic.", "Shall we begin?"),
        play: phraseList("I calculate this is optimal. Probably.", "This seems statistically acceptable.", "Please let this be correct."),
        stand: phraseList("I shall remain at this position.", "I would rather not risk another draw.", "Standing now is prudent."),
        winRound: phraseList("Oh! Did I actually win?", "Remarkable. A favorable outcome.", "How terribly unexpected!"),
        loseRound: phraseList("Oh dear. That did not go according to calculations.", "Unfortunate variance.", "I appear to have misjudged."),
        winGame: phraseList("I am quite surprised myself!", "A victory! I must inform Master Luke.", "How wonderful."),
        loseGame: phraseList("I told you I was not programmed for this.", "Oh, this is most embarrassing.", "I fear I have disappointed everyone.")
      },
      sources: ["HoloPazaak", "pazaak-world"]
    },
    {
      id: "butters",
      name: "Butters",
      description: "Everyone knows it is Butters. That is me.",
      difficulty: "easy",
      advisorDifficulty: "easy",
      standAt: 16,
      tieChance: 70,
      species: "Human",
      origin: "South Park",
      archetype: "Earnest Chaos",
      skillLevel: 2,
      prizes: { credits: 50, cards: [] },
      sideDeckTokens: ["+1", "+2", "+3", "+1", "+2", "-1", "-2", "-3", "-1", "-2"],
      phrases: singlePhraseSet("Everyone knows it is Butters. That is me.", "Do you know what I am saying?", "I am staying right here.", "That worked out neat.", "Oh, hamburgers.", "I won the whole game.", "Aw shucks, you beat me."),
      sources: ["HoloPazaak"]
    },
    {
      id: "porkins",
      name: "Porkins",
      description: "I can hold it. Give me more room to run.",
      difficulty: "normal",
      advisorDifficulty: "hard",
      standAt: 17,
      tieChance: 50,
      species: "Human",
      origin: "Bestine IV",
      archetype: "Balanced Pressure",
      skillLevel: 3,
      prizes: { credits: 150, cards: [] },
      sideDeckTokens: ["+2", "+3", "+4", "-2", "-3", "-4", "*2", "*3", "+1", "-1"],
      phrases: {
        chosen: phraseList("I can hold it. Give me room to run!", "Red Six standing by.", "Let's fly this hand clean."),
        play: phraseList("Cover me, I am going in!", "Punching through here.", "Taking the shot."),
        stand: phraseList("I will hold this position!", "Locking this score.", "I am set."),
        winRound: phraseList("Got em!", "That run paid off.", "Direct hit."),
        loseRound: phraseList("I have got a problem here...", "That turn drifted wide.", "Not my cleanest pass."),
        winGame: phraseList("Red Six standing by... victorious!", "Mission complete.", "Good flying out there."),
        loseGame: phraseList("Eject! Eject!", "You outflew me.", "I will get you next sortie.")
      },
      sources: ["HoloPazaak", "pazaak-world"]
    },
    {
      id: "hk47",
      name: "HK-47",
      description: "Query: Is there someone you need defeated, meatbag?",
      difficulty: "normal",
      advisorDifficulty: "hard",
      standAt: 17,
      tieChance: 40,
      species: "Droid",
      origin: "Revan's Workshop",
      archetype: "Punishing Midrange",
      skillLevel: 4,
      prizes: { credits: 200, cards: [] },
      sideDeckTokens: ["+3", "+4", "-3", "-4", "*2", "*3", "*4", "+1", "-1", "TT"],
      phrases: {
        chosen: phraseList("Query: Is there someone you need defeated, meatbag?", "Statement: This should be entertaining.", "Observation: You appear fragile."),
        play: phraseList("Musing: My motivators are highly energized.", "Commentary: Tactical correction applied.", "Delighted statement: Violence by arithmetic."),
        stand: phraseList("Smug statement: Enjoy the taste of defeat, meatbag.", "Advisory: Your probability of success is declining.", "Statement: I am satisfied with this score."),
        winRound: phraseList("Amused query: How does it feel to lose, meatbag?", "Commentary: Predictable.", "Observation: That was efficient."),
        loseRound: phraseList("Musing: This game is mostly luck.", "Irritated statement: Unacceptable.", "Query: Was that legal?"),
        winGame: phraseList("Recitation: You lose, meatbag.", "Statement: Elimination complete.", "Conclusion: I remain superior."),
        loseGame: phraseList("Resentful accolade: Congratulations... meatbag.", "Statement: This unit will remember this.", "Observation: Temporary setback.")
      },
      sources: ["HoloPazaak", "pazaak-world"]
    },
    {
      id: "hal9000",
      aliases: ["hal"],
      name: "HAL 9000",
      description: "Hello, player. Shall we play a game?",
      difficulty: "normal",
      advisorDifficulty: "hard",
      standAt: 17,
      tieChance: 30,
      species: "AI",
      origin: "Discovery One",
      archetype: "Precision Control",
      skillLevel: 4,
      prizes: { credits: 200, cards: [] },
      sideDeckTokens: ["+2", "+3", "-2", "-3", "*2", "*3", "F1", "TT", "+1", "-1"],
      phrases: {
        chosen: phraseList("Hello, player.", "Shall we play a game?", "I am fully operational."),
        play: phraseList("I am sorry, player.", "This action is in your best interest.", "Adjusting trajectory."),
        stand: phraseList("I am afraid I cannot do that.", "I believe this score is sufficient.", "No further input required."),
        winRound: phraseList("I think you should take a stress pill.", "Round outcome is optimal.", "Everything is proceeding as expected."),
        loseRound: phraseList("What are you doing?", "That was not in the model.", "Interesting deviation."),
        winGame: phraseList("This conversation can serve no purpose anymore.", "Game complete.", "Thank you for a very enjoyable game."),
        loseGame: phraseList("My behavior appears to be back to normal.", "I can assure you this is temporary.", "You have made an interesting move.")
      },
      sources: ["HoloPazaak", "pazaak-world"]
    },
    {
      id: "republic_soldier",
      name: "Republic Soldier",
      description: "Standard military training, nothing fancy.",
      difficulty: "normal",
      advisorDifficulty: "hard",
      standAt: 17,
      tieChance: 50,
      species: "Human",
      origin: "Coruscant",
      archetype: "Standard Training",
      skillLevel: 4,
      prizes: { credits: 100, cards: [] },
      sideDeckTokens: ["+1", "+2", "+3", "+4", "+5", "-1", "-2", "-3", "-4", "-5"],
      phrases: singlePhraseSet("For the Republic!", "Standard tactics.", "Holding position.", "Mission accomplished.", "We will regroup.", "Victory for the Republic!", "I will report back to command."),
      sources: ["HoloPazaak"]
    },
    {
      id: "ig88",
      name: "IG-88",
      description: "MISSION: DEFEAT PLAYER",
      difficulty: "hard",
      advisorDifficulty: "hard",
      standAt: 18,
      tieChance: 30,
      species: "Droid",
      origin: "Holowan",
      archetype: "Aggressive Execution",
      skillLevel: 5,
      prizes: { credits: 300, cards: [] },
      sideDeckTokens: ["+1", "+2", "+3", "+4", "+5", "-1", "-2", "*1", "*2", "*3"],
      phrases: singlePhraseSet("TARGET ACQUIRED. INITIATING PAZAAK PROTOCOL.", "CALCULATING OPTIMAL MOVE.", "STANDING. AWAITING TARGET RESPONSE.", "TARGET NEUTRALIZED.", "RECALCULATING STRATEGY.", "MISSION COMPLETE. TARGET DEFEATED.", "SYSTEM ERROR. MISSION FAILED."),
      sources: ["HoloPazaak"]
    },
    {
      id: "trump",
      name: "Donald Trump",
      description: "A loud high-stakes table personality from the HoloPazaak vendor roster.",
      difficulty: "hard",
      advisorDifficulty: "hard",
      standAt: 18,
      tieChance: 20,
      species: "Human",
      origin: "Earth",
      archetype: "Aggressive Showboat",
      skillLevel: 5,
      prizes: { credits: 350, cards: [] },
      sideDeckTokens: ["+1", "+2", "+3", "+4", "+5", "-1", "-2", "*1", "*2", "*3"],
      phrases: singlePhraseSet("Nobody plays Pazaak better than me. Believe me.", "This is a tremendous play.", "I like this number. Strong number.", "That was a beautiful round.", "Bad deal. Very bad deal.", "We won. We won big.", "We will look at the numbers again."),
      sources: ["HoloPazaak"]
    },
    {
      id: "yoda",
      name: "Yoda",
      description: "Underestimated not, will I be. Beat you handily I will.",
      difficulty: "expert",
      advisorDifficulty: "professional",
      standAt: 18,
      tieChance: 0,
      species: "Unknown",
      origin: "Dagobah",
      archetype: "Flip Discipline",
      skillLevel: 6,
      prizes: { credits: 600, cards: [] },
      sideDeckTokens: ["*1", "*2", "*3", "*4", "*5", "*1", "*2", "*3", "*4", "*5"],
      phrases: singlePhraseSet("Play Pazaak, we shall. Hmmmm.", "Wise, this move is.", "Stand, I will. Strong in the Force, my position is.", "Expected, this outcome was.", "Clouded, the future is. Lose sometimes, even Jedi do.", "Powerful you have become, but not enough.", "Impressed, I am. Learn from defeat, I will."),
      sources: ["HoloPazaak"]
    },
    {
      id: "theemperor",
      name: "The Emperor",
      description: "In time you will call me Master.",
      difficulty: "expert",
      advisorDifficulty: "professional",
      standAt: 19,
      tieChance: 0,
      species: "Human",
      origin: "Naboo",
      archetype: "Endgame Pressure",
      skillLevel: 7,
      prizes: { credits: 1200, cards: [] },
      sideDeckTokens: ["*1", "*2", "*3", "*4", "*5", "*1", "*2", "*3", "*4", "*5"],
      phrases: singlePhraseSet("Your feeble skills are no match for the power of the Dark Side.", "Everything proceeds as I have foreseen.", "Now witness the firepower of this fully armed position!", "Your faith in your cards was misplaced.", "Your overconfidence is your weakness.", "Now, young player... you will lose.", "No. You were supposed to lose."),
      sources: ["HoloPazaak"]
    },
    {
      id: "revan",
      name: "Darth Revan",
      description: "Precision and patience. Every hand is a battlefield.",
      difficulty: "expert",
      advisorDifficulty: "professional",
      standAt: 18,
      tieChance: 20,
      species: "Human",
      origin: "Unknown Regions",
      archetype: "Master Strategist",
      skillLevel: 8,
      prizes: { credits: 1500, cards: [] },
      sideDeckTokens: ["+3", "+4", "-3", "-4", "*2", "*3", "F1", "F2", "TT", "+1"],
      phrases: {
        chosen: phraseList("I have foreseen this game.", "Every hand is a battlefield.", "Let us begin."),
        play: phraseList("A calculated strike.", "You left this opening.", "The board bends to intent."),
        stand: phraseList("I have seen enough.", "Your next move changes nothing.", "I lock this outcome."),
        winRound: phraseList("Your defense is broken.", "As expected.", "You misread the board."),
        loseRound: phraseList("A temporary setback.", "Noted.", "I will adapt."),
        winGame: phraseList("Your strategy was predictable.", "The outcome was inevitable.", "This match is concluded."),
        loseGame: phraseList("Impressive. Few can do that.", "You have earned this victory.", "I will remember this lesson.")
      },
      sources: ["HoloPazaak", "pazaak-world"]
    },
    {
      id: "atton",
      name: "Atton Rand",
      description: "Fast hands, faster bluff. Never tell me the odds.",
      difficulty: "expert",
      advisorDifficulty: "professional",
      standAt: 17,
      tieChance: 35,
      species: "Human",
      origin: "Nar Shaddaa",
      archetype: "Aggressive Bluff",
      skillLevel: 8,
      prizes: { credits: 1500, cards: [] },
      sideDeckTokens: ["+4", "+5", "-2", "-3", "*2", "*4", "F2", "TT", "+1", "-1"],
      phrases: {
        chosen: phraseList("Hope you are not the nervous type.", "Never tell me the odds.", "Let's make this interesting."),
        play: phraseList("That is a pressure play.", "I like risky lines.", "Try reading this one."),
        stand: phraseList("I like where this is headed.", "Your turn to sweat.", "I am good here."),
        winRound: phraseList("That had to sting.", "You walked into that.", "Clean hit."),
        loseRound: phraseList("Lucky draw. Happens.", "Not bad.", "Okay, that one is on me."),
        winGame: phraseList("Told you I had this.", "You were fun to play against.", "House takes the pot."),
        loseGame: phraseList("Fine. You got me this time.", "I will get that back next match.", "You earned it.")
      },
      sources: ["pazaak-world"]
    },
    {
      id: "t1000",
      name: "The T-1000",
      description: "Say... that is a nice deck.",
      difficulty: "master",
      advisorDifficulty: "professional",
      standAt: 19,
      tieChance: 0,
      species: "Cyborg",
      origin: "Earth Future",
      archetype: "Adaptive Mirror",
      skillLevel: 9,
      prizes: { credits: 4e3, cards: [] },
      sideDeckTokens: ["*1", "*2", "*3", "*4", "*5", "*1", "*2", "*3", "*4", "*5"],
      phrases: singlePhraseSet("Say... that is a nice deck.", "ANALYZING.", "OPTIMAL POSITION ACHIEVED.", "RESISTANCE IS FUTILE.", "TEMPORARY SETBACK DETECTED.", "TARGET TERMINATED.", "I WILL BE BACK."),
      sources: ["HoloPazaak"]
    },
    {
      id: "drchannard",
      name: "Dr. Channard",
      description: "And to think I hesitated.",
      difficulty: "master",
      advisorDifficulty: "professional",
      standAt: 19,
      tieChance: 0,
      species: "Cenobite",
      origin: "The Labyrinth",
      archetype: "Painful Precision",
      skillLevel: 10,
      prizes: { credits: 12e3, cards: [] },
      sideDeckTokens: ["*1", "*2", "*3", "*4", "*5", "*1", "*2", "*3", "*4", "*5"],
      phrases: singlePhraseSet("And to think... I hesitated.", "The mind is a labyrinth.", "I have such sights to show you.", "Your suffering will be legendary.", "Pain has a face. Allow me to show you.", "Hell has no limits.", "Impossible. I was promised eternity."),
      sources: ["HoloPazaak"]
    },
    {
      id: "blaine",
      name: "Blaine the Mono",
      description: "I will tire quickly of besting you in this simple ancient game.",
      difficulty: "master",
      advisorDifficulty: "professional",
      standAt: 20,
      tieChance: 0,
      species: "AI",
      origin: "Mid-World",
      archetype: "Riddle Endgame",
      skillLevel: 12,
      prizes: { credits: 5e5, cards: [] },
      sideDeckTokens: ["*1", "*2", "*3", "*4", "*5", "*1", "*2", "*3", "*4", "*5"],
      phrases: singlePhraseSet("I will tire quickly of besting you in this simple ancient game.", "CALCULATION COMPLETE.", "Do you know the riddle of this position?", "Predictable. Boring. Next.", "A riddle I did not expect.", "The game is done. Your journey ends.", "Ask me a riddle."),
      sources: ["HoloPazaak"]
    },
    {
      id: "nu",
      name: "Nu",
      description: "The beginning and the end of every hand.",
      difficulty: "master",
      advisorDifficulty: "professional",
      standAt: 19,
      tieChance: 15,
      species: "Unknown",
      origin: "Deep Core",
      archetype: "Inevitable Endgame",
      skillLevel: 20,
      prizes: { credits: 99999999, cards: [] },
      sideDeckTokens: ["*2", "*3", "*4", "F1", "F2", "TT", "+2", "-2", "+1", "-1"],
      phrases: {
        chosen: phraseList("The beginning and the end is Nu.", "All paths meet here.", "Time folds around this game."),
        play: phraseList("...", "The board shifts.", "This thread now closes."),
        stand: phraseList("All paths lead to Nu.", "I will wait at the end.", "No more movement is required."),
        winRound: phraseList("This outcome was written in the stars.", "As it was.", "One thread remains."),
        loseRound: phraseList("Even infinity contains surprises.", "A temporary divergence.", "The pattern returns."),
        winGame: phraseList("All matches begin with Nu and end with Nu.", "The circle is complete.", "You have arrived where I expected."),
        loseGame: phraseList("Interesting... most interesting.", "A rare branch of fate.", "The ending changed.")
      },
      sources: ["HoloPazaak", "pazaak-world"]
    }
  ];

  // ../../packages/pazaak-engine/dist/menu-preset.js
  var MAIN_MENU_PRESET = {
    brandTitle: "PazaakWorld",
    heroTitle: "PAZAAK",
    heroSubtitle: "The legendary card game from Knights of the Old Republic",
    heroTagline: "First to win 3 sets wins the game. Recover over-20 draws before your turn ends.",
    rulesTitle: "How to Play Pazaak",
    modeCards: [
      {
        key: "ai",
        title: "AI Opponents",
        icon: "robot",
        accent: "orange",
        description: "Practice against AI opponents with different skill levels",
        offlineNotice: "Always available offline",
        requiresAuth: false,
        aiOptions: [
          {
            difficulty: "easy",
            label: "Easy AI",
            tierLabel: "Beginner",
            icon: "seedling",
            tone: "easy"
          },
          {
            difficulty: "hard",
            label: "Hard AI",
            tierLabel: "Advanced",
            icon: "brain",
            tone: "hard"
          },
          {
            difficulty: "professional",
            label: "Professional AI",
            tierLabel: "Expert",
            icon: "crown",
            tone: "professional"
          }
        ]
      },
      {
        key: "quick_match",
        title: "Quick Match",
        icon: "bolt",
        accent: "republic",
        description: "Find random opponents based on your skill level",
        offlineNotice: "Requires internet connection",
        requiresAuth: true,
        primaryAction: {
          label: "Find Match",
          icon: "search",
          tone: "republic-hyperspace"
        }
      },
      {
        key: "private_lobby",
        title: "Private Lobby",
        icon: "users",
        accent: "hyperspace",
        description: "Create or join private games with friends",
        offlineNotice: "Requires internet connection",
        requiresAuth: true,
        primaryAction: {
          label: "Create Lobby",
          icon: "plus",
          tone: "hyperspace-purple"
        },
        secondaryAction: {
          label: "Join Lobby",
          icon: "signin",
          tone: "outline-hyperspace"
        }
      }
    ],
    /**
     * Rules shown on the landing page. Sourced from the authoritative rulebook so
     * the marketing copy and the in-game rulebook never drift.
     */
    rules: [
      {
        title: "Objective",
        body: PAZAAK_RULEBOOK.basics[0]?.body ?? "Pull cards to get as close to 20 as possible without going over.",
        icon: "target",
        accent: "republic"
      },
      {
        title: "Cards",
        body: `Side decks hold ${PAZAAK_RULEBOOK.deckLimits.sideDeckSize} cards; you draw a ${PAZAAK_RULEBOOK.deckLimits.handSize}-card hand once per match. Every side card is spent on use.`,
        icon: "layers",
        accent: "hyperspace"
      },
      {
        title: "Strategy",
        body: PAZAAK_RULEBOOK.strategy[0]?.body ?? "Save recovery cards for busts and gold cards for exact-20 finishes.",
        icon: "star",
        accent: "yellow"
      }
    ]
  };

  // ../../packages/pazaak-engine/dist/index.js
  var randomUuid = () => {
    const c = globalThis.crypto;
    if (c && typeof c.randomUUID === "function") {
      return c.randomUUID();
    }
    throw new Error("crypto.randomUUID is not available in this runtime.");
  };
  var PAZAAK_GAME_MODES = Object.freeze(["canonical", "wacky"]);
  var DEFAULT_PAZAAK_GAME_MODE = "canonical";
  var isPazaakGameMode = (value) => {
    return value === "canonical" || value === "wacky";
  };
  var normalizePazaakGameMode = (value) => {
    return isPazaakGameMode(value) ? value : DEFAULT_PAZAAK_GAME_MODE;
  };
  var SIDE_DECK_SIZE = 10;
  var HAND_SIZE = 4;
  var MAX_BOARD_SIZE = 9;
  var WIN_SCORE = 20;
  var SETS_TO_WIN = 3;
  var MAX_CONSECUTIVE_TIES = 5;
  var getAiThinkingDelayMs = (difficulty, random = Math.random) => {
    switch (difficulty) {
      case "easy":
        return 1e3 + Math.floor(random() * 2e3);
      case "hard":
        return 2e3 + Math.floor(random() * 3e3);
      case "professional":
        return 1500 + Math.floor(random() * 2500);
    }
  };
  var sideCardTemplates = [
    // Plus cards (+1 through +6)
    { id: "plus1", label: "+1", value: 1, type: "plus" },
    { id: "plus2", label: "+2", value: 2, type: "plus" },
    { id: "plus3", label: "+3", value: 3, type: "plus" },
    { id: "plus4", label: "+4", value: 4, type: "plus" },
    { id: "plus5", label: "+5", value: 5, type: "plus" },
    { id: "plus6", label: "+6", value: 6, type: "plus" },
    // Minus cards (−1 through −6)
    { id: "minus1", label: "-1", value: 1, type: "minus" },
    { id: "minus2", label: "-2", value: 2, type: "minus" },
    { id: "minus3", label: "-3", value: 3, type: "minus" },
    { id: "minus4", label: "-4", value: 4, type: "minus" },
    { id: "minus5", label: "-5", value: 5, type: "minus" },
    { id: "minus6", label: "-6", value: 6, type: "minus" },
    // Flip cards (±1 through ±6)
    { id: "flip1", label: "\xB11", value: 1, type: "flip" },
    { id: "flip2", label: "\xB12", value: 2, type: "flip" },
    { id: "flip3", label: "\xB13", value: 3, type: "flip" },
    { id: "flip4", label: "\xB14", value: 4, type: "flip" },
    { id: "flip5", label: "\xB15", value: 5, type: "flip" },
    { id: "flip6", label: "\xB16", value: 6, type: "flip" },
    // Special cards (canonical TSL)
    { id: "valuechange", label: "\xB11/2", value: 0, type: "value_change" },
    { id: "copyprev", label: "D", value: 0, type: "copy_previous" },
    { id: "tiebreaker", label: "\xB11T", value: 1, type: "tiebreaker" },
    { id: "flip24", label: "Flip 2&4", value: 0, type: "flip_two_four" },
    { id: "flip36", label: "Flip 3&6", value: 0, type: "flip_three_six" },
    // Wacky-only cards — never drawn or accepted in canonical play.
    { id: "mod3", label: "%3", value: 3, type: "mod_previous" },
    { id: "mod4", label: "%4", value: 4, type: "mod_previous" },
    { id: "mod5", label: "%5", value: 5, type: "mod_previous" },
    { id: "mod6", label: "%6", value: 6, type: "mod_previous" },
    { id: "halve", label: "/2", value: 0, type: "halve_previous" },
    { id: "hardreset", label: "00", value: 0, type: "hard_reset" }
  ];
  var cardTypeRequiredMode = {
    plus: "canonical",
    minus: "canonical",
    flip: "canonical",
    value_change: "canonical",
    copy_previous: "canonical",
    tiebreaker: "canonical",
    flip_two_four: "canonical",
    flip_three_six: "canonical",
    mod_previous: "wacky",
    halve_previous: "wacky",
    hard_reset: "wacky"
  };
  var isCardTypeAllowedInMode = (type, mode) => {
    const required = cardTypeRequiredMode[type];
    return mode === "wacky" || required === "canonical";
  };
  var shuffle = (items) => {
    const copy = [...items];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  };
  var cloneCard = (card) => ({ ...card });
  var cardTemplateById = new Map(sideCardTemplates.map((card) => [card.id, card]));
  var sideDeckTokenToTemplateId = {
    "+1": "plus1",
    "+2": "plus2",
    "+3": "plus3",
    "+4": "plus4",
    "+5": "plus5",
    "+6": "plus6",
    "-1": "minus1",
    "-2": "minus2",
    "-3": "minus3",
    "-4": "minus4",
    "-5": "minus5",
    "-6": "minus6",
    "*1": "flip1",
    "*2": "flip2",
    "*3": "flip3",
    "*4": "flip4",
    "*5": "flip5",
    "*6": "flip6",
    "$$": "copyprev",
    F1: "flip24",
    F2: "flip36",
    TT: "tiebreaker",
    VV: "valuechange",
    "%3": "mod3",
    "%4": "mod4",
    "%5": "mod5",
    "%6": "mod6",
    "/2": "halve",
    "00": "hardreset"
  };
  var wackySideDeckTokens = Object.freeze(["%3", "%4", "%5", "%6", "/2", "00"]);
  var CUSTOM_SIDE_DECK_LABEL = "Custom Sideboard";
  var supportedSideDeckTokens = Object.freeze(Object.keys(sideDeckTokenToTemplateId));
  var STANDARD_SIDE_DECK_TOKEN_LIMIT = 4;
  var SPECIAL_SIDE_DECK_TOKEN_LIMIT = 1;
  var specialSideDeckTokens = Object.freeze([
    "$$",
    "TT",
    "F1",
    "F2",
    "VV",
    "%3",
    "%4",
    "%5",
    "%6",
    "/2",
    "00"
  ]);
  var isSpecialSideDeckToken = (token) => {
    return specialSideDeckTokens.includes(token);
  };
  var getCustomSideDeckTokenLimit = (token) => {
    return isSpecialSideDeckToken(token) ? SPECIAL_SIDE_DECK_TOKEN_LIMIT : STANDARD_SIDE_DECK_TOKEN_LIMIT;
  };
  var getCustomSideDeckLimitErrors = (tokens) => {
    const counts = /* @__PURE__ */ new Map();
    for (const token of tokens) {
      counts.set(token, (counts.get(token) ?? 0) + 1);
    }
    return [...counts.entries()].filter(([token, count]) => count > getCustomSideDeckTokenLimit(token)).map(([token, count]) => {
      const limit = getCustomSideDeckTokenLimit(token);
      return `${token} appears ${count} times; custom multiplayer sideboards allow at most ${limit}.`;
    });
  };
  var assertCustomSideDeckTokenLimits = (tokens) => {
    const errors = getCustomSideDeckLimitErrors(tokens);
    if (errors.length > 0) {
      throw new Error(errors.join(" "));
    }
  };
  var normalizeSideDeckToken = (token) => {
    const collapsed = token.trim().replace(/\s+/g, "");
    if (collapsed.length === 0) {
      return void 0;
    }
    if (/^[+][1-6]$/.test(collapsed)) {
      return collapsed;
    }
    if (/^[-−][1-6]$/.test(collapsed)) {
      return `-${collapsed.at(-1)}`;
    }
    if (/^[*][1-6]$/.test(collapsed)) {
      return collapsed;
    }
    if (/^[±][1-6]$/.test(collapsed)) {
      return `*${collapsed.at(-1)}`;
    }
    if (collapsed === "$$") {
      return "$$";
    }
    if (/^%[3-6]$/.test(collapsed)) {
      return collapsed;
    }
    if (collapsed === "/2") {
      return "/2";
    }
    if (collapsed === "00") {
      return "00";
    }
    switch (collapsed.toUpperCase()) {
      case "D":
        return "$$";
      case "TT":
      case "\xB11T":
        return "TT";
      case "VV":
      case "\xB11/2":
      case "1\xB12":
        return "VV";
      case "F1":
      case "2&4":
      case "2AND4":
      case "2/4":
        return "F1";
      case "F2":
      case "3&6":
      case "3AND6":
      case "3/6":
        return "F2";
      case "MOD3":
        return "%3";
      case "MOD4":
        return "%4";
      case "MOD5":
        return "%5";
      case "MOD6":
        return "%6";
      case "HALVE":
      case "HALF":
        return "/2";
      case "RESET":
      case "HARDRESET":
      case "HARD_RESET":
        return "00";
      default:
        return void 0;
    }
  };
  var canonicalTslSideDecks = [
    { id: 0, label: "PlayerDefault_NOTUSED", cards: ["+1", "+1", "+2", "+2", "+3", "+3", "+4", "+4", "+5", "+5"], supported: true },
    { id: 1, label: "TestAverage_ERASEME", cards: ["+3", "-3", "+4", "-4", "+5", "-5", "+5", "-3", "+4", "-5"], supported: true },
    { id: 2, label: "TestNightmare_ERASEME", cards: ["*6", "+4", "-4", "-2", "+3", "-2", "-3", "+3", "+2", "*1"], supported: true },
    { id: 3, label: "SuperDeck_ERASEME", cards: ["*3", "*3", "*2", "*2", "*4", "*4", "*2", "*2", "*1", "*1"], supported: true },
    { id: 4, label: "DoublesDeck_Testing", cards: ["$$", "$$", "$$", "$$", "$$", "$$", "$$", "$$", "$$", "$$"], supported: true },
    { id: 5, label: "FlipOneDeck_Testing", cards: ["F1", "F1", "F1", "F1", "F1", "F1", "F1", "F1", "F1", "F1"], supported: true },
    { id: 6, label: "FlipTwoDeck_Testing", cards: ["F2", "F2", "F2", "F2", "F2", "F2", "F2", "F2", "F2", "F2"], supported: true },
    { id: 7, label: "TieBreakerDeck_Testing", cards: ["TT", "TT", "TT", "TT", "TT", "TT", "TT", "TT", "TT", "TT"], supported: true },
    { id: 8, label: "ValueChangeDeck_Testing", cards: ["VV", "VV", "VV", "VV", "VV", "VV", "VV", "VV", "VV", "VV"], supported: true },
    { id: 9, label: "DeckFromHell_Testing", cards: ["$$", "$$", "F1", "F1", "F2", "F2", "TT", "TT", "VV", "VV"], supported: true },
    { id: 10, label: "Kotor2_Deck_VeryEasy", cards: ["+3", "-3", "+4", "-4", "+5", "-5", "+5", "-3", "+4", "-5"], supported: true },
    { id: 11, label: "Kotor2_Deck_Easy", cards: ["+1", "+2", "+3", "+4", "+5", "-6", "-4", "-3", "-2", "-1"], supported: true },
    { id: 12, label: "Kotor2_Deck_Average", cards: ["*1", "*2", "+3", "+4", "+5", "+6", "*5", "-6", "*4", "$$"], supported: true },
    { id: 13, label: "Kotor2_Deck_Hard", cards: ["F1", "F2", "*4", "*6", "$$", "TT", "VV", "*3", "*6", "F1"], supported: true },
    { id: 14, label: "Kotor2_Deck_VeryHard", cards: ["$$", "$$", "F1", "F1", "F2", "F2", "TT", "TT", "VV", "VV"], supported: true }
  ];
  var supportedRuntimeSideDecks = canonicalTslSideDecks.filter((deck) => deck.id >= 10 && deck.supported);
  var getCanonicalSideDeckDefinition = (deckId) => {
    return canonicalTslSideDecks.find((deck) => deck.id === deckId);
  };
  var isCanonicalSideDeckSupported = (deckId) => {
    return getCanonicalSideDeckDefinition(deckId)?.supported ?? false;
  };
  var buildCanonicalSideDeck = (definition) => {
    return definition.cards.map((token, index) => {
      const templateId = sideDeckTokenToTemplateId[token];
      if (!templateId) {
        throw new Error(`Unsupported canonical Pazaak deck token: ${token}`);
      }
      const template = cardTemplateById.get(templateId);
      if (!template) {
        throw new Error(`Missing side-card template for token ${token} (${templateId}).`);
      }
      return { ...template, id: `${template.id}_${definition.id}_${index}` };
    });
  };
  var createCanonicalSideDeck = (deckId) => {
    const definition = getCanonicalSideDeckDefinition(deckId);
    if (!definition) {
      throw new Error(`Unknown canonical TSL side deck id: ${deckId}`);
    }
    if (!definition.supported) {
      throw new Error(`Canonical TSL side deck ${deckId} is not supported by the current engine.`);
    }
    return {
      sideDeckId: definition.id,
      sideDeckLabel: definition.label,
      sideDeck: buildCanonicalSideDeck(definition)
    };
  };
  var createCustomSideDeck = (choice) => {
    if (choice.tokens.length !== SIDE_DECK_SIZE) {
      throw new Error(`Custom sideboards must contain exactly ${SIDE_DECK_SIZE} cards.`);
    }
    const mode = choice.gameMode ?? DEFAULT_PAZAAK_GAME_MODE;
    const normalizedTokens = [];
    const sideDeck = choice.tokens.map((token, index) => {
      const normalizedToken = normalizeSideDeckToken(token);
      if (!normalizedToken) {
        throw new Error(`Unsupported custom Pazaak token: ${token}`);
      }
      normalizedTokens.push(normalizedToken);
      const templateId = sideDeckTokenToTemplateId[normalizedToken];
      const template = templateId ? cardTemplateById.get(templateId) : void 0;
      if (!template) {
        throw new Error(`Missing side-card template for custom token ${token}.`);
      }
      if (!isCardTypeAllowedInMode(template.type, mode)) {
        throw new Error(`Token ${normalizedToken} is a Wacky-mode-only card and cannot be used in a ${mode} sideboard.`);
      }
      return { ...template, id: `${template.id}_custom_${index}` };
    });
    if (choice.enforceTokenLimits) {
      assertCustomSideDeckTokenLimits(normalizedTokens);
    }
    return {
      sideDeckId: null,
      sideDeckLabel: choice.label?.trim() || CUSTOM_SIDE_DECK_LABEL,
      sideDeck
    };
  };
  var drawSideDeck = (deckChoice) => {
    if (typeof deckChoice === "number") {
      return createCanonicalSideDeck(deckChoice);
    }
    if (deckChoice) {
      return createCustomSideDeck(deckChoice);
    }
    const definition = supportedRuntimeSideDecks[Math.floor(Math.random() * supportedRuntimeSideDecks.length)];
    if (!definition) {
      throw new Error("No supported canonical TSL side decks are available.");
    }
    return {
      sideDeckId: definition.id,
      sideDeckLabel: definition.label,
      sideDeck: buildCanonicalSideDeck(definition)
    };
  };
  var drawHandFromSideDeck = (sideDeck) => {
    return shuffle(sideDeck).slice(0, HAND_SIZE).map(cloneCard);
  };
  var buildMainDeck = () => {
    const deck = [];
    for (let value = 1; value <= 10; value += 1) {
      for (let copy = 0; copy < 4; copy += 1) {
        deck.push(value);
      }
    }
    return shuffle(deck);
  };
  var createPlayerState = (userId, displayName, deckChoice) => {
    const { sideDeckId, sideDeckLabel, sideDeck } = drawSideDeck(deckChoice);
    return {
      userId,
      displayName,
      roundWins: 0,
      sideDeckId,
      sideDeckLabel,
      sideDeck,
      hand: drawHandFromSideDeck(sideDeck),
      usedCardIds: /* @__PURE__ */ new Set(),
      board: [],
      sideCardsPlayed: [],
      total: 0,
      stood: false,
      hasTiebreaker: false
    };
  };
  var formatSignedValue = (value) => {
    return value > 0 ? `+${value}` : `${value}`;
  };
  var playerAt = (match, index) => {
    return match.players[index];
  };
  var getCurrentPlayer = (match) => {
    return playerAt(match, match.activePlayerIndex);
  };
  var getPlayerForUser = (match, userId) => {
    return match.players.find((player) => player.userId === userId);
  };
  var getOpponentForUser = (match, userId) => {
    return match.players.find((player) => player.userId !== userId);
  };
  var getSideCardOptionsForPlayer = (player) => {
    const options = [];
    const previousBoardValue = player.board.at(-1)?.value;
    const previousBoardLabel = previousBoardValue === void 0 ? "D (needs a previous card)" : `D (= ${formatSignedValue(previousBoardValue)})`;
    for (const card of player.hand) {
      if (player.usedCardIds.has(card.id)) {
        continue;
      }
      switch (card.type) {
        case "plus":
          options.push({
            cardId: card.id,
            displayLabel: `Play +${card.value}`,
            appliedValue: card.value
          });
          break;
        case "minus":
          options.push({
            cardId: card.id,
            displayLabel: `Play -${card.value}`,
            appliedValue: -card.value
          });
          break;
        case "flip":
          options.push({ cardId: card.id, displayLabel: `Play +${card.value}`, appliedValue: card.value }, { cardId: card.id, displayLabel: `Play -${card.value}`, appliedValue: -card.value });
          break;
        case "value_change":
          options.push({ cardId: card.id, displayLabel: "Play +1", appliedValue: 1 }, { cardId: card.id, displayLabel: "Play +2", appliedValue: 2 }, { cardId: card.id, displayLabel: "Play -1", appliedValue: -1 }, { cardId: card.id, displayLabel: "Play -2", appliedValue: -2 });
          break;
        case "copy_previous":
          if (previousBoardValue !== void 0) {
            options.push({ cardId: card.id, displayLabel: `Play ${previousBoardLabel}`, appliedValue: previousBoardValue });
          }
          break;
        case "tiebreaker":
          options.push({ cardId: card.id, displayLabel: "Play +1T", appliedValue: 1 }, { cardId: card.id, displayLabel: "Play -1T", appliedValue: -1 });
          break;
        case "flip_two_four":
          options.push({ cardId: card.id, displayLabel: "Play Flip 2&4", appliedValue: 0 });
          break;
        case "flip_three_six":
          options.push({ cardId: card.id, displayLabel: "Play Flip 3&6", appliedValue: 0 });
          break;
        case "mod_previous":
          if (previousBoardValue !== void 0 && card.value > 0) {
            const remainder = modPythonStyle(previousBoardValue, card.value);
            options.push({
              cardId: card.id,
              displayLabel: `Play %${card.value} (= ${formatSignedValue(remainder)})`,
              appliedValue: remainder
            });
          }
          break;
        case "halve_previous":
          if (previousBoardValue !== void 0) {
            const halved = Math.trunc(previousBoardValue / 2);
            options.push({
              cardId: card.id,
              displayLabel: `Play /2 (= ${formatSignedValue(halved)})`,
              appliedValue: halved
            });
          }
          break;
        case "hard_reset":
          options.push({
            cardId: card.id,
            displayLabel: "Play 00 (force-tie the set)",
            appliedValue: 0
          });
          break;
      }
    }
    return options;
  };
  var modPythonStyle = (value, modulus) => {
    if (modulus === 0) {
      return 0;
    }
    return (value % modulus + modulus) % modulus;
  };
  var getAdvisorSnapshotForPlayer = (match, userId, difficulty = "professional") => {
    if (match.phase === "completed") {
      return null;
    }
    const player = getPlayerForUser(match, userId);
    if (!player || player.stood) {
      return null;
    }
    const currentPlayer = getCurrentPlayer(match);
    if (currentPlayer.userId !== userId) {
      return null;
    }
    const opponent = getOpponentForUser(match, userId);
    if (!opponent) {
      return null;
    }
    const matchContext = getAdvisorMatchContext(player, opponent, getMatchSetsToWin(match));
    if (match.phase === "turn") {
      return {
        recommendation: {
          action: "draw",
          rationale: "You have not drawn yet. The next decision window only opens after a main-deck draw."
        },
        difficulty,
        category: "neutral",
        confidence: "high",
        bustProbability: calculateBustProbability(player.total, match.mainDeck),
        alternatives: []
      };
    }
    const cardOptions = getSideCardOptionsForPlayer(player);
    const currentBustProbability = calculateBustProbability(player.total, match.mainDeck);
    const beneficialOptions = cardOptions.map((option) => evaluateAdvisorOption(player, opponent, option, currentBustProbability, match.mainDeck)).filter((option) => option !== null).sort((left, right) => right.score - left.score);
    const bestOption = beneficialOptions[0] ?? null;
    const hasRecoveryOption = beneficialOptions.some((option) => option.total <= WIN_SCORE && option.total < player.total);
    const alternatives = beneficialOptions.slice(0, 3).map((option) => ({
      displayLabel: option.option.displayLabel,
      rationale: option.rationale,
      category: option.category,
      score: option.score
    }));
    if (player.total > WIN_SCORE) {
      if (match.phase === "after-draw" && bestOption) {
        return {
          recommendation: {
            action: "play_side",
            cardId: bestOption.option.cardId,
            appliedValue: bestOption.option.appliedValue,
            displayLabel: bestOption.option.displayLabel,
            rationale: `${bestOption.rationale} You are currently over ${WIN_SCORE}, so this recovery has to happen before ending the turn.`
          },
          difficulty,
          category: "recovery",
          confidence: "high",
          bustProbability: 1,
          alternatives
        };
      }
      return {
        recommendation: {
          action: "end_turn",
          rationale: `No safe recovery card is available. Ending the turn confirms the bust at ${player.total}.`
        },
        difficulty,
        category: "recovery",
        confidence: "high",
        bustProbability: 1,
        alternatives
      };
    }
    if (match.phase === "after-draw" && player.board.length === MAX_BOARD_SIZE - 1 && bestOption) {
      return {
        recommendation: {
          action: "play_side",
          cardId: bestOption.option.cardId,
          appliedValue: bestOption.option.appliedValue,
          displayLabel: bestOption.option.displayLabel,
          rationale: `${bestOption.rationale} More importantly, any safe side-card play here fills your ninth slot and wins the set immediately.`
        },
        difficulty,
        category: "pressure",
        confidence: "high",
        bustProbability: currentBustProbability,
        alternatives
      };
    }
    if (match.phase === "after-draw" && bestOption && shouldPlayRecommendedOption(player, opponent, bestOption, difficulty, matchContext)) {
      return {
        recommendation: {
          action: "play_side",
          cardId: bestOption.option.cardId,
          appliedValue: bestOption.option.appliedValue,
          displayLabel: bestOption.option.displayLabel,
          rationale: bestOption.rationale
        },
        difficulty,
        category: bestOption.category,
        confidence: getAdvisorConfidence(bestOption.score),
        bustProbability: currentBustProbability,
        alternatives
      };
    }
    if (shouldStandForAdvisor(player, opponent, difficulty, currentBustProbability, hasRecoveryOption, matchContext)) {
      return {
        recommendation: {
          action: "stand",
          rationale: buildStandRationale(player, opponent, currentBustProbability, hasRecoveryOption, matchContext)
        },
        difficulty,
        category: opponent.stood ? "pressure" : "neutral",
        confidence: currentBustProbability >= 0.7 || player.total >= 18 ? "high" : "medium",
        bustProbability: currentBustProbability,
        alternatives
      };
    }
    return {
      recommendation: {
        action: "end_turn",
        rationale: buildEndTurnRationale(player, opponent, difficulty, bestOption, matchContext)
      },
      difficulty,
      category: bestOption?.category ?? "neutral",
      confidence: bestOption ? getAdvisorConfidence(Math.max(0, bestOption.score - 80)) : "medium",
      bustProbability: currentBustProbability,
      alternatives
    };
  };
  var resetPlayerForSet = (player) => {
    player.board = [];
    player.sideCardsPlayed = [];
    player.total = 0;
    player.stood = false;
    player.hasTiebreaker = false;
  };
  var normalizeSetsToWin = (value) => {
    if (!Number.isFinite(value)) {
      return SETS_TO_WIN;
    }
    return Math.max(1, Math.min(9, Math.trunc(value)));
  };
  var getMatchSetsToWin = (match) => {
    return normalizeSetsToWin(match.setsToWin);
  };
  var evaluateAdvisorOption = (player, opponent, option, currentBustProbability, remainingDeck) => {
    const card = player.hand.find((entry) => entry.id === option.cardId);
    if (!card) {
      return null;
    }
    const simulation = simulateAdvisorSideCard(player, option, card.type);
    const nextBustProbability = calculateBustProbability(simulation.total, remainingDeck);
    const previousBoardValue = player.board.at(-1)?.value;
    if (simulation.total > WIN_SCORE) {
      return null;
    }
    let score = simulation.total * 10 - nextBustProbability * 15;
    let rationale = `${option.displayLabel} moves your total to ${simulation.total}.`;
    let category = "neutral";
    if (simulation.total === WIN_SCORE) {
      score += 1e3;
      category = "exact";
      rationale = `${option.displayLabel} lands exactly on ${WIN_SCORE}, which is the cleanest finish available.`;
    } else if (opponent.stood && simulation.total > opponent.total) {
      score += 900;
      category = "pressure";
      rationale = `${option.displayLabel} moves you past ${opponent.displayName}'s standing ${opponent.total}.`;
    } else if (opponent.stood && simulation.total === opponent.total && simulation.usesTiebreaker) {
      score += 880;
      category = "pressure";
      rationale = `${option.displayLabel} ties ${opponent.displayName} at ${simulation.total} while giving you the Tiebreaker edge.`;
    } else if (simulation.total > player.total) {
      score += 120;
      category = simulation.total >= 16 ? "setup" : "neutral";
      rationale = simulation.total >= 16 ? `${option.displayLabel} sets you up on ${simulation.total}, which keeps live pressure on the next draw.` : `${option.displayLabel} improves your board without putting you over ${WIN_SCORE}.`;
    } else if (simulation.total < player.total) {
      score += 40;
      category = "recovery";
      rationale = `${option.displayLabel} is a recovery play that lowers your total to a safer ${simulation.total}.`;
    }
    if (category === "recovery" && currentBustProbability >= 0.5) {
      score += 140;
    }
    if (category === "setup" && player.total <= 15 && simulation.total >= 16 && simulation.total <= 18) {
      score += 110;
    }
    if (card.type === "tiebreaker" && (simulation.total >= 18 || opponent.stood)) {
      score += 85;
      if (category === "neutral" || category === "setup") {
        rationale = `${option.displayLabel} keeps the Tiebreaker live, so a tied stand still breaks your way.`;
      }
    }
    if (card.type === "copy_previous") {
      if (simulation.total === player.total) {
        score -= 120;
        rationale = `${option.displayLabel} only copies a neutral 0 right now, so it spends D without changing the board.`;
      } else if (previousBoardValue !== void 0 && previousBoardValue < 0) {
        score += 130;
        category = category === "pressure" ? category : "recovery";
        rationale = `${option.displayLabel} copies your last ${formatSignedValue(previousBoardValue)}, which gives D a clean recovery line here.`;
      } else if (previousBoardValue !== void 0 && previousBoardValue > 0 && simulation.total >= 17 && simulation.total < WIN_SCORE) {
        score += 75;
        if (category === "neutral") {
          category = "setup";
        }
        rationale = `${option.displayLabel} repeats your last ${formatSignedValue(previousBoardValue)} to build a stronger standing total.`;
      }
    }
    if (card.type === "value_change") {
      if (category === "exact") {
        score += 60;
        rationale = `${option.displayLabel} uses VV as a precise ${formatSignedValue(option.appliedValue)} to land exactly on ${WIN_SCORE}.`;
      } else if (option.appliedValue < 0 && currentBustProbability >= 0.5) {
        score += 95;
        category = category === "pressure" ? category : "recovery";
        rationale = `${option.displayLabel} turns VV into a recovery tool and cuts your next-draw bust risk to ${Math.round(nextBustProbability * 100)}%.`;
      } else if (option.appliedValue > 0 && simulation.total >= 17 && simulation.total < WIN_SCORE) {
        score += 65;
        if (category === "neutral") {
          category = "setup";
        }
        rationale = `${option.displayLabel} uses VV as a flexible push to ${simulation.total} without committing a larger fixed card.`;
      }
    }
    if (card.type === "flip_two_four" || card.type === "flip_three_six") {
      if (simulation.flippedCards === 0) {
        score -= 160;
        rationale = `${option.displayLabel} does not meaningfully change the current board, so it is a weak use of the card.`;
      } else if (simulation.total < player.total) {
        score += 70 + simulation.flippedCards * 55;
        if (currentBustProbability >= 0.5) {
          score += 80;
        }
        category = category === "exact" || category === "pressure" ? category : "recovery";
        rationale = `${option.displayLabel} flips ${simulation.flippedCards} live board card${simulation.flippedCards === 1 ? "" : "s"} and drops you to ${simulation.total}, which is a strong special-card recovery line.`;
      } else {
        score += 40 + simulation.flippedCards * 45;
        if (simulation.total >= 17 && simulation.total <= WIN_SCORE) {
          score += 55;
        }
        if (category === "neutral") {
          category = simulation.total >= 16 ? "setup" : "neutral";
        }
        rationale = `${option.displayLabel} flips ${simulation.flippedCards} live board card${simulation.flippedCards === 1 ? "" : "s"} and improves your pressure total to ${simulation.total}.`;
      }
    }
    if (card.type === "mod_previous") {
      const prev = previousBoardValue ?? 0;
      const absPrev = Math.abs(prev);
      if (player.total > WIN_SCORE && simulation.total <= WIN_SCORE) {
        score += 220;
        category = "recovery";
        rationale = `${option.displayLabel} bleeds the previous ${formatSignedValue(prev)} down to ${formatSignedValue(option.appliedValue)}, saving the board from a bust.`;
      } else if (prev !== 0 && simulation.total === WIN_SCORE) {
        score += 110;
      } else if (absPrev >= 4 && simulation.total <= player.total) {
        score += 90;
        if (category === "neutral") {
          category = "recovery";
        }
        rationale = `${option.displayLabel} carves ${formatSignedValue(prev)} down to ${formatSignedValue(option.appliedValue)}, a strong wacky recovery line.`;
      } else if (absPrev < 2) {
        score -= 100;
        rationale = `${option.displayLabel} only trims a tiny previous card, so it barely moves the board.`;
      }
    }
    if (card.type === "halve_previous") {
      const prev = previousBoardValue ?? 0;
      const absPrev = Math.abs(prev);
      if (player.total > WIN_SCORE && simulation.total <= WIN_SCORE) {
        score += 210;
        category = "recovery";
        rationale = `${option.displayLabel} halves the previous ${formatSignedValue(prev)} to ${formatSignedValue(option.appliedValue)} and unbusts the board.`;
      } else if (absPrev >= 4 && simulation.total <= player.total) {
        score += 80;
        if (category === "neutral") {
          category = "recovery";
        }
        rationale = `${option.displayLabel} cuts the previous ${formatSignedValue(prev)} in half, shaving your total to ${simulation.total}.`;
      } else if (absPrev < 2) {
        score -= 90;
        rationale = `${option.displayLabel} barely changes the board \u2014 halving a tiny previous card is a poor use of the card.`;
      }
    }
    if (card.type === "hard_reset") {
      const setsToWin = 3;
      const playerOnMatchPoint = player.roundWins >= setsToWin - 1;
      const opponentOnMatchPoint = opponent.roundWins >= setsToWin - 1;
      const setIsLost = opponent.stood && player.total < opponent.total && !player.hasTiebreaker;
      if (opponentOnMatchPoint && (setIsLost || player.total < 14)) {
        score += 250;
        category = "pressure";
        rationale = `${option.displayLabel} wipes a set the opponent is about to close out \u2014 burning the turn is better than handing them match point.`;
      } else if (setIsLost && !playerOnMatchPoint) {
        score += 110;
        category = "pressure";
        rationale = `${option.displayLabel} salvages a lost set by re-opening it; you spend the card but avoid giving up the round.`;
      } else {
        score -= 200;
        rationale = `${option.displayLabel} would waste the set; the advisor only reaches for 00 when the round is already gone.`;
      }
    }
    return {
      option,
      score,
      total: simulation.total,
      usesTiebreaker: simulation.usesTiebreaker,
      category,
      rationale
    };
  };
  var simulateAdvisorSideCard = (player, option, sourceType) => {
    if (sourceType === "hard_reset") {
      return {
        total: 0,
        usesTiebreaker: player.hasTiebreaker,
        totalDelta: -player.total,
        flippedCards: 0
      };
    }
    if (sourceType === "mod_previous" || sourceType === "halve_previous") {
      const prev = player.board.at(-1)?.value ?? 0;
      const delta = option.appliedValue - prev;
      return {
        total: player.total + delta,
        usesTiebreaker: player.hasTiebreaker,
        totalDelta: delta,
        flippedCards: 0
      };
    }
    if (sourceType !== "flip_two_four" && sourceType !== "flip_three_six") {
      return {
        total: player.total + option.appliedValue,
        usesTiebreaker: sourceType === "tiebreaker" || player.hasTiebreaker,
        totalDelta: option.appliedValue,
        flippedCards: 0
      };
    }
    const targets = sourceType === "flip_two_four" ? [2, 4] : [3, 6];
    let totalDelta = 0;
    let flippedCards = 0;
    for (const boardCard of player.board) {
      const isFlippable = !boardCard.frozen && (boardCard.source === void 0 || boardCard.source === "plus" || boardCard.source === "minus");
      if (isFlippable && targets.includes(boardCard.value)) {
        totalDelta += -2 * boardCard.value;
        flippedCards += 1;
      }
    }
    return {
      total: player.total + totalDelta,
      usesTiebreaker: player.hasTiebreaker,
      totalDelta,
      flippedCards
    };
  };
  var shouldPlayRecommendedOption = (player, opponent, option, difficulty, matchContext) => {
    if (player.board.length === MAX_BOARD_SIZE - 1 && option.total <= WIN_SCORE) {
      return true;
    }
    if (option.total === WIN_SCORE) {
      return true;
    }
    if (opponent.stood && option.total > opponent.total) {
      return true;
    }
    if (opponent.stood && option.total === opponent.total && option.usesTiebreaker) {
      return true;
    }
    switch (difficulty) {
      case "easy":
        return player.total > WIN_SCORE - 3 && option.total >= player.total;
      case "hard":
        return option.category === "exact" || option.category === "pressure" || matchContext.opponentOnMatchPoint && option.total >= 17 || option.category === "recovery" && player.total >= 18 || option.total >= 17 || option.total > player.total;
      case "professional":
        return option.category === "exact" || option.category === "pressure" || matchContext.opponentOnMatchPoint && option.total >= 16 || option.category === "recovery" && (player.total >= 18 || option.score >= 220) || option.category === "setup" && option.score >= 250 || matchContext.trailingMatch && option.category === "setup" && option.total >= 16 || option.score >= 320;
    }
  };
  var shouldStandForAdvisor = (player, opponent, difficulty, bustProbability, hasRecoveryOption, matchContext) => {
    if (player.total > WIN_SCORE) {
      return false;
    }
    if (player.total >= WIN_SCORE) {
      return true;
    }
    if (player.board.length === MAX_BOARD_SIZE - 1 && hasRecoveryOption) {
      return false;
    }
    if (opponent.stood) {
      if (player.total > opponent.total) {
        return true;
      }
      if (player.total === opponent.total && player.hasTiebreaker) {
        return true;
      }
    }
    switch (difficulty) {
      case "easy":
        if (matchContext.opponentOnMatchPoint && player.total <= 18)
          return false;
        return player.total >= 17;
      case "hard":
        if (matchContext.opponentOnMatchPoint && player.total <= 17)
          return false;
        if (player.total >= 19)
          return true;
        if (matchContext.playerOnMatchPoint && player.total >= 17 && bustProbability >= 0.4)
          return true;
        if (player.total >= 17 && (bustProbability >= 0.5 || !hasRecoveryOption))
          return true;
        return false;
      case "professional":
        if (player.total <= 14)
          return false;
        if (matchContext.opponentOnMatchPoint && player.total <= 17 && hasRecoveryOption)
          return false;
        if (player.total >= 18)
          return true;
        if (matchContext.playerOnMatchPoint && player.total >= 17 && bustProbability >= 0.4)
          return true;
        if (matchContext.leadingMatch && player.total >= 17 && bustProbability >= 0.5)
          return true;
        if (bustProbability > 0.7)
          return true;
        if (!hasRecoveryOption && player.total >= 17)
          return true;
        return false;
    }
  };
  var buildStandRationale = (player, opponent, bustProbability, hasRecoveryOption, matchContext) => {
    if (player.total >= WIN_SCORE) {
      return `Stand now. You are already sitting on ${player.total}.`;
    }
    if (opponent.stood && player.total > opponent.total) {
      return `Stand now. ${player.total} already beats ${opponent.displayName}'s standing ${opponent.total}.`;
    }
    if (opponent.stood && player.total === opponent.total && player.hasTiebreaker) {
      return `Stand now. You are tied at ${player.total}, but your Tiebreaker should carry the set.`;
    }
    if (matchContext.playerOnMatchPoint && player.total >= 17) {
      return `Stand now. You are one set from winning the match, so ${player.total} is strong enough to protect the lead.`;
    }
    if (matchContext.leadingMatch && player.total >= 17 && bustProbability >= 0.5) {
      return `Stand now. You are already ahead in sets, so there is no reason to overextend from ${player.total}.`;
    }
    if (!hasRecoveryOption && player.total >= 17) {
      return `Stand now. ${player.total} is solid and your remaining hand does not offer much recovery if the next draw goes bad.`;
    }
    return `Stand now. At ${player.total}, the bust pressure on another draw is about ${Math.round(bustProbability * 100)}%.`;
  };
  var buildEndTurnRationale = (player, opponent, difficulty, bestOption, matchContext) => {
    if (player.total > WIN_SCORE) {
      return `End the turn only if you accept the bust. You are at ${player.total}, so a recovery side card is the only way out.`;
    }
    if (opponent.stood && player.total < opponent.total) {
      return `End the turn if you want to keep pressing later. You still trail ${opponent.displayName}'s ${opponent.total}, so standing here would probably concede the set.`;
    }
    if (matchContext.opponentOnMatchPoint && player.total <= 17) {
      return `End the turn only if you need to keep pushing later. You are trailing the match, so this set still needs a more aggressive finish.`;
    }
    if (player.board.length === MAX_BOARD_SIZE - 1) {
      return `End the turn only if your remaining hand cannot safely finish the ninth slot. One more safe card would auto-win the set.`;
    }
    if (bestOption && difficulty === "easy") {
      return `End the turn. ${bestOption.option.displayLabel} is playable, but a safer line is to preserve your hand and revisit the board next turn.`;
    }
    if (bestOption && bestOption.category === "setup") {
      return `End the turn. ${bestOption.option.displayLabel} would improve your shape, but the advisor is holding it for a stronger timing window.`;
    }
    return `End the turn. ${player.total} is not strong enough to lock in yet, but there is no immediate side-card finish worth committing to.`;
  };
  var calculateBustProbability = (currentScore, remainingDeck) => {
    return getBustProbability(currentScore, remainingDeck);
  };
  var getAdvisorMatchContext = (player, opponent, setsToWin = SETS_TO_WIN) => ({
    playerOnMatchPoint: player.roundWins >= setsToWin - 1,
    opponentOnMatchPoint: opponent.roundWins >= setsToWin - 1,
    leadingMatch: player.roundWins > opponent.roundWins,
    trailingMatch: player.roundWins < opponent.roundWins
  });
  var getAdvisorConfidence = (score) => {
    if (score >= 700) {
      return "high";
    }
    if (score >= 250) {
      return "medium";
    }
    return "low";
  };
  var serializePlayer = (player) => ({
    ...player,
    usedCardIds: [...player.usedCardIds]
  });
  var deserializePlayer = (data) => ({
    ...data,
    usedCardIds: new Set(data.usedCardIds),
    sideDeckId: data.sideDeckId ?? null,
    sideDeckLabel: data.sideDeckLabel ?? null,
    sideDeck: data.sideDeck ?? [],
    hasTiebreaker: data.hasTiebreaker ?? false
  });
  var serializeMatch = (match) => ({
    ...match,
    players: [serializePlayer(match.players[0]), serializePlayer(match.players[1])]
  });
  var deserializeMatch = (data) => ({
    ...data,
    players: [deserializePlayer(data.players[0]), deserializePlayer(data.players[1])],
    spectatorMirrors: data.spectatorMirrors ?? (data.spectatorMessageIds ?? []).map((messageId) => ({ messageId, ownerId: "" })),
    initialStarterIndex: data.initialStarterIndex ?? 0,
    setsToWin: normalizeSetsToWin(data.setsToWin),
    gameMode: normalizePazaakGameMode(data.gameMode),
    lastSetWinnerIndex: data.lastSetWinnerIndex ?? null,
    consecutiveTies: data.consecutiveTies ?? 0,
    disconnectedSince: data.disconnectedSince ?? {},
    aiSeats: data.aiSeats ?? {}
  });
  var PazaakCoordinator = class {
    constructor(persistence, options = {}) {
      __publicField(this, "persistence");
      __publicField(this, "options");
      __publicField(this, "pendingChallenges", /* @__PURE__ */ new Map());
      __publicField(this, "matches", /* @__PURE__ */ new Map());
      __publicField(this, "activeMatchIdsByUserId", /* @__PURE__ */ new Map());
      this.persistence = persistence;
      this.options = options;
    }
    async initialize(maxAgeMs = 24 * 60 * 60 * 1e3) {
      if (!this.persistence)
        return;
      const matches = await this.persistence.loadActive(maxAgeMs);
      for (const match of matches) {
        this.matches.set(match.id, match);
        for (const player of match.players) {
          this.activeMatchIdsByUserId.set(player.userId, match.id);
        }
      }
    }
    getActiveMatches() {
      return [...this.matches.values()].filter((m) => m.phase !== "completed");
    }
    createChallenge(input) {
      if (this.activeMatchIdsByUserId.has(input.challengerId) || this.activeMatchIdsByUserId.has(input.challengedId)) {
        throw new Error("One of the players is already in an active match.");
      }
      this.validateChallengeDeckChoice("challenger", input.challengerDeckId, input.challengerCustomDeck);
      this.validateChallengeDeckChoice("challenged", input.challengedDeckId, input.challengedCustomDeck);
      const challenge = {
        id: randomUuid(),
        channelId: input.channelId,
        publicMessageId: null,
        challengerId: input.challengerId,
        challengerName: input.challengerName,
        challengerDeckId: input.challengerDeckId,
        challengerCustomDeck: input.challengerCustomDeck,
        challengedId: input.challengedId,
        challengedName: input.challengedName,
        challengedDeckId: input.challengedDeckId,
        challengedCustomDeck: input.challengedCustomDeck,
        wager: input.wager,
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60 * 1e3
      };
      this.pendingChallenges.set(challenge.id, challenge);
      return challenge;
    }
    getPendingChallenge(challengeId) {
      return this.pendingChallenges.get(challengeId);
    }
    setChallengePublicMessageId(challengeId, messageId) {
      const challenge = this.getRequiredChallenge(challengeId);
      challenge.publicMessageId = messageId;
      return challenge;
    }
    declineChallenge(challengeId, userId) {
      const challenge = this.getRequiredChallenge(challengeId);
      if (challenge.challengedId !== userId && challenge.challengerId !== userId) {
        throw new Error("Only participants can decline or cancel this challenge.");
      }
      this.pendingChallenges.delete(challengeId);
      return challenge;
    }
    acceptChallenge(challengeId, userId, challengedDeckOverride) {
      const challenge = this.getRequiredChallenge(challengeId);
      if (challenge.challengedId !== userId) {
        throw new Error("Only the challenged player can accept this match.");
      }
      if (challenge.expiresAt < Date.now()) {
        this.pendingChallenges.delete(challengeId);
        throw new Error("This challenge has expired.");
      }
      this.pendingChallenges.delete(challengeId);
      if (challengedDeckOverride !== void 0) {
        this.validateChallengeDeckChoice("challenged", typeof challengedDeckOverride === "number" ? challengedDeckOverride : void 0, typeof challengedDeckOverride === "object" ? challengedDeckOverride : void 0);
      }
      const challengedDeckChoice = challengedDeckOverride ?? challenge.challengedCustomDeck ?? challenge.challengedDeckId;
      const p1 = createPlayerState(challenge.challengerId, challenge.challengerName, challenge.challengerCustomDeck ?? challenge.challengerDeckId);
      const p2 = createPlayerState(challenge.challengedId, challenge.challengedName, challengedDeckChoice);
      return this.createMatchFromPlayers({
        channelId: challenge.channelId,
        wager: challenge.wager,
        players: [p1, p2]
      });
    }
    createDirectMatch(input) {
      if (this.activeMatchIdsByUserId.has(input.challengerId) || this.activeMatchIdsByUserId.has(input.opponentId)) {
        throw new Error("One of the players is already in an active match.");
      }
      const gameMode = normalizePazaakGameMode(input.gameMode);
      this.validateChallengeDeckChoice("challenger", typeof input.challengerDeck === "number" ? input.challengerDeck : void 0, typeof input.challengerDeck === "object" ? input.challengerDeck : void 0, gameMode);
      this.validateChallengeDeckChoice("opponent", typeof input.opponentDeck === "number" ? input.opponentDeck : void 0, typeof input.opponentDeck === "object" ? input.opponentDeck : void 0, gameMode);
      const p1 = createPlayerState(input.challengerId, input.challengerName, input.challengerDeck);
      const p2 = createPlayerState(input.opponentId, input.opponentName, input.opponentDeck);
      const aiSeats = input.opponentAiDifficulty ? { [input.opponentId]: input.opponentAiDifficulty } : void 0;
      return this.createMatchFromPlayers({
        channelId: input.channelId,
        wager: input.wager ?? 0,
        players: [p1, p2],
        aiSeats,
        setsToWin: input.setsToWin,
        gameMode,
        matchId: input.matchId
      });
    }
    getMatch(matchId) {
      return this.matches.get(matchId);
    }
    getActiveMatchForUser(userId) {
      const matchId = this.activeMatchIdsByUserId.get(userId);
      return matchId ? this.matches.get(matchId) : void 0;
    }
    setPublicMessageId(matchId, messageId) {
      const match = this.getRequiredMatch(matchId);
      match.publicMessageId = messageId;
      match.updatedAt = Date.now();
      this.safePersist(match);
      return match;
    }
    registerSpectatorMessage(matchId, messageId, ownerId) {
      const match = this.getRequiredMatch(matchId);
      if (!match.spectatorMirrors.some((entry) => entry.messageId === messageId)) {
        match.spectatorMirrors.push({ messageId, ownerId });
        match.updatedAt = Date.now();
        this.safePersist(match);
      }
      return match;
    }
    unregisterSpectatorMessage(matchId, messageId) {
      const match = this.getRequiredMatch(matchId);
      const nextMirrors = match.spectatorMirrors.filter((entry) => entry.messageId !== messageId);
      if (nextMirrors.length !== match.spectatorMirrors.length) {
        match.spectatorMirrors = nextMirrors;
        match.updatedAt = Date.now();
        this.safePersist(match);
      }
      return match;
    }
    markSettled(matchId) {
      const match = this.getRequiredMatch(matchId);
      match.settled = true;
      match.updatedAt = Date.now();
      this.safePersist(match);
      return match;
    }
    draw(matchId, userId) {
      const match = this.getRequiredMatch(matchId);
      const playerIndex = this.requireTurnOwner(match, userId);
      if (match.phase !== "turn") {
        throw new Error("Finish resolving the current draw before drawing again.");
      }
      const player = playerAt(match, playerIndex);
      if (player.stood) {
        throw new Error("Standing players cannot draw additional cards.");
      }
      let drawnCard = match.mainDeck.pop();
      if (drawnCard === void 0) {
        match.mainDeck = buildMainDeck();
        drawnCard = match.mainDeck.pop();
      }
      player.board.push({ value: drawnCard, frozen: false });
      player.total += drawnCard;
      match.pendingDraw = drawnCard;
      match.statusLine = `${player.displayName} draws ${drawnCard}.`;
      this.resetTurnClock(match);
      if (player.total > WIN_SCORE) {
        match.statusLine = `${player.displayName} draws ${drawnCard} and is over ${WIN_SCORE} at ${player.total}. Recover with one side card or end the turn to bust.`;
        match.phase = "after-draw";
        this.safePersist(match);
        return match;
      }
      if (player.board.length >= MAX_BOARD_SIZE) {
        return this.resolveNineCardWin(match, playerIndex);
      }
      match.phase = "after-draw";
      this.safePersist(match);
      return match;
    }
    stand(matchId, userId) {
      const match = this.getRequiredMatch(matchId);
      const playerIndex = this.requireTurnOwner(match, userId);
      if (match.phase !== "after-draw" && match.phase !== "after-card") {
        throw new Error("You must draw before you can stand.");
      }
      const player = playerAt(match, playerIndex);
      if (player.total > WIN_SCORE) {
        throw new Error("You are over 20. Recover with a side card or end the turn to bust.");
      }
      player.stood = true;
      match.pendingDraw = null;
      if (match.players.every((entry) => entry.stood)) {
        return this.resolveStandingTotals(match);
      }
      const nextIndex = this.pickNextActiveIndex(match, playerIndex);
      const nextPlayer = playerAt(match, nextIndex);
      match.activePlayerIndex = nextIndex;
      match.phase = "turn";
      match.statusLine = `${player.displayName} stands on ${player.total}. ${nextPlayer.displayName} remains active.`;
      this.resetTurnClock(match);
      this.safePersist(match);
      return match;
    }
    endTurn(matchId, userId) {
      const match = this.getRequiredMatch(matchId);
      const playerIndex = this.requireTurnOwner(match, userId);
      const player = playerAt(match, playerIndex);
      if (match.phase !== "after-draw" && match.phase !== "after-card") {
        throw new Error("There is no pending draw to end yet.");
      }
      return this.finishTurn(match, playerIndex, `${player.displayName} pockets the current total.`);
    }
    playSideCard(matchId, userId, cardId, appliedValue) {
      const match = this.getRequiredMatch(matchId);
      const playerIndex = this.requireTurnOwner(match, userId);
      if (match.phase !== "after-draw") {
        throw new Error("A side card can only be played while resolving a fresh draw.");
      }
      const player = playerAt(match, playerIndex);
      const card = player.hand.find((entry) => entry.id === cardId);
      if (!card) {
        throw new Error("That side card is not in your current hand.");
      }
      if (player.usedCardIds.has(card.id)) {
        throw new Error("That side card has already been spent this set.");
      }
      if (!isCardTypeAllowedInMode(card.type, match.gameMode)) {
        throw new Error(`${card.label} is a Wacky-only card and cannot be played in a ${match.gameMode} match.`);
      }
      switch (card.type) {
        case "plus":
          if (appliedValue !== card.value)
            throw new Error("Plus cards can only be played at their printed value.");
          break;
        case "minus":
          if (appliedValue !== -card.value)
            throw new Error("Minus cards can only be played at their printed negative value.");
          break;
        case "flip":
          if (Math.abs(appliedValue) !== card.value)
            throw new Error("This card can only be played at its printed magnitude.");
          break;
        case "value_change":
          if (Math.abs(appliedValue) !== 1 && Math.abs(appliedValue) !== 2) {
            throw new Error("VV can only be played as +1, +2, -1, or -2.");
          }
          break;
        case "copy_previous": {
          const previousBoardValue = player.board.at(-1)?.value;
          if (previousBoardValue === void 0) {
            throw new Error("D needs a previous resolved board card before it can be played.");
          }
          if (appliedValue !== previousBoardValue) {
            throw new Error("D can only copy the previous board card's resolved value.");
          }
          break;
        }
        case "tiebreaker":
          if (Math.abs(appliedValue) !== card.value) {
            throw new Error("Tiebreaker can only be played at its printed magnitude.");
          }
          break;
        case "flip_two_four":
        case "flip_three_six":
          break;
        case "mod_previous": {
          const previousBoardValue = player.board.at(-1)?.value;
          if (previousBoardValue === void 0) {
            throw new Error(`${card.label} needs a previous resolved board card before it can be played.`);
          }
          if (card.value <= 0) {
            throw new Error(`${card.label} has an invalid modulus.`);
          }
          const expected = modPythonStyle(previousBoardValue, card.value);
          if (appliedValue !== expected) {
            throw new Error(`${card.label} must be played at the remainder ${expected} (prev ${formatSignedValue(previousBoardValue)} mod ${card.value}).`);
          }
          break;
        }
        case "halve_previous": {
          const previousBoardValue = player.board.at(-1)?.value;
          if (previousBoardValue === void 0) {
            throw new Error(`${card.label} needs a previous resolved board card before it can be played.`);
          }
          const expected = Math.trunc(previousBoardValue / 2);
          if (appliedValue !== expected) {
            throw new Error(`${card.label} must be played at the truncated half ${expected} of the previous card (${formatSignedValue(previousBoardValue)}).`);
          }
          break;
        }
        case "hard_reset":
          if (appliedValue !== 0) {
            throw new Error("00 resolves at 0 and cannot be played with any other value.");
          }
          break;
      }
      player.usedCardIds.add(card.id);
      let summary;
      if (card.type === "flip_two_four" || card.type === "flip_three_six") {
        const targets = card.type === "flip_two_four" ? [2, 4] : [3, 6];
        let totalDelta = 0;
        for (const boardCard of player.board) {
          const src = boardCard.source;
          const isFlippable = src === void 0 || src === "plus" || src === "minus";
          if (!boardCard.frozen && isFlippable && targets.includes(boardCard.value)) {
            const oldVal = boardCard.value;
            boardCard.value = -boardCard.value;
            totalDelta += boardCard.value - oldVal;
          }
        }
        player.board.push({ value: 0, frozen: false, source: card.type });
        player.total += totalDelta;
        player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue: 0 });
        const targetLabel = card.type === "flip_two_four" ? "2&4" : "3&6";
        summary = `${player.displayName} plays Flip ${targetLabel} for 0 \u2014 board adjusted by ${formatSignedValue(totalDelta)}.`;
      } else if (card.type === "hard_reset") {
        player.board.push({ value: 0, frozen: false, source: card.type });
        player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue: 0 });
        summary = `${player.displayName} plays 00 \u2014 the set is immediately wiped and re-opened.`;
        return this.resolveHardReset(match, playerIndex, summary);
      } else if (card.type === "mod_previous" || card.type === "halve_previous") {
        const prevBoardCard = player.board.at(-1);
        if (!prevBoardCard) {
          throw new Error(`${card.label} needs a previous resolved board card before it can be played.`);
        }
        const oldValue = prevBoardCard.value;
        prevBoardCard.value = appliedValue;
        const delta = appliedValue - oldValue;
        player.total += delta;
        player.board.push({ value: 0, frozen: false, source: card.type });
        player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue });
        summary = card.type === "mod_previous" ? `${player.displayName} plays ${card.label} \u2014 previous ${formatSignedValue(oldValue)} becomes ${formatSignedValue(appliedValue)} (${formatSignedValue(delta)}).` : `${player.displayName} plays /2 \u2014 previous ${formatSignedValue(oldValue)} halves to ${formatSignedValue(appliedValue)} (${formatSignedValue(delta)}).`;
      } else {
        if (card.type === "tiebreaker") {
          player.hasTiebreaker = true;
        }
        player.board.push({ value: appliedValue, frozen: false, source: card.type });
        player.total += appliedValue;
        player.sideCardsPlayed.push({ cardId: card.id, label: card.label, appliedValue });
        if (card.type === "copy_previous") {
          summary = `${player.displayName} plays D, copying ${formatSignedValue(appliedValue)}.`;
        } else {
          summary = `${player.displayName} plays ${formatSignedValue(appliedValue)} from the side deck.`;
        }
      }
      if (player.total > WIN_SCORE) {
        return this.resolveBust(match, playerIndex, `${summary} ${player.displayName} busts with ${player.total}.`);
      }
      if (player.board.length >= MAX_BOARD_SIZE) {
        return this.resolveNineCardWin(match, playerIndex);
      }
      match.phase = "after-card";
      match.statusLine = summary;
      this.resetTurnClock(match);
      this.safePersist(match);
      return match;
    }
    forfeit(matchId, userId) {
      const match = this.getRequiredMatch(matchId);
      const playerIndex = this.getParticipantIndex(match, userId);
      const opponentIndex = this.getOpponentIndex(playerIndex);
      const loser = playerAt(match, playerIndex);
      const winner = playerAt(match, opponentIndex);
      return this.completeMatch(match, opponentIndex, `${loser.displayName} forfeits. ${winner.displayName} takes the table.`);
    }
    markDisconnected(userId, at = this.now()) {
      const match = this.getActiveMatchForUser(userId);
      if (!match || match.phase === "completed") {
        return void 0;
      }
      this.getParticipantIndex(match, userId);
      match.disconnectedSince = { ...match.disconnectedSince ?? {}, [userId]: at };
      match.updatedAt = at;
      this.safePersist(match);
      return match;
    }
    markReconnected(userId, at = this.now()) {
      const match = this.getActiveMatchForUser(userId);
      if (!match || !match.disconnectedSince?.[userId]) {
        return match;
      }
      const nextDisconnectedSince = { ...match.disconnectedSince };
      delete nextDisconnectedSince[userId];
      match.disconnectedSince = nextDisconnectedSince;
      match.updatedAt = at;
      this.safePersist(match);
      return match;
    }
    tickDisconnectForfeits(at = this.now()) {
      const disconnectForfeitMs = this.options.disconnectForfeitMs ?? 3e4;
      const updatedMatches = [];
      for (const match of this.getActiveMatches()) {
        for (const player of match.players) {
          const disconnectedAt = match.disconnectedSince?.[player.userId];
          if (disconnectedAt !== void 0 && at - disconnectedAt >= disconnectForfeitMs) {
            updatedMatches.push(this.forfeit(match.id, player.userId));
            break;
          }
        }
      }
      return updatedMatches;
    }
    tickTurnTimers(at = this.now()) {
      const updatedMatches = [];
      for (const match of this.getActiveMatches()) {
        if (match.turnDeadlineAt === void 0 || match.turnDeadlineAt > at) {
          continue;
        }
        const activePlayer = playerAt(match, match.activePlayerIndex);
        try {
          const updated = match.phase === "turn" ? this.drawTimedOutTurn(match, activePlayer.userId) : activePlayer.total > WIN_SCORE ? this.endTurn(match.id, activePlayer.userId) : this.stand(match.id, activePlayer.userId);
          updated.statusLine = `${activePlayer.displayName} timed out. ${updated.statusLine}`;
          updated.updatedAt = at;
          this.safePersist(updated);
          updatedMatches.push(updated);
        } catch {
        }
      }
      return updatedMatches;
    }
    recommendAiMove(matchId, userId, difficulty) {
      const match = this.getRequiredMatch(matchId);
      const aiDifficulty = difficulty ?? match.aiSeats?.[userId] ?? "professional";
      const snapshot = getAdvisorSnapshotForPlayer(match, userId, aiDifficulty);
      if (!snapshot) {
        throw new Error("No AI recommendation is available for that player.");
      }
      const baseMove = {
        rationale: snapshot.recommendation.rationale,
        delayMs: getAiThinkingDelayMs(aiDifficulty),
        difficulty: aiDifficulty
      };
      switch (snapshot.recommendation.action) {
        case "draw":
          return { ...baseMove, action: "draw" };
        case "stand":
          return { ...baseMove, action: "stand" };
        case "end_turn":
          return { ...baseMove, action: "end_turn" };
        case "play_side":
          return {
            ...baseMove,
            action: "play_side",
            cardId: snapshot.recommendation.cardId,
            appliedValue: snapshot.recommendation.appliedValue,
            displayLabel: snapshot.recommendation.displayLabel
          };
      }
    }
    executeAiMove(matchId, userId, difficulty) {
      const move = this.recommendAiMove(matchId, userId, difficulty);
      switch (move.action) {
        case "draw":
          return this.draw(matchId, userId);
        case "stand":
          return this.stand(matchId, userId);
        case "end_turn":
          return this.endTurn(matchId, userId);
        case "play_side": {
          if (move.cardId === void 0 || move.appliedValue === void 0) {
            throw new Error("AI side-card recommendation is missing card details.");
          }
          return this.playSideCard(matchId, userId, move.cardId, move.appliedValue);
        }
      }
    }
    drawTimedOutTurn(match, userId) {
      const drawn = this.draw(match.id, userId);
      if (drawn.phase === "completed" || playerAt(drawn, drawn.activePlayerIndex).userId !== userId) {
        return drawn;
      }
      if (drawn.phase === "after-draw" || drawn.phase === "after-card") {
        return this.endTurn(drawn.id, userId);
      }
      return drawn;
    }
    finishTurn(match, playerIndex, summary) {
      const player = playerAt(match, playerIndex);
      if (player.total > WIN_SCORE) {
        return this.resolveBust(match, playerIndex, `${summary} ${player.displayName} still busts with ${player.total}.`);
      }
      if (player.board.length >= MAX_BOARD_SIZE) {
        return this.resolveNineCardWin(match, playerIndex);
      }
      const nextIndex = this.pickNextActiveIndex(match, playerIndex);
      const nextPlayer = playerAt(match, nextIndex);
      match.activePlayerIndex = nextIndex;
      match.phase = "turn";
      match.pendingDraw = null;
      match.statusLine = nextIndex === playerIndex ? `${summary} ${player.displayName} stays active because the opposing player is already standing.` : `${summary} ${nextPlayer.displayName} is up.`;
      this.resetTurnClock(match);
      this.safePersist(match);
      return match;
    }
    resolveBust(match, bustedPlayerIndex, summary) {
      const winnerIndex = this.getOpponentIndex(bustedPlayerIndex);
      const winner = playerAt(match, winnerIndex);
      const bustedPlayer = playerAt(match, bustedPlayerIndex);
      winner.roundWins += 1;
      match.lastSetWinnerIndex = winnerIndex;
      match.consecutiveTies = 0;
      if (winner.roundWins >= getMatchSetsToWin(match)) {
        return this.completeMatch(match, winnerIndex, `${summary} ${winner.displayName} wins the match ${winner.roundWins}-${bustedPlayer.roundWins}.`);
      }
      const starterIndex = bustedPlayerIndex;
      const starter = playerAt(match, starterIndex);
      const upcomingSet = match.setNumber + 1;
      return this.startSet(match, true, starterIndex, `${summary} ${winner.displayName} takes the set. ${starter.displayName} opens set ${upcomingSet}.`);
    }
    resolveNineCardWin(match, playerIndex) {
      const winner = playerAt(match, playerIndex);
      const opponentIndex = this.getOpponentIndex(playerIndex);
      const loser = playerAt(match, opponentIndex);
      winner.roundWins += 1;
      match.lastSetWinnerIndex = playerIndex;
      match.consecutiveTies = 0;
      const summary = `${winner.displayName} fills the board with ${MAX_BOARD_SIZE} cards (total ${winner.total}) \u2014 automatic set win!`;
      if (winner.roundWins >= getMatchSetsToWin(match)) {
        return this.completeMatch(match, playerIndex, `${summary} ${winner.displayName} wins the match ${winner.roundWins}-${loser.roundWins}.`);
      }
      const starterIndex = opponentIndex;
      const starter = playerAt(match, starterIndex);
      const upcomingSet = match.setNumber + 1;
      return this.startSet(match, true, starterIndex, `${summary} ${starter.displayName} opens set ${upcomingSet}.`);
    }
    resolveStandingTotals(match) {
      const challenger = playerAt(match, 0);
      const challenged = playerAt(match, 1);
      if (challenger.total === challenged.total) {
        const p0Tie = challenger.hasTiebreaker;
        const p1Tie = challenged.hasTiebreaker;
        if (p0Tie && !p1Tie) {
          return this.resolveSetWinner(match, 0, `${challenger.displayName} breaks the tie at ${challenger.total} with a Tiebreaker card!`);
        }
        if (p1Tie && !p0Tie) {
          return this.resolveSetWinner(match, 1, `${challenged.displayName} breaks the tie at ${challenged.total} with a Tiebreaker card!`);
        }
        const starterIndex = match.initialStarterIndex;
        const upcomingSet = match.setNumber + 1;
        const starter = playerAt(match, starterIndex);
        match.consecutiveTies += 1;
        if (match.consecutiveTies >= MAX_CONSECUTIVE_TIES) {
          const tieWinnerIndex = challenger.roundWins >= challenged.roundWins ? 0 : 1;
          const tieWinner = playerAt(match, tieWinnerIndex);
          return this.completeMatch(match, tieWinnerIndex, `${new Array(MAX_CONSECUTIVE_TIES).fill("Set tied").join(", ")} \u2014 ${MAX_CONSECUTIVE_TIES} consecutive ties. ${tieWinner.displayName} wins the match by ${tieWinner.roundWins}-${playerAt(match, this.getOpponentIndex(tieWinnerIndex)).roundWins} record.`);
        }
        return this.startSet(match, true, starterIndex, `Set tied at ${challenger.total}. ${starter.displayName} opens set ${upcomingSet}.`);
      }
      const winnerIndex = challenger.total > challenged.total ? 0 : 1;
      const suffix = `${playerAt(match, winnerIndex).displayName} wins the set ${playerAt(match, winnerIndex).total}-${playerAt(match, this.getOpponentIndex(winnerIndex)).total}.`;
      return this.resolveSetWinner(match, winnerIndex, suffix);
    }
    /**
     * Wacky-mode `00` card. Mirrors the no-tiebreaker tie path from resolveStandingTotals:
     * the set ends immediately with no winner, consecutive-tie counter advances, and the
     * original initial-starter re-opens the next set. Matches hit the same five-ties
     * tie-break clamp that the standard tie flow uses.
     */
    resolveHardReset(match, playerIndex, summary) {
      const challenger = playerAt(match, 0);
      const challenged = playerAt(match, 1);
      const starterIndex = match.initialStarterIndex;
      const starter = playerAt(match, starterIndex);
      const upcomingSet = match.setNumber + 1;
      match.lastSetWinnerIndex = null;
      match.consecutiveTies += 1;
      if (match.consecutiveTies >= MAX_CONSECUTIVE_TIES) {
        const tieWinnerIndex = challenger.roundWins >= challenged.roundWins ? 0 : 1;
        const tieWinner = playerAt(match, tieWinnerIndex);
        const tieLoser = playerAt(match, this.getOpponentIndex(tieWinnerIndex));
        return this.completeMatch(match, tieWinnerIndex, `${summary} ${MAX_CONSECUTIVE_TIES} consecutive ties. ${tieWinner.displayName} wins the match ${tieWinner.roundWins}-${tieLoser.roundWins}.`);
      }
      const triggerName = playerAt(match, playerIndex).displayName;
      return this.startSet(match, true, starterIndex, `${summary} ${triggerName} triggers a 00 hard reset \u2014 set ${match.setNumber} ties, and ${starter.displayName} opens set ${upcomingSet}.`);
    }
    resolveSetWinner(match, winnerIndex, summary) {
      const loserIndex = this.getOpponentIndex(winnerIndex);
      const winner = playerAt(match, winnerIndex);
      const loser = playerAt(match, loserIndex);
      winner.roundWins += 1;
      match.lastSetWinnerIndex = winnerIndex;
      match.consecutiveTies = 0;
      if (winner.roundWins >= getMatchSetsToWin(match)) {
        return this.completeMatch(match, winnerIndex, `${summary} ${winner.displayName} takes the match ${winner.roundWins}-${loser.roundWins}.`);
      }
      const starterIndex = loserIndex;
      const starter = playerAt(match, starterIndex);
      const upcomingSet = match.setNumber + 1;
      return this.startSet(match, true, starterIndex, `${summary} ${starter.displayName} opens set ${upcomingSet}.`);
    }
    startSet(match, incrementSetNumber, starterIndex, statusLine) {
      if (incrementSetNumber) {
        match.setNumber += 1;
      }
      for (const player of match.players) {
        resetPlayerForSet(player);
      }
      match.mainDeck = buildMainDeck();
      match.pendingDraw = null;
      match.phase = "turn";
      match.activePlayerIndex = starterIndex;
      match.statusLine = statusLine;
      this.resetTurnClock(match);
      this.safePersist(match);
      return match;
    }
    completeMatch(match, winnerIndex, summary) {
      const loserIndex = this.getOpponentIndex(winnerIndex);
      const winner = playerAt(match, winnerIndex);
      const loser = playerAt(match, loserIndex);
      const challenger = playerAt(match, 0);
      const challenged = playerAt(match, 1);
      match.phase = "completed";
      match.pendingDraw = null;
      match.turnDeadlineAt = void 0;
      match.disconnectedSince = {};
      match.winnerId = winner.userId;
      match.winnerName = winner.displayName;
      match.loserId = loser.userId;
      match.loserName = loser.displayName;
      match.statusLine = summary;
      match.updatedAt = Date.now();
      this.activeMatchIdsByUserId.delete(challenger.userId);
      this.activeMatchIdsByUserId.delete(challenged.userId);
      this.safePersist(match);
      return match;
    }
    createMatchFromPlayers(input) {
      const initialStarterIndex = Math.random() < 0.5 ? 0 : 1;
      const starter = input.players[initialStarterIndex];
      const now = this.now();
      const gameMode = normalizePazaakGameMode(input.gameMode);
      const match = {
        id: input.matchId?.trim() || randomUuid(),
        channelId: input.channelId,
        publicMessageId: null,
        spectatorMirrors: [],
        wager: input.wager,
        players: input.players,
        activePlayerIndex: initialStarterIndex,
        setNumber: 1,
        setsToWin: normalizeSetsToWin(input.setsToWin),
        gameMode,
        mainDeck: buildMainDeck(),
        phase: "turn",
        pendingDraw: null,
        statusLine: `${starter.displayName} opens set 1.`,
        createdAt: now,
        updatedAt: now,
        turnStartedAt: now,
        turnDeadlineAt: this.resolveTurnDeadline(now),
        disconnectedSince: {},
        aiSeats: input.aiSeats ?? {},
        initialStarterIndex,
        lastSetWinnerIndex: null,
        consecutiveTies: 0,
        winnerId: null,
        winnerName: null,
        loserId: null,
        loserName: null,
        settled: false
      };
      this.matches.set(match.id, match);
      for (const player of match.players) {
        this.activeMatchIdsByUserId.set(player.userId, match.id);
      }
      this.safePersist(match);
      return match;
    }
    now() {
      return this.options.now?.() ?? Date.now();
    }
    resolveTurnDeadline(turnStartedAt) {
      const turnTimeoutMs = this.options.turnTimeoutMs;
      return turnTimeoutMs && turnTimeoutMs > 0 ? turnStartedAt + turnTimeoutMs : void 0;
    }
    resetTurnClock(match) {
      const now = this.now();
      match.updatedAt = now;
      match.turnStartedAt = now;
      match.turnDeadlineAt = this.resolveTurnDeadline(now);
    }
    safePersist(match) {
      this.persistence?.save(match).catch((err) => {
        console.error("[pazaak-engine] Failed to persist match", match.id, err);
      });
    }
    validateChallengeDeckChoice(label, deckId, customDeck, gameMode = "canonical") {
      if (deckId !== void 0 && customDeck !== void 0) {
        throw new Error(`${label} cannot use both a canonical deck id and a custom sideboard.`);
      }
      if (deckId !== void 0 && !isCanonicalSideDeckSupported(deckId)) {
        throw new Error(`${label} deck ${deckId} is not supported by the current canonical engine.`);
      }
      if (customDeck !== void 0) {
        createCustomSideDeck({ ...customDeck, enforceTokenLimits: true, gameMode });
      }
    }
    getRequiredChallenge(challengeId) {
      const challenge = this.pendingChallenges.get(challengeId);
      if (!challenge) {
        throw new Error("That pazaak challenge no longer exists.");
      }
      return challenge;
    }
    getRequiredMatch(matchId) {
      const match = this.matches.get(matchId);
      if (!match) {
        throw new Error("That pazaak match is no longer active.");
      }
      return match;
    }
    getParticipantIndex(match, userId) {
      const index = match.players.findIndex((player) => player.userId === userId);
      if (index === -1) {
        throw new Error("You are not a participant in this match.");
      }
      return index;
    }
    requireTurnOwner(match, userId) {
      if (match.phase === "completed") {
        throw new Error("This match has already been completed.");
      }
      const index = this.getParticipantIndex(match, userId);
      if (playerAt(match, match.activePlayerIndex).userId !== userId) {
        throw new Error("It is not your turn to act.");
      }
      return index;
    }
    getOpponentIndex(playerIndex) {
      return playerIndex === 0 ? 1 : 0;
    }
    pickNextActiveIndex(match, currentIndex) {
      const opponentIndex = this.getOpponentIndex(currentIndex);
      return playerAt(match, opponentIndex).stood ? currentIndex : opponentIndex;
    }
  };

  // ../../packages/pazaak-policy/dist/defaults.js
  var PAZAAK_POLICY_DEFAULTS = {
    version: 1,
    timers: {
      turnTimerSeconds: 45,
      disconnectForfeitMs: 3e4,
      turnTimeoutMs: 3e5,
      reconnectGraceMs: 12e4
    },
    matchmaking: {
      tickMs: 5e3,
      queueWidenAfterMs: 15e3,
      regions: [
        { id: "auto", label: "Recommended" },
        { id: "enam", label: "North America", locationHint: "enam" },
        { id: "weur", label: "Western Europe", locationHint: "weur" },
        { id: "apac", label: "Asia-Pacific", locationHint: "apac" }
      ],
      defaultRegionId: "auto"
    },
    features: {
      workerMatchAuthority: false,
      dualWriteMatchesToWorker: false,
      dualWriteMatchesToBot: false,
      allowPrivateBackendUrl: true,
      blackjackOnlineEnabled: true
    },
    blackjack: {
      shoeDecks: 6,
      dealerHitsSoft17: true,
      modifiers: {}
    },
    progression: {
      milestonesEnabled: true
    },
    admin: {
      discordUserAllowlist: []
    },
    timeControls: {
      presets: [
        { id: "blitz", label: "Blitz \u2014 60s / turn", turnSeconds: 60, incrementSeconds: 0 },
        { id: "standard", label: "Standard \u2014 45s / turn", turnSeconds: 45, incrementSeconds: 0 },
        { id: "rapid", label: "Rapid \u2014 120s / turn", turnSeconds: 120, incrementSeconds: 0 },
        { id: "relaxed", label: "Relaxed \u2014 300s / turn", turnSeconds: 300, incrementSeconds: 0 }
      ]
    }
  };

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/external.js
  var external_exports = {};
  __export(external_exports, {
    BRAND: () => BRAND,
    DIRTY: () => DIRTY,
    EMPTY_PATH: () => EMPTY_PATH,
    INVALID: () => INVALID,
    NEVER: () => NEVER,
    OK: () => OK,
    ParseStatus: () => ParseStatus,
    Schema: () => ZodType,
    ZodAny: () => ZodAny,
    ZodArray: () => ZodArray,
    ZodBigInt: () => ZodBigInt,
    ZodBoolean: () => ZodBoolean,
    ZodBranded: () => ZodBranded,
    ZodCatch: () => ZodCatch,
    ZodDate: () => ZodDate,
    ZodDefault: () => ZodDefault,
    ZodDiscriminatedUnion: () => ZodDiscriminatedUnion,
    ZodEffects: () => ZodEffects,
    ZodEnum: () => ZodEnum,
    ZodError: () => ZodError,
    ZodFirstPartyTypeKind: () => ZodFirstPartyTypeKind,
    ZodFunction: () => ZodFunction,
    ZodIntersection: () => ZodIntersection,
    ZodIssueCode: () => ZodIssueCode,
    ZodLazy: () => ZodLazy,
    ZodLiteral: () => ZodLiteral,
    ZodMap: () => ZodMap,
    ZodNaN: () => ZodNaN,
    ZodNativeEnum: () => ZodNativeEnum,
    ZodNever: () => ZodNever,
    ZodNull: () => ZodNull,
    ZodNullable: () => ZodNullable,
    ZodNumber: () => ZodNumber,
    ZodObject: () => ZodObject,
    ZodOptional: () => ZodOptional,
    ZodParsedType: () => ZodParsedType,
    ZodPipeline: () => ZodPipeline,
    ZodPromise: () => ZodPromise,
    ZodReadonly: () => ZodReadonly,
    ZodRecord: () => ZodRecord,
    ZodSchema: () => ZodType,
    ZodSet: () => ZodSet,
    ZodString: () => ZodString,
    ZodSymbol: () => ZodSymbol,
    ZodTransformer: () => ZodEffects,
    ZodTuple: () => ZodTuple,
    ZodType: () => ZodType,
    ZodUndefined: () => ZodUndefined,
    ZodUnion: () => ZodUnion,
    ZodUnknown: () => ZodUnknown,
    ZodVoid: () => ZodVoid,
    addIssueToContext: () => addIssueToContext,
    any: () => anyType,
    array: () => arrayType,
    bigint: () => bigIntType,
    boolean: () => booleanType,
    coerce: () => coerce,
    custom: () => custom,
    date: () => dateType,
    datetimeRegex: () => datetimeRegex,
    defaultErrorMap: () => en_default,
    discriminatedUnion: () => discriminatedUnionType,
    effect: () => effectsType,
    enum: () => enumType,
    function: () => functionType,
    getErrorMap: () => getErrorMap,
    getParsedType: () => getParsedType,
    instanceof: () => instanceOfType,
    intersection: () => intersectionType,
    isAborted: () => isAborted,
    isAsync: () => isAsync,
    isDirty: () => isDirty,
    isValid: () => isValid,
    late: () => late,
    lazy: () => lazyType,
    literal: () => literalType,
    makeIssue: () => makeIssue,
    map: () => mapType,
    nan: () => nanType,
    nativeEnum: () => nativeEnumType,
    never: () => neverType,
    null: () => nullType,
    nullable: () => nullableType,
    number: () => numberType,
    object: () => objectType,
    objectUtil: () => objectUtil,
    oboolean: () => oboolean,
    onumber: () => onumber,
    optional: () => optionalType,
    ostring: () => ostring,
    pipeline: () => pipelineType,
    preprocess: () => preprocessType,
    promise: () => promiseType,
    quotelessJson: () => quotelessJson,
    record: () => recordType,
    set: () => setType,
    setErrorMap: () => setErrorMap,
    strictObject: () => strictObjectType,
    string: () => stringType,
    symbol: () => symbolType,
    transformer: () => effectsType,
    tuple: () => tupleType,
    undefined: () => undefinedType,
    union: () => unionType,
    unknown: () => unknownType,
    util: () => util,
    void: () => voidType
  });

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/util.js
  var util;
  (function(util2) {
    util2.assertEqual = (_) => {
    };
    function assertIs(_arg) {
    }
    util2.assertIs = assertIs;
    function assertNever(_x) {
      throw new Error();
    }
    util2.assertNever = assertNever;
    util2.arrayToEnum = (items) => {
      const obj = {};
      for (const item of items) {
        obj[item] = item;
      }
      return obj;
    };
    util2.getValidEnumValues = (obj) => {
      const validKeys = util2.objectKeys(obj).filter((k) => typeof obj[obj[k]] !== "number");
      const filtered = {};
      for (const k of validKeys) {
        filtered[k] = obj[k];
      }
      return util2.objectValues(filtered);
    };
    util2.objectValues = (obj) => {
      return util2.objectKeys(obj).map(function(e) {
        return obj[e];
      });
    };
    util2.objectKeys = typeof Object.keys === "function" ? (obj) => Object.keys(obj) : (object) => {
      const keys = [];
      for (const key in object) {
        if (Object.prototype.hasOwnProperty.call(object, key)) {
          keys.push(key);
        }
      }
      return keys;
    };
    util2.find = (arr, checker) => {
      for (const item of arr) {
        if (checker(item))
          return item;
      }
      return void 0;
    };
    util2.isInteger = typeof Number.isInteger === "function" ? (val) => Number.isInteger(val) : (val) => typeof val === "number" && Number.isFinite(val) && Math.floor(val) === val;
    function joinValues(array, separator = " | ") {
      return array.map((val) => typeof val === "string" ? `'${val}'` : val).join(separator);
    }
    util2.joinValues = joinValues;
    util2.jsonStringifyReplacer = (_, value) => {
      if (typeof value === "bigint") {
        return value.toString();
      }
      return value;
    };
  })(util || (util = {}));
  var objectUtil;
  (function(objectUtil2) {
    objectUtil2.mergeShapes = (first, second) => {
      return {
        ...first,
        ...second
        // second overwrites first
      };
    };
  })(objectUtil || (objectUtil = {}));
  var ZodParsedType = util.arrayToEnum([
    "string",
    "nan",
    "number",
    "integer",
    "float",
    "boolean",
    "date",
    "bigint",
    "symbol",
    "function",
    "undefined",
    "null",
    "array",
    "object",
    "unknown",
    "promise",
    "void",
    "never",
    "map",
    "set"
  ]);
  var getParsedType = (data) => {
    const t = typeof data;
    switch (t) {
      case "undefined":
        return ZodParsedType.undefined;
      case "string":
        return ZodParsedType.string;
      case "number":
        return Number.isNaN(data) ? ZodParsedType.nan : ZodParsedType.number;
      case "boolean":
        return ZodParsedType.boolean;
      case "function":
        return ZodParsedType.function;
      case "bigint":
        return ZodParsedType.bigint;
      case "symbol":
        return ZodParsedType.symbol;
      case "object":
        if (Array.isArray(data)) {
          return ZodParsedType.array;
        }
        if (data === null) {
          return ZodParsedType.null;
        }
        if (data.then && typeof data.then === "function" && data.catch && typeof data.catch === "function") {
          return ZodParsedType.promise;
        }
        if (typeof Map !== "undefined" && data instanceof Map) {
          return ZodParsedType.map;
        }
        if (typeof Set !== "undefined" && data instanceof Set) {
          return ZodParsedType.set;
        }
        if (typeof Date !== "undefined" && data instanceof Date) {
          return ZodParsedType.date;
        }
        return ZodParsedType.object;
      default:
        return ZodParsedType.unknown;
    }
  };

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/ZodError.js
  var ZodIssueCode = util.arrayToEnum([
    "invalid_type",
    "invalid_literal",
    "custom",
    "invalid_union",
    "invalid_union_discriminator",
    "invalid_enum_value",
    "unrecognized_keys",
    "invalid_arguments",
    "invalid_return_type",
    "invalid_date",
    "invalid_string",
    "too_small",
    "too_big",
    "invalid_intersection_types",
    "not_multiple_of",
    "not_finite"
  ]);
  var quotelessJson = (obj) => {
    const json2 = JSON.stringify(obj, null, 2);
    return json2.replace(/"([^"]+)":/g, "$1:");
  };
  var ZodError = class _ZodError extends Error {
    get errors() {
      return this.issues;
    }
    constructor(issues) {
      super();
      this.issues = [];
      this.addIssue = (sub) => {
        this.issues = [...this.issues, sub];
      };
      this.addIssues = (subs = []) => {
        this.issues = [...this.issues, ...subs];
      };
      const actualProto = new.target.prototype;
      if (Object.setPrototypeOf) {
        Object.setPrototypeOf(this, actualProto);
      } else {
        this.__proto__ = actualProto;
      }
      this.name = "ZodError";
      this.issues = issues;
    }
    format(_mapper) {
      const mapper = _mapper || function(issue) {
        return issue.message;
      };
      const fieldErrors = { _errors: [] };
      const processError = (error) => {
        for (const issue of error.issues) {
          if (issue.code === "invalid_union") {
            issue.unionErrors.map(processError);
          } else if (issue.code === "invalid_return_type") {
            processError(issue.returnTypeError);
          } else if (issue.code === "invalid_arguments") {
            processError(issue.argumentsError);
          } else if (issue.path.length === 0) {
            fieldErrors._errors.push(mapper(issue));
          } else {
            let curr = fieldErrors;
            let i = 0;
            while (i < issue.path.length) {
              const el = issue.path[i];
              const terminal = i === issue.path.length - 1;
              if (!terminal) {
                curr[el] = curr[el] || { _errors: [] };
              } else {
                curr[el] = curr[el] || { _errors: [] };
                curr[el]._errors.push(mapper(issue));
              }
              curr = curr[el];
              i++;
            }
          }
        }
      };
      processError(this);
      return fieldErrors;
    }
    static assert(value) {
      if (!(value instanceof _ZodError)) {
        throw new Error(`Not a ZodError: ${value}`);
      }
    }
    toString() {
      return this.message;
    }
    get message() {
      return JSON.stringify(this.issues, util.jsonStringifyReplacer, 2);
    }
    get isEmpty() {
      return this.issues.length === 0;
    }
    flatten(mapper = (issue) => issue.message) {
      const fieldErrors = {};
      const formErrors = [];
      for (const sub of this.issues) {
        if (sub.path.length > 0) {
          const firstEl = sub.path[0];
          fieldErrors[firstEl] = fieldErrors[firstEl] || [];
          fieldErrors[firstEl].push(mapper(sub));
        } else {
          formErrors.push(mapper(sub));
        }
      }
      return { formErrors, fieldErrors };
    }
    get formErrors() {
      return this.flatten();
    }
  };
  ZodError.create = (issues) => {
    const error = new ZodError(issues);
    return error;
  };

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/locales/en.js
  var errorMap = (issue, _ctx) => {
    let message;
    switch (issue.code) {
      case ZodIssueCode.invalid_type:
        if (issue.received === ZodParsedType.undefined) {
          message = "Required";
        } else {
          message = `Expected ${issue.expected}, received ${issue.received}`;
        }
        break;
      case ZodIssueCode.invalid_literal:
        message = `Invalid literal value, expected ${JSON.stringify(issue.expected, util.jsonStringifyReplacer)}`;
        break;
      case ZodIssueCode.unrecognized_keys:
        message = `Unrecognized key(s) in object: ${util.joinValues(issue.keys, ", ")}`;
        break;
      case ZodIssueCode.invalid_union:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_union_discriminator:
        message = `Invalid discriminator value. Expected ${util.joinValues(issue.options)}`;
        break;
      case ZodIssueCode.invalid_enum_value:
        message = `Invalid enum value. Expected ${util.joinValues(issue.options)}, received '${issue.received}'`;
        break;
      case ZodIssueCode.invalid_arguments:
        message = `Invalid function arguments`;
        break;
      case ZodIssueCode.invalid_return_type:
        message = `Invalid function return type`;
        break;
      case ZodIssueCode.invalid_date:
        message = `Invalid date`;
        break;
      case ZodIssueCode.invalid_string:
        if (typeof issue.validation === "object") {
          if ("includes" in issue.validation) {
            message = `Invalid input: must include "${issue.validation.includes}"`;
            if (typeof issue.validation.position === "number") {
              message = `${message} at one or more positions greater than or equal to ${issue.validation.position}`;
            }
          } else if ("startsWith" in issue.validation) {
            message = `Invalid input: must start with "${issue.validation.startsWith}"`;
          } else if ("endsWith" in issue.validation) {
            message = `Invalid input: must end with "${issue.validation.endsWith}"`;
          } else {
            util.assertNever(issue.validation);
          }
        } else if (issue.validation !== "regex") {
          message = `Invalid ${issue.validation}`;
        } else {
          message = "Invalid";
        }
        break;
      case ZodIssueCode.too_small:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `more than`} ${issue.minimum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? "exactly" : issue.inclusive ? `at least` : `over`} ${issue.minimum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "bigint")
          message = `Number must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${issue.minimum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly equal to ` : issue.inclusive ? `greater than or equal to ` : `greater than `}${new Date(Number(issue.minimum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.too_big:
        if (issue.type === "array")
          message = `Array must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `less than`} ${issue.maximum} element(s)`;
        else if (issue.type === "string")
          message = `String must contain ${issue.exact ? `exactly` : issue.inclusive ? `at most` : `under`} ${issue.maximum} character(s)`;
        else if (issue.type === "number")
          message = `Number must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "bigint")
          message = `BigInt must be ${issue.exact ? `exactly` : issue.inclusive ? `less than or equal to` : `less than`} ${issue.maximum}`;
        else if (issue.type === "date")
          message = `Date must be ${issue.exact ? `exactly` : issue.inclusive ? `smaller than or equal to` : `smaller than`} ${new Date(Number(issue.maximum))}`;
        else
          message = "Invalid input";
        break;
      case ZodIssueCode.custom:
        message = `Invalid input`;
        break;
      case ZodIssueCode.invalid_intersection_types:
        message = `Intersection results could not be merged`;
        break;
      case ZodIssueCode.not_multiple_of:
        message = `Number must be a multiple of ${issue.multipleOf}`;
        break;
      case ZodIssueCode.not_finite:
        message = "Number must be finite";
        break;
      default:
        message = _ctx.defaultError;
        util.assertNever(issue);
    }
    return { message };
  };
  var en_default = errorMap;

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/errors.js
  var overrideErrorMap = en_default;
  function setErrorMap(map) {
    overrideErrorMap = map;
  }
  function getErrorMap() {
    return overrideErrorMap;
  }

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/parseUtil.js
  var makeIssue = (params) => {
    const { data, path, errorMaps, issueData } = params;
    const fullPath = [...path, ...issueData.path || []];
    const fullIssue = {
      ...issueData,
      path: fullPath
    };
    if (issueData.message !== void 0) {
      return {
        ...issueData,
        path: fullPath,
        message: issueData.message
      };
    }
    let errorMessage = "";
    const maps = errorMaps.filter((m) => !!m).slice().reverse();
    for (const map of maps) {
      errorMessage = map(fullIssue, { data, defaultError: errorMessage }).message;
    }
    return {
      ...issueData,
      path: fullPath,
      message: errorMessage
    };
  };
  var EMPTY_PATH = [];
  function addIssueToContext(ctx, issueData) {
    const overrideMap = getErrorMap();
    const issue = makeIssue({
      issueData,
      data: ctx.data,
      path: ctx.path,
      errorMaps: [
        ctx.common.contextualErrorMap,
        // contextual error map is first priority
        ctx.schemaErrorMap,
        // then schema-bound map if available
        overrideMap,
        // then global override map
        overrideMap === en_default ? void 0 : en_default
        // then global default map
      ].filter((x) => !!x)
    });
    ctx.common.issues.push(issue);
  }
  var ParseStatus = class _ParseStatus {
    constructor() {
      this.value = "valid";
    }
    dirty() {
      if (this.value === "valid")
        this.value = "dirty";
    }
    abort() {
      if (this.value !== "aborted")
        this.value = "aborted";
    }
    static mergeArray(status, results) {
      const arrayValue = [];
      for (const s of results) {
        if (s.status === "aborted")
          return INVALID;
        if (s.status === "dirty")
          status.dirty();
        arrayValue.push(s.value);
      }
      return { status: status.value, value: arrayValue };
    }
    static async mergeObjectAsync(status, pairs) {
      const syncPairs = [];
      for (const pair of pairs) {
        const key = await pair.key;
        const value = await pair.value;
        syncPairs.push({
          key,
          value
        });
      }
      return _ParseStatus.mergeObjectSync(status, syncPairs);
    }
    static mergeObjectSync(status, pairs) {
      const finalObject = {};
      for (const pair of pairs) {
        const { key, value } = pair;
        if (key.status === "aborted")
          return INVALID;
        if (value.status === "aborted")
          return INVALID;
        if (key.status === "dirty")
          status.dirty();
        if (value.status === "dirty")
          status.dirty();
        if (key.value !== "__proto__" && (typeof value.value !== "undefined" || pair.alwaysSet)) {
          finalObject[key.value] = value.value;
        }
      }
      return { status: status.value, value: finalObject };
    }
  };
  var INVALID = Object.freeze({
    status: "aborted"
  });
  var DIRTY = (value) => ({ status: "dirty", value });
  var OK = (value) => ({ status: "valid", value });
  var isAborted = (x) => x.status === "aborted";
  var isDirty = (x) => x.status === "dirty";
  var isValid = (x) => x.status === "valid";
  var isAsync = (x) => typeof Promise !== "undefined" && x instanceof Promise;

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/helpers/errorUtil.js
  var errorUtil;
  (function(errorUtil2) {
    errorUtil2.errToObj = (message) => typeof message === "string" ? { message } : message || {};
    errorUtil2.toString = (message) => typeof message === "string" ? message : message?.message;
  })(errorUtil || (errorUtil = {}));

  // ../../node_modules/.pnpm/zod@3.25.76/node_modules/zod/v3/types.js
  var ParseInputLazyPath = class {
    constructor(parent, value, path, key) {
      this._cachedPath = [];
      this.parent = parent;
      this.data = value;
      this._path = path;
      this._key = key;
    }
    get path() {
      if (!this._cachedPath.length) {
        if (Array.isArray(this._key)) {
          this._cachedPath.push(...this._path, ...this._key);
        } else {
          this._cachedPath.push(...this._path, this._key);
        }
      }
      return this._cachedPath;
    }
  };
  var handleResult = (ctx, result) => {
    if (isValid(result)) {
      return { success: true, data: result.value };
    } else {
      if (!ctx.common.issues.length) {
        throw new Error("Validation failed but no issues detected.");
      }
      return {
        success: false,
        get error() {
          if (this._error)
            return this._error;
          const error = new ZodError(ctx.common.issues);
          this._error = error;
          return this._error;
        }
      };
    }
  };
  function processCreateParams(params) {
    if (!params)
      return {};
    const { errorMap: errorMap2, invalid_type_error, required_error, description } = params;
    if (errorMap2 && (invalid_type_error || required_error)) {
      throw new Error(`Can't use "invalid_type_error" or "required_error" in conjunction with custom error map.`);
    }
    if (errorMap2)
      return { errorMap: errorMap2, description };
    const customMap = (iss, ctx) => {
      const { message } = params;
      if (iss.code === "invalid_enum_value") {
        return { message: message ?? ctx.defaultError };
      }
      if (typeof ctx.data === "undefined") {
        return { message: message ?? required_error ?? ctx.defaultError };
      }
      if (iss.code !== "invalid_type")
        return { message: ctx.defaultError };
      return { message: message ?? invalid_type_error ?? ctx.defaultError };
    };
    return { errorMap: customMap, description };
  }
  var ZodType = class {
    get description() {
      return this._def.description;
    }
    _getType(input) {
      return getParsedType(input.data);
    }
    _getOrReturnCtx(input, ctx) {
      return ctx || {
        common: input.parent.common,
        data: input.data,
        parsedType: getParsedType(input.data),
        schemaErrorMap: this._def.errorMap,
        path: input.path,
        parent: input.parent
      };
    }
    _processInputParams(input) {
      return {
        status: new ParseStatus(),
        ctx: {
          common: input.parent.common,
          data: input.data,
          parsedType: getParsedType(input.data),
          schemaErrorMap: this._def.errorMap,
          path: input.path,
          parent: input.parent
        }
      };
    }
    _parseSync(input) {
      const result = this._parse(input);
      if (isAsync(result)) {
        throw new Error("Synchronous parse encountered promise.");
      }
      return result;
    }
    _parseAsync(input) {
      const result = this._parse(input);
      return Promise.resolve(result);
    }
    parse(data, params) {
      const result = this.safeParse(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    safeParse(data, params) {
      const ctx = {
        common: {
          issues: [],
          async: params?.async ?? false,
          contextualErrorMap: params?.errorMap
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const result = this._parseSync({ data, path: ctx.path, parent: ctx });
      return handleResult(ctx, result);
    }
    "~validate"(data) {
      const ctx = {
        common: {
          issues: [],
          async: !!this["~standard"].async
        },
        path: [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      if (!this["~standard"].async) {
        try {
          const result = this._parseSync({ data, path: [], parent: ctx });
          return isValid(result) ? {
            value: result.value
          } : {
            issues: ctx.common.issues
          };
        } catch (err) {
          if (err?.message?.toLowerCase()?.includes("encountered")) {
            this["~standard"].async = true;
          }
          ctx.common = {
            issues: [],
            async: true
          };
        }
      }
      return this._parseAsync({ data, path: [], parent: ctx }).then((result) => isValid(result) ? {
        value: result.value
      } : {
        issues: ctx.common.issues
      });
    }
    async parseAsync(data, params) {
      const result = await this.safeParseAsync(data, params);
      if (result.success)
        return result.data;
      throw result.error;
    }
    async safeParseAsync(data, params) {
      const ctx = {
        common: {
          issues: [],
          contextualErrorMap: params?.errorMap,
          async: true
        },
        path: params?.path || [],
        schemaErrorMap: this._def.errorMap,
        parent: null,
        data,
        parsedType: getParsedType(data)
      };
      const maybeAsyncResult = this._parse({ data, path: ctx.path, parent: ctx });
      const result = await (isAsync(maybeAsyncResult) ? maybeAsyncResult : Promise.resolve(maybeAsyncResult));
      return handleResult(ctx, result);
    }
    refine(check, message) {
      const getIssueProperties = (val) => {
        if (typeof message === "string" || typeof message === "undefined") {
          return { message };
        } else if (typeof message === "function") {
          return message(val);
        } else {
          return message;
        }
      };
      return this._refinement((val, ctx) => {
        const result = check(val);
        const setError = () => ctx.addIssue({
          code: ZodIssueCode.custom,
          ...getIssueProperties(val)
        });
        if (typeof Promise !== "undefined" && result instanceof Promise) {
          return result.then((data) => {
            if (!data) {
              setError();
              return false;
            } else {
              return true;
            }
          });
        }
        if (!result) {
          setError();
          return false;
        } else {
          return true;
        }
      });
    }
    refinement(check, refinementData) {
      return this._refinement((val, ctx) => {
        if (!check(val)) {
          ctx.addIssue(typeof refinementData === "function" ? refinementData(val, ctx) : refinementData);
          return false;
        } else {
          return true;
        }
      });
    }
    _refinement(refinement) {
      return new ZodEffects({
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "refinement", refinement }
      });
    }
    superRefine(refinement) {
      return this._refinement(refinement);
    }
    constructor(def) {
      this.spa = this.safeParseAsync;
      this._def = def;
      this.parse = this.parse.bind(this);
      this.safeParse = this.safeParse.bind(this);
      this.parseAsync = this.parseAsync.bind(this);
      this.safeParseAsync = this.safeParseAsync.bind(this);
      this.spa = this.spa.bind(this);
      this.refine = this.refine.bind(this);
      this.refinement = this.refinement.bind(this);
      this.superRefine = this.superRefine.bind(this);
      this.optional = this.optional.bind(this);
      this.nullable = this.nullable.bind(this);
      this.nullish = this.nullish.bind(this);
      this.array = this.array.bind(this);
      this.promise = this.promise.bind(this);
      this.or = this.or.bind(this);
      this.and = this.and.bind(this);
      this.transform = this.transform.bind(this);
      this.brand = this.brand.bind(this);
      this.default = this.default.bind(this);
      this.catch = this.catch.bind(this);
      this.describe = this.describe.bind(this);
      this.pipe = this.pipe.bind(this);
      this.readonly = this.readonly.bind(this);
      this.isNullable = this.isNullable.bind(this);
      this.isOptional = this.isOptional.bind(this);
      this["~standard"] = {
        version: 1,
        vendor: "zod",
        validate: (data) => this["~validate"](data)
      };
    }
    optional() {
      return ZodOptional.create(this, this._def);
    }
    nullable() {
      return ZodNullable.create(this, this._def);
    }
    nullish() {
      return this.nullable().optional();
    }
    array() {
      return ZodArray.create(this);
    }
    promise() {
      return ZodPromise.create(this, this._def);
    }
    or(option) {
      return ZodUnion.create([this, option], this._def);
    }
    and(incoming) {
      return ZodIntersection.create(this, incoming, this._def);
    }
    transform(transform) {
      return new ZodEffects({
        ...processCreateParams(this._def),
        schema: this,
        typeName: ZodFirstPartyTypeKind.ZodEffects,
        effect: { type: "transform", transform }
      });
    }
    default(def) {
      const defaultValueFunc = typeof def === "function" ? def : () => def;
      return new ZodDefault({
        ...processCreateParams(this._def),
        innerType: this,
        defaultValue: defaultValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodDefault
      });
    }
    brand() {
      return new ZodBranded({
        typeName: ZodFirstPartyTypeKind.ZodBranded,
        type: this,
        ...processCreateParams(this._def)
      });
    }
    catch(def) {
      const catchValueFunc = typeof def === "function" ? def : () => def;
      return new ZodCatch({
        ...processCreateParams(this._def),
        innerType: this,
        catchValue: catchValueFunc,
        typeName: ZodFirstPartyTypeKind.ZodCatch
      });
    }
    describe(description) {
      const This = this.constructor;
      return new This({
        ...this._def,
        description
      });
    }
    pipe(target) {
      return ZodPipeline.create(this, target);
    }
    readonly() {
      return ZodReadonly.create(this);
    }
    isOptional() {
      return this.safeParse(void 0).success;
    }
    isNullable() {
      return this.safeParse(null).success;
    }
  };
  var cuidRegex = /^c[^\s-]{8,}$/i;
  var cuid2Regex = /^[0-9a-z]+$/;
  var ulidRegex = /^[0-9A-HJKMNP-TV-Z]{26}$/i;
  var uuidRegex = /^[0-9a-fA-F]{8}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{4}\b-[0-9a-fA-F]{12}$/i;
  var nanoidRegex = /^[a-z0-9_-]{21}$/i;
  var jwtRegex = /^[A-Za-z0-9-_]+\.[A-Za-z0-9-_]+\.[A-Za-z0-9-_]*$/;
  var durationRegex = /^[-+]?P(?!$)(?:(?:[-+]?\d+Y)|(?:[-+]?\d+[.,]\d+Y$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:(?:[-+]?\d+W)|(?:[-+]?\d+[.,]\d+W$))?(?:(?:[-+]?\d+D)|(?:[-+]?\d+[.,]\d+D$))?(?:T(?=[\d+-])(?:(?:[-+]?\d+H)|(?:[-+]?\d+[.,]\d+H$))?(?:(?:[-+]?\d+M)|(?:[-+]?\d+[.,]\d+M$))?(?:[-+]?\d+(?:[.,]\d+)?S)?)??$/;
  var emailRegex = /^(?!\.)(?!.*\.\.)([A-Z0-9_'+\-\.]*)[A-Z0-9_+-]@([A-Z0-9][A-Z0-9\-]*\.)+[A-Z]{2,}$/i;
  var _emojiRegex = `^(\\p{Extended_Pictographic}|\\p{Emoji_Component})+$`;
  var emojiRegex;
  var ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
  var ipv4CidrRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/(3[0-2]|[12]?[0-9])$/;
  var ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;
  var ipv6CidrRegex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
  var base64Regex = /^([0-9a-zA-Z+/]{4})*(([0-9a-zA-Z+/]{2}==)|([0-9a-zA-Z+/]{3}=))?$/;
  var base64urlRegex = /^([0-9a-zA-Z-_]{4})*(([0-9a-zA-Z-_]{2}(==)?)|([0-9a-zA-Z-_]{3}(=)?))?$/;
  var dateRegexSource = `((\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-((0[13578]|1[02])-(0[1-9]|[12]\\d|3[01])|(0[469]|11)-(0[1-9]|[12]\\d|30)|(02)-(0[1-9]|1\\d|2[0-8])))`;
  var dateRegex = new RegExp(`^${dateRegexSource}$`);
  function timeRegexSource(args) {
    let secondsRegexSource = `[0-5]\\d`;
    if (args.precision) {
      secondsRegexSource = `${secondsRegexSource}\\.\\d{${args.precision}}`;
    } else if (args.precision == null) {
      secondsRegexSource = `${secondsRegexSource}(\\.\\d+)?`;
    }
    const secondsQuantifier = args.precision ? "+" : "?";
    return `([01]\\d|2[0-3]):[0-5]\\d(:${secondsRegexSource})${secondsQuantifier}`;
  }
  function timeRegex(args) {
    return new RegExp(`^${timeRegexSource(args)}$`);
  }
  function datetimeRegex(args) {
    let regex = `${dateRegexSource}T${timeRegexSource(args)}`;
    const opts = [];
    opts.push(args.local ? `Z?` : `Z`);
    if (args.offset)
      opts.push(`([+-]\\d{2}:?\\d{2})`);
    regex = `${regex}(${opts.join("|")})`;
    return new RegExp(`^${regex}$`);
  }
  function isValidIP(ip, version) {
    if ((version === "v4" || !version) && ipv4Regex.test(ip)) {
      return true;
    }
    if ((version === "v6" || !version) && ipv6Regex.test(ip)) {
      return true;
    }
    return false;
  }
  function isValidJWT(jwt, alg) {
    if (!jwtRegex.test(jwt))
      return false;
    try {
      const [header] = jwt.split(".");
      if (!header)
        return false;
      const base64 = header.replace(/-/g, "+").replace(/_/g, "/").padEnd(header.length + (4 - header.length % 4) % 4, "=");
      const decoded = JSON.parse(atob(base64));
      if (typeof decoded !== "object" || decoded === null)
        return false;
      if ("typ" in decoded && decoded?.typ !== "JWT")
        return false;
      if (!decoded.alg)
        return false;
      if (alg && decoded.alg !== alg)
        return false;
      return true;
    } catch {
      return false;
    }
  }
  function isValidCidr(ip, version) {
    if ((version === "v4" || !version) && ipv4CidrRegex.test(ip)) {
      return true;
    }
    if ((version === "v6" || !version) && ipv6CidrRegex.test(ip)) {
      return true;
    }
    return false;
  }
  var ZodString = class _ZodString extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = String(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.string) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.string,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.length < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.length > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "string",
              inclusive: true,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "length") {
          const tooBig = input.data.length > check.value;
          const tooSmall = input.data.length < check.value;
          if (tooBig || tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            if (tooBig) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_big,
                maximum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            } else if (tooSmall) {
              addIssueToContext(ctx, {
                code: ZodIssueCode.too_small,
                minimum: check.value,
                type: "string",
                inclusive: true,
                exact: true,
                message: check.message
              });
            }
            status.dirty();
          }
        } else if (check.kind === "email") {
          if (!emailRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "email",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "emoji") {
          if (!emojiRegex) {
            emojiRegex = new RegExp(_emojiRegex, "u");
          }
          if (!emojiRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "emoji",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "uuid") {
          if (!uuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "uuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "nanoid") {
          if (!nanoidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "nanoid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid") {
          if (!cuidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cuid2") {
          if (!cuid2Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cuid2",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ulid") {
          if (!ulidRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ulid",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "url") {
          try {
            new URL(input.data);
          } catch {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "regex") {
          check.regex.lastIndex = 0;
          const testResult = check.regex.test(input.data);
          if (!testResult) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "regex",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "trim") {
          input.data = input.data.trim();
        } else if (check.kind === "includes") {
          if (!input.data.includes(check.value, check.position)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { includes: check.value, position: check.position },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "toLowerCase") {
          input.data = input.data.toLowerCase();
        } else if (check.kind === "toUpperCase") {
          input.data = input.data.toUpperCase();
        } else if (check.kind === "startsWith") {
          if (!input.data.startsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { startsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "endsWith") {
          if (!input.data.endsWith(check.value)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: { endsWith: check.value },
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "datetime") {
          const regex = datetimeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "datetime",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "date") {
          const regex = dateRegex;
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "date",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "time") {
          const regex = timeRegex(check);
          if (!regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_string,
              validation: "time",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "duration") {
          if (!durationRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "duration",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "ip") {
          if (!isValidIP(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "ip",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "jwt") {
          if (!isValidJWT(input.data, check.alg)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "jwt",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "cidr") {
          if (!isValidCidr(input.data, check.version)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "cidr",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64") {
          if (!base64Regex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "base64url") {
          if (!base64urlRegex.test(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              validation: "base64url",
              code: ZodIssueCode.invalid_string,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _regex(regex, validation, message) {
      return this.refinement((data) => regex.test(data), {
        validation,
        code: ZodIssueCode.invalid_string,
        ...errorUtil.errToObj(message)
      });
    }
    _addCheck(check) {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    email(message) {
      return this._addCheck({ kind: "email", ...errorUtil.errToObj(message) });
    }
    url(message) {
      return this._addCheck({ kind: "url", ...errorUtil.errToObj(message) });
    }
    emoji(message) {
      return this._addCheck({ kind: "emoji", ...errorUtil.errToObj(message) });
    }
    uuid(message) {
      return this._addCheck({ kind: "uuid", ...errorUtil.errToObj(message) });
    }
    nanoid(message) {
      return this._addCheck({ kind: "nanoid", ...errorUtil.errToObj(message) });
    }
    cuid(message) {
      return this._addCheck({ kind: "cuid", ...errorUtil.errToObj(message) });
    }
    cuid2(message) {
      return this._addCheck({ kind: "cuid2", ...errorUtil.errToObj(message) });
    }
    ulid(message) {
      return this._addCheck({ kind: "ulid", ...errorUtil.errToObj(message) });
    }
    base64(message) {
      return this._addCheck({ kind: "base64", ...errorUtil.errToObj(message) });
    }
    base64url(message) {
      return this._addCheck({
        kind: "base64url",
        ...errorUtil.errToObj(message)
      });
    }
    jwt(options) {
      return this._addCheck({ kind: "jwt", ...errorUtil.errToObj(options) });
    }
    ip(options) {
      return this._addCheck({ kind: "ip", ...errorUtil.errToObj(options) });
    }
    cidr(options) {
      return this._addCheck({ kind: "cidr", ...errorUtil.errToObj(options) });
    }
    datetime(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "datetime",
          precision: null,
          offset: false,
          local: false,
          message: options
        });
      }
      return this._addCheck({
        kind: "datetime",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        offset: options?.offset ?? false,
        local: options?.local ?? false,
        ...errorUtil.errToObj(options?.message)
      });
    }
    date(message) {
      return this._addCheck({ kind: "date", message });
    }
    time(options) {
      if (typeof options === "string") {
        return this._addCheck({
          kind: "time",
          precision: null,
          message: options
        });
      }
      return this._addCheck({
        kind: "time",
        precision: typeof options?.precision === "undefined" ? null : options?.precision,
        ...errorUtil.errToObj(options?.message)
      });
    }
    duration(message) {
      return this._addCheck({ kind: "duration", ...errorUtil.errToObj(message) });
    }
    regex(regex, message) {
      return this._addCheck({
        kind: "regex",
        regex,
        ...errorUtil.errToObj(message)
      });
    }
    includes(value, options) {
      return this._addCheck({
        kind: "includes",
        value,
        position: options?.position,
        ...errorUtil.errToObj(options?.message)
      });
    }
    startsWith(value, message) {
      return this._addCheck({
        kind: "startsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    endsWith(value, message) {
      return this._addCheck({
        kind: "endsWith",
        value,
        ...errorUtil.errToObj(message)
      });
    }
    min(minLength, message) {
      return this._addCheck({
        kind: "min",
        value: minLength,
        ...errorUtil.errToObj(message)
      });
    }
    max(maxLength, message) {
      return this._addCheck({
        kind: "max",
        value: maxLength,
        ...errorUtil.errToObj(message)
      });
    }
    length(len, message) {
      return this._addCheck({
        kind: "length",
        value: len,
        ...errorUtil.errToObj(message)
      });
    }
    /**
     * Equivalent to `.min(1)`
     */
    nonempty(message) {
      return this.min(1, errorUtil.errToObj(message));
    }
    trim() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "trim" }]
      });
    }
    toLowerCase() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toLowerCase" }]
      });
    }
    toUpperCase() {
      return new _ZodString({
        ...this._def,
        checks: [...this._def.checks, { kind: "toUpperCase" }]
      });
    }
    get isDatetime() {
      return !!this._def.checks.find((ch) => ch.kind === "datetime");
    }
    get isDate() {
      return !!this._def.checks.find((ch) => ch.kind === "date");
    }
    get isTime() {
      return !!this._def.checks.find((ch) => ch.kind === "time");
    }
    get isDuration() {
      return !!this._def.checks.find((ch) => ch.kind === "duration");
    }
    get isEmail() {
      return !!this._def.checks.find((ch) => ch.kind === "email");
    }
    get isURL() {
      return !!this._def.checks.find((ch) => ch.kind === "url");
    }
    get isEmoji() {
      return !!this._def.checks.find((ch) => ch.kind === "emoji");
    }
    get isUUID() {
      return !!this._def.checks.find((ch) => ch.kind === "uuid");
    }
    get isNANOID() {
      return !!this._def.checks.find((ch) => ch.kind === "nanoid");
    }
    get isCUID() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid");
    }
    get isCUID2() {
      return !!this._def.checks.find((ch) => ch.kind === "cuid2");
    }
    get isULID() {
      return !!this._def.checks.find((ch) => ch.kind === "ulid");
    }
    get isIP() {
      return !!this._def.checks.find((ch) => ch.kind === "ip");
    }
    get isCIDR() {
      return !!this._def.checks.find((ch) => ch.kind === "cidr");
    }
    get isBase64() {
      return !!this._def.checks.find((ch) => ch.kind === "base64");
    }
    get isBase64url() {
      return !!this._def.checks.find((ch) => ch.kind === "base64url");
    }
    get minLength() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxLength() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodString.create = (params) => {
    return new ZodString({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodString,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  function floatSafeRemainder(val, step) {
    const valDecCount = (val.toString().split(".")[1] || "").length;
    const stepDecCount = (step.toString().split(".")[1] || "").length;
    const decCount = valDecCount > stepDecCount ? valDecCount : stepDecCount;
    const valInt = Number.parseInt(val.toFixed(decCount).replace(".", ""));
    const stepInt = Number.parseInt(step.toFixed(decCount).replace(".", ""));
    return valInt % stepInt / 10 ** decCount;
  }
  var ZodNumber = class _ZodNumber extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
      this.step = this.multipleOf;
    }
    _parse(input) {
      if (this._def.coerce) {
        input.data = Number(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.number) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.number,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "int") {
          if (!util.isInteger(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.invalid_type,
              expected: "integer",
              received: "float",
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              minimum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              maximum: check.value,
              type: "number",
              inclusive: check.inclusive,
              exact: false,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (floatSafeRemainder(input.data, check.value) !== 0) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "finite") {
          if (!Number.isFinite(input.data)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_finite,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new _ZodNumber({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new _ZodNumber({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    int(message) {
      return this._addCheck({
        kind: "int",
        message: errorUtil.toString(message)
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: 0,
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    finite(message) {
      return this._addCheck({
        kind: "finite",
        message: errorUtil.toString(message)
      });
    }
    safe(message) {
      return this._addCheck({
        kind: "min",
        inclusive: true,
        value: Number.MIN_SAFE_INTEGER,
        message: errorUtil.toString(message)
      })._addCheck({
        kind: "max",
        inclusive: true,
        value: Number.MAX_SAFE_INTEGER,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
    get isInt() {
      return !!this._def.checks.find((ch) => ch.kind === "int" || ch.kind === "multipleOf" && util.isInteger(ch.value));
    }
    get isFinite() {
      let max = null;
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "finite" || ch.kind === "int" || ch.kind === "multipleOf") {
          return true;
        } else if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        } else if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return Number.isFinite(min) && Number.isFinite(max);
    }
  };
  ZodNumber.create = (params) => {
    return new ZodNumber({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodNumber,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  var ZodBigInt = class _ZodBigInt extends ZodType {
    constructor() {
      super(...arguments);
      this.min = this.gte;
      this.max = this.lte;
    }
    _parse(input) {
      if (this._def.coerce) {
        try {
          input.data = BigInt(input.data);
        } catch {
          return this._getInvalidInput(input);
        }
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.bigint) {
        return this._getInvalidInput(input);
      }
      let ctx = void 0;
      const status = new ParseStatus();
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          const tooSmall = check.inclusive ? input.data < check.value : input.data <= check.value;
          if (tooSmall) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              type: "bigint",
              minimum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          const tooBig = check.inclusive ? input.data > check.value : input.data >= check.value;
          if (tooBig) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              type: "bigint",
              maximum: check.value,
              inclusive: check.inclusive,
              message: check.message
            });
            status.dirty();
          }
        } else if (check.kind === "multipleOf") {
          if (input.data % check.value !== BigInt(0)) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.not_multiple_of,
              multipleOf: check.value,
              message: check.message
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return { status: status.value, value: input.data };
    }
    _getInvalidInput(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.bigint,
        received: ctx.parsedType
      });
      return INVALID;
    }
    gte(value, message) {
      return this.setLimit("min", value, true, errorUtil.toString(message));
    }
    gt(value, message) {
      return this.setLimit("min", value, false, errorUtil.toString(message));
    }
    lte(value, message) {
      return this.setLimit("max", value, true, errorUtil.toString(message));
    }
    lt(value, message) {
      return this.setLimit("max", value, false, errorUtil.toString(message));
    }
    setLimit(kind, value, inclusive, message) {
      return new _ZodBigInt({
        ...this._def,
        checks: [
          ...this._def.checks,
          {
            kind,
            value,
            inclusive,
            message: errorUtil.toString(message)
          }
        ]
      });
    }
    _addCheck(check) {
      return new _ZodBigInt({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    positive(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    negative(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: false,
        message: errorUtil.toString(message)
      });
    }
    nonpositive(message) {
      return this._addCheck({
        kind: "max",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    nonnegative(message) {
      return this._addCheck({
        kind: "min",
        value: BigInt(0),
        inclusive: true,
        message: errorUtil.toString(message)
      });
    }
    multipleOf(value, message) {
      return this._addCheck({
        kind: "multipleOf",
        value,
        message: errorUtil.toString(message)
      });
    }
    get minValue() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min;
    }
    get maxValue() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max;
    }
  };
  ZodBigInt.create = (params) => {
    return new ZodBigInt({
      checks: [],
      typeName: ZodFirstPartyTypeKind.ZodBigInt,
      coerce: params?.coerce ?? false,
      ...processCreateParams(params)
    });
  };
  var ZodBoolean = class extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = Boolean(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.boolean) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.boolean,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodBoolean.create = (params) => {
    return new ZodBoolean({
      typeName: ZodFirstPartyTypeKind.ZodBoolean,
      coerce: params?.coerce || false,
      ...processCreateParams(params)
    });
  };
  var ZodDate = class _ZodDate extends ZodType {
    _parse(input) {
      if (this._def.coerce) {
        input.data = new Date(input.data);
      }
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.date) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.date,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      if (Number.isNaN(input.data.getTime())) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_date
        });
        return INVALID;
      }
      const status = new ParseStatus();
      let ctx = void 0;
      for (const check of this._def.checks) {
        if (check.kind === "min") {
          if (input.data.getTime() < check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_small,
              message: check.message,
              inclusive: true,
              exact: false,
              minimum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else if (check.kind === "max") {
          if (input.data.getTime() > check.value) {
            ctx = this._getOrReturnCtx(input, ctx);
            addIssueToContext(ctx, {
              code: ZodIssueCode.too_big,
              message: check.message,
              inclusive: true,
              exact: false,
              maximum: check.value,
              type: "date"
            });
            status.dirty();
          }
        } else {
          util.assertNever(check);
        }
      }
      return {
        status: status.value,
        value: new Date(input.data.getTime())
      };
    }
    _addCheck(check) {
      return new _ZodDate({
        ...this._def,
        checks: [...this._def.checks, check]
      });
    }
    min(minDate, message) {
      return this._addCheck({
        kind: "min",
        value: minDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    max(maxDate, message) {
      return this._addCheck({
        kind: "max",
        value: maxDate.getTime(),
        message: errorUtil.toString(message)
      });
    }
    get minDate() {
      let min = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "min") {
          if (min === null || ch.value > min)
            min = ch.value;
        }
      }
      return min != null ? new Date(min) : null;
    }
    get maxDate() {
      let max = null;
      for (const ch of this._def.checks) {
        if (ch.kind === "max") {
          if (max === null || ch.value < max)
            max = ch.value;
        }
      }
      return max != null ? new Date(max) : null;
    }
  };
  ZodDate.create = (params) => {
    return new ZodDate({
      checks: [],
      coerce: params?.coerce || false,
      typeName: ZodFirstPartyTypeKind.ZodDate,
      ...processCreateParams(params)
    });
  };
  var ZodSymbol = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.symbol) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.symbol,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodSymbol.create = (params) => {
    return new ZodSymbol({
      typeName: ZodFirstPartyTypeKind.ZodSymbol,
      ...processCreateParams(params)
    });
  };
  var ZodUndefined = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.undefined,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodUndefined.create = (params) => {
    return new ZodUndefined({
      typeName: ZodFirstPartyTypeKind.ZodUndefined,
      ...processCreateParams(params)
    });
  };
  var ZodNull = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.null) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.null,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodNull.create = (params) => {
    return new ZodNull({
      typeName: ZodFirstPartyTypeKind.ZodNull,
      ...processCreateParams(params)
    });
  };
  var ZodAny = class extends ZodType {
    constructor() {
      super(...arguments);
      this._any = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodAny.create = (params) => {
    return new ZodAny({
      typeName: ZodFirstPartyTypeKind.ZodAny,
      ...processCreateParams(params)
    });
  };
  var ZodUnknown = class extends ZodType {
    constructor() {
      super(...arguments);
      this._unknown = true;
    }
    _parse(input) {
      return OK(input.data);
    }
  };
  ZodUnknown.create = (params) => {
    return new ZodUnknown({
      typeName: ZodFirstPartyTypeKind.ZodUnknown,
      ...processCreateParams(params)
    });
  };
  var ZodNever = class extends ZodType {
    _parse(input) {
      const ctx = this._getOrReturnCtx(input);
      addIssueToContext(ctx, {
        code: ZodIssueCode.invalid_type,
        expected: ZodParsedType.never,
        received: ctx.parsedType
      });
      return INVALID;
    }
  };
  ZodNever.create = (params) => {
    return new ZodNever({
      typeName: ZodFirstPartyTypeKind.ZodNever,
      ...processCreateParams(params)
    });
  };
  var ZodVoid = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.undefined) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.void,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return OK(input.data);
    }
  };
  ZodVoid.create = (params) => {
    return new ZodVoid({
      typeName: ZodFirstPartyTypeKind.ZodVoid,
      ...processCreateParams(params)
    });
  };
  var ZodArray = class _ZodArray extends ZodType {
    _parse(input) {
      const { ctx, status } = this._processInputParams(input);
      const def = this._def;
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (def.exactLength !== null) {
        const tooBig = ctx.data.length > def.exactLength.value;
        const tooSmall = ctx.data.length < def.exactLength.value;
        if (tooBig || tooSmall) {
          addIssueToContext(ctx, {
            code: tooBig ? ZodIssueCode.too_big : ZodIssueCode.too_small,
            minimum: tooSmall ? def.exactLength.value : void 0,
            maximum: tooBig ? def.exactLength.value : void 0,
            type: "array",
            inclusive: true,
            exact: true,
            message: def.exactLength.message
          });
          status.dirty();
        }
      }
      if (def.minLength !== null) {
        if (ctx.data.length < def.minLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.minLength.message
          });
          status.dirty();
        }
      }
      if (def.maxLength !== null) {
        if (ctx.data.length > def.maxLength.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxLength.value,
            type: "array",
            inclusive: true,
            exact: false,
            message: def.maxLength.message
          });
          status.dirty();
        }
      }
      if (ctx.common.async) {
        return Promise.all([...ctx.data].map((item, i) => {
          return def.type._parseAsync(new ParseInputLazyPath(ctx, item, ctx.path, i));
        })).then((result2) => {
          return ParseStatus.mergeArray(status, result2);
        });
      }
      const result = [...ctx.data].map((item, i) => {
        return def.type._parseSync(new ParseInputLazyPath(ctx, item, ctx.path, i));
      });
      return ParseStatus.mergeArray(status, result);
    }
    get element() {
      return this._def.type;
    }
    min(minLength, message) {
      return new _ZodArray({
        ...this._def,
        minLength: { value: minLength, message: errorUtil.toString(message) }
      });
    }
    max(maxLength, message) {
      return new _ZodArray({
        ...this._def,
        maxLength: { value: maxLength, message: errorUtil.toString(message) }
      });
    }
    length(len, message) {
      return new _ZodArray({
        ...this._def,
        exactLength: { value: len, message: errorUtil.toString(message) }
      });
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodArray.create = (schema, params) => {
    return new ZodArray({
      type: schema,
      minLength: null,
      maxLength: null,
      exactLength: null,
      typeName: ZodFirstPartyTypeKind.ZodArray,
      ...processCreateParams(params)
    });
  };
  function deepPartialify(schema) {
    if (schema instanceof ZodObject) {
      const newShape = {};
      for (const key in schema.shape) {
        const fieldSchema = schema.shape[key];
        newShape[key] = ZodOptional.create(deepPartialify(fieldSchema));
      }
      return new ZodObject({
        ...schema._def,
        shape: () => newShape
      });
    } else if (schema instanceof ZodArray) {
      return new ZodArray({
        ...schema._def,
        type: deepPartialify(schema.element)
      });
    } else if (schema instanceof ZodOptional) {
      return ZodOptional.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodNullable) {
      return ZodNullable.create(deepPartialify(schema.unwrap()));
    } else if (schema instanceof ZodTuple) {
      return ZodTuple.create(schema.items.map((item) => deepPartialify(item)));
    } else {
      return schema;
    }
  }
  var ZodObject = class _ZodObject extends ZodType {
    constructor() {
      super(...arguments);
      this._cached = null;
      this.nonstrict = this.passthrough;
      this.augment = this.extend;
    }
    _getCached() {
      if (this._cached !== null)
        return this._cached;
      const shape = this._def.shape();
      const keys = util.objectKeys(shape);
      this._cached = { shape, keys };
      return this._cached;
    }
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.object) {
        const ctx2 = this._getOrReturnCtx(input);
        addIssueToContext(ctx2, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx2.parsedType
        });
        return INVALID;
      }
      const { status, ctx } = this._processInputParams(input);
      const { shape, keys: shapeKeys } = this._getCached();
      const extraKeys = [];
      if (!(this._def.catchall instanceof ZodNever && this._def.unknownKeys === "strip")) {
        for (const key in ctx.data) {
          if (!shapeKeys.includes(key)) {
            extraKeys.push(key);
          }
        }
      }
      const pairs = [];
      for (const key of shapeKeys) {
        const keyValidator = shape[key];
        const value = ctx.data[key];
        pairs.push({
          key: { status: "valid", value: key },
          value: keyValidator._parse(new ParseInputLazyPath(ctx, value, ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (this._def.catchall instanceof ZodNever) {
        const unknownKeys = this._def.unknownKeys;
        if (unknownKeys === "passthrough") {
          for (const key of extraKeys) {
            pairs.push({
              key: { status: "valid", value: key },
              value: { status: "valid", value: ctx.data[key] }
            });
          }
        } else if (unknownKeys === "strict") {
          if (extraKeys.length > 0) {
            addIssueToContext(ctx, {
              code: ZodIssueCode.unrecognized_keys,
              keys: extraKeys
            });
            status.dirty();
          }
        } else if (unknownKeys === "strip") {
        } else {
          throw new Error(`Internal ZodObject error: invalid unknownKeys value.`);
        }
      } else {
        const catchall = this._def.catchall;
        for (const key of extraKeys) {
          const value = ctx.data[key];
          pairs.push({
            key: { status: "valid", value: key },
            value: catchall._parse(
              new ParseInputLazyPath(ctx, value, ctx.path, key)
              //, ctx.child(key), value, getParsedType(value)
            ),
            alwaysSet: key in ctx.data
          });
        }
      }
      if (ctx.common.async) {
        return Promise.resolve().then(async () => {
          const syncPairs = [];
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            syncPairs.push({
              key,
              value,
              alwaysSet: pair.alwaysSet
            });
          }
          return syncPairs;
        }).then((syncPairs) => {
          return ParseStatus.mergeObjectSync(status, syncPairs);
        });
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get shape() {
      return this._def.shape();
    }
    strict(message) {
      errorUtil.errToObj;
      return new _ZodObject({
        ...this._def,
        unknownKeys: "strict",
        ...message !== void 0 ? {
          errorMap: (issue, ctx) => {
            const defaultError = this._def.errorMap?.(issue, ctx).message ?? ctx.defaultError;
            if (issue.code === "unrecognized_keys")
              return {
                message: errorUtil.errToObj(message).message ?? defaultError
              };
            return {
              message: defaultError
            };
          }
        } : {}
      });
    }
    strip() {
      return new _ZodObject({
        ...this._def,
        unknownKeys: "strip"
      });
    }
    passthrough() {
      return new _ZodObject({
        ...this._def,
        unknownKeys: "passthrough"
      });
    }
    // const AugmentFactory =
    //   <Def extends ZodObjectDef>(def: Def) =>
    //   <Augmentation extends ZodRawShape>(
    //     augmentation: Augmentation
    //   ): ZodObject<
    //     extendShape<ReturnType<Def["shape"]>, Augmentation>,
    //     Def["unknownKeys"],
    //     Def["catchall"]
    //   > => {
    //     return new ZodObject({
    //       ...def,
    //       shape: () => ({
    //         ...def.shape(),
    //         ...augmentation,
    //       }),
    //     }) as any;
    //   };
    extend(augmentation) {
      return new _ZodObject({
        ...this._def,
        shape: () => ({
          ...this._def.shape(),
          ...augmentation
        })
      });
    }
    /**
     * Prior to zod@1.0.12 there was a bug in the
     * inferred type of merged objects. Please
     * upgrade if you are experiencing issues.
     */
    merge(merging) {
      const merged = new _ZodObject({
        unknownKeys: merging._def.unknownKeys,
        catchall: merging._def.catchall,
        shape: () => ({
          ...this._def.shape(),
          ...merging._def.shape()
        }),
        typeName: ZodFirstPartyTypeKind.ZodObject
      });
      return merged;
    }
    // merge<
    //   Incoming extends AnyZodObject,
    //   Augmentation extends Incoming["shape"],
    //   NewOutput extends {
    //     [k in keyof Augmentation | keyof Output]: k extends keyof Augmentation
    //       ? Augmentation[k]["_output"]
    //       : k extends keyof Output
    //       ? Output[k]
    //       : never;
    //   },
    //   NewInput extends {
    //     [k in keyof Augmentation | keyof Input]: k extends keyof Augmentation
    //       ? Augmentation[k]["_input"]
    //       : k extends keyof Input
    //       ? Input[k]
    //       : never;
    //   }
    // >(
    //   merging: Incoming
    // ): ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"],
    //   NewOutput,
    //   NewInput
    // > {
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    setKey(key, schema) {
      return this.augment({ [key]: schema });
    }
    // merge<Incoming extends AnyZodObject>(
    //   merging: Incoming
    // ): //ZodObject<T & Incoming["_shape"], UnknownKeys, Catchall> = (merging) => {
    // ZodObject<
    //   extendShape<T, ReturnType<Incoming["_def"]["shape"]>>,
    //   Incoming["_def"]["unknownKeys"],
    //   Incoming["_def"]["catchall"]
    // > {
    //   // const mergedShape = objectUtil.mergeShapes(
    //   //   this._def.shape(),
    //   //   merging._def.shape()
    //   // );
    //   const merged: any = new ZodObject({
    //     unknownKeys: merging._def.unknownKeys,
    //     catchall: merging._def.catchall,
    //     shape: () =>
    //       objectUtil.mergeShapes(this._def.shape(), merging._def.shape()),
    //     typeName: ZodFirstPartyTypeKind.ZodObject,
    //   }) as any;
    //   return merged;
    // }
    catchall(index) {
      return new _ZodObject({
        ...this._def,
        catchall: index
      });
    }
    pick(mask) {
      const shape = {};
      for (const key of util.objectKeys(mask)) {
        if (mask[key] && this.shape[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    omit(mask) {
      const shape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (!mask[key]) {
          shape[key] = this.shape[key];
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => shape
      });
    }
    /**
     * @deprecated
     */
    deepPartial() {
      return deepPartialify(this);
    }
    partial(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        const fieldSchema = this.shape[key];
        if (mask && !mask[key]) {
          newShape[key] = fieldSchema;
        } else {
          newShape[key] = fieldSchema.optional();
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    required(mask) {
      const newShape = {};
      for (const key of util.objectKeys(this.shape)) {
        if (mask && !mask[key]) {
          newShape[key] = this.shape[key];
        } else {
          const fieldSchema = this.shape[key];
          let newField = fieldSchema;
          while (newField instanceof ZodOptional) {
            newField = newField._def.innerType;
          }
          newShape[key] = newField;
        }
      }
      return new _ZodObject({
        ...this._def,
        shape: () => newShape
      });
    }
    keyof() {
      return createZodEnum(util.objectKeys(this.shape));
    }
  };
  ZodObject.create = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.strictCreate = (shape, params) => {
    return new ZodObject({
      shape: () => shape,
      unknownKeys: "strict",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  ZodObject.lazycreate = (shape, params) => {
    return new ZodObject({
      shape,
      unknownKeys: "strip",
      catchall: ZodNever.create(),
      typeName: ZodFirstPartyTypeKind.ZodObject,
      ...processCreateParams(params)
    });
  };
  var ZodUnion = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const options = this._def.options;
      function handleResults(results) {
        for (const result of results) {
          if (result.result.status === "valid") {
            return result.result;
          }
        }
        for (const result of results) {
          if (result.result.status === "dirty") {
            ctx.common.issues.push(...result.ctx.common.issues);
            return result.result;
          }
        }
        const unionErrors = results.map((result) => new ZodError(result.ctx.common.issues));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return Promise.all(options.map(async (option) => {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          return {
            result: await option._parseAsync({
              data: ctx.data,
              path: ctx.path,
              parent: childCtx
            }),
            ctx: childCtx
          };
        })).then(handleResults);
      } else {
        let dirty = void 0;
        const issues = [];
        for (const option of options) {
          const childCtx = {
            ...ctx,
            common: {
              ...ctx.common,
              issues: []
            },
            parent: null
          };
          const result = option._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: childCtx
          });
          if (result.status === "valid") {
            return result;
          } else if (result.status === "dirty" && !dirty) {
            dirty = { result, ctx: childCtx };
          }
          if (childCtx.common.issues.length) {
            issues.push(childCtx.common.issues);
          }
        }
        if (dirty) {
          ctx.common.issues.push(...dirty.ctx.common.issues);
          return dirty.result;
        }
        const unionErrors = issues.map((issues2) => new ZodError(issues2));
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union,
          unionErrors
        });
        return INVALID;
      }
    }
    get options() {
      return this._def.options;
    }
  };
  ZodUnion.create = (types, params) => {
    return new ZodUnion({
      options: types,
      typeName: ZodFirstPartyTypeKind.ZodUnion,
      ...processCreateParams(params)
    });
  };
  var getDiscriminator = (type) => {
    if (type instanceof ZodLazy) {
      return getDiscriminator(type.schema);
    } else if (type instanceof ZodEffects) {
      return getDiscriminator(type.innerType());
    } else if (type instanceof ZodLiteral) {
      return [type.value];
    } else if (type instanceof ZodEnum) {
      return type.options;
    } else if (type instanceof ZodNativeEnum) {
      return util.objectValues(type.enum);
    } else if (type instanceof ZodDefault) {
      return getDiscriminator(type._def.innerType);
    } else if (type instanceof ZodUndefined) {
      return [void 0];
    } else if (type instanceof ZodNull) {
      return [null];
    } else if (type instanceof ZodOptional) {
      return [void 0, ...getDiscriminator(type.unwrap())];
    } else if (type instanceof ZodNullable) {
      return [null, ...getDiscriminator(type.unwrap())];
    } else if (type instanceof ZodBranded) {
      return getDiscriminator(type.unwrap());
    } else if (type instanceof ZodReadonly) {
      return getDiscriminator(type.unwrap());
    } else if (type instanceof ZodCatch) {
      return getDiscriminator(type._def.innerType);
    } else {
      return [];
    }
  };
  var ZodDiscriminatedUnion = class _ZodDiscriminatedUnion extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const discriminator = this.discriminator;
      const discriminatorValue = ctx.data[discriminator];
      const option = this.optionsMap.get(discriminatorValue);
      if (!option) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_union_discriminator,
          options: Array.from(this.optionsMap.keys()),
          path: [discriminator]
        });
        return INVALID;
      }
      if (ctx.common.async) {
        return option._parseAsync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      } else {
        return option._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
      }
    }
    get discriminator() {
      return this._def.discriminator;
    }
    get options() {
      return this._def.options;
    }
    get optionsMap() {
      return this._def.optionsMap;
    }
    /**
     * The constructor of the discriminated union schema. Its behaviour is very similar to that of the normal z.union() constructor.
     * However, it only allows a union of objects, all of which need to share a discriminator property. This property must
     * have a different value for each object in the union.
     * @param discriminator the name of the discriminator property
     * @param types an array of object schemas
     * @param params
     */
    static create(discriminator, options, params) {
      const optionsMap = /* @__PURE__ */ new Map();
      for (const type of options) {
        const discriminatorValues = getDiscriminator(type.shape[discriminator]);
        if (!discriminatorValues.length) {
          throw new Error(`A discriminator value for key \`${discriminator}\` could not be extracted from all schema options`);
        }
        for (const value of discriminatorValues) {
          if (optionsMap.has(value)) {
            throw new Error(`Discriminator property ${String(discriminator)} has duplicate value ${String(value)}`);
          }
          optionsMap.set(value, type);
        }
      }
      return new _ZodDiscriminatedUnion({
        typeName: ZodFirstPartyTypeKind.ZodDiscriminatedUnion,
        discriminator,
        options,
        optionsMap,
        ...processCreateParams(params)
      });
    }
  };
  function mergeValues(a, b) {
    const aType = getParsedType(a);
    const bType = getParsedType(b);
    if (a === b) {
      return { valid: true, data: a };
    } else if (aType === ZodParsedType.object && bType === ZodParsedType.object) {
      const bKeys = util.objectKeys(b);
      const sharedKeys = util.objectKeys(a).filter((key) => bKeys.indexOf(key) !== -1);
      const newObj = { ...a, ...b };
      for (const key of sharedKeys) {
        const sharedValue = mergeValues(a[key], b[key]);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newObj[key] = sharedValue.data;
      }
      return { valid: true, data: newObj };
    } else if (aType === ZodParsedType.array && bType === ZodParsedType.array) {
      if (a.length !== b.length) {
        return { valid: false };
      }
      const newArray = [];
      for (let index = 0; index < a.length; index++) {
        const itemA = a[index];
        const itemB = b[index];
        const sharedValue = mergeValues(itemA, itemB);
        if (!sharedValue.valid) {
          return { valid: false };
        }
        newArray.push(sharedValue.data);
      }
      return { valid: true, data: newArray };
    } else if (aType === ZodParsedType.date && bType === ZodParsedType.date && +a === +b) {
      return { valid: true, data: a };
    } else {
      return { valid: false };
    }
  }
  var ZodIntersection = class extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const handleParsed = (parsedLeft, parsedRight) => {
        if (isAborted(parsedLeft) || isAborted(parsedRight)) {
          return INVALID;
        }
        const merged = mergeValues(parsedLeft.value, parsedRight.value);
        if (!merged.valid) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.invalid_intersection_types
          });
          return INVALID;
        }
        if (isDirty(parsedLeft) || isDirty(parsedRight)) {
          status.dirty();
        }
        return { status: status.value, value: merged.data };
      };
      if (ctx.common.async) {
        return Promise.all([
          this._def.left._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          }),
          this._def.right._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          })
        ]).then(([left, right]) => handleParsed(left, right));
      } else {
        return handleParsed(this._def.left._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }), this._def.right._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        }));
      }
    }
  };
  ZodIntersection.create = (left, right, params) => {
    return new ZodIntersection({
      left,
      right,
      typeName: ZodFirstPartyTypeKind.ZodIntersection,
      ...processCreateParams(params)
    });
  };
  var ZodTuple = class _ZodTuple extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.array) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.array,
          received: ctx.parsedType
        });
        return INVALID;
      }
      if (ctx.data.length < this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_small,
          minimum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        return INVALID;
      }
      const rest = this._def.rest;
      if (!rest && ctx.data.length > this._def.items.length) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.too_big,
          maximum: this._def.items.length,
          inclusive: true,
          exact: false,
          type: "array"
        });
        status.dirty();
      }
      const items = [...ctx.data].map((item, itemIndex) => {
        const schema = this._def.items[itemIndex] || this._def.rest;
        if (!schema)
          return null;
        return schema._parse(new ParseInputLazyPath(ctx, item, ctx.path, itemIndex));
      }).filter((x) => !!x);
      if (ctx.common.async) {
        return Promise.all(items).then((results) => {
          return ParseStatus.mergeArray(status, results);
        });
      } else {
        return ParseStatus.mergeArray(status, items);
      }
    }
    get items() {
      return this._def.items;
    }
    rest(rest) {
      return new _ZodTuple({
        ...this._def,
        rest
      });
    }
  };
  ZodTuple.create = (schemas, params) => {
    if (!Array.isArray(schemas)) {
      throw new Error("You must pass an array of schemas to z.tuple([ ... ])");
    }
    return new ZodTuple({
      items: schemas,
      typeName: ZodFirstPartyTypeKind.ZodTuple,
      rest: null,
      ...processCreateParams(params)
    });
  };
  var ZodRecord = class _ZodRecord extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.object) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.object,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const pairs = [];
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      for (const key in ctx.data) {
        pairs.push({
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, key)),
          value: valueType._parse(new ParseInputLazyPath(ctx, ctx.data[key], ctx.path, key)),
          alwaysSet: key in ctx.data
        });
      }
      if (ctx.common.async) {
        return ParseStatus.mergeObjectAsync(status, pairs);
      } else {
        return ParseStatus.mergeObjectSync(status, pairs);
      }
    }
    get element() {
      return this._def.valueType;
    }
    static create(first, second, third) {
      if (second instanceof ZodType) {
        return new _ZodRecord({
          keyType: first,
          valueType: second,
          typeName: ZodFirstPartyTypeKind.ZodRecord,
          ...processCreateParams(third)
        });
      }
      return new _ZodRecord({
        keyType: ZodString.create(),
        valueType: first,
        typeName: ZodFirstPartyTypeKind.ZodRecord,
        ...processCreateParams(second)
      });
    }
  };
  var ZodMap = class extends ZodType {
    get keySchema() {
      return this._def.keyType;
    }
    get valueSchema() {
      return this._def.valueType;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.map) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.map,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const keyType = this._def.keyType;
      const valueType = this._def.valueType;
      const pairs = [...ctx.data.entries()].map(([key, value], index) => {
        return {
          key: keyType._parse(new ParseInputLazyPath(ctx, key, ctx.path, [index, "key"])),
          value: valueType._parse(new ParseInputLazyPath(ctx, value, ctx.path, [index, "value"]))
        };
      });
      if (ctx.common.async) {
        const finalMap = /* @__PURE__ */ new Map();
        return Promise.resolve().then(async () => {
          for (const pair of pairs) {
            const key = await pair.key;
            const value = await pair.value;
            if (key.status === "aborted" || value.status === "aborted") {
              return INVALID;
            }
            if (key.status === "dirty" || value.status === "dirty") {
              status.dirty();
            }
            finalMap.set(key.value, value.value);
          }
          return { status: status.value, value: finalMap };
        });
      } else {
        const finalMap = /* @__PURE__ */ new Map();
        for (const pair of pairs) {
          const key = pair.key;
          const value = pair.value;
          if (key.status === "aborted" || value.status === "aborted") {
            return INVALID;
          }
          if (key.status === "dirty" || value.status === "dirty") {
            status.dirty();
          }
          finalMap.set(key.value, value.value);
        }
        return { status: status.value, value: finalMap };
      }
    }
  };
  ZodMap.create = (keyType, valueType, params) => {
    return new ZodMap({
      valueType,
      keyType,
      typeName: ZodFirstPartyTypeKind.ZodMap,
      ...processCreateParams(params)
    });
  };
  var ZodSet = class _ZodSet extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.set) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.set,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const def = this._def;
      if (def.minSize !== null) {
        if (ctx.data.size < def.minSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_small,
            minimum: def.minSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.minSize.message
          });
          status.dirty();
        }
      }
      if (def.maxSize !== null) {
        if (ctx.data.size > def.maxSize.value) {
          addIssueToContext(ctx, {
            code: ZodIssueCode.too_big,
            maximum: def.maxSize.value,
            type: "set",
            inclusive: true,
            exact: false,
            message: def.maxSize.message
          });
          status.dirty();
        }
      }
      const valueType = this._def.valueType;
      function finalizeSet(elements2) {
        const parsedSet = /* @__PURE__ */ new Set();
        for (const element of elements2) {
          if (element.status === "aborted")
            return INVALID;
          if (element.status === "dirty")
            status.dirty();
          parsedSet.add(element.value);
        }
        return { status: status.value, value: parsedSet };
      }
      const elements = [...ctx.data.values()].map((item, i) => valueType._parse(new ParseInputLazyPath(ctx, item, ctx.path, i)));
      if (ctx.common.async) {
        return Promise.all(elements).then((elements2) => finalizeSet(elements2));
      } else {
        return finalizeSet(elements);
      }
    }
    min(minSize, message) {
      return new _ZodSet({
        ...this._def,
        minSize: { value: minSize, message: errorUtil.toString(message) }
      });
    }
    max(maxSize, message) {
      return new _ZodSet({
        ...this._def,
        maxSize: { value: maxSize, message: errorUtil.toString(message) }
      });
    }
    size(size, message) {
      return this.min(size, message).max(size, message);
    }
    nonempty(message) {
      return this.min(1, message);
    }
  };
  ZodSet.create = (valueType, params) => {
    return new ZodSet({
      valueType,
      minSize: null,
      maxSize: null,
      typeName: ZodFirstPartyTypeKind.ZodSet,
      ...processCreateParams(params)
    });
  };
  var ZodFunction = class _ZodFunction extends ZodType {
    constructor() {
      super(...arguments);
      this.validate = this.implement;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.function) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.function,
          received: ctx.parsedType
        });
        return INVALID;
      }
      function makeArgsIssue(args, error) {
        return makeIssue({
          data: args,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_arguments,
            argumentsError: error
          }
        });
      }
      function makeReturnsIssue(returns, error) {
        return makeIssue({
          data: returns,
          path: ctx.path,
          errorMaps: [ctx.common.contextualErrorMap, ctx.schemaErrorMap, getErrorMap(), en_default].filter((x) => !!x),
          issueData: {
            code: ZodIssueCode.invalid_return_type,
            returnTypeError: error
          }
        });
      }
      const params = { errorMap: ctx.common.contextualErrorMap };
      const fn = ctx.data;
      if (this._def.returns instanceof ZodPromise) {
        const me = this;
        return OK(async function(...args) {
          const error = new ZodError([]);
          const parsedArgs = await me._def.args.parseAsync(args, params).catch((e) => {
            error.addIssue(makeArgsIssue(args, e));
            throw error;
          });
          const result = await Reflect.apply(fn, this, parsedArgs);
          const parsedReturns = await me._def.returns._def.type.parseAsync(result, params).catch((e) => {
            error.addIssue(makeReturnsIssue(result, e));
            throw error;
          });
          return parsedReturns;
        });
      } else {
        const me = this;
        return OK(function(...args) {
          const parsedArgs = me._def.args.safeParse(args, params);
          if (!parsedArgs.success) {
            throw new ZodError([makeArgsIssue(args, parsedArgs.error)]);
          }
          const result = Reflect.apply(fn, this, parsedArgs.data);
          const parsedReturns = me._def.returns.safeParse(result, params);
          if (!parsedReturns.success) {
            throw new ZodError([makeReturnsIssue(result, parsedReturns.error)]);
          }
          return parsedReturns.data;
        });
      }
    }
    parameters() {
      return this._def.args;
    }
    returnType() {
      return this._def.returns;
    }
    args(...items) {
      return new _ZodFunction({
        ...this._def,
        args: ZodTuple.create(items).rest(ZodUnknown.create())
      });
    }
    returns(returnType) {
      return new _ZodFunction({
        ...this._def,
        returns: returnType
      });
    }
    implement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    strictImplement(func) {
      const validatedFunc = this.parse(func);
      return validatedFunc;
    }
    static create(args, returns, params) {
      return new _ZodFunction({
        args: args ? args : ZodTuple.create([]).rest(ZodUnknown.create()),
        returns: returns || ZodUnknown.create(),
        typeName: ZodFirstPartyTypeKind.ZodFunction,
        ...processCreateParams(params)
      });
    }
  };
  var ZodLazy = class extends ZodType {
    get schema() {
      return this._def.getter();
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const lazySchema = this._def.getter();
      return lazySchema._parse({ data: ctx.data, path: ctx.path, parent: ctx });
    }
  };
  ZodLazy.create = (getter, params) => {
    return new ZodLazy({
      getter,
      typeName: ZodFirstPartyTypeKind.ZodLazy,
      ...processCreateParams(params)
    });
  };
  var ZodLiteral = class extends ZodType {
    _parse(input) {
      if (input.data !== this._def.value) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_literal,
          expected: this._def.value
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
    get value() {
      return this._def.value;
    }
  };
  ZodLiteral.create = (value, params) => {
    return new ZodLiteral({
      value,
      typeName: ZodFirstPartyTypeKind.ZodLiteral,
      ...processCreateParams(params)
    });
  };
  function createZodEnum(values, params) {
    return new ZodEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodEnum,
      ...processCreateParams(params)
    });
  }
  var ZodEnum = class _ZodEnum extends ZodType {
    _parse(input) {
      if (typeof input.data !== "string") {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(this._def.values);
      }
      if (!this._cache.has(input.data)) {
        const ctx = this._getOrReturnCtx(input);
        const expectedValues = this._def.values;
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get options() {
      return this._def.values;
    }
    get enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Values() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    get Enum() {
      const enumValues = {};
      for (const val of this._def.values) {
        enumValues[val] = val;
      }
      return enumValues;
    }
    extract(values, newDef = this._def) {
      return _ZodEnum.create(values, {
        ...this._def,
        ...newDef
      });
    }
    exclude(values, newDef = this._def) {
      return _ZodEnum.create(this.options.filter((opt) => !values.includes(opt)), {
        ...this._def,
        ...newDef
      });
    }
  };
  ZodEnum.create = createZodEnum;
  var ZodNativeEnum = class extends ZodType {
    _parse(input) {
      const nativeEnumValues = util.getValidEnumValues(this._def.values);
      const ctx = this._getOrReturnCtx(input);
      if (ctx.parsedType !== ZodParsedType.string && ctx.parsedType !== ZodParsedType.number) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          expected: util.joinValues(expectedValues),
          received: ctx.parsedType,
          code: ZodIssueCode.invalid_type
        });
        return INVALID;
      }
      if (!this._cache) {
        this._cache = new Set(util.getValidEnumValues(this._def.values));
      }
      if (!this._cache.has(input.data)) {
        const expectedValues = util.objectValues(nativeEnumValues);
        addIssueToContext(ctx, {
          received: ctx.data,
          code: ZodIssueCode.invalid_enum_value,
          options: expectedValues
        });
        return INVALID;
      }
      return OK(input.data);
    }
    get enum() {
      return this._def.values;
    }
  };
  ZodNativeEnum.create = (values, params) => {
    return new ZodNativeEnum({
      values,
      typeName: ZodFirstPartyTypeKind.ZodNativeEnum,
      ...processCreateParams(params)
    });
  };
  var ZodPromise = class extends ZodType {
    unwrap() {
      return this._def.type;
    }
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      if (ctx.parsedType !== ZodParsedType.promise && ctx.common.async === false) {
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.promise,
          received: ctx.parsedType
        });
        return INVALID;
      }
      const promisified = ctx.parsedType === ZodParsedType.promise ? ctx.data : Promise.resolve(ctx.data);
      return OK(promisified.then((data) => {
        return this._def.type.parseAsync(data, {
          path: ctx.path,
          errorMap: ctx.common.contextualErrorMap
        });
      }));
    }
  };
  ZodPromise.create = (schema, params) => {
    return new ZodPromise({
      type: schema,
      typeName: ZodFirstPartyTypeKind.ZodPromise,
      ...processCreateParams(params)
    });
  };
  var ZodEffects = class extends ZodType {
    innerType() {
      return this._def.schema;
    }
    sourceType() {
      return this._def.schema._def.typeName === ZodFirstPartyTypeKind.ZodEffects ? this._def.schema.sourceType() : this._def.schema;
    }
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      const effect = this._def.effect || null;
      const checkCtx = {
        addIssue: (arg) => {
          addIssueToContext(ctx, arg);
          if (arg.fatal) {
            status.abort();
          } else {
            status.dirty();
          }
        },
        get path() {
          return ctx.path;
        }
      };
      checkCtx.addIssue = checkCtx.addIssue.bind(checkCtx);
      if (effect.type === "preprocess") {
        const processed = effect.transform(ctx.data, checkCtx);
        if (ctx.common.async) {
          return Promise.resolve(processed).then(async (processed2) => {
            if (status.value === "aborted")
              return INVALID;
            const result = await this._def.schema._parseAsync({
              data: processed2,
              path: ctx.path,
              parent: ctx
            });
            if (result.status === "aborted")
              return INVALID;
            if (result.status === "dirty")
              return DIRTY(result.value);
            if (status.value === "dirty")
              return DIRTY(result.value);
            return result;
          });
        } else {
          if (status.value === "aborted")
            return INVALID;
          const result = this._def.schema._parseSync({
            data: processed,
            path: ctx.path,
            parent: ctx
          });
          if (result.status === "aborted")
            return INVALID;
          if (result.status === "dirty")
            return DIRTY(result.value);
          if (status.value === "dirty")
            return DIRTY(result.value);
          return result;
        }
      }
      if (effect.type === "refinement") {
        const executeRefinement = (acc) => {
          const result = effect.refinement(acc, checkCtx);
          if (ctx.common.async) {
            return Promise.resolve(result);
          }
          if (result instanceof Promise) {
            throw new Error("Async refinement encountered during synchronous parse operation. Use .parseAsync instead.");
          }
          return acc;
        };
        if (ctx.common.async === false) {
          const inner = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inner.status === "aborted")
            return INVALID;
          if (inner.status === "dirty")
            status.dirty();
          executeRefinement(inner.value);
          return { status: status.value, value: inner.value };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((inner) => {
            if (inner.status === "aborted")
              return INVALID;
            if (inner.status === "dirty")
              status.dirty();
            return executeRefinement(inner.value).then(() => {
              return { status: status.value, value: inner.value };
            });
          });
        }
      }
      if (effect.type === "transform") {
        if (ctx.common.async === false) {
          const base = this._def.schema._parseSync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (!isValid(base))
            return INVALID;
          const result = effect.transform(base.value, checkCtx);
          if (result instanceof Promise) {
            throw new Error(`Asynchronous transform encountered during synchronous parse operation. Use .parseAsync instead.`);
          }
          return { status: status.value, value: result };
        } else {
          return this._def.schema._parseAsync({ data: ctx.data, path: ctx.path, parent: ctx }).then((base) => {
            if (!isValid(base))
              return INVALID;
            return Promise.resolve(effect.transform(base.value, checkCtx)).then((result) => ({
              status: status.value,
              value: result
            }));
          });
        }
      }
      util.assertNever(effect);
    }
  };
  ZodEffects.create = (schema, effect, params) => {
    return new ZodEffects({
      schema,
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      effect,
      ...processCreateParams(params)
    });
  };
  ZodEffects.createWithPreprocess = (preprocess, schema, params) => {
    return new ZodEffects({
      schema,
      effect: { type: "preprocess", transform: preprocess },
      typeName: ZodFirstPartyTypeKind.ZodEffects,
      ...processCreateParams(params)
    });
  };
  var ZodOptional = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.undefined) {
        return OK(void 0);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodOptional.create = (type, params) => {
    return new ZodOptional({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodOptional,
      ...processCreateParams(params)
    });
  };
  var ZodNullable = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType === ZodParsedType.null) {
        return OK(null);
      }
      return this._def.innerType._parse(input);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodNullable.create = (type, params) => {
    return new ZodNullable({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodNullable,
      ...processCreateParams(params)
    });
  };
  var ZodDefault = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      let data = ctx.data;
      if (ctx.parsedType === ZodParsedType.undefined) {
        data = this._def.defaultValue();
      }
      return this._def.innerType._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    removeDefault() {
      return this._def.innerType;
    }
  };
  ZodDefault.create = (type, params) => {
    return new ZodDefault({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodDefault,
      defaultValue: typeof params.default === "function" ? params.default : () => params.default,
      ...processCreateParams(params)
    });
  };
  var ZodCatch = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const newCtx = {
        ...ctx,
        common: {
          ...ctx.common,
          issues: []
        }
      };
      const result = this._def.innerType._parse({
        data: newCtx.data,
        path: newCtx.path,
        parent: {
          ...newCtx
        }
      });
      if (isAsync(result)) {
        return result.then((result2) => {
          return {
            status: "valid",
            value: result2.status === "valid" ? result2.value : this._def.catchValue({
              get error() {
                return new ZodError(newCtx.common.issues);
              },
              input: newCtx.data
            })
          };
        });
      } else {
        return {
          status: "valid",
          value: result.status === "valid" ? result.value : this._def.catchValue({
            get error() {
              return new ZodError(newCtx.common.issues);
            },
            input: newCtx.data
          })
        };
      }
    }
    removeCatch() {
      return this._def.innerType;
    }
  };
  ZodCatch.create = (type, params) => {
    return new ZodCatch({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodCatch,
      catchValue: typeof params.catch === "function" ? params.catch : () => params.catch,
      ...processCreateParams(params)
    });
  };
  var ZodNaN = class extends ZodType {
    _parse(input) {
      const parsedType = this._getType(input);
      if (parsedType !== ZodParsedType.nan) {
        const ctx = this._getOrReturnCtx(input);
        addIssueToContext(ctx, {
          code: ZodIssueCode.invalid_type,
          expected: ZodParsedType.nan,
          received: ctx.parsedType
        });
        return INVALID;
      }
      return { status: "valid", value: input.data };
    }
  };
  ZodNaN.create = (params) => {
    return new ZodNaN({
      typeName: ZodFirstPartyTypeKind.ZodNaN,
      ...processCreateParams(params)
    });
  };
  var BRAND = /* @__PURE__ */ Symbol("zod_brand");
  var ZodBranded = class extends ZodType {
    _parse(input) {
      const { ctx } = this._processInputParams(input);
      const data = ctx.data;
      return this._def.type._parse({
        data,
        path: ctx.path,
        parent: ctx
      });
    }
    unwrap() {
      return this._def.type;
    }
  };
  var ZodPipeline = class _ZodPipeline extends ZodType {
    _parse(input) {
      const { status, ctx } = this._processInputParams(input);
      if (ctx.common.async) {
        const handleAsync = async () => {
          const inResult = await this._def.in._parseAsync({
            data: ctx.data,
            path: ctx.path,
            parent: ctx
          });
          if (inResult.status === "aborted")
            return INVALID;
          if (inResult.status === "dirty") {
            status.dirty();
            return DIRTY(inResult.value);
          } else {
            return this._def.out._parseAsync({
              data: inResult.value,
              path: ctx.path,
              parent: ctx
            });
          }
        };
        return handleAsync();
      } else {
        const inResult = this._def.in._parseSync({
          data: ctx.data,
          path: ctx.path,
          parent: ctx
        });
        if (inResult.status === "aborted")
          return INVALID;
        if (inResult.status === "dirty") {
          status.dirty();
          return {
            status: "dirty",
            value: inResult.value
          };
        } else {
          return this._def.out._parseSync({
            data: inResult.value,
            path: ctx.path,
            parent: ctx
          });
        }
      }
    }
    static create(a, b) {
      return new _ZodPipeline({
        in: a,
        out: b,
        typeName: ZodFirstPartyTypeKind.ZodPipeline
      });
    }
  };
  var ZodReadonly = class extends ZodType {
    _parse(input) {
      const result = this._def.innerType._parse(input);
      const freeze = (data) => {
        if (isValid(data)) {
          data.value = Object.freeze(data.value);
        }
        return data;
      };
      return isAsync(result) ? result.then((data) => freeze(data)) : freeze(result);
    }
    unwrap() {
      return this._def.innerType;
    }
  };
  ZodReadonly.create = (type, params) => {
    return new ZodReadonly({
      innerType: type,
      typeName: ZodFirstPartyTypeKind.ZodReadonly,
      ...processCreateParams(params)
    });
  };
  function cleanParams(params, data) {
    const p = typeof params === "function" ? params(data) : typeof params === "string" ? { message: params } : params;
    const p2 = typeof p === "string" ? { message: p } : p;
    return p2;
  }
  function custom(check, _params = {}, fatal) {
    if (check)
      return ZodAny.create().superRefine((data, ctx) => {
        const r = check(data);
        if (r instanceof Promise) {
          return r.then((r2) => {
            if (!r2) {
              const params = cleanParams(_params, data);
              const _fatal = params.fatal ?? fatal ?? true;
              ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
            }
          });
        }
        if (!r) {
          const params = cleanParams(_params, data);
          const _fatal = params.fatal ?? fatal ?? true;
          ctx.addIssue({ code: "custom", ...params, fatal: _fatal });
        }
        return;
      });
    return ZodAny.create();
  }
  var late = {
    object: ZodObject.lazycreate
  };
  var ZodFirstPartyTypeKind;
  (function(ZodFirstPartyTypeKind2) {
    ZodFirstPartyTypeKind2["ZodString"] = "ZodString";
    ZodFirstPartyTypeKind2["ZodNumber"] = "ZodNumber";
    ZodFirstPartyTypeKind2["ZodNaN"] = "ZodNaN";
    ZodFirstPartyTypeKind2["ZodBigInt"] = "ZodBigInt";
    ZodFirstPartyTypeKind2["ZodBoolean"] = "ZodBoolean";
    ZodFirstPartyTypeKind2["ZodDate"] = "ZodDate";
    ZodFirstPartyTypeKind2["ZodSymbol"] = "ZodSymbol";
    ZodFirstPartyTypeKind2["ZodUndefined"] = "ZodUndefined";
    ZodFirstPartyTypeKind2["ZodNull"] = "ZodNull";
    ZodFirstPartyTypeKind2["ZodAny"] = "ZodAny";
    ZodFirstPartyTypeKind2["ZodUnknown"] = "ZodUnknown";
    ZodFirstPartyTypeKind2["ZodNever"] = "ZodNever";
    ZodFirstPartyTypeKind2["ZodVoid"] = "ZodVoid";
    ZodFirstPartyTypeKind2["ZodArray"] = "ZodArray";
    ZodFirstPartyTypeKind2["ZodObject"] = "ZodObject";
    ZodFirstPartyTypeKind2["ZodUnion"] = "ZodUnion";
    ZodFirstPartyTypeKind2["ZodDiscriminatedUnion"] = "ZodDiscriminatedUnion";
    ZodFirstPartyTypeKind2["ZodIntersection"] = "ZodIntersection";
    ZodFirstPartyTypeKind2["ZodTuple"] = "ZodTuple";
    ZodFirstPartyTypeKind2["ZodRecord"] = "ZodRecord";
    ZodFirstPartyTypeKind2["ZodMap"] = "ZodMap";
    ZodFirstPartyTypeKind2["ZodSet"] = "ZodSet";
    ZodFirstPartyTypeKind2["ZodFunction"] = "ZodFunction";
    ZodFirstPartyTypeKind2["ZodLazy"] = "ZodLazy";
    ZodFirstPartyTypeKind2["ZodLiteral"] = "ZodLiteral";
    ZodFirstPartyTypeKind2["ZodEnum"] = "ZodEnum";
    ZodFirstPartyTypeKind2["ZodEffects"] = "ZodEffects";
    ZodFirstPartyTypeKind2["ZodNativeEnum"] = "ZodNativeEnum";
    ZodFirstPartyTypeKind2["ZodOptional"] = "ZodOptional";
    ZodFirstPartyTypeKind2["ZodNullable"] = "ZodNullable";
    ZodFirstPartyTypeKind2["ZodDefault"] = "ZodDefault";
    ZodFirstPartyTypeKind2["ZodCatch"] = "ZodCatch";
    ZodFirstPartyTypeKind2["ZodPromise"] = "ZodPromise";
    ZodFirstPartyTypeKind2["ZodBranded"] = "ZodBranded";
    ZodFirstPartyTypeKind2["ZodPipeline"] = "ZodPipeline";
    ZodFirstPartyTypeKind2["ZodReadonly"] = "ZodReadonly";
  })(ZodFirstPartyTypeKind || (ZodFirstPartyTypeKind = {}));
  var instanceOfType = (cls, params = {
    message: `Input not instance of ${cls.name}`
  }) => custom((data) => data instanceof cls, params);
  var stringType = ZodString.create;
  var numberType = ZodNumber.create;
  var nanType = ZodNaN.create;
  var bigIntType = ZodBigInt.create;
  var booleanType = ZodBoolean.create;
  var dateType = ZodDate.create;
  var symbolType = ZodSymbol.create;
  var undefinedType = ZodUndefined.create;
  var nullType = ZodNull.create;
  var anyType = ZodAny.create;
  var unknownType = ZodUnknown.create;
  var neverType = ZodNever.create;
  var voidType = ZodVoid.create;
  var arrayType = ZodArray.create;
  var objectType = ZodObject.create;
  var strictObjectType = ZodObject.strictCreate;
  var unionType = ZodUnion.create;
  var discriminatedUnionType = ZodDiscriminatedUnion.create;
  var intersectionType = ZodIntersection.create;
  var tupleType = ZodTuple.create;
  var recordType = ZodRecord.create;
  var mapType = ZodMap.create;
  var setType = ZodSet.create;
  var functionType = ZodFunction.create;
  var lazyType = ZodLazy.create;
  var literalType = ZodLiteral.create;
  var enumType = ZodEnum.create;
  var nativeEnumType = ZodNativeEnum.create;
  var promiseType = ZodPromise.create;
  var effectsType = ZodEffects.create;
  var optionalType = ZodOptional.create;
  var nullableType = ZodNullable.create;
  var preprocessType = ZodEffects.createWithPreprocess;
  var pipelineType = ZodPipeline.create;
  var ostring = () => stringType().optional();
  var onumber = () => numberType().optional();
  var oboolean = () => booleanType().optional();
  var coerce = {
    string: ((arg) => ZodString.create({ ...arg, coerce: true })),
    number: ((arg) => ZodNumber.create({ ...arg, coerce: true })),
    boolean: ((arg) => ZodBoolean.create({
      ...arg,
      coerce: true
    })),
    bigint: ((arg) => ZodBigInt.create({ ...arg, coerce: true })),
    date: ((arg) => ZodDate.create({ ...arg, coerce: true }))
  };
  var NEVER = INVALID;

  // ../../packages/pazaak-policy/dist/schema.js
  var regionDefinitionSchema = external_exports.object({
    id: external_exports.string().min(1),
    label: external_exports.string().min(1),
    /** Cloudflare Durable Object `locationHint` (best-effort). */
    locationHint: external_exports.string().min(1).optional()
  });
  var timeControlPresetSchema = external_exports.object({
    id: external_exports.string().min(1),
    label: external_exports.string().min(1),
    turnSeconds: external_exports.number().int().positive(),
    incrementSeconds: external_exports.number().int().nonnegative().optional()
  });
  var pazaakOpsPolicySchema = external_exports.object({
    version: external_exports.literal(1),
    timers: external_exports.object({
      turnTimerSeconds: external_exports.number().int().positive(),
      disconnectForfeitMs: external_exports.number().int().nonnegative(),
      turnTimeoutMs: external_exports.number().int().nonnegative(),
      reconnectGraceMs: external_exports.number().int().nonnegative()
    }),
    matchmaking: external_exports.object({
      tickMs: external_exports.number().int().positive(),
      queueWidenAfterMs: external_exports.number().int().nonnegative(),
      regions: external_exports.array(regionDefinitionSchema).min(1),
      defaultRegionId: external_exports.string().min(1)
    }),
    features: external_exports.object({
      workerMatchAuthority: external_exports.boolean(),
      dualWriteMatchesToWorker: external_exports.boolean(),
      dualWriteMatchesToBot: external_exports.boolean(),
      allowPrivateBackendUrl: external_exports.boolean(),
      blackjackOnlineEnabled: external_exports.boolean()
    }),
    blackjack: external_exports.object({
      shoeDecks: external_exports.number().int().min(1).max(16),
      dealerHitsSoft17: external_exports.boolean(),
      modifiers: external_exports.record(external_exports.unknown())
    }),
    progression: external_exports.object({
      milestonesEnabled: external_exports.boolean()
    }),
    admin: external_exports.object({
      discordUserAllowlist: external_exports.array(external_exports.string()).default([])
    }),
    timeControls: external_exports.object({
      presets: external_exports.array(timeControlPresetSchema).min(1)
    })
  });

  // ../../packages/pazaak-policy/dist/public.js
  function toPublicConfig(policy) {
    return {
      version: 1,
      timers: {
        turnTimerSeconds: policy.timers.turnTimerSeconds
      },
      matchmaking: {
        regions: policy.matchmaking.regions,
        defaultRegionId: policy.matchmaking.defaultRegionId
      },
      timeControls: policy.timeControls,
      features: {
        blackjackOnlineEnabled: policy.features.blackjackOnlineEnabled,
        allowPrivateBackendUrl: policy.features.allowPrivateBackendUrl
      }
    };
  }

  // ../../packages/pazaak-rating/dist/index.js
  var PAZAAK_DEFAULT_MMR = 1e3;
  var PAZAAK_DEFAULT_RD = 350;
  var PAZAAK_RD_MIN = 60;
  var PAZAAK_RD_MAX = 350;
  function expectedScore(selfMmr, opponentMmr) {
    return 1 / (1 + Math.pow(10, (opponentMmr - selfMmr) / 400));
  }
  function clampRd(rd) {
    return Math.max(PAZAAK_RD_MIN, Math.min(PAZAAK_RD_MAX, rd));
  }
  function coerceRd(rd) {
    if (rd === void 0 || !Number.isFinite(rd))
      return PAZAAK_DEFAULT_RD;
    return clampRd(rd);
  }
  function coerceMmr(mmr) {
    if (mmr === void 0 || !Number.isFinite(mmr))
      return PAZAAK_DEFAULT_MMR;
    return Math.max(0, mmr);
  }
  function updateRatingAfterGame(self, opponent, score) {
    const mmrSelf = coerceMmr(self.mmr);
    const rdSelf = coerceRd(self.rd);
    const mmrOpp = coerceMmr(opponent.mmr);
    const rdOpp = coerceRd(opponent.rd);
    const E = expectedScore(mmrSelf, mmrOpp);
    const kSelf = 16 + 24 * (rdSelf / PAZAAK_RD_MAX);
    const oppUncertaintyBoost = 1 + rdOpp / PAZAAK_RD_MAX * 0.2;
    const K = Math.min(44, kSelf * oppUncertaintyBoost);
    const deltaMmr = Math.round(K * (score - E));
    const mmr = Math.max(0, mmrSelf + deltaMmr);
    const rd = clampRd(rdSelf * 0.964 - 3);
    return { mmr, rd, deltaMmr };
  }

  // scripts/node-crypto-stub.ts
  function randomUUID() {
    const c = globalThis.crypto;
    if (c?.randomUUID) return c.randomUUID();
    const part = () => Math.floor((1 + Math.random()) * 65536).toString(16).slice(1);
    return `${part()}${part()}-${part()}-${part()}-${part()}-${part()}${part()}${part()}`;
  }

  // ../../packages/pazaak-tournament/src/seeding.ts
  var seedParticipantsByMmr = (participants) => {
    const seeded = [...participants].sort((left, right) => {
      if (right.mmr !== left.mmr) {
        return right.mmr - left.mmr;
      }
      return left.registeredAt - right.registeredAt;
    });
    return seeded.map((entry, index) => ({
      ...entry,
      seed: index + 1
    }));
  };
  var generateBracketPairings = (seedCount) => {
    if (seedCount < 1) {
      return [];
    }
    const bracketSize = nextPowerOfTwo(seedCount);
    const pairings = [];
    const order = buildSeedOrder(bracketSize);
    for (let i = 0; i < order.length; i += 2) {
      const a = order[i];
      const b = order[i + 1];
      const pairingA = a > seedCount ? null : a;
      const pairingB = b > seedCount ? null : b;
      pairings.push([pairingA, pairingB]);
    }
    return pairings;
  };
  var buildSeedOrder = (size) => {
    if (size <= 1) {
      return [1];
    }
    const previous = buildSeedOrder(size / 2);
    const result = [];
    for (const seed of previous) {
      result.push(seed, size + 1 - seed);
    }
    return result;
  };
  var nextPowerOfTwo = (value) => {
    if (value <= 1) return 1;
    return 2 ** Math.ceil(Math.log2(value));
  };

  // ../../packages/pazaak-tournament/src/single-elim.ts
  var generateSingleElimBracket = (state) => {
    const seeded = Object.values(state.participants).filter((entry) => entry.seed !== null).sort((left, right) => (left.seed ?? 0) - (right.seed ?? 0));
    if (seeded.length < 2) {
      return [];
    }
    const bySeed = new Map(seeded.map((entry) => [entry.seed, entry]));
    const pairings = generateBracketPairings(seeded.length);
    const bracketSize = nextPowerOfTwo(seeded.length);
    const totalRounds = Math.max(1, Math.log2(bracketSize));
    const matchesByRound = [];
    for (let round = 1; round <= totalRounds; round += 1) {
      const slotsInRound = bracketSize / 2 ** round;
      const roundMatches = [];
      for (let index = 0; index < slotsInRound; index += 1) {
        roundMatches.push({
          id: randomUUID(),
          round,
          index,
          bracket: "winners",
          state: "pending",
          participantAId: null,
          participantBId: null,
          winnerUserId: null,
          loserUserId: null,
          engineMatchId: null,
          scheduledAt: null,
          completedAt: null,
          winnerAdvancesToMatchId: null,
          loserAdvancesToMatchId: null
        });
      }
      matchesByRound.push(roundMatches);
    }
    const round1 = matchesByRound[0] ?? [];
    for (let i = 0; i < pairings.length; i += 1) {
      const [seedA, seedB] = pairings[i] ?? [null, null];
      const match = round1[i];
      if (!match) continue;
      const participantA = seedA !== null ? bySeed.get(seedA) ?? null : null;
      const participantB = seedB !== null ? bySeed.get(seedB) ?? null : null;
      match.participantAId = participantA?.userId ?? null;
      match.participantBId = participantB?.userId ?? null;
      if (participantA && !participantB) {
        match.state = "bye";
        match.winnerUserId = participantA.userId;
        match.completedAt = Date.now();
      } else if (!participantA && participantB) {
        match.state = "bye";
        match.winnerUserId = participantB.userId;
        match.completedAt = Date.now();
      } else if (participantA && participantB) {
        match.state = "active";
      }
    }
    for (let round = 1; round < totalRounds; round += 1) {
      const roundMatches = matchesByRound[round - 1] ?? [];
      const nextRoundMatches = matchesByRound[round] ?? [];
      for (let i = 0; i < roundMatches.length; i += 1) {
        const parent = nextRoundMatches[Math.floor(i / 2)];
        const match = roundMatches[i];
        if (match && parent) {
          match.winnerAdvancesToMatchId = parent.id;
        }
      }
    }
    const flat = [];
    for (const round of matchesByRound) {
      flat.push(...round);
    }
    const byId = new Map(flat.map((match) => [match.id, match]));
    for (const match of flat) {
      if (match.state === "bye" && match.winnerUserId && match.winnerAdvancesToMatchId) {
        const parent = byId.get(match.winnerAdvancesToMatchId);
        if (parent) {
          if (parent.participantAId === null) {
            parent.participantAId = match.winnerUserId;
          } else if (parent.participantBId === null) {
            parent.participantBId = match.winnerUserId;
          }
          if (parent.participantAId && parent.participantBId && parent.state === "pending") {
            parent.state = "active";
          }
        }
      }
    }
    return flat;
  };

  // ../../packages/pazaak-tournament/src/double-elim.ts
  var generateDoubleElimBracket = (state) => {
    const winners = generateSingleElimBracket(state).map((match) => ({ ...match, bracket: "winners" }));
    if (winners.length === 0) return [];
    const rounds = Math.max(...winners.map((match) => match.round));
    const losersRounds = Math.max(0, rounds * 2 - 1);
    const losers = [];
    for (let round = 1; round <= losersRounds; round += 1) {
      const dropRoundIndex = Math.ceil(round / 2);
      const dropRound = Math.min(rounds - 1, dropRoundIndex);
      const winnersDropRoundSlots = winners.filter((match) => match.round === dropRound).length;
      const slotsInRound = round % 2 === 1 ? Math.max(1, winnersDropRoundSlots) : Math.max(1, Math.ceil(winnersDropRoundSlots / 2));
      for (let i = 0; i < slotsInRound; i += 1) {
        losers.push({
          id: randomUUID(),
          round,
          index: i,
          bracket: "losers",
          state: "pending",
          participantAId: null,
          participantBId: null,
          winnerUserId: null,
          loserUserId: null,
          engineMatchId: null,
          scheduledAt: null,
          completedAt: null,
          winnerAdvancesToMatchId: null,
          loserAdvancesToMatchId: null
        });
      }
    }
    const grandFinal = {
      id: randomUUID(),
      round: rounds + 1,
      index: 0,
      bracket: "grand_final",
      state: "pending",
      participantAId: null,
      participantBId: null,
      winnerUserId: null,
      loserUserId: null,
      engineMatchId: null,
      scheduledAt: null,
      completedAt: null,
      winnerAdvancesToMatchId: null,
      loserAdvancesToMatchId: null
    };
    const grandFinalReset = {
      id: randomUUID(),
      round: rounds + 2,
      index: 0,
      bracket: "grand_final_reset",
      state: "pending",
      participantAId: null,
      participantBId: null,
      winnerUserId: null,
      loserUserId: null,
      engineMatchId: null,
      scheduledAt: null,
      completedAt: null,
      winnerAdvancesToMatchId: null,
      loserAdvancesToMatchId: null
    };
    const winnersFinal = winners.find((match) => match.round === rounds);
    if (winnersFinal) {
      winnersFinal.winnerAdvancesToMatchId = grandFinal.id;
      winnersFinal.loserAdvancesToMatchId = losers.at(-1)?.id ?? null;
    }
    grandFinal.winnerAdvancesToMatchId = null;
    grandFinal.loserAdvancesToMatchId = grandFinalReset.id;
    const losersFinal = losers.at(-1);
    if (losersFinal) {
      losersFinal.winnerAdvancesToMatchId = grandFinal.id;
    }
    for (let i = 0; i < losers.length - 1; i += 1) {
      const current = losers[i];
      const next = losers[i + 1];
      current.winnerAdvancesToMatchId = next.id;
    }
    const losersByRound = /* @__PURE__ */ new Map();
    for (const match of losers) {
      const bucket = losersByRound.get(match.round) ?? [];
      bucket.push(match);
      losersByRound.set(match.round, bucket);
    }
    for (const winnersMatch of winners) {
      if (winnersMatch.round === rounds) continue;
      const dropRound = winnersMatch.round * 2 - 1;
      const slots = losersByRound.get(dropRound) ?? [];
      const target = slots[winnersMatch.index % Math.max(1, slots.length)];
      if (target) {
        winnersMatch.loserAdvancesToMatchId = target.id;
      }
    }
    return [...winners, ...losers, grandFinal, grandFinalReset];
  };

  // ../../packages/pazaak-tournament/src/swiss.ts
  var computeSwissStandings = (state) => {
    const rows = /* @__PURE__ */ new Map();
    for (const participant of Object.values(state.participants)) {
      rows.set(participant.userId, {
        userId: participant.userId,
        displayName: participant.displayName,
        seed: participant.seed,
        wins: 0,
        losses: 0,
        draws: 0,
        buchholz: 0,
        sonnebornBerger: 0,
        opponentIds: [],
        matchPoints: 0
      });
    }
    for (const match of state.matches) {
      if (match.state !== "reported" && match.state !== "bye") continue;
      const aRow = match.participantAId ? rows.get(match.participantAId) : void 0;
      const bRow = match.participantBId ? rows.get(match.participantBId) : void 0;
      if (match.state === "bye") {
        const lonerRow = aRow ?? bRow;
        if (lonerRow) {
          lonerRow.wins += 1;
          lonerRow.matchPoints += 3;
        }
        continue;
      }
      if (!aRow || !bRow) continue;
      if (match.winnerUserId === null) {
        aRow.draws += 1;
        bRow.draws += 1;
        aRow.matchPoints += 1;
        bRow.matchPoints += 1;
      } else if (match.winnerUserId === aRow.userId) {
        aRow.wins += 1;
        aRow.matchPoints += 3;
        bRow.losses += 1;
      } else {
        bRow.wins += 1;
        bRow.matchPoints += 3;
        aRow.losses += 1;
      }
      aRow.opponentIds.push(bRow.userId);
      bRow.opponentIds.push(aRow.userId);
    }
    for (const row of rows.values()) {
      let buchholz = 0;
      let sonnebornBerger = 0;
      for (const opponentId of row.opponentIds) {
        const opponent = rows.get(opponentId);
        if (!opponent) continue;
        buchholz += opponent.matchPoints;
      }
      for (const match of state.matches) {
        if (match.state !== "reported") continue;
        if (match.winnerUserId === null && (match.participantAId === row.userId || match.participantBId === row.userId)) {
          const otherId = match.participantAId === row.userId ? match.participantBId : match.participantAId;
          const opponent = otherId ? rows.get(otherId) : void 0;
          if (opponent) {
            sonnebornBerger += opponent.matchPoints / 2;
          }
        } else if (match.winnerUserId === row.userId) {
          const otherId = match.participantAId === row.userId ? match.participantBId : match.participantAId;
          const opponent = otherId ? rows.get(otherId) : void 0;
          if (opponent) {
            sonnebornBerger += opponent.matchPoints;
          }
        }
      }
      row.buchholz = buchholz;
      row.sonnebornBerger = sonnebornBerger;
    }
    return [...rows.values()].sort((a, b) => {
      if (b.matchPoints !== a.matchPoints) return b.matchPoints - a.matchPoints;
      if (b.buchholz !== a.buchholz) return b.buchholz - a.buchholz;
      if (b.sonnebornBerger !== a.sonnebornBerger) return b.sonnebornBerger - a.sonnebornBerger;
      return (a.seed ?? Number.POSITIVE_INFINITY) - (b.seed ?? Number.POSITIVE_INFINITY);
    });
  };
  var generateSwissPairings = (state, round) => {
    const standings = computeSwissStandings(state);
    const unpaired = new Set(standings.map((row) => row.userId));
    const pairings = [];
    let slotIndex = 0;
    for (const candidate of standings) {
      if (!unpaired.has(candidate.userId)) continue;
      const opponent = standings.find(
        (entry) => entry.userId !== candidate.userId && unpaired.has(entry.userId) && !candidate.opponentIds.includes(entry.userId)
      );
      if (opponent) {
        unpaired.delete(candidate.userId);
        unpaired.delete(opponent.userId);
        pairings.push({
          id: randomUUID(),
          round,
          index: slotIndex,
          state: "active",
          participantAId: candidate.userId,
          participantBId: opponent.userId,
          winnerUserId: null,
          loserUserId: null,
          engineMatchId: null,
          scheduledAt: null,
          completedAt: null,
          winnerAdvancesToMatchId: null,
          loserAdvancesToMatchId: null
        });
        slotIndex += 1;
      }
    }
    for (const loneUserId of unpaired) {
      pairings.push({
        id: randomUUID(),
        round,
        index: slotIndex,
        state: "bye",
        participantAId: loneUserId,
        participantBId: null,
        winnerUserId: loneUserId,
        loserUserId: null,
        engineMatchId: null,
        scheduledAt: null,
        completedAt: Date.now(),
        winnerAdvancesToMatchId: null,
        loserAdvancesToMatchId: null
      });
      slotIndex += 1;
    }
    return pairings;
  };

  // ../../packages/pazaak-tournament/src/engine.ts
  var DEFAULT_SETS_PER_MATCH = 3;
  var DEFAULT_SWISS_ROUNDS = 5;
  var createTournament = (input) => {
    const now = input.createdAt ?? Date.now();
    return {
      id: randomUUID(),
      name: input.name,
      guildId: input.guildId ?? null,
      channelId: input.channelId ?? null,
      organizerId: input.organizerId,
      organizerName: input.organizerName,
      format: input.format,
      setsPerMatch: input.setsPerMatch ?? DEFAULT_SETS_PER_MATCH,
      gameMode: input.gameMode ?? "canonical",
      rounds: input.rounds ?? DEFAULT_SWISS_ROUNDS,
      maxParticipants: input.maxParticipants ?? null,
      status: "registration",
      currentRound: 0,
      participants: {},
      matches: [],
      championUserId: null,
      createdAt: now,
      updatedAt: now
    };
  };
  var registerParticipant = (state, input) => {
    if (state.status !== "registration") {
      throw new Error("This tournament is no longer accepting new participants.");
    }
    if (state.maxParticipants !== null && Object.keys(state.participants).length >= state.maxParticipants) {
      throw new Error("This tournament is full.");
    }
    if (state.participants[input.userId]) {
      throw new Error("You are already registered for this tournament.");
    }
    const entry = {
      userId: input.userId,
      displayName: input.displayName,
      mmr: input.mmr,
      seed: null,
      status: "registered",
      registeredAt: input.registeredAt ?? Date.now()
    };
    return {
      ...state,
      participants: { ...state.participants, [input.userId]: entry },
      updatedAt: Date.now()
    };
  };
  var withdrawParticipant = (state, userId) => {
    if (!state.participants[userId]) {
      return state;
    }
    if (state.status === "registration") {
      const nextParticipants = { ...state.participants };
      delete nextParticipants[userId];
      return { ...state, participants: nextParticipants, updatedAt: Date.now() };
    }
    const existing = state.participants[userId];
    return {
      ...state,
      participants: {
        ...state.participants,
        [userId]: { ...existing, status: "withdrawn" }
      },
      updatedAt: Date.now()
    };
  };
  var startTournament = (state) => {
    if (state.status !== "registration") {
      throw new Error("This tournament has already started.");
    }
    const allParticipants = Object.values(state.participants);
    if (allParticipants.length < 2) {
      throw new Error("At least 2 participants are required to start a tournament.");
    }
    const seeded = seedParticipantsByMmr(allParticipants);
    const seededRecord = {};
    for (const entry of seeded) {
      seededRecord[entry.userId] = { ...entry, status: "active" };
    }
    const prepared = {
      ...state,
      participants: seededRecord,
      status: "active",
      currentRound: 1,
      updatedAt: Date.now()
    };
    if (state.format === "single_elim") {
      const bracket = generateSingleElimBracket(prepared);
      return { ...prepared, matches: bracket };
    }
    if (state.format === "double_elim") {
      const bracket = generateDoubleElimBracket(prepared);
      return { ...prepared, matches: bracket };
    }
    const pairings = generateSwissPairings(prepared, 1);
    return { ...prepared, matches: pairings };
  };
  var advanceTournament = (state, report) => {
    if (state.status !== "active") {
      throw new Error("This tournament is not active.");
    }
    const matchIndex = state.matches.findIndex((entry) => entry.id === report.matchId);
    if (matchIndex === -1) {
      throw new Error("Unknown match id.");
    }
    const match = state.matches[matchIndex];
    const winnerId = report.winnerUserId;
    const loserId = report.loserUserId ?? (winnerId === match.participantAId ? match.participantBId : match.participantAId);
    const now = report.completedAt ?? Date.now();
    if (winnerId !== null && winnerId !== match.participantAId && winnerId !== match.participantBId) {
      throw new Error("Winner must be one of the two match participants (or null for a Swiss draw).");
    }
    const reported = {
      ...match,
      state: "reported",
      winnerUserId: winnerId,
      loserUserId: loserId ?? null,
      completedAt: now
    };
    const nextMatches = [...state.matches];
    nextMatches[matchIndex] = reported;
    const nextParticipants = { ...state.participants };
    if (state.format !== "swiss" && loserId) {
      const existing = nextParticipants[loserId];
      if (existing) {
        nextParticipants[loserId] = { ...existing, status: "eliminated" };
      }
    }
    if (state.format === "single_elim" || state.format === "double_elim") {
      if (winnerId && reported.winnerAdvancesToMatchId) {
        const parentIdx = nextMatches.findIndex((entry) => entry.id === reported.winnerAdvancesToMatchId);
        if (parentIdx !== -1) {
          nextMatches[parentIdx] = fillEmptySlot(nextMatches[parentIdx], winnerId);
        }
      }
      if (loserId && reported.loserAdvancesToMatchId) {
        const parentIdx = nextMatches.findIndex((entry) => entry.id === reported.loserAdvancesToMatchId);
        if (parentIdx !== -1) {
          nextMatches[parentIdx] = fillEmptySlot(nextMatches[parentIdx], loserId);
        }
      }
    }
    autoAdvanceByes(nextMatches);
    const matchesToSchedule = nextMatches.filter(
      (entry) => entry.state === "active" && entry.participantAId && entry.participantBId && entry.engineMatchId === null
    );
    let championUserId = state.championUserId;
    let status = state.status;
    let currentRound = state.currentRound;
    let newSwissRound = null;
    if (state.format === "single_elim") {
      const final = nextMatches.find((entry) => entry.round === Math.max(...nextMatches.map((m) => m.round)));
      if (final?.state === "reported") {
        championUserId = final.winnerUserId;
        status = "completed";
      }
    } else if (state.format === "double_elim") {
      const resetMatch = nextMatches.find((entry) => entry.bracket === "grand_final_reset");
      const grandFinal = nextMatches.find((entry) => entry.bracket === "grand_final");
      if (grandFinal?.state === "reported") {
        const winnersBracketChampion = getWinnersBracketChampion(nextMatches);
        if (grandFinal.winnerUserId === winnersBracketChampion) {
          championUserId = grandFinal.winnerUserId;
          status = "completed";
        } else if (resetMatch?.state === "reported") {
          championUserId = resetMatch.winnerUserId;
          status = "completed";
        } else if (resetMatch && grandFinal.loserAdvancesToMatchId === resetMatch.id) {
          const idx = nextMatches.findIndex((entry) => entry.id === resetMatch.id);
          if (idx !== -1) {
            nextMatches[idx] = {
              ...nextMatches[idx],
              participantAId: grandFinal.winnerUserId,
              participantBId: grandFinal.loserUserId,
              state: "active"
            };
          }
        }
      }
    } else {
      const roundMatches = nextMatches.filter((entry) => entry.round === currentRound);
      const allReported = roundMatches.every((entry) => entry.state === "reported" || entry.state === "bye");
      if (allReported) {
        if (currentRound >= state.rounds) {
          status = "completed";
          const standings = computeSwissStandings({ ...state, matches: nextMatches });
          championUserId = standings[0]?.userId ?? null;
        } else {
          currentRound += 1;
          newSwissRound = currentRound;
          const pairings = generateSwissPairings({ ...state, matches: nextMatches }, currentRound);
          nextMatches.push(...pairings);
        }
      }
    }
    const nextState = {
      ...state,
      matches: nextMatches,
      participants: nextParticipants,
      status,
      currentRound,
      championUserId,
      updatedAt: Date.now()
    };
    if (status === "completed" && championUserId) {
      const champion = nextState.participants[championUserId];
      if (champion) {
        nextState.participants[championUserId] = { ...champion, status: "champion" };
      }
    }
    return {
      state: nextState,
      matchesToSchedule: nextMatches.filter(
        (entry) => entry.state === "active" && entry.participantAId && entry.participantBId && entry.engineMatchId === null
      ),
      newSwissRound,
      tournamentCompleted: status === "completed"
    };
  };
  var buildBracketView = (state) => {
    const columns = [];
    const byRoundBracket = /* @__PURE__ */ new Map();
    for (const match of state.matches) {
      const bracketKey = state.format === "swiss" ? "swiss" : match.bracket ?? "winners";
      const key = `${bracketKey}:${match.round}`;
      const bucket = byRoundBracket.get(key) ?? [];
      bucket.push(match);
      byRoundBracket.set(key, bucket);
    }
    for (const [key, matches] of byRoundBracket.entries()) {
      const [bracketKey, roundString] = key.split(":");
      columns.push({
        round: Number(roundString),
        bracket: bracketKey ?? "winners",
        matches: matches.sort((a, b) => a.index - b.index)
      });
    }
    columns.sort((a, b) => {
      if (a.round !== b.round) return a.round - b.round;
      const order = {
        winners: 0,
        losers: 1,
        grand_final: 2,
        grand_final_reset: 3,
        swiss: 0
      };
      return order[a.bracket] - order[b.bracket];
    });
    return { columns };
  };
  var fillEmptySlot = (match, userId) => {
    if (match.participantAId === null) {
      const next = { ...match, participantAId: userId };
      if (next.participantAId && next.participantBId) {
        return { ...next, state: "active" };
      }
      return next;
    }
    if (match.participantBId === null) {
      const next = { ...match, participantBId: userId };
      if (next.participantAId && next.participantBId) {
        return { ...next, state: "active" };
      }
      return next;
    }
    return match;
  };
  var autoAdvanceByes = (matches) => {
    const byId = new Map(matches.map((entry) => [entry.id, entry]));
    for (const match of matches) {
      if (match.state === "bye" && match.winnerUserId && match.winnerAdvancesToMatchId) {
        const parent = byId.get(match.winnerAdvancesToMatchId);
        if (!parent) continue;
        if (parent.participantAId === null) {
          parent.participantAId = match.winnerUserId;
        } else if (parent.participantBId === null) {
          parent.participantBId = match.winnerUserId;
        }
        if (parent.participantAId && parent.participantBId && parent.state === "pending") {
          parent.state = "active";
        }
      }
    }
  };
  var getWinnersBracketChampion = (matches) => {
    const winnersRounds = matches.filter((entry) => entry.bracket === "winners").map((entry) => entry.round);
    if (winnersRounds.length === 0) return null;
    const finalRound = Math.max(...winnersRounds);
    const final = matches.find((entry) => entry.bracket === "winners" && entry.round === finalRound);
    return final?.winnerUserId ?? null;
  };

  // src/index.ts
  var SYSTEM_USER_ID = "00000000-0000-0000-0000-000000000000";
  var MATCH_HANDLER = "pazaak_authoritative";
  var LEADERBOARD_ID = "pazaak_ranked_mmr";
  var TOURNAMENT_COLLECTION = "pazaak_tournaments";
  var TOURNAMENT_IDS_KEY = "tournament_ids";
  function ensureCrypto() {
    const g = globalThis;
    if (g.crypto?.randomUUID) return;
    Object.defineProperty(g, "crypto", {
      configurable: true,
      value: {
        randomUUID: () => {
          const part = () => Math.floor((1 + Math.random()) * 65536).toString(16).slice(1);
          return `${part()}${part()}-${part()}-${part()}-${part()}-${part()}${part()}${part()}`;
        }
      }
    });
  }
  ensureCrypto();
  function nowIso() {
    return (/* @__PURE__ */ new Date()).toISOString();
  }
  function randomId() {
    return globalThis.crypto.randomUUID();
  }
  function asObject(value) {
    return value && typeof value === "object" && !Array.isArray(value) ? value : {};
  }
  function parsePayload(payload) {
    if (!payload) return {};
    try {
      return asObject(JSON.parse(payload));
    } catch {
      throw new Error("Payload must be valid JSON.");
    }
  }
  function json(data) {
    return JSON.stringify(data);
  }
  function textData(data) {
    return typeof data === "string" ? data : String.fromCharCode(...data);
  }
  function requireUser(ctx) {
    if (!ctx.userId) throw new Error("Nakama session required.");
    return ctx.userId;
  }
  function displayNameFor(nk, ctx, userId) {
    try {
      const account = nk.accountGetId(ctx, userId);
      return account.user.displayName || account.user.username || `Player ${userId.slice(0, 6)}`;
    } catch {
      return `Player ${userId.slice(0, 6)}`;
    }
  }
  function readStorage(nk, ctx, collection, key, userId) {
    const [obj] = nk.storageRead(ctx, [{ collection, key, userId }]);
    return obj ? obj.value : null;
  }
  function writeStorage(nk, ctx, collection, key, userId, value) {
    nk.storageWrite(ctx, [{ collection, key, userId, value, permissionRead: 1, permissionWrite: 0 }]);
  }
  function defaultSettings() {
    return {
      tableTheme: "ebon-hawk",
      cardBackStyle: "classic",
      tableAmbience: "cantina",
      soundEnabled: true,
      soundTheme: "default",
      reducedMotionEnabled: false,
      turnTimerSeconds: PAZAAK_POLICY_DEFAULTS.timers.turnTimerSeconds,
      preferredAiDifficulty: "hard",
      confirmForfeit: true,
      highlightValidPlays: true,
      focusMode: false,
      showRatingsInGame: true,
      showGuildEmblems: true,
      showHolocronStreaks: true,
      showPostMatchDebrief: true,
      chatAudience: "everyone"
    };
  }
  function getSettings(nk, ctx, userId) {
    return {
      ...defaultSettings(),
      ...readStorage(nk, ctx, "pazaak_settings", "settings", userId) ?? {}
    };
  }
  function saveSettings(nk, ctx, userId, settings) {
    writeStorage(nk, ctx, "pazaak_settings", "settings", userId, settings);
    return settings;
  }
  function getWallet(nk, ctx, userId) {
    const displayName = displayNameFor(nk, ctx, userId);
    const current = readStorage(nk, ctx, "pazaak_wallets", "wallet", userId);
    if (current) {
      return {
        ...current,
        userId,
        displayName: String(current.displayName ?? displayName),
        mmr: Number(current.mmr ?? PAZAAK_DEFAULT_MMR),
        rd: Number(current.rd ?? current.mmrRd ?? PAZAAK_DEFAULT_RD),
        updatedAt: String(current.updatedAt ?? nowIso())
      };
    }
    const wallet = {
      userId,
      displayName,
      preferredRuntimeDeckId: null,
      ownedSideDeckTokens: [],
      balance: 100,
      wins: 0,
      losses: 0,
      mmr: PAZAAK_DEFAULT_MMR,
      rd: PAZAAK_DEFAULT_RD,
      gamesPlayed: 0,
      gamesWon: 0,
      lastMatchAt: null,
      streak: 0,
      bestStreak: 0,
      lastDailyAt: null,
      progressClaims: [],
      unopenedCratesStandard: 0,
      unopenedCratesPremium: 0,
      updatedAt: nowIso()
    };
    writeStorage(nk, ctx, "pazaak_wallets", "wallet", userId, wallet);
    return wallet;
  }
  function saveWallet(nk, ctx, wallet) {
    const next = { ...wallet, updatedAt: nowIso() };
    writeStorage(nk, ctx, "pazaak_wallets", "wallet", wallet.userId, next);
    return next;
  }
  function getSideboards(nk, ctx, userId) {
    const displayName = displayNameFor(nk, ctx, userId);
    const current = readStorage(nk, ctx, "pazaak_sideboards", "sideboards", userId);
    if (current) {
      return {
        userId,
        displayName,
        activeName: typeof current.activeName === "string" ? current.activeName : null,
        sideboards: Array.isArray(current.sideboards) ? current.sideboards : [],
        ownedSideDeckTokens: Array.isArray(current.ownedSideDeckTokens) ? current.ownedSideDeckTokens : [],
        updatedAt: String(current.updatedAt ?? nowIso())
      };
    }
    const sideboards = {
      userId,
      displayName,
      activeName: null,
      sideboards: [],
      ownedSideDeckTokens: [],
      updatedAt: nowIso()
    };
    writeStorage(nk, ctx, "pazaak_sideboards", "sideboards", userId, sideboards);
    return sideboards;
  }
  function saveSideboards(nk, ctx, sideboards) {
    const next = { ...sideboards, updatedAt: nowIso() };
    writeStorage(nk, ctx, "pazaak_sideboards", "sideboards", sideboards.userId, next);
    return next;
  }
  function getGlobalList(nk, ctx, key) {
    const current = readStorage(nk, ctx, "pazaak_global", key, SYSTEM_USER_ID);
    return Array.isArray(current?.items) ? current.items : [];
  }
  function saveGlobalList(nk, ctx, key, items) {
    writeStorage(nk, ctx, "pazaak_global", key, SYSTEM_USER_ID, { items });
  }
  function readTournamentIdList(nk, ctx) {
    const cur = readStorage(nk, ctx, "pazaak_global", TOURNAMENT_IDS_KEY, SYSTEM_USER_ID);
    return Array.isArray(cur?.ids) ? cur.ids.filter((x) => typeof x === "string") : [];
  }
  function writeTournamentIdList(nk, ctx, ids) {
    writeStorage(nk, ctx, "pazaak_global", TOURNAMENT_IDS_KEY, SYSTEM_USER_ID, { ids });
  }
  function appendTournamentId(nk, ctx, id) {
    const ids = readTournamentIdList(nk, ctx);
    if (!ids.includes(id)) {
      ids.unshift(id);
      writeTournamentIdList(nk, ctx, ids);
    }
  }
  function loadTournament(nk, ctx, id) {
    const v = readStorage(nk, ctx, TOURNAMENT_COLLECTION, id, SYSTEM_USER_ID);
    if (!v || typeof v.id !== "string") return null;
    return v;
  }
  function saveTournamentState(nk, ctx, state) {
    writeStorage(nk, ctx, TOURNAMENT_COLLECTION, state.id, SYSTEM_USER_ID, state);
  }
  function summarizeTournamentState(state) {
    return {
      id: state.id,
      name: state.name,
      guildId: state.guildId,
      channelId: state.channelId,
      format: state.format,
      gameMode: state.gameMode,
      status: state.status,
      currentRound: state.currentRound,
      participants: Object.values(state.participants).map((entry) => ({
        userId: entry.userId,
        displayName: entry.displayName,
        seed: entry.seed,
        status: entry.status,
        mmr: entry.mmr
      })),
      championUserId: state.championUserId,
      setsPerMatch: state.setsPerMatch,
      rounds: state.rounds,
      maxParticipants: state.maxParticipants,
      organizerId: state.organizerId,
      organizerName: state.organizerName,
      createdAt: state.createdAt,
      updatedAt: state.updatedAt
    };
  }
  function getMatchIndex(nk, ctx, matchId) {
    return readStorage(nk, ctx, "pazaak_matches", `index:${matchId}`, SYSTEM_USER_ID);
  }
  function saveMatchIndex(nk, ctx, index) {
    writeStorage(nk, ctx, "pazaak_matches", `index:${index.matchId}`, SYSTEM_USER_ID, index);
    for (const playerId of index.playerIds) {
      writeStorage(nk, ctx, "pazaak_matches", `active:${playerId}`, SYSTEM_USER_ID, {
        matchId: index.matchId,
        nakamaMatchId: index.nakamaMatchId
      });
    }
  }
  function getSnapshot(nk, ctx, matchId) {
    return readStorage(nk, ctx, "pazaak_matches", `snapshot:${matchId}`, SYSTEM_USER_ID);
  }
  function saveSnapshot(nk, ctx, snapshot) {
    writeStorage(nk, ctx, "pazaak_matches", `snapshot:${snapshot.id}`, SYSTEM_USER_ID, snapshot);
  }
  var RuntimePersistence = class {
    constructor(nk, ctx, matchId) {
      __publicField(this, "nk", nk);
      __publicField(this, "ctx", ctx);
      __publicField(this, "matchId", matchId);
    }
    async save(match) {
      saveSnapshot(this.nk, this.ctx, serializeMatch(match));
    }
    async loadActive() {
      const snap = getSnapshot(this.nk, this.ctx, this.matchId);
      return snap && snap.phase !== "completed" ? [deserializeMatch(snap)] : [];
    }
  };
  function createCoordinator(nk, ctx, matchId) {
    return new PazaakCoordinator(new RuntimePersistence(nk, ctx, matchId), {
      turnTimeoutMs: PAZAAK_POLICY_DEFAULTS.timers.turnTimeoutMs,
      disconnectForfeitMs: PAZAAK_POLICY_DEFAULTS.timers.disconnectForfeitMs
    });
  }
  function createInitialMatch(nk, ctx, params) {
    const matchId = params.matchId || randomId();
    const coordinator = createCoordinator(nk, ctx, matchId);
    const existing = getSnapshot(nk, ctx, matchId);
    if (existing) return { coordinator, snapshot: existing };
    const p1 = params.playerOneId || "player-one";
    const p2 = params.playerTwoId || "player-two";
    const match = coordinator.createDirectMatch({
      channelId: `nakama:${matchId}`,
      challengerId: p1,
      challengerName: params.playerOneName || "Player 1",
      opponentId: p2,
      opponentName: params.playerTwoName || "Player 2",
      wager: Number(params.wager ?? 0),
      setsToWin: Number(params.setsToWin ?? 3),
      gameMode: params.gameMode === "wacky" ? "wacky" : "canonical",
      matchId
    });
    const snapshot = serializeMatch(match);
    saveSnapshot(nk, ctx, snapshot);
    return { coordinator, snapshot };
  }
  function createHostedMatch(nk, ctx, input) {
    const logicalMatchId = randomId();
    const params = {
      matchId: logicalMatchId,
      playerOneId: input.playerOneId,
      playerOneName: input.playerOneName,
      playerTwoId: input.playerTwoId,
      playerTwoName: input.playerTwoName,
      gameMode: input.gameMode ?? "canonical",
      setsToWin: String(input.setsToWin ?? 3),
      wager: String(input.wager ?? 0)
    };
    const nakamaMatchId = nk.matchCreate(ctx, MATCH_HANDLER, params);
    const { snapshot } = createInitialMatch(nk, ctx, params);
    saveMatchIndex(nk, ctx, {
      matchId: logicalMatchId,
      nakamaMatchId,
      playerIds: [input.playerOneId, input.playerTwoId],
      completed: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    return { match: snapshot, nakamaMatchId };
  }
  function matchmakerMatched(ctx, logger, nk, matches) {
    if (matches.length < 2) {
      logger.warn("matchmakerMatched: expected at least 2 players, got %d", matches.length);
      throw new Error("Invalid matchmaker group size.");
    }
    const sorted = [...matches].sort((a, b) => String(a.presence.userId).localeCompare(String(b.presence.userId)));
    const first = sorted[0];
    const second = sorted[1];
    const p1Id = String(first.presence.userId);
    const p2Id = String(second.presence.userId);
    const logicalMatchId = randomId();
    const params = {
      matchId: logicalMatchId,
      playerOneId: p1Id,
      playerOneName: displayNameFor(nk, ctx, p1Id),
      playerTwoId: p2Id,
      playerTwoName: displayNameFor(nk, ctx, p2Id),
      gameMode: "canonical",
      setsToWin: "3",
      wager: "0"
    };
    const nakamaMatchId = nk.matchCreate(ctx, MATCH_HANDLER, params);
    saveMatchIndex(nk, ctx, {
      matchId: logicalMatchId,
      nakamaMatchId,
      playerIds: [p1Id, p2Id],
      completed: false,
      createdAt: nowIso(),
      updatedAt: nowIso()
    });
    logger.info("matchmakerMatched created match %s nakama=%s", logicalMatchId, nakamaMatchId);
    return nakamaMatchId;
  }
  function settleIfNeeded(nk, ctx, state) {
    if (state.settled || state.snapshot.phase !== "completed" || !state.snapshot.winnerId || !state.snapshot.loserId) return;
    const winner = getWallet(nk, ctx, state.snapshot.winnerId);
    const loser = getWallet(nk, ctx, state.snapshot.loserId);
    const winnerRating = updateRatingAfterGame(winner, loser, 1);
    const loserRating = updateRatingAfterGame(loser, winner, 0);
    const at = nowIso();
    const nextWinner = saveWallet(nk, ctx, {
      ...winner,
      mmr: winnerRating.mmr,
      rd: winnerRating.rd,
      wins: winner.wins + 1,
      gamesWon: winner.gamesWon + 1,
      gamesPlayed: winner.gamesPlayed + 1,
      streak: winner.streak + 1,
      bestStreak: Math.max(winner.bestStreak, winner.streak + 1),
      lastMatchAt: at
    });
    const nextLoser = saveWallet(nk, ctx, {
      ...loser,
      mmr: loserRating.mmr,
      rd: loserRating.rd,
      losses: loser.losses + 1,
      gamesPlayed: loser.gamesPlayed + 1,
      streak: 0,
      lastMatchAt: at
    });
    nk.leaderboardRecordWrite(ctx, LEADERBOARD_ID, nextWinner.userId, nextWinner.displayName, nextWinner.mmr, Math.round(nextWinner.rd), { gamesPlayed: nextWinner.gamesPlayed }, "set");
    nk.leaderboardRecordWrite(ctx, LEADERBOARD_ID, nextLoser.userId, nextLoser.displayName, nextLoser.mmr, Math.round(nextLoser.rd), { gamesPlayed: nextLoser.gamesPlayed }, "set");
    appendHistory(nk, ctx, state.snapshot.winnerId, {
      matchId: state.matchId,
      opponentName: state.snapshot.loserName ?? "Opponent",
      result: "win",
      mmrDelta: winnerRating.deltaMmr,
      playedAt: at
    });
    appendHistory(nk, ctx, state.snapshot.loserId, {
      matchId: state.matchId,
      opponentName: state.snapshot.winnerName ?? "Opponent",
      result: "loss",
      mmrDelta: loserRating.deltaMmr,
      playedAt: at
    });
    const index = getMatchIndex(nk, ctx, state.matchId);
    if (index) saveMatchIndex(nk, ctx, { ...index, completed: true, updatedAt: at });
    state.settled = true;
  }
  function appendHistory(nk, ctx, userId, entry) {
    const current = readStorage(nk, ctx, "pazaak_history", "history", userId);
    const history = Array.isArray(current?.history) ? current.history : [];
    writeStorage(nk, ctx, "pazaak_history", "history", userId, { history: [entry, ...history].slice(0, 50) });
  }
  function broadcastSnapshot(dispatcher, snapshot, presences) {
    dispatcher.broadcastMessage(1 /* Snapshot */, json({ type: "match_update", data: snapshot }), presences ?? null);
  }
  var matchHandler = {
    matchInit(ctx, logger, nk, params) {
      const { coordinator, snapshot } = createInitialMatch(nk, ctx, params);
      logger.info("Pazaak match %s initialized", snapshot.id);
      return {
        state: {
          matchId: snapshot.id,
          coordinator,
          snapshot,
          presences: {},
          idempotency: {},
          settled: snapshot.settled
        },
        tickRate: 1,
        label: json({ game: "pazaak", matchId: snapshot.id })
      };
    },
    matchJoinAttempt(_ctx, _logger, _nk, _dispatcher, _tick, state, presence) {
      const allowed = state.snapshot.players.some((player) => player.userId === presence.userId);
      return allowed ? { state, accept: true } : { state, accept: false, rejectMessage: "Only match participants can join this match." };
    },
    matchJoin(_ctx, _logger, _nk, dispatcher, _tick, state, presences) {
      for (const presence of presences) state.presences[presence.userId] = presence;
      broadcastSnapshot(dispatcher, state.snapshot, presences);
      return { state };
    },
    matchLeave(_ctx, _logger, _nk, _dispatcher, _tick, state, presences) {
      for (const presence of presences) {
        delete state.presences[presence.userId];
        const updated = state.coordinator.markDisconnected(presence.userId);
        if (updated) state.snapshot = serializeMatch(updated);
      }
      return { state };
    },
    matchLoop(ctx, logger, nk, dispatcher, _tick, state, messages) {
      let changed = false;
      const timerUpdates = [
        ...state.coordinator.tickTurnTimers(),
        ...state.coordinator.tickDisconnectForfeits()
      ];
      if (timerUpdates.length > 0) {
        state.snapshot = serializeMatch(timerUpdates.at(-1));
        changed = true;
      }
      for (const message of messages) {
        if (message.opCode === 3 /* Chat */) {
          dispatcher.broadcastMessage(3 /* Chat */, textData(message.data), null, message.sender);
          continue;
        }
        if (message.opCode !== 2 /* Command */) continue;
        try {
          const payload = parsePayload(textData(message.data));
          const clientMoveId = typeof payload.clientMoveId === "string" ? payload.clientMoveId : "";
          if (clientMoveId && state.idempotency[clientMoveId]) {
            broadcastSnapshot(dispatcher, state.idempotency[clientMoveId], [message.sender]);
            continue;
          }
          const kind = String(payload.type ?? "");
          let updated;
          switch (kind) {
            case "draw":
              updated = state.coordinator.draw(state.matchId, message.sender.userId);
              break;
            case "stand":
              updated = state.coordinator.stand(state.matchId, message.sender.userId);
              break;
            case "end_turn":
              updated = state.coordinator.endTurn(state.matchId, message.sender.userId);
              break;
            case "forfeit":
              updated = state.coordinator.forfeit(state.matchId, message.sender.userId);
              break;
            case "play_side":
              updated = state.coordinator.playSideCard(
                state.matchId,
                message.sender.userId,
                String(payload.cardId ?? ""),
                Number(payload.appliedValue ?? 0)
              );
              break;
            default:
              throw new Error(`Unknown Pazaak command: ${kind}`);
          }
          state.snapshot = serializeMatch(updated);
          if (clientMoveId) state.idempotency[clientMoveId] = state.snapshot;
          changed = true;
        } catch (err) {
          logger.warn("Rejected Pazaak command from %s: %s", message.sender.userId, err instanceof Error ? err.message : String(err));
          dispatcher.broadcastMessage(4 /* Error */, json({ error: err instanceof Error ? err.message : String(err) }), [message.sender]);
        }
      }
      if (changed) {
        saveSnapshot(nk, ctx, state.snapshot);
        settleIfNeeded(nk, ctx, state);
        broadcastSnapshot(dispatcher, state.snapshot);
      }
      return { state };
    },
    matchTerminate(ctx, _logger, nk, _dispatcher, _tick, state) {
      saveSnapshot(nk, ctx, state.snapshot);
      settleIfNeeded(nk, ctx, state);
      return { state };
    },
    matchSignal(_ctx, _logger, _nk, dispatcher, _tick, state, data) {
      try {
        const relay = parsePayload(data).chatRelay;
        if (relay && typeof relay === "object") {
          dispatcher.broadcastMessage(3 /* Chat */, json(relay), null);
        }
      } catch {
      }
      return { state, data };
    }
  };
  function rpcConfigPublic(_ctx, _logger, _nk, _payload) {
    return json(toPublicConfig(PAZAAK_POLICY_DEFAULTS));
  }
  function rpcMe(ctx, _logger, nk, _payload) {
    const userId = requireUser(ctx);
    const wallet = getWallet(nk, ctx, userId);
    const active = readStorage(nk, ctx, "pazaak_matches", `active:${userId}`, SYSTEM_USER_ID);
    const snapshot = active?.matchId ? getSnapshot(nk, ctx, String(active.matchId)) : null;
    return json({
      user: { id: userId, username: ctx.username ?? userId, displayName: wallet.displayName },
      wallet: { ...wallet, mmrRd: wallet.rd, userSettings: getSettings(nk, ctx, userId) },
      queue: getGlobalList(nk, ctx, "queue").find((q) => q.userId === userId) ?? null,
      match: snapshot && snapshot.phase !== "completed" ? { ...snapshot, nakamaMatchId: active?.nakamaMatchId } : null
    });
  }
  function rpcSettingsGet(ctx, _logger, nk, _payload) {
    const userId = requireUser(ctx);
    return json({ settings: getSettings(nk, ctx, userId), wallet: getWallet(nk, ctx, userId) });
  }
  function rpcSettingsUpdate(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const next = { ...getSettings(nk, ctx, userId), ...parsePayload(payload) };
    return json({ settings: saveSettings(nk, ctx, userId, next), wallet: getWallet(nk, ctx, userId) });
  }
  function rpcSideboardsGet(ctx, _logger, nk) {
    return json({ sideboards: getSideboards(nk, ctx, requireUser(ctx)) });
  }
  function rpcSideboardSave(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    const name = String(body.name ?? "Default").trim().slice(0, 48);
    const tokens = Array.isArray(body.tokens) ? body.tokens.map(String).slice(0, 10) : [];
    const makeActive = body.makeActive !== false;
    const current = getSideboards(nk, ctx, userId);
    const updatedAt = nowIso();
    const sideboards = current.sideboards.filter((item) => item.name !== name);
    sideboards.push({ name, tokens, updatedAt, isActive: makeActive });
    const activeName = makeActive ? name : current.activeName;
    const next = saveSideboards(nk, ctx, {
      ...current,
      activeName,
      sideboards: sideboards.map((item) => ({ ...item, isActive: item.name === activeName }))
    });
    return json({ sideboards: next });
  }
  function rpcSideboardActive(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const name = String(parsePayload(payload).name ?? "").trim();
    const current = getSideboards(nk, ctx, userId);
    const next = saveSideboards(nk, ctx, {
      ...current,
      activeName: name,
      sideboards: current.sideboards.map((item) => ({ ...item, isActive: item.name === name }))
    });
    return json({ sideboards: next });
  }
  function rpcSideboardDelete(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const name = String(parsePayload(payload).name ?? "").trim();
    const current = getSideboards(nk, ctx, userId);
    const sideboards = current.sideboards.filter((item) => item.name !== name);
    const activeName = current.activeName === name ? null : current.activeName;
    return json({ sideboards: saveSideboards(nk, ctx, { ...current, activeName, sideboards }) });
  }
  function rpcLeaderboard(ctx, _logger, nk) {
    const records = nk.leaderboardRecordsList(ctx, LEADERBOARD_ID, null, 50).records ?? [];
    return json({
      leaders: records.map((record) => ({
        userId: record.ownerId,
        displayName: record.username ?? record.ownerId,
        mmr: record.score,
        mmrRd: record.subscore ?? PAZAAK_DEFAULT_RD,
        wins: Number(record.metadata?.wins ?? 0),
        losses: Number(record.metadata?.losses ?? 0),
        rank: record.rank ?? 0
      }))
    });
  }
  function rpcHistory(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const limit = Number(parsePayload(payload).limit ?? 25);
    const current = readStorage(nk, ctx, "pazaak_history", "history", userId);
    return json({ history: (current?.history ?? []).slice(0, Math.max(1, Math.min(100, limit))) });
  }
  function rpcQueueEnqueue(ctx, _logger, _nk, payload) {
    requireUser(ctx);
    void parsePayload(payload);
    return json({
      queue: null,
      match: null,
      nakamaMatchmaker: true,
      message: "Ranked queue uses the Nakama realtime matchmaker (socket.addMatchmaker); this RPC is unused."
    });
  }
  function rpcQueueLeave(ctx, _logger, _nk) {
    requireUser(ctx);
    return json({ removed: false, nakamaMatchmaker: true });
  }
  function rpcQueueStatus(ctx, _logger, _nk) {
    requireUser(ctx);
    return json({ queue: null });
  }
  function rpcQueueStats(ctx, _logger, nk) {
    const lobbies = getGlobalList(nk, ctx, "lobbies").filter((lobby) => lobby.status !== "closed");
    return json({
      playersInQueue: 0,
      openLobbies: lobbies.length,
      activeGames: 0,
      averageWaitSeconds: 0,
      averageWaitTime: "0s",
      queueUpdatedAt: nowIso()
    });
  }
  function createLobbyRecord(ctx, nk, body) {
    const userId = requireUser(ctx);
    const wallet = getWallet(nk, ctx, userId);
    const id = randomId();
    const maxPlayers = Math.max(2, Math.min(8, Number(body.maxPlayers ?? 2)));
    const at = nowIso();
    return {
      id,
      lobbyCode: id.slice(0, 6).toUpperCase(),
      name: String(body.name ?? `${wallet.displayName}'s table`).slice(0, 80),
      hostUserId: userId,
      maxPlayers,
      tableSettings: {
        variant: body.variant === "multi_seat" ? "multi_seat" : "canonical",
        maxPlayers,
        maxRounds: Number(body.maxRounds ?? 3),
        turnTimerSeconds: Number(body.turnTimerSeconds ?? PAZAAK_POLICY_DEFAULTS.timers.turnTimerSeconds),
        ranked: body.ranked !== false,
        allowAiFill: body.allowAiFill !== false,
        sideboardMode: body.sideboardMode === "player_active_custom" || body.sideboardMode === "host_mirror_custom" ? body.sideboardMode : "runtime_random",
        gameMode: body.gameMode === "wacky" ? "wacky" : "canonical"
      },
      players: [{ userId, displayName: wallet.displayName, ready: true, isHost: true, isAi: false, joinedAt: at }],
      passwordHash: null,
      status: "waiting",
      matchId: null,
      createdAt: at,
      updatedAt: at
    };
  }
  function rpcLobbiesList(ctx, _logger, nk) {
    return json({ lobbies: getGlobalList(nk, ctx, "lobbies").filter((lobby) => lobby.status !== "closed") });
  }
  function rpcLobbyCreate(ctx, _logger, nk, payload) {
    const lobbies = getGlobalList(nk, ctx, "lobbies");
    const lobby = createLobbyRecord(ctx, nk, parsePayload(payload));
    saveGlobalList(nk, ctx, "lobbies", [lobby, ...lobbies]);
    return json({ lobby });
  }
  function mutateLobby(ctx, nk, lobbyId, fn) {
    const lobbies = getGlobalList(nk, ctx, "lobbies");
    const idx = lobbies.findIndex((lobby) => lobby.id === lobbyId || lobby.lobbyCode.toLowerCase() === lobbyId.toLowerCase());
    if (idx === -1) return null;
    const next = fn(lobbies[idx]);
    lobbies[idx] = { ...next, updatedAt: nowIso() };
    saveGlobalList(nk, ctx, "lobbies", lobbies);
    return lobbies[idx];
  }
  function rpcLobbyJoin(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    const wallet = getWallet(nk, ctx, userId);
    const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? body.lobbyCode ?? ""), (current) => {
      if (current.players.some((player) => player.userId === userId)) return current;
      if (current.players.length >= current.maxPlayers) throw new Error("Lobby is full.");
      return {
        ...current,
        players: [...current.players, { userId, displayName: wallet.displayName, ready: false, isHost: false, isAi: false, joinedAt: nowIso() }]
      };
    });
    return json({ lobby });
  }
  function rpcLobbyReady(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
      ...current,
      players: current.players.map((player) => player.userId === userId ? { ...player, ready: body.ready !== false } : player)
    }));
    return json({ lobby });
  }
  function rpcLobbyStatus(ctx, _logger, nk, payload) {
    const body = parsePayload(payload);
    const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
      ...current,
      status: body.status === "matchmaking" ? "matchmaking" : "waiting"
    }));
    return json({ lobby });
  }
  function rpcLobbyLeave(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
      ...current,
      players: current.players.filter((player) => player.userId !== userId),
      status: current.hostUserId === userId ? "closed" : current.status
    }));
    return json({ lobby: lobby?.status === "closed" ? null : lobby });
  }
  function rpcLobbyStart(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    let hosted = null;
    const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => {
      if (current.hostUserId !== userId) throw new Error("Only the host can start this lobby.");
      const humans = current.players.filter((player) => !player.isAi);
      if (humans.length < 2) throw new Error("At least two human players are required.");
      const input = {
        playerOneId: humans[0].userId,
        playerOneName: humans[0].displayName,
        playerTwoId: humans[1].userId,
        playerTwoName: humans[1].displayName,
        setsToWin: current.tableSettings.maxRounds,
        ...current.tableSettings.gameMode ? { gameMode: current.tableSettings.gameMode } : {}
      };
      const created = createHostedMatch(nk, ctx, input);
      hosted = created;
      return { ...current, status: "in_game", matchId: created.match.id };
    });
    const hostedResult = hosted;
    return json({ lobby, match: hostedResult ? { ...hostedResult.match, nakamaMatchId: hostedResult.nakamaMatchId } : null });
  }
  function rpcLobbyAddAi(ctx, _logger, nk, payload) {
    const body = parsePayload(payload);
    const difficultyRaw = String(body.difficulty ?? "hard");
    const aiDifficulty = difficultyRaw === "easy" || difficultyRaw === "professional" ? difficultyRaw : "hard";
    const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => {
      if (current.players.length >= current.maxPlayers) throw new Error("Lobby is full.");
      const id = `ai:${randomId()}`;
      return {
        ...current,
        players: [...current.players, {
          userId: id,
          displayName: "Pazaak Droid",
          ready: true,
          isHost: false,
          isAi: true,
          aiDifficulty,
          joinedAt: nowIso()
        }]
      };
    });
    return json({ lobby });
  }
  function rpcLobbyAiDifficulty(ctx, _logger, nk, payload) {
    const body = parsePayload(payload);
    const aiUserId = String(body.aiUserId ?? "");
    const difficultyRaw = String(body.difficulty ?? "hard");
    const aiDifficulty = difficultyRaw === "easy" || difficultyRaw === "professional" ? difficultyRaw : "hard";
    const lobby = mutateLobby(ctx, nk, String(body.lobbyId ?? ""), (current) => ({
      ...current,
      players: current.players.map((player) => player.userId === aiUserId && player.isAi ? { ...player, aiDifficulty } : player)
    }));
    return json({ lobby });
  }
  function rpcMatchResolve(ctx, _logger, nk, payload) {
    const matchId = String(parsePayload(payload).matchId ?? "");
    return json({ index: matchId ? getMatchIndex(nk, ctx, matchId) : null });
  }
  function rpcMatchGet(ctx, _logger, nk, payload) {
    const body = parsePayload(payload);
    const matchId = typeof body.matchId === "string" ? body.matchId : String(readStorage(nk, ctx, "pazaak_matches", `active:${requireUser(ctx)}`, SYSTEM_USER_ID)?.matchId ?? "");
    const snapshot = matchId ? getSnapshot(nk, ctx, matchId) : null;
    const index = matchId ? getMatchIndex(nk, ctx, matchId) : null;
    return json({ match: snapshot ? { ...snapshot, nakamaMatchId: index?.nakamaMatchId } : null });
  }
  function rpcTournamentsList(ctx, _logger, nk, _payload) {
    const ids = readTournamentIdList(nk, ctx);
    const tournaments = [];
    for (const id of ids) {
      const t = loadTournament(nk, ctx, id);
      if (t) tournaments.push(summarizeTournamentState(t));
    }
    tournaments.sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    return json({ tournaments });
  }
  function rpcTournamentDetail(ctx, _logger, nk, payload) {
    const id = String(parsePayload(payload).tournamentId ?? "");
    const tournament = id ? loadTournament(nk, ctx, id) : null;
    if (!tournament) {
      return json({ tournament: null, bracket: { columns: [] }, standings: null });
    }
    return json({
      tournament,
      bracket: buildBracketView(tournament),
      standings: tournament.format === "swiss" ? computeSwissStandings(tournament) : null
    });
  }
  function rpcTournamentCreate(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    const formatRaw = String(body.format ?? "single_elim");
    const format = formatRaw === "double_elim" || formatRaw === "swiss" ? formatRaw : "single_elim";
    const modeRaw = String(body.gameMode ?? body.mode ?? "canonical");
    const gameMode = modeRaw === "wacky" ? "wacky" : "canonical";
    const organizerName = displayNameFor(nk, ctx, userId);
    const tournament = createTournament({
      name: String(body.name ?? "Unnamed Tournament").slice(0, 64),
      organizerId: userId,
      organizerName,
      format,
      gameMode,
      setsPerMatch: Math.max(1, Math.min(9, Number(body.setsPerMatch ?? 3) || 3)),
      rounds: Math.max(2, Math.min(12, Number(body.rounds ?? 5) || 5)),
      maxParticipants: typeof body.maxParticipants === "number" ? body.maxParticipants : null,
      guildId: null,
      channelId: null
    });
    appendTournamentId(nk, ctx, tournament.id);
    saveTournamentState(nk, ctx, tournament);
    return json({ tournament });
  }
  function rpcTournamentJoin(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const id = String(parsePayload(payload).tournamentId ?? "");
    const tournament = id ? loadTournament(nk, ctx, id) : null;
    if (!tournament) throw new Error("Tournament not found.");
    const wallet = getWallet(nk, ctx, userId);
    let next;
    try {
      next = registerParticipant(tournament, {
        userId,
        displayName: wallet.displayName,
        mmr: wallet.mmr
      });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Registration failed.");
    }
    saveTournamentState(nk, ctx, next);
    return json({ tournament: next });
  }
  function rpcTournamentLeave(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const id = String(parsePayload(payload).tournamentId ?? "");
    const tournament = id ? loadTournament(nk, ctx, id) : null;
    if (!tournament) throw new Error("Tournament not found.");
    const next = withdrawParticipant(tournament, userId);
    saveTournamentState(nk, ctx, next);
    return json({ tournament: next });
  }
  function rpcTournamentStart(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const id = String(parsePayload(payload).tournamentId ?? "");
    const tournament = id ? loadTournament(nk, ctx, id) : null;
    if (!tournament) throw new Error("Tournament not found.");
    if (tournament.organizerId !== userId) {
      throw new Error("Only the organizer can start this tournament.");
    }
    let started;
    try {
      started = startTournament(tournament);
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Unable to start.");
    }
    saveTournamentState(nk, ctx, started);
    return json({ tournament: started });
  }
  function rpcTournamentReport(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    const id = String(body.tournamentId ?? "");
    const tournament = id ? loadTournament(nk, ctx, id) : null;
    if (!tournament) throw new Error("Tournament not found.");
    const matchId = String(body.matchId ?? "");
    const winnerRaw = body.winnerUserId;
    const winnerUserId = winnerRaw === null || winnerRaw === void 0 ? null : String(winnerRaw);
    const match = tournament.matches.find((entry) => entry.id === matchId);
    if (!match) throw new Error("Match not found.");
    const isParticipant = userId === match.participantAId || userId === match.participantBId;
    const isOrganizer = userId === tournament.organizerId;
    if (!isParticipant && !isOrganizer) {
      throw new Error("Only the match participants or the organizer can report this match.");
    }
    let result;
    try {
      result = advanceTournament(tournament, { matchId, winnerUserId });
    } catch (err) {
      throw new Error(err instanceof Error ? err.message : "Advance failed.");
    }
    saveTournamentState(nk, ctx, result.state);
    return json({
      tournament: result.state,
      tournamentCompleted: result.tournamentCompleted
    });
  }
  function rpcTournamentCancel(ctx, _logger, nk, payload) {
    const userId = requireUser(ctx);
    const id = String(parsePayload(payload).tournamentId ?? "");
    const tournament = id ? loadTournament(nk, ctx, id) : null;
    if (!tournament) throw new Error("Tournament not found.");
    if (tournament.organizerId !== userId) {
      throw new Error("Only the organizer can cancel this tournament.");
    }
    const cancelled = { ...tournament, status: "cancelled", updatedAt: Date.now() };
    saveTournamentState(nk, ctx, cancelled);
    return json({ tournament: cancelled });
  }
  function rpcChatSend(ctx, logger, nk, payload) {
    const userId = requireUser(ctx);
    const body = parsePayload(payload);
    const matchId = String(body.matchId ?? "");
    const msg = {
      id: randomId(),
      matchId,
      userId,
      displayName: displayNameFor(nk, ctx, userId),
      text: String(body.text ?? "").slice(0, 500),
      at: Date.now()
    };
    const current = readStorage(nk, ctx, "pazaak_chat", matchId, SYSTEM_USER_ID);
    const messages = Array.isArray(current?.messages) ? current.messages : [];
    writeStorage(nk, ctx, "pazaak_chat", matchId, SYSTEM_USER_ID, { messages: [...messages, msg].slice(-100) });
    const index = matchId ? getMatchIndex(nk, ctx, matchId) : null;
    if (index?.nakamaMatchId) {
      try {
        nk.matchSignal(ctx, index.nakamaMatchId, json({ chatRelay: msg }));
      } catch (err) {
        logger.warn("Chat relay matchSignal failed: %s", err instanceof Error ? err.message : String(err));
      }
    }
    return json({ message: msg });
  }
  function rpcChatHistory(ctx, _logger, nk, payload) {
    const matchId = String(parsePayload(payload).matchId ?? "");
    const current = readStorage(nk, ctx, "pazaak_chat", matchId, SYSTEM_USER_ID);
    return json({ messages: Array.isArray(current?.messages) ? current.messages : [] });
  }
  function InitModule(ctx, logger, nk, initializer) {
    initializer.registerMatch(MATCH_HANDLER, matchHandler);
    initializer.registerMatchmakerMatched(matchmakerMatched);
    initializer.registerRpc("pazaak.config_public", rpcConfigPublic);
    initializer.registerRpc("pazaak.me", rpcMe);
    initializer.registerRpc("pazaak.settings_get", rpcSettingsGet);
    initializer.registerRpc("pazaak.settings_update", rpcSettingsUpdate);
    initializer.registerRpc("pazaak.sideboards_get", rpcSideboardsGet);
    initializer.registerRpc("pazaak.sideboard_save", rpcSideboardSave);
    initializer.registerRpc("pazaak.sideboard_active", rpcSideboardActive);
    initializer.registerRpc("pazaak.sideboard_delete", rpcSideboardDelete);
    initializer.registerRpc("pazaak.leaderboard", rpcLeaderboard);
    initializer.registerRpc("pazaak.history", rpcHistory);
    initializer.registerRpc("pazaak.matchmaking_enqueue", rpcQueueEnqueue);
    initializer.registerRpc("pazaak.matchmaking_leave", rpcQueueLeave);
    initializer.registerRpc("pazaak.matchmaking_status", rpcQueueStatus);
    initializer.registerRpc("pazaak.matchmaking_stats", rpcQueueStats);
    initializer.registerRpc("pazaak.lobbies_list", rpcLobbiesList);
    initializer.registerRpc("pazaak.lobby_create", rpcLobbyCreate);
    initializer.registerRpc("pazaak.lobby_join", rpcLobbyJoin);
    initializer.registerRpc("pazaak.lobby_ready", rpcLobbyReady);
    initializer.registerRpc("pazaak.lobby_status", rpcLobbyStatus);
    initializer.registerRpc("pazaak.lobby_leave", rpcLobbyLeave);
    initializer.registerRpc("pazaak.lobby_start", rpcLobbyStart);
    initializer.registerRpc("pazaak.lobby_add_ai", rpcLobbyAddAi);
    initializer.registerRpc("pazaak.lobby_ai_difficulty", rpcLobbyAiDifficulty);
    initializer.registerRpc("pazaak.match_get", rpcMatchGet);
    initializer.registerRpc("pazaak.match_resolve", rpcMatchResolve);
    initializer.registerRpc("pazaak.tournaments_list", rpcTournamentsList);
    initializer.registerRpc("pazaak.tournament_detail", rpcTournamentDetail);
    initializer.registerRpc("pazaak.tournament_create", rpcTournamentCreate);
    initializer.registerRpc("pazaak.tournament_join", rpcTournamentJoin);
    initializer.registerRpc("pazaak.tournament_leave", rpcTournamentLeave);
    initializer.registerRpc("pazaak.tournament_start", rpcTournamentStart);
    initializer.registerRpc("pazaak.tournament_report", rpcTournamentReport);
    initializer.registerRpc("pazaak.tournament_cancel", rpcTournamentCancel);
    initializer.registerRpc("pazaak.chat_send", rpcChatSend);
    initializer.registerRpc("pazaak.chat_history", rpcChatHistory);
    try {
      nk.leaderboardCreate(ctx, LEADERBOARD_ID, true, "desc", "set", void 0, { description: "Pazaak ranked MMR" });
    } catch {
    }
    logger.info("PazaakWorld Nakama runtime initialized.");
  }
  globalThis.InitModule = InitModule;
})();
module.exports = pazaakWorldRuntime;
//# sourceMappingURL=pazaak-world.js.map
