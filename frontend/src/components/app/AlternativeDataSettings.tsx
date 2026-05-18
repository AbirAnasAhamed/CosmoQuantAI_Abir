import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Globe, Github, TrendingUp, ChevronDown, Zap, Activity, BarChart2, DollarSign, AlertTriangle, CheckCircle, Info } from 'lucide-react';

interface AlternativeDataSettingsProps {
    isTraining: boolean;
    selectedAltFeatures: string[];
    setSelectedAltFeatures: React.Dispatch<React.SetStateAction<string[]>>;
}

interface FeatureDef {
    id: string;
    name: string;
    desc: string;
    icon: React.ElementType;
    color: string;
    bg: string;
    border: string;
    status: 'live' | 'simulated' | 'unavailable';
    impact: 'high' | 'medium' | 'low';
    tooltip: string;
}

interface Category {
    key: string;
    label: string;
    icon: React.ElementType;
    accent: string;
    features: FeatureDef[];
}

// Live preview hook — fetches quick values from existing APIs
const useLivePreviews = () => {
    const [fng, setFng] = useState<number | null>(null);
    const [netFlow, setNetFlow] = useState<number | null>(null);

    useEffect(() => {
        // Fear & Greed
        fetch('/api/v1/sentiment/fear-greed')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.value !== undefined) setFng(Number(d.value)); })
            .catch(() => {});

        // Exchange Flow
        fetch('/api/v1/on-chain/exchange-flow')
            .then(r => r.ok ? r.json() : null)
            .then(d => { if (d?.net_flow !== undefined) setNetFlow(Number(d.net_flow)); })
            .catch(() => {});
    }, []);

    return { fng, netFlow };
};

const STATUS_BADGE: Record<string, JSX.Element> = {
    live: (
        <span className="flex items-center gap-1 text-[9px] font-bold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            Live
        </span>
    ),
    simulated: (
        <span className="flex items-center gap-1 text-[9px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            <AlertTriangle className="w-2.5 h-2.5" />
            Simulated
        </span>
    ),
    unavailable: (
        <span className="flex items-center gap-1 text-[9px] font-bold text-rose-400 bg-rose-500/10 border border-rose-500/20 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
            No API
        </span>
    ),
};

const IMPACT_DOT: Record<string, string> = {
    high: 'bg-rose-400',
    medium: 'bg-amber-400',
    low: 'bg-slate-500',
};

const CATEGORIES: Category[] = [
    {
        key: 'sentiment',
        label: 'Market Sentiment',
        icon: Activity,
        accent: 'cyan',
        features: [
            {
                id: 'fng_value',
                name: 'Fear & Greed Index',
                desc: 'Crypto market sentiment score (0-100). Helps model identify buy-the-fear & sell-the-greed zones.',
                icon: TrendingUp,
                color: 'text-amber-400',
                bg: 'bg-amber-500/10',
                border: 'border-amber-500/30',
                status: 'live',
                impact: 'high',
                tooltip: 'Sourced from alternative.me. Merged daily with OHLCV candles.',
            },
            {
                id: 'exchange_net_flow',
                name: 'Exchange Net Flow',
                desc: 'Inflow − Outflow (ETH). Negative = bullish (coins leaving exchanges), Positive = bearish.',
                icon: DollarSign,
                color: 'text-emerald-400',
                bg: 'bg-emerald-500/10',
                border: 'border-emerald-500/30',
                status: 'live',
                impact: 'high',
                tooltip: 'Sourced from /api/v1/on-chain/exchange-flow. Captures institutional accumulation/distribution.',
            },
            {
                id: 'onchain_liquidity',
                name: 'On-Chain Liquidity Ratio',
                desc: 'DEX liquidity pool depth vs 7-day average. High ratio = deep market, less slippage risk.',
                icon: BarChart2,
                color: 'text-teal-400',
                bg: 'bg-teal-500/10',
                border: 'border-teal-500/30',
                status: 'live',
                impact: 'medium',
                tooltip: 'From /api/v1/on-chain/liquidity. Helps models adapt to illiquid market conditions.',
            },
        ],
    },
    {
        key: 'alternative',
        label: 'Alternative & Developer Data',
        icon: Globe,
        accent: 'blue',
        features: [
            {
                id: 'search_interest',
                name: 'Google Trends',
                desc: 'Search interest for the asset (0-100). Retail attention surge often precedes price spikes.',
                icon: Globe,
                color: 'text-blue-400',
                bg: 'bg-blue-500/10',
                border: 'border-blue-500/30',
                status: 'live',
                impact: 'medium',
                tooltip: 'Google Trends API. May have 24-72h delay. Best for swing/daily models.',
            },
            {
                id: 'commit_count',
                name: 'GitHub Dev Activity',
                desc: 'Daily commit frequency to the project repo. Dev activity often leads price by 1-2 weeks.',
                icon: Github,
                color: 'text-purple-400',
                bg: 'bg-purple-500/10',
                border: 'border-purple-500/30',
                status: 'live',
                impact: 'low',
                tooltip: 'GitHub API. Best as a slow signal for longer-term models (daily/weekly timeframes).',
            },
        ],
    },
    {
        key: 'macro',
        label: 'Macro Intelligence',
        icon: Zap,
        accent: 'indigo',
        features: [
            {
                id: 'macro_cpi_surprise',
                name: 'CPI Surprise Delta',
                desc: 'Actual CPI vs Forecast (% difference). Negative surprise = dovish risk-on environment.',
                icon: BarChart2,
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10',
                border: 'border-indigo-500/30',
                status: 'live',
                impact: 'high',
                tooltip: 'Real data from ForexFactory via /api/v1/sentiment/macro-economics. Formula: (actual − forecast) / |forecast|.',
            },
            {
                id: 'macro_nfp_surprise',
                name: 'NFP Surprise Delta',
                desc: 'Non-Farm Payroll actual vs forecast. Strong jobs data = hawkish Fed risk → crypto pressure.',
                icon: Activity,
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10',
                border: 'border-indigo-500/30',
                status: 'live',
                impact: 'high',
                tooltip: 'Real data from ForexFactory. Monthly event — forward-filled between releases.',
            },
            {
                id: 'macro_rate_sentiment',
                name: 'Interest Rate Sentiment',
                desc: 'Fed rate decision sentiment score: hike=−1, hold=0, cut=+1. Bullish for crypto when cut.',
                icon: TrendingUp,
                color: 'text-indigo-400',
                bg: 'bg-indigo-500/10',
                border: 'border-indigo-500/30',
                status: 'live',
                impact: 'high',
                tooltip: 'Real FOMC decision data from ForexFactory. Score: hike=−1, hold=0, cut=+1. Forward-filled between meetings.',
            },
        ],
    },
];

export const AlternativeDataSettings: React.FC<AlternativeDataSettingsProps> = ({
    isTraining,
    selectedAltFeatures,
    setSelectedAltFeatures,
}) => {
    const { fng, netFlow } = useLivePreviews();
    const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({
        sentiment: true,
        alternative: false,
        macro: false,
    });
    const [hoveredFeature, setHoveredFeature] = useState<string | null>(null);

    const toggleFeature = (id: string) => {
        if (isTraining) return;
        setSelectedAltFeatures(prev =>
            prev.includes(id) ? prev.filter(f => f !== id) : [...prev, id]
        );
    };

    const toggleCategory = (key: string) => {
        setOpenCategories(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const totalSelected = selectedAltFeatures.length;
    const totalFeatures = CATEGORIES.reduce((acc, cat) => acc + cat.features.length, 0);

    // Impact level badge color
    const impactColors: Record<string, string> = {
        high: 'text-rose-400',
        medium: 'text-amber-400',
        low: 'text-slate-500',
    };

    return (
        <div className="mt-4 overflow-hidden rounded-2xl border border-indigo-500/20 shadow-[0_0_20px_rgba(99,102,241,0.07)] bg-black/40 backdrop-blur-sm">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-white/5 bg-gradient-to-r from-indigo-900/20 to-purple-900/10">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                        <Zap className="w-4 h-4 text-indigo-400" />
                    </div>
                    <div>
                        <h4 className="text-sm font-black text-white uppercase tracking-widest">
                            Sentiment &amp; Macro Intelligence
                        </h4>
                        <p className="text-[10px] text-slate-500 font-medium mt-0.5">
                            Fuse market psychology &amp; macro signals into your model
                        </p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {totalSelected > 0 && (
                        <motion.div
                            initial={{ scale: 0.8, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            className="text-xs font-black text-indigo-300 bg-indigo-500/15 border border-indigo-500/30 px-3 py-1 rounded-full"
                        >
                            {totalSelected}/{totalFeatures} Active
                        </motion.div>
                    )}
                </div>
            </div>

            {/* ── Live Snapshot Bar ── */}
            {(fng !== null || netFlow !== null) && (
                <div className="flex items-center gap-4 px-5 py-2.5 bg-black/30 border-b border-white/5">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex-shrink-0">Live Pulse:</span>
                    {fng !== null && (
                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-500">F&amp;G</span>
                            <span className={`text-xs font-black font-mono ${fng < 25 ? 'text-rose-400' : fng > 75 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                {fng}
                            </span>
                            <span className={`text-[9px] font-bold ${fng < 25 ? 'text-rose-500' : fng > 75 ? 'text-emerald-500' : 'text-amber-500'}`}>
                                {fng < 25 ? 'EXTREME FEAR' : fng > 75 ? 'EXTREME GREED' : fng < 45 ? 'FEAR' : fng > 55 ? 'GREED' : 'NEUTRAL'}
                            </span>
                        </div>
                    )}
                    {netFlow !== null && (
                        <>
                            <div className="w-px h-4 bg-white/10" />
                            <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-500">Net Flow</span>
                                <span className={`text-xs font-black font-mono ${netFlow > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                                    {netFlow > 0 ? '+' : ''}{netFlow.toFixed(2)} ETH
                                </span>
                                <span className={`text-[9px] font-bold ${netFlow > 0 ? 'text-rose-500' : 'text-emerald-500'}`}>
                                    {netFlow > 0 ? '▲ BEARISH' : '▼ BULLISH'}
                                </span>
                            </div>
                        </>
                    )}
                    <CheckCircle className="w-3 h-3 text-emerald-500 ml-auto flex-shrink-0" />
                </div>
            )}

            {/* ── Categories ── */}
            <div className="p-3 space-y-2">
                {CATEGORIES.map(cat => {
                    const CatIcon = cat.icon;
                    const isOpen = openCategories[cat.key];
                    const selectedInCat = cat.features.filter(f => selectedAltFeatures.includes(f.id)).length;

                    return (
                        <div
                            key={cat.key}
                            className={`rounded-xl overflow-hidden border transition-all duration-300 ${isOpen ? 'border-white/10 shadow-inner' : 'border-white/5'}`}
                        >
                            {/* Category Header (Accordion Toggle) */}
                            <button
                                onClick={() => toggleCategory(cat.key)}
                                className="w-full flex items-center justify-between p-3 bg-black/30 hover:bg-white/5 transition-colors text-left"
                            >
                                <div className="flex items-center gap-2">
                                    <CatIcon className="w-3.5 h-3.5 text-slate-400" />
                                    <span className="text-xs font-black text-slate-300 uppercase tracking-wider">
                                        {cat.label}
                                    </span>
                                    {selectedInCat > 0 && (
                                        <span className="text-[9px] font-bold bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 px-1.5 py-0.5 rounded-full">
                                            {selectedInCat} on
                                        </span>
                                    )}
                                </div>
                                <ChevronDown
                                    className={`w-3.5 h-3.5 text-slate-500 transition-transform duration-300 ${isOpen ? 'rotate-180' : ''}`}
                                />
                            </button>

                            {/* Features Grid */}
                            <AnimatePresence>
                                {isOpen && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: 'auto', opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.25 }}
                                        className="overflow-hidden"
                                    >
                                        <div className="p-2 grid grid-cols-1 gap-2">
                                            {cat.features.map(feature => {
                                                const isSelected = selectedAltFeatures.includes(feature.id);
                                                const Icon = feature.icon;
                                                const isHovered = hoveredFeature === feature.id;

                                                return (
                                                    <div key={feature.id} className="relative">
                                                        <button
                                                            onClick={() => toggleFeature(feature.id)}
                                                            disabled={isTraining}
                                                            onMouseEnter={() => setHoveredFeature(feature.id)}
                                                            onMouseLeave={() => setHoveredFeature(null)}
                                                            className={`w-full flex items-start gap-3 p-3 rounded-xl border text-left transition-all duration-200 group ${
                                                                isSelected
                                                                    ? `${feature.bg} ${feature.border} shadow-[0_0_12px_rgba(255,255,255,0.04)]`
                                                                    : 'bg-black/40 border-white/5 hover:border-white/15 hover:bg-white/5'
                                                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                                                        >
                                                            {/* Left: Icon + Checkbox */}
                                                            <div className="flex flex-col items-center gap-1.5 flex-shrink-0 pt-0.5">
                                                                <div className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                                                    isSelected ? feature.bg : 'bg-white/5'
                                                                }`}>
                                                                    <Icon className={`w-3.5 h-3.5 ${isSelected ? feature.color : 'text-slate-600'}`} />
                                                                </div>
                                                                {/* Checkbox */}
                                                                <div className={`w-4 h-4 rounded border flex items-center justify-center transition-all ${
                                                                    isSelected
                                                                        ? `${feature.border} ${feature.bg}`
                                                                        : 'border-slate-700 bg-transparent'
                                                                }`}>
                                                                    {isSelected && (
                                                                        <motion.div
                                                                            initial={{ scale: 0 }}
                                                                            animate={{ scale: 1 }}
                                                                            className={`w-2 h-2 rounded-sm ${feature.bg.replace('/10', '')}`}
                                                                        />
                                                                    )}
                                                                </div>
                                                            </div>

                                                            {/* Right: Text */}
                                                            <div className="flex-1 min-w-0">
                                                                <div className="flex items-center gap-2 flex-wrap mb-1">
                                                                    <span className={`text-xs font-bold ${isSelected ? 'text-white' : 'text-slate-300'}`}>
                                                                        {feature.name}
                                                                    </span>
                                                                    {STATUS_BADGE[feature.status]}
                                                                    <span className="ml-auto flex items-center gap-0.5">
                                                                        <span className={`w-1.5 h-1.5 rounded-full ${IMPACT_DOT[feature.impact]}`} />
                                                                        <span className={`text-[9px] font-bold uppercase ${impactColors[feature.impact]}`}>
                                                                            {feature.impact}
                                                                        </span>
                                                                    </span>
                                                                </div>
                                                                <p className={`text-[10px] leading-relaxed ${isSelected ? 'text-slate-400' : 'text-slate-600'}`}>
                                                                    {feature.desc}
                                                                </p>
                                                            </div>
                                                        </button>

                                                        {/* Tooltip on hover */}
                                                        <AnimatePresence>
                                                            {isHovered && (
                                                                <motion.div
                                                                    initial={{ opacity: 0, y: 4 }}
                                                                    animate={{ opacity: 1, y: 0 }}
                                                                    exit={{ opacity: 0, y: 4 }}
                                                                    className="absolute bottom-full left-0 mb-2 z-50 bg-[#0a0a14] border border-indigo-500/20 rounded-xl p-3 shadow-xl shadow-black/50 max-w-[280px] pointer-events-none"
                                                                >
                                                                    <div className="flex items-start gap-2">
                                                                        <Info className="w-3.5 h-3.5 text-indigo-400 flex-shrink-0 mt-0.5" />
                                                                        <p className="text-[10px] text-slate-300 leading-relaxed">{feature.tooltip}</p>
                                                                    </div>
                                                                </motion.div>
                                                            )}
                                                        </AnimatePresence>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    );
                })}
            </div>

            {/* ── Impact Preview (when features selected) ── */}
            <AnimatePresence>
                {selectedAltFeatures.length > 0 && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden border-t border-white/5"
                    >
                        <div className="px-5 py-3 bg-gradient-to-r from-indigo-900/10 to-transparent">
                            <div className="flex items-center gap-2 mb-2">
                                <CheckCircle className="w-3.5 h-3.5 text-emerald-400" />
                                <p className="text-[10px] font-bold text-emerald-300 uppercase tracking-wider">
                                    Active Alternative Features ({selectedAltFeatures.length})
                                </p>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                                {selectedAltFeatures.map(fId => {
                                    const def = CATEGORIES.flatMap(c => c.features).find(f => f.id === fId);
                                    if (!def) return null;
                                    return (
                                        <span key={fId} className={`text-[10px] font-bold px-2.5 py-1 rounded-full border ${def.bg} ${def.border} ${def.color}`}>
                                            {def.name}
                                        </span>
                                    );
                                })}
                            </div>
                            <p className="text-[10px] text-slate-600 mt-2 font-medium leading-relaxed">
                                ⚡ These features are fetched, normalized & merged onto training timestamps before the model trains. "Simulated" features use forward-filled macro values from last known event.
                            </p>
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
