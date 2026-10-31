import type { Ack, SocketErrorCode } from '@shared/types';

export type AckHandler<T> = (response: Ack<T>) => void;

export function ok<T>(data: T): Ack<T> {
  return { ok: true, data };
}

export function fail<T = never>(code: SocketErrorCode, message: string): Ack<T> {
  return { ok: false, error: { code, message } };
}

export function reply<T>(ack: AckHandler<T> | undefined, response: Ack<T>): void {
  if (typeof ack === 'function') {
    ack(response);
  }
}
