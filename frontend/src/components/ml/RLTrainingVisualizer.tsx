import React, { useEffect, useState, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Play, Pause, FastForward, SkipBack, X, Activity, DollarSign, Target, Settings, Database, Server, Clock, GitCommit } from 'lucide-react';
import ReactFlow, { Background, Controls, Edge, Node, MarkerType } from 'reactflow';
import 'reactflow/dist/style.css';
import { createChart, IChartApi, ISeriesApi, LineData, LineSeries } from 'lightweight-charts';
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

interface ReplayData {
    initial_balance: number;
    algorithm: string;
    symbol: string;
    equity_history: number[];
    trade_history: any[];
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
    0: 'NEUTRAL',
    1: 'LONG',
    2: 'SHORT',
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
    
    const wsRef = useRef<WebSocket | null>(null);
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const lineSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
    const lastTimeRef = useRef<number>(Math.floor(Date.now() / 1000));

    // Dynamic NN Nodes for React Flow
    const initialNodes: Node[] = [
        { id: 'env', position: { x: 50, y: 150 }, data: { label: 'Market Env' }, style: { background: '#1e293b', color: '#38bdf8', border: '1px solid #0ea5e9' } },
        { id: 'state', position: { x: 250, y: 150 }, data: { label: 'State Vector' }, style: { background: '#1e293b', color: '#fff', border: '1px solid #334155' } },
        { id: 'actor', position: { x: 450, y: 50 }, data: { label: 'Actor (Policy)' }, style: { background: '#064e3b', color: '#34d399', border: '1px solid #10b981' } },
        { id: 'critic', position: { x: 450, y: 250 }, data: { label: 'Critic (Value)' }, style: { background: '#4c1d95', color: '#a78bfa', border: '1px solid #8b5cf6' } },
        { id: 'action', position: { x: 650, y: 50 }, data: { label: 'Action (Hold)' }, style: { background: '#1e293b', color: '#fff', border: '1px solid #cbd5e1' } },
        { id: 'reward', position: { x: 650, y: 250 }, data: { label: 'Reward (0.0)' }, style: { background: '#1e293b', color: '#f59e0b', border: '1px solid #f59e0b' } },
    ];

    const initialEdges: Edge[] = [
        { id: 'e1', source: 'env', target: 'state', animated: true, style: { stroke: '#38bdf8' } },
        { id: 'e2', source: 'state', target: 'actor', animated: true, style: { stroke: '#34d399' } },
        { id: 'e3', source: 'state', target: 'critic', animated: true, style: { stroke: '#a78bfa' } },
        { id: 'e4', source: 'actor', target: 'action', animated: true, style: { stroke: '#cbd5e1' } },
        { id: 'e5', source: 'critic', target: 'reward', animated: true, style: { stroke: '#f59e0b' } },
        { id: 'e6', source: 'action', target: 'env', animated: true, style: { stroke: '#64748b' }, type: 'step', markerEnd: { type: MarkerType.ArrowClosed } },
    ];

    const [nodes, setNodes] = useState<Node[]>(initialNodes);
    const [edges, setEdges] = useState<Edge[]>(initialEdges);

    // Initialize Lightweight Chart for Price
    useEffect(() => {
        if (chartContainerRef.current && !chartRef.current) {
            const chart = createChart(chartContainerRef.current, {
                layout: {
                    background: { color: 'transparent' },
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
            lineSeriesRef.current = lineSeries;

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
        setStatus('connecting');

        // Connect to the backtest WebSocket endpoint which broadcasts task_updates
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

                    // Update React Flow Nodes to animate
                    setNodes(nds => nds.map(node => {
                        if (node.id === 'action') {
                            const actionLabel = actionLabels[data.action as keyof typeof actionLabels] || 'HOLD';
                            const color = data.action === 1 ? '#10b981' : data.action === 2 ? '#ef4444' : '#94a3b8';
                            node.data = { ...node.data, label: `Action (${actionLabel})` };
                            node.style = { ...node.style, borderColor: color, color: color };
                        }
                        if (node.id === 'reward') {
                            const color = data.reward >= 0 ? '#10b981' : '#ef4444';
                            node.data = { ...node.data, label: `Reward (${data.reward.toFixed(4)})` };
                            node.style = { ...node.style, borderColor: color, color: color };
                        }
                        return node;
                    }));

                    // Optional: Track trades for the log
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
                <div className="w-full h-full max-w-[1600px] max-h-[900px] flex flex-col bg-slate-900 border border-white/10 rounded-3xl overflow-hidden shadow-2xl relative">
                    
                    {/* Header */}
                    <div className="h-16 border-b border-white/10 bg-black/40 flex items-center justify-between px-6 shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-purple-500/20 border border-purple-500/50 flex items-center justify-center text-purple-400">
                                <BrainCircuit className="w-5 h-5" />
                            </div>
                            <div>
                                <h2 className="text-white font-bold text-lg leading-tight flex items-center gap-2">
                                    {algorithm} Training Visualizer
                                    {status === 'training' && <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>}
                                </h2>
                                <p className="text-slate-400 text-xs">Simulating environment for {symbol}</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-6">
                            <div className="flex items-center gap-3 bg-white/5 px-4 py-2 rounded-xl border border-white/10">
                                <span className="text-xs text-slate-400">Progress:</span>
                                <div className="w-32 h-2 bg-black/50 rounded-full overflow-hidden">
                                    <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-400 transition-all duration-300" style={{ width: `${progress}%` }}></div>
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
                        
                        {/* Left Column: Network & Stats */}
                        <div className="col-span-3 flex flex-col gap-4 min-h-0">
                            {/* Stats Panel */}
                            <div className="bg-black/40 border border-white/10 rounded-2xl p-4 shrink-0">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-4">Agent State</h3>
                                <div className="grid grid-cols-2 gap-4">
                                    <div className="bg-white/5 rounded-xl p-3">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><DollarSign className="w-3 h-3"/> Net Worth</div>
                                        <div className="text-lg text-white font-mono font-bold">${latestStep?.net_worth.toFixed(2) || '0.00'}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-3">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Target className="w-3 h-3"/> Last Action</div>
                                        <div className={`text-lg font-mono font-bold ${actionColors[latestStep?.action as keyof typeof actionColors] || 'text-slate-400'}`}>
                                            {actionLabels[latestStep?.action as keyof typeof actionLabels] || 'WAITING'}
                                        </div>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-3">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><GitCommit className="w-3 h-3"/> Episode Step</div>
                                        <div className="text-lg text-white font-mono font-bold">{latestStep?.step || 0}</div>
                                    </div>
                                    <div className="bg-white/5 rounded-xl p-3">
                                        <div className="text-slate-400 text-xs mb-1 flex items-center gap-1"><Activity className="w-3 h-3"/> Last Reward</div>
                                        <div className={`text-lg font-mono font-bold ${latestStep && latestStep.reward >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                            {latestStep?.reward.toFixed(4) || '0.0000'}
                                        </div>
                                    </div>
                                </div>
                            </div>

                            {/* React Flow Network Visualization */}
                            <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl p-4 min-h-[300px] flex flex-col">
                                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Neural Network Flow</h3>
                                <div className="flex-1 rounded-xl overflow-hidden border border-white/5">
                                    <ReactFlow
                                        nodes={nodes}
                                        edges={edges}
                                        fitView
                                        attributionPosition="bottom-right"
                                        proOptions={{ hideAttribution: true }}
                                    >
                                        <Background color="#334155" gap={16} size={1} />
                                    </ReactFlow>
                                </div>
                            </div>
                        </div>

                        {/* Middle Column: Price Chart & Equity Curve */}
                        <div className="col-span-6 flex flex-col gap-4 min-h-0">
                            {/* Price Simulator Chart */}
                            <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl flex flex-col overflow-hidden">
                                <div className="p-3 border-b border-white/10 bg-white/5 flex items-center justify-between">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Environment: Price Action</h3>
                                    <div className="text-cyan-400 font-mono text-sm">{latestStep?.price ? `$${latestStep.price.toFixed(2)}` : 'Loading...'}</div>
                                </div>
                                <div ref={chartContainerRef} className="flex-1 w-full" />
                            </div>

                            {/* Equity Curve (Recharts) */}
                            <div className="h-64 bg-black/40 border border-white/10 rounded-2xl flex flex-col overflow-hidden shrink-0">
                                <div className="p-3 border-b border-white/10 bg-white/5">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Equity Curve</h3>
                                </div>
                                <div className="flex-1 p-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={equityData}>
                                            <defs>
                                                <linearGradient id="colorEq" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="5%" stopColor="#38bdf8" stopOpacity={0.3}/>
                                                    <stop offset="95%" stopColor="#38bdf8" stopOpacity={0}/>
                                                </linearGradient>
                                            </defs>
                                            <XAxis dataKey="step" hide />
                                            <YAxis domain={['auto', 'auto']} hide />
                                            <RechartsTooltip 
                                                contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155' }}
                                                itemStyle={{ color: '#38bdf8' }}
                                            />
                                            <Area type="stepAfter" dataKey="value" stroke="#38bdf8" fillOpacity={1} fill="url(#colorEq)" isAnimationActive={false} />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        </div>

                        {/* Right Column: Rewards & Log */}
                        <div className="col-span-3 flex flex-col gap-4 min-h-0">
                            {/* Reward Chart */}
                            <div className="h-48 bg-black/40 border border-white/10 rounded-2xl flex flex-col overflow-hidden shrink-0">
                                <div className="p-3 border-b border-white/10 bg-white/5">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Instantaneous Reward</h3>
                                </div>
                                <div className="flex-1 p-2">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <LineChart data={rewardData}>
                                            <XAxis dataKey="step" hide />
                                            <YAxis domain={['auto', 'auto']} hide />
                                            <Line type="monotone" dataKey="value" stroke="#f59e0b" dot={false} isAnimationActive={false} />
                                        </LineChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>

                            {/* Trade Log */}
                            <div className="flex-1 bg-black/40 border border-white/10 rounded-2xl flex flex-col overflow-hidden">
                                <div className="p-3 border-b border-white/10 bg-white/5">
                                    <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">Agent Decisions</h3>
                                </div>
                                <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
                                    {tradeLog.map((log, i) => (
                                        <div key={i} className="flex items-center justify-between bg-white/5 p-2 rounded-lg border border-white/5 text-xs font-mono">
                                            <div className="flex items-center gap-2">
                                                <span className="text-slate-500">#{log.step}</span>
                                                <span className={log.action === 1 ? 'text-green-400' : 'text-red-400'}>
                                                    {log.action === 1 ? 'BUY' : 'SELL'}
                                                </span>
                                            </div>
                                            <div className="text-slate-300">${log.price.toFixed(2)}</div>
                                        </div>
                                    ))}
                                    {tradeLog.length === 0 && (
                                        <div className="text-slate-500 text-xs text-center mt-4">Waiting for agent to take action...</div>
                                    )}
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
