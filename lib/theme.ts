import { cookies } from 'next/headers';

export type ThemePref = 'system' | 'light' | 'dark';
export const THEME_COOKIE = 'theme';

export function normalizeTheme(value: string | undefined | null): ThemePref {
  return value === 'light' || value === 'dark' ? value : 'system';
}

// Server Components only. Returns the explicit choice, or 'system'.
export function getThemePref(): ThemePref {
  return normalizeTheme(cookies().get(THEME_COOKIE)?.value);
}

// The value to put on <html data-theme>; undefined means "follow the OS".
export function themeAttr(pref: ThemePref): 'light' | 'dark' | undefined {
  return pref === 'system' ? undefined : pref;
}
