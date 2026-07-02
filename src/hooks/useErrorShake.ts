"use client";

import { useCallback, useEffect, useRef, useState } from "react";

const SHAKE_MS = 280;
const DEFAULT_AUTO_HIDE_MS = 3000;

interface UseErrorShakeOptions {
  autoHideMs?: number;
}

export function useErrorShake(options: UseErrorShakeOptions = {}) {
  const autoHideMs = options.autoHideMs ?? DEFAULT_AUTO_HIDE_MS;
  const [message, setMessage] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [shaking, setShaking] = useState(false);
  const rafRef = useRef<number | null>(null);
  const timersRef = useRef<Array<ReturnType<typeof setTimeout>>>([]);

  const clearTimers = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    for (const timer of timersRef.current) clearTimeout(timer);
    timersRef.current = [];
  }, []);

  const clear = useCallback(() => {
    clearTimers();
    setMessage(null);
    setVisible(false);
    setShaking(false);
  }, [clearTimers]);

  const showError = useCallback(
    (nextMessage: string | null) => {
      clearTimers();
      if (!nextMessage) {
        setMessage(null);
        setVisible(false);
        setShaking(false);
        return;
      }

      setMessage(nextMessage);
      setVisible(true);
      setShaking(false);

      rafRef.current = requestAnimationFrame(() => {
        setShaking(true);
        rafRef.current = null;
      });

      timersRef.current = [
        setTimeout(() => setShaking(false), SHAKE_MS),
        setTimeout(() => setVisible(false), SHAKE_MS + autoHideMs),
      ];
    },
    [autoHideMs, clearTimers],
  );

  useEffect(() => clearTimers, [clearTimers]);

  return {
    message,
    visible,
    hasError: Boolean(message && visible),
    isShaking: shaking,
    showError,
    clear,
  };
}
