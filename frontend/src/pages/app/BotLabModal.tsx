import React, { useState, useEffect, useMemo } from 'react';
import { Dialog } from '@headlessui/react';
import {
    X, Zap, BarChart2, TrendingUp, Cpu, Activity,
    Settings, Play, Pause, Trash2, Info, AlertTriangle,
    Hammer, Plus, Skull, Check, Layers
} from 'lucide-react';
import Button from '@/components/common/Button';
import SearchableSelect from '@/components/common/SearchableSelect';
import { botService } from '@/services/botService';
import { marketDataService } from '@/services/marketData';
import { useSettings } from '@/context/SettingsContext';
import { useToast } from '@/context/ToastContext';
import AIGeneratorModal from '@/components/features/ai/AIGeneratorModal';
import { AIStrategyConfig } from '@/services/strategyService';
import type { ActiveBot } from '@/types';
import {
    StrategyParams,
    DEFAULT_RSI_PARAMS,
    DEFAULT_MACD_PARAMS,
    DEFAULT_BB_PARAMS,
    DEFAULT_SMA_PARAMS
} from '@/types/strategy';

const STRATEGY_OPTIONS = [
    { value: 'RSI Strategy', label: 'RSI Strategy (Default)' },
    { value: 'MACD Trend', label: 'MACD Trend' },
    { value: 'Bollinger Bands', label: 'Bollinger Bands' },
    { value: 'SMA Cross', label: 'SMA Crossover' }
];

const getInitialParams = (strategy: string): StrategyParams => {
    switch (strategy) {
        case 'RSI Strategy': return DEFAULT_RSI_PARAMS;
        case 'MACD Trend': return DEFAULT_MACD_PARAMS;
        case 'Bollinger Bands': return DEFAULT_BB_PARAMS;
        case 'SMA Cross': return DEFAULT_SMA_PARAMS;
        default: return DEFAULT_RSI_PARAMS;
    }
};

interface BotLabModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSuccess: () => void;
}

const BotLabModal: React.FC<BotLabModalProps> = ({ isOpen, onClose, onSuccess }) => {
    const { showToast } = useToast();
    const { apiKeys } = useSettings();
    const [loading, setLoading] = useState(false);
    const [showAIModal, setShowAIModal] = useState(false);

    // Form States
    const [botName, setBotName] = useState('');
    const [description, setDescription] = useState('');
    const [tradeValue, setTradeValue] = useState('100');
    const [unit, setUnit] = useState('QUOTE');
    const [apiKeyId, setApiKeyId] = useState('');

    const [exchange, setExchange] = useState('');
    const [assetPair, setAssetPair] = useState('');
    const [availableExchanges, setAvailableExchanges] = useState<string[]>([]);
    const [availablePairs, setAvailablePairs] = useState<string[]>([]);
    const [isLoadingExchanges, setIsLoadingExchanges] = useState(false);
    const [isLoadingPairs, setIsLoadingPairs] = useState(false);

    // Strategy & Params
    const [strategy, setStrategy] = useState(STRATEGY_OPTIONS[0].value);
    const [strategyParams, setStrategyParams] = useState<StrategyParams>(DEFAULT_RSI_PARAMS);
    const [timeframe, setTimeframe] = useState('1h');

    // Deployment & Order Settings
    const [deploymentTarget, setDeploymentTarget] = useState<'Spot' | 'Futures' | 'Margin'>('Spot');
    const [orderType, setOrderType] = useState<'Market' | 'Limit'>('Market');
    const [limitPrice, setLimitPrice] = useState('');
    const [leverage, setLeverage] = useState(1);
    const [marginMode, setMarginMode] = useState<'ISOLATED' | 'CROSSED'>('ISOLATED');

    // Risk Management
    const [riskParams, setRiskParams] = useState({ stopLoss: 5, takeProfit: 10, positionSize: 100 });
    const [tpMode, setTpMode] = useState<'Simple' | 'Partial'>('Simple');
    const [partialTPs, setPartialTPs] = useState<{ target: number, amount: number }[]>([]);
    const [newTP, setNewTP] = useState({ target: '', amount: '' });

    // Advanced & Notifications
    const [advanced, setAdvanced] = useState({ trailingSl: false, trailingSlVal: 0.02, dailyLoss: false, dailyLossVal: 0.03, regimeFilter: false, sentiment: false });
    const [notifications, setNotifications] = useState({ telegram: false });

    // Scalping Mode
    const [botMode, setBotMode] = useState<'standard' | 'scalp'>('standard');
    const [scalpConfig, setScalpConfig] = useState({
        entryType: 'manual',
        entryPrice: '',
        indicatorPeriod: 20,
        indicatorDev: 2,
        tpType: 'spread',
        tpValue: '',
        autoLoop: true,
        maxTrades: 10
    });

    const updateScalp = (key: string, value: any) => setScalpConfig(prev => ({ ...prev, [key]: value }));
    const [feeRate, setFeeRate] = useState(0.1);
    const [isPaperTrading, setIsPaperTrading] = useState(true);

    const availableApiKeys = useMemo(() => apiKeys.filter(k => k.isEnabled), [apiKeys]);

    useEffect(() => {
        if (isOpen) {
            const fetchExchanges = async () => {
                setIsLoadingExchanges(true);
                try {
                    const exList = await marketDataService.getAllExchanges();
                    setAvailableExchanges(exList);
                } catch (error) {
                    console.error("Failed to load exchanges", error);
                } finally {
                    setIsLoadingExchanges(false);
                }
            };
            fetchExchanges();
        }
    }, [isOpen]);

    useEffect(() => {
        if (exchange) {
            const fetchPairs = async () => {
                setIsLoadingPairs(true);
                try {
                    const pairs = await marketDataService.getExchangePairs(exchange);
                    setAvailablePairs(pairs);
                    if (pairs.length > 0) setAssetPair(pairs[0]);
                } catch (error) {
                    console.error("Failed to load pairs", error);
                } finally {
                    setIsLoadingPairs(false);
                }
            };
            fetchPairs();
        }
    }, [exchange]);

    useEffect(() => {
        setStrategyParams(getInitialParams(strategy));
    }, [strategy]);

    const addPartialTP = () => {
        const target = Number(newTP.target);
        const amount = Number(newTP.amount);
        if (!target || !amount) return showToast("Enter both Target % and Amount %", "warning");
        setPartialTPs([...partialTPs, { target, amount }].sort((a, b) => a.target - b.target));
        setNewTP({ target: '', amount: '' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);

        if (!botName.trim()) { showToast('Enter a name', 'error'); setLoading(false); return; }
        if (!exchange) { showToast('Select an exchange', 'error'); setLoading(false); return; }

        try {
            const finalRiskParams = {
                stopLoss: riskParams.stopLoss,
                takeProfit: tpMode === 'Partial' ? partialTPs : riskParams.takeProfit,
                positionSize: riskParams.positionSize,
                leverage: deploymentTarget === 'Futures' ? leverage : 1,
                marginMode: deploymentTarget === 'Futures' ? marginMode : 'ISOLATED'
            };

            const finalTimeframe = botMode === 'scalp' ? '1m' : timeframe;
            let finalConfig = {};
            let selectedStrategyName = strategy;

            if (botMode === 'standard') {
                finalConfig = {
                    ...strategyParams,
                    leverage: leverage,
                    stop_loss: finalRiskParams.stopLoss,
                    take_profit: finalRiskParams.takeProfit,
                    amount_per_trade: Number(tradeValue),
                    riskParams: finalRiskParams,
                    advanced,
                    notifications,
                    deploymentTarget,
                    orderType,
                    limitPrice: orderType === 'Limit' && limitPrice ? Number(limitPrice) : null
                };
            } else {
                selectedStrategyName = 'Smart Scalper (Ping-Pong)';
                finalConfig = {
                    mode: 'scalp',
                    scalp_settings: {
                        entry_trigger: scalpConfig.entryType,
                        entry_price: Number(scalpConfig.entryPrice),
                        indicator: { name: 'bb', period: scalpConfig.indicatorPeriod, dev: scalpConfig.indicatorDev },
                        take_profit: { type: scalpConfig.tpType, value: Number(scalpConfig.tpValue) },
                        auto_loop: scalpConfig.autoLoop,
                        max_trades_per_day: scalpConfig.maxTrades
                    },
                    riskParams: { ...finalRiskParams, stopLoss: riskParams.stopLoss },
                    deploymentTarget
                };
            }

            const newBotData = {
                name: botName,
                description: description, // Pass description to service
                exchange: exchange,
                market: assetPair,
                strategy: selectedStrategyName,
                timeframe: finalTimeframe,
                trade_value: Number(tradeValue),
                trade_unit: unit,
                api_key_id: isPaperTrading ? null : apiKeyId,
                is_regime_aware: advanced.regimeFilter,
                is_paper_trading: isPaperTrading,
                config: finalConfig
            };

            await botService.createBot(newBotData);
            onSuccess();
            onClose();
        } catch (error) {
            console.error(error);
            showToast("Deployment failed", "error");
        } finally {
            setLoading(false);
        }
    };

    const inputClasses = "w-full bg-black/40 border border-white/10 rounded-xl p-3 text-sm text-white focus:ring-2 focus:ring-cyan-500 focus:border-cyan-500 transition-all outline-none placeholder-gray-600";
    const labelClasses = "block text-[10px] font-bold text-gray-400 uppercase tracking-wider mb-2";

    return (
        <Dialog open={isOpen} onClose={onClose} className="relative z-[60]">
            <div className="fixed inset-0 bg-slate-900/80 backdrop-blur-md" aria-hidden="true" />

            <div className="fixed inset-0 flex items-center justify-center p-4">
                <Dialog.Panel className="w-full max-w-3xl rounded-3xl bg-slate-900 border border-white/10 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden relative animate-in fade-in zoom-in-95 duration-200">
                    {/* Header */}
                    <div className="p-6 border-b border-white/10 flex justify-between items-center bg-white/5">
                        <div className="flex items-center gap-4">
                            <Dialog.Title className="text-xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 to-blue-500 tracking-tight">Deploy New Protocol</Dialog.Title>
                            <button
                                onClick={() => setShowAIModal(true)}
                                className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-violet-600/20 to-fuchsia-600/20 border border-violet-500/30 rounded-full text-xs font-bold text-violet-300 hover:bg-violet-600/30 transition-all hover:scale-105"
                            >
                                <Zap size={14} className="fill-current" /> Ask AI
                            </button>
                        </div>
                        <button onClick={onClose} className="p-2 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"><X /></button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                        <form onSubmit={handleSubmit} className="space-y-8">
                            {/* ✅ Toggle Paper Trading / Real Trading */}
                            <div className="flex justify-center mb-4">
                                <div className="bg-gray-800 p-1 rounded-lg flex items-center">
                                    <button
                                        type="button"
                                        onClick={() => setIsPaperTrading(true)}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${isPaperTrading ? 'bg-blue-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Simulation Mode
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setIsPaperTrading(false)}
                                        className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${!isPaperTrading ? 'bg-red-600 text-white shadow-lg' : 'text-gray-400 hover:text-white'}`}
                                    >
                                        Real Trade
                                    </button>
                                </div>
                            </div>

                            {/* Section 1: Core Identity */}
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <div className="md:col-span-1">
                                    <label className={labelClasses}>Protocol Name</label>
                                    <input type="text" className={inputClasses} value={botName} onChange={e => setBotName(e.target.value)} placeholder="e.g. Alpha Centauri" />
                                </div>
                                <div className="md:col-span-2">
                                    <label className={labelClasses}>Description</label>
                                    <input type="text" className={inputClasses} value={description} onChange={e => setDescription(e.target.value)} placeholder="Strategy description..." />
                                </div>
                                <div className="md:col-span-1">
                                    <label className={labelClasses}>Capital Allocation</label>
                                    <div className="flex gap-2">
                                        <input type="number" className={inputClasses} value={tradeValue} onChange={e => setTradeValue(e.target.value)} />
                                        <select className={`${inputClasses} !w-24`} value={unit} onChange={e => setUnit(e.target.value)}>
                                            <option value="QUOTE">USDT</option>
                                            <option value="ASSET">BASE</option>
                                        </select>
                                    </div>
                                </div>

                                {/* API Keys (Only for Real Trading) */}
                                {!isPaperTrading && (
                                    <div className="md:col-span-1">
                                        <label className={labelClasses}>API Credentials</label>
                                        <select className={inputClasses} value={apiKeyId} onChange={e => {
                                            const id = e.target.value;
                                            setApiKeyId(id);
                                            const key = apiKeys.find(k => k.id === Number(id));
                                            if (key) setExchange(key.exchange);
                                        }}>
                                            <option value="">Select Key...</option>
                                            {availableApiKeys.map(key => <option key={key.id} value={String(key.id)}>{key.name} ({key.exchange})</option>)}
                                        </select>
                                    </div>
                                )}
                                <div className="md:col-span-1">
                                    <SearchableSelect label="Exchange" options={availableExchanges} value={exchange} onChange={setExchange} placeholder="Select Exchange" disabled={isLoadingExchanges} />
                                </div>
                                <div className="md:col-span-1">
                                    <SearchableSelect label="Asset Pair" options={availablePairs} value={assetPair} onChange={setAssetPair} placeholder="Select Pair" disabled={!exchange || isLoadingPairs} />
                                </div>
                            </div>

                            {/* Mode Selector */}
                            <div className="space-y-4">
                                <label className={labelClasses}>Operational Mode</label>
                                <div className="grid grid-cols-2 gap-4">
                                    <div onClick={() => setBotMode('standard')} className={`cursor-pointer border-2 rounded-2xl p-4 flex flex-col items-center justify-center transition-all ${botMode === 'standard' ? 'border-cyan-500 bg-cyan-500/10' : 'border-white/5 bg-white/5 hover:border-white/20'}`}>
                                        <BarChart2 className={botMode === 'standard' ? "text-cyan-400" : "text-gray-500"} size={32} />
                                        <span className="font-bold text-white mt-2">Standard Strategy</span>
                                    </div>
                                    <div onClick={() => setBotMode('scalp')} className={`cursor-pointer border-2 rounded-2xl p-4 flex flex-col items-center justify-center transition-all ${botMode === 'scalp' ? 'border-violet-500 bg-violet-500/10' : 'border-white/5 bg-white/5 hover:border-white/20'}`}>
                                        <Zap className={botMode === 'scalp' ? "text-violet-400" : "text-gray-500"} size={32} />
                                        <span className="font-bold text-white mt-2">HFT Scalper</span>
                                    </div>
                                </div>
                            </div>

                            {botMode === 'standard' ? (
                                <div className="space-y-8 animate-in fade-in slide-in-from-bottom-2">
                                    {/* Strategy & Timeframe */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className={labelClasses}>Strategy Core</label>
                                            <select className={inputClasses} value={strategy} onChange={e => setStrategy(e.target.value)}>
                                                {STRATEGY_OPTIONS.map(opt => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Timeframe</label>
                                            <select className={inputClasses} value={timeframe} onChange={e => setTimeframe(e.target.value)}>
                                                {['1m', '3m', '5m', '15m', '1h', '4h', '1d'].map(t => <option key={t} value={t}>{t}</option>)}
                                            </select>
                                        </div>
                                    </div>

                                    {/* Deployment Target & Orders */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                        <div>
                                            <label className={labelClasses}>Deployment Target</label>
                                            <div className="flex bg-black/40 rounded-xl p-1 border border-white/10">
                                                {(['Spot', 'Futures', 'Margin'] as const).map(target => (
                                                    <button
                                                        key={target}
                                                        type="button"
                                                        onClick={() => setDeploymentTarget(target)}
                                                        className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg transition-all ${deploymentTarget === target ? 'bg-cyan-600 text-white shadow-md' : 'text-gray-500 hover:text-white'}`}
                                                    >
                                                        {target}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Order Type</label>
                                            <div className="flex bg-black/40 rounded-xl p-1 border border-white/10">
                                                {(['Market', 'Limit'] as const).map(type => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => setOrderType(type)}
                                                        className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg transition-all ${orderType === type ? 'bg-cyan-600 text-white shadow-md' : 'text-gray-500 hover:text-white'}`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    {deploymentTarget === 'Futures' && (
                                        <div className="p-4 bg-cyan-900/10 border border-cyan-500/20 rounded-xl space-y-4">
                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className={labelClasses}>Leverage</label>
                                                    <span className="text-cyan-400 font-bold text-sm bg-cyan-500/10 px-2 py-0.5 rounded">{leverage}x</span>
                                                </div>
                                                <input
                                                    type="range"
                                                    min="1"
                                                    max="125"
                                                    step="1"
                                                    value={leverage}
                                                    onChange={e => setLeverage(Number(e.target.value))}
                                                    className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-cyan-500"
                                                />
                                                <div className="flex justify-between text-[10px] text-gray-500 mt-1">
                                                    <span>1x</span>
                                                    <span>25x</span>
                                                    <span>50x</span>
                                                    <span>75x</span>
                                                    <span>100x</span>
                                                    <span>125x</span>
                                                </div>
                                            </div>
                                            <div>
                                                <label className={labelClasses}>Margin Mode</label>
                                                <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                                                    {(['ISOLATED', 'CROSSED'] as const).map(mode => (
                                                        <button
                                                            key={mode}
                                                            type="button"
                                                            onClick={() => setMarginMode(mode)}
                                                            className={`flex-1 py-1.5 text-[10px] font-bold uppercase rounded-md transition-all ${marginMode === mode ? 'bg-cyan-600 text-white shadow-sm' : 'text-gray-500 hover:text-white'}`}
                                                        >
                                                            {mode === 'ISOLATED' ? 'Isolated' : 'Cross'}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    <div className="bg-white/5 p-4 rounded-xl border border-white/10">
                                        <h4 className="text-xs font-bold text-gray-400 uppercase tracking-widest mb-4 flex items-center gap-2">
                                            <Settings size={14} className="text-cyan-400" /> Strategy Parameters
                                        </h4>
                                        <div className="grid grid-cols-2 gap-4">
                                            {Object.keys(strategyParams).map(key => (
                                                <div key={key}>
                                                    <label className={labelClasses}>{key.replace(/_/g, ' ')}</label>
                                                    <input
                                                        type="number"
                                                        className={inputClasses}
                                                        value={(strategyParams as any)[key]}
                                                        onChange={(e) => setStrategyParams({ ...strategyParams, [key]: Number(e.target.value) })}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="h-px bg-white/10"></div>

                                    {/* Risk Management */}
                                    <div>
                                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-rose-400" /> Risk Management</h3>
                                        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                            <div>
                                                <label className={labelClasses}>Stop Loss %</label>
                                                <input type="number" className={inputClasses} value={riskParams.stopLoss} onChange={e => setRiskParams({ ...riskParams, stopLoss: Number(e.target.value) })} />
                                            </div>
                                            <div className="md:col-span-2">
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className={labelClasses}>Take Profit Mode</label>
                                                    <div className="flex bg-black/40 rounded-lg p-0.5 border border-white/10">
                                                        {(['Simple', 'Partial'] as const).map(mode => (
                                                            <button
                                                                key={mode}
                                                                type="button"
                                                                onClick={() => setTpMode(mode)}
                                                                className={`px-3 py-1 text-[10px] font-bold uppercase rounded-md transition-all ${tpMode === mode ? 'bg-gray-700 text-white shadow-sm' : 'text-gray-500'}`}
                                                            >
                                                                {mode}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>

                                                {tpMode === 'Simple' ? (
                                                    <div className="relative">
                                                        <input type="number" className={inputClasses} value={riskParams.takeProfit} onChange={e => setRiskParams({ ...riskParams, takeProfit: Number(e.target.value) })} />
                                                        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 text-xs">% target</span>
                                                    </div>
                                                ) : (
                                                    <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                                                        <div className="flex gap-2 mb-3">
                                                            <input type="number" placeholder="Target %" className={inputClasses} value={newTP.target} onChange={e => setNewTP({ ...newTP, target: e.target.value })} />
                                                            <input type="number" placeholder="Sell %" className={inputClasses} value={newTP.amount} onChange={e => setNewTP({ ...newTP, amount: e.target.value })} />
                                                            <Button type="button" size="sm" onClick={addPartialTP} className="bg-cyan-600 hover:bg-cyan-500">+</Button>
                                                        </div>
                                                        <div className="space-y-2">
                                                            {partialTPs.map((tp, idx) => (
                                                                <div key={idx} className="flex justify-between items-center text-xs p-2 bg-white/5 rounded-lg border border-white/5">
                                                                    <span className="text-gray-300">Target <span className="text-emerald-400 font-bold">{tp.target}%</span> | Sell <span className="text-white font-bold">{tp.amount}%</span></span>
                                                                    <button type="button" onClick={() => setPartialTPs(partialTPs.filter((_, i) => i !== idx))} className="text-gray-500 hover:text-rose-400">&times;</button>
                                                                </div>
                                                            ))}
                                                            {partialTPs.length === 0 && <p className="text-[10px] text-center text-gray-600">No partial targets set.</p>}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="h-px bg-white/10"></div>

                                    {/* Advanced Tools */}
                                    <div>
                                        <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Cpu size={16} className="text-purple-400" /> Advanced Tools</h3>
                                        <div className="space-y-3">
                                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div onClick={() => setAdvanced(prev => ({ ...prev, trailingSl: !prev.trailingSl }))} className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${advanced.trailingSl ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-2 h-2 bg-white rounded-full m-1 transform transition-transform ${advanced.trailingSl ? 'translate-x-4' : ''}`}></div>
                                                    </div>
                                                    <span className="text-sm text-gray-300">Trailing Stop Loss</span>
                                                </div>
                                                {advanced.trailingSl && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-500">Trail %</span>
                                                        <input type="number" className={`${inputClasses} !w-20 !py-1 !text-xs`} value={advanced.trailingSlVal} onChange={e => setAdvanced({ ...advanced, trailingSlVal: Number(e.target.value) })} />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div onClick={() => setAdvanced(prev => ({ ...prev, dailyLoss: !prev.dailyLoss }))} className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${advanced.dailyLoss ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-2 h-2 bg-white rounded-full m-1 transform transition-transform ${advanced.dailyLoss ? 'translate-x-4' : ''}`}></div>
                                                    </div>
                                                    <span className="text-sm text-gray-300">Daily Loss Limit</span>
                                                </div>
                                                {advanced.dailyLoss && (
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs text-gray-500">Limit %</span>
                                                        <input type="number" className={`${inputClasses} !w-20 !py-1 !text-xs`} value={advanced.dailyLossVal} onChange={e => setAdvanced({ ...advanced, dailyLossVal: Number(e.target.value) })} />
                                                    </div>
                                                )}
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div onClick={() => setAdvanced(prev => ({ ...prev, regimeFilter: !prev.regimeFilter }))} className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${advanced.regimeFilter ? 'bg-cyan-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-2 h-2 bg-white rounded-full m-1 transform transition-transform ${advanced.regimeFilter ? 'translate-x-4' : ''}`}></div>
                                                    </div>
                                                    <span className="text-sm text-gray-300">Market Regime Filter (AI Aware)</span>
                                                </div>
                                            </div>

                                            <div className="flex items-center justify-between p-3 bg-white/5 rounded-xl border border-white/5">
                                                <div className="flex items-center gap-3">
                                                    <div onClick={() => setNotifications(prev => ({ ...prev, telegram: !prev.telegram }))} className={`w-8 h-4 rounded-full cursor-pointer transition-colors ${notifications.telegram ? 'bg-blue-500' : 'bg-gray-700'}`}>
                                                        <div className={`w-2 h-2 bg-white rounded-full m-1 transform transition-transform ${notifications.telegram ? 'translate-x-4' : ''}`}></div>
                                                    </div>
                                                    <span className="text-sm text-gray-300">Telegram Notifications</span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 bg-violet-500/5 p-6 rounded-2xl border border-violet-500/20">
                                    <h4 className="flex items-center gap-2 text-violet-400 font-bold uppercase text-xs tracking-wider mb-4"><Zap size={14} /> Scalping Engine Config</h4>

                                    {/* HFT Deployment Options */}
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                                        <div>
                                            <label className={labelClasses}>Deployment Target</label>
                                            <div className="flex bg-black/40 rounded-xl p-1 border border-white/10">
                                                {(['Spot', 'Futures'] as const).map(target => (
                                                    <button
                                                        key={target}
                                                        type="button"
                                                        onClick={() => setDeploymentTarget(target)}
                                                        className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg transition-all ${deploymentTarget === target ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 hover:text-white'}`}
                                                    >
                                                        {target}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Order Type</label>
                                            <div className="flex bg-black/40 rounded-xl p-1 border border-white/10">
                                                {(['Market', 'Limit'] as const).map(type => (
                                                    <button
                                                        key={type}
                                                        type="button"
                                                        onClick={() => setOrderType(type)}
                                                        className={`flex-1 py-2 text-[10px] font-bold uppercase rounded-lg transition-all ${orderType === type ? 'bg-violet-600 text-white shadow-md' : 'text-gray-500 hover:text-white'}`}
                                                    >
                                                        {type}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-2 gap-4">
                                        <div>
                                            <label className={labelClasses}>Entry Trigger</label>
                                            <select className={inputClasses} value={scalpConfig.entryType} onChange={e => updateScalp('entryType', e.target.value)}>
                                                <option value="manual">Manual Price Entry</option>
                                                <option value="bollinger">Bollinger Bands Deviation</option>
                                                <option value="rsi_ob">RSI Overbought/Oversold</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className={labelClasses}>Target Profit Logic</label>
                                            <div className="flex gap-2">
                                                <select className={`${inputClasses} !w-24`} value={scalpConfig.tpType} onChange={e => updateScalp('tpType', e.target.value)}>
                                                    <option value="spread">Spread %</option>
                                                    <option value="fixed">Fixed $</option>
                                                </select>
                                                <input type="number" className={inputClasses} placeholder="Value" value={scalpConfig.tpValue} onChange={e => updateScalp('tpValue', e.target.value)} />
                                            </div>
                                        </div>

                                        {/* Net Profit Calculator */}
                                        <div className="col-span-2 bg-black/20 p-4 rounded-xl border border-white/5 space-y-3">
                                            <h5 className="text-[10px] font-bold text-gray-500 uppercase tracking-widest flex items-center gap-2">
                                                <TrendingUp size={12} className="text-emerald-400" /> ROI Calculator
                                            </h5>
                                            <div className="grid grid-cols-3 gap-4">
                                                <div>
                                                    <label className="text-[9px] text-gray-500 block mb-1">Est. Entry Price</label>
                                                    <input type="number" className={`${inputClasses} !py-1 !text-xs`} placeholder="0.00" value={scalpConfig.entryPrice} onChange={e => updateScalp('entryPrice', e.target.value)} />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] text-gray-500 block mb-1">Fee Rate % (Mk/Tk)</label>
                                                    <input type="number" className={`${inputClasses} !py-1 !text-xs`} value={feeRate} onChange={e => setFeeRate(Number(e.target.value))} />
                                                </div>
                                                <div>
                                                    <label className="text-[9px] text-gray-500 block mb-1">Est. Net Profit</label>
                                                    <div className={`text-sm font-bold font-mono py-1.5 ${(() => {
                                                        const ep = Number(scalpConfig.entryPrice) || 0;
                                                        const tp = Number(scalpConfig.tpValue) || 0;
                                                        const fee = feeRate || 0.1;
                                                        // Simple estim: Spread % - 2 * fee
                                                        let net = 0;
                                                        if (scalpConfig.tpType === 'spread') net = tp - (fee * 2);
                                                        else if (ep > 0) net = ((tp / ep) * 100) - (fee * 2);
                                                        return net > 0;
                                                    })() ? 'text-emerald-400' : 'text-rose-400'
                                                        }`}>
                                                        {(() => {
                                                            const ep = Number(scalpConfig.entryPrice) || 0;
                                                            const tp = Number(scalpConfig.tpValue) || 0;
                                                            const fee = feeRate || 0.1;
                                                            let net = 0;
                                                            if (scalpConfig.tpType === 'spread') net = tp - (fee * 2);
                                                            else if (ep > 0) net = ((tp / ep) * 100) - (fee * 2); // Simple approx
                                                            return `${net > 0 ? '+' : ''}${net.toFixed(4)}%`;
                                                        })()}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>

                                        <div className="col-span-2 flex items-center justify-between bg-black/20 p-3 rounded-xl border border-white/5">
                                            <span className="text-sm font-bold text-white">Auto-Ping-Pong Loop</span>
                                            <div
                                                onClick={() => updateScalp('autoLoop', !scalpConfig.autoLoop)}
                                                className={`w-12 h-6 rounded-full flex items-center padding-1 cursor-pointer transition-colors ${scalpConfig.autoLoop ? 'bg-emerald-500' : 'bg-gray-600'}`}
                                            >
                                                <div className={`bg-white w-4 h-4 rounded-full shadow-md transform transition-transform mx-1 ${scalpConfig.autoLoop ? 'translate-x-6' : ''}`}></div>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}



                            <div className="pt-6 border-t border-white/10 flex justify-end gap-3">
                                <Button variant="secondary" onClick={onClose} className="bg-transparent border border-white/10 text-white hover:bg-white/5">Abort</Button>
                                <Button type="submit" disabled={loading} className="bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white border-0 shadow-lg shadow-cyan-500/30">
                                    {loading ? 'Deploying...' : 'Deploy Protocol'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </Dialog.Panel>
            </div >

            <AIGeneratorModal
                isOpen={showAIModal}
                onClose={() => setShowAIModal(false)}
                onApply={(config: AIStrategyConfig) => {
                    setBotName(config.strategy_name);
                    // Description is part of AIStrategyConfig
                    setDescription(config.description || '');
                    setLeverage(config.leverage);
                    setRiskParams(prev => ({ ...prev, stopLoss: config.stop_loss, takeProfit: config.take_profit }));
                    setTimeframe(config.timeframe);
                    setTradeValue(String(config.amount_per_trade));

                    // Smart Suggestion for Market Type
                    if (config.leverage > 1) {
                        setDeploymentTarget('Futures');
                        setMarginMode('ISOLATED');
                    } else if (config.leverage === 1) {
                        setDeploymentTarget('Spot');
                    }

                    showToast('Strategy parameters applied! Please review and deploy.', 'success');
                }}
            />
        </Dialog >
    );
};

export default BotLabModal;
