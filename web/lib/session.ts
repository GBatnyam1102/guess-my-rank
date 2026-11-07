// The session token lets a player rejoin after a refresh or a dropped connection (FR-46).
export interface StoredSession {
  code: string;
  playerId: string;
  token: string;
}

const SESSIONS_KEY = 'gmr.sessions';
const NICKNAME_KEY = 'gmr.nickname';

function readAll(): Record<string, StoredSession> {
  try {
    const raw = localStorage.getItem(SESSIONS_KEY);
    return raw ? (JSON.parse(raw) as Record<string, StoredSession>) : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, StoredSession>): void {
  try {
    localStorage.setItem(SESSIONS_KEY, JSON.stringify(all));
  } catch {
    // storage unavailable (private mode): the player just cannot rejoin after a refresh
  }
}

export function getSession(code: string): StoredSession | null {
  return readAll()[code.toUpperCase()] ?? null;
}

export function saveSession(session: StoredSession): void {
  const all = readAll();
  all[session.code.toUpperCase()] = session;
  writeAll(all);
}

export function clearSession(code: string): void {
  const all = readAll();
  delete all[code.toUpperCase()];
  writeAll(all);
}

export function lastNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function rememberNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // ignore
  }
}
