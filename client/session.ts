const SESSION_KEY = 'word-mahjong.session.v1';
const NICKNAME_KEY = 'word-mahjong.nickname.v1';

export interface SavedSession {
  roomCode: string;
  playerId: string;
  token: string;
}

export function loadSession(): SavedSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (
      typeof parsed.roomCode !== 'string' ||
      typeof parsed.playerId !== 'string' ||
      typeof parsed.token !== 'string'
    ) {
      return null;
    }
    return {
      roomCode: parsed.roomCode,
      playerId: parsed.playerId,
      token: parsed.token,
    };
  } catch {
    return null;
  }
}

export function saveSession(session: SavedSession): void {
  try {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify(session));
  } catch {
    // Storage can be unavailable in private browsing; the game still works until refresh.
  }
}

export function clearSession(): void {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore storage failures.
  }
}

export function loadNickname(): string {
  try {
    return localStorage.getItem(NICKNAME_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveNickname(nickname: string): void {
  try {
    localStorage.setItem(NICKNAME_KEY, nickname);
  } catch {
    // Ignore storage failures.
  }
}
