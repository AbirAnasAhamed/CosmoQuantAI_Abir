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
 * - Polls every 5 seconds
 * - Pauses automatically when the browser tab is hidden (Page Visibility API)
 * - On error, backs off silently — never blocks UI
 */
export const useOpenOrders = (
  apiKeyId: string | number | null,
  symbol: string,
  intervalMs = 5000
): OpenLimitOrder[] => {
  const [orders, setOrders] = useState<OpenLimitOrder[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isVisibleRef = useRef(true);

  const fetchOrders = useCallback(async () => {
    if (!apiKeyId || !symbol || !isVisibleRef.current) return;
    try {
      const res = await api.get(
        `/trading/open-limit-orders/${apiKeyId}?symbol=${encodeURIComponent(symbol)}`
      );
      setOrders(res.data?.orders ?? []);
    } catch {
      // Silent fail — don't spam console in polling
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

  // Polling loop
  useEffect(() => {
    fetchOrders(); // Immediate on mount or dependency change
    timerRef.current = setInterval(fetchOrders, intervalMs);
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [fetchOrders, intervalMs]);

  return orders;
};
