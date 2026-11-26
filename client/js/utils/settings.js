import { GRAPHICS_QUALITY } from '@shared/constants.js';

const STORAGE_KEY = 'jah_settings_v1';

const DEFAULT_SETTINGS = {
  soundEnabled: true,
  volume: 0.7,
  graphicsQuality: GRAPHICS_QUALITY.MEDIUM,
  cameraSensitivity: 1.0
};

class SettingsManager {
  constructor() {
    this.data = this.load();
    this.listeners = new Set();
  }

  load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SETTINGS };
      return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch {
      // Abaikan jika storage penuh atau diblokir
    }
    this.listeners.forEach((fn) => fn(this.data));
  }

  get() {
    return { ...this.data };
  }

  update(partial) {
    this.data = { ...this.data, ...partial };
    this.save();
  }

  onChange(fn) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
}

export const settingsManager = new SettingsManager();
