import { create } from 'zustand';
import type { RoomSnapshot } from '@shared/types';
import { loadNickname, saveNickname } from './session';

export type ToastLevel = 'info' | 'warn' | 'error';

export interface ToastMessage {
  id: number;
  level: ToastLevel;
  message: string;
}

export interface ConfirmRequest {
  id: number;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
}

interface ClientState {
  connected: boolean;
  resuming: boolean;
  snapshot: RoomSnapshot | null;
  toast: ToastMessage | null;
  confirm: ConfirmRequest | null;
  pendingAction: string | null;
  clockSkew: number;
  nickname: string;
  setConnected(connected: boolean): void;
  setResuming(resuming: boolean): void;
  applySnapshot(snapshot: RoomSnapshot): void;
  resetRoom(): void;
  setPending(action: string | null): void;
  setNickname(nickname: string): void;
  showToast(level: ToastLevel, message: string): void;
  dismissToast(id: number): void;
  requestConfirm(
    message: string,
    onConfirm: () => void,
    confirmLabel?: string,
    cancelLabel?: string,
  ): void;
  dismissConfirm(): void;
}

let toastSequence = 0;
let confirmSequence = 0;

export const useStore = create<ClientState>((set, get) => ({
  connected: false,
  resuming: false,
  snapshot: null,
  toast: null,
  confirm: null,
  pendingAction: null,
  clockSkew: 0,
  nickname: loadNickname(),

  setConnected: (connected) => set({ connected }),
  setResuming: (resuming) => set({ resuming }),

  applySnapshot: (snapshot) =>
    set({
      snapshot,
      resuming: false,
      clockSkew: snapshot.serverNow - Date.now(),
    }),

  resetRoom: () =>
    set({
      snapshot: null,
      pendingAction: null,
      resuming: false,
      confirm: null,
    }),

  setPending: (pendingAction) => set({ pendingAction }),

  setNickname: (nickname) => {
    saveNickname(nickname);
    set({ nickname });
  },

  showToast: (level, message) => {
    const id = ++toastSequence;
    set({ toast: { id, level, message } });
    setTimeout(() => {
      if (get().toast?.id === id) {
        set({ toast: null });
      }
    }, 4000);
  },

  dismissToast: (id) => {
    if (get().toast?.id === id) {
      set({ toast: null });
    }
  },

  requestConfirm: (message, onConfirm, confirmLabel = '确认', cancelLabel = '取消') => {
    set({
      confirm: {
        id: ++confirmSequence,
        message,
        confirmLabel,
        cancelLabel,
        onConfirm,
      },
    });
  },

  dismissConfirm: () => set({ confirm: null }),
}));
