# PazaakWorld UI Enhancement - Developer Quick Start

## Using the New Components

### 1. Sound Effects

```typescript
import { soundManager } from "./utils/soundManager.ts";

// Play sound effects
soundManager.beep("success", 150);  // High pitched beep
soundManager.beep("error", 200);    // Low pitched beep
soundManager.playCardSound();        // Card play sound
soundManager.playDrawSound();        // Draw sound
soundManager.playRoundWinSound();    // Two ascending beeps
soundManager.playBustSound();        // Three descending beeps
soundManager.playErrorSound();       // Auth error beep

// Control sound
soundManager.setEnabled(true);
soundManager.setMusicVolume(0.5);
soundManager.setEffectsVolume(0.7);

// Start background music
soundManager.startBackgroundMusic();
soundManager.stopBackgroundMusic();
```

### 2. Animated Text

```typescript
import { AnimatedText } from "./components/AnimatedText.tsx";

// Jailbars effect (vertical lines moving across text)
<AnimatedText text="PAZAAK MATCH" animationType="jailbars" />

// Glitch effect (RGB channel separation)
<AnimatedText text="CONNECTION ERROR" animationType="glitch" />

// Scan lines effect (horizontal scan animation)
<AnimatedText text="SCANNING..." animationType="scan" />

// No animation
<AnimatedText text="Normal Text" animationType="none" />
```

### 3. Settings Modal

```typescript
import { SettingsModal } from "./components/SettingsModal.tsx";
import type { PazaakUserSettings } from "./types.ts";

const [isOpen, setIsOpen] = useState(false);
const [settings, setSettings] = useState<PazaakUserSettings>({
  theme: "kotor",
  soundEnabled: true,
  reducedMotionEnabled: false,
  turnTimerSeconds: 45,
  preferredAiDifficulty: "professional",
});

<SettingsModal
  isOpen={isOpen}
  currentSettings={settings}
  onClose={() => setIsOpen(false)}
  onSave={async (newSettings) => {
    setSettings(newSettings);
    // Save to server or localStorage
  }}
/>
```

### 4. Connection Status

```typescript
import { ConnectionStatus } from "./components/ConnectionStatus.tsx";

<ConnectionStatus 
  isOnline={true}
  socketState="connected"
/>
```

### 5. Game Assets

```typescript
import { PazaakAsset, CardAsset, CharacterPortrait, generateAiImageUrl } from "./components/PazaakAsset.tsx";

// Generic asset with fallback
<PazaakAsset
  src="/images/card.png"
  fallback="◆"
  alt="Card"
  size="md"
  type="card"
/>

// Card visualization
<CardAsset cardValue={5} variant="main" />

// Character portrait
<CharacterPortrait
  name="Carth Onasi"
  difficulty="advanced"
  src={generateAiImageUrl("portrait of Carth Onasi")}
/>
```

### 6. Global Account Corner

```typescript
import { GlobalAccountCorner } from "./components/GlobalAccountCorner.tsx";

<GlobalAccountCorner
  username="Player Name"
  mmr={1500}
  isOnline={true}
  canLogout={true}
  canJumpToLobby={true}
  busy={false}
  currentSettings={userSettings}
  socketState="connected"
  onRefresh={() => { /* ... */ }}
  onJumpToLobby={() => { /* ... */ }}
  onLogout={() => { /* ... */ }}
  onSignIn={() => { /* ... */ }}
  onSettingsSave={async (settings) => { /* ... */ }}
/>
```

## Styling with New Animations

```css
/* Use the animations in your CSS */
.my-element {
  animation: slideUp 0.3s ease-out;
  /* or: fadeIn, slideDown, scaleIn */
}

/* Respect reduced motion */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
  }
}
```

## Integration Patterns

### Pattern 1: Play Sound on Action

```typescript
const handleCardPlay = async () => {
  soundManager.playCardSound();
  // Play card logic
  await playCard(selectedCard);
};
```

### Pattern 2: Settings with Sound

```typescript
const handleSettingsSave = async (newSettings: PazaakUserSettings) => {
  soundManager.setEnabled(newSettings.soundEnabled);
  soundManager.setEffectsVolume(newSettings.soundEnabled ? 0.7 : 0);
  await updateSettings(newSettings);
  soundManager.beep("success");
};
```

### Pattern 3: Error Feedback

```typescript
const handleAuthError = (error: Error) => {
  soundManager.playErrorSound();
  showErrorMessage(error.message);
};
```

### Pattern 4: Asset Loading with Fallback

```typescript
const [portraitUrl, setPortraitUrl] = useState<string | undefined>();

useEffect(() => {
  generateCharacterPortrait(opponentId)
    .then(url => setPortraitUrl(url))
    .catch(() => setPortraitUrl(undefined)); // Use fallback
}, [opponentId]);

<PazaakAsset
  src={portraitUrl}
  fallback="◌"
  alt={opponentName}
  type="character"
/>
```

## Accessibility Features

- **Reduced Motion**: All animations respect `prefers-reduced-motion` setting
- **Keyboard Navigation**: Settings modal, account menu fully keyboard accessible
- **ARIA Labels**: All interactive elements have proper labels
- **Fallbacks**: Sound disabled in browsers without Web Audio API
- **Screen Readers**: Proper semantic HTML and ARIA attributes

## Performance Tips

1. **AnimatedBackground**: Uses Canvas (efficient) but consider disabling on low-end devices
2. **Sound Manager**: Uses Web Audio API (minimal overhead)
3. **Connection Status**: Pings every 3 seconds (configurable)
4. **Animations**: CSS-based where possible (hardware accelerated)

## Browser Support

- Chrome/Edge 90+
- Firefox 88+
- Safari 14+
- Mobile Safari 14.5+

**Not supported**:
- IE 11 (no Web Audio API)
- Old browsers without ES2020 support

## Debugging

Enable console logging:
```typescript
// In soundManager.ts
console.log('Sound config:', soundManager.getConfig());

// Check animation performance
performance.mark('animation-start');
// ... animation code
performance.mark('animation-end');
performance.measure('animation', 'animation-start', 'animation-end');
```

## Known Limitations

1. **Web Audio**: Requires user interaction before first sound can play (browser autoplay policy)
2. **Canvas Background**: May impact performance on very large screens
3. **Clipboard**: Copy username requires secure context (HTTPS)

## Future Enhancements

- [ ] Configurable animation intensity
- [ ] Multiple themes with custom colors
- [ ] Voice effects for game events
- [ ] Animated card transitions
- [ ] 3D card flip animation
- [ ] Particle effects on special moves
