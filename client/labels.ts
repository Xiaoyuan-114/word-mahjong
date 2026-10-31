import type { ClaimPolicy, Mode } from '@shared/types';

export const MODE_LABELS: Record<Mode, string> = {
  'pin-ci': '拼词胡',
  'pao-pao': '跑跑胡',
};

export const MODE_HINTS: Record<Mode, string> = {
  'pin-ci': '摸字、抢字、组句；宣布胡后由其他玩家投票，超过半数才成立。',
  'pao-pao': '打出短句，由其他玩家表决；手牌先到 3 张以内的人获胜。',
};

export const CLAIM_LABELS: Record<ClaimPolicy, string> = {
  next: '仅下家可抢',
  all: '所有人可抢',
  off: '关闭抢字',
};
