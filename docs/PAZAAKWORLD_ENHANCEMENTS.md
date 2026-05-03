# PazaakWorld Enhancement Implementation Guide

This document outlines all the major improvements made to the Pazaak World UI and provides guidance for integrating vendor opponent data and AI strategies.

## ✅ Completed Enhancements

### 1. **UI/UX Animations & Effects**
- **AnimatedBackground.tsx**: Renders twinkling stars with glow effects in the background
  - Real-time animation using Canvas API
  - Subtle particle movement for immersion
  - Respects `prefers-reduced-motion` setting
  - Fixed positioning at z-index 1 (behind all content)

- **AnimatedText.tsx**: Multiple text animation effects
  - Jailbars effect (moving vertical lines across text)
  - Glitch effect (RGB channel separation)
  - Scan lines effect (horizontal scanning)
  - Fully configurable and accessible

### 2. **Sound System**
- **soundManager.ts**: Web Audio API-based sound manager
  - Beep effects: success (1200Hz), error (400Hz), warning (800Hz)
  - Background ambient music (multi-tone sine waves)
  - Game event sounds: card play, stand, draw, round win/loss, bust
  - Configurable volume for music and effects
  - LocalStorage persistence for user preferences
  - Auto-cleanup on destroy

### 3. **Real-Time Connection Status**
- **ConnectionStatus.tsx**: Live ping measurement
  - Measures latency to `/api/ping` endpoint every 3 seconds
  - Color-coded status: green (<100ms), yellow (<300ms), red (>300ms)
  - Shows "Connecting...", "Connected", "Disconnected", or ping time
  - Handles socket reconnection states

### 4. **Separated Settings UI**
- **SettingsModal.tsx**: Modal interface for game settings
  - Theme selection (KOTOR Classic, Dark, Light)
  - Sound effects toggle
  - Reduced motion (accessibility)
  - Turn timer selection (30-120s)
  - AI difficulty preference (Easy, Hard, Professional)
  - Persists to localStorage and server

- **GlobalAccountCorner.tsx**: Enhanced account menu
  - Separated gear icon (opens Settings modal)
  - Identity button (opens Account menu)
  - Connection status indicator
  - Copy username, refresh profile, logout functions
  - Keyboard navigation (Arrow keys, Tab, Escape)
  - Full accessibility support

### 5. **Game Asset System**
- **PazaakAsset.tsx**: Flexible asset renderer
  - Supports images from URLs
  - Deterministic prompt+seed inline SVG generation (no external placeholder service dependency)
  - Unicode fallbacks for instant display
  - Card visualization component
  - Character portrait with difficulty display
  - Responsive sizing (sm/md/lg/xl)

### 6. **GitHub Pages Deployment**
- **.github/workflows/deploy-pazaakworld.yml**: GitHub Actions workflow
  - Triggered on push to main or manual dispatch
  - Builds pazaak-world with Vite
  - Deploys to `th3w1zard1.github.io/pazaakworld`
  - Proper base path handling (`/pazaakworld/`)
  - Uses Node.js 20 + pnpm

- **vite.config.ts**: Updated with BASE path support
  - Reads from `process.env.BASE` (set by GitHub Actions)
  - Defaults to `/` for local development

## 🔄 Next Steps: Vendor Integration

### Phase 1: Opponent Data Integration

**Source**: `vendor/HoloPazaak/src/holopazaak/data/opponents.py`

The HoloPazaak implementation contains **30+ opponent profiles** with:
- Full character names and titles
- Skill levels (1-20 scale)
- Difficulty tiers (Novice → Master)
- Faction/origin information
- **Character phrase pools** for game events:
  - When cards are chosen
  - When standing
  - When winning/losing rounds
  - When winning/losing games
  - Special reactions for game events

**Integration Points**:

1. **In `packages/pazaak-engine/src/opponents.ts`**:
   ```typescript
   interface PazaakOpponentProfile {
     id: string;
     displayName: string;
     title?: string;
     faction?: string;
     skillLevel: number;          // 1-20
     vendorDifficulty: string;    // "novice" | "advanced" | "expert" | "master"
     sideDeckTokens: SideBoardToken[];
     phrases: {
       chosen?: string[];         // When opponent is selected
       cardChosen?: string[];     // When card is played
       standing?: string[];       // When opponent stands
       victory?: string[];        // When opponent wins round/game
       defeat?: string[];         // When opponent loses
       roundWin?: string[];       // Round victory
       roundLoss?: string[];       // Round defeat
       gameWin?: string[];        // Match victory
       gameLoss?: string[];       // Match defeat
     };
     portraitUrl?: string;        // Optional: AI-generated or real image
     description?: string;       // Background/lore
   }
   ```

2. **Export from engine**:
   ```typescript
   export const expandedOpponents = [...localOpponents, ...holopazaakOpponents];
   export const getOpponentPhrases = (opponentId: string, event: string): string =>
     // Randomly select from opponent.phrases[event] with anti-repeat logic
   ```

3. **Usage in Activity UI**:
   ```typescript
   // In LocalPracticeGame.tsx
   const opponent = opponents.find(o => o.id === selectedId);
   const phrase = getOpponentPhrases(opponent.id, 'standing');
   displayOpponentMessage(phrase);
   ```

### Phase 2: AI Strategy Integration

**Source**: `vendor/HoloPazaak/src/holopazaak/ai/strategies.py`

Implement 5 AI difficulty tiers:

1. **EasyAI**: Random/basic decisions
   - Stands at 15+ score
   - Random card selection
   - Minimal lookahead

2. **NormalAI**: Improved heuristics
   - Stands at 17+ score
   - Basic bust probability calculation
   - Simple card scoring

3. **HardAI**: Advanced strategy
   - Dynamic stand threshold based on board state
   - Sophisticated bust avoidance
   - Side card combo recognition

4. **ExpertAI**: Competitive level
   - Game-state aware decision making
   - Psychological play (bluffing logic)
   - Opponent pattern recognition

5. **MasterAI**: Championship level
   - Perfect information-theoretic play
   - Meta-gaming and adaptation
   - Exploit opponent weaknesses

**Integration**:
```typescript
// In packages/pazaak-engine/src/ai.ts or new file
export type AiDifficulty = 'easy' | 'normal' | 'hard' | 'expert' | 'master';

export function generateAiMove(
  gameState: PazaakGameState,
  playerState: PazaakPlayerState,
  difficulty: AiDifficulty
): PazaakAiMove {
  switch(difficulty) {
    case 'easy': return easyAiMove(...);
    case 'normal': return normalAiMove(...);
    // ... etc
  }
}
```

### Phase 3: Advanced Mechanics

**Source**: `vendor/PazaakWorld/server/game/` + `ai.ts`

Incorporate:
- Professional AI with performance-aware thinking delays
- Side deck generation with special yellow cards
- Bust probability calculations
- Game state analysis and scoring

## 📋 Integration Checklist

- [ ] Extract opponent data from `vendor/HoloPazaak/src/holopazaak/data/opponents.py`
- [ ] Convert Python opponent definitions to TypeScript
- [ ] Add opponent profiles to `packages/pazaak-engine/src/opponents.ts`
- [ ] Export phrase system from engine
- [ ] Implement `getOpponentPhrases()` helper
- [ ] Test phrase display in LocalPracticeGame
- [ ] Extract AI strategies from HoloPazaak
- [ ] Implement 5-tier AI difficulty system
- [ ] Add thinking delays based on difficulty
- [ ] Test AI behavior across game scenarios
- [ ] Add professional-level AI from PazaakWorld
- [ ] Generate character portraits (using `generateAiImageUrl` from PazaakAsset)
- [ ] Create opponent selection UI with portraits
- [ ] Test full integration with new UI

## 🎨 Visual Enhancement Ideas

### Character Portraits
Use the `generateAiImageUrl()` function to create unique visuals for each opponent:
```typescript
const portraitUrl = generateAiImageUrl(
  `Character portrait of ${opponent.displayName}, ${opponent.faction} faction, ${opponent.title}`,
  { seed: hashStringToNumber(opponent.id) }
);
```

### Card Art
Create custom card visualizations with Pazaak-specific iconography:
- Main deck cards: numbered 1-10 in KOTOR style
- Side cards: special effects (Flip, Tiebreaker, etc.)

### Battle Arena
Enhance LocalPracticeGame with:
- Animated card placement
- Score update animations
- Character phrase display with typing effect
- Environmental atmosphere

## 🚀 Deployment

The GitHub Actions workflow is ready:

```bash
# Push to main branch to trigger deployment
# Workflow builds and deploys to th3w1zard1.github.io/pazaakworld
# Visit: https://th3w1zard1.github.io/pazaakworld
```

## 📝 Code Organization

```
apps/pazaak-world/
  src/
    components/
      AnimatedBackground.tsx        ✅
      AnimatedText.tsx              ✅
      GlobalAccountCorner.tsx       ✅
      SettingsModal.tsx             ✅
      ConnectionStatus.tsx          ✅
      PazaakAsset.tsx              ✅
      GameBoard.tsx                (existing)
      LocalPracticeGame.tsx         (existing - needs opponent integration)
    utils/
      soundManager.ts              ✅
    App.tsx                         ✅
    index.css                       ✅
    main.tsx                        ✅

packages/pazaak-engine/
  src/
    opponents.ts                    🔄 (needs vendor integration)
    ai.ts                          🔄 (needs vendor integration)
```

## 🔗 Resources

- **HoloPazaak Source**: `vendor/HoloPazaak/src/holopazaak/`
- **PazaakWorld Source**: `vendor/PazaakWorld/server/game/`
- **Current Opponent Data**: `packages/pazaak-engine/src/opponents.ts`
- **Game Engine**: `packages/pazaak-engine/src/index.ts`

## ✨ Testing Checklist

- [ ] Stars animate smoothly without performance impact
- [ ] Sound effects play on all browsers (check Web Audio support)
- [ ] Settings persist across sessions
- [ ] Connection status updates in real-time
- [ ] Gear icon opens settings modal separately from account menu
- [ ] All animations respect `prefers-reduced-motion` setting
- [ ] GitHub Pages deployment works at `/pazaakworld/` path
- [ ] Opponent phrases display contextually
- [ ] AI plays correctly at all difficulty levels
- [ ] UI is fully accessible (keyboard navigation, screen readers)
- [ ] Mobile responsive design works (tested on small screens)
