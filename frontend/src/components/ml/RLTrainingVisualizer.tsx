import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, X, Activity, DollarSign, Target, GitCommit } from 'lucide-react';
import { createChart, IChartApi, ISeriesApi, LineSeries } from 'lightweight-charts';
import { LineChart, Line, XAxis, YAxis, Tooltip as RechartsTooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';

interface RLStepData {
    step: number;
    net_worth: number;
    position: number;
    balance: number;
    action: number;
    reward: number;
    price: number;
}

interface RLTrainingVisualizerProps {
    isOpen: boolean;
    onClose: () => void;
    jobId: string;
    algorithm: string;
    symbol: string;
}

const actionColors = {
    0: 'text-slate-400', // Neutral/Cash
    1: 'text-green-400', // Long
    2: 'text-red-400',   // Short
};

const actionLabels = {
    0: 'HOLD (NO TRADE)',
    1: 'BUY (LONG)',
    2: 'SELL (SHORT)',
};

const CustomNeuralNetwork = ({ features, action, step }: { features: string[], action: number, step: number }) => {
    const layer1 = useMemo(() => Array.from({ length: 11 }).map((_, i) => ({ x: 450, y: 70 + i * 36 })), []);
    const layer2 = useMemo(() => Array.from({ length: 8 }).map((_, i) => ({ x: 600, y: 124 + i * 36 })), []);
    const layer3 = useMemo(() => Array.from({ length: 5 }).map((_, i) => ({ x: 750, y: 178 + i * 36 })), []);
    
    const outputs = [
        { id: 1, label: 'BUY', x: 880, y: 150, color: '#10b981', glow: action === 1 },
        { id: 2, label: 'SELL', x: 880, y: 250, color: '#ef4444', glow: action === 2 },
        { id: 0, label: 'HOLD', x: 880, y: 350, color: '#94a3b8', glow: action === 0 },
    ];

    const groups = [
        { name: 'Order Book & Price', y: 30 },
        { name: 'Volume & Activity', y: 105 },
        { name: 'Liquidity & Liq', y: 180 },
        { name: 'CVD Analysis', y: 255 },
        { name: 'Smart Money', y: 330 },
        { name: 'Advanced Price Action', y: 405 },
    ];
    
    const preProc = { x: 230, y: 100, w: 120, h: 300 };

    const drawEdges = (sourceX: number, sourceY: number, targetNodes: {x: number, y: number}[], color: string, active?: boolean) => {
        return targetNodes.map((target, idx) => (
            <path
                key={`${sourceX}-${sourceY}-${idx}`}
                d={`M ${sourceX} ${sourceY} C ${(sourceX + target.x) / 2} ${sourceY}, ${(sourceX + target.x) / 2} ${target.y}, ${target.x} ${target.y}`}
                fill="none"
                stroke={color}
                strokeWidth={active ? 1.5 : 1}
                strokeOpacity={active ? 0.8 : 0.1}
                className={active ? "edge-pulse" : ""}
                style={{ filter: active ? `drop-shadow(0 0 3px ${color})` : 'none' }}
            />
        ));
    };

    return (
        <div className="w-full h-full relative overflow-hidden bg-[#020617] rounded-xl flex items-center justify-center border border-white/5 shadow-[inset_0_0_50px_rgba(0,0,0,0.8)]">
            <style>{`
                @keyframes flowPulse {
                    0% { stroke-opacity: 0.1; filter: drop-shadow(0 0 0px transparent); }
                    50% { stroke-opacity: 1; filter: drop-shadow(0 0 5px currentColor); }
                    100% { stroke-opacity: 0.1; filter: drop-shadow(0 0 0px transparent); }
                }
                .edge-pulse {
                    animation: flowPulse 1s ease-in-out;
                }
                .glow-node {
                    filter: drop-shadow(0 0 8px currentColor);
                }
                .glow-node-strong {
                    filter: drop-shadow(0 0 15px currentColor);
                }
            `}</style>
            
            <svg viewBox="0 0 1000 500" className="w-full h-full max-h-full" preserveAspectRatio="xMidYMid meet">
                
                {/* Wrap animated edges in a group with key=step so it restarts CSS animations on change */}
                <g key={step}>
                    {groups.map((g, i) => {
                        const sx = 180;
                        const sy = g.y + 25;
                        return [130, 210, 250, 310, 370].map((ty, j) => (
                            <path key={`g-${i}-${j}`} d={`M ${sx} ${sy} C ${(sx + preProc.x) / 2} ${sy}, ${(sx + preProc.x) / 2} ${ty}, ${preProc.x} ${ty}`} fill="none" stroke="#0ea5e9" strokeWidth={1} strokeOpacity={0.1} className="edge-pulse" style={{ color: '#0ea5e9', animationDelay: `${(i*0.05)}s` }} />
                        ));
                    })}

                    {[130, 190, 250, 310, 370].map((sy, i) => (
                        <g key={`pp-${i}`}>
                            {drawEdges(preProc.x + preProc.w, sy, layer1, "#38bdf8", true)}
                        </g>
                    ))}
                    
                    {layer1.map((n1, i) => <g key={`l1-${i}`}>{drawEdges(n1.x, n1.y, layer2, "#818cf8", true)}</g>)}
                    {layer2.map((n2, i) => <g key={`l2-${i}`}>{drawEdges(n2.x, n2.y, layer3, "#a78bfa", true)}</g>)}
                    
                    {layer3.map((n3, i) => {
                        return outputs.map(out => (
                            <path
                                key={`out-${i}-${out.id}`}
                                d={`M ${n3.x} ${n3.y} C ${(n3.x + out.x) / 2} ${n3.y}, ${(n3.x + out.x) / 2} ${out.y}, ${out.x} ${out.y}`}
                                fill="none"
                                stroke={out.glow ? out.color : "#64748b"}
                                strokeWidth={out.glow ? 2 : 1}
                                strokeOpacity={out.glow ? 0.8 : 0.05}
                                className={out.glow ? "edge-pulse glow-node" : "transition-all duration-500"}
                                style={{ color: out.color }}
                            />
                        ))
                    })}
                </g>

                {/* 1. Feature Groups */}
                {groups.map(g => (
                    <g key={g.name} transform={`translate(10, ${g.y})`}>
                        <rect width="170" height="50" rx="8" fill="#0f172a" stroke="#0ea5e9" strokeWidth="1" strokeOpacity="0.4" />
                        <text x="10" y="20" fill="#e0f2fe" fontSize="12" fontWeight="600">{g.name}</text>
                        <text x="10" y="38" fill="#7dd3fc" fontSize="9" opacity="0.6">
                            {features.length > 0 ? `${Math.max(1, Math.floor(features.length / 6))} Features Loaded` : 'Waiting...'}
                        </text>
                        <circle cx="160" cy="15" r="2" fill="#38bdf8" className="glow-node" style={{ color: '#38bdf8' }} />
                        <circle cx="160" cy="25" r="2" fill="#38bdf8" className="glow-node" style={{ color: '#38bdf8' }} />
                        <circle cx="160" cy="35" r="2" fill="#38bdf8" className="glow-node" style={{ color: '#38bdf8' }} />
                    </g>
                ))}

                {/* 2. Pre-processing Block */}
                <g transform={`translate(${preProc.x}, ${preProc.y})`}>
                    <rect width={preProc.w} height={preProc.h} rx="12" fill="#020617" stroke="#0ea5e9" strokeWidth="2" className="glow-node" style={{ color: '#0ea5e9' }} />
                    <text x={preProc.w/2} y={preProc.h/2 - 15} fill="#e0f2fe" fontSize="14" fontWeight="bold" textAnchor="middle">Feature</text>
                    <text x={preProc.w/2} y={preProc.h/2 + 5} fill="#e0f2fe" fontSize="14" fontWeight="bold" textAnchor="middle">Pre-processing</text>
                    <text x={preProc.w/2} y={preProc.h/2 + 25} fill="#38bdf8" fontSize="11" textAnchor="middle">& Embedding</text>
                </g>

                {/* 3. Hidden Layers Dots */}
                <g>
                    {layer1.map((n, i) => <circle key={`L1-${i}`} cx={n.x} cy={n.y} r="3" fill="#e0f2fe" className="glow-node" style={{ color: '#38bdf8' }} />)}
                    {layer2.map((n, i) => <circle key={`L2-${i}`} cx={n.x} cy={n.y} r="3" fill="#e0f2fe" className="glow-node" style={{ color: '#818cf8' }} />)}
                    {layer3.map((n, i) => <circle key={`L3-${i}`} cx={n.x} cy={n.y} r="3" fill="#e0f2fe" className="glow-node" style={{ color: '#a78bfa' }} />)}
                </g>

                <text x="450" y="45" fill="#94a3b8" fontSize="12" textAnchor="middle" fontWeight="bold">Layer 1 (512)</text>
                <text x="600" y="99" fill="#94a3b8" fontSize="12" textAnchor="middle" fontWeight="bold">Layer 2 (256)</text>
                <text x="750" y="153" fill="#94a3b8" fontSize="12" textAnchor="middle" fontWeight="bold">Layer 3 (128)</text>

                {/* 4. Output Actions */}
                {outputs.map(out => (
                    <g key={out.id} transform={`translate(${out.x}, ${out.y})`}>
                        <rect x="0" y="-25" width="100" height="50" rx="25" fill="#0f172a" stroke={out.color} strokeWidth={out.glow ? 2 : 1} className={out.glow ? "glow-node-strong" : ""} style={{ color: out.color }} />
                        <text x="50" y="5" fill={out.glow ? '#ffffff' : out.color} fontSize="14" fontWeight="bold" textAnchor="middle">{out.label}</text>
                    </g>
                ))}

            </svg>
        </div>
    );
};

export const RLTrainingVisualizer: React.FC<RLTrainingVisualizerProps> = ({
    isOpen,
    onClose,
    jobId,
    algorithm,
    symbol
}) => {
    const [status, setStatus] = useState<'connecting' | 'training' | 'completed' | 'failed'>('connecting');
    const [progress, setProgress] = useState(0);
    const [latestStep, setLatestStep] = useState<RLStepData | null>(null);
    const [equityData, setEquityData] = useState<{ step: number, value: number }[]>([]);
    const [rewardData, setRewardData] = useState<{ step: number, value: number }[]>([]);
    const [tradeLog, setTradeLog] = useState<any[]>([]);
    const [features, setFeatures] = useState<string[]>([]);
    
    const wsRef = useRef<WebSocket | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const lastTimeRef = useRef<number>(Math.floor(Date.now() / 1000));

    // Initialize Lightweight Chart for Price
    useEffect(() => {
        if (chartContainerRef.current && !chartRef.current) {
            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { type: 'solid', color: 'transparent' } as any,
                    textColor: '#94a3b8',
                },
                grid: {
                    vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                    horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
                },
                timeScale: {
                    timeVisible: true,
                    secondsVisible: false,
                },
            });
            const lineSeries = chart.addSeries(LineSeries, {
                color: '#38bdf8',
                lineWidth: 2,
            });
            chartRef.current = chart;
            lineSeriesRef.current = lineSeries as any;

            const handleResize = () => {
                if (chartContainerRef.current && chart) {
                    chart.applyOptions({ width: chartContainerRef.current.clientWidth });
                }
            };
            window.addEventListener('resize', handleResize);
            return () => {
                window.removeEventListener('resize', handleResize);
                chart.remove();
                chartRef.current = null;
            };
        }
    }, [isOpen]);

    // WebSocket Connection
    useEffect(() => {
        if (!isOpen || !jobId) return;

        // Reset state
        setEquityData([]);
        setRewardData([]);
        setTradeLog([]);
        setFeatures([]);
        setStatus('connecting');

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const baseUrl = import.meta.env.VITE_WS_URL || `${protocol}//${window.location.host}`;
        const wsUrl = baseUrl.endsWith('/ws') ? `${baseUrl}/backtest` : `${baseUrl}/ws/backtest`;
        
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            console.log("Connected to task updates channel");
            setStatus('training');
        };

        ws.onmessage = (event) => {
            try {
                const message = JSON.parse(event.data);
                if (message.type === 'RL_TRAINING_STEP' && message.task_id === jobId) {
                    const data: RLStepData = message.payload;
                    setProgress(message.progress || 0);
                    setLatestStep(data);
                    
                    if (message.features && message.features.length > 0 && features.length === 0) {
                        setFeatures(message.features);
                    }
                    
                    // Update Charts
                    setEquityData(prev => {
                        const next = [...prev, { step: data.step, value: data.net_worth }];
                        if (next.length > 100) next.shift();
                        return next;
                    });
                    
                    setRewardData(prev => {
                        const next = [...prev, { step: data.step, value: data.reward }];
                        if (next.length > 50) next.shift();
                        return next;
                    });

                    // Update Price Chart
                    if (lineSeriesRef.current && data.price) {
                        lastTimeRef.current += 60;
                        lineSeriesRef.current.update({ time: lastTimeRef.current as any, value: data.price });
                    }

                    // Log actions
                    if (data.action !== 0) {
                        setTradeLog(prev => {
                            const t = { step: data.step, action: data.action, price: data.price, pnl: 0 };
                            const next = [t, ...prev];
                            if (next.length > 20) next.pop();
                            return next;
                        });
                    }

                    if (message.status === 'completed') {
                        setStatus('completed');
                        setProgress(100);
                    } else if (message.status === 'failed') {
                        setStatus('failed');
                    }
                }
            } catch (err) {
                console.error("Failed to parse RL step message", err);
            }
        };

        ws.onclose = () => {
            if (status === 'training') setStatus('completed');
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [isOpen, jobId]);

    if (!isOpen) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/90 backdrop-blur-md p-4"
            >
                <div className="w-full h-full max-w-[1600px] max-h-[900px] flex flex-col bg-[#020617] border border-slate-800 rounded-3xl overflow-hidden shadow-2xl relative">
                    
                    {/* Header */}
                    <div className="h-16 border-b border-white/5 bg-white/5 flex items-center justify-between px-6 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-purple-400">
                                <BrainCircuit className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-white font-bold text-lg leading-tight flex items-center gap-2 tracking-wide">
                                    {algorithm} Institutional Model Engine
                                    {status === 'training' && <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse glow-node-strong" style={{ color: '#34d399' }}></div>}
                                </h2>
                                <p className="text-slate-400 text-xs tracking-wider">Simulating Advanced Environment: {symbol}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3 bg-black/40 px-4 py-2 rounded-xl border border-white/5">
                                <span className="text-xs text-slate-400">Progress:</span>
                                <div className="w-32 h-2 bg-slate-900 rounded-full overflow-hidden shadow-inner">
                                    <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-300 relative" style={{ width: `${progress}%` }}>
                                        <div className="absolute inset-0 bg-white/20 w-full h-full animate-[shimmer_2s_infinite]"></div>
                                    </div>
                                </div>
                                <span className="text-xs text-white font-bold">{progress}%</span>
                            </div>
                            <button onClick={onClose} className="p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl transition-colors">
                                <X className="w-5 h-5" />
                            </button>
                        </div>
                    </div>

                    {/* Main Layout Grid */}
                    <div className="flex-1 grid grid-cols-12 gap-4 p-4 min-h-0">
                        
                        {/* Top Section: Custom Network SVG */}
                        <div className="col-span-12 h-[350px] flex flex-col min-h-0">
                            <CustomNeuralNetwork features={features} action={latestStep?.action ?? -1} step={latestStep?.step || 0} />
                        </div>

                        {/* Bottom Section: Stats & Charts */}
                        <div className="col-span-3 flex flex-col gap-4 min-h-0">
                            <div className="bg-black/40 border border-white/5 rounded-2xl p-4 shrink-0 shadow-lg">
                                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-cyan-500" />
                                    Agent Live State
                                </h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Net Worth</div>
                                        <div className="text-lg text-white font-mono font-bold">${latestStep?.net_worth.toFixed(2) || '0.00'}</div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Target className="w-3 h-3"/> Action</div>
                                        <div className={`text-sm font-mono font-bold mt-1 ${actionColors[latestStep?.action as keyof typeof actionColors] || 'text-slate-400'}`}>
                                            {actionLabels[latestStep?.action as keyof typeof actionLabels] || 'WAITING'}
                                        </div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><GitCommit className="w-3 h-3"/> Episode Step</div>
                                        <div className="text-lg text-white font-mono font-bold">{latestStep?.step || 0}</div>
                                    </div>
                                    <div className="bg-slate-900/50 rounded-xl p-3 border border-white/5">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Activity className="w-3 h-3"/> Last Reward</div>
                                        <div className={`text-lg font-mono font-bold ${latestStep && latestStep.reward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {latestStep?.reward.toFixed(4) || '0.0000'}
                                        </div>
                                    </div>
                                </div>
                            </div>
                            
                            {/* Trade Log */}
                            <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-lg">
                                <div className="p-3 border-b border-white/5 bg-slate-900/50">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Agent Decisions</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                    {tradeLog.map((log, i) => (
                                        <div key={i} className="flex items-center justify-between bg-slate-900/80 p-2 rounded-lg border border-white/5 text-xs font-mono">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500">#{log.step}</span>
                                                <span className={log.action === 1 ? 'text-green-400 font-bold' : 'text-red-400 font-bold'}>
                                                    {log.action === 1 ? 'BUY' : 'SELL'}
                                                </span>
                                            </div>
                                            <div className="text-slate-300">${log.price.toFixed(2)}</div>
                                        </div>
                                    ))}
                                    {tradeLog.length === 0 && (
                                        <div className="text-slate-500 text-xs text-center mt-4">Waiting for decisions...</div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Chart Area */}
                        <div className="col-span-9 flex flex-col gap-4 min-h-0">
                            {/* Equity Curve (Recharts) */}
                            <div className="h-48 bg-black/40 border border-white/5 rounded-2xl flex flex-col overflow-hidden shrink-0 shadow-lg relative">
                                <div className="absolute top-3 left-4 z-10">
                                    <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Model Equity Curve (Returns)</h3>
                                </div>
                                <div className="flex-1 w-full pt-8 p-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={equityData}>
                                            <defs>
                                                <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.4}/>
                                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="step" hide />
                                            <YAxis domain={['auto', 'auto']} hide />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: '#020617', borderColor: '#1e293b', borderRadius: '8px' }}
                                                itemStyle={{ color: '#38bdf8', fontWeight: 'bold' }}
                                            />
                                            <Area type="monotone" dataKey="value" stroke="#38bdf8" strokeWidth={2} fillOpacity={1} fill="url(#colorEq)" isAnimationActive={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            <div className="flex-1 grid grid-cols-2 gap-4 min-h-0">
                                {/* Price Simulator Chart */}
                                <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-lg">
                                    <div className="p-3 border-b border-white/5 bg-slate-900/50 flex items-center justify-between">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Price Environment</h3>
                                        <div className="text-slate-300 font-mono text-sm">{latestStep?.price ? `$${latestStep.price.toFixed(4)}` : '...'}</div>
                                    </div>
                                    <div ref={chartContainerRef} className="flex-1 w-full" />
                                </div>

                                {/* Reward Chart */}
                                <div className="flex-1 bg-black/40 border border-white/5 rounded-2xl flex flex-col overflow-hidden shadow-lg relative">
                                    <div className="absolute top-3 left-4 z-10">
                                        <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Instantaneous Reward</h3>
                                    </div>
                                    <div className="flex-1 w-full pt-10 p-2">
                                        <ResponsiveContainer width="100%" height="100%">
                                            <LineChart data={rewardData}>
                                                <XAxis dataKey="step" hide />
                                                <YAxis domain={['auto', 'auto']} hide />
                                                <Line type="stepAfter" dataKey="value" stroke="#f59e0b" strokeWidth={2} dot={false} isAnimationActive={false} />
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default RLTrainingVisualizer;
