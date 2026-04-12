import React, { useEffect, useState } from 'react';
import {
    ResponsiveContainer,
    ComposedChart,
    Scatter,
    Line,
    XAxis,
    YAxis,
    ZAxis,
    Tooltip,
    Cell,
    CartesianGrid
} from 'recharts';
import { useTheme } from '@/context/ThemeContext';
import { LiquidationEvent } from '@/hooks/useLiquidationWebSocket';

interface LiquidationBubbleChartProps {
    data: LiquidationEvent[];
    activePair: string;
}

interface CandleData {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
}

const LiquidationBubbleChart: React.FC<LiquidationBubbleChartProps> = ({ data, activePair }) => {
    const { theme } = useTheme();
    const [candles, setCandles] = useState<CandleData[]>([]);

    useEffect(() => {
        const fetchCandles = async () => {
            try {
                // Fetch last 50 candles (15m interval) from Binance
                // Fetch last 50 candles (15m interval) from Backend Proxy
                const symbol = activePair.replace('/', '');
                const response = await fetch(`/api/v1/liquidation/candles?symbol=${symbol}&interval=15m&limit=50`);
                const formatted: CandleData[] = await response.json();
                setCandles(formatted);
            } catch (error) {
                console.error("Failed to fetch candles", error);
            }
        };

        if (activePair) {
            fetchCandles();
            // Poll for fresh candles every 15s? Or just once on mount/change. 
            // For now, once is fine as liquidations are the live part.
        }
    }, [activePair]);

    // Prepare chart data
    // We need to combine or layer data. 
    // Recharts ComposedChart can handle multiple data sources if we pass them to individual components?
    // Actually, it's better to use specific data props for each series.
    // XAxis domain will be properly calculated if we include both datasets?
    // We will supply `candles` to ComposedChart (to set the main axis) and `data` to Scatter.

    const bubbleData = data.map((event) => ({
        ...event,
        time: event.timestamp || Date.now(), // Map timestamp to 'time' to match XAxis dataKey
        x: event.timestamp || Date.now(),    // Keep 'x' just in case
        y: event.price,
        z: event.amount
    }));

    const CustomTooltip = ({ active, payload, label }: any) => {
        if (active && payload && payload.length) {
            const dataPoint = payload[0].payload;

            // Bubble Tooltip (Liquidation)
            if (dataPoint.type) {
                const isLong = dataPoint.type === 'Long';
                const colorClass = isLong ? 'text-rose-400' : 'text-emerald-400';
                const borderColor = isLong ? 'border-rose-500/30' : 'border-emerald-500/30';
                const glowClass = isLong ? 'shadow-[0_0_15px_rgba(244,63,94,0.3)]' : 'shadow-[0_0_15px_rgba(16,185,129,0.3)]';

                return (
                    <div className={`p-3 rounded-xl border backdrop-blur-md bg-black/60 ${borderColor} ${glowClass} text-xs font-mono z-50 min-w-[180px]`}>
                        <div className="flex items-center justify-between mb-2 border-b border-white/10 pb-2">
                            <span className={`font-bold uppercase tracking-wider ${colorClass}`}>{dataPoint.type} REKT</span>
                            <span className="text-[10px] text-gray-400">{dataPoint.time}</span>
                        </div>
                        <div className="space-y-1.5">
                            <div className="flex justify-between">
                                <span className="text-gray-400">Price</span>
                                <span className="font-bold text-white">${dataPoint.price.toLocaleString()}</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-gray-400">Initial Pos</span>
                                <span className={`font-bold ${colorClass}`}>${(dataPoint.amount || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                            </div>
                        </div>
                    </div>
                );
            }
            // Candle/Line Tooltip
            return (
                <div className="p-2 rounded-lg border border-slate-700/50 bg-slate-900/80 backdrop-blur-sm shadow-xl text-xs font-mono z-50">
                    <p className="font-bold text-slate-300 mb-1">Price Action</p>
                    <div className="text-white">${dataPoint.close?.toLocaleString()}</div>
                    <div className="text-[10px] text-gray-500 mt-1">{new Date(dataPoint.time).toLocaleTimeString()}</div>
                </div>
            );
        }
        return null;
    };

    return (
        <div className="w-full h-full min-h-[200px] animate-fade-in relative group">
            <ResponsiveContainer width="100%" height="100%" debounce={50}>
                <ComposedChart data={candles} margin={{ top: 20, right: 20, bottom: 20, left: 0 }}>
                    <defs>
                        <radialGradient id="longGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                            <stop offset="0%" stopColor="#F43F5E" stopOpacity={0.9} />
                            <stop offset="70%" stopColor="#F43F5E" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#F43F5E" stopOpacity={0} />
                        </radialGradient>
                        <radialGradient id="shortGradient" cx="50%" cy="50%" r="50%" fx="50%" fy="50%">
                            <stop offset="0%" stopColor="#10B981" stopOpacity={0.9} />
                            <stop offset="70%" stopColor="#10B981" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="#10B981" stopOpacity={0} />
                        </radialGradient>
                        <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                            <feMerge>
                                <feMergeNode in="coloredBlur" />
                                <feMergeNode in="SourceGraphic" />
                            </feMerge>
                        </filter>
                    </defs>

                    <CartesianGrid strokeDasharray="2 4" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} opacity={0.15} vertical={false} />

                    <XAxis
                        type="number"
                        dataKey="time"
                        domain={['dataMin', 'dataMax']}
                        tickFormatter={(unixTime) => new Date(unixTime).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        tick={{ fontSize: 9, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        minTickGap={30}
                    />
                    <YAxis
                        type="number"
                        dataKey="close"
                        domain={['auto', 'auto']}
                        tick={{ fontSize: 9, fill: '#64748b' }}
                        tickFormatter={(value) => `$${value.toLocaleString()}`}
                        orientation="right"
                        axisLine={false}
                        tickLine={false}
                        width={60}
                    />
                    {/* ZAxis controls bubble size range */}
                    <ZAxis type="number" dataKey="z" range={[60, 1200]} name="Amount" />

                    <Tooltip content={<CustomTooltip />} cursor={{ stroke: '#64748b', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.5 }} />

                    <Line
                        type="monotone"
                        dataKey="close"
                        stroke="#94a3b8"
                        strokeWidth={1.5}
                        dot={false}
                        activeDot={{ r: 4, fill: '#fff' }}
                        opacity={0.3}
                        isAnimationActive={false}
                    />

                    <Scatter
                        name="Liquidations"
                        data={bubbleData}
                        isAnimationActive={true}
                        animationDuration={500}
                    >
                        {bubbleData.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.type === 'Long' ? 'url(#longGradient)' : 'url(#shortGradient)'}
                                style={{ filter: 'url(#glow)' }}
                                stroke="none"
                            />
                        ))}
                    </Scatter>
                </ComposedChart>
            </ResponsiveContainer>
        </div>
    );
};

export default LiquidationBubbleChart;
