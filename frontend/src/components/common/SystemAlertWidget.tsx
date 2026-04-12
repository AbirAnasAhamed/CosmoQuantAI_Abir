/**
 * SystemAlertWidget — Cyberpunk Glassmorphism Design
 * =====================================================
 * Floating, draggable server monitor with neon aesthetics,
 * animated scanlines, hexagonal status nodes, and a
 * matrix-style live log terminal.
 */

import React, { useState, useEffect, useRef } from 'react';
import { useSystemAlerts, type SystemAlert, type AlertSeverity } from '@/hooks/useSystemAlerts';

// ─── Types ────────────────────────────────────────────────────────────────────

interface LogLine {
  line: string;
  level: 'INFO' | 'WARNING' | 'ERROR' | 'CRITICAL';
}

interface ContainerLogBatch {
  container: string;
  display_name: string;
  lines: LogLine[];
  timestamp: string;
}

// ─── Config ───────────────────────────────────────────────────────────────────

const SEVERITY_CFG: Record<AlertSeverity, { icon: string; color: string; neon: string; bg: string; border: string; label: string; glow: string }> = {
  CRITICAL: { icon: '⬡', label: 'CRITICAL', color: 'text-red-400',    neon: '#f87171', bg: 'bg-red-950/60',    border: 'border-red-500/40', glow: 'shadow-red-500/30' },
  ERROR:    { icon: '⬡', label: 'ERROR',    color: 'text-orange-400', neon: '#fb923c', bg: 'bg-orange-950/60', border: 'border-orange-500/40', glow: 'shadow-orange-500/30' },
  WARNING:  { icon: '⬡', label: 'WARNING',  color: 'text-yellow-400', neon: '#facc15', bg: 'bg-yellow-950/40', border: 'border-yellow-500/40', glow: 'shadow-yellow-500/20' },
};

const LINE_COLOR: Record<LogLine['level'], string> = {
  CRITICAL: 'text-red-400',
  ERROR:    'text-orange-300',
  WARNING:  'text-yellow-300',
  INFO:     'text-emerald-400/80',
};

const CONTAINER_INFO: Record<string, { short: string; color: string; neon: string }> = {
  cosmoquant_backend:  { short: 'API',    color: 'text-sky-300',    neon: '#38bdf8' },
  cosmo_celery_worker: { short: 'CLR',    color: 'text-violet-300', neon: '#a78bfa' },
  cosmo_celery_beat:   { short: 'SCH',    color: 'text-indigo-300', neon: '#818cf8' },
  cosmoquant_redis:    { short: 'RDS',    color: 'text-rose-300',   neon: '#fb7185' },
  cosmoquant_db:       { short: 'DB',     color: 'text-emerald-300',neon: '#34d399' },
  cosmoquant_frontend: { short: 'WEB',    color: 'text-cyan-300',   neon: '#22d3ee' },
};

// ─── Critical Toast ───────────────────────────────────────────────────────────

const CriticalToast: React.FC<{ alert: SystemAlert; onClose: () => void }> = ({ alert, onClose }) => {
  const [vis, setVis] = useState(false);
  useEffect(() => {
    requestAnimationFrame(() => setVis(true));
    const t = setTimeout(() => { setVis(false); setTimeout(onClose, 400); }, 7000);
    return () => clearTimeout(t);
  }, [onClose]);

  return (
    <div
      className={`fixed top-4 right-4 z-[9999] w-80 rounded-2xl p-px transition-all duration-400 ${vis ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-4'}`}
      style={{ background: 'linear-gradient(135deg, #ef444480, #7c3aed60)', boxShadow: '0 0 40px #ef444440, 0 25px 50px #00000080' }}
    >
      <div className="rounded-2xl p-3.5" style={{ background: 'rgba(12,5,20,0.97)', backdropFilter: 'blur(20px)' }}>
        <div className="flex items-start gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 mt-0.5"
            style={{ background: 'rgba(239,68,68,0.2)', border: '1px solid rgba(239,68,68,0.4)', boxShadow: '0 0 12px #ef444440' }}>
            <span className="text-red-400 text-sm animate-pulse">⚠</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-red-400 font-bold text-xs tracking-wider uppercase">Critical — {alert.display_name}</p>
            <p className="text-gray-300 text-xs mt-1 leading-relaxed truncate">{alert.snippet[0] || 'Critical error detected'}</p>
          </div>
          <button onClick={() => { setVis(false); setTimeout(onClose, 400); }}
            className="text-gray-600 hover:text-white flex-shrink-0 mt-0.5 transition-colors">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
          </button>
        </div>
      </div>
    </div>
  );
};

// ─── Alert Detail Modal ──────────────────────────────────────────────────────

const AlertDetailModal: React.FC<{ alert: SystemAlert; onClose: () => void }> = ({ alert, onClose }) => {
  const cfg = SEVERITY_CFG[alert.severity];
  const date = new Date(alert.timestamp);
  const dateStr = date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

  // Close on backdrop click
  const handleBackdrop = (e: React.MouseEvent<HTMLDivElement>) => {
    if (e.target === e.currentTarget) onClose();
  };

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[99999] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.80)', backdropFilter: 'blur(8px)' }}
      onClick={handleBackdrop}
    >
      <div
        className="relative w-full max-w-lg rounded-2xl p-px animate-in"
        style={{
          background: `linear-gradient(135deg, ${cfg.neon}50, rgba(255,255,255,0.08), ${cfg.neon}30)`,
          boxShadow: `0 0 60px ${cfg.neon}30, 0 30px 80px rgba(0,0,0,0.9)`,
          animation: 'modalIn 0.2s ease-out',
        }}
      >
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(8,8,18,0.98)' }}>

          {/* Header */}
          <div className="relative px-5 py-4 border-b" style={{ borderColor: `${cfg.neon}20`, background: `${cfg.neon}08` }}>
            {/* Neon strip */}
            <div className="absolute left-0 top-0 bottom-0 w-0.5 rounded-l-2xl"
              style={{ background: cfg.neon, boxShadow: `0 0 12px ${cfg.neon}` }} />
            <div className="flex items-start justify-between gap-4 pl-3">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-black tracking-[0.2em] uppercase ${cfg.color}`}
                    style={{ textShadow: `0 0 10px ${cfg.neon}` }}>{cfg.label}</span>
                  <span className="text-gray-700 text-[9px]">•</span>
                  <span className="text-gray-400 font-mono text-[10px]">{alert.display_name}</span>
                </div>
                <p className="text-gray-600 font-mono text-[9px] tracking-wider">{dateStr} · {timeStr}</p>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-lg border border-white/10 flex items-center justify-center text-gray-500 hover:text-white hover:bg-white/10 transition-all flex-shrink-0"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
          </div>

          {/* Full message body */}
          <div className="px-5 py-4 space-y-4">
            {/* All snippet lines */}
            {alert.snippet.length > 0 && (
              <div>
                <p className="text-[9px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: `${cfg.neon}80` }}>Log Output</p>
                <div className="rounded-xl p-3 font-mono text-[10px] leading-relaxed space-y-1"
                  style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${cfg.neon}15` }}>
                  {alert.snippet.map((l, i) => (
                    <p key={i} className="text-gray-300 break-all">
                      <span className="text-gray-700 mr-2 select-none">{String(i + 1).padStart(2, '0')}</span>{l}
                    </p>
                  ))}
                </div>
              </div>
            )}

            {/* Full telegram message */}
            {alert.message && (
              <div>
                <p className="text-[9px] font-black tracking-[0.2em] uppercase mb-2" style={{ color: `${cfg.neon}80` }}>Full Alert Message</p>
                <div className="rounded-xl p-3 font-mono text-[10px] leading-relaxed whitespace-pre-wrap text-gray-400"
                  style={{ background: 'rgba(0,0,0,0.5)', border: `1px solid ${cfg.neon}15`, maxHeight: '200px', overflowY: 'auto' }}>
                  {alert.message}
                </div>
              </div>
            )}

            {/* Meta info pills */}
            <div className="flex items-center gap-2 flex-wrap pt-1">
              <span className="px-2 py-0.5 rounded-md font-mono text-[9px] border" style={{ color: cfg.neon + 'cc', borderColor: cfg.neon + '30', background: cfg.neon + '10' }}>
                {alert.container}
              </span>
              <span className="px-2 py-0.5 rounded-md font-mono text-[9px] border border-white/8 text-gray-600">
                ID: {alert.id.slice(-8)}
              </span>
            </div>
          </div>

          {/* Footer */}
          <div className="px-5 py-3 border-t flex justify-end" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition-all border"
              style={{ borderColor: cfg.neon + '40', color: cfg.neon, background: cfg.neon + '10' }}
            >
              Close
            </button>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes modalIn {
          from { opacity: 0; transform: scale(0.94) translateY(8px); }
          to   { opacity: 1; transform: scale(1)   translateY(0);    }
        }
      `}</style>
    </div>
  );
};

// ─── Alert Card ───────────────────────────────────────────────────────────────

const AlertCard: React.FC<{ alert: SystemAlert }> = ({ alert }) => {
  const cfg = SEVERITY_CFG[alert.severity];
  const [expanded, setExpanded] = useState(false);
  const time = new Date(alert.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  return (
    <>
      {expanded && <AlertDetailModal alert={alert} onClose={() => setExpanded(false)} />}
      <div
        className={`relative rounded-xl p-3 border overflow-hidden transition-all cursor-pointer group ${cfg.bg} ${cfg.border}`}
        style={{ boxShadow: `0 4px 20px ${cfg.neon}18` }}
        onClick={() => setExpanded(true)}
      >
        {/* Hover glow overlay */}
        <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none rounded-xl"
          style={{ background: `radial-gradient(ellipse at 50% 0%, ${cfg.neon}10, transparent 70%)` }} />

        {/* Neon left stripe */}
        <div className="absolute left-0 top-2 bottom-2 w-0.5 rounded-full" style={{ background: cfg.neon, boxShadow: `0 0 8px ${cfg.neon}` }} />
        <div className="pl-3">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className={`text-[10px] font-black tracking-widest uppercase ${cfg.color}`}
                style={{ textShadow: `0 0 8px ${cfg.neon}` }}>{cfg.label}</span>
              <span className="text-gray-700 text-[9px]">•</span>
              <span className="text-gray-400 text-[10px] font-mono">{alert.display_name}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-gray-600 text-[9px] font-mono">{time}</span>
              {/* Expand hint */}
              <span className="text-[8px] font-bold tracking-wider opacity-0 group-hover:opacity-60 transition-opacity"
                style={{ color: cfg.neon }}>EXPAND ↗</span>
            </div>
          </div>
          {alert.snippet.length > 0 && (
            <div className="rounded-lg p-2 font-mono text-[9.5px] text-gray-400 space-y-0.5"
              style={{ background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.04)' }}>
              {alert.snippet.slice(0, 3).map((l, i) => <p key={i} className="truncate leading-relaxed">{l}</p>)}
              {alert.snippet.length > 3 && (
                <p className="text-gray-700 text-[9px]">+{alert.snippet.length - 3} more lines…</p>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
};

// ─── Log Terminal ─────────────────────────────────────────────────────────────

const LogTerminal: React.FC<{
  batches: Map<string, ContainerLogBatch>;
  filter: string | null;
  onFilter: (c: string | null) => void;
}> = ({ batches, filter, onFilter }) => {
  const lines: Array<{ key: string; container: string; display: string; line: string; level: LogLine['level'] }> = [];
  const src = filter ? (batches.has(filter) ? [batches.get(filter)!] : []) : Array.from(batches.values());
  for (const b of src) {
    const reversedLines = [...b.lines.slice(-60)].reverse();
    for (const l of reversedLines) {
      lines.push({ key: `${b.container}-${Math.random()}`, container: b.container, display: b.display_name, line: l.line, level: l.level });
    }
  }

  const containers = Array.from(batches.keys());

  return (
    <div className="flex flex-col h-full">
      {/* Container filter pills */}
      <div className="flex-shrink-0 flex items-center gap-1.5 px-3 py-2 border-b flex-wrap" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
        <button onClick={() => onFilter(null)}
          className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold tracking-wider border transition-all uppercase ${filter === null
            ? 'text-white border-white/30 bg-white/10'
            : 'text-gray-600 border-transparent hover:text-gray-400'}`}>
          ALL
        </button>
        {containers.map(c => {
          const info = CONTAINER_INFO[c] || { short: c.slice(0, 3).toUpperCase(), color: 'text-gray-400', neon: '#9ca3af' };
          return (
            <button key={c} onClick={() => onFilter(filter === c ? null : c)}
              className={`px-2.5 py-0.5 rounded-full text-[9.5px] font-bold tracking-wider transition-all border uppercase ${filter === c ? info.color + ' border-current bg-current/10' : 'text-gray-600 border-transparent hover:text-gray-400'}`}
              style={filter === c ? { textShadow: `0 0 6px ${info.neon}`, boxShadow: `0 0 8px ${info.neon}20` } : {}}>
              {info.short}
            </button>
          );
        })}
      </div>

      {/* Terminal body */}
      <div className="flex-1 overflow-y-auto px-3 py-2 space-y-px font-mono text-[10px] scrollbar-thin"
        style={{ background: 'rgba(0,0,0,0.4)' }}>
        {lines.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-3">
            <div className="relative">
              <div className="w-10 h-10 rounded-full border border-emerald-500/30 flex items-center justify-center"
                style={{ boxShadow: '0 0 20px #10b98130' }}>
                <span className="text-emerald-400 animate-pulse text-lg">⬡</span>
              </div>
            </div>
            <p className="text-gray-600 text-xs">Streaming logs · updates every 2s</p>
          </div>
        ) : (
          lines.map(({ key, container, display, line, level }) => {
            const info = CONTAINER_INFO[container];
            return (
              <div key={key} className="flex items-start gap-2 leading-relaxed py-px px-1 rounded hover:bg-white/3 group transition-colors">
                {!filter && info && (
                  <span className={`flex-shrink-0 text-[8.5px] font-black tracking-wider mt-px ${info.color}`}
                    style={{ textShadow: `0 0 4px ${info.neon}` }}>
                    {info.short}
                  </span>
                )}
                <span className={`break-all leading-relaxed ${LINE_COLOR[level]}`}>{line}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

// ─── Pulse Ring (decorative) ──────────────────────────────────────────────────

const StatusNode: React.FC<{ active: boolean; color: string; neon: string; label: string }> = ({ active, color, neon, label }) => (
  <div className="flex flex-col items-center gap-1">
    <div className="relative w-5 h-5">
      <div className={`w-5 h-5 rounded-full border transition-all ${active ? 'border-current' : 'border-gray-700'}`}
        style={{ borderColor: active ? neon : undefined, boxShadow: active ? `0 0 8px ${neon}80, 0 0 16px ${neon}30` : undefined }}>
        <div className={`absolute inset-1 rounded-full transition-all ${active ? 'animate-pulse' : 'bg-gray-800'}`}
          style={{ background: active ? neon : undefined }} />
      </div>
      {active && (
        <div className="absolute inset-0 rounded-full animate-ping opacity-30"
          style={{ border: `1px solid ${neon}` }} />
      )}
    </div>
    <span className="text-[7.5px] font-bold tracking-widest uppercase" style={{ color: active ? neon : '#4b5563' }}>{label}</span>
  </div>
);

// ─── Main Widget ──────────────────────────────────────────────────────────────

const SystemAlertWidget: React.FC = () => {
  const { alerts, unreadCount, connected, clearAlerts, markAllRead } = useSystemAlerts();

  const [open, setOpen]       = useState(false);
  const [tab, setTab]         = useState<'alerts' | 'logs'>('alerts');
  const [toasts, setToasts]   = useState<SystemAlert[]>([]);
  const [logBatches, setLogBatches] = useState<Map<string, ContainerLogBatch>>(new Map());
  const [logFilter, setLogFilter]   = useState<string | null>(null);
  const [logConn, setLogConn]       = useState(false);
  const [tick, setTick]             = useState(0); // for scanline animation

  const [position, setPosition]     = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef({ startX: 0, startY: 0, curX: 0, curY: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const logWsRef   = useRef<WebSocket | null>(null);
  const prevLen    = useRef(0);

  // Scanline ticker
  useEffect(() => {
    const t = setInterval(() => setTick(p => (p + 1) % 100), 50);
    return () => clearInterval(t);
  }, []);

  // CRITICAL toast
  useEffect(() => {
    if (alerts.length > prevLen.current) {
      const n = alerts[0];
      if (n?.severity === 'CRITICAL') setToasts(p => [...p, n]);
    }
    prevLen.current = alerts.length;
  }, [alerts]);

  // Container log WebSocket
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | null = null;

    const url = (() => {
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${proto}//${window.location.host}/ws/container-logs`;
    })();

    const connect = () => {
      if (!alive || logWsRef.current?.readyState === WebSocket.OPEN) return;
      const ws = new WebSocket(url);
      logWsRef.current = ws;

      ws.onopen  = () => { if (alive) setLogConn(true); };
      ws.onclose = () => { if (!alive) return; setLogConn(false); timer = setTimeout(connect, 6000); };
      ws.onerror = () => ws.close();
      ws.onmessage = (e) => {
        if (!alive) return;
        try {
          const d = JSON.parse(e.data);
          if (d.type !== 'container_logs') return;
          setLogBatches(p => { const n = new Map(p); n.set(d.container, d); return n; });
        } catch { /* */ }
      };
    };

    connect();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
      if (logWsRef.current) { logWsRef.current.onclose = null; logWsRef.current.close(); }
    };
  }, []);

  // Initial position
  useEffect(() => {
    if (open && position.x === 0 && position.y === 0) {
      setPosition({ x: 20, y: 80 });
    }
  }, [open, position.x, position.y]);

  // Drag
  useEffect(() => {
    if (!isDragging) return;
    const onMove = (e: MouseEvent) => {
      const dx = e.clientX - dragRef.current.startX;
      const dy = e.clientY - dragRef.current.startY;
      setPosition({
        x: Math.max(0, Math.min(window.innerWidth - 530, dragRef.current.curX + dx)),
        y: Math.max(0, Math.min(window.innerHeight - 540, dragRef.current.curY + dy)),
      });
    };
    const onUp = () => setIsDragging(false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [isDragging]);

  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true);
    dragRef.current = { startX: e.clientX, startY: e.clientY, curX: position.x, curY: position.y };
  };

  const handleOpen = () => {
    setOpen(v => {
      if (!v) markAllRead();
      return !v;
    });
  };

  const critical = alerts.filter(a => a.severity === 'CRITICAL').length;
  const error    = alerts.filter(a => a.severity === 'ERROR').length;
  const warning  = alerts.filter(a => a.severity === 'WARNING').length;
  const bothLive = connected && logConn;
  const hasAlert = unreadCount > 0;

  return (
    <>
      {toasts.map(t => (
        <CriticalToast key={t.id} alert={t} onClose={() => setToasts(p => p.filter(x => x.id !== t.id))} />
      ))}

      {/* ─── Trigger Button ─── */}
      <button
        ref={triggerRef}
        id="system-alert-widget-trigger"
        onClick={handleOpen}
        className={`relative flex items-center gap-2 px-3 h-9 rounded-xl border transition-all duration-300 cursor-pointer select-none overflow-hidden ${open ? 'ring-1 ring-violet-500/50' : ''}`}
        style={{
          background: hasAlert
            ? 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(124,58,237,0.10))'
            : 'rgba(255,255,255,0.04)',
          borderColor: hasAlert ? 'rgba(239,68,68,0.4)' : 'rgba(255,255,255,0.08)',
          boxShadow: hasAlert ? '0 0 20px rgba(239,68,68,0.15)' : 'none',
        }}
      >
        {/* Shimmer on hover */}
        <div className="absolute inset-0 opacity-0 hover:opacity-100 transition-opacity"
          style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.04), transparent)' }} />

        {/* Live dot */}
        <div className="relative flex-shrink-0">
          <div className={`w-1.5 h-1.5 rounded-full ${bothLive ? 'bg-emerald-400' : 'bg-gray-600'}`}
            style={bothLive ? { boxShadow: '0 0 6px #34d399' } : {}} />
          {bothLive && <div className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-60" />}
        </div>

        {/* Hex icon */}
        <svg className={`w-4 h-4 flex-shrink-0 transition-colors ${hasAlert ? 'text-red-400' : 'text-gray-500'}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
            d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
        </svg>

        <span className={`text-xs font-semibold hidden sm:inline transition-colors ${hasAlert ? 'text-red-400' : 'text-gray-400'}`}
          style={hasAlert ? { textShadow: '0 0 8px #f87171' } : {}}>
          {hasAlert ? `${unreadCount} ALERT${unreadCount > 1 ? 'S' : ''}` : 'SYS MONITOR'}
        </span>

        {hasAlert && (
          <span className="min-w-[18px] h-[18px] px-1 text-white text-[9px] font-black rounded-full flex items-center justify-center animate-pulse"
            style={{ background: 'linear-gradient(135deg, #ef4444, #dc2626)', boxShadow: '0 0 8px #ef4444' }}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* ─── Floating Window ─── */}
      <div
        className={`fixed z-[9999] transition-all duration-300 ${open ? 'opacity-100 pointer-events-auto scale-100' : 'opacity-0 pointer-events-none scale-95'}`}
        style={{
          top: `${position.y}px`,
          left: `${position.x}px`,
          width: '530px',
          transformOrigin: 'top left',
        }}
      >
        {/* Outer glow border */}
        <div className="rounded-2xl p-px"
          style={{
            background: isDragging
              ? 'linear-gradient(135deg, #7c3aed60, #06b6d440, #7c3aed60)'
              : 'linear-gradient(135deg, #7c3aed30, #ffffff10, #06b6d420)',
            boxShadow: isDragging
              ? '0 0 60px rgba(124,58,237,0.3), 0 30px 60px rgba(0,0,0,0.8)'
              : '0 0 40px rgba(124,58,237,0.15), 0 25px 50px rgba(0,0,0,0.9)',
          }}
        >
          <div className="rounded-2xl overflow-hidden flex flex-col" style={{
            height: '530px',
            background: 'rgba(8,8,18,0.97)',
            backdropFilter: 'blur(30px)',
          }}>
            {/* Scanline overlay */}
            <div className="absolute inset-0 pointer-events-none rounded-2xl overflow-hidden z-10 opacity-[0.025]"
              style={{
                backgroundImage: 'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,255,255,0.5) 2px, rgba(255,255,255,0.5) 3px)',
                backgroundSize: '100% 3px',
              }} />

            {/* ── Title Bar ── */}
            <div
              onMouseDown={handleMouseDown}
              className={`relative flex-shrink-0 flex items-center justify-between px-4 py-3 cursor-grab select-none ${isDragging ? 'cursor-grabbing' : ''}`}
              style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.12), rgba(6,182,212,0.06))' }}
            >
              {/* Neon bottom line */}
              <div className="absolute bottom-0 left-0 right-0 h-px"
                style={{ background: 'linear-gradient(90deg, transparent, #7c3aed60, #06b6d440, transparent)' }} />

              {/* Left: logo + title */}
              <div className="flex items-center gap-3 pointer-events-none">
                <div className="relative w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
                  style={{ background: 'linear-gradient(135deg, rgba(124,58,237,0.4), rgba(6,182,212,0.3))', border: '1px solid rgba(124,58,237,0.4)', boxShadow: '0 0 16px rgba(124,58,237,0.3)' }}>
                  <svg className="w-4 h-4 text-violet-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" />
                  </svg>
                </div>
                <div>
                  <p className="text-white text-[11px] font-black tracking-[0.15em] uppercase leading-none"
                    style={{ textShadow: '0 0 12px rgba(124,58,237,0.8)' }}>
                    Sys Monitor
                  </p>
                  <p className="text-gray-600 text-[9px] mt-0.5 tracking-widest uppercase">Live Infrastructure Feed</p>
                </div>
              </div>

              {/* Center: status nodes */}
              <div className="flex items-center gap-4 pointer-events-none">
                <StatusNode active={connected} color="text-emerald-400" neon="#34d399" label="Alerts" />
                <StatusNode active={logConn} color="text-sky-400" neon="#38bdf8" label="Logs" />
              </div>

              {/* Right: close */}
              <button
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => setOpen(false)}
                className="w-7 h-7 rounded-lg flex items-center justify-center text-gray-600 hover:text-white transition-all border border-transparent hover:border-white/10 hover:bg-white/10"
                style={{ backdropFilter: 'blur(4px)' }}
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* ── Stats Bar ── */}
            {tab === 'alerts' && (
              <div className="flex-shrink-0 grid grid-cols-3 border-b" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)' }}>
                {[
                  { label: 'CRITICAL', val: critical, neon: '#f87171', color: 'text-red-400' },
                  { label: 'ERROR',    val: error,    neon: '#fb923c', color: 'text-orange-400' },
                  { label: 'WARNING',  val: warning,  neon: '#facc15', color: 'text-yellow-400' },
                ].map(({ label, val, neon, color }) => (
                  <div key={label} className="flex flex-col items-center justify-center py-2.5 relative overflow-hidden">
                    {val > 0 && (
                      <div className="absolute inset-0 opacity-5" style={{ background: neon }} />
                    )}
                    <span className={`text-xl font-black ${color} leading-none`}
                      style={val > 0 ? { textShadow: `0 0 16px ${neon}, 0 0 32px ${neon}50` } : {}}>
                      {val}
                    </span>
                    <span className="text-[9px] font-bold tracking-widest mt-1" style={{ color: val > 0 ? neon + 'aa' : '#374151' }}>{label}</span>
                  </div>
                ))}
              </div>
            )}

            {/* ── Tab Bar ── */}
            <div className="flex-shrink-0 flex border-b" style={{ borderColor: 'rgba(255,255,255,0.04)' }}>
              {(['alerts', 'logs'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)}
                  className={`flex-1 py-2.5 text-[10px] font-black tracking-[0.2em] uppercase transition-all relative overflow-hidden ${tab === t ? 'text-white' : 'text-gray-700 hover:text-gray-400'}`}
                >
                  {tab === t && (
                    <>
                      <div className="absolute inset-0 opacity-10"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #06b6d4)' }} />
                      <div className="absolute bottom-0 left-4 right-4 h-px rounded-full"
                        style={{ background: 'linear-gradient(90deg, #7c3aed, #06b6d4)', boxShadow: '0 0 8px #7c3aed' }} />
                    </>
                  )}
                  {t === 'alerts' ? `⬡ Alerts${alerts.length > 0 ? ` [${alerts.length}]` : ''}` : '⬡ Live Feed'}
                </button>
              ))}
            </div>

            {/* ── Tab Content ── */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {tab === 'alerts' ? (
                <>
                  <div className="flex-shrink-0 flex items-center justify-between px-4 py-1.5 border-b" style={{ borderColor: 'rgba(255,255,255,0.03)' }}>
                    <p className="text-gray-700 text-[9px] font-mono tracking-wider">{alerts.length} EVENTS STORED</p>
                    {alerts.length > 0 && (
                      <button onClick={clearAlerts}
                        className="text-[9.5px] font-bold tracking-wider text-gray-600 hover:text-red-400 transition-colors uppercase">
                        Clear
                      </button>
                    )}
                  </div>
                  <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin">
                    {alerts.length === 0 ? (
                      <div className="flex flex-col items-center justify-center h-full gap-4">
                        <div className="relative">
                          <div className="w-16 h-16 rounded-2xl flex items-center justify-center"
                            style={{ background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.25)', boxShadow: '0 0 30px rgba(52,211,153,0.15)' }}>
                            <svg className="w-7 h-7 text-emerald-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                          </div>
                          <div className="absolute inset-0 rounded-2xl animate-pulse"
                            style={{ border: '1px solid rgba(52,211,153,0.2)', boxShadow: '0 0 20px rgba(52,211,153,0.1)' }} />
                        </div>
                        <div className="text-center">
                          <p className="text-emerald-400 text-sm font-black tracking-wider uppercase"
                            style={{ textShadow: '0 0 12px #34d399' }}>All Systems Nominal</p>
                          <p className="text-gray-700 text-xs mt-1 font-mono">No anomalies detected</p>
                        </div>
                      </div>
                    ) : (
                      alerts.map(a => <AlertCard key={a.id} alert={a} />)
                    )}
                  </div>
                </>
              ) : (
                <LogTerminal batches={logBatches} filter={logFilter} onFilter={setLogFilter} />
              )}
            </div>

            {/* ── Footer ── */}
            <div className="flex-shrink-0 px-4 py-2 flex items-center justify-between border-t" style={{ borderColor: 'rgba(255,255,255,0.04)', background: 'rgba(0,0,0,0.3)' }}>
              <div className="flex items-center gap-1.5">
                {['API', 'CLR', 'RDS', 'DB'].map((s, i) => {
                  const colors = ['#38bdf8', '#a78bfa', '#fb7185', '#34d399'];
                  return (
                    <span key={s} className="text-[8px] font-black tracking-widest" style={{ color: colors[i] + '60' }}>{s}</span>
                  );
                })}
              </div>
              <div className="flex items-center gap-2">
                <div className="w-1 h-1 rounded-full bg-emerald-500 animate-pulse" style={{ boxShadow: '0 0 4px #10b981' }} />
                <p className="text-gray-700 text-[9px] font-mono tracking-wider">STREAM · 2s</p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Animations */}
      <style>{`
        @keyframes wiggle { 0%,100%{transform:rotate(0)} 20%{transform:rotate(-12deg)} 40%{transform:rotate(12deg)} 60%{transform:rotate(-6deg)} 80%{transform:rotate(6deg)} }
        .animate-wiggle { animation: wiggle 0.6s ease-in-out; }
      `}</style>
    </>
  );
};

export default SystemAlertWidget;
