// Shared by the root layout (a server component) and the client-side theme hook.

export type Theme = 'light' | 'dark';

export const THEME_KEY = 'gmr.theme';

/** Same as --color-ink in globals.css, for the browser's address bar. */
export const THEME_COLORS: Record<Theme, string> = { light: '#f6f3ff', dark: '#0e0a1c' };

/**
 * Runs in <head> before the first paint so a light-theme player never sees a dark flash.
 * Same rules as readPref/resolveTheme in theme.ts.
 */
export const themeInitScript = `(function(){try{var p=localStorage.getItem('${THEME_KEY}');var d=p==='dark'||(p!=='light'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){document.documentElement.dataset.theme='dark'}})()`;
