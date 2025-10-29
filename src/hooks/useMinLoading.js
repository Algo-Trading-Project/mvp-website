import { useEffect, useRef, useState } from "react";

// Ensures a loading state stays true for at least `minMs` once triggered
export default function useMinLoading(loading, minMs = 500) {
  const [show, setShow] = useState(!!loading);
  const startRef = useRef(loading ? Date.now() : null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (loading) {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
      startRef.current = Date.now();
      if (!show) setShow(true);
      return;
    }

    // loading is false; enforce minimum duration
    const startedAt = startRef.current ?? Date.now();
    const elapsed = Date.now() - startedAt;
    if (elapsed >= minMs) {
      setShow(false);
    } else {
      const remaining = Math.max(0, minMs - elapsed);
      timerRef.current = setTimeout(() => {
        setShow(false);
        timerRef.current = null;
      }, remaining);
    }

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, minMs]);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  return show;
}

