import { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';

export interface OpenLimitOrder {
  id: string;
  side: 'buy' | 'sell';
  price: number;
  amount: number;
  filled: number;
  remaining: number;
}

/**
 * Live polling hook for open limit orders on the selected exchange API.
 *
 * BUG-05 fix: isMountedRef guards against state updates on unmounted component
 *             and stale fetches after apiKeyId/symbol changes.
 * BUG-11 fix: Dev-only debug logging so errors are visible during development
 *             without polluting production console.
 *
 * - Polls every `intervalMs` (default 5s)
 * - Pauses automatically when the browser tab is hidden (Page Visibility API)
 * - On error, backs off silently in production
 */
export const useOpenOrders = (
  apiKeyId: string | number | null,
  symbol: string,
  intervalMs = 5000
): OpenLimitOrder[] => {
  const [orders, setOrders] = useState<OpenLimitOrder[]>([]);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);
  const isMountedRef = useRef(true); // BUG-05: mount guard

  const fetchOrders = useCallback(async () => {
    // BUG-05 fix: skip stale fetches after unmount or dependency change
    if (!apiKeyId || !symbol || !isVisibleRef.current || !isMountedRef.current) return;
    try {
      const res = await api.get(
        `/trading/open-limit-orders/${apiKeyId}?symbol=${encodeURIComponent(symbol)}`
      );
      // Guard again after await — component may have unmounted during the request
      if (isMountedRef.current) {
        setOrders(res.data?.orders ?? []);
      }
    } catch (err) {
      // BUG-11 fix: dev-only logging, silent in production
      if (import.meta.env.DEV) {
        console.debug('[useOpenOrders] poll error:', err);
      }
    }
  }, [apiKeyId, symbol]);

  // Page Visibility API — pause polling when tab is hidden
  useEffect(() => {
    const handleVisibility = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
      if (isVisibleRef.current) fetchOrders(); // Immediate refresh on tab focus
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [fetchOrders]);

  // Polling loop with proper mount guard
  useEffect(() => {
    isMountedRef.current = true; // BUG-05: mark mounted on (re)run

    fetchOrders(); // Immediate fetch on mount or dependency change
    timerRef.current = setInterval(fetchOrders, intervalMs);

    return () => {
      isMountedRef.current = false; // BUG-05: mark unmounted before cleanup
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchOrders, intervalMs]);

  return orders;
};
