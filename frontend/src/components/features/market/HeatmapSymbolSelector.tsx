import React, { useState, useEffect, useRef, useMemo } from 'react';
import api from '../../../services/api';
import { Search, ChevronDown, Check, Activity, Zap } from 'lucide-react';

export interface HeatmapSymbolSelectorProps {
    symbol: string;
    exchange: string;
    onSymbolChange: (newSymbol: string) => void;
    onExchangeChange: (newExchange: string) => void;
}

export const HeatmapSymbolSelector: React.FC<HeatmapSymbolSelectorProps> = ({ symbol, exchange, onSymbolChange, onExchangeChange }) => {
    const [exchanges, setExchanges] = useState<string[]>(['binance']);
    const [markets, setMarkets] = useState<string[]>(['BTC/USDT']);
    const [loadingMarkets, setLoadingMarkets] = useState(false);

    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const dropdownRef = useRef<HTMLDivElement>(null);

    // Close dropdown on outside click
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    // Fetch exchanges on mount
    useEffect(() => {
        const fetchExchanges = async () => {
            try {
                const res = await api.get('/market-depth/exchanges');
                if (res.data && Array.isArray(res.data)) {
                    setExchanges(res.data);
                }
            } catch (err) {
                console.error("Failed to fetch exchanges:", err);
            }
        };
        fetchExchanges();
    }, []);

    // Fetch markets when exchange changes
    useEffect(() => {
        const fetchMarkets = async () => {
            if (!exchange) return;
            setLoadingMarkets(true);
            try {
                const res = await api.get('/market-depth/markets', { params: { exchange } });
                if (res.data && Array.isArray(res.data)) {
                    const allPairs = [...res.data].sort();
                    setMarkets(allPairs);
                }
            } catch (err) {
                console.error(`Failed to fetch markets for ${exchange}:`, err);
            } finally {
                setLoadingMarkets(false);
            }
        };
        fetchMarkets();
    }, [exchange]);

    // Filtered markets
    const filteredMarkets = useMemo(() => {
        if (!searchQuery) return markets;
        return markets.filter(m => m.toLowerCase().includes(searchQuery.toLowerCase()));
    }, [markets, searchQuery]);

    // Format Symbol visually
    const renderSymbolDisplay = (sym: string, isSelected: boolean = false) => {
        const isFutures = sym.includes(':');
        const displaySym = sym.replace(/:.*/, ''); // Hide the :USDT part for cleaner look but show badge
        
        if (!displaySym.includes('/')) return (
            <div className="flex items-center gap-2">
                <span className={`font-bold ${isSelected ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{displaySym}</span>
                {isFutures && <span className="text-[8px] bg-brand-primary/20 text-brand-primary px-1 rounded font-black uppercase">FUT</span>}
            </div>
        );

        const [base, quote] = displaySym.split('/');
        return (
            <div className="flex items-center gap-2">
                <span className="flex items-baseline">
                    <span className={`font-black tracking-tight ${isSelected ? 'text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]' : 'text-slate-900 dark:text-white'}`}>{base}</span>
                    <span className={`text-[10px] ml-0.5 tracking-widest font-semibold ${isSelected ? 'text-white/70' : 'text-gray-400 dark:text-gray-500'}`}>/{quote}</span>
                </span>
                {isFutures && <span className="text-[8px] bg-brand-primary/20 text-brand-primary px-1 rounded font-black uppercase">FUT</span>}
            </div>
        );
    };

    return (
        <div className="relative z-50" ref={dropdownRef}>
            {/* The Main Trigger Button */}
            <button
                onClick={() => {
                    setIsDropdownOpen(!isDropdownOpen);
                    setSearchQuery('');
                }}
                className={`flex items-center gap-3 px-4 py-2 rounded-xl border transition-all duration-300 ${isDropdownOpen
                    ? 'bg-white dark:bg-[#0B1120] border-brand-primary/60 shadow-[0_0_20px_rgba(59,130,246,0.3)]'
                    : 'bg-white dark:bg-white/5 border-gray-200 dark:border-white/10 hover:border-brand-primary/40 dark:hover:border-brand-primary/30 hover:shadow-lg dark:hover:bg-white/10'
                    }`}
            >
                <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${isDropdownOpen ? 'bg-gradient-to-br from-brand-primary to-purple-500 text-white shadow-inner shadow-white/20' : 'bg-gray-100 dark:bg-black/30 text-gray-500 dark:text-gray-400'}`}>
                        <Zap size={16} className={isDropdownOpen ? 'animate-pulse' : ''} />
                    </div>
                    <div className="flex flex-col items-start leading-[1.1]">
                        <span className="text-[9px] text-brand-primary/80 font-black uppercase tracking-[0.2em]">{exchange}</span>
                        <span className="text-base font-mono tracking-tight">{renderSymbolDisplay(symbol)}</span>
                    </div>
                </div>
                <ChevronDown size={14} className={`text-gray-400 transition-transform duration-300 ml-2 ${isDropdownOpen ? 'rotate-180 text-brand-primary' : ''}`} />
            </button>

            {/* The Dropdown Menu (Positioned Below) */}
            <div
                className={`absolute top-[calc(100%+0.75rem)] left-0 mt-0 w-[420px] max-w-[90vw] bg-white/95 dark:bg-[#080D17]/95 backdrop-blur-2xl border border-gray-200 dark:border-white/10 rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.15)] dark:shadow-[0_25px_50px_-12px_rgba(0,0,0,0.6)] z-[100] overflow-hidden origin-top-left transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${isDropdownOpen
                    ? 'opacity-100 scale-100 pointer-events-auto translate-y-0'
                    : 'opacity-0 scale-95 pointer-events-none -translate-y-4'
                    }`}
            >
                {/* Header Search Bar */}
                <div className="p-3 border-b border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20">
                    <div className="relative group">
                        <div className="absolute inset-0 bg-gradient-to-r from-brand-primary/20 to-purple-500/20 rounded-xl blur opacity-0 group-focus-within:opacity-100 transition-opacity"></div>
                        <div className="relative flex items-center bg-white dark:bg-[#050B14] border border-gray-200 dark:border-white/10 rounded-xl shadow-inner focus-within:border-brand-primary/50 focus-within:ring-1 focus-within:ring-brand-primary/30 transition-all overflow-hidden">
                            <Search size={18} className="ml-3 text-gray-400 group-focus-within:text-brand-primary transition-colors" />
                            <input
                                type="text"
                                autoFocus={isDropdownOpen}
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                placeholder="Search markets (e.g. BTC/USDT)..."
                                className="w-full bg-transparent pl-3 pr-4 py-3 text-sm font-mono font-medium text-slate-900 dark:text-white outline-none placeholder-gray-400/80"
                            />
                            {searchQuery && (
                                <button
                                    className="mr-3 text-xs bg-gray-200 dark:bg-white/10 hover:bg-gray-300 dark:hover:bg-white/20 text-gray-500 dark:text-gray-300 rounded px-1.5 py-0.5"
                                    onClick={() => setSearchQuery('')}
                                >
                                    ESC
                                </button>
                            )}
                        </div>
                    </div>
                </div>

                {/* Dropdown Body */}
                <div className="flex h-[360px]">
                    {/* Left Panel: Exchange Selector */}
                    <div className="w-[160px] bg-gray-50/80 dark:bg-black/40 border-r border-gray-100 dark:border-white/5 p-2 flex flex-col gap-1 overflow-y-auto custom-scrollbar">
                        <div className="text-[10px] text-gray-400/70 font-black uppercase tracking-[0.15em] px-2 py-2 mt-1">Exchanges</div>
                        <div className="space-y-1">
                            {exchanges.map(ex => (
                                <button
                                    key={ex}
                                    onClick={() => onExchangeChange(ex)}
                                    className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold capitalize transition-all relative overflow-hidden group ${exchange === ex
                                        ? 'text-brand-primary bg-brand-primary/10 shadow-sm'
                                        : 'text-gray-600 dark:text-gray-400 hover:bg-white dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-white'
                                        }`}
                                >
                                    {exchange === ex && <div className="absolute left-0 top-1/2 -translate-y-1/2 w-1 h-1/2 bg-brand-primary rounded-r-full shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>}
                                    {ex}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Right Panel: Trading Pair List */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar p-2 relative bg-white/50 dark:bg-transparent">
                        <div className="text-[10px] text-gray-400/70 font-black uppercase tracking-[0.15em] px-3 py-2 flex justify-between items-center sticky top-0 bg-white/95 dark:bg-[#0B1120]/95 backdrop-blur z-10 rounded-t-lg mb-1">
                            <span>Trading Pairs <span className="text-gray-300 dark:text-gray-600 font-mono text-[9px]">({filteredMarkets.length})</span></span>
                            {loadingMarkets && <Activity size={12} className="animate-spin text-brand-primary" />}
                        </div>

                        {filteredMarkets.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-center px-4 animate-in fade-in duration-300">
                                <Search size={28} className="text-gray-200 dark:text-gray-700 mb-3" />
                                <p className="text-sm font-semibold text-gray-500 dark:text-gray-400">
                                    {loadingMarkets ? 'Crunching market data...' : 'No pairs found'}
                                </p>
                                {!loadingMarkets && (
                                    <p className="text-xs text-gray-400 dark:text-gray-600 mt-1">
                                        Try adjusting your search criteria
                                    </p>
                                )}
                            </div>
                        ) : (
                            <div className="grid grid-cols-1 gap-1 pb-2">
                                {filteredMarkets.map((m, i) => {
                                    const isSelected = symbol === m;
                                    return (
                                        <button
                                            key={m}
                                            onClick={() => {
                                                onSymbolChange(m);
                                                setIsDropdownOpen(false);
                                            }}
                                            className={`flex justify-between items-center px-4 py-3 rounded-xl text-sm font-mono transition-all duration-200 group ${isSelected
                                                ? 'bg-gradient-to-r from-brand-primary to-purple-600 text-white shadow-md shadow-brand-primary/20 scale-[0.98]'
                                                : 'text-slate-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5 hover:scale-[0.99]'
                                                }`}
                                        >
                                            <div className="flex items-center gap-3">
                                                {renderSymbolDisplay(m, isSelected)}
                                            </div>
                                            {isSelected ? (
                                                <div className="bg-white/20 p-1 rounded-full backdrop-blur-sm">
                                                    <Check size={14} className="text-white drop-shadow-md" />
                                                </div>
                                            ) : (
                                                <div className="opacity-0 group-hover:opacity-100 transition-opacity transform translate-x-1 group-hover:translate-x-0">
                                                    <span className="text-[9px] uppercase font-bold text-brand-primary bg-brand-primary/10 px-2 py-1 rounded-md">Select</span>
                                                </div>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer Component (Optional styling touch) */}
                <div className="px-4 py-2 border-t border-gray-100 dark:border-white/5 bg-gray-50/50 dark:bg-black/20 text-[10px] text-gray-400 flex justify-between items-center">
                    <span>Use ↑↓ arrows to navigate</span>
                    <span>Enter to select</span>
                </div>
            </div>
        </div>
    );
};
