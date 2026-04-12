import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, Activity, RefreshCw } from 'lucide-react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, Time } from 'lightweight-charts';
import toast from 'react-hot-toast';
import { leadLagService, LeadLagBot as BotConfig, LeadLagTradeLog } from '../../services/leadLagService';
import { useMarketStore } from '@/store/marketStore';

// Reusable Components
const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`backdrop-blur-md bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden ${className}`}>
        {children}
    </div>
);

const LeadLagBot = () => {
    const [bot, setBot] = useState<BotConfig | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    // Form States
    const { globalSymbol: targetPair, setGlobalSymbol: setTargetPair, globalInterval: timeframe, setGlobalInterval: setTimeframe } = useMarketStore();
    const [tradeSize, setTradeSize] = useState(100);
    const [stopLoss, setStopLoss] = useState(5.0);
    const [takeProfit, setTakeProfit] = useState(10.0);
    const [indicators, setIndicators] = useState('EMA Crossover');
    const [logs, setLogs] = useState<LeadLagTradeLog[]>([]);

    // Chart Refs
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

    // Initial Load
    useEffect(() => {
        const fetchBot = async () => {
            try {
                const bots = await leadLagService.getBots();
                if (bots.length > 0) {
                    const activeBot = bots[0];
                    setBot(activeBot);
                    setTargetPair(activeBot.target_pair);
                    setTradeSize(activeBot.trade_size);
                    setStopLoss(activeBot.stop_loss_pct);
                    setTakeProfit(activeBot.take_profit_pct);
                    setTimeframe(activeBot.timeframe);
                    setIsRunning(activeBot.is_active || false);

                    fetchLogs(activeBot.id);
                } else {
                    // Create a default bot if none exists
                    const newBot = await leadLagService.createBot({
                        name: "Default LeadLag Bot",
                        leader_pair: "BTC/USDT",
                        target_pair: "SOL/USDT",
                        exchange: "binance",
                        timeframe: "15m",
                        trade_size: 100,
                        take_profit_pct: 10.0,
                        stop_loss_pct: 5.0,
                        is_paper_trading: true,
                        paper_balance: 10000.0,
                    });
                    setBot(newBot);
                }
            } catch (err) {
                console.error("Failed to fetch LeadLag bot instance", err);
                toast.error("Failed to load Lead-Lag Bot settings.");
            }
        };

        fetchBot();
    }, []);

    const fetchLogs = async (botId: number) => {
        try {
            const botLogs = await leadLagService.getLogs(botId, 0, 50);
            setLogs(botLogs);
        } catch (err) {
            console.error("Failed to fetch logs", err);
        }
    };

    // Polling Logs
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isRunning && bot) {
            interval = setInterval(() => {
                fetchLogs(bot.id);
            }, 5000);
        }
        return () => {
            if (interval) clearInterval(interval);
        };
    }, [isRunning, bot]);

    // Initialize Chart and fetch real Binance data
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#DDD' },
            grid: { vertLines: { color: '#334155' }, horzLines: { color: '#334155' } },
            width: chartContainerRef.current.clientWidth,
            height: 400,
            timeScale: {
                timeVisible: true,
                secondsVisible: false,
            },
        });

        const series = chart.addSeries(CandlestickSeries, {
            upColor: '#10B981', downColor: '#F43F5E', borderVisible: false, wickUpColor: '#10B981', wickDownColor: '#F43F5E'
        });

        chartRef.current = chart;
        seriesRef.current = series;

        // Fetch Real Binance Data
        const loadChartData = async () => {
            try {
                // Fetch BTC data since it's the leader pair
                const response = await fetch(`https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=${timeframe}&limit=100`);
                const data = await response.json();

                const formattedData = data.map((d: any) => ({
                    time: (d[0] / 1000) as Time,
                    open: parseFloat(d[1]),
                    high: parseFloat(d[2]),
                    low: parseFloat(d[3]),
                    close: parseFloat(d[4])
                }));

                series.setData(formattedData);
            } catch (error) {
                console.error("Failed to load chart data:", error);
                toast.error("Failed to load real-time chart data from Binance.");
            }
        };

        loadChartData();

        const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth || 0 });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, [timeframe]);

    const handleToggleBot = async () => {
        if (!bot) return;

        try {
            if (!isRunning) {
                // Update bot configuration before starting
                await leadLagService.updateBot(bot.id, {
                    target_pair: targetPair,
                    trade_size: tradeSize,
                    stop_loss_pct: stopLoss,
                    take_profit_pct: takeProfit,
                    timeframe: timeframe
                });

                const res = await leadLagService.startBot(bot.id);
                if (res.status === 'success') {
                    setIsRunning(true);
                    toast.success(res.message || "Lead-Lag Bot Started");
                } else {
                    toast.error(res.message || "Failed to start bot");
                }
            } else {
                const res = await leadLagService.stopBot(bot.id);
                if (res.status === 'success') {
                    setIsRunning(false);
                    toast.error("Lead-Lag Bot Stopped");
                } else {
                    toast.error("Failed to stop bot");
                }
            }
        } catch (err: any) {
            console.error("Error toggling bot", err);
            toast.error(err.response?.data?.detail || "An error occurred.");
        }
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] gap-6 staggered-fade-in pb-4">

            {/* Header */}
            <div className="flex justify-between items-end gap-4 mb-2 flex-shrink-0">
                <div>
                    <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 flex items-center gap-3">
                        Lead-Lag Bot
                        <span className={`text-sm font-mono px-2 py-1 rounded border ${isRunning ? 'text-emerald-500 animate-pulse bg-emerald-500/10 border-emerald-500/20' : 'text-gray-500 bg-gray-500/10 border-gray-500/20'}`}>
                            {isRunning ? 'CONNECTED - SYNCING' : 'OFFLINE'}
                        </span>
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 font-light">
                        Trade altcoins automatically based on BTC momentum and leading indicators.
                    </p>
                </div>

                <button
                    onClick={handleToggleBot}
                    disabled={!bot}
                    className={`px-8 py-3 rounded-xl font-bold flex items-center gap-2 shadow-lg transition-all ${isRunning
                        ? 'bg-rose-500/20 text-rose-500 border border-rose-500/50 hover:bg-rose-500/30'
                        : 'bg-emerald-500 text-black shadow-[0_0_20px_rgba(16,185,129,0.3)] hover:shadow-[0_0_30px_rgba(16,185,129,0.5)] disabled:opacity-50 disabled:cursor-not-allowed'
                        }`}
                >
                    {isRunning ? <Square fill="currentColor" size={18} /> : <Play fill="currentColor" size={18} />}
                    {isRunning ? 'STOP BOT' : 'START BOT'}
                </button>
            </div>

            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar pr-2 pb-10">
                <div className="grid grid-cols-12 gap-6 h-full">

                    {/* Left: Chart Section */}
                    <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                        <GlassCard className="p-4 flex flex-col h-[500px]">
                            <div className="flex items-center justify-between mb-4 border-b border-white/5 pb-2">
                                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                    <Activity className="text-cyan-400" size={18} /> {bot?.leader_pair || 'BTC/USDT'} Momentum
                                </h3>
                                <div className="flex gap-2">
                                    <select
                                        value={timeframe}
                                        onChange={(e) => setTimeframe(e.target.value)}
                                        disabled={isRunning}
                                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none disabled:opacity-50"
                                    >
                                        <option value="1m">1m</option>
                                        <option value="5m">5m</option>
                                        <option value="15m">15m</option>
                                        <option value="1h">1h</option>
                                    </select>
                                    <select
                                        value={indicators}
                                        onChange={(e) => setIndicators(e.target.value)}
                                        disabled={isRunning}
                                        className="bg-black/40 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white outline-none disabled:opacity-50"
                                    >
                                        <option value="EMA Crossover">EMA Crossover</option>
                                        <option value="Bollinger Breakout">Bollinger Breakout</option>
                                    </select>
                                </div>
                            </div>
                            <div className="flex-1 relative">
                                <div ref={chartContainerRef} className="w-full h-full rounded-xl overflow-hidden" />
                            </div>
                        </GlassCard>

                        {/* Trade Records */}
                        <GlassCard className="p-4 flex-1 min-h-[250px]">
                            <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2 pb-2 border-b border-white/5">
                                <RefreshCw className={`text-cyan-400 ${isRunning ? 'animate-spin' : ''}`} size={18} /> Live Trade Activity
                            </h3>
                            <div className="overflow-x-auto">
                                <table className="w-full text-left text-xs text-gray-400">
                                    <thead className="text-[10px] uppercase font-bold tracking-wider text-gray-500 bg-white/5">
                                        <tr>
                                            <th className="px-4 py-2 rounded-tl-lg">Time</th>
                                            <th className="px-4 py-2">BTC Trigger</th>
                                            <th className="px-4 py-2">Target Pair</th>
                                            <th className="px-4 py-2">Action</th>
                                            <th className="px-4 py-2">Exp. Price</th>
                                            <th className="px-4 py-2 rounded-tr-lg">PnL</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-white/5">
                                        {logs.length === 0 ? (
                                            <tr>
                                                <td colSpan={6} className="text-center py-8 text-gray-500">
                                                    No trades executed yet.
                                                </td>
                                            </tr>
                                        ) : (
                                            logs.map((log) => (
                                                <tr key={log.id} className="hover:bg-white/5 transition-colors">
                                                    <td className="px-4 py-3">{new Date(log.created_at).toLocaleTimeString()}</td>
                                                    <td className="px-4 py-3 text-cyan-400">{log.trigger_reason}</td>
                                                    <td className="px-4 py-3 font-bold text-white">{log.executed_pair}</td>
                                                    <td className={`px-4 py-3 font-bold ${log.side === 'buy' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                        {log.side.toUpperCase()}
                                                    </td>
                                                    <td className="px-4 py-3 font-mono">${log.price.toFixed(4)}</td>
                                                    <td className={`px-4 py-3 font-mono ${log.pnl && log.pnl > 0 ? 'text-emerald-400' : log.pnl && log.pnl < 0 ? 'text-rose-400' : 'text-gray-500'}`}>
                                                        {log.pnl ? (log.pnl > 0 ? `+${log.pnl.toFixed(2)}` : log.pnl.toFixed(2)) : '-'}
                                                    </td>
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                        </GlassCard>
                    </div>

                    {/* Right: Execution Configuration Panel */}
                    <div className="col-span-12 lg:col-span-4">
                        <GlassCard className="p-6">
                            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2 pb-4 border-b border-white/5">
                                <Settings size={18} className="text-cyan-400" /> Execution Settings
                            </h3>
                            <div className="space-y-5">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Target Altcoin Pair</label>
                                    <input
                                        type="text"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors"
                                        value={targetPair}
                                        onChange={e => setTargetPair(e.target.value)}
                                        disabled={isRunning || !bot}
                                        placeholder="e.g. SOL/USDT"
                                    />
                                    <p className="text-[10px] text-gray-500 mt-1">Asset that will be traded based on BTC movements.</p>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Trade Size (USDT)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors"
                                        value={tradeSize}
                                        onChange={e => setTradeSize(parseFloat(e.target.value))}
                                        disabled={isRunning || !bot}
                                    />
                                </div>

                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Stop-Loss (%)</label>
                                        <input
                                            type="number" step="0.1"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-rose-500/50 outline-none transition-colors"
                                            value={stopLoss}
                                            onChange={e => setStopLoss(parseFloat(e.target.value))}
                                            disabled={isRunning || !bot}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Take-Profit (%)</label>
                                        <input
                                            type="number" step="0.1"
                                            className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-emerald-500/50 outline-none transition-colors"
                                            value={takeProfit}
                                            onChange={e => setTakeProfit(parseFloat(e.target.value))}
                                            disabled={isRunning || !bot}
                                        />
                                    </div>
                                </div>

                                <div className="p-4 bg-white/5 rounded-xl border border-white/10 mt-4">
                                    <h4 className="text-xs font-bold text-white mb-2">Strategy Summary</h4>
                                    <ul className="text-xs text-gray-400 space-y-2">
                                        <li className="flex justify-between"><span>Watch:</span> <span className="text-cyan-400">BTC/USDT ({timeframe})</span></li>
                                        <li className="flex justify-between"><span>Trigger:</span> <span>{indicators}</span></li>
                                        <li className="flex justify-between"><span>Execute on:</span> <span className="font-bold text-white">{targetPair}</span></li>
                                        <li className="flex justify-between"><span>Position:</span> <span>${tradeSize}</span></li>
                                    </ul>
                                </div>
                            </div>
                        </GlassCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LeadLagBot;
