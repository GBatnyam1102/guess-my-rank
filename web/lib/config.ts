export function serverUrl(): string {
  const fromEnv = process.env.NEXT_PUBLIC_SERVER_URL;
  if (fromEnv) return fromEnv.replace(/\/$/, '');
  if (typeof window === 'undefined') return 'http://localhost:4000';
  return `${window.location.protocol}//${window.location.hostname}:4000`;
}

/** Server-relative paths (content cards, local uploads) are served by the game server. */
export function assetUrl(url: string): string {
  return /^(https?:|data:|blob:)/.test(url) ? url : `${serverUrl()}${url}`;
}
