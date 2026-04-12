import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, ChevronDown, Check } from 'lucide-react';
import { useSettings } from '../../../context/SettingsContext';
import { useCCXTMarkets } from '../../../hooks/useCCXTMarkets';
import { botService } from '../../../services/botService';

export const BotSettingsTab: React.FC = () => {
    const { apiKeys } = useSettings();
    const {
        exchanges, selectedExchange, setSelectedExchange,
        quoteCurrencies, selectedQuote, setSelectedQuote,
        availablePairs, selectedPair, setSelectedPair,
        isLoading, error
    } = useCCXTMarkets();

    const [isEnabled, setIsEnabled] = useState(false);
    const [isRealTrading, setIsRealTrading] = useState(false);
    const [tradeSize, setTradeSize] = useState('0.1');
    const [strategy, setStrategy] = useState('imbalance_breakout');
    const [botTimeframe, setBotTimeframe] = useState('1m'); // Added timeframe state
    const [selectedApiKey, setSelectedApiKey] = useState('');
    const [selectedTradeUnit, setSelectedTradeUnit] = useState<'BASE' | 'QUOTE'>('BASE');

    // Risk Management States
    const [stopLoss, setStopLoss] = useState('2.5');
    const [takeProfit, setTakeProfit] = useState('5.0');
    const [trailingStop, setTrailingStop] = useState(''); // Empty string means no trailing stop
    const [targetSpread, setTargetSpread] = useState(''); // Optional target spread for profit booking
    const [targetSpreadUnit, setTargetSpreadUnit] = useState<'BASE' | 'QUOTE'>('BASE');

    // Custom Dropdown States
    const [isPairDropdownOpen, setIsPairDropdownOpen] = useState(false);
    const [pairSearchQuery, setPairSearchQuery] = useState('');
    const pairDropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (pairDropdownRef.current && !pairDropdownRef.current.contains(event.target as Node)) {
                setIsPairDropdownOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredPairs = useMemo(() => {
        if (!pairSearchQuery) return availablePairs;
        return availablePairs.filter(p => p.symbol.toLowerCase().includes(pairSearchQuery.toLowerCase()));
    }, [availablePairs, pairSearchQuery]);

    // New states for API integration
    const [currentBotId, setCurrentBotId] = useState<number | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);

    useEffect(() => {
        if (apiKeys.length > 0 && !selectedApiKey) {
            setSelectedApiKey(apiKeys[0].id?.toString() || '');
        }
    }, [apiKeys, selectedApiKey]);

    const handleSaveConfiguration = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            const botData = {
                name: `OrderFlow Bot - ${selectedPair}`,
                strategy: strategy,
                market: selectedPair,
                exchange: selectedExchange,
                timeframe: botTimeframe,
                trade_value: parseFloat(tradeSize),
                trade_unit: selectedTradeUnit,
                risk_level: isRealTrading ? 'high' : 'low',
                is_paper_trading: !isRealTrading,
                config: {
                    amount_per_trade: parseFloat(tradeSize),
                    timeframe: botTimeframe,
                    leverage: 1,
                    stop_loss: parseFloat(stopLoss) || undefined,
                    take_profit: parseFloat(takeProfit) || undefined,
                    trailing_stop: trailingStop ? parseFloat(trailingStop) : undefined,
                    target_spread: targetSpread ? parseFloat(targetSpread) : undefined
                }
            };

            if (currentBotId) {
                // Update
                await botService.updateBot(currentBotId, botData);
                console.log("Bot configuration updated.");
            } else {
                // Create
                const newBot = await botService.createBot(botData);
                setCurrentBotId(Number(newBot.id));
                console.log("New Bot created:", newBot);
            }
        } catch (err) {
            console.error("Failed to save configuration:", err);
            alert("Failed to save bot configuration.");
        } finally {
            setIsProcessing(false);
        }
    };

    const handleToggleActive = async () => {
        if (isProcessing) return;
        setIsProcessing(true);
        try {
            const newState = !isEnabled;

            let targetBotId = currentBotId;

            // If activating but no bot exists yet, create one first.
            if (newState && !targetBotId) {
                const botData = {
                    name: `OrderFlow Bot - ${selectedPair}`,
                    strategy: strategy,
                    market: selectedPair,
                    exchange: selectedExchange,
                    timeframe: botTimeframe,
                    trade_value: parseFloat(tradeSize),
                    trade_unit: selectedTradeUnit,
                    risk_level: isRealTrading ? 'high' : 'low',
                    is_paper_trading: !isRealTrading,
                    config: {
                        amount_per_trade: parseFloat(tradeSize),
                        timeframe: botTimeframe,
                        leverage: 1,
                        stop_loss: parseFloat(stopLoss) || undefined,
                        take_profit: parseFloat(takeProfit) || undefined,
                        trailing_stop: trailingStop ? parseFloat(trailingStop) : undefined,
                        target_spread: targetSpread ? parseFloat(targetSpread) : undefined
                    }
                };
                const newBot = await botService.createBot(botData);
                setCurrentBotId(Number(newBot.id));
                targetBotId = Number(newBot.id);
            }

            if (targetBotId) {
                if (newState) {
                    await botService.controlBot(targetBotId, 'start');
                } else {
                    await botService.controlBot(targetBotId, 'stop');
                }
                setIsEnabled(newState);
            }

        } catch (err) {
            console.error("Failed to toggle bot:", err);
            alert("Failed to change bot status. Check logs.");
        } finally {
            setIsProcessing(false);
        }
    };

    return (
        <div className="w-full h-full p-6 flex flex-col items-center justify-start overflow-y-auto">
            <div className="w-full max-w-2xl bg-white dark:bg-[#0B1120] rounded-xl border border-gray-200 dark:border-white/5 shadow-lg p-6">
                <div className="mb-6 flex justify-between items-center border-b border-gray-200 dark:border-white/10 pb-4">
                    <h2 className="text-xl font-bold text-gray-800 dark:text-white">Order Flow Bot Configuration</h2>
                    <div className="flex items-center space-x-3">
                        <span className={`text-sm font-bold ${isEnabled ? 'text-green-500' : 'text-gray-500'}`}>
                            {isEnabled ? 'ACTIVE' : 'INACTIVE'}
                        </span>
                        <button
                            disabled={isProcessing}
                            onClick={handleToggleActive}
                            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${isEnabled ? 'bg-green-500' : 'bg-gray-400 dark:bg-gray-600'} ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}
                        >
                            <span className={`${isEnabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform duration-200 ease-in-out`} />
                        </button>
                    </div>
                </div>

                {/* Secure Paper/Real Trading Toggle */}
                <div className="mb-6 bg-gray-50 dark:bg-black/20 rounded-xl p-4 border border-gray-200 dark:border-white/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                        <h3 className="text-lg font-bold text-gray-800 dark:text-white flex items-center gap-2">
                            Trading Mode
                            {isRealTrading ? (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-red-500 text-white rounded uppercase tracking-wider animate-pulse">Live</span>
                            ) : (
                                <span className="px-2 py-0.5 text-[10px] font-bold bg-blue-500 text-white rounded uppercase tracking-wider">Simulated</span>
                            )}
                        </h3>
                        <p className="text-xs text-gray-500 mt-1 max-w-sm">
                            {isRealTrading
                                ? "Warning: Trading with real funds. Losses can exceed your initial deposit."
                                : "Paper trading mode. No real orders will be placed."}
                        </p>
                    </div>

                    <div className="flex bg-gray-200 dark:bg-gray-800 rounded-lg p-1 relative border border-gray-300 dark:border-gray-700">
                        <button
                            onClick={() => setIsRealTrading(false)}
                            className={`relative px-4 py-2 text-sm font-semibold rounded-md transition-all z-10 ${!isRealTrading
                                ? 'text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            Paper Trading
                            {!isRealTrading && (
                                <span className="absolute inset-0 bg-blue-500 rounded-md -z-10 shadow-[0_0_10px_rgba(59,130,246,0.5)]"></span>
                            )}
                        </button>
                        <button
                            onClick={() => setIsRealTrading(true)}
                            className={`relative px-4 py-2 text-sm font-semibold rounded-md transition-all z-10 ${isRealTrading
                                ? 'text-white shadow-sm'
                                : 'text-gray-500 hover:text-gray-700 dark:hover:text-gray-300'
                                }`}
                        >
                            Real Trading
                            {isRealTrading && (
                                <span className="absolute inset-0 bg-red-500 rounded-md -z-10 shadow-[0_0_10px_rgba(239,68,68,0.5)]"></span>
                            )}
                        </button>
                    </div>
                </div>

                {isRealTrading && (
                    <div className="mb-6 bg-red-50 dark:bg-red-900/10 rounded-xl p-4 border border-red-200 dark:border-red-500/20 animate-in fade-in slide-in-from-top-2">
                        <label className="block text-sm font-bold text-red-700 dark:text-red-400 mb-2">Live Execution API Key</label>
                        {apiKeys.length > 0 ? (
                            <select
                                value={selectedApiKey}
                                onChange={(e) => setSelectedApiKey(e.target.value)}
                                className="w-full bg-white dark:bg-black/40 border border-red-300 dark:border-red-500/30 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500"
                            >
                                {apiKeys.map((key) => (
                                    <option key={key.id} value={key.id?.toString()}>
                                        {key.name} ({key.exchange.charAt(0).toUpperCase() + key.exchange.slice(1)})
                                    </option>
                                ))}
                            </select>
                        ) : (
                            <div className="p-3 bg-red-100 dark:bg-red-900/20 border border-red-300 dark:border-red-500/30 rounded text-red-800 dark:text-red-300 text-sm">
                                No API keys found. Please configure an API key in the Settings page to enable real trading.
                            </div>
                        )}
                        <p className="mt-2 text-xs text-red-600 dark:text-red-400/80">
                            Ensure your selected API key matches your trading exchange and has appropriate permissions.
                        </p>
                    </div>
                )}

                <div className="space-y-6">
                    {/* --- CCXT Market Selection Core --- */}
                    <div className="bg-gray-50 dark:bg-black/20 p-4 rounded-xl border border-gray-200 dark:border-white/5 space-y-4">
                        <h3 className="text-sm font-bold text-gray-800 dark:text-white border-b border-gray-200 dark:border-white/10 pb-2">Market Selection</h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Exchange Box */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Exchange</label>
                                <select
                                    value={selectedExchange}
                                    onChange={(e) => setSelectedExchange(e.target.value)}
                                    className="w-full bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-primary"
                                >
                                    {exchanges.slice(0, 100).map(ex => (
                                        <option key={ex} value={ex}>{ex.charAt(0).toUpperCase() + ex.slice(1)}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Quote Box */}
                            <div>
                                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Base Currency</label>
                                <select
                                    value={selectedQuote}
                                    onChange={(e) => setSelectedQuote(e.target.value)}
                                    disabled={isLoading || quoteCurrencies.length === 0}
                                    className="w-full bg-white dark:bg-[#0B1120] border border-gray-300 dark:border-gray-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-primary disabled:opacity-50"
                                >
                                    {quoteCurrencies.map(q => (
                                        <option key={q} value={q}>{q}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Pair Box */}
                        <div className="relative" ref={pairDropdownRef}>
                            <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                                Asset Pair {isLoading && <span className="text-[10px] text-brand-primary animate-pulse ml-2">Loading...</span>}
                            </label>

                            <div
                                onClick={() => !isLoading && availablePairs.length > 0 && setIsPairDropdownOpen(!isPairDropdownOpen)}
                                className={`flex items-center justify-between w-full bg-white dark:bg-[#0B1120] border ${isPairDropdownOpen ? 'border-brand-primary ring-1 ring-brand-primary' : 'border-gray-300 dark:border-gray-700'} text-gray-900 dark:text-white rounded-lg px-3 py-2 cursor-pointer transition-all ${isLoading || availablePairs.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
                            >
                                <span className="font-medium text-sm">{selectedPair || 'Select Pair'}</span>
                                <ChevronDown size={16} className={`text-gray-500 transition-transform ${isPairDropdownOpen ? 'rotate-180' : ''}`} />
                            </div>

                            {/* Dropdown Menu */}
                            {isPairDropdownOpen && (
                                <div className="absolute z-50 w-full mt-1 bg-white dark:bg-[#0B1120] border border-gray-200 dark:border-gray-700 rounded-xl shadow-xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                                    <div className="p-2 border-b border-gray-100 dark:border-gray-800">
                                        <div className="flex items-center px-2 py-1.5 bg-gray-50 dark:bg-black/30 rounded-lg border border-gray-200 dark:border-gray-700 focus-within:border-brand-primary/50 focus-within:ring-1 focus-within:ring-brand-primary/50 transition-all">
                                            <Search size={14} className="text-gray-400 mr-2" />
                                            <input
                                                type="text"
                                                autoFocus
                                                value={pairSearchQuery}
                                                onChange={(e) => setPairSearchQuery(e.target.value)}
                                                placeholder="Search pairs..."
                                                className="w-full bg-transparent text-sm text-gray-900 dark:text-white outline-none placeholder:text-gray-400"
                                            />
                                        </div>
                                    </div>
                                    <div className="max-h-60 overflow-y-auto custom-scrollbar p-1">
                                        {filteredPairs.length > 0 ? (
                                            filteredPairs.map(p => (
                                                <div
                                                    key={p.symbol}
                                                    onClick={() => {
                                                        setSelectedPair(p.symbol);
                                                        setIsPairDropdownOpen(false);
                                                        setPairSearchQuery('');
                                                    }}
                                                    className={`flex items-center justify-between px-3 py-2 text-sm rounded-lg cursor-pointer transition-colors ${selectedPair === p.symbol ? 'bg-brand-primary/10 text-brand-primary font-bold' : 'text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-white/5'}`}
                                                >
                                                    {p.symbol}
                                                    {selectedPair === p.symbol && <Check size={14} className="text-brand-primary" />}
                                                </div>
                                            ))
                                        ) : (
                                            <div className="px-3 py-4 text-center text-sm text-gray-500 dark:text-gray-400">
                                                No pairs found
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}

                            {error && <p className="text-xs text-red-500 mt-1">{error}</p>}
                        </div>
                    </div>
                    {/* --------------------------------- */}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Algorithm Strategy</label>
                            <select
                                value={strategy}
                                onChange={(e) => setStrategy(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary"
                            >
                                <option value="imbalance_breakout">Order Imbalance Breakout</option>
                                <option value="liquidity_sniping">Liquidity Wall Sniping</option>
                                <option value="cvd_divergence">CVD Divergence Trading</option>
                            </select>
                            <p className="mt-2 text-xs text-gray-500">Select the logic the bot will use to interpret the incoming Order Flow heatmap data.</p>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Timeframe</label>
                            <select
                                value={botTimeframe}
                                onChange={(e) => setBotTimeframe(e.target.value)}
                                className="w-full bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg px-4 py-2.5 outline-none focus:ring-2 focus:ring-brand-primary"
                            >
                                <option value="1s">1 Second</option>
                                <option value="1m">1 Minute</option>
                                <option value="3m">3 Minutes</option>
                                <option value="5m">5 Minutes</option>
                                <option value="15m">15 Minutes</option>
                                <option value="1h">1 Hour</option>
                                <option value="4h">4 Hours</option>
                                <option value="1d">1 Day</option>
                            </select>
                            <p className="mt-2 text-xs text-gray-500">The candle timeframe the bot will use for signal generation.</p>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Trade Size ({selectedTradeUnit === 'BASE' ? selectedPair.split('/')[0] : selectedPair.split('/')[1] || 'Currency'})
                        </label>
                        <div className="flex bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-primary">
                            <input
                                type="number"
                                step="0.01"
                                value={tradeSize}
                                onChange={(e) => setTradeSize(e.target.value)}
                                className="w-full bg-transparent text-gray-900 dark:text-white px-4 py-2.5 outline-none"
                            />
                            <div className="border-l border-gray-300 dark:border-gray-600">
                                <select
                                    value={selectedTradeUnit}
                                    onChange={(e) => setSelectedTradeUnit(e.target.value as 'BASE' | 'QUOTE')}
                                    className="h-full bg-transparent text-gray-700 dark:text-gray-300 px-3 py-2.5 outline-none cursor-pointer font-bold"
                                >
                                    <option value="BASE">{selectedPair.split('/')[0] || 'BASE'}</option>
                                    <option value="QUOTE">{selectedPair.split('/')[1] || 'QUOTE'}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Target Spread ({targetSpreadUnit === 'BASE' ? selectedPair.split('/')[0] : selectedPair.split('/')[1] || 'Currency'})
                        </label>
                        <div className="flex bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden focus-within:ring-2 focus-within:ring-brand-primary">
                            <input
                                type="number"
                                step="0.01"
                                placeholder="Optional target spread"
                                value={targetSpread}
                                onChange={(e) => setTargetSpread(e.target.value)}
                                className="w-full bg-transparent text-gray-900 dark:text-white px-4 py-2.5 outline-none placeholder:text-gray-400 dark:placeholder:text-gray-600"
                            />
                            <div className="border-l border-gray-300 dark:border-gray-600">
                                <select
                                    value={targetSpreadUnit}
                                    onChange={(e) => setTargetSpreadUnit(e.target.value as 'BASE' | 'QUOTE')}
                                    className="h-full bg-transparent text-gray-700 dark:text-gray-300 px-3 py-2.5 outline-none cursor-pointer font-bold"
                                >
                                    <option value="BASE">{selectedPair.split('/')[0] || 'BASE'}</option>
                                    <option value="QUOTE">{selectedPair.split('/')[1] || 'QUOTE'}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Risk Parameters</label>
                        <div className="grid grid-cols-3 gap-4">
                            <div>
                                <span className="text-xs text-gray-500 mb-1 block">Stop Loss (%)</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={stopLoss}
                                    onChange={(e) => setStopLoss(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-primary"
                                />
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 mb-1 block">Take Profit (%)</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    value={takeProfit}
                                    onChange={(e) => setTakeProfit(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-primary"
                                />
                            </div>
                            <div>
                                <span className="text-xs text-gray-500 mb-1 block">Trailing Stop (%)</span>
                                <input
                                    type="number"
                                    step="0.1"
                                    placeholder="Optional"
                                    value={trailingStop}
                                    onChange={(e) => setTrailingStop(e.target.value)}
                                    className="w-full bg-gray-50 dark:bg-black/20 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-brand-primary placeholder:text-gray-400 dark:placeholder:text-gray-600"
                                />
                            </div>
                        </div>
                    </div>

                    <div className="pt-4 border-t border-gray-200 dark:border-white/10">
                        <button
                            disabled={isProcessing}
                            onClick={handleSaveConfiguration}
                            className={`w-full text-white font-bold py-3 px-4 rounded-lg shadow-md transition-all ${isRealTrading
                                ? 'bg-red-600 hover:bg-red-700 shadow-[0_4px_15px_rgba(220,38,38,0.4)]'
                                : 'bg-brand-primary hover:bg-blue-600'
                                } ${isProcessing ? 'opacity-50 cursor-not-allowed' : ''}`}>
                            {isRealTrading ? 'Save REAL Trading Configuration' : 'Save Bot Configuration'}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};
