import { useCallback, useSyncExternalStore } from 'react';

export type Lang = 'pl' | 'en';
export type Theme = 'light' | 'dark';

const LANG_KEY = 'pptx-peek:lang';
const THEME_KEY = 'pptx-peek:theme';
const listeners = new Set<() => void>();

function isLang(value: string | null): value is Lang {
  return value === 'pl' || value === 'en';
}

function isTheme(value: string | null): value is Theme {
  return value === 'light' || value === 'dark';
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function store(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // Storage can be blocked; the preference then lasts for this page only.
  }
}

function detectLang(): Lang {
  return navigator.language.toLowerCase().startsWith('pl') ? 'pl' : 'en';
}

function detectTheme(): Theme {
  const dark =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  return dark ? 'dark' : 'light';
}

// The DOM is the source of truth: the boot script in index.html fills it before first paint.
function getLang(): Lang {
  const current = document.documentElement.lang;
  return isLang(current) ? current : detectLang();
}

function getTheme(): Theme {
  const current = document.documentElement.dataset.theme ?? null;
  return isTheme(current) ? current : detectTheme();
}

function notify(): void {
  listeners.forEach((listener) => listener());
}

export interface Preferences {
  lang: Lang;
  theme: Theme;
  toggleLang(): void;
  toggleTheme(): void;
}

export function usePreferences(): Preferences {
  const lang = useSyncExternalStore(subscribe, getLang);
  const theme = useSyncExternalStore(subscribe, getTheme);
  const toggleLang = useCallback(() => {
    const next: Lang = getLang() === 'pl' ? 'en' : 'pl';
    document.documentElement.lang = next;
    store(LANG_KEY, next);
    notify();
  }, []);
  const toggleTheme = useCallback(() => {
    const next: Theme = getTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    store(THEME_KEY, next);
    notify();
  }, []);
  return { lang, theme, toggleLang, toggleTheme };
}
