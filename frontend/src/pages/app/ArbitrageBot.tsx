/**
 * File: frontend/src/pages/app/ArbitrageBot.tsx
 * Description: Main interface for the Arbitrage Bot Core Engine with Real API & WebSocket Integration
 * Refactored for Live Trading
 */

import React, { useState, useEffect, useRef } from 'react';
import { Play, Square, Settings, RefreshCw, Terminal, Activity, Zap, Key, AlertTriangle, TrendingUp, Monitor, Check, ChevronsUpDown } from 'lucide-react';
import { Combobox, ComboboxInput, ComboboxButton, ComboboxOptions, ComboboxOption } from '@headlessui/react';
import api from '../../services/api';
import { useMarketStore } from '@/store/marketStore';

interface LogEntry {
    id: number;
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

interface ApiKey {
    id: number;
    name: string;
    exchange: string;
    is_enabled: boolean;
}

// Reusable Glass Card Component
const GlassCard: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div className={`backdrop-blur-md bg-slate-900/50 border border-white/5 rounded-3xl overflow-hidden ${className}`}>
        {children}
    </div>
);

const ArbitrageBot = () => {
    // --- State Management ---
    const [isRunning, setIsRunning] = useState(false);
    const [strategy, setStrategy] = useState('Spatial Arbitrage');

    // Dynamic Data State
    const [availableApiKeys, setAvailableApiKeys] = useState<ApiKey[]>([]);
    const [apiProfiles, setApiProfiles] = useState<Record<string, string[]>>({}); // { Exchange: [Label1, Label2] }
    const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);
    const [availablePairs, setAvailablePairs] = useState<string[]>(['BTC/USDT', 'ETH/USDT']); // Default fallback

    // Selection State
    const { globalExchange: exchangeA, setGlobalExchange: setExchangeA, globalSymbol: pair, setGlobalSymbol: setPair } = useMarketStore();
    const [apiKeyA, setApiKeyA] = useState('');

    const [exchangeB, setExchangeB] = useState('');
    const [apiKeyB, setApiKeyB] = useState('');
    const [mode, setMode] = useState<'auto' | 'manual'>('manual');
    const [isPaperTrading, setIsPaperTrading] = useState(true);
    const [autoBalance, setAutoBalance] = useState(false);
    const [spread, setSpread] = useState<number>(0);
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [query, setQuery] = useState('');

    // Calculator State
    const [feeExA, setFeeExA] = useState<number>(0.1);
    const [feeExB, setFeeExB] = useState<number>(0.1);
    const [minSpread, setMinSpread] = useState<number>(0.5);
    const [tradeSize, setTradeSize] = useState<number>(100);
    const [trailingStop, setTrailingStop] = useState<number>(2.5); // Default 2.5%
    const [isTrailingStopEnabled, setIsTrailingStopEnabled] = useState(false);
    const [sorThreshold, setSorThreshold] = useState<number>(1000.0); // Smart Order Routing Threshold
    const [isSorEnabled, setIsSorEnabled] = useState<boolean>(false);

    // Calculation Logic
    const totalFees = feeExA + feeExB;
    const estNetSpread = minSpread - totalFees;
    const estProfit = tradeSize * (estNetSpread / 100);
    const isProfitable = estNetSpread > 0;

    const filteredPairs =
        query === ''
            ? availablePairs
            : availablePairs.filter((p) => {
                return p.toLowerCase().includes(query.toLowerCase())
            })

    const logsEndRef = useRef<HTMLDivElement>(null);
    const wsRef = useRef<WebSocket | null>(null);

    // 1. Fetch User's API Keys & Exchanges on Mount
    useEffect(() => {
        const fetchKeys = async () => {
            try {
                // Fetch keys from backend
                const response = await api.get<ApiKey[]>('/users/api-keys');
                const keys = response.data;
                setAvailableApiKeys(keys);

                // Group by Exchange
                const profiles: Record<string, string[]> = {};
                const exchangesSet = new Set<string>();

                keys.forEach(k => {
                    if (k.is_enabled) {
                        exchangesSet.add(k.exchange);
                        if (!profiles[k.exchange]) profiles[k.exchange] = [];
                        profiles[k.exchange].push(k.name);
                    }
                });

                const exchangeList = Array.from(exchangesSet);
                setAvailableExchanges(exchangeList);
                setApiProfiles(profiles);

                // Set Defaults if available
                if (exchangeList.length > 0) {
                    setExchangeA(exchangeList[0]);
                    if (exchangeList.length > 1) setExchangeB(exchangeList[1]);
                    else setExchangeB(exchangeList[0]);
                }

            } catch (err) {
                console.error("Failed to fetch API keys", err);
                addLog("Failed to fetch API keys. Ensure backend is running.", 'error');
            }
        };
        fetchKeys();
    }, []);

    // 2. Fetch Common Pairs when Exchange A or B changes
    useEffect(() => {
        const fetchPairs = async () => {
            if (!exchangeA) return;

            try {
                let endpoint = '';
                if (exchangeA && exchangeB && exchangeA !== exchangeB) {
                    // Fetch intersection
                    endpoint = `/market-data/common-pairs?exchange_a=${exchangeA.toLowerCase()}&exchange_b=${exchangeB.toLowerCase()}`;
                } else {
                    // Fallback to Exchange A only
                    endpoint = `/market-data/markets/${exchangeA.toLowerCase()}`;
                }

                const response = await api.get<string[]>(endpoint);

                if (response.data && response.data.length > 0) {
                    // Filter for USDT pairs usually preferred but let's keep it broad or prioritize
                    const pairs = response.data;

                    // Optional: Prioritize USDT pairs
                    const usdtPairs = pairs.filter(p => p.endsWith('/USDT') || p.endsWith('/USD'));
                    const otherPairs = pairs.filter(p => !usdtPairs.includes(p));
                    const finalPairs = [...usdtPairs, ...otherPairs];

                    setAvailablePairs(finalPairs);

                    // Reset selection if current pair is not in list
                    if (!finalPairs.includes(pair) && finalPairs.length > 0) {
                        setPair(finalPairs[0]);
                    }
                } else {
                    setAvailablePairs(['BTC/USDT', 'ETH/USDT']); // Fallback
                }
            } catch (err) {
                console.warn("Failed to fetch pairs", err);
                // Fallback to static if fetch fails
                setAvailablePairs(['BTC/USDT', 'ETH/USDT']);
            }
        };
        fetchPairs();
    }, [exchangeA, exchangeB]);


    // 3. Update API Key Options when Exchange Selection Changes
    useEffect(() => {
        const keysForA = apiProfiles[exchangeA] || [];
        if (keysForA.length > 0) setApiKeyA(keysForA[0]);
        else setApiKeyA('');
    }, [exchangeA, apiProfiles]);

    useEffect(() => {
        const keysForB = apiProfiles[exchangeB] || [];
        if (keysForB.length > 0) setApiKeyB(keysForB[0]);
        else setApiKeyB('');
    }, [exchangeB, apiProfiles]);


    // 4. WebSocket Integration
    useEffect(() => {
        // Construct WS URL relative to current host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.hostname}:8000/api/v1/arbitrage/ws/logs`;
        // NOTE: Port 8000 is typical for backend dev. Adjust if using proxy.

        const connectWs = () => {
            const token = localStorage.getItem('accessToken');
            const wsUrlWithToken = token ? `${wsUrl}?token=${token}` : wsUrl;
            wsRef.current = new WebSocket(wsUrlWithToken);

            wsRef.current.onopen = () => {
                // console.log("WS Connected");
            };

            wsRef.current.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data); // Expecting { message, type }

                    // Add to log
                    if (data.message) {
                        addLog(data.message, data.type || 'info');

                        // Naive parsing for visual spread updates
                        if (data.message.includes('Spread:')) {
                            const match = data.message.match(/Spread:\s*([\d.]+)%/);
                            if (match) setSpread(parseFloat(match[1]));
                        }
                    }
                } catch (e) {
                    // Fallback for plain text
                    addLog(event.data, 'info');
                }
            };

            wsRef.current.onclose = () => {
                // Auto-reconnect logic could go here
            };
        };

        connectWs();

        return () => {
            if (wsRef.current) wsRef.current.close();
        };
    }, []);

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollTop = logsEndRef.current.scrollHeight;
        }
    }, [logs]);

    const addLog = (message: string, type: 'info' | 'success' | 'warning' | 'error' = 'info') => {
        const newLog: LogEntry = {
            id: Date.now(),
            timestamp: new Date().toLocaleTimeString(),
            message,
            type
        };
        setLogs(prev => {
            const updated = [...prev, newLog];
            return updated.slice(-100); // Keep last 100 logs
        });
    };

    // 5. Handle Start - Real API Call
    const handleStart = async () => {
        if (!apiKeyA || !apiKeyB) {
            addLog('Error: Please select valid API keys for both exchanges.', 'error');
            return;
        }
        if (exchangeA === exchangeB) {
            addLog('Warning: Source and Target exchanges are the same.', 'warning');
        }

        const payload = {
            strategy,
            pair,
            exchange_a: exchangeA,
            api_key_a_label: apiKeyA,
            exchange_b: exchangeB,
            api_key_b_label: apiKeyB,
            mode,
            is_paper_trading: isPaperTrading,
            auto_balance: autoBalance,
            min_spread: minSpread,
            trade_amount: tradeSize,
            trailing_stop_percentage: isTrailingStopEnabled ? trailingStop : 0.0,
            sor_threshold: sorThreshold,
            sor_enabled: isSorEnabled
        };

        addLog(`Initializing Engine... Mode: ${isPaperTrading ? "🧪 PAPER" : "⚡ REAL MONEY"}`, 'info');

        try {
            await api.post('/arbitrage/start', payload);
            setIsRunning(true);
            addLog(`Engine Request Sent Successfully.`, 'success');
        } catch (error: any) {
            console.error(error);
            const msg = error.response?.data?.detail || "Failed to start engine.";
            addLog(`Start Error: ${msg}`, 'error');
            setIsRunning(false);
        }
    };

    // 6. Handle Stop - Real API Call
    const handleStop = async () => {
        try {
            await api.post('/arbitrage/stop');
            setIsRunning(false);
            addLog('Engine Stop Requested.', 'warning');
            setSpread(0);
        } catch (error: any) {
            const msg = error.response?.data?.detail || "Failed to stop engine.";
            addLog(`Stop Error: ${msg}`, 'error');
        }
    };

    const inputClasses = "w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2.5 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all outline-none placeholder-gray-600";
    const labelClasses = "block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2";

    return (
        <div className="space-y-6 staggered-fade-in relative min-h-screen pb-10">
            {/* Background Decor */}
            <div className="fixed inset-0 z-[-1] pointer-events-none">
                <div className="absolute top-[-10%] right-[-5%] w-[30%] h-[30%] rounded-full bg-violet-900/10 blur-[120px]"></div>
                <div className="absolute bottom-[10%] left-[-10%] w-[30%] h-[30%] rounded-full bg-cyan-900/10 blur-[120px]"></div>
            </div>

            {/* --- Header Section --- */}
            <div className="flex flex-col md:flex-row justify-between items-end gap-4 mb-4">
                <div>
                    <h1 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400 flex items-center gap-3">
                        <Zap className="text-cyan-400" size={28} /> Arbitrage Bot Engine
                    </h1>
                    <p className="text-gray-400 text-sm mt-1 font-light">
                        Real-time multi-exchange latency arbitrage & execution system
                    </p>
                </div>

                <div className={`flex items-center gap-4 p-2 rounded-2xl border transition-all duration-300 ${isRunning ? 'bg-emerald-950/20 border-emerald-500/30' : 'bg-slate-900/50 border-white/5'}`}>
                    <div className={`px-4 py-1.5 rounded-xl text-xs font-bold flex items-center gap-2 uppercase tracking-wider ${isRunning ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800 text-slate-500'}`}>
                        <div className={`w-2 h-2 rounded-full ${isRunning ? 'bg-emerald-500 animate-pulse' : 'bg-slate-500'}`}></div>
                        {isRunning ? 'Online' : 'Offline'}
                    </div>
                    {isRunning ? (
                        <button onClick={handleStop} className="h-9 px-4 rounded-xl bg-rose-500/20 hover:bg-rose-500 hover:text-white text-rose-500 border border-rose-500/30 transition-all font-bold text-xs flex items-center gap-2">
                            <Square size={14} fill="currentColor" /> TERMINATE
                        </button>
                    ) : (
                        <button onClick={handleStart} className="h-9 px-4 rounded-xl bg-cyan-500/20 hover:bg-cyan-500 hover:text-black text-cyan-400 border border-cyan-500/30 transition-all font-bold text-xs flex items-center gap-2 shadow-[0_0_15px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)]">
                            <Play size={14} fill="currentColor" /> INITIALIZE
                        </button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-12 gap-6">

                {/* --- Left Column: Configuration --- */}
                <div className="col-span-12 lg:col-span-4 space-y-6">
                    {/* Profit Calculator Card */}
                    <div className={`p-6 rounded-3xl text-white shadow-lg relative overflow-hidden group transition-colors duration-500 ${isProfitable ? 'bg-gradient-to-br from-emerald-600 to-teal-800' : 'bg-gradient-to-br from-rose-600 to-red-800'}`}>
                        <TrendingUp className="absolute right-[-20px] bottom-[-20px] w-32 h-32 text-white/10 group-hover:scale-110 transition-transform duration-500 rotate-[-10deg]" />
                        <div className="relative z-10">
                            <div className="flex justify-between items-start mb-4">
                                <div>
                                    <p className="text-white/70 text-[10px] font-bold uppercase tracking-widest">Est. Profit / Trade</p>
                                    <h2 className="text-3xl font-mono font-bold mt-1">
                                        {isProfitable ? '+' : ''}${estProfit.toFixed(2)}
                                    </h2>
                                </div>
                                <div className="p-2 bg-white/10 rounded-lg backdrop-blur-sm border border-white/10">
                                    <Activity size={20} className="text-white" />
                                </div>
                            </div>
                            <div className="flex items-center gap-3 text-xs text-white/90">
                                <span className={`px-2 py-0.5 rounded font-bold border ${isProfitable ? 'bg-emerald-400/20 text-emerald-100 border-emerald-400/30' : 'bg-rose-400/20 text-rose-100 border-rose-400/30'}`}>
                                    Net: {estNetSpread.toFixed(2)}%
                                </span>
                                <span className="opacity-70">(Min Spread - {totalFees.toFixed(2)}% Fees)</span>
                            </div>
                        </div>
                    </div>

                    <GlassCard className="p-6">
                        <h3 className="text-sm font-bold text-white mb-6 flex items-center gap-2 pb-4 border-b border-white/5">
                            <Settings size={18} className="text-cyan-400" /> System Configuration
                        </h3>

                        <div className="space-y-6">
                            {/* Paper Trading Toggle Switch */}
                            <div className="bg-black/20 p-4 rounded-2xl flex items-center justify-between border border-white/5">
                                <div>
                                    <span className={`block text-sm font-bold flex items-center gap-2 ${isPaperTrading ? 'text-violet-400' : 'text-amber-400'}`}>
                                        {isPaperTrading ? '🧪 Paper Mode' : '⚡ Real Trading'}
                                    </span>
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                                        {isPaperTrading ? 'Simulation Only' : 'Live Capital Risk'}
                                    </span>
                                </div>
                                <div
                                    onClick={() => !isRunning && setIsPaperTrading(!isPaperTrading)}
                                    className={`w-12 h-6 rounded-full flex items-center padding-1 cursor-pointer transition-colors ${!isPaperTrading ? 'bg-amber-500' : 'bg-slate-700'}`}
                                >
                                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform mx-1 ${!isPaperTrading ? 'translate-x-6' : ''}`}></div>
                                </div>
                            </div>

                            {/* Auto-Balance Toggle Switch */}
                            <div className="bg-black/20 p-4 rounded-2xl flex items-center justify-between border border-white/5">
                                <div>
                                    <span className={`block text-sm font-bold flex items-center gap-2 ${autoBalance ? 'text-emerald-400' : 'text-gray-400'}`}>
                                        ⚖️ Auto-Balance
                                    </span>
                                    <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                                        Buys 50% assets if missing
                                    </span>
                                </div>
                                <div
                                    onClick={() => !isRunning && setAutoBalance(!autoBalance)}
                                    className={`w-12 h-6 rounded-full flex items-center padding-1 cursor-pointer transition-colors ${autoBalance ? 'bg-emerald-500' : 'bg-slate-700'}`}
                                >
                                    <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform mx-1 ${autoBalance ? 'translate-x-6' : ''}`}></div>
                                </div>
                            </div>

                            {/* Strategy Selection */}
                            <div>
                                <label className={labelClasses}>Strategy Model</label>
                                <select className={inputClasses} value={strategy} onChange={(e) => setStrategy(e.target.value)} disabled={isRunning}>
                                    <option value="Spatial Arbitrage">Spatial Arbitrage</option>
                                    <option value="Triangular Arbitrage">Triangular Arbitrage</option>
                                </select>
                            </div>

                            {/* Min Spread & Trade Size Input */}
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className={labelClasses}>Min Spread %</label>
                                    <div className="relative">
                                        <input type="number" step="0.01" className={inputClasses} value={minSpread} onChange={(e) => setMinSpread(parseFloat(e.target.value))} disabled={isRunning} />
                                        <span className="absolute right-3 top-2.5 text-xs text-gray-500">%</span>
                                    </div>
                                </div>
                                <div>
                                    <label className={labelClasses}>Trade Size $</label>
                                    <div className="relative">
                                        <input type="number" className={inputClasses} value={tradeSize} onChange={(e) => setTradeSize(parseFloat(e.target.value))} disabled={isRunning} />
                                        <span className="absolute right-3 top-2.5 text-xs text-gray-500">$</span>
                                    </div>
                                </div>
                            </div>

                            {/* Trailing Stop Toggle & Input */}
                            <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className={`block text-sm font-bold flex items-center gap-2 ${isTrailingStopEnabled ? 'text-rose-400' : 'text-gray-400'}`}>
                                            🛑 Trailing Stop Loss
                                        </span>
                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                                            Protects profit by selling on drop
                                        </span>
                                    </div>
                                    <div
                                        onClick={() => !isRunning && setIsTrailingStopEnabled(!isTrailingStopEnabled)}
                                        className={`w-12 h-6 rounded-full flex items-center padding-1 cursor-pointer transition-colors ${isTrailingStopEnabled ? 'bg-rose-500' : 'bg-slate-700'}`}
                                    >
                                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform mx-1 ${isTrailingStopEnabled ? 'translate-x-6' : ''}`}></div>
                                    </div>
                                </div>

                                {isTrailingStopEnabled && (
                                    <div className="animate-fade-in-down">
                                        <label className={labelClasses}>Stop Percentage %</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                step="0.1"
                                                className={inputClasses}
                                                value={trailingStop}
                                                onChange={(e) => setTrailingStop(parseFloat(e.target.value))}
                                                disabled={isRunning}
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-gray-500">%</span>
                                        </div>
                                        <p className="text-[9px] text-gray-500 mt-1">Triggers Panic Sell if price drops <strong>{trailingStop}%</strong> from the session high.</p>
                                    </div>
                                )}
                            </div>

                            {/* SOR Configuration */}
                            <div className="bg-black/20 p-4 rounded-2xl border border-white/5 space-y-4">
                                <div className="flex items-center justify-between">
                                    <div>
                                        <span className={`block text-sm font-bold flex items-center gap-2 ${isSorEnabled ? 'text-blue-400' : 'text-gray-400'}`}>
                                            ⚡ Smart Order Routing (SOR)
                                        </span>
                                        <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">
                                            Splits large orders to reduce slippage
                                        </span>
                                    </div>
                                    <div
                                        onClick={() => !isRunning && setIsSorEnabled(!isSorEnabled)}
                                        className={`w-12 h-6 rounded-full flex items-center padding-1 cursor-pointer transition-colors ${isSorEnabled ? 'bg-blue-500' : 'bg-slate-700'}`}
                                    >
                                        <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform mx-1 ${isSorEnabled ? 'translate-x-6' : ''}`}></div>
                                    </div>
                                </div>

                                {isSorEnabled && (
                                    <div className="animate-fade-in-down">
                                        <label className={labelClasses}>Trigger Threshold $</label>
                                        <div className="relative">
                                            <input
                                                type="number"
                                                className={inputClasses}
                                                value={sorThreshold}
                                                onChange={(e) => setSorThreshold(parseFloat(e.target.value))}
                                                disabled={isRunning}
                                            />
                                            <span className="absolute right-3 top-2.5 text-xs text-gray-500">$</span>
                                        </div>
                                        <p className="text-[9px] text-gray-500 mt-1">Orders larger than <strong>${sorThreshold}</strong> will be split into chunks.</p>
                                    </div>
                                )}
                            </div>

                            {/* Fee Configuration */}
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5">
                                <label className="text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-3 block">Exchange Fees (Taker)</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div>
                                        <label className="text-[10px] text-gray-500 block mb-1">Fee A %</label>
                                        <input type="number" step="0.01" className={inputClasses} value={feeExA} onChange={(e) => setFeeExA(parseFloat(e.target.value))} disabled={isRunning} />
                                    </div>
                                    <div>
                                        <label className="text-[10px] text-gray-500 block mb-1">Fee B %</label>
                                        <input type="number" step="0.01" className={inputClasses} value={feeExB} onChange={(e) => setFeeExB(parseFloat(e.target.value))} disabled={isRunning} />
                                    </div>
                                </div>
                            </div>

                            {/* Source Exchange A */}
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 relative group hover:border-blue-500/30 transition-colors">
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3 uppercase tracking-wider">
                                    <span className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_#3b82f6]"></span> Source A (Buy)
                                </label>
                                <div className="space-y-3">
                                    <select className={inputClasses} value={exchangeA} onChange={(e) => setExchangeA(e.target.value)} disabled={isRunning}>
                                        <option value="" disabled>Select Exchange</option>
                                        {availableExchanges.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>

                                    {exchangeA && (
                                        <div className="flex items-center gap-2 bg-black/30 rounded-xl px-3 border border-white/5">
                                            <Key size={14} className="text-gray-500" />
                                            <select className="w-full bg-transparent text-xs py-2 text-gray-400 outline-none border-none cursor-pointer" value={apiKeyA} onChange={(e) => setApiKeyA(e.target.value)} disabled={isRunning}>
                                                <option value="" disabled>Select API Key</option>
                                                {apiProfiles[exchangeA]?.map(label => <option key={label} value={label}>{label}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Target Exchange B */}
                            <div className="p-4 bg-white/5 rounded-2xl border border-white/5 relative group hover:border-purple-500/30 transition-colors">
                                <label className="flex items-center gap-2 text-xs font-bold text-gray-300 mb-3 uppercase tracking-wider">
                                    <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_#a855f7]"></span> Target B (Sell)
                                </label>
                                <div className="space-y-3">
                                    <select className={inputClasses} value={exchangeB} onChange={(e) => setExchangeB(e.target.value)} disabled={isRunning}>
                                        <option value="" disabled>Select Exchange</option>
                                        {availableExchanges.map(e => <option key={e} value={e}>{e}</option>)}
                                    </select>

                                    {exchangeB && (
                                        <div className="flex items-center gap-2 bg-black/30 rounded-xl px-3 border border-white/5">
                                            <Key size={14} className="text-gray-500" />
                                            <select className="w-full bg-transparent text-xs py-2 text-gray-400 outline-none border-none cursor-pointer" value={apiKeyB} onChange={(e) => setApiKeyB(e.target.value)} disabled={isRunning}>
                                                <option value="" disabled>Select API Key</option>
                                                {apiProfiles[exchangeB]?.map(label => <option key={label} value={label}>{label}</option>)}
                                            </select>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Pair Selection */}
                            <div>
                                <label className={labelClasses}>Asset Pair</label>
                                <Combobox value={pair} onChange={(val) => val && setPair(val)} disabled={isRunning}>
                                    <div className="relative mt-1">
                                        <div className="relative w-full cursor-default overflow-hidden rounded-xl bg-black/40 border border-white/10 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-white/75 focus-visible:ring-offset-2 focus-visible:ring-offset-teal-300 sm:text-sm">
                                            <ComboboxInput
                                                className="w-full border-none py-2.5 pl-3 pr-10 text-sm leading-5 text-white bg-transparent focus:ring-0 outline-none placeholder-gray-600"
                                                displayValue={(p: string) => p}
                                                onChange={(event) => setQuery(event.target.value)}
                                                placeholder="Search e.g. BTC/USDT"
                                            />
                                            <ComboboxButton className="absolute inset-y-0 right-0 flex items-center pr-2">
                                                <ChevronsUpDown
                                                    className="h-5 w-5 text-gray-400"
                                                    aria-hidden="true"
                                                />
                                            </ComboboxButton>
                                        </div>
                                        <ComboboxOptions className="absolute mt-1 max-h-60 w-full overflow-auto rounded-md bg-slate-800 py-1 text-base shadow-lg ring-1 ring-black/5 focus:outline-none sm:text-sm z-50">
                                            {filteredPairs.length === 0 && query !== '' ? (
                                                <div className="relative cursor-default select-none py-2 px-4 text-gray-400">
                                                    Nothing found.
                                                </div>
                                            ) : (
                                                filteredPairs.map((p) => (
                                                    <ComboboxOption
                                                        key={p}
                                                        className={({ active }) =>
                                                            `relative cursor-default select-none py-2 pl-10 pr-4 ${active ? 'bg-cyan-600 text-white' : 'text-gray-300'
                                                            }`
                                                        }
                                                        value={p}
                                                    >
                                                        {({ selected, active }) => (
                                                            <>
                                                                <span
                                                                    className={`block truncate ${selected ? 'font-medium' : 'font-normal'
                                                                        }`}
                                                                >
                                                                    {p}
                                                                </span>
                                                                {selected ? (
                                                                    <span
                                                                        className={`absolute inset-y-0 left-0 flex items-center pl-3 ${active ? 'text-white' : 'text-cyan-400'
                                                                            }`}
                                                                    >
                                                                        <Check className="h-5 w-5" aria-hidden="true" />
                                                                    </span>
                                                                ) : null}
                                                            </>
                                                        )}
                                                    </ComboboxOption>
                                                ))
                                            )}
                                        </ComboboxOptions>
                                    </div>
                                </Combobox>
                            </div>

                            {/* Mode Switcher */}
                            <div
                                onClick={() => !isRunning && setMode(mode === 'auto' ? 'manual' : 'auto')}
                                className={`cursor-pointer border-2 rounded-2xl p-4 flex flex-col items-center justify-center transition-all ${mode === 'auto' ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/5 bg-white/5 hover:border-white/20'}`}
                            >
                                <Settings className={mode === 'auto' ? "text-cyan-400" : "text-gray-500"} size={24} />
                                <span className={`font-bold mt-2 text-sm ${mode === 'auto' ? 'text-white' : 'text-gray-400'}`}>
                                    {mode === 'auto' ? 'Fully Automated Mode' : 'Manual Confirmation Mode'}
                                </span>
                            </div>
                        </div>
                    </GlassCard>
                </div>

                {/* --- Right Column: Live Monitor --- */}
                <div className="col-span-12 lg:col-span-8 space-y-6">

                    {/* Visual Spread Monitor */}
                    <GlassCard className="p-8 min-h-[280px] flex flex-col justify-center relative">
                        {/* Glowing Line */}
                        <div className="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-50 shadow-[0_0_15px_#22d3ee]"></div>

                        <div className="flex justify-between items-center mb-8">
                            <h3 className="text-md font-bold flex items-center gap-3 text-white">
                                <RefreshCw size={18} className={`text-cyan-400 ${isRunning ? 'animate-spin' : ''}`} style={{ animationDuration: '3s' }} />
                                Live Market Data
                            </h3>
                            {spread > 0 && (
                                <span className="text-xs font-mono text-cyan-500 bg-cyan-950/30 px-2 py-1 rounded border border-cyan-500/20">Latency: ~Realtime</span>
                            )}
                        </div>

                        <div className="flex items-center justify-center gap-4 md:gap-12 py-4">
                            {/* Exchange A */}
                            <div className="text-center group">
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-slate-800 flex items-center justify-center mx-auto mb-4 shadow-xl group-hover:scale-110 transition-transform border border-white/5 group-hover:border-blue-500/50 relative">
                                    <span className="text-2xl font-bold text-blue-400">{exchangeA ? exchangeA[0] : '?'}</span>
                                    <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-emerald-500 border-4 border-slate-900 rounded-full shadow-[0_0_10px_#10b981]" title="API Connected"></div>
                                </div>
                                <p className="font-bold text-white text-sm">{exchangeA || 'Select Exch'}</p>
                                <p className="text-[10px] text-gray-500 max-w-[100px] truncate mx-auto mt-1">{apiKeyA || "No Key"}</p>
                            </div>

                            {/* Spread Animation */}
                            <div className="flex flex-col items-center flex-1 max-w-[240px]">
                                <div className="text-[10px] text-gray-400 mb-3 uppercase tracking-widest font-bold">Spread Gap</div>
                                <div className="flex items-center gap-2 w-full justify-center relative group">
                                    <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden relative border border-white/5">
                                        <div className={`absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500 shadow-[0_0_15px_rgba(168,85,247,0.5)]`} style={{ width: `${Math.min(spread * 50, 100)}%` }}></div>
                                    </div>
                                </div>
                                <div className={`mt-4 text-4xl font-bold font-mono transition-all duration-300 ${spread > 1.0 ? 'text-emerald-400 drop-shadow-[0_0_15px_rgba(52,211,153,0.5)] scale-110' : 'text-gray-500'}`}>
                                    {spread.toFixed(2)}%
                                </div>
                            </div>

                            {/* Exchange B */}
                            <div className="text-center group">
                                <div className="w-16 h-16 md:w-20 md:h-20 rounded-3xl bg-slate-800 flex items-center justify-center mx-auto mb-4 shadow-xl group-hover:scale-110 transition-transform border border-white/5 group-hover:border-purple-500/50 relative">
                                    <span className="text-2xl font-bold text-purple-400">{exchangeB ? exchangeB[0] : '?'}</span>
                                    <div className="absolute -bottom-1.5 -right-1.5 w-5 h-5 bg-emerald-500 border-4 border-slate-900 rounded-full shadow-[0_0_10px_#10b981]" title="API Connected"></div>
                                </div>
                                <p className="font-bold text-white text-sm">{exchangeB || 'Select Exch'}</p>
                                <p className="text-[10px] text-gray-500 max-w-[100px] truncate mx-auto mt-1">{apiKeyB || "No Key"}</p>
                            </div>
                        </div>
                    </GlassCard>

                    {/* Terminal Window */}
                    <GlassCard className="flex flex-col h-[400px] bg-black/40 shadow-2xl">
                        {/* Terminal Header */}
                        <div className="px-5 py-3 border-b border-white/5 flex items-center justify-between bg-black/20">
                            <div className="flex items-center gap-3">
                                <Terminal size={14} className="text-cyan-400" />
                                <span className="font-mono text-xs text-gray-400 font-bold tracking-widest">SYSTEM_LOGS</span>
                            </div>
                            <div className="flex gap-2">
                                <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-amber-500/20 border border-amber-500/50"></div>
                                <div className="w-3 h-3 rounded-full bg-emerald-500/20 border border-emerald-500/50"></div>
                            </div>
                        </div>

                        {/* Log Content */}
                        <div ref={logsEndRef} className="flex-1 p-5 overflow-y-auto font-mono text-xs space-y-2 custom-scrollbar">
                            {logs.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-gray-600">
                                    <Monitor size={48} className="mb-4 opacity-20" />
                                    <p>Engine Interface Initialized. Waiting for data stream...</p>
                                </div>
                            )}
                            {logs.map(log => (
                                <div key={log.id} className="flex gap-3 hover:bg-white/5 p-1 rounded transition-colors group">
                                    <span className="text-gray-600 select-none group-hover:text-gray-400 transition-colors">[{log.timestamp}]</span>
                                    <span className={`${log.type === 'error' ? 'text-rose-400' :
                                        log.type === 'success' ? 'text-emerald-400 font-bold drop-shadow-[0_0_5px_rgba(52,211,153,0.3)]' :
                                            log.type === 'warning' ? 'text-amber-400' :
                                                'text-gray-300'
                                        }`}>
                                        {log.type === 'success' && '>>> '}
                                        {log.type === 'warning' && '!!! '}
                                        {log.type === 'error' && 'XXX '}
                                        {log.message}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </GlassCard>

                </div>
            </div>
        </div>
    );
};

export default ArbitrageBot;
