import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Play, Square, Settings, Database, Activity, Terminal, CheckCircle2, XCircle, Loader2, Trash2, Zap } from 'lucide-react';
import { mlTrainingService, TrainingJob } from '@/services/mlTrainingService';
import apiClient from '@/services/client';
import TargetSelection from '@/components/ml/TargetSelection';
import AdvancedHyperparameters from '@/components/ml/AdvancedHyperparameters';
import FeatureImportanceChart from '@/components/ml/FeatureImportanceChart';
import { HeatmapSymbolSelector } from '../../components/features/market/HeatmapSymbolSelector';
import LiveMarketPulse from '@/components/ml/LiveMarketPulse';
import { FloatingTVChartButton } from '@/components/features/market/FloatingTVChartButton';
import EquityCurveChart from '@/components/ml/EquityCurveChart'; // ✅ New

const ModelTrainingStudio: React.FC = () => {
    const [symbol, setSymbol] = useState('BTC/USDT');
    const [exchange, setExchange] = useState('binance');
    const [timeframe, setTimeframe] = useState('1d');
    const [algorithm, setAlgorithm] = useState('Random Forest');
    const [epochs, setEpochs] = useState(10);
    const [selectedIndicators, setSelectedIndicators] = useState<string[]>(['RSI', 'MACD']);
    const [dataSource, setDataSource] = useState('ohlcv');
    const [isAutoRetrain, setIsAutoRetrain] = useState(false);
    const [retrainInterval, setRetrainInterval] = useState(6);
    const [dataLookback, setDataLookback] = useState(6);
    const [ohlcvPeriod, setOhlcvPeriod] = useState('2y');
    const [isResampleL2, setIsResampleL2] = useState(true);
    
    // Deep Training States
    const targetRowOptions = [1000, 10000, 50000, 100000, 500000, 1000000, 5000000, 10000000, 50000000, 100000000];
    const [targetRowsIndex, setTargetRowsIndex] = useState(3); // Default 100k
    const [isDeepTraining, setIsDeepTraining] = useState(false);
    
    // New Feature States
    const [predictionTarget, setPredictionTarget] = useState('classification');
    const [learningRate, setLearningRate] = useState(0.1);
    const [maxDepth, setMaxDepth] = useState(6);
    const [modelName, setModelName] = useState('');
    const [initialBalance, setInitialBalance] = useState(10000); // ✅ New
    const [tradingFees, setTradingFees] = useState(0.001); // ✅ New
    const [sequenceLength, setSequenceLength] = useState(30); // ✅ New
    
    const [isTraining, setIsTraining] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    
    // Auto-Suggest States
    const [isSuggesting, setIsSuggesting] = useState(false);
    const [suggestedFeatures, setSuggestedFeatures] = useState<any[]>([]);
    const [selectedL2Features, setSelectedL2Features] = useState<string[]>(['obi', 'spread', 'microprice']);
    const [analysisStats, setAnalysisStats] = useState<{rows: number, features: number} | null>(null);
    const [showManualFeatures, setShowManualFeatures] = useState(false);
    
    const [currentJob, setCurrentJob] = useState<TrainingJob | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const INDICATORS = ['RSI', 'MACD', 'BBANDS'];
    const ALGORITHM_CATEGORIES = [
        { name: "Indicator & Tabular Engines", desc: "Fastest. Best for Technical Indicators & L2 Snapshots", algos: ['Random Forest', 'XGBoost', 'LightGBM', 'CatBoost'] },
        { name: "Trend & Sequence Memory", desc: "Best for tracking long-term trends & historical patterns", algos: ['LSTM', 'GRU'] },
        { name: "Micro-Pattern & Scalping", desc: "Best for raw Orderbook flow & spatial feature extraction", algos: ['1D-CNN', 'DeepLOB', 'Transformer'] },
        { name: "Autonomous Agents", desc: "Self-learning environments (Reward-based)", algos: ['PPO-RL'] }
    ];
    const TIMEFRAMES = ['1s', '5s', '1m', '5m', '15m', '1h', '4h', '1d'];

    const ALL_L2_FEATURES = [
        { internal: "Effective_Spread", name: "Effective Spread" },
        { internal: "Spread_ROC", name: "Spread ROC" },
        { internal: "Mid_Price_Acceleration", name: "Mid-Price Acceleration" },
        { internal: "Spread_Asymmetry", name: "Spread Asymmetry" },
        { internal: "WAP_Top_5", name: "WAP Top 5" },
        { internal: "WAP_Top_10", name: "WAP Top 10" },
        { internal: "Multi_Level_Imbalance_Top5", name: "Multi-Level Imbalance (Top 5)" },
        { internal: "Multi_Level_Imbalance_Top10", name: "Multi-Level Imbalance (Top 10)" },
        { internal: "Depth_Ratio", name: "Depth Ratio (Bid/Ask)" },
        { internal: "Ask_Wall_Distance", name: "Wall Distance (Ask)" },
        { internal: "Bid_Wall_Distance", name: "Wall Distance (Bid)" },
        { internal: "Order_Book_Skewness", name: "Order Book Skewness (Sk)" },
        { internal: "Level_1_Imbalance", name: "Level-1 Imbalance" },
        { internal: "Imbalance_Momentum", name: "Imbalance Momentum" },
        { internal: "Order_Flow_Imbalance", name: "Order Flow Imbalance (OFI)" },
        { internal: "CVD_Proxy", name: "Cumulative Volume Delta (CVD)" },
        { internal: "CVD_Acceleration", name: "CVD Acceleration" },
        { internal: "Realized_Micro_Volatility", name: "Realized Micro-Volatility" },
        { internal: "Tick_Test_Roll", name: "Tick Test Roll (Auto-correlation)" },
        { internal: "obi", name: "Order Book Imbalance (OBI)" },
        { internal: "spread", name: "Quoted Spread" },
        { internal: "microprice", name: "Micro-Price" }
    ];

    // Auto-scroll logs
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [currentJob?.logs]);

    // Polling logic
    useEffect(() => {
        let interval: NodeJS.Timeout;
        if (isTraining && currentJob && ['PENDING', 'RUNNING'].includes(currentJob.status)) {
            interval = setInterval(async () => {
                try {
                    const latestJob = await mlTrainingService.getJobStatus(currentJob.id);
                    setCurrentJob(latestJob);
                    if (['COMPLETED', 'FAILED'].includes(latestJob.status)) {
                        setIsTraining(false);
                        clearInterval(interval);
                    }
                } catch (error) {
                    console.error("Error fetching job status:", error);
                }
            }, 1000); // Poll every 1 second
        }
        return () => clearInterval(interval);
    }, [isTraining, currentJob?.id, currentJob?.status]);

    const handleToggleIndicator = (ind: string) => {
        setSelectedIndicators(prev => 
            prev.includes(ind) ? prev.filter(i => i !== ind) : [...prev, ind]
        );
    };

    const handleStartTraining = async () => {
        try {
            setIsTraining(true);
            setCurrentJob(null);
            const job = await mlTrainingService.startTraining({
                symbol,
                timeframe,
                algorithm,
                config: {
                    indicators: selectedIndicators,
                    epochs,
                    dataset_type: dataSource,
                    is_auto_retrain: isAutoRetrain,
                    retrain_interval_hours: isAutoRetrain ? retrainInterval : undefined,
                    data_lookback_hours: dataLookback,
                    ohlcv_period: dataSource === 'ohlcv' ? ohlcvPeriod : undefined,
                    resample_l2: dataSource === 'l2_orderbook' ? isResampleL2 : undefined,
                    prediction_target: predictionTarget,
                    learning_rate: learningRate,
                    max_depth: maxDepth,
                    model_name: modelName,
                    initial_balance: initialBalance, // ✅ New
                    commission: tradingFees, // ✅ New
                    sequence_length: sequenceLength, // ✅ New
                    exchange: exchange,
                    is_deep_training: dataSource === 'l2_orderbook' ? isDeepTraining : false,
                    target_rows: isDeepTraining ? targetRowOptions[targetRowsIndex] : 0,
                    l2_features: selectedL2Features
                }
            });
            setCurrentJob(job);
        } catch (error) {
            console.error("Failed to start training", error);
            setIsTraining(false);
        }
    };

    const handleClearL2Cache = async () => {
        if (!window.confirm("Are you sure you want to delete all cached L2 orderbook data? This cannot be undone.")) return;
        try {
            setIsClearing(true);
            const res = await apiClient.delete('/system/prune-l2-data');
            alert(res.data.message || "Cache cleared successfully.");
        } catch (error: any) {
            console.error("Failed to clear L2 cache", error);
            alert("Failed to clear cache: " + (error.response?.data?.detail || error.message));
        } finally {
            setIsClearing(false);
        }
    };

    const handleSuggestFeatures = async () => {
        try {
            setIsSuggesting(true);
            setSuggestedFeatures([]);
            const res = await apiClient.post('/model-training/suggest-features', { symbol });
            if (res.data.success) {
                setSuggestedFeatures(res.data.suggestions);
                setAnalysisStats({
                    rows: res.data.rows_scanned,
                    features: res.data.analyzed_count
                });
            }
        } catch (error: any) {
            console.error("Failed to suggest features", error);
            alert("Failed to analyze features: " + (error.response?.data?.detail || error.message));
        } finally {
            setIsSuggesting(false);
        }
    };

    const handleToggleL2Feature = (featureInternal: string) => {
        setSelectedL2Features(prev => 
            prev.includes(featureInternal) ? prev.filter(f => f !== featureInternal) : [...prev, featureInternal]
        );
    };

    return (
        <div className="h-full flex flex-col space-y-6 relative">
            {/* Background Neon Orbs */}
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-brand-primary/20 blur-[120px] rounded-full pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-purple-600/20 blur-[120px] rounded-full pointer-events-none"></div>

            <header className="flex items-center justify-between relative z-10">
                <div>
                    <h2 className="text-4xl font-black bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600 flex items-center gap-4 drop-shadow-[0_0_15px_rgba(56,189,248,0.4)]">
                        <div className="p-3 bg-white/5 backdrop-blur-md rounded-2xl border border-white/10 shadow-[0_0_20px_rgba(56,189,248,0.2)]">
                            <BrainCircuit className="w-8 h-8 text-cyan-400" />
                        </div>
                        MACHINE LEARNING ENGINE CORE
                    </h2>
                    <p className="text-slate-400 mt-2 text-sm font-medium tracking-wide ml-16">Advanced L2/OHLCV Machine Learning Synchronization Studio.</p>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0 relative z-10">
                {/* Configuration Panel (Left) */}
                <div className="lg:col-span-4 flex flex-col bg-black/40 backdrop-blur-2xl border border-white/10 rounded-3xl p-6 shadow-[0_8px_32px_rgba(0,0,0,0.5)] relative overflow-hidden h-full overflow-y-auto custom-scrollbar">
                    {/* Glass reflection */}
                    <div className="absolute top-0 inset-x-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-500/50 to-transparent"></div>
                    
                    <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-3 tracking-wide">
                        <Settings className="w-5 h-5 text-cyan-400" />
                        TRAINING CONFIGURATION
                    </h3>

                    <div className="space-y-5 flex-1">
                        <div className="grid grid-cols-2 gap-4 items-end">
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-2">Asset & Exchange</label>
                                <div className={isTraining ? 'opacity-50 pointer-events-none' : ''}>
                                    <HeatmapSymbolSelector 
                                        symbol={symbol} 
                                        exchange={exchange} 
                                        onSymbolChange={setSymbol} 
                                        onExchangeChange={setExchange} 
                                    />
                                </div>
                            </div>
                            <LiveMarketPulse symbol={symbol} exchange={exchange} />
                        </div>
                        
                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Custom Model Name (Optional)</label>
                            <input 
                                type="text" 
                                value={modelName} 
                                onChange={e => setModelName(e.target.value)}
                                disabled={isTraining}
                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 outline-none transition-all disabled:opacity-50 placeholder-white/30 shadow-inner"
                                placeholder="e.g., BTC_Scalper_V1"
                            />
                        </div>

                        <TargetSelection 
                            predictionTarget={predictionTarget}
                            setPredictionTarget={setPredictionTarget}
                            isTraining={isTraining}
                        />

                        {(dataSource === 'ohlcv' || isResampleL2) && (
                            <div>
                                <label className="block text-sm font-medium text-slate-300 mb-1">Candle Interval</label>
                                <div className="grid grid-cols-5 gap-2">
                                {TIMEFRAMES.map(tf => (
                                    <button
                                        key={tf}
                                        disabled={isTraining}
                                        onClick={() => setTimeframe(tf)}
                                        className={`py-2 rounded-xl text-sm font-bold transition-all duration-300 ${timeframe === tf ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-400/50 shadow-[0_0_15px_rgba(34,211,238,0.3)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white hover:border-white/20'}`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-2">Algorithm Engine</label>
                            <div className="space-y-4 max-h-[300px] overflow-y-auto custom-scrollbar pr-2">
                                {ALGORITHM_CATEGORIES.map(category => (
                                    <div key={category.name} className="space-y-2">
                                        <div>
                                            <h4 className="text-[10px] font-black text-cyan-400 uppercase tracking-widest">{category.name}</h4>
                                            <p className="text-[10px] text-slate-500 font-medium">{category.desc}</p>
                                        </div>
                                        <div className="grid grid-cols-1 gap-2">
                                            {category.algos.map(algo => (
                                                <div 
                                                    key={algo} 
                                                    onClick={() => !isTraining && setAlgorithm(algo)}
                                                    className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all duration-300 ${algorithm === algo ? 'border-purple-500 bg-purple-500/10 shadow-[0_0_15px_rgba(168,85,247,0.15)]' : 'border-white/10 bg-white/5 hover:bg-white/10'} ${isTraining ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                >
                                                    <div className={`w-3.5 h-3.5 rounded-full border flex items-center justify-center flex-shrink-0 ${algorithm === algo ? 'border-purple-400' : 'border-white/30'}`}>
                                                        {algorithm === algo && <div className="w-1.5 h-1.5 rounded-full bg-purple-400 shadow-[0_0_5px_#a855f7]"></div>}
                                                    </div>
                                                    <span className="ml-3 text-sm text-slate-200 font-semibold tracking-wide">{algo}</span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-300 mb-1">Epochs / Trees</label>
                            <input 
                                type="number" 
                                value={epochs} 
                                onChange={e => setEpochs(parseInt(e.target.value))}
                                disabled={isTraining}
                                min={1}
                                max={500}
                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 outline-none transition-all disabled:opacity-50 shadow-inner"
                            />
                            
                            <AdvancedHyperparameters 
                                learningRate={learningRate}
                                setLearningRate={setLearningRate}
                                maxDepth={maxDepth}
                                setMaxDepth={setMaxDepth}
                                isTraining={isTraining}
                            />

                            {/* ✅ Advanced RL & Transformer Settings */}
                            {(algorithm === 'PPO-RL' || algorithm === 'Transformer') && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }} 
                                    animate={{ opacity: 1, height: 'auto' }}
                                    className="mt-4 p-4 bg-cyan-500/5 border border-cyan-500/20 rounded-2xl space-y-4"
                                >
                                    <h4 className="text-xs font-black text-cyan-400 uppercase tracking-widest flex items-center gap-2">
                                        <Zap className="w-3.5 h-3.5" /> Engine Specific Settings
                                    </h4>
                                    
                                    {algorithm === 'Transformer' && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Sequence Length (Window)</label>
                                            <input 
                                                type="number" 
                                                value={sequenceLength} 
                                                onChange={e => setSequenceLength(parseInt(e.target.value))}
                                                className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                            />
                                        </div>
                                    )}

                                    {algorithm === 'PPO-RL' && (
                                        <div className="grid grid-cols-2 gap-3">
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Initial Balance ($)</label>
                                                <input 
                                                    type="number" 
                                                    value={initialBalance} 
                                                    onChange={e => setInitialBalance(parseInt(e.target.value))}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 mb-1 uppercase">Trading Fees (%)</label>
                                                <input 
                                                    type="number" 
                                                    step="0.0001"
                                                    value={tradingFees} 
                                                    onChange={e => setTradingFees(parseFloat(e.target.value))}
                                                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-sm text-white outline-none"
                                                />
                                            </div>
                                        </div>
                                    )}
                                </motion.div>
                            )}
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-3">
                                <label className="block text-sm font-medium text-white flex items-center gap-2">
                                    <Database className="w-4 h-4 text-cyan-400" /> Data Source Engine
                                </label>
                                <button 
                                    onClick={handleClearL2Cache}
                                    disabled={isTraining || isClearing}
                                    className="text-xs text-red-400 hover:text-red-300 flex items-center gap-1.5 bg-red-500/10 border border-red-500/20 px-3 py-1.5 rounded-lg transition-all hover:bg-red-500/20 hover:shadow-[0_0_10px_rgba(239,68,68,0.2)]"
                                >
                                    {isClearing ? <Loader2 className="w-3.5 h-3.5 animate-spin"/> : <Trash2 className="w-3.5 h-3.5" />}
                                    Clear L2 Cache
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-3 mb-5">
                                <button
                                    onClick={() => setDataSource('ohlcv')}
                                    disabled={isTraining}
                                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${dataSource === 'ohlcv' ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-[0_0_15px_rgba(56,189,248,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                                >
                                    Standard OHLCV
                                </button>
                                <button
                                    onClick={() => setDataSource('l2_orderbook')}
                                    disabled={isTraining}
                                    className={`py-2.5 rounded-xl text-sm font-bold transition-all duration-300 ${dataSource === 'l2_orderbook' ? 'bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-[0_0_15px_rgba(168,85,247,0.4)]' : 'bg-white/5 text-slate-400 hover:bg-white/10 border border-white/5 hover:text-white'}`}
                                >
                                    Level 2 Orderbook
                                </button>
                            </div>
                            
                            {dataSource === 'l2_orderbook' && (
                                <div className="space-y-4">
                                    <div className="flex items-center justify-between p-4 bg-purple-500/10 rounded-xl border border-purple-500/20 shadow-inner">
                                        <div>
                                            <h4 className="text-sm font-bold text-purple-400">Deep Training (Live Scraping)</h4>
                                            <p className="text-xs text-slate-400 mt-0.5 font-medium">Scrape live L2 data instead of historical.</p>
                                        </div>
                                        <label className="relative inline-flex items-center cursor-pointer">
                                            <input 
                                                type="checkbox" 
                                                className="sr-only peer" 
                                                checked={isDeepTraining}
                                                onChange={() => setIsDeepTraining(!isDeepTraining)}
                                                disabled={isTraining}
                                            />
                                            <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-white/5 peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-pink-500"></div>
                                        </label>
                                    </div>

                                    {isDeepTraining ? (
                                        <div className="p-4 bg-white/5 border border-white/10 rounded-xl">
                                            <div className="flex justify-between items-center mb-4">
                                                <label className="block text-sm font-medium text-slate-300">Target Rows to Scrape</label>
                                                <span className="text-sm font-bold text-purple-400 bg-purple-500/10 px-2.5 py-1 rounded-lg border border-purple-500/20">
                                                    {targetRowOptions[targetRowsIndex].toLocaleString()} Rows
                                                </span>
                                            </div>
                                            <input 
                                                type="range" 
                                                min={0} 
                                                max={targetRowOptions.length - 1} 
                                                step={1}
                                                value={targetRowsIndex}
                                                onChange={(e) => setTargetRowsIndex(parseInt(e.target.value))}
                                                disabled={isTraining}
                                                className="w-full h-2 bg-white/10 rounded-lg appearance-none cursor-pointer accent-purple-500"
                                            />
                                            <div className="flex justify-between text-xs text-slate-500 mt-2 font-medium">
                                                <span>1K</span>
                                                <span>1M</span>
                                                <span>100M</span>
                                            </div>
                                        </div>
                                    ) : (
                                        <div>
                                            <label className="block text-sm font-medium text-slate-300 mb-1">Training Data Lookback (Hours)</label>
                                            <select 
                                                value={dataLookback}
                                                onChange={(e) => setDataLookback(Number(e.target.value))}
                                                disabled={isTraining}
                                                className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-purple-500/50 focus:border-purple-400 outline-none transition-all disabled:opacity-50"
                                            >
                                                <option className="bg-gray-900 text-white" value={0.08333}>Last 5 Minutes</option>
                                                <option className="bg-gray-900 text-white" value={0.25}>Last 15 Minutes</option>
                                                <option className="bg-gray-900 text-white" value={0.5}>Last 30 Minutes</option>
                                                <option className="bg-gray-900 text-white" value={1}>Last 1 Hour</option>
                                                <option className="bg-gray-900 text-white" value={4}>Last 4 Hours</option>
                                                <option className="bg-gray-900 text-white" value={6}>Last 6 Hours</option>
                                                <option className="bg-gray-900 text-white" value={12}>Last 12 Hours</option>
                                                <option className="bg-gray-900 text-white" value={24}>Last 24 Hours</option>
                                            </select>
                                            <p className="text-xs text-slate-500 mt-1.5 ml-1 font-medium">Amount of historical tick data to use.</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {dataSource === 'l2_orderbook' && (
                                <div className="flex items-center justify-between p-4 bg-purple-500/5 rounded-xl border border-purple-500/20 shadow-inner">
                                    <div>
                                        <h4 className="text-sm font-bold text-purple-400">Resample to Candle Interval</h4>
                                        <p className="text-xs text-slate-400 mt-0.5 font-medium">Group High-Frequency tick data into {timeframe} candles.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={isResampleL2}
                                            onChange={() => setIsResampleL2(!isResampleL2)}
                                            disabled={isTraining}
                                        />
                                        <div className="w-11 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-white/5 peer-checked:bg-gradient-to-r peer-checked:from-purple-500 peer-checked:to-pink-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                    </label>
                                </div>
                            )}

                            {dataSource === 'l2_orderbook' && (
                                <div className="mt-4 p-4 bg-indigo-900/20 border border-indigo-500/30 rounded-2xl shadow-inner relative overflow-hidden">
                                    {/* Background glow */}
                                    <div className="absolute top-[-50%] right-[-50%] w-[100%] h-[100%] bg-indigo-500/10 blur-[50px] rounded-full pointer-events-none"></div>
                                    
                                    <div className="flex items-center justify-between mb-4 relative z-10">
                                        <div>
                                            <h4 className="text-sm font-black text-indigo-400 flex items-center gap-2">
                                                <Activity className="w-4 h-4" /> AUTO-FEATURE SELECTION
                                            </h4>
                                            <p className="text-xs text-slate-400 mt-1 font-medium">Analyze live L2 metrics using <span className="text-indigo-300 font-bold">Random Forest</span> & <span className="text-indigo-300 font-bold">Mutual Information</span> to find the most predictive non-correlated features.</p>
                                        </div>
                                    </div>
                                    
                                    <button 
                                        onClick={handleSuggestFeatures}
                                        disabled={isTraining || isSuggesting}
                                        className={`w-full py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2 transition-all shadow-md relative z-10 ${isSuggesting ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 cursor-wait' : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:shadow-[0_0_15px_rgba(79,70,229,0.4)] border border-indigo-400/50 hover:scale-[1.02]'}`}
                                    >
                                        {isSuggesting ? (
                                            <><Loader2 className="w-4 h-4 animate-spin" /> SCANNING 50+ METRICS...</>
                                        ) : (
                                            <><BrainCircuit className="w-4 h-4" /> SUGGEST OPTIMAL METRICS</>
                                        )}
                                    </button>

                                    <AnimatePresence>
                                        {suggestedFeatures.length > 0 && (
                                            <motion.div 
                                                initial={{ opacity: 0, height: 0 }} 
                                                animate={{ opacity: 1, height: 'auto' }} 
                                                className="mt-4 space-y-2 relative z-10"
                                            >
                                                <div className="flex items-center justify-between mb-2">
                                                    <p className="text-xs font-semibold text-emerald-400">Top Recommended Features:</p>
                                                    {analysisStats && (
                                                        <span className="text-[10px] bg-indigo-500/10 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/20">
                                                            Analyzed {analysisStats.rows} rows × {analysisStats.features} features
                                                        </span>
                                                    )}
                                                </div>
                                                {suggestedFeatures.map((feat, idx) => (
                                                    <div 
                                                        key={idx} 
                                                        onClick={() => !isTraining && handleToggleL2Feature(feat.internal)}
                                                        className={`flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-all ${selectedL2Features.includes(feat.internal) ? 'bg-emerald-500/10 border-emerald-500/50 shadow-[0_0_10px_rgba(16,185,129,0.15)]' : 'bg-black/40 border-white/10 hover:border-white/20'}`}
                                                    >
                                                        <div className="flex items-center gap-3">
                                                            <div className={`w-4 h-4 rounded border flex items-center justify-center transition-colors ${selectedL2Features.includes(feat.internal) ? 'bg-emerald-500 border-emerald-400' : 'border-white/30'}`}>
                                                                {selectedL2Features.includes(feat.internal) && <CheckCircle2 className="w-3 h-3 text-black" />}
                                                            </div>
                                                            <span className={`text-xs font-bold ${selectedL2Features.includes(feat.internal) ? 'text-emerald-100' : 'text-slate-300'}`}>
                                                                {feat.name}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center gap-2">
                                                            <span className="text-[10px] bg-indigo-500/20 text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-500/30">
                                                                Score: {feat.score}%
                                                            </span>
                                                        </div>
                                                    </div>
                                                ))}
                                                <p className="text-[10px] text-slate-500 mt-2 text-center">Click a feature to include/exclude it from training.</p>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>

                                    {/* Manual Selection Toggle */}
                                    <div className="mt-4 border-t border-indigo-500/20 pt-4">
                                        <button 
                                            onClick={() => setShowManualFeatures(!showManualFeatures)}
                                            className="w-full flex items-center justify-between text-xs font-bold text-indigo-400 hover:text-indigo-300 transition-colors"
                                        >
                                            <span>Or Select Manually ({selectedL2Features.length}/{ALL_L2_FEATURES.length} Selected)</span>
                                            <span className="text-[10px] bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                                {showManualFeatures ? 'Hide' : 'Show All'}
                                            </span>
                                        </button>
                                        
                                        <AnimatePresence>
                                            {showManualFeatures && (
                                                <motion.div 
                                                    initial={{ opacity: 0, height: 0 }} 
                                                    animate={{ opacity: 1, height: 'auto' }} 
                                                    exit={{ opacity: 0, height: 0 }}
                                                    className="mt-3 grid grid-cols-2 gap-2 overflow-hidden"
                                                >
                                                    {ALL_L2_FEATURES.map((feat, idx) => (
                                                        <div 
                                                            key={idx} 
                                                            onClick={() => !isTraining && handleToggleL2Feature(feat.internal)}
                                                            className={`flex items-center gap-2 p-2 rounded border cursor-pointer transition-all ${selectedL2Features.includes(feat.internal) ? 'bg-indigo-500/20 border-indigo-500/50 text-indigo-200' : 'bg-black/30 border-white/5 text-slate-400 hover:bg-white/5'}`}
                                                        >
                                                            <div className={`w-3.5 h-3.5 rounded-sm border flex items-center justify-center transition-colors flex-shrink-0 ${selectedL2Features.includes(feat.internal) ? 'bg-indigo-500 border-indigo-400' : 'border-white/20'}`}>
                                                                {selectedL2Features.includes(feat.internal) && <CheckCircle2 className="w-2.5 h-2.5 text-black" />}
                                                            </div>
                                                            <span className="text-[10px] font-medium leading-tight truncate" title={feat.name}>
                                                                {feat.name}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </motion.div>
                                            )}
                                        </AnimatePresence>
                                    </div>
                                </div>
                            )}
                        </div>

                        {dataSource === 'ohlcv' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-300 mb-1">Historical Period (OHLCV)</label>
                                    <select 
                                        value={ohlcvPeriod}
                                        onChange={(e) => setOhlcvPeriod(e.target.value)}
                                        disabled={isTraining}
                                        className="w-full bg-white/5 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 outline-none transition-all disabled:opacity-50"
                                    >
                                        {timeframe === '1d' ? (
                                            <>
                                                <option className="bg-gray-900 text-white" value="1mo">1 Month</option>
                                                <option className="bg-gray-900 text-white" value="3mo">3 Months</option>
                                                <option className="bg-gray-900 text-white" value="6mo">6 Months</option>
                                                <option className="bg-gray-900 text-white" value="1y">1 Year</option>
                                                <option className="bg-gray-900 text-white" value="2y">2 Years</option>
                                                <option className="bg-gray-900 text-white" value="5y">5 Years</option>
                                                <option className="bg-gray-900 text-white" value="max">Max Available</option>
                                            </>
                                        ) : (
                                            <>
                                                <option className="bg-gray-900 text-white" value="1d">1 Day</option>
                                                <option className="bg-gray-900 text-white" value="5d">5 Days</option>
                                                <option className="bg-gray-900 text-white" value="1mo">1 Month</option>
                                                <option className="bg-gray-900 text-white" value="60d">60 Days (Max for Intraday)</option>
                                            </>
                                        )}
                                    </select>
                                    <p className="text-xs text-slate-500 mt-1.5 ml-1 font-medium">Total history to download from Yahoo Finance.</p>
                                </div>

                            <div className="mt-4">
                                <label className="block text-sm font-medium text-slate-300 mb-2 flex items-center gap-2">
                                    <Activity className="w-4 h-4 text-cyan-400" /> Feature Engineering
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {INDICATORS.map(ind => (
                                        <button
                                            key={ind}
                                            disabled={isTraining}
                                            onClick={() => handleToggleIndicator(ind)}
                                            className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all duration-300 ${selectedIndicators.includes(ind) ? 'bg-cyan-500/20 text-cyan-400 border-cyan-400/50 shadow-[0_0_10px_rgba(34,211,238,0.2)]' : 'bg-white/5 text-slate-400 border-white/5 hover:border-white/20 hover:text-white hover:bg-white/10'}`}
                                        >
                                            {ind}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            </>
                        )}


                        <div className="p-5 bg-gradient-to-br from-purple-900/20 to-blue-900/10 rounded-2xl border border-white/10 shadow-inner">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-bold text-white flex items-center gap-2">
                                        <BrainCircuit className="w-4 h-4 text-purple-400" /> Auto Retrain
                                    </h4>
                                    <p className="text-xs text-slate-400 mt-1 font-medium">Keep model updated with fresh data automatically</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        checked={isAutoRetrain}
                                        onChange={() => setIsAutoRetrain(!isAutoRetrain)}
                                        disabled={isTraining}
                                    />
                                    <div className="w-12 h-6 bg-white/10 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all border-white/5 peer-checked:bg-gradient-to-r peer-checked:from-cyan-500 peer-checked:to-blue-500 shadow-[inset_0_2px_4px_rgba(0,0,0,0.4)]"></div>
                                </label>
                            </div>
                            
                            {isAutoRetrain && (
                                <div className="mt-4 pt-4 border-t border-white/5">
                                    <label className="block text-xs font-semibold text-slate-300 mb-2">Retrain Interval (Hours)</label>
                                    <select 
                                        value={retrainInterval}
                                        onChange={(e) => setRetrainInterval(Number(e.target.value))}
                                        disabled={isTraining}
                                        className="w-full bg-black/50 backdrop-blur-md border border-white/10 rounded-xl px-4 py-3 text-sm text-white focus:ring-2 focus:ring-cyan-500/50 focus:border-cyan-400 outline-none transition-all shadow-inner"
                                    >
                                        <option className="bg-gray-900 text-white" value={1}>Every 1 Hour</option>
                                        <option className="bg-gray-900 text-white" value={6}>Every 6 Hours</option>
                                        <option className="bg-gray-900 text-white" value={12}>Every 12 Hours</option>
                                        <option className="bg-gray-900 text-white" value={24}>Every 24 Hours</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 mt-2 relative z-10">
                        <button 
                            onClick={handleStartTraining}
                            disabled={isTraining || !symbol}
                            className={`w-full py-4 rounded-2xl font-black text-[15px] flex items-center justify-center gap-3 transition-all duration-300 shadow-xl ${isTraining ? 'bg-white/5 text-slate-500 cursor-not-allowed border border-white/5' : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-purple-600 text-white hover:shadow-[0_0_30px_rgba(56,189,248,0.5)] border border-white/20 hover:scale-[1.02]'}`}
                        >
                            {isTraining ? (
                                <><Loader2 className="w-5 h-5 animate-spin text-cyan-500" /> INITIALIZING NEURAL NETWORK...</>
                            ) : (
                                <><Play className="w-5 h-5 fill-current" /> START DEEP TRAINING</>
                            )}
                        </button>
                    </div>
                </div>

                {/* Live Execution Terminal (Right) */}
                <div className="lg:col-span-8 flex flex-col bg-black/60 backdrop-blur-2xl border border-cyan-500/20 rounded-3xl shadow-[0_0_50px_rgba(56,189,248,0.1)] overflow-hidden h-full relative relative z-10">
                    {/* Header */}
                    <div className="px-6 py-4 bg-gradient-to-r from-cyan-900/40 to-blue-900/20 border-b border-cyan-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <Terminal className="w-5 h-5 text-cyan-400" />
                            <span className="text-sm font-mono text-cyan-100 tracking-widest font-bold">LIVE_CONSOLE_OUTPUT</span>
                        </div>
                        <div className="flex gap-2">
                            <div className="w-3.5 h-3.5 rounded-full bg-red-500/50 border border-red-400 shadow-[0_0_10px_#ef4444]"></div>
                            <div className="w-3.5 h-3.5 rounded-full bg-yellow-500/50 border border-yellow-400 shadow-[0_0_10px_#eab308]"></div>
                            <div className="w-3.5 h-3.5 rounded-full bg-green-500/50 border border-green-400 shadow-[0_0_10px_#22c55e]"></div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {currentJob && (
                        <div className="h-1.5 bg-gray-900 w-full relative overflow-hidden shadow-inner">
                            <motion.div 
                                className={`absolute top-0 left-0 h-full ${currentJob.status === 'FAILED' ? 'bg-red-500 shadow-[0_0_10px_#ef4444]' : currentJob.status === 'COMPLETED' ? 'bg-emerald-500 shadow-[0_0_10px_#10b981]' : 'bg-gradient-to-r from-cyan-400 to-purple-500 shadow-[0_0_15px_#22d3ee]'}`}
                                initial={{ width: 0 }}
                                animate={{ width: `${currentJob.progress}%` }}
                                transition={{ duration: 0.5 }}
                            />
                        </div>
                    )}

                    {/* Terminal Logs Area */}
                    <div className="flex-1 p-5 overflow-y-auto custom-scrollbar font-mono text-sm leading-relaxed">
                        {!currentJob ? (
                            <div className="h-full flex flex-col items-center justify-center text-gray-600 space-y-4">
                                <Database className="w-12 h-12 opacity-20" />
                                <p>Awaiting training instructions...</p>
                            </div>
                        ) : (
                            <div className="space-y-1.5 pb-8">
                                <AnimatePresence>
                                    {currentJob.logs.map((log, idx) => {
                                        // Ignore raw timestamps for JSON extraction
                                        const cleanLog = log.replace(/^\[\d{2}:\d{2}:\d{2}\]\s*/, '');
                                        
                                        if (cleanLog.startsWith('[METRICS]')) {
                                            try {
                                                const metrics = JSON.parse(cleanLog.replace('[METRICS]', '').trim());
                                                return (
                                                    <motion.div key={idx} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="mt-4 mb-4 p-4 bg-gradient-to-br from-emerald-900/40 to-cyan-900/20 border border-emerald-500/30 rounded-xl shadow-[0_0_20px_rgba(16,185,129,0.15)]">
                                                        <h4 className="text-emerald-400 font-bold text-xs mb-2 tracking-widest flex items-center gap-2">
                                                            <Activity className="w-4 h-4" /> PERFORMANCE METRICS
                                                        </h4>
                                                        <div className="grid grid-cols-2 gap-4">
                                                            {Object.entries(metrics).map(([k, v]) => (
                                                                <div key={k} className="bg-black/40 rounded-lg p-3 border border-emerald-500/10">
                                                                    <div className="text-emerald-100/50 text-[10px] uppercase font-bold tracking-wider">{k}</div>
                                                                    <div className="text-emerald-400 text-lg font-black mt-1 drop-shadow-[0_0_5px_#10b981]">{Number(v).toFixed(4)}</div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </motion.div>
                                                );
                                            } catch (e) { return null; }
                                        }

                                        if (cleanLog.startsWith('[EQUITY_CURVE]')) {
                                            try {
                                                const equityData = JSON.parse(cleanLog.replace('[EQUITY_CURVE]', '').trim());
                                                return <EquityCurveChart key={idx} data={equityData} />;
                                            } catch (e) { return null; }
                                        }

                                        if (cleanLog.startsWith('[FEATURE_IMPORTANCE]')) {
                                            try {
                                                const featureData = JSON.parse(cleanLog.replace('[FEATURE_IMPORTANCE]', '').trim());
                                                return <FeatureImportanceChart key={idx} data={featureData} />;
                                            } catch (e) { return null; }
                                        }

                                        let textColor = "text-gray-300";
                                        
                                        if (log.includes("ERROR")) textColor = "text-red-400 drop-shadow-[0_0_5px_#ef4444]";
                                        else if (log.includes("complete") || log.includes("successfully")) textColor = "text-emerald-400 drop-shadow-[0_0_5px_#10b981]";
                                        else if (log.includes("Epoch") || log.includes("Loss")) textColor = "text-cyan-400 drop-shadow-[0_0_5px_#22d3ee]";
                                        else if (log.includes("Fetching") || log.includes("Calculating")) textColor = "text-yellow-400";

                                        return (
                                            <motion.div 
                                                key={idx}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className={`break-words ${textColor}`}
                                            >
                                                <span className="text-cyan-800 mr-3 opacity-50 select-none">root@core:~#</span>
                                                {log}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                
                                {isTraining && (
                                    <div className="flex items-center gap-2 text-cyan-400 mt-4 animate-pulse">
                                        <span className="text-cyan-800">root@core:~#</span>
                                        <span className="w-2.5 h-5 bg-cyan-400 shadow-[0_0_8px_#22d3ee]"></span>
                                    </div>
                                )}
                                <div ref={logsEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Footer Status */}
                    {currentJob && (
                        <div className={`px-6 py-3 text-xs font-mono font-bold flex items-center justify-between ${
                            currentJob.status === 'COMPLETED' ? 'bg-emerald-500/20 text-emerald-400 border-t border-emerald-500/30' : 
                            currentJob.status === 'FAILED' ? 'bg-red-500/20 text-red-400 border-t border-red-500/30' : 
                            'bg-cyan-500/10 text-cyan-400 border-t border-cyan-500/20'
                        }`}>
                            <div className="flex items-center gap-2 tracking-widest">
                                {currentJob.status === 'COMPLETED' ? <CheckCircle2 className="w-4 h-4" /> : 
                                 currentJob.status === 'FAILED' ? <XCircle className="w-4 h-4" /> : 
                                 <Loader2 className="w-4 h-4 animate-spin" />}
                                SYSTEM_STATUS: {currentJob.status}
                            </div>
                            <div>
                                {currentJob.progress.toFixed(0)}%
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* ── Floating Training Chart FAB ─────────────────────────────────── */}
            <FloatingTVChartButton symbol={symbol} exchange={exchange} />
        </div>
    );
};

export default ModelTrainingStudio;
