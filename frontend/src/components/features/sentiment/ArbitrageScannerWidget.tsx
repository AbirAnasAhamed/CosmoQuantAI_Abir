import React, { useEffect, useState } from 'react';
import { ArrowUpRight, ArrowDownRight, Activity, ExternalLink, Search, Radar, Zap, Globe } from 'lucide-react';
import Card from '@/components/common/Card';

// Define the Opportunity Type
interface ArbitrageOpportunity {
    symbol: string;
    name?: string;
    type: "Bullish Divergence" | "Bearish Divergence";
    price_change: number;
    sentiment: number;
    signal_strength: "High" | "Medium";
    action: "Buy/Long" | "Sell/Short";
}

const SUPPORTED_EXCHANGES = [
    { id: 'binance', name: 'Binance' },
    { id: 'kraken', name: 'Kraken' },
    { id: 'bybit', name: 'Bybit' },
    { id: 'okx', name: 'OKX' },
    { id: 'coinbase', name: 'Coinbase' },
];

export const ArbitrageScannerWidget: React.FC = () => {
    const [opportunities, setOpportunities] = useState<ArbitrageOpportunity[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);
    const [searchTerm, setSearchTerm] = useState<string>('');
    const [selectedExchange, setSelectedExchange] = useState<string>('binance');
    const [sensitivity, setSensitivity] = useState<number>(2.5);
    const [debouncedSensitivity, setDebouncedSensitivity] = useState<number>(2.5);

    // Debounce the sensitivity slider so we don't spam the API/Cache
    useEffect(() => {
        const timerId = setTimeout(() => {
            setDebouncedSensitivity(sensitivity);
        }, 500);
        return () => clearTimeout(timerId);
    }, [sensitivity]);

    // Fetch Data
    const fetchOpportunities = async () => {
        try {
            // Don't set loading true on poll to avoid flickering, only on initial mount or exchange/sensitivity switch
            const response = await fetch(`/api/v1/sentiment/arbitrage-opportunities?exchange_id=${selectedExchange}&sensitivity=${debouncedSensitivity}`);
            if (!response.ok) {
                throw new Error('Failed to fetch scanner data');
            }
            const data = await response.json();
            setOpportunities(data);
            setError(null);
            setLoading(false);
        } catch (err) {
            console.error("Scanner API Error:", err);
            setError("Live scanner data unavailable.");
            setLoading(false);
        }
    };

    // Refetch when exchange or sensitivity changes
    useEffect(() => {
        setLoading(true); // Show loading when switching exchange or sensitivity
        setOpportunities([]); // Clear old data
        fetchOpportunities();
    }, [selectedExchange, debouncedSensitivity]);

    // Polling usually happens every 10 seconds.
    useEffect(() => {
        const interval = setInterval(fetchOpportunities, 10000);
        return () => clearInterval(interval);
    }, [selectedExchange, debouncedSensitivity]);

    // Filter Logic
    const filteredOpportunities = opportunities.filter(opp =>
        opp.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (opp.name && opp.name.toLowerCase().includes(searchTerm.toLowerCase()))
    );

    // Dynamic Theme Helper
    const getTheme = (type: string) => {
        if (type.includes('Bullish')) {
            return {
                base: "emerald",
                bg: "bg-emerald-500/10",
                border: "border-emerald-500/30",
                text: "text-emerald-400",
                glow: "shadow-[0_0_15px_rgba(16,185,129,0.3)]",
                gradient: "from-emerald-500/20 to-transparent",
                hoverBorder: "hover:border-emerald-500/50",
                signalActive: "bg-emerald-500/80",
                btnHover: "hover:bg-emerald-500/20"
            };
        }
        return {
            base: "rose",
            bg: "bg-rose-500/10",
            border: "border-rose-500/30",
            text: "text-rose-400",
            glow: "shadow-[0_0_15px_rgba(244,63,94,0.3)]",
            gradient: "from-rose-500/20 to-transparent",
            hoverBorder: "hover:border-rose-500/50",
            signalActive: "bg-rose-500/80",
            btnHover: "hover:bg-rose-500/20"
        };
    };

    return (
        <div className="relative h-full flex flex-col rounded-2xl overflow-hidden border border-slate-700/50 bg-[#0f172a] shadow-2xl">
            {/* --- Background Effects --- */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 pointer-events-none"></div>
            <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500 to-transparent opacity-50"></div>

            {/* --- Header --- */}
            <div className="relative z-10 flex items-center justify-between p-4 border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="relative hidden sm:block">
                        <div className="absolute inset-0 bg-indigo-500 blur-md opacity-20 animate-pulse"></div>
                        <div className="relative p-2 rounded-xl bg-slate-800 border border-slate-700 text-indigo-400">
                            <Radar className="w-5 h-5 animate-[spin_4s_linear_infinite]" />
                        </div>
                    </div>
                    <div>
                        <h3 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-400 text-lg tracking-tight">Alpha Scanner</h3>
                        <div className="flex items-center gap-2">
                            <span className="flex w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]"></span>
                            <p className="text-[10px] text-emerald-500 font-mono font-bold uppercase tracking-wider">Online</p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-3">
                    {/* Sensitivity Selector */}
                    <div className="relative group hidden md:flex items-center gap-2 bg-slate-950/50 border border-slate-800 rounded-lg px-3 py-1.5 focus-within:border-amber-500/50 focus-within:shadow-[0_0_15px_rgba(245,158,11,0.2)] transition-all">
                        <Zap className="w-3.5 h-3.5 text-amber-500 group-hover:text-amber-400 transition-colors" />
                        <span className="text-[10px] font-mono font-bold text-slate-400">SEN: {sensitivity.toFixed(1)}</span>
                        <input 
                            type="range" 
                            min="1.0" 
                            max="5.0" 
                            step="0.1" 
                            value={sensitivity}
                            onChange={(e) => setSensitivity(parseFloat(e.target.value))}
                            className="w-16 h-1 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
                            title="Adjust Divergence Sensitivity"
                        />
                    </div>

                    {/* Exchange Selector */}
                    <div className="relative group hidden sm:block">
                        <Globe className="absolute left-2.5 top-1.5 w-3.5 h-3.5 text-slate-500 z-10" />
                        <select
                            value={selectedExchange}
                            onChange={(e) => setSelectedExchange(e.target.value)}
                            className="bg-slate-950/50 border border-slate-800 text-slate-200 text-xs font-mono rounded-lg pl-8 pr-2 py-1.5 focus:outline-none focus:border-indigo-500/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all cursor-pointer appearance-none hover:bg-slate-900"
                        >
                            {SUPPORTED_EXCHANGES.map(ex => (
                                <option key={ex.id} value={ex.id}>{ex.name}</option>
                            ))}
                        </select>
                    </div>

                    {/* Search Input */}
                    <div className="relative group">
                        <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <Search className="w-3.5 h-3.5 text-slate-500 group-focus-within:text-indigo-400 transition-colors" />
                        </div>
                        <input
                            type="text"
                            placeholder="SEARCH..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="bg-slate-950/50 border border-slate-800 text-slate-200 text-xs font-mono rounded-lg pl-9 pr-3 py-1.5 focus:outline-none focus:border-indigo-500/50 focus:shadow-[0_0_15px_rgba(99,102,241,0.2)] transition-all w-24 focus:w-32 placeholder:text-slate-600"
                        />
                    </div>
                </div>
            </div>

            {/* --- Interactive Scanner Grid --- */}
            <div className="relative flex-1 overflow-auto custom-scrollbar p-2 space-y-2">

                {/* Scanner Beam Animation (Overlay) */}
                <div className="absolute inset-0 pointer-events-none overflow-hidden opacity-10">
                    <div className="w-full h-[2px] bg-indigo-500 blur-[1px] animate-[scan_3s_linear_infinite] shadow-[0_0_10px_#6366f1]"></div>
                </div>

                {loading && opportunities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 text-slate-500">
                        <div className="relative">
                            <div className="absolute inset-0 bg-indigo-500/20 blur-xl rounded-full animate-pulse"></div>
                            <Activity className="relative w-10 h-10 text-indigo-500 animate-bounce" />
                        </div>
                        <span className="text-xs font-mono animate-pulse">SCANNING {selectedExchange.toUpperCase()} PROTOCOLS...</span>
                    </div>
                ) : error ? (
                    <div className="flex flex-col items-center justify-center h-48 gap-3 text-rose-500/80">
                        <Activity className="w-8 h-8 opacity-50" />
                        <span className="text-xs font-mono">{error}</span>
                    </div>
                ) : filteredOpportunities.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500 opacity-60">
                        <div className="p-4 rounded-full bg-slate-900 border border-slate-800">
                            <Search className="w-6 h-6" />
                        </div>
                        <span className="text-xs font-mono">NO DIVERGENCES DETECTED ON {selectedExchange.toUpperCase()}</span>
                    </div>
                ) : (
                    filteredOpportunities.map((opp, idx) => {
                        const theme = getTheme(opp.type);
                        return (
                            <div key={`${opp.symbol}-${idx}`}
                                className={`group relative flex items-center justify-between p-3 rounded-xl border border-slate-800/80 bg-slate-900/40 backdrop-blur-sm 
                                ${theme.hoverBorder} hover:bg-slate-800/80 transition-all duration-300 cursor-pointer overflow-hidden`}
                            >
                                {/* Hover Gradient Effect */}
                                <div className={`absolute inset-0 bg-gradient-to-r ${theme.gradient} opacity-0 group-hover:opacity-10 transition-opacity duration-300 pointer-events-none`}></div>

                                {/* Left: Asset & Badge */}
                                <div className="flex items-center gap-4 relative z-10">
                                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center font-black text-sm border shadow-lg ${theme.bg} ${theme.border} ${theme.text} ${theme.glow}`}>
                                        {opp.symbol.substring(0, 1)}
                                    </div>
                                    <div>
                                        <div className="flex items-center gap-2">
                                            <span className="font-bold text-slate-100 tracking-wide text-sm">{opp.symbol}</span>
                                            <span className={`text-[9px] px-2 py-0.5 rounded font-black uppercase tracking-wider border shadow-sm ${theme.bg} ${theme.border} ${theme.text}`}>
                                                {opp.type === 'Bullish Divergence' ? 'BULL' : 'BEAR'} DIV
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-3 mt-1.5 text-[10px] font-mono">
                                            <div className="flex items-center gap-1 group/price">
                                                <span className="text-slate-500">P:</span>
                                                <span className={`${opp.price_change >= 0 ? "text-emerald-400" : "text-rose-400"} font-bold`}>
                                                    {opp.price_change > 0 ? '+' : ''}{opp.price_change}%
                                                </span>
                                            </div>
                                            <span className="text-slate-700">|</span>
                                            <div className="flex items-center gap-1">
                                                <span className="text-slate-500">S:</span>
                                                <span className={`${opp.sentiment > 0 ? "text-emerald-400" : "text-rose-400"} font-bold`}>
                                                    {opp.sentiment > 0 ? '+' : ''}{opp.sentiment}
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                </div>

                                {/* Right: Action & Visuals */}
                                <div className="flex items-center gap-4 relative z-10">

                                    {/* Animated Strength Signal */}
                                    <div className="hidden sm:flex flex-col items-end gap-1">
                                        <div className="flex items-center gap-1">
                                            <Zap className={`w-3 h-3 ${theme.text}`} />
                                            <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Signal</span>
                                        </div>
                                        <div className="flex gap-1">
                                            {[1, 2, 3].map((bar) => (
                                                <div key={bar}
                                                    className={`w-1 h-3 rounded-full ${theme.bg} ${theme.border} 
                                                    ${(opp.signal_strength === 'High' || bar === 1) ? theme.signalActive : 'bg-slate-800'} 
                                                    ${bar === 3 && opp.signal_strength === 'High' ? 'animate-pulse' : ''}`}
                                                ></div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Action Button */}
                                    <button className={`relative overflow-hidden group/btn flex items-center gap-2 pl-4 pr-3 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest border transition-all shadow-lg
                                        ${theme.bg} ${theme.border} ${theme.text} ${theme.btnHover} hover:scale-105 active:scale-95`}
                                    >
                                        <span>{opp.action.split('/')[0]}</span>
                                        <ArrowUpRight className="w-3.5 h-3.5 group-hover/btn:translate-x-0.5 group-hover/btn:-translate-y-0.5 transition-transform" />

                                        {/* Button Shine Effect */}
                                        <div className="absolute inset-0 -translate-x-full group-hover/btn:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/10 to-transparent"></div>
                                    </button>
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </div>
    );
};
