import React, { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BarChart2, X, RefreshCw, ChevronDown } from 'lucide-react';
import {
  createChart,
  ISeriesApi,
  CandlestickSeries,
  HistogramSeries,
  LineSeries,
  LineStyle,
} from 'lightweight-charts';
import { marketDepthService } from '../../../services/marketDepthService';
import {
  calculateEMA,
  calculateBollingerBands,
  calculateRSI,
  calculateMACD,
} from '../../../utils/indicators';
import { HeatmapSymbolSelector } from './HeatmapSymbolSelector';
import { TimeframeSelector } from './TimeframeSelector';

const MotionButton = motion.button as any;
const MotionDiv   = motion.div   as any;

// ── EMA periods ───────────────────────────────────────────────────────────────
const EMA_PERIODS = [9, 21, 50, 100, 200];

// ── Indicator state type ──────────────────────────────────────────────────────
interface IndSettings {
  showEMA:   boolean;
  emaPeriod: number;
  showBB:    boolean;
  showRSI:   boolean;
  showVol:   boolean;
  showMACD:  boolean;
}

const DEFAULT_IND: IndSettings = {
  showEMA:   true,
  emaPeriod: 21,
  showBB:    false,
  showRSI:   false,
  showVol:   true,
  showMACD:  false,
};

// ── Helpers ───────────────────────────────────────────────────────────────────
const stripFutures = (s: string) => s.replace(/:[^/]*$/, '');
const fmtPrice = (p: number) => {
  if (p < 0.001)  return p.toFixed(8);
  if (p < 1)      return p.toFixed(5);
  if (p < 10)     return p.toFixed(4);
  return p.toFixed(2);
};

// ─────────────────────────────────────────────────────────────────────────────
// Mini Order-Flow Chart sub-component
// ─────────────────────────────────────────────────────────────────────────────
interface MiniChartProps {
  symbol:   string;
  exchange: string;
  interval: string;
  ind:      IndSettings;
}

const MiniOrderFlowChart: React.FC<MiniChartProps> = ({ symbol, exchange, interval, ind }) => {
  const containerRef     = useRef<HTMLDivElement>(null);
  const chartRef         = useRef<any>(null);
  const candleRef        = useRef<ISeriesApi<'Candlestick'> | null>(null);
  const volRef           = useRef<ISeriesApi<'Histogram'>   | null>(null);
  const emaRef           = useRef<ISeriesApi<'Line'>        | null>(null);
  const bbUpRef          = useRef<ISeriesApi<'Line'>        | null>(null);
  const bbMidRef         = useRef<ISeriesApi<'Line'>        | null>(null);
  const bbLoRef          = useRef<ISeriesApi<'Line'>        | null>(null);
  const rsiRef           = useRef<ISeriesApi<'Line'>        | null>(null);
  const macdLineRef      = useRef<ISeriesApi<'Line'>        | null>(null);
  const macdSignalRef    = useRef<ISeriesApi<'Line'>        | null>(null);
  const macdHistRef      = useRef<ISeriesApi<'Histogram'>   | null>(null);
  const priceLineRef     = useRef<any>(null);
  const lastCandleRef    = useRef<any>(null);
  const wsRef            = useRef<WebSocket | null>(null);
  const mountedRef       = useRef(true);

  const [livePrice, setLivePrice] = useState<number | null>(null);
  const [wsOk,      setWsOk]      = useState(false);
  const [loading,   setLoading]   = useState(true);

  // ── CHART INIT (once per mount) ──────────────────────────────────────────
  useEffect(() => {
    mountedRef.current = true;
    if (!containerRef.current) return;

    // RSI/MACD active → bottom 25% reserved
    const hasBottom = ind.showRSI || ind.showMACD;
    const bottomMargin = hasBottom ? 0.28 : 0.18;

    const chart = createChart(containerRef.current, {
      layout: {
        background:  { type: 'solid', color: 'transparent' } as any,
        textColor:   '#64748b',
        fontSize:    10,
      },
      grid: {
        vertLines: { color: 'rgba(255,255,255,0.03)' },
        horzLines: { color: 'rgba(255,255,255,0.03)' },
      },
      crosshair: {
        vertLine: { color: 'rgba(139,92,246,0.4)', width: 1, style: LineStyle.Dashed },
        horzLine: { color: 'rgba(139,92,246,0.4)', width: 1, style: LineStyle.Dashed },
      },
      timeScale: { borderColor: 'rgba(255,255,255,0.05)', timeVisible: true, secondsVisible: false },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.05)', scaleMargins: { top: 0.06, bottom: bottomMargin } },
      leftPriceScale:  { visible: hasBottom, borderColor: 'rgba(255,255,255,0.05)', scaleMargins: { top: 0.76, bottom: 0 } },
      handleScale: { mouseWheel: true, pinch: true },
      handleScroll: { mouseWheel: true, pressedMouseMove: true },
    });
    chartRef.current = chart;

    // ── Series ──────────────────────────────────────────────────────────────
    // Candlestick
    candleRef.current = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e', downColor: '#ef4444',
      borderVisible: false, wickUpColor: '#22c55e', wickDownColor: '#ef4444',
      priceScaleId: 'right', lastValueVisible: false, priceLineVisible: false,
      priceFormat: { type: 'custom', minMove: 0.000000001, formatter: fmtPrice },
    });

    // Volume
    volRef.current = chart.addSeries(HistogramSeries, {
      priceFormat: { type: 'volume' }, priceScaleId: 'vol',
    });
    chart.priceScale('vol').applyOptions({ scaleMargins: { top: 0.84, bottom: 0 }, visible: false });

    // EMA
    emaRef.current = chart.addSeries(LineSeries, {
      color: '#f59e0b', lineWidth: 1, crosshairMarkerVisible: false,
      lastValueVisible: false, priceScaleId: 'right', visible: ind.showEMA,
    });

    // Bollinger Bands
    bbUpRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(56,189,248,0.55)', lineWidth: 1, crosshairMarkerVisible: false,
      lastValueVisible: false, priceScaleId: 'right', visible: ind.showBB,
    });
    bbMidRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(56,189,248,0.85)', lineWidth: 1, crosshairMarkerVisible: false,
      lastValueVisible: false, priceScaleId: 'right', visible: ind.showBB,
    });
    bbLoRef.current = chart.addSeries(LineSeries, {
      color: 'rgba(56,189,248,0.55)', lineWidth: 1, crosshairMarkerVisible: false,
      lastValueVisible: false, priceScaleId: 'right', visible: ind.showBB,
    });

    // RSI
    rsiRef.current = chart.addSeries(LineSeries, {
      color: '#db2777', lineWidth: 1, priceScaleId: 'left',
      crosshairMarkerVisible: false, lastValueVisible: true, visible: ind.showRSI,
    });

    // MACD
    macdLineRef.current = chart.addSeries(LineSeries, {
      color: '#3b82f6', lineWidth: 1, priceScaleId: 'left',
      crosshairMarkerVisible: false, lastValueVisible: false, visible: ind.showMACD,
    });
    macdSignalRef.current = chart.addSeries(LineSeries, {
      color: '#f59e0b', lineWidth: 1, priceScaleId: 'left',
      crosshairMarkerVisible: false, lastValueVisible: false, visible: ind.showMACD,
    });
    macdHistRef.current = chart.addSeries(HistogramSeries, {
      priceScaleId: 'left', lastValueVisible: false, visible: ind.showMACD,
    });

    // Resize observer
    const ro = new ResizeObserver(entries => {
      const r = entries[0]?.contentRect;
      if (r && chartRef.current) chartRef.current.applyOptions({ width: r.width, height: r.height });
    });
    ro.observe(containerRef.current);

    return () => {
      mountedRef.current = false;
      ro.disconnect();
      chart.remove();
      chartRef.current = candleRef.current = volRef.current = null;
      emaRef.current = bbUpRef.current = bbMidRef.current = bbLoRef.current = null;
      rsiRef.current = macdLineRef.current = macdSignalRef.current = macdHistRef.current = null;
      priceLineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── DATA FETCH whenever symbol / exchange / interval changes ─────────────
  useEffect(() => {
    if (!candleRef.current) return;
    let cancelled = false;
    setLoading(true);
    priceLineRef.current = null;

    const clean = stripFutures(symbol).toUpperCase();

    marketDepthService.getOHLCV(clean, exchange, interval, 200)
      .then((data: any[]) => {
        if (cancelled) return;
        if (!candleRef.current || !volRef.current) return;

        const candles = data.map((k: any) => ({
          time:   k.time as any,
          open:   parseFloat(k.open),
          high:   parseFloat(k.high),
          low:    parseFloat(k.low),
          close:  parseFloat(k.close),
          volume: parseFloat(k.volume || 0),
        }));

        candleRef.current.setData(candles);
        volRef.current.setData(
          candles.map(c => ({
            time: c.time, value: c.volume,
            color: c.close >= c.open ? 'rgba(34,197,94,0.30)' : 'rgba(239,68,68,0.30)',
          }))
        );

        // EMA
        if (emaRef.current && candles.length > ind.emaPeriod) {
          emaRef.current.setData(calculateEMA(candles, ind.emaPeriod) as any);
        }

        // Bollinger Bands
        if (bbUpRef.current && bbMidRef.current && bbLoRef.current && candles.length > 20) {
          const bb = calculateBollingerBands(candles, 20, 2);
          bbUpRef.current.setData(bb.map(d => ({ time: d.time, value: d.upper } as any)));
          bbMidRef.current.setData(bb.map(d => ({ time: d.time, value: d.middle } as any)));
          bbLoRef.current.setData(bb.map(d => ({ time: d.time, value: d.lower } as any)));
        }

        // RSI
        if (rsiRef.current && candles.length > 14) {
          rsiRef.current.setData(calculateRSI(candles, 14) as any);
        }

        // MACD
        if (macdLineRef.current && macdSignalRef.current && macdHistRef.current && candles.length > 26) {
          const macdData = calculateMACD(candles, 12, 26, 9);
          macdLineRef.current.setData(macdData.map(d => ({ time: d.time, value: d.macd } as any)));
          macdSignalRef.current.setData(macdData.map(d => ({ time: d.time, value: d.signal } as any)));
          macdHistRef.current.setData(macdData.map(d => ({
            time: d.time, value: d.histogram,
            color: d.histogram >= 0 ? 'rgba(34,197,94,0.5)' : 'rgba(239,68,68,0.5)',
          } as any)));
        }

        if (candles.length > 0) {
          lastCandleRef.current = { ...candles[candles.length - 1] };
          const last = lastCandleRef.current.close;

          if (candleRef.current) {
            const pl = candleRef.current.createPriceLine({
              price: last, color: 'rgba(139,92,246,0.9)',
              lineWidth: 1, lineStyle: LineStyle.Dashed,
              axisLabelVisible: true, title: '',
            });
            priceLineRef.current = pl;
          }
          setLivePrice(last);
        }

        chartRef.current?.timeScale().fitContent();
        setLoading(false);
      })
      .catch(err => {
        if (!cancelled) { console.warn('[MiniChart] fetch err:', err); setLoading(false); }
      });

    return () => { cancelled = true; };
  }, [symbol, exchange, interval, ind.emaPeriod]);

  // ── INDICATOR VISIBILITY UPDATES (no data refetch) ───────────────────────
  useEffect(() => {
    emaRef.current?.applyOptions({ visible: ind.showEMA });
    volRef.current?.applyOptions({ visible: ind.showVol });
    bbUpRef.current?.applyOptions({ visible: ind.showBB });
    bbMidRef.current?.applyOptions({ visible: ind.showBB });
    bbLoRef.current?.applyOptions({ visible: ind.showBB });
    rsiRef.current?.applyOptions({ visible: ind.showRSI });
    macdLineRef.current?.applyOptions({ visible: ind.showMACD });
    macdSignalRef.current?.applyOptions({ visible: ind.showMACD });
    macdHistRef.current?.applyOptions({ visible: ind.showMACD });

    // Show/hide left scale
    const hasBottom = ind.showRSI || ind.showMACD;
    chartRef.current?.priceScale('left').applyOptions({ visible: hasBottom });
  }, [ind]);

  // ── WEBSOCKET (live ticks) ───────────────────────────────────────────────
  useEffect(() => {
    const cleanSym = stripFutures(symbol).replace('/', '');
    let reconnectTimer: ReturnType<typeof setTimeout>;
    let sock: WebSocket | null = null;

    const connect = () => {
      if (!mountedRef.current) return;
      try {
        const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        sock = new WebSocket(`${proto}//${window.location.host}/ws/market-data/${cleanSym}`);
        wsRef.current = sock;

        sock.onopen  = () => { if (mountedRef.current) setWsOk(true); };
        sock.onclose = () => {
          if (mountedRef.current) { setWsOk(false); reconnectTimer = setTimeout(connect, 3000); }
        };
        sock.onerror = () => sock?.close();

        sock.onmessage = (ev) => {
          if (!mountedRef.current) return;
          try {
            const msg = JSON.parse(ev.data);
            const price = msg.type === 'ticker'
              ? parseFloat(msg.data?.price)
              : msg.price ? parseFloat(msg.price) : NaN;
            if (isNaN(price) || price <= 0) return;

            setLivePrice(price);

            if (priceLineRef.current) {
              try { priceLineRef.current.applyOptions({ price }); } catch { /* ignore */ }
            }
            if (lastCandleRef.current && candleRef.current) {
              const up = {
                ...lastCandleRef.current, close: price,
                high: Math.max(lastCandleRef.current.high, price),
                low:  Math.min(lastCandleRef.current.low,  price),
              };
              lastCandleRef.current = up;
              try { candleRef.current.update(up); } catch { /* ignore */ }
            }
          } catch { /* ignore */ }
        };
      } catch { /* ignore */ }
    };

    connect();
    return () => {
      mountedRef.current = false;
      clearTimeout(reconnectTimer);
      sock?.close();
      mountedRef.current = true;
    };
  }, [symbol]);

  return (
    <div className="relative w-full h-full bg-[#070C17]">
      <AnimatePresence>
        {loading && (
          <MotionDiv initial={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 bg-[#070C17]">
            <div className="w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full animate-spin opacity-70" />
            <span className="text-[9px] text-gray-600 font-mono uppercase tracking-widest">
              Loading {stripFutures(symbol)}…
            </span>
          </MotionDiv>
        )}
      </AnimatePresence>

      <div ref={containerRef} className="w-full h-full" />

      {/* Live price badge */}
      {livePrice !== null && !loading && (
        <div className="absolute top-2 left-2 z-10 flex items-center gap-1.5 pointer-events-none">
          <span className="text-[11px] font-mono font-black text-white bg-black/70 backdrop-blur-sm px-2 py-0.5 rounded-lg border border-white/10">
            {fmtPrice(livePrice)}
          </span>
          <span className={`w-1.5 h-1.5 rounded-full ${wsOk ? 'bg-green-400 shadow-[0_0_5px_rgba(34,197,94,0.9)] animate-pulse' : 'bg-orange-400'}`} />
        </div>
      )}
    </div>
  );
};

// ─────────────────────────────────────────────────────────────────────────────
// Small toggle pill for indicator toolbar
// ─────────────────────────────────────────────────────────────────────────────
const IndPill: React.FC<{
  label:    string;
  active:   boolean;
  color?:   string;
  onClick:  () => void;
  children?: React.ReactNode;
}> = ({ label, active, color = '#8b5cf6', onClick, children }) => (
  <button
    onClick={onClick}
    className={`flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold transition-all ${
      active
        ? 'text-white border-transparent'
        : 'border-white/10 text-gray-600 hover:text-gray-300 hover:border-white/20'
    }`}
    style={active ? { background: color, boxShadow: `0 0 8px ${color}66` } : {}}
  >
    {label}
    {children}
  </button>
);

// ─────────────────────────────────────────────────────────────────────────────
// Main Floating Button + Panel
// ─────────────────────────────────────────────────────────────────────────────
interface FloatingTVChartButtonProps {
  symbol:    string;
  exchange?: string;
}

export const FloatingTVChartButton: React.FC<FloatingTVChartButtonProps> = ({
  symbol,
  exchange = 'bybit',
}) => {
  const [isOpen,      setIsOpen]      = useState(false);
  const [chartExchange, setChartExchange] = useState(exchange);
  const [chartSym,    setChartSym]    = useState(symbol);
  const [interval,    setInterval]    = useState('15m');
  const [chartKey,    setChartKey]    = useState(0);
  const [ind,         setInd]         = useState<IndSettings>(DEFAULT_IND);
  const [showEmaPick, setShowEmaPick] = useState(false);

  // ── Dragging ──────────────────────────────────────────────────────────────
  const [pos, setPos]       = useState({ x: 0, y: 0 });
  const [dragging, setDrag] = useState(false);
  const dragRef = useRef({ mx: 0, my: 0, px: 0, py: 0 });

  const initPos = useCallback(() => {
    setPos({ x: window.innerWidth - 540 - 32, y: window.innerHeight - 560 - 220 });
  }, []);

  useEffect(() => { initPos(); }, [initPos]);

  const onDragStart = (e: React.MouseEvent) => {
    e.preventDefault(); setDrag(true);
    dragRef.current = { mx: e.clientX, my: e.clientY, px: pos.x, py: pos.y };
  };

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragging) return;
      setPos({ x: dragRef.current.px + e.clientX - dragRef.current.mx,
               y: dragRef.current.py + e.clientY - dragRef.current.my });
    };
    const onUp = () => setDrag(false);
    if (dragging) { window.addEventListener('mousemove', onMove); window.addEventListener('mouseup', onUp); }
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
  }, [dragging]);

  // Sync heatmap symbol+exchange → chart (only when panel closed)
  useEffect(() => {
    if (!isOpen) {
      setChartSym(symbol);
      setChartExchange(exchange);
    }
  }, [symbol, exchange, isOpen]);

  // When symbol/exchange changes via the selector → reload chart
  const handleSymbolChange = (newSym: string) => {
    setChartSym(newSym);
    setChartKey(k => k + 1);
  };
  const handleExchangeChange = (newEx: string) => {
    setChartExchange(newEx);
    setChartKey(k => k + 1);
  };

  const toggle = (key: keyof IndSettings) => {
    setInd(prev => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <>
      {/* ── FAB ─────────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {!isOpen && (
          <MotionButton
            initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
            onClick={() => setIsOpen(true)}
            className="fixed bottom-[196px] right-8 w-16 h-16 rounded-full flex items-center justify-center bg-gradient-to-br from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 border border-violet-400/30 text-white shadow-[0_0_24px_rgba(139,92,246,0.5)] z-[100] transition-all focus:outline-none group"
            title="Order Flow Chart"
          >
            <BarChart2 className="w-7 h-7 group-hover:scale-110 transition-transform" />
          </MotionButton>
        )}
      </AnimatePresence>

      {/* ── Floating Panel ───────────────────────────────────────────────── */}
      <AnimatePresence>
        {isOpen && (
          <MotionDiv
            initial={{ opacity: 0, scale: 0.93, y: 16 }}
            animate={{ opacity: 1, scale: 1,    y: 0  }}
            exit={{    opacity: 0, scale: 0.93, y: 16  }}
            transition={{ type: 'spring', stiffness: 340, damping: 28 }}
            style={{
              left: pos.x, top: pos.y, position: 'fixed',
              height: ind.showRSI || ind.showMACD ? 560 : 520,
            }}
            className="w-[540px] rounded-2xl bg-[#070C17] border border-violet-500/20 shadow-[0_16px_64px_rgba(0,0,0,0.85),0_0_0_1px_rgba(139,92,246,0.07)] z-[200] flex flex-col overflow-hidden"
          >
            {/* ── DRAG HANDLE ─────────────────────────────────────────── */}
            <div
              className="flex items-center justify-between px-3 py-2 bg-black/50 border-b border-white/[0.05] cursor-move select-none flex-shrink-0"
              onMouseDown={onDragStart}
            >
              <div className="flex items-center gap-2 pointer-events-none">
                <div className="w-5 h-5 rounded-md bg-violet-600/30 flex items-center justify-center">
                  <BarChart2 className="w-3 h-3 text-violet-400" />
                </div>
                <span className="text-[10px] font-bold text-violet-400 uppercase tracking-widest">Order Flow Chart</span>
                <span className="text-[9px] text-gray-600 font-mono">· {stripFutures(chartSym)} · {interval}</span>
              </div>
              <div className="flex items-center gap-1 pointer-events-auto" onMouseDown={e => e.stopPropagation()}>
                <button onClick={() => setChartKey(k => k + 1)}
                  className="p-1 rounded-md hover:bg-white/10 text-gray-600 hover:text-white transition-colors" title="Refresh">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setIsOpen(false)}
                  className="p-1 rounded-md hover:bg-red-500/20 text-gray-600 hover:text-red-400 transition-colors" title="Close">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>

            {/* ── SYMBOL + INTERVAL SELECTOR ───────────────────────────── */}
            <div
              className="flex-shrink-0 bg-[#0A0F1C] border-b border-white/[0.05] px-3 py-2 flex flex-col gap-1.5"
              onMouseDown={e => e.stopPropagation()}
            >
              {/* Symbol + Timeframe on same row, side by side */}
              <div className="flex items-center gap-2">
                <HeatmapSymbolSelector
                  symbol={chartSym}
                  exchange={chartExchange}
                  onSymbolChange={handleSymbolChange}
                  onExchangeChange={handleExchangeChange}
                />
                <TimeframeSelector
                  interval={interval}
                  onIntervalChange={(tf) => { setInterval(tf); setChartKey(k => k + 1); }}
                />
              </div>

              {/* ── Row 3: INDICATOR TOOLBAR ─────────────────────────────── */}
              <div className="flex items-center gap-1.5 pt-0.5 border-t border-white/[0.06] flex-wrap">
                <span className="text-[9px] text-gray-700 uppercase tracking-widest font-bold flex-shrink-0">Ind</span>

                {/* EMA pill with period sub-menu */}
                <div className="relative">
                  <div className="flex items-center">
                    <IndPill label={`EMA${ind.emaPeriod}`} active={ind.showEMA} color="#d97706" onClick={() => toggle('showEMA')} />
                    <button
                      onClick={() => setShowEmaPick(v => !v)}
                      className="ml-0.5 px-1 py-0.5 rounded text-gray-600 hover:text-white hover:bg-white/10 transition-colors"
                    >
                      <ChevronDown className={`w-2.5 h-2.5 transition-transform ${showEmaPick ? 'rotate-180' : ''}`} />
                    </button>
                  </div>
                  <AnimatePresence>
                    {showEmaPick && (
                      <MotionDiv initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
                        transition={{ duration: 0.1 }}
                        className="absolute top-full left-0 mt-1 bg-[#0A0F1C] border border-white/10 rounded-xl shadow-2xl p-1 z-50 flex gap-0.5">
                        {EMA_PERIODS.map(p => (
                          <button key={p}
                            onClick={() => { setInd(prev => ({ ...prev, emaPeriod: p, showEMA: true })); setShowEmaPick(false); }}
                            className={`px-2 py-1 text-[10px] font-bold rounded-lg transition-colors ${
                              ind.emaPeriod === p ? 'bg-amber-500 text-black' : 'text-gray-400 hover:bg-white/5 hover:text-white'
                            }`}>{p}</button>
                        ))}
                      </MotionDiv>
                    )}
                  </AnimatePresence>
                </div>

                <IndPill label="BB"   active={ind.showBB}   color="#0ea5e9" onClick={() => toggle('showBB')} />
                <IndPill label="RSI"  active={ind.showRSI}  color="#db2777" onClick={() => toggle('showRSI')} />
                <IndPill label="MACD" active={ind.showMACD} color="#3b82f6" onClick={() => toggle('showMACD')} />
                <IndPill label="VOL"  active={ind.showVol}  color="#6366f1" onClick={() => toggle('showVol')} />

                {/* RSI/MACD note */}
                {(ind.showRSI || ind.showMACD) && (
                  <span className="ml-auto text-[8px] text-gray-700 font-mono">sub-pane ↓</span>
                )}
              </div>
            </div>

            {/* ── MINI CHART ───────────────────────────────────────────── */}
            <div className="flex-1 min-h-0 overflow-hidden">
              <MiniOrderFlowChart
                key={`${chartKey}-${chartSym}-${chartExchange}-${interval}`}
                symbol={chartSym}
                exchange={chartExchange}
                interval={interval}
                ind={ind}
              />
            </div>
          </MotionDiv>
        )}
      </AnimatePresence>
    </>
  );
};
