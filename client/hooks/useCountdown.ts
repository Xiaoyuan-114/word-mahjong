import { useEffect, useState } from 'react';

export function useCountdown(deadline: number | null, skew: number): number {
  const [adjustedNow, setAdjustedNow] = useState(() => Date.now() + skew);

  useEffect(() => {
    if (deadline === null) {
      return;
    }
    setAdjustedNow(Date.now() + skew);
    const timer = window.setInterval(() => {
      setAdjustedNow(Date.now() + skew);
    }, 250);
    return () => window.clearInterval(timer);
  }, [deadline, skew]);

  if (deadline === null) {
    return 0;
  }
  return Math.max(0, Math.ceil((deadline - adjustedNow) / 1000));
}
