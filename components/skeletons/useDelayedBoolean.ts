"use client";

import { useEffect, useState } from "react";

export function useDelayedBoolean(active: boolean, delayMs = 120) {
  const [delayed, setDelayed] = useState(false);

  useEffect(() => {
    if (!active) {
      setDelayed(false);
      return;
    }

    const timer = window.setTimeout(() => setDelayed(true), delayMs);
    return () => window.clearTimeout(timer);
  }, [active, delayMs]);

  return delayed;
}
