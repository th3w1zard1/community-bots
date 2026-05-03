/**
 * Simple sound manager for Pazaak World
 */

interface SoundConfig {
  enabled: boolean;
  musicVolume: number;
  effectsVolume: number;
}

type AudioContextConstructor = new () => AudioContext;

interface AudioWindow extends Window {
  webkitAudioContext?: AudioContextConstructor;
}

class SoundManager {
  private config: SoundConfig = {
    enabled: true,
    musicVolume: 0.3,
    effectsVolume: 0.7,
  };

  private backgroundMusic: HTMLAudioElement | null = null;
  private audioContext: AudioContext | null = null;

  constructor() {
    this.loadConfig();
  }

  private isSoundConfig(value: unknown): value is SoundConfig {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }
    const o = value as Record<string, unknown>;
    return (
      typeof o.enabled === "boolean"
      && typeof o.musicVolume === "number"
      && Number.isFinite(o.musicVolume)
      && typeof o.effectsVolume === "number"
      && Number.isFinite(o.effectsVolume)
    );
  }

  private loadConfig() {
    try {
      const stored = window.localStorage.getItem("pazaak-sound-config");
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (this.isSoundConfig(parsed)) {
          this.config = parsed;
        }
      }
    } catch {
      // Use defaults
    }
  }

  private saveConfig() {
    try {
      window.localStorage.setItem("pazaak-sound-config", JSON.stringify(this.config));
    } catch {
      // Ignore storage failures
    }
  }

  /**
   * Play a beep sound effect
   * @param frequency Frequency in Hz (default: 800)
   * @param duration Duration in ms (default: 200)
   * @param type "success" | "error" | "warning"
   */
  beep(type: "success" | "error" | "warning" = "warning", duration = 200) {
    if (!this.config.enabled) return;

    try {
      // Initialize audio context if needed
      if (!this.audioContext) {
        const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
        if (!Ctor) {
          return;
        }
        this.audioContext = new Ctor();
      }

      const ctx = this.audioContext;
      const now = ctx.currentTime;

      // Create oscillator
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.connect(gain);
      gain.connect(ctx.destination);

      // Set frequency based on type
      switch (type) {
        case "success":
          osc.frequency.value = 1200; // High beep
          break;
        case "error":
          osc.frequency.value = 400; // Low beep
          break;
        case "warning":
          osc.frequency.value = 800; // Medium beep
          break;
      }

      // Fade in/out to avoid clicks
      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(this.config.effectsVolume * 0.8, now + 0.01);
      gain.gain.linearRampToValueAtTime(0, now + (duration / 1000));

      osc.start(now);
      osc.stop(now + (duration / 1000));
    } catch {
      // Audio context not available, silently fail
    }
  }

  /**
   * Start background music (ambient pazaak theme)
   */
  startBackgroundMusic() {
    if (!this.config.enabled) return;

    if (this.backgroundMusic) {
      this.backgroundMusic.play().catch(() => {
        // Autoplay may be blocked
      });
      return;
    }

    try {
      // Create a simple ambient tone using Web Audio API
      const Ctor = window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
      if (!this.audioContext && !Ctor) {
        return;
      }

      const audioContext = this.audioContext || new Ctor();
      if (!this.audioContext) {
        this.audioContext = audioContext;
      }

      const now = audioContext.currentTime;
      const duration = 16; // Loop duration in seconds

      // Create multiple oscillators for ambient effect
      const frequencies = [110, 165, 220]; // A2, E3, A3
      const gains = frequencies.map(() => audioContext.createGain());

      frequencies.forEach((freq, i) => {
        const osc = audioContext.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;

        osc.connect(gains[i]);
        gains[i].gain.setValueAtTime(this.config.musicVolume * 0.2, now);
        gains[i].connect(audioContext.destination);

        osc.start();
      });
    } catch {
      // Audio context not available, silently fail
    }
  }

  /**
   * Stop background music
   */
  stopBackgroundMusic() {
    if (this.backgroundMusic) {
      this.backgroundMusic.pause();
      this.backgroundMusic = null;
    }
  }

  /**
   * Play a card play sound effect
   */
  playCardSound() {
    this.beep("success", 150);
  }

  /**
   * Play a stand sound effect
   */
  playStandSound() {
    this.beep("warning", 250);
  }

  /**
   * Play a draw/turn sound effect
   */
  playDrawSound() {
    this.beep("success", 100);
  }

  /**
   * Play a round win sound
   */
  playRoundWinSound() {
    // Two ascending beeps
    this.beep("success", 150);
    setTimeout(() => this.beep("success", 150), 200);
  }

  /**
   * Play a round loss sound
   */
  playRoundLossSound() {
    // Two descending beeps
    this.beep("error", 200);
    setTimeout(() => this.beep("error", 150), 150);
  }

  /**
   * Play a bust/bust sound
   */
  playBustSound() {
    // Three descending beeps
    this.beep("error", 150);
    setTimeout(() => this.beep("error", 130), 100);
    setTimeout(() => this.beep("error", 100), 200);
  }

  /**
   * Play an error sound (e.g., auth failure)
   */
  playErrorSound() {
    this.beep("error", 500);
  }

  setEnabled(enabled: boolean) {
    this.config.enabled = enabled;
    this.saveConfig();
    if (!enabled) {
      this.stopBackgroundMusic();
    }
  }

  setMusicVolume(volume: number) {
    this.config.musicVolume = Math.max(0, Math.min(1, volume));
    this.saveConfig();
  }

  setEffectsVolume(volume: number) {
    this.config.effectsVolume = Math.max(0, Math.min(1, volume));
    this.saveConfig();
  }

  getConfig() {
    return { ...this.config };
  }
}

// Singleton instance
export const soundManager = new SoundManager();

// Convenience standalone exports used by card game components
export const playDrawSound = () => soundManager.playDrawSound();
export const playPositiveSound = () => soundManager.playRoundWinSound();
export const playNegativeSound = () => soundManager.playRoundLossSound();
export const playVictorySound = () => {
  soundManager.playRoundWinSound();
  setTimeout(() => soundManager.playRoundWinSound(), 300);
};
