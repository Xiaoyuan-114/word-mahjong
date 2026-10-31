import type { Seat, TileId, VoteState, VoteSummary } from './types';

export function requiredApprovals(eligibleCount: number): number {
  return Math.floor(eligibleCount / 2) + 1;
}

export interface VoteTally extends VoteSummary {
  pending: number;
  outcome: 'approved' | 'rejected' | 'pending';
}

export function tallyVote(vote: VoteState): VoteTally {
  const eligible = vote.eligibleSeats.length;
  const required = requiredApprovals(eligible);
  let approvals = 0;
  let rejects = 0;

  for (const seat of vote.eligibleSeats) {
    const choice = vote.votes[seat];
    if (choice === 'approve') {
      approvals += 1;
    } else if (choice === 'reject') {
      rejects += 1;
    }
  }

  const pending = eligible - approvals - rejects;
  let outcome: VoteTally['outcome'] = 'pending';
  if (approvals >= required) {
    outcome = 'approved';
  } else if (rejects >= eligible - required + 1) {
    outcome = 'rejected';
  }

  return {
    approvals,
    rejects,
    pending,
    eligible,
    required,
    votes: { ...vote.votes },
    outcome,
  };
}

export function summarizeVote(vote: VoteState): VoteSummary {
  const tally = tallyVote(vote);
  return {
    approvals: tally.approvals,
    rejects: tally.rejects,
    eligible: tally.eligible,
    required: tally.required,
    votes: tally.votes,
  };
}

export function otherSeats(totalSeats: number, exclude: Seat): Seat[] {
  return Array.from({ length: totalSeats }, (_, seat) => seat).filter((seat) => seat !== exclude);
}

export function isSeat(totalSeats: number, seat: number): boolean {
  return Number.isInteger(seat) && seat >= 0 && seat < totalSeats;
}

export function tileIdsText(tileIds: TileId[], chars: Record<TileId, string>): string {
  return tileIds.map((tileId) => chars[tileId] ?? '？').join('');
}
