import { z } from 'zod';

const modeSchema = z.enum(['pin-ci', 'pao-pao']);
const claimPolicySchema = z.enum(['next', 'all', 'off']);
const maxPlayersSchema = z.union([z.literal(2), z.literal(3), z.literal(4)]);
const nicknameSchema = z.string().trim().min(1, '请输入昵称').max(12, '昵称最多 12 个字');
const roomCodeSchema = z
  .string()
  .trim()
  .regex(/^[A-Za-z0-9]{5}$/, '房间码是 5 位字母或数字')
  .transform((code) => code.toUpperCase());
const tokenSchema = z.string().min(10).max(200);
const phaseIdSchema = z.string().min(1).max(100);
const tileIdSchema = z.string().min(1).max(50);

export const createRoomSchema = z
  .object({
    nickname: nicknameSchema,
    settings: z
      .object({
        mode: modeSchema,
        maxPlayers: maxPlayersSchema,
        openHands: z.boolean(),
        claimPolicy: claimPolicySchema,
      })
      .strict(),
  })
  .strict();

export const joinRoomSchema = z
  .object({
    roomCode: roomCodeSchema,
    nickname: nicknameSchema,
  })
  .strict();

export const resumeSchema = z
  .object({
    roomCode: roomCodeSchema,
    token: tokenSchema,
  })
  .strict();

export const readySchema = z
  .object({
    ready: z.boolean(),
  })
  .strict();

export const settingsPatchSchema = z
  .object({
    patch: z
      .object({
        mode: modeSchema.optional(),
        openHands: z.boolean().optional(),
        claimPolicy: claimPolicySchema.optional(),
      })
      .strict(),
  })
  .strict();

export const discardSchema = z
  .object({
    phaseId: phaseIdSchema,
    tileId: tileIdSchema,
  })
  .strict();

export const huSchema = z
  .object({
    phaseId: phaseIdSchema,
    segments: z
      .array(z.array(tileIdSchema).min(1).max(20))
      .min(1)
      .max(20),
  })
  .strict();

export const phraseSchema = z
  .object({
    phaseId: phaseIdSchema,
    tileIds: z.array(tileIdSchema).min(2).max(5),
  })
  .strict();

export const passSchema = z
  .object({
    phaseId: phaseIdSchema,
  })
  .strict();

export const claimSchema = z
  .object({
    phaseId: phaseIdSchema,
    take: z.boolean(),
  })
  .strict();

export const voteSchema = z
  .object({
    phaseId: phaseIdSchema,
    approve: z.boolean(),
  })
  .strict();

export type ParseResult<T> =
  | { ok: true; data: T }
  | { ok: false; message: string };

export function parsePayload<T>(schema: z.ZodType<T>, payload: unknown): ParseResult<T> {
  const result = schema.safeParse(payload);
  if (!result.success) {
    return {
      ok: false,
      message: result.error.issues[0]?.message ?? '参数不合法',
    };
  }
  return { ok: true, data: result.data };
}
