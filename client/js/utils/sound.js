import { settingsManager } from './settings.js';

class SoundFX {
  constructor() {
    this.ctx = null;
  }

  ensureContext() {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playTone(freq, duration = 0.12, type = 'sine', gainScale = 0.25, delay = 0) {
    const cfg = settingsManager.get();
    if (!cfg.soundEnabled || cfg.volume <= 0) return;

    const ctx = this.ensureContext();
    if (!ctx) return;

    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);

    const vol = Math.max(0.001, cfg.volume * gainScale);
    gain.gain.setValueAtTime(vol, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  hover() {
    this.playTone(540, 0.04, 'sine', 0.08);
  }

  click() {
    this.playTone(680, 0.07, 'triangle', 0.18);
  }

  question() {
    this.playTone(523.25, 0.1, 'triangle', 0.22, 0);
    this.playTone(659.25, 0.14, 'triangle', 0.22, 0.08);
  }

  answerYes() {
    this.playTone(523.25, 0.12, 'sine', 0.25, 0);
    this.playTone(659.25, 0.12, 'sine', 0.25, 0.09);
    this.playTone(783.99, 0.22, 'sine', 0.28, 0.18);
  }

  answerNo() {
    this.playTone(340, 0.14, 'sawtooth', 0.16, 0);
    this.playTone(250, 0.22, 'sawtooth', 0.16, 0.12);
  }

  answerSkip() {
    this.playTone(440, 0.12, 'triangle', 0.22, 0);
    this.playTone(415, 0.22, 'triangle', 0.22, 0.12);
  }

  wheelTick() {
    this.playTone(900, 0.03, 'square', 0.1);
  }

  win() {
    [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
      this.playTone(f, 0.22, 'triangle', 0.26, i * 0.11);
    });
  }

  lose() {
    [392, 349.23, 311.13, 261.63].forEach((f, i) => {
      this.playTone(f, 0.25, 'sawtooth', 0.18, i * 0.14);
    });
  }
}

export const soundFX = new SoundFX();
