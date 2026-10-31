import { useCountdown } from '../hooks/useCountdown';

interface CountdownProps {
  deadline: number | null;
  skew: number;
  prefix?: string;
}

export function Countdown({ deadline, skew, prefix }: CountdownProps) {
  const seconds = useCountdown(deadline, skew);
  if (deadline === null) {
    return null;
  }
  return (
    <span className={`countdown ${seconds <= 5 ? 'is-urgent' : ''}`}>
      {prefix}
      {seconds}s
    </span>
  );
}
