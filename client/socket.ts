import { io, type Socket } from 'socket.io-client';
import type {
  Ack,
  ClientToServerEvents,
  RoomSnapshot,
  ServerToClientEvents,
} from '@shared/types';
import { clearSession, loadSession, saveSession } from './session';
import { useStore } from './store';

export const socket: Socket<ServerToClientEvents, ClientToServerEvents> = io({
  autoConnect: true,
}) as Socket<ServerToClientEvents, ClientToServerEvents>;

export function emitAck<T>(event: string, payload: unknown): Promise<Ack<T>> {
  return new Promise((resolve) => {
    const rawSocket = socket as unknown as {
      emit: (
        eventName: string,
        payload: unknown,
        ack: (response: Ack<T>) => void,
      ) => void;
    };
    rawSocket.emit(event, payload, resolve);
  });
}

let resumeAttempt = 0;

socket.on('connect', () => {
  useStore.getState().setConnected(true);
  const saved = loadSession();
  if (!saved) {
    useStore.getState().setResuming(false);
    return;
  }

  const attempt = ++resumeAttempt;
  useStore.getState().setResuming(true);
  emitAck<{ snapshot: RoomSnapshot }>('session:resume', {
    roomCode: saved.roomCode,
    token: saved.token,
  })
    .then((response) => {
      if (attempt !== resumeAttempt) {
        return;
      }
      if (response.ok) {
        useStore.getState().applySnapshot(response.data.snapshot);
        saveSession({
          roomCode: response.data.snapshot.roomCode,
          playerId: response.data.snapshot.you.playerId,
          token: saved.token,
        });
      } else {
        clearSession();
        useStore.getState().resetRoom();
        useStore.getState().showToast('warn', response.error.message);
      }
    })
    .catch(() => {
      if (attempt === resumeAttempt) {
        useStore.getState().resetRoom();
        useStore.getState().showToast('warn', '恢复牌桌失败，请重新进入房间');
      }
    })
    .finally(() => {
      if (attempt === resumeAttempt) {
        useStore.getState().setResuming(false);
      }
    });
});

socket.on('disconnect', () => {
  useStore.getState().setConnected(false);
});

socket.on('connect_error', () => {
  useStore.getState().setConnected(false);
});

socket.on('room:snapshot', (snapshot) => {
  useStore.getState().applySnapshot(snapshot);
});

socket.on('notice', (notice) => {
  useStore.getState().showToast(notice.level, notice.message);
});

socket.on('session:replaced', () => {
  clearSession();
  useStore.getState().resetRoom();
  useStore.getState().showToast('warn', '已在另一个窗口登录，当前窗口已退出房间');
});

socket.on('room:closed', (payload) => {
  clearSession();
  useStore.getState().resetRoom();
  useStore.getState().showToast('warn', payload.reason);
});
