import type { RoomSettings, RoomSnapshot } from '@shared/types';
import { emitAck } from './socket';
import { clearSession, saveSession } from './session';
import { useStore } from './store';

interface CreateResponse {
  roomCode: string;
  token: string;
  snapshot: RoomSnapshot;
}

interface JoinResponse {
  token: string;
  snapshot: RoomSnapshot;
}

async function send<T>(
  label: string,
  event: string,
  payload: unknown,
  onSuccess?: (data: T) => void,
): Promise<boolean> {
  const store = useStore.getState();
  if (store.pendingAction) {
    return false;
  }
  if (!store.connected) {
    store.showToast('warn', '连接还没有恢复，请稍候');
    return false;
  }

  store.setPending(label);
  try {
    const response = await emitAck<T>(event, payload);
    if (!response.ok) {
      useStore.getState().showToast('error', response.error.message);
      return false;
    }
    onSuccess?.(response.data);
    return true;
  } catch {
    useStore.getState().showToast('error', '网络请求失败，请重试');
    return false;
  } finally {
    useStore.getState().setPending(null);
  }
}

export function createRoom(
  nickname: string,
  settings: RoomSettings,
): Promise<boolean> {
  return send<CreateResponse>('create', 'room:create', { nickname, settings }, (data) => {
    const store = useStore.getState();
    store.setNickname(nickname);
    saveSession({
      roomCode: data.roomCode,
      playerId: data.snapshot.you.playerId,
      token: data.token,
    });
    store.applySnapshot(data.snapshot);
  });
}

export function joinRoom(nickname: string, roomCode: string): Promise<boolean> {
  return send<JoinResponse>('join', 'room:join', { roomCode, nickname }, (data) => {
    const store = useStore.getState();
    store.setNickname(nickname);
    saveSession({
      roomCode: data.snapshot.roomCode,
      playerId: data.snapshot.you.playerId,
      token: data.token,
    });
    store.applySnapshot(data.snapshot);
  });
}

export function setReady(ready: boolean): Promise<boolean> {
  return send<null>('ready', 'lobby:ready', { ready });
}

export function updateSettings(
  patch: Partial<Pick<RoomSettings, 'mode' | 'openHands' | 'claimPolicy'>>,
): Promise<boolean> {
  return send<null>('settings', 'lobby:settings', { patch });
}

export function startGame(): Promise<boolean> {
  return send<null>('start', 'lobby:start', {});
}

export async function leaveRoom(): Promise<boolean> {
  const ok = await send<null>('leave', 'room:leave', {});
  if (ok) {
    clearSession();
    useStore.getState().resetRoom();
    useStore.getState().showToast('info', '已离开房间');
  }
  return ok;
}

export function discard(tileId: string, phaseId: string): Promise<boolean> {
  return send<null>('discard', 'game:discard', { phaseId, tileId });
}

export function declareHu(phaseId: string, segments: string[][]): Promise<boolean> {
  return send<null>('hu', 'game:hu', { phaseId, segments });
}

export function playPhrase(phaseId: string, tileIds: string[]): Promise<boolean> {
  return send<null>('phrase', 'game:phrase', { phaseId, tileIds });
}

export function passTurn(phaseId: string): Promise<boolean> {
  return send<null>('pass', 'game:pass', { phaseId });
}

export function respondClaim(phaseId: string, take: boolean): Promise<boolean> {
  return send<null>('claim', 'game:claim', { phaseId, take });
}

export function castVote(phaseId: string, approve: boolean): Promise<boolean> {
  return send<null>('vote', 'game:vote', { phaseId, approve });
}

export function nextRound(): Promise<boolean> {
  return send<null>('nextRound', 'round:next', {});
}
