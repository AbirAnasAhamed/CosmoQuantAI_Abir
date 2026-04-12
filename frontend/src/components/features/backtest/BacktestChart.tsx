import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    createChart,
    ColorType,
    IChartApi,
    CandlestickSeries,
    ISeriesApi,
    Time,
    createSeriesMarkers,
    LineSeries,
    SeriesMarker,
    LineStyle
} from 'lightweight-charts';
import { Layers, Activity, Eye, EyeOff } from 'lucide-react'; // আইকনের জন্য (যদি lucide-react না থাকে, সাধারণ টেক্সট ব্যবহার করা যাবে)

// --- Types & Interfaces ---
interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

interface TradeMarker {
    time: number;
    type: 'buy' | 'sell';
    price: number;
}

interface BacktestChartProps {
    data: any[];
    trades: TradeMarker[];
}

interface IndicatorConfig {
    id: string;
    name: string;
    type: 'SMA' | 'EMA' | 'BB';
    period: number;
    color: string;
    visible: boolean;
    stdDev?: number; // For Bollinger Bands
}

// --- Helper: Indicator Calculations (Modular Logic) ---

// Simple Moving Average (SMA)
const calculateSMA = (data: CandleData[], period: number) => {
    const smaData = [];
    for (let i = period - 1; i < data.length; i++) {
        const slice = data.slice(i - period + 1, i + 1);
        const sum = slice.reduce((acc, val) => acc + val.close, 0);
        smaData.push({ time: data[i].time as Time, value: sum / period });
    }
    return smaData;
};

// Exponential Moving Average (EMA)
const calculateEMA = (data: CandleData[], period: number) => {
    const emaData = [];
    const k = 2 / (period + 1);
    let ema = data[0].close;

    for (let i = 0; i < data.length; i++) {
        if (i === 0) {
            emaData.push({ time: data[i].time as Time, value: data[i].close });
        } else {
            ema = data[i].close * k + ema * (1 - k);
            emaData.push({ time: data[i].time as Time, value: ema });
        }
    }
    return emaData;
};

// Bollinger Bands
const calculateBollingerBands = (data: CandleData[], period: number, stdDevMultiplier: number) => {
    const upper = [];
    const lower = [];
    const middle = calculateSMA(data, period);

    // Map logic needs to match indices properly
    // We start from the point where SMA exists
    const startIndex = period - 1;

    for (let i = 0; i < middle.length; i++) {
        const dataIndex = startIndex + i;
        const currentData = data[dataIndex];
        const slice = data.slice(dataIndex - period + 1, dataIndex + 1);
        
        // Calculate Standard Deviation
        const mean = middle[i].value;
        const squaredDiffs = slice.map(d => Math.pow(d.close - mean, 2));
        const variance = squaredDiffs.reduce((acc, val) => acc + val, 0) / period;
        const stdDev = Math.sqrt(variance);

        upper.push({ time: currentData.time as Time, value: mean + stdDev * stdDevMultiplier });
        lower.push({ time: currentData.time as Time, value: mean - stdDev * stdDevMultiplier });
    }

    return { upper, middle, lower };
};

// --- Helper: Data Formatting & Search ---
const findClosestCandle = (sortedData: CandleData[], targetTime: number) => {
    let left = 0;
    let right = sortedData.length - 1;
    let closest = sortedData[0];
    let minDiff = Infinity;

    while (left <= right) {
        const mid = Math.floor((left + right) / 2);
        const candle = sortedData[mid];
        const diff = Math.abs(candle.time - targetTime);

        if (diff < minDiff) {
            minDiff = diff;
            closest = candle;
        }

        if (candle.time < targetTime) left = mid + 1;
        else if (candle.time > targetTime) right = mid - 1;
        else return candle;
    }
    return closest;
};

const formatChartData = (rawData: any[]): CandleData[] => {
    if (!rawData || rawData.length === 0) return [];
    if (!Array.isArray(rawData[0])) return rawData as CandleData[];
    return rawData.map((c: any[]) => ({
        time: c[0] as number,
        open: c[1],
        high: c[2],
        low: c[3],
        close: c[4],
    }));
};

// --- Main Component ---

const BacktestChart: React.FC<BacktestChartProps> = ({ data = [], trades = [] }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    
    // Indicators State Manager
    const [indicators, setIndicators] = useState<IndicatorConfig[]>([
        { id: 'sma20', name: 'SMA 20', type: 'SMA', period: 20, color: '#F59E0B', visible: false },
        { id: 'ema50', name: 'EMA 50', type: 'EMA', period: 50, color: '#3B82F6', visible: false },
        { id: 'bb20', name: 'Bollinger Bands (20, 2)', type: 'BB', period: 20, stdDev: 2, color: '#8B5CF6', visible: false },
    ]);

    // Keep track of indicator series references to remove/update them
    const indicatorSeriesRefs = useRef<Map<string, ISeriesApi<"Line">[]>>(new Map());

    // Prepare Data
    const formattedData = useMemo(() => {
        const raw = formatChartData(data);
        const uniqueDataMap = new Map();
        raw.forEach(item => uniqueDataMap.set(item.time, item));
        return Array.from(uniqueDataMap.values()).sort((a, b) => a.time - b.time);
    }, [data]);

    // 1. Initialize Chart
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: ColorType.Solid, color: '#1E293B' }, // Slate-800
                textColor: '#94A3B8', // Slate-400
            },
            grid: {
                vertLines: { color: '#334155', style: LineStyle.Dotted },
                horzLines: { color: '#334155', style: LineStyle.Dotted },
            },
            width: chartContainerRef.current.clientWidth,
            height: 450,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
                borderColor: '#475569',
            },
            rightPriceScale: {
                borderColor: '#475569',
            },
            crosshair: {
                mode: 1, // Magnet mode
            },
        });

        chartRef.current = chart;

        // Add Candlestick Series
        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#10B981',
            downColor: '#EF4444',
            borderVisible: false,
            wickUpColor: '#10B981',
            wickDownColor: '#EF4444',
        });
        candlestickSeriesRef.current = series;

        // Resize Handler
        const handleResize = () => {
            if (chartContainerRef.current) {
                chart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []);

    // 2. Update Data & Markers
    useEffect(() => {
        if (!candlestickSeriesRef.current || formattedData.length === 0) return;

        // Set Data
        candlestickSeriesRef.current.setData(formattedData as any);

        // Set Markers
        const validMarkers: SeriesMarker<Time>[] = [];
        trades.forEach(trade => {
            const tradeTime = Number(trade.time);
            const closest = findClosestCandle(formattedData, tradeTime);

            if (closest && Math.abs(closest.time - tradeTime) <= 86400) {
                validMarkers.push({
                    time: closest.time as Time,
                    position: trade.type === 'buy' ? 'belowBar' : 'aboveBar',
                    color: trade.type === 'buy' ? '#10B981' : '#EF4444',
                    shape: trade.type === 'buy' ? 'arrowUp' : 'arrowDown',
                    text: `${trade.type.toUpperCase()} @ ${trade.price}`,
                    size: 1.5, // Slightly larger for visibility
                });
            }
        });
        validMarkers.sort((a, b) => (a.time as number) - (b.time as number));
        createSeriesMarkers(candlestickSeriesRef.current, validMarkers);

        if (chartRef.current) chartRef.current.timeScale().fitContent();
    }, [formattedData, trades]);

    // 3. Handle Indicators Layer
    useEffect(() => {
        if (!chartRef.current || formattedData.length === 0) return;

        // Clear existing indicators
        indicatorSeriesRefs.current.forEach((seriesList) => {
            seriesList.forEach(s => chartRef.current?.removeSeries(s));
        });
        indicatorSeriesRefs.current.clear();

        // Add visible indicators
        indicators.forEach(ind => {
            if (!ind.visible) return;

            if (ind.type === 'SMA') {
                const smaData = calculateSMA(formattedData, ind.period);
                const smaSeries = chartRef.current!.addSeries(LineSeries, {
                    color: ind.color,
                    lineWidth: 2,
                    title: ind.name,
                    priceLineVisible: false,
                });
                smaSeries.setData(smaData);
                indicatorSeriesRefs.current.set(ind.id, [smaSeries]);
            } 
            else if (ind.type === 'EMA') {
                const emaData = calculateEMA(formattedData, ind.period);
                const emaSeries = chartRef.current!.addSeries(LineSeries, {
                    color: ind.color,
                    lineWidth: 2,
                    title: ind.name,
                    priceLineVisible: false,
                });
                emaSeries.setData(emaData);
                indicatorSeriesRefs.current.set(ind.id, [emaSeries]);
            }
            else if (ind.type === 'BB') {
                const { upper, middle, lower } = calculateBollingerBands(formattedData, ind.period, ind.stdDev || 2);
                
                // Upper Band
                const upperSeries = chartRef.current!.addSeries(LineSeries, {
                    color: ind.color,
                    lineWidth: 1,
                    title: `${ind.name} Upper`,
                    lineStyle: LineStyle.Solid,
                    priceLineVisible: false,
                });
                upperSeries.setData(upper);

                // Lower Band
                const lowerSeries = chartRef.current!.addSeries(LineSeries, {
                    color: ind.color,
                    lineWidth: 1,
                    title: `${ind.name} Lower`,
                    lineStyle: LineStyle.Solid,
                    priceLineVisible: false,
                });
                lowerSeries.setData(lower);

                // We track both series for cleanup
                indicatorSeriesRefs.current.set(ind.id, [upperSeries, lowerSeries]);
            }
        });

    }, [indicators, formattedData]);

    // Toggle Handler
    const toggleIndicator = (id: string) => {
        setIndicators(prev => prev.map(ind => 
            ind.id === id ? { ...ind, visible: !ind.visible } : ind
        ));
    };

    return (
        <div className="relative w-full flex flex-col gap-2">
            {/* --- Chart Toolbar --- */}
            <div className="flex items-center gap-3 px-4 py-2 bg-slate-800/50 rounded-t-xl border border-slate-700">
                <div className="flex items-center gap-2 text-slate-300 text-sm font-semibold">
                    <Activity size={16} className="text-brand-primary" />
                    <span>Chart Layers:</span>
                </div>
                <div className="flex flex-wrap gap-2">
                    {indicators.map(ind => (
                        <button
                            key={ind.id}
                            onClick={() => toggleIndicator(ind.id)}
                            className={`
                                flex items-center gap-2 px-3 py-1 rounded-md text-xs font-medium transition-all border
                                ${ind.visible 
                                    ? `bg-slate-700 text-white border-${ind.color} ring-1 ring-${ind.color}/50` 
                                    : 'bg-transparent text-slate-400 border-slate-700 hover:bg-slate-700/50'}
                            `}
                            style={{ borderColor: ind.visible ? ind.color : undefined }}
                        >
                            {ind.visible ? <Eye size={12} /> : <EyeOff size={12} />}
                            {ind.name}
                        </button>
                    ))}
                </div>
            </div>

            {/* --- Chart Container --- */}
            <div className="relative w-full h-[450px]">
                <div 
                    ref={chartContainerRef} 
                    className="w-full h-full rounded-b-xl overflow-hidden border border-slate-700 shadow-2xl bg-[#1E293B]" 
                />
                
                {!formattedData.length && (
                    <div className="absolute inset-0 flex items-center justify-center bg-slate-900/80 text-slate-400 text-sm pointer-events-none z-10">
                        <div className="flex flex-col items-center gap-2">
                            <Layers size={24} />
                            <span>No Chart Data Available to Display</span>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

export default BacktestChart;
