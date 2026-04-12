import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, Activity, Zap, Layers, RefreshCw, ChevronDown, Plus } from 'lucide-react';
import { createChart, ColorType, IChartApi, ISeriesApi, CandlestickSeries, Time } from 'lightweight-charts';
import api from '../../services/api';
import toast from 'react-hot-toast';
import { useMarketStore } from '@/store/marketStore';

// Reusable Components
const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`backdrop-blur-md bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden ${className}`}>
        {children}
    </div>
);

interface GridOrder {
    id: number;
    price: number;
    side: 'buy' | 'sell';
    status: string;
}

interface BotSummary {
    id: number;
    pair: string;
    is_active: boolean;
    paper_balance_current?: number;
    paper_balance_initial?: number;
    is_paper_trading: boolean;
    total_profit: number;
    exchange: string;
    api_key_id?: number;
    lower_limit: number;
    upper_limit: number;
    grid_count: number;
    amount_per_grid: number;
    orders?: GridOrder[];
}

interface ApiKey {
    id: number;
    name: string;
    exchange: string;
}

const GridBot = () => {
    // --- State ---
    const [bots, setBots] = useState<BotSummary[]>([]);
    const [selectedBotId, setSelectedBotId] = useState<number | null>(null);
    const [isRunning, setIsRunning] = useState(false);

    // Config
    const { globalExchange: exchange, setGlobalExchange: setExchange, globalSymbol: pair, setGlobalSymbol: setPair, globalInterval: timeframe, setGlobalInterval: setTimeframe } = useMarketStore();
    const [lowerLimit, setLowerLimit] = useState(90000);
    const [upperLimit, setUpperLimit] = useState(100000);
    const [gridCount, setGridCount] = useState(10);
    const [amountPerGrid, setAmountPerGrid] = useState(100);
    const [isPaperTrading, setIsPaperTrading] = useState(true);
    const [paperBalance, setPaperBalance] = useState(10000);
    const [paperBalanceInit, setPaperBalanceInit] = useState(10000);

    // Stats
    const [roi, setRoi] = useState(0.0);

    // Live Data
    const [currentPrice, setCurrentPrice] = useState<number>(0);
    const [logs, setLogs] = useState<any[]>([]);
    const [activeOrders, setActiveOrders] = useState<GridOrder[]>([]);

    // Dynamic Lists
    const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);
    const [availablePairs, setAvailablePairs] = useState<string[]>([]);
    const [userApiKeys, setUserApiKeys] = useState<ApiKey[]>([]);
    const [apiKeyId, setApiKeyId] = useState<number | undefined>(undefined);

    // Chart Refs
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<IChartApi | null>(null);
    const seriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
    const gridLinesRef = useRef<any[]>([]);

    // 0. Load Initial Data (Bots, Exchanges, API Keys)
    useEffect(() => {
        loadBots();
        loadExchanges();
        loadUserApiKeys();
    }, []);

    // Load available pairs when exchange changes (Only if valid)
    useEffect(() => {
        if (exchange && availableExchanges.includes(exchange)) {
            loadPairs(exchange);
        }
    }, [exchange, availableExchanges]);

    const loadExchanges = async () => {
        try {
            const res = await api.get('/market-data/exchanges');
            if (Array.isArray(res.data)) {
                setAvailableExchanges(res.data.sort());
            }
        } catch (e) {
            console.error("Failed to load exchanges");
        }
    };

    const loadPairs = async (ex: string) => {
        try {
            setAvailablePairs([]); // clear params
            const res = await api.get(`/market-data/markets/${ex}`);
            if (Array.isArray(res.data)) {
                setAvailablePairs(res.data.sort());
            }
        } catch (e) {
            console.error("Failed to load pairs");
        }
    };

    const loadUserApiKeys = async () => {
        try {
            const res = await api.get('/users/api-keys');
            setUserApiKeys(res.data);
        } catch (e) {
            console.error("Failed to load API keys");
        }
    };

    const loadBots = async () => {
        try {
            const res = await api.get('/grid-bot/');
            setBots(res.data);
            if (res.data.length > 0 && !selectedBotId) {
                // Auto-select first bot if none selected
                handleSelectBot(res.data[0].id);
            }
        } catch (e) {
            toast.error("Failed to load bots");
        }
    };

    const handleSelectBot = async (id: number) => {
        setSelectedBotId(id);
        setLogs([]); // Clear logs when switching
        try {
            const res = await api.get(`/grid-bot/${id}`);
            const bot = res.data;
            setPair(bot.pair);
            setDebouncedPair(bot.pair); // Bypass debounce for instant switch
            setCurrentPrice(0); // Reset price display

            console.log(`[GridBot] Switched to ${bot.pair} (${bot.exchange})`);

            // Clear Chart immediately to show loading state
            if (seriesRef.current) {
                seriesRef.current.setData([]);
            }

            setExchange(bot.exchange || 'binance'); // default
            setLowerLimit(bot.lower_limit);
            setUpperLimit(bot.upper_limit);
            setGridCount(bot.grid_count);
            setAmountPerGrid(bot.amount_per_grid);
            setIsPaperTrading(bot.is_paper_trading);
            setApiKeyId(bot.api_key_id);
            setIsRunning(bot.is_active);

            if (bot.paper_balance_current !== undefined) {
                setPaperBalance(bot.paper_balance_current);
                setPaperBalanceInit(bot.paper_balance_initial || 10000);
            }

            // Calculate ROI (approx for paper)
            if (bot.is_paper_trading && bot.paper_balance_initial) {
                const profit = bot.paper_balance_current - bot.paper_balance_initial; // Rough: not including asset value changes
                const roiVal = (profit / bot.paper_balance_initial) * 100;
                setRoi(roiVal);
            }

            // If the API returns orders, use them. Need to check API response structure.
            if (bot.orders) {
                setActiveOrders(bot.orders);
            } else {
                setActiveOrders([]);
            }
        } catch (e) {
            toast.error("Failed to load bot details");
        }
    };

    // 1. Initialize Chart
    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: { background: { type: ColorType.Solid, color: 'transparent' }, textColor: '#DDD' },
            grid: { vertLines: { color: '#334155' }, horzLines: { color: '#334155' } },
            width: chartContainerRef.current.clientWidth,
            height: 450,
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

        const handleResize = () => chart.applyOptions({ width: chartContainerRef.current?.clientWidth || 0 });
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            chart.remove();
        };
    }, []); // Only run once on mount

    // Debounced Pair State
    const [debouncedPair, setDebouncedPair] = useState(pair);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedPair(pair);
        }, 800); // 800ms debounce

        return () => {
            clearTimeout(handler);
        };
    }, [pair]);

    // 2. Fetch Real Market Data + WebSocket Integration
    useEffect(() => {
        // Only fetch if pair exists AND exchange is valid
        if (!debouncedPair || !seriesRef.current || !availableExchanges.includes(exchange) || !debouncedPair.includes('/')) return;

        let ws: WebSocket | null = null;
        let aborted = false;

        const fetchHistoryAndConnectWS = async () => {
            try {
                // 1. Initial Load (Snapshot)
                const res = await api.get('/market-data/klines', {
                    params: { symbol: debouncedPair, interval: timeframe, limit: 500, exchange: exchange }
                });

                if (aborted) return;

                const candles = res.data.map((k: any) => ({
                    time: k[0] / 1000 as Time,
                    open: parseFloat(k[1]),
                    high: parseFloat(k[2]),
                    low: parseFloat(k[3]),
                    close: parseFloat(k[4]),
                }));

                if (seriesRef.current && !aborted) {
                    seriesRef.current.setData(candles);
                    if (candles.length > 0) {
                        setCurrentPrice(candles[candles.length - 1].close);
                    }
                }

                // 2. Connect WebSocket for Live Updates
                if (aborted) return;

                const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
                const host = window.location.host;
                const wsUrl = `${protocol}//${host}/api/v1/market-data/ws/candle?symbol=${debouncedPair}&interval=${timeframe}&exchange=${exchange}`;

                ws = new WebSocket(wsUrl);

                ws.onopen = () => {
                    if (aborted) {
                        ws?.close();
                        return;
                    }
                    console.log("Connected to Market Data WS");
                };

                ws.onmessage = (event) => {
                    if (aborted) return;
                    try {
                        const data = JSON.parse(event.data);
                        // Update Chart
                        const candle = {
                            time: data.time / 1000 as Time,
                            open: data.open,
                            high: data.high,
                            low: data.low,
                            close: data.close,
                        };
                        seriesRef.current?.update(candle);
                        setCurrentPrice(data.close);
                    } catch (err) {
                        console.error("WS Parse Error", err);
                    }
                };

                ws.onerror = (err) => {
                    console.error("WS Error", err);
                };

            } catch (e) {
                if (!aborted) console.error("Failed to fetch market data", e);
            }
        };

        fetchHistoryAndConnectWS();

        return () => {
            aborted = true;
            if (ws) ws.close();
        };
    }, [debouncedPair, exchange, availableExchanges, timeframe]); // Re-fetch on params change

    // 3. Draw Grid Lines
    useEffect(() => {
        if (!seriesRef.current || !chartRef.current) return;

        // Cleanup old lines
        gridLinesRef.current.forEach(line => seriesRef.current?.removePriceLine(line));
        gridLinesRef.current = [];

        // Logic: specific orders VS calculated grids
        if (isRunning && activeOrders.length > 0) {
            // Visualize REAL active orders
            activeOrders.forEach(order => {
                const color = order.side === 'buy' ? '#10B981' : '#F43F5E'; // Green buy, Red sell
                const line = seriesRef.current?.createPriceLine({
                    price: order.price,
                    color: color,
                    lineWidth: 2,
                    lineStyle: 0, // Solid
                    axisLabelVisible: true,
                    title: `${order.side.toUpperCase()} GRID`,
                });
                if (line) gridLinesRef.current.push(line);
            });
        } else {
            // Visualize THEORETICAL grids (Preview)
            // Only draw if config is valid
            if (upperLimit <= lowerLimit || gridCount < 2) return;

            const step = (upperLimit - lowerLimit) / gridCount;
            for (let i = 0; i <= gridCount; i++) {
                const price = lowerLimit + (i * step);
                const line = seriesRef.current?.createPriceLine({
                    price: price,
                    color: 'rgba(34, 211, 238, 0.5)', // Cyan dashed
                    lineWidth: 1,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: `Grid ${i + 1}`,
                });
                if (line) gridLinesRef.current.push(line);
            }
        }

    }, [lowerLimit, upperLimit, gridCount, activeOrders, isRunning]);


    const validateConfig = () => {
        if (upperLimit <= lowerLimit) {
            toast.error("Upper Limit must be greater than Lower Limit");
            return false;
        }
        if (gridCount < 2 || gridCount > 100) {
            toast.error("Grid Count must be between 2 and 100");
            return false;
        }
        if (amountPerGrid < 10) { // Specific validation rule
            toast.error("Amount per Grid must be at least $10 (Exchange Minimum)");
            return false;
        }
        return true;
    };

    const handleCreateOrUpdate = async () => {
        if (!validateConfig()) return null;

        if (!isPaperTrading && !apiKeyId) {
            toast.error("Please select an API Key for Real Trading");
            return false;
        }

        const payload = {
            pair,
            exchange,
            lower_limit: lowerLimit,
            upper_limit: upperLimit,
            grid_count: gridCount,
            amount_per_grid: amountPerGrid,
            is_paper_trading: isPaperTrading,
            paper_balance_initial: isPaperTrading ? paperBalanceInit : 0,
            api_key_id: isPaperTrading ? null : apiKeyId
        };
        try {
            if (!selectedBotId) {
                const res = await api.post('/grid-bot/', payload);
                const newBotId = res.data.id;
                await loadBots(); // refresh list
                handleSelectBot(newBotId); // Select the new bot
                toast.success("Bot Created!");
                return newBotId;
            } else {
                await api.put(`/grid-bot/${selectedBotId}`, payload);
                toast.success("Settings updated!");
                await loadBots(); // Refresh to show new limits/status
                return selectedBotId;
            }
        } catch (e) {
            toast.error("Failed to save bot");
            return null;
        }
    };

    const handleStart = async () => {
        let id = selectedBotId;
        if (!id) {
            const newId = await handleCreateOrUpdate();
            if (!newId) return;
            id = newId;
        } else {
            // Validate before starting existing bot too? 
            if (!validateConfig()) return;
        }

        try {
            await api.post(`/grid-bot/${id}/start`);
            // Optimistically update
            setIsRunning(true);
            toast.success("Grid Bot Started!");

            // Re-fetch to sync state
            handleSelectBot(id);
        } catch (e: any) {
            toast.error(e.response?.data?.message || "Failed to start");
        }
    };

    const handleStop = async () => {
        if (!selectedBotId) return;
        try {
            await api.post(`/grid-bot/${selectedBotId}/stop`);
            setIsRunning(false);
            toast.success("Grid Bot Stopped");
            await loadBots(); // Update status in list
        } catch (e) {
            toast.error("Failed to stop");
        }
    };

    const handlePanicSell = async () => {
        if (!selectedBotId) return;
        const confirm = window.confirm("🚨 EMERGENCY EXIT 🚨\n\nAre you sure you want to STOP the bot, CANCEL all open orders, and MARKET SELL all positions?\n\nThis cannot be undone.");
        if (!confirm) return;

        try {
            toast.loading("Executing Panic Sell...", { id: "panic" });
            const res = await api.post(`/grid-bot/${selectedBotId}/panic-sell`);
            setIsRunning(false);
            toast.dismiss("panic");
            toast.success(res.data.message || "Panic Sell Executed", { duration: 5000, icon: '🚨' });
            await loadBots();
        } catch (e: any) {
            toast.dismiss("panic");
            toast.error(e.response?.data?.detail || "Panic Sell Failed");
        }
    };

    const handleResetPaper = async () => {
        if (!selectedBotId) return;
        if (!confirm("Start fresh? This resets your virtual wallet.")) return;
        try {
            await api.post(`/grid-bot/${selectedBotId}/reset-paper?amount=${paperBalanceInit}`);
            toast.success("Simulation Reset");
            handleSelectBot(selectedBotId); // Refresh
        } catch (e) {
            toast.error("Failed to reset");
        }
    };

    // 4. WebSocket Logs
    useEffect(() => {
        if (!selectedBotId) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host;
        // Connect to Bot Logs WS
        const wsUrl = `${protocol}//${host}/api/v1/grid-bot/ws/logs/${selectedBotId}`;
        const token = localStorage.getItem('accessToken');
        const url = token ? `${wsUrl}?token=${token}` : wsUrl;

        let ws: WebSocket | null = null;
        try {
            ws = new WebSocket(url);
            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    setLogs(prev => [data, ...prev].slice(0, 50));
                } catch (e) { }
            };
        } catch (e) {
            console.error("WS Connection failed", e);
        }

        return () => {
            if (ws) ws.close();
        };
    }, [selectedBotId]);


    const handleCreateNew = () => {
        setSelectedBotId(null);
        setPair('BTC/USDT');
        setExchange('binance');
        setLowerLimit(90000);
        setUpperLimit(100000);
        setGridCount(10);
        setAmountPerGrid(100);
        setIsPaperTrading(true);
        setApiKeyId(undefined);
        setIsRunning(false);
        setActiveOrders([]);
        setPaperBalance(10000);
        setPaperBalanceInit(10000);
        setRoi(0);
        if (seriesRef.current) seriesRef.current.setData([]);
        setLogs([]);
    };

    return (
        <div className="flex flex-col h-[calc(100vh-100px)] gap-6 staggered-fade-in pb-4">
            {/* TOP BAR: Bot List & Tools */}
            <div className="w-full flex-shrink-0">
                <GlassCard className="p-4 flex flex-col">
                    <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                        <h3 className="font-bold text-white flex items-center gap-2">
                            <Layers className="text-cyan-400" size={20} /> My Bots
                        </h3>
                        <span className="text-xs font-mono text-gray-400 bg-white/5 px-2 py-1 rounded-lg">
                            {bots.length} Active
                        </span>
                    </div>

                    <div className="flex gap-4 overflow-x-auto pb-2 custom-scrollbar">
                        <button
                            onClick={handleCreateNew}
                            className={`min-w-[200px] h-[80px] px-4 rounded-xl flex flex-col items-center justify-center gap-2 font-bold transition-all ${!selectedBotId ? 'bg-cyan-500 text-black shadow-[0_0_20px_rgba(6,182,212,0.5)]' : 'bg-white/5 text-gray-300 hover:bg-white/10 hover:text-white border border-white/5'}`}
                        >
                            <Plus size={24} />
                            <span>New Strategy</span>
                        </button>

                        {bots.map(bot => (
                            <div
                                key={bot.id}
                                onClick={() => handleSelectBot(bot.id)}
                                className={`min-w-[220px] h-[80px] p-3 rounded-xl border cursor-pointer transition-all group relative ${selectedBotId === bot.id ? 'bg-white/10 border-cyan-500/50 shadow-lg' : 'bg-black/20 border-white/5 hover:border-white/10 hover:bg-white/5'}`}
                            >
                                <div className="flex justify-between items-start mb-1">
                                    <h4 className="font-bold text-white">{bot.pair}</h4>
                                    <div className={`w-2 h-2 rounded-full ${bot.is_active ? 'bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.5)]' : 'bg-gray-600'}`}></div>
                                </div>
                                <div className="flex justify-between items-center text-xs mt-2">
                                    <span className="text-gray-400 uppercase tracking-wider">{bot.exchange}</span>
                                    <span className={`font-mono ${(bot.total_profit || 0) >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        ${(bot.total_profit || 0).toFixed(2)}
                                    </span>
                                </div>
                                {bot.is_paper_trading && (
                                    <div className="absolute top-2 right-4 text-[8px] bg-amber-500/10 text-amber-500 border border-amber-500/20 px-1.5 py-0.5 rounded">
                                        SIM
                                    </div>
                                )}
                            </div>
                        ))}

                        {bots.length === 0 && (
                            <div className="flex items-center text-gray-500 px-4 text-sm whitespace-nowrap">
                                No bots created yet. Click New Strategy to start.
                            </div>
                        )}
                    </div>
                </GlassCard>
            </div>

            {/* RIGHT MAIN CONTENT */}
            <div className="flex-1 flex flex-col min-w-0 overflow-y-auto custom-scrollbar pr-2">
                {/* Header */}
                <div className="flex justify-between items-end gap-4 mb-6">
                    <div>
                        <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 flex items-center gap-3">
                            {selectedBotId ? `Bot #${selectedBotId}` : 'New Strategy'}
                            {selectedBotId && isRunning && <span className="text-emerald-500 animate-pulse text-sm font-mono bg-emerald-500/10 px-2 py-1 rounded border border-emerald-500/20">RUNNING</span>}
                        </h1>
                        <p className="text-gray-400 text-sm mt-1 font-light">
                            {selectedBotId ? `Managing ${pair} on ${exchange}` : 'Configure and deploy a new grid trading bot'}
                        </p>
                    </div>
                </div>

                {/* Two Column Grid for Controls + Chart */}
                <div className="grid grid-cols-12 gap-6 pb-10">

                    {/* Left: Configuration Form */}
                    <div className="col-span-12 lg:col-span-4 space-y-6">
                        <GlassCard className="p-6">
                            <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2 pb-4 border-b border-white/5">
                                <Settings size={18} className="text-cyan-400" /> Parameters
                            </h3>
                            <div className="space-y-4">
                                <div>
                                    <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Exchange</label>
                                    <input
                                        list="exchanges-list"
                                        className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors mb-4"
                                        value={exchange}
                                        onChange={e => setExchange(e.target.value)}
                                        disabled={isRunning}
                                        placeholder="Type to search..."
                                    />
                                    <datalist id="exchanges-list">
                                        {availableExchanges.map(ex => (
                                            <option key={ex} value={ex} />
                                        ))}
                                    </datalist>

                                    <div className="grid grid-cols-3 gap-2 mb-4">
                                        <div className="col-span-2">
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Pair</label>
                                            <input
                                                list="pairs-list"
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors"
                                                value={pair}
                                                onChange={e => setPair(e.target.value)}
                                                disabled={isRunning}
                                                placeholder="e.g. BTC/USDT"
                                            />
                                            <datalist id="pairs-list">
                                                {availablePairs.map(p => (
                                                    <option key={p} value={p} />
                                                ))}
                                            </datalist>
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Timeframe</label>
                                            <select
                                                className="w-full bg-black/40 border border-white/10 rounded-xl px-2 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors text-center"
                                                value={timeframe}
                                                onChange={e => setTimeframe(e.target.value)}
                                                disabled={isRunning}
                                            >
                                                {['1m', '5m', '15m', '1h', '4h', '1d', '1w'].map(tf => (
                                                    <option key={tf} value={tf}>{tf}</option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Lower Limit</label>
                                        <input type="number" step="any" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors"
                                            value={lowerLimit} onChange={e => setLowerLimit(parseFloat(e.target.value))} disabled={isRunning} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Upper Limit</label>
                                        <input type="number" step="any" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors"
                                            value={upperLimit} onChange={e => setUpperLimit(parseFloat(e.target.value))} disabled={isRunning} />
                                    </div>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Grids</label>
                                        <input type="number" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors"
                                            value={gridCount} onChange={e => setGridCount(parseInt(e.target.value))} disabled={isRunning} />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2">Amount</label>
                                        <input type="number" step="any" className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-cyan-500/50 outline-none transition-colors"
                                            value={amountPerGrid} onChange={e => setAmountPerGrid(parseFloat(e.target.value))} disabled={isRunning} />
                                    </div>
                                </div>

                                <div className="pt-4 border-t border-white/5">
                                    <div className="flex items-center justify-between mb-4">
                                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider">Trading Mode</label>
                                        <div className="flex bg-black/40 p-1 rounded-lg border border-white/10">
                                            <button
                                                onClick={() => setIsPaperTrading(true)}
                                                disabled={isRunning}
                                                className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${isPaperTrading ? 'bg-amber-500 text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                            >
                                                PAPER
                                            </button>
                                            <button
                                                onClick={() => setIsPaperTrading(false)}
                                                disabled={isRunning}
                                                className={`px-3 py-1.5 rounded-md text-[10px] font-bold transition-all ${!isPaperTrading ? 'bg-emerald-500 text-black shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                            >
                                                REAL
                                            </button>
                                        </div>
                                    </div>

                                    {isPaperTrading && (
                                        <div className="space-y-2">
                                            <div className="flex justify-between items-center text-xs">
                                                <span className="text-gray-400">Balance:</span>
                                                <span className="text-white font-mono flex items-center gap-2">
                                                    ${paperBalance.toFixed(2)}
                                                    {selectedBotId && (
                                                        <button onClick={handleResetPaper} className="hover:text-cyan-400 transition-colors">
                                                            <RefreshCw size={12} />
                                                        </button>
                                                    )}
                                                </span>
                                            </div>
                                            {selectedBotId && (
                                                <div className={`p-2 rounded text-center text-xs font-bold border ${roi >= 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                                                    ROI: {roi >= 0 ? '+' : ''}{roi.toFixed(2)}%
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {!isPaperTrading && (
                                        <div className="space-y-4 pt-2">
                                            <label className="block text-[10px] font-bold text-amber-500 uppercase tracking-wider mb-2">
                                                Select API Key (Required)
                                            </label>
                                            {userApiKeys.filter(k => k.exchange.toLowerCase() === exchange.toLowerCase()).length === 0 ? (
                                                <div className="text-xs text-rose-400 bg-rose-900/10 p-2 rounded border border-rose-500/20">
                                                    No Keys for {exchange}
                                                </div>
                                            ) : (
                                                <select
                                                    className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:border-amber-500/50 outline-none"
                                                    value={apiKeyId || ''}
                                                    onChange={e => setApiKeyId(parseInt(e.target.value))}
                                                    disabled={isRunning}
                                                >
                                                    <option value="">-- Select Key --</option>
                                                    {userApiKeys
                                                        .filter(k => k.exchange.toLowerCase() === exchange.toLowerCase())
                                                        .map(k => (
                                                            <option key={k.id} value={k.id}>{k.name || k.id}</option>
                                                        ))
                                                    }
                                                </select>
                                            )}
                                        </div>
                                    )}
                                </div>

                                <div className="pt-4">
                                    {!isRunning ? (
                                        <button
                                            onClick={handleStart}
                                            className="w-full bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-black font-bold py-4 rounded-xl shadow-[0_0_30px_rgba(16,185,129,0.3)] hover:shadow-[0_0_50px_rgba(16,185,129,0.5)] transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Play size={16} fill="currentColor" /> {selectedBotId ? 'UPDATE & START' : 'DEPLOY BOT'}
                                        </button>
                                    ) : (
                                        <button
                                            onClick={handleStop}
                                            className="w-full bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white font-bold py-4 rounded-xl shadow-[0_0_30px_rgba(244,63,94,0.3)] hover:shadow-[0_0_50px_rgba(244,63,94,0.5)] transition-all flex items-center justify-center gap-2 text-sm"
                                        >
                                            <Square size={16} fill="currentColor" /> STOP BOT
                                        </button>
                                    )}
                                </div>
                            </div>
                        </GlassCard>
                    </div>

                    {/* Right: Chart & Logs */}
                    <div className="col-span-12 lg:col-span-8 flex flex-col gap-6">
                        {/* Chart */}
                        <GlassCard className="p-1 h-[500px] relative group">
                            <div ref={chartContainerRef} className="w-full h-full rounded-2xl overflow-hidden" />
                            {/* Stats Overlay on Chart */}
                            <div className="absolute top-4 left-4 flex gap-4 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-300">
                                <div className="px-4 py-2 bg-black/60 backdrop-blur rounded-lg border border-white/10">
                                    <div className="text-[10px] text-gray-400 uppercase tracking-widest">Price</div>
                                    <div className="text-xl font-bold font-mono text-white">${currentPrice.toFixed(2)}</div>
                                </div>
                            </div>
                            {isRunning && (
                                <div className="absolute top-4 right-4 pointer-events-auto">
                                    <button onClick={handlePanicSell} className="h-8 px-3 rounded-lg bg-orange-600/20 hover:bg-orange-600 text-orange-500 hover:text-white border border-orange-500/30 font-bold text-[10px] flex items-center gap-2 transition-all">
                                        <Zap size={12} fill="currentColor" /> PANIC
                                    </button>
                                </div>
                            )}
                        </GlassCard>

                        {/* Logs */}
                        <GlassCard className="p-6 flex-1 min-h-[250px] flex flex-col">
                            <h3 className="text-xs font-bold text-white mb-4 flex items-center gap-2 uppercase tracking-wider">
                                <Activity size={16} className="text-cyan-400" /> Activity Log
                            </h3>
                            <div className="flex-1 overflow-y-auto space-y-2 max-h-[200px] custom-scrollbar pr-2 font-mono text-xs">
                                {logs.length === 0 ? (
                                    <div className="text-gray-600 italic">No activity recorded yet...</div>
                                ) : (
                                    logs.map((log, i) => (
                                        <div key={i} className={`p-2 rounded border ${log.type === 'error' ? 'bg-rose-500/10 border-rose-500/20 text-rose-300' :
                                            log.type === 'success' ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' :
                                                log.type === 'warning' ? 'bg-amber-500/10 border-amber-500/20 text-amber-300' :
                                                    'bg-white/5 border-white/5 text-gray-300'
                                            }`}>
                                            <span className="opacity-50 mr-2">[{log.timestamp}]</span>
                                            {log.message}
                                        </div>
                                    ))
                                )}
                            </div>
                        </GlassCard>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default GridBot;
