/**
 * useSystemAlerts — WebSocket hook for live Docker log alerts
 *
 * Connects to /ws/system-alerts and returns:
 * - alerts: list of SystemAlert (max 50 stored, newest first)
 * - unreadCount: how many new alerts since panel was closed
 * - clearAlerts: wipe the list
 * - markAllRead: reset unread counter
 */

import { useState, useEffect, useRef, useCallback } from 'react';

export type AlertSeverity = 'CRITICAL' | 'ERROR' | 'WARNING';

export interface SystemAlert {
  id: string;
  severity: AlertSeverity;
  container: string;
  display_name: string;
  message: string;
  snippet: string[];
  timestamp: string;
  read: boolean;
}

const MAX_ALERTS = 50;

const WS_URL = (() => {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws/system-alerts`;
})();

export function useSystemAlerts() {
  const [alerts, setAlerts] = useState<SystemAlert[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [connected, setConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mountedRef = useRef(false);

  useEffect(() => {
    // Guard against React StrictMode double-mount
    if (mountedRef.current) return;
    mountedRef.current = true;

    let ws: WebSocket;

    const connect = () => {
      if (wsRef.current?.readyState === WebSocket.OPEN) return;

      ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        setConnected(true);
        if (reconnectTimer.current) {
          clearTimeout(reconnectTimer.current);
          reconnectTimer.current = null;
        }
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type !== 'system_alert') return;

          const alert: SystemAlert = {
            id: `${data.container}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
            severity: data.severity as AlertSeverity,
            container: data.container,
            display_name: data.display_name,
            message: data.message,
            snippet: data.snippet || [],
            timestamp: data.timestamp,
            read: false,
          };

          setAlerts(prev => [alert, ...prev].slice(0, MAX_ALERTS));
          setUnreadCount(prev => prev + 1);
        } catch {
          // ignore malformed messages
        }
      };

      ws.onclose = () => {
        setConnected(false);
        // Auto reconnect after 5 seconds
        if (mountedRef.current) {
          reconnectTimer.current = setTimeout(connect, 5000);
        }
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      mountedRef.current = false;
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, []); // empty deps — run once on mount

  const clearAlerts = useCallback(() => {
    setAlerts([]);
    setUnreadCount(0);
  }, []);

  const markAllRead = useCallback(() => {
    setUnreadCount(0);
    setAlerts(prev => prev.map(a => ({ ...a, read: true })));
  }, []);

  return { alerts, unreadCount, connected, clearAlerts, markAllRead };
}
