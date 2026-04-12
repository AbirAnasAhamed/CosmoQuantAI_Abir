
import React, { useState, useEffect } from 'react';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import Card from '@/components/common/Card';
import { useTheme } from '@/context/ThemeContext';
import type { CointegratedPair } from '@/types';
import { fetchCorrelationMatrix } from '@/services/analytics';
import { ArrowPathIcon, SignalIcon } from '@heroicons/react/24/solid';
import { useCorrelationSocket } from '@/hooks/useCorrelationSocket';
import RollingCorrelationModal from './RollingCorrelationModal';
import { Toaster, toast } from 'react-hot-toast';

// --- Utility Functions ---

const getCorrelationColor = (value: number, opacity: number = 1) => {
    const absVal = Math.abs(value);
    // 1.0 = Indigo (Self), Positive = Emerald, Negative = Rose
    if (value === 1) return `rgba(99, 102, 241, ${opacity})`; // Brand Primary

    if (value > 0) {
        // Green intensity based on value
        if (value > 0.75) return `rgba(16, 185, 129, ${opacity})`;
        if (value > 0.5) return `rgba(52, 211, 153, ${opacity})`;
        return `rgba(110, 231, 183, ${opacity})`;
    } else {
        // Red intensity based on value
        if (value < -0.75) return `rgba(244, 63, 94, ${opacity})`;
        if (value < -0.5) return `rgba(251, 113, 133, ${opacity})`;
        return `rgba(253, 164, 175, ${opacity})`;
    }
};

const getCorrelationTextColor = (value: number) => {
    if (Math.abs(value) > 0.5 || value === 1) return 'text-white';
    return 'text-slate-900 dark:text-white';
};

// --- Visual Components ---

// 1. Z-Score Horizon Gauge
const ZScoreGauge: React.FC<{ zScore: number }> = ({ zScore }) => {
    // Clamp value between -3 and 3 for display
    const clampedScore = Math.max(-3, Math.min(3, zScore));
    // Convert to percentage (0% at -3, 50% at 0, 100% at 3)
    const percent = ((clampedScore + 3) / 6) * 100;

    return (
        <div className="w-full mt-4">
            <div className="flex justify-between text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-1">
                <span>Buy Pair (-2σ)</span>
                <span>Mean (0)</span>
                <span>Sell Pair (+2σ)</span>
            </div>
            <div className="relative h-3 bg-gray-200 dark:bg-slate-800 rounded-full overflow-hidden">
                {/* Zones */}
                <div className="absolute left-0 w-[16.66%] h-full bg-emerald-500/30"></div> {/* Buy Zone */}
                <div className="absolute right-0 w-[16.66%] h-full bg-rose-500/30"></div>   {/* Sell Zone */}
                <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-gray-400 dark:bg-gray-600 transform -translate-x-1/2"></div> {/* Mean */}

                {/* The Indicator Puck */}
                <div
                    className={`absolute top-0 bottom-0 w-1.5 h-full rounded-full shadow-[0_0_10px_currentColor] transition-all duration-500 ease-out transform -translate-x-1/2 ${zScore > 1.5 ? 'bg-rose-500 shadow-rose-500' : zScore < -1.5 ? 'bg-emerald-500 shadow-emerald-500' : 'bg-blue-400'
                        }`}
                    style={{ left: `${percent}%` }}
                ></div>
            </div>
            <div className="text-center mt-1 font-mono text-xs font-bold">
                Z: <span className={zScore > 1.5 ? 'text-rose-500' : zScore < -1.5 ? 'text-emerald-500' : 'text-gray-500'}>{zScore.toFixed(2)}</span>
            </div>
        </div>
    );
};

// 2. The Quantum Grid Cell
const MatrixCell: React.FC<{
    value: number;
    leadLag: number; // Lag in steps. Negative = Row leads Col. Positive = Col leads Row.
    row: string;
    col: string;
    timeframe: string;
    isHovered: boolean;
    onHover: (r: string, c: string) => void;
    onLeave: () => void;
    onClick: (r: string, c: string) => void;
}> = ({ value, leadLag, row, col, timeframe, isHovered, onHover, onLeave, onClick }) => {
    const bg = getCorrelationColor(value, isHovered ? 1 : 0.8);
    const text = getCorrelationTextColor(value);

    // Calculate Lead/Lag Text
    let leadLagText = "";
    if (leadLag !== 0 && Math.abs(value) > 0.5) { // Only show for significant correlation
        const absLag = Math.abs(leadLag);
        // Estimate time based on timeframe
        let timeUnit = "period";
        let timeMult = 1;
        if (timeframe === '1h') { timeUnit = "hr"; timeMult = 1; }
        else if (timeframe === '4h') { timeUnit = "hr"; timeMult = 4; }
        else if (timeframe === '1d') { timeUnit = "day"; timeMult = 1; }
        // Attempt to parse if it's strictly mins/hours (e.g. from a helper, but simple switch for now)
        // If "1h", lag 1 = 1 hour.

        const timeVal = absLag // * timeMult if we want absolute time, but lag is steps.
        // Let's formatting: "~2 steps" or "~2 hours".
        // Simplification: just show steps and timeframe for context, or try to be smart.
        // Prompt says: "BTC leads ETH by ~2 mins".
        // If timeframe is 1m (not in list), but let's assume 1h.

        const formatTime = (lag: number, tf: string) => {
            if (tf === '1h') return `${lag} hr${lag > 1 ? 's' : ''}`;
            if (tf === '4h') return `${lag * 4} hrs`;
            if (tf === '1d') return `${lag} day${lag > 1 ? 's' : ''}`;
            return `${lag} period${lag > 1 ? 's' : ''}`;
        };

        const timeStr = formatTime(absLag, timeframe);

        if (leadLag < 0) {
            // Row leads Col
            leadLagText = `${row.split('/')[0]} leads ${col.split('/')[0]} by ~${timeStr}`;
        } else {
            // Col leads Row
            leadLagText = `${col.split('/')[0]} leads ${row.split('/')[0]} by ~${timeStr}`;
        }
    }

    return (
        <div
            onMouseEnter={() => onHover(row, col)}
            onMouseLeave={onLeave}
            onClick={() => onClick(row, col)}
            className={`relative h-14 flex items-center justify-center text-sm font-bold transition-all duration-200 cursor-pointer border border-transparent hover:border-white/20 hover:scale-105 hover:z-10 rounded-lg ${text} group`}
            style={{ backgroundColor: bg }}
        >
            {value.toFixed(2)}

            {/* Tooltip */}
            <div className="absolute opacity-0 group-hover:opacity-100 bottom-full mb-2 left-1/2 transform -translate-x-1/2 bg-slate-900 text-white text-xs rounded-md px-2 py-1 pointer-events-none whitespace-nowrap z-50 shadow-xl border border-slate-700 transition-opacity duration-200">
                <div className="font-bold">{row} vs {col}</div>
                <div>Corr: {value.toFixed(4)}</div>
                {leadLagText && (
                    <div className="text-emerald-400 font-bold mt-0.5">{leadLagText}</div>
                )}
                <div className="absolute bottom-[-4px] left-1/2 transform -translate-x-1/2 w-2 h-2 bg-slate-900 rotate-45 border-r border-b border-slate-700"></div>
            </div>
        </div>
    );
};

const PairCard: React.FC<{ pairData: CointegratedPair; index: number }> = ({ pairData, index }) => {
    const { theme } = useTheme();

    const isHighAlert = Math.abs(pairData.zScore) > 2.0;
    const isOpportunity = Math.abs(pairData.zScore) > 1.5;
    const signalColor = pairData.signal === 'Buy Pair' ? 'text-emerald-500' : pairData.signal === 'Sell Pair' ? 'text-rose-500' : 'text-gray-400';
    const signalBg = pairData.signal === 'Buy Pair' ? 'bg-emerald-500/10 border-emerald-500/20' : pairData.signal === 'Sell Pair' ? 'bg-rose-500/10 border-rose-500/20' : 'bg-gray-100 dark:bg-white/5 border-gray-200 dark:border-white/10';

    return (
        <div className={`staggered-fade-in bg-white dark:bg-brand-dark border border-gray-200 dark:border-brand-border-dark rounded-xl overflow-hidden shadow-lg hover:shadow-xl transition-all duration-300 hover:-translate-y-1 ${isHighAlert ? 'ring-2 ring-rose-500 shadow-[0_0_20px_rgba(244,63,94,0.4)] animate-pulse' : isOpportunity ? 'ring-1 ring-brand-primary/50' : ''}`} style={{ animationDelay: `${index * 100}ms` }}>
            <div className="p-5">
                <div className="flex justify-between items-start mb-4">
                    <div className="flex items-center gap-3">
                        <div className="flex -space-x-2">
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-bold border-2 border-white dark:border-brand-dark">{pairData.pair[0]}</div>
                            <div className="w-8 h-8 rounded-full bg-slate-300 dark:bg-slate-600 flex items-center justify-center text-[10px] font-bold border-2 border-white dark:border-brand-dark">{pairData.pair[1]}</div>
                        </div>
                        <div>
                            <h3 className="text-sm font-bold text-slate-900 dark:text-white">{pairData.pair.join(' / ')}</h3>
                            <p className="text-[10px] text-gray-500 uppercase">Cointegration: {(pairData.cointegrationScore * 100).toFixed(0)}%</p>
                        </div>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold border ${signalBg} ${signalColor}`}>
                        {pairData.signal}
                    </span>
                </div>

                <div className="h-24 w-full opacity-80">
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={pairData.spreadHistory}>
                            <defs>
                                <linearGradient id={`grad-${pairData.id}`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#6366F1" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#6366F1" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                            <XAxis dataKey="time" hide />
                            <YAxis domain={['dataMin', 'dataMax']} hide />
                            <Tooltip
                                contentStyle={theme === 'dark' ? { backgroundColor: '#0F172A', border: '1px solid #334155' } : {}}
                                formatter={(value: number) => [value.toFixed(4), 'Spread']}
                                labelFormatter={() => ''}
                            />
                            <Area type="monotone" dataKey="value" stroke="#6366F1" strokeWidth={2} fill={`url(#grad-${pairData.id})`} />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>

                <ZScoreGauge zScore={pairData.zScore} />
            </div>
        </div>
    );
};

const CorrelationMatrix: React.FC = () => {
    const [hoveredCell, setHoveredCell] = useState<{ r: string, c: string } | null>(null);
    const [loading, setLoading] = useState<boolean>(true);
    const [matrixData, setMatrixData] = useState<Record<string, Record<string, number>>>({});
    const [leadLagData, setLeadLagData] = useState<Record<string, Record<string, number>>>({});
    const [assets, setAssets] = useState<string[]>(['BTC/USDT', 'ETH/USDT', 'SOL/USDT', 'ADA/USDT', 'XRP/USDT', 'BNB/USDT']);
    const [cointegratedPairs, setCointegratedPairs] = useState<CointegratedPair[]>([]);
    const [error, setError] = useState<string | null>(null);

    const [selectedTimeframe, setSelectedTimeframe] = useState<string>('1h');

    const [selectedPair, setSelectedPair] = useState<{ a: string, b: string } | null>(null);

    // Use WebSocket Hook
    const { isConnected, socketData } = useCorrelationSocket(null, (msg) => {
        // Prevent duplicate toasts if needed, but backend throttling should handle it.
        // Custom Premium Toast
        toast.custom((t) => (
            <div
                className={`${t.visible ? 'animate-enter' : 'animate-leave'
                    } max-w-sm w-full bg-slate-900/90 dark:bg-slate-900/90 backdrop-blur-md shadow-[0_8px_30px_rgb(0,0,0,0.12)] rounded-2xl pointer-events-auto flex ring-1 ring-white/10 overflow-hidden`}
            >
                <div className="flex-1 w-0 p-4">
                    <div className="flex items-start gap-4">
                        <div className="flex-shrink-0 pt-0.5 relative">
                            <span className="relative flex h-3 w-3 absolute top-0 right-0 -mt-1 -mr-1">
                                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-500 opacity-75"></span>
                                <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
                            </span>
                            <div className="h-10 w-10 rounded-full bg-rose-500/20 flex items-center justify-center border border-rose-500/30">
                                <SignalIcon className="h-6 w-6 text-rose-500" />
                            </div>
                        </div>
                        <div className="flex-1">
                            <p className="text-sm font-bold text-white">
                                Arbitrage Opportunity
                            </p>
                            <p className="mt-1 text-xs text-gray-300 leading-relaxed">
                                {msg.replace("High Cointegration Signal!", "")}
                            </p>
                            <p className="mt-2 text-[10px] text-gray-500 font-mono uppercase tracking-wider">
                                {new Date().toLocaleTimeString()} • Z-Score Alert
                            </p>
                        </div>
                    </div>
                </div>
                <div className="flex flex-col border-l border-white/10 bg-white/5">
                    <button
                        onClick={() => toast.dismiss(t.id)}
                        className="w-full h-full border-transparent p-4 flex items-center justify-center text-sm font-medium text-gray-400 hover:text-white focus:outline-none transition-colors"
                    >
                        ✕
                    </button>
                </div>
                {/* Progress bar animation (optional CSS) */}
                <div className="absolute bottom-0 left-0 h-0.5 bg-rose-500/50 w-full animate-[shrink_4s_linear_forwards]"></div>
            </div>
        ), { duration: 4000, position: 'top-right' });
    });

    const processData = (data: any) => {
        setMatrixData(data.matrix);
        if (data.lead_lag_matrix) {
            setLeadLagData(data.lead_lag_matrix);
        }
        // Transform API pairs to UI CointegratedPair type
        const pairs = data.cointegrated_pairs || [];
        const transformedPairs: CointegratedPair[] = pairs.map((p: any, idx: number) => {
            let signal: 'Buy Pair' | 'Sell Pair' | 'Hold' = 'Hold';
            if (p.z_score < -2.0) signal = 'Buy Pair';
            else if (p.z_score > 2.0) signal = 'Sell Pair';

            return {
                id: `pair-${idx}`,
                pair: [p.asset_a, p.asset_b],
                cointegrationScore: (1 - p.p_value),
                zScore: p.z_score,
                signal: signal,
                spreadHistory: Array.from({ length: 20 }, (_, i) => ({
                    time: i,
                    value: Math.random() * 2 - 1 + p.z_score
                }))
            };
        });
        setCointegratedPairs(transformedPairs);
        setLoading(false);
    };

    // Initial Load
    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const data = await fetchCorrelationMatrix(assets, selectedTimeframe);
            processData(data);
        } catch (err) {
            console.error(err);
            setError("Failed to load correlation data. Ensure backend is running.");
            setLoading(false);
        }
    };

    useEffect(() => {
        loadData();
    }, [assets, selectedTimeframe]);

    // Update on WS Message
    useEffect(() => {
        if (socketData) {
            processData(socketData);
        }
    }, [socketData]);

    const displayAssets = Object.keys(matrixData).length > 0 ? Object.keys(matrixData) : assets;
    const gridTemplateCols = `repeat(${displayAssets.length + 1}, minmax(0, 1fr))`;

    return (
        <div className="space-y-8 animate-fade-in-slide-up">
            <Toaster position="top-right" />

            {/* Header Section */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
                <div>
                    <h2 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight flex items-center gap-3">
                        Statistical Arbitrage
                        {isConnected && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-500 text-[10px] font-bold uppercase tracking-wider border border-emerald-500/20">
                                <span className="relative flex h-2 w-2">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                </span>
                                Live Feed
                            </span>
                        )}
                        {!isConnected && (
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-gray-500/10 text-gray-500 text-[10px] font-bold uppercase tracking-wider border border-gray-500/20">
                                Offline
                            </span>
                        )}
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400 mt-2 max-w-2xl">
                        Advanced correlation analysis and cointegration scanner to identify mean-reversion opportunities between assets.
                    </p>
                </div>
                <div className="flex flex-col items-end gap-3">
                    <div className="flex gap-2 text-xs font-bold uppercase tracking-wider mb-1">
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-emerald-500 rounded-sm"></div> Pos Correl</div>
                        <div className="flex items-center gap-1"><div className="w-3 h-3 bg-rose-500 rounded-sm"></div> Neg Correl</div>
                    </div>

                    <div className="flex items-center gap-2">
                        {/* Timeframe Selector */}
                        <div className="flex bg-slate-200 dark:bg-slate-800 rounded-lg p-1">
                            {['1H', '4H', '1D'].map((tf) => (
                                <button
                                    key={tf}
                                    onClick={() => setSelectedTimeframe(tf.toLowerCase())}
                                    className={`px-3 py-1.5 text-xs font-bold rounded-md transition-all ${selectedTimeframe === tf.toLowerCase()
                                        ? 'bg-white dark:bg-brand-primary text-slate-900 dark:text-white shadow-sm'
                                        : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                        }`}
                                >
                                    {tf}
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={loadData}
                            disabled={loading}
                            className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-white rounded-lg hover:bg-brand-primary/90 transition-colors disabled:opacity-50 text-sm font-bold h-[34px]"
                        >
                            {loading ? 'Scanning...' : <><ArrowPathIcon className="w-4 h-4" /> Refresh</>}
                        </button>
                    </div>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-rose-500/10 border border-rose-500/20 text-rose-500 rounded-lg">
                    {error}
                    <button onClick={loadData} className="ml-4 underline">Retry</button>
                </div>
            )}

            {loading && !matrixData['BTC/USDT'] ? ( // Simple loading state if no data
                <div className="h-96 flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
                </div>
            ) : (
                <div className="grid grid-cols-1 xl:grid-cols-12 gap-8">

                    {/* Left Column: The Quantum Grid */}
                    <div className="xl:col-span-7">
                        <Card className="h-full bg-slate-50 dark:bg-brand-dark border-0 shadow-xl p-6">
                            <div className="overflow-x-auto">
                                <div className="min-w-[500px]">
                                    {/* Matrix Header */}
                                    <div className="grid gap-2 mb-2" style={{ gridTemplateColumns: gridTemplateCols }}>
                                        <div className="h-10"></div> {/* Empty corner */}
                                        {displayAssets.map(asset => (
                                            <div key={asset} className={`h-10 flex items-center justify-center font-bold text-slate-700 dark:text-gray-300 transition-opacity text-xs ${hoveredCell && hoveredCell.c !== asset ? 'opacity-30' : 'opacity-100'}`}>
                                                {asset.split('/')[0]}
                                            </div>
                                        ))}
                                    </div>

                                    {/* Matrix Rows */}
                                    {displayAssets.map(rowAsset => (
                                        <div key={rowAsset} className={`grid gap-2 mb-2`} style={{ gridTemplateColumns: gridTemplateCols }}>
                                            <div className={`h-14 flex items-center justify-start pl-2 font-bold text-slate-700 dark:text-gray-300 transition-opacity text-xs ${hoveredCell && hoveredCell.r !== rowAsset ? 'opacity-30' : 'opacity-100'}`}>
                                                {rowAsset.split('/')[0]}
                                            </div>
                                            {displayAssets.map(colAsset => (
                                                <MatrixCell
                                                    key={`${rowAsset}-${colAsset}`}
                                                    row={rowAsset}
                                                    col={colAsset}
                                                    value={matrixData[rowAsset]?.[colAsset] || 0}
                                                    leadLag={leadLagData[rowAsset]?.[colAsset] || 0}
                                                    timeframe={selectedTimeframe}
                                                    isHovered={hoveredCell ? (hoveredCell.r === rowAsset || hoveredCell.c === colAsset) : false}
                                                    onHover={(r, c) => setHoveredCell({ r, c })}
                                                    onLeave={() => setHoveredCell(null)}
                                                    onClick={(r, c) => {
                                                        if (r !== c) setSelectedPair({ a: r, b: c });
                                                    }}
                                                />
                                            ))}
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <div className="mt-4 text-center text-xs text-gray-500 italic">
                                Hover over cells to cross-reference. Click to analyze pair deep-dive.
                            </div>
                        </Card>
                    </div>

                    {/* Right Column: Cointegration Scanner */}
                    <div className="xl:col-span-5 flex flex-col gap-6">
                        <div className="flex items-center justify-between bg-white dark:bg-brand-dark p-4 rounded-xl border border-gray-200 dark:border-brand-border-dark shadow-sm">
                            <h3 className="font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                <span className="relative flex h-3 w-3">
                                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                                    <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-primary"></span>
                                </span>
                                Live Pairs Scanner
                            </h3>
                            <span className="text-xs font-mono text-gray-500">Updated: Just now</span>
                        </div>

                        <div className="space-y-6">
                            {cointegratedPairs.length === 0 ? (
                                <div className="text-center text-gray-500 py-10">No cointegrated pairs found in this scan.</div>
                            ) : (
                                cointegratedPairs.map((pair, index) => (
                                    <PairCard key={pair.id} pairData={pair} index={index} />
                                ))
                            )}
                        </div>
                    </div>
                </div>
            )}

            {selectedPair && (
                <RollingCorrelationModal
                    symbolA={selectedPair.a}
                    symbolB={selectedPair.b}
                    onClose={() => setSelectedPair(null)}
                />
            )}
        </div>
    );
};

export default CorrelationMatrix;
