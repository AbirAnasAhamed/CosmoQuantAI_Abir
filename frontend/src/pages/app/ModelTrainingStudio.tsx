import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { BrainCircuit, Play, Square, Settings, Database, Activity, Terminal, CheckCircle2, XCircle, Loader2, Trash2 } from 'lucide-react';
import { mlTrainingService, TrainingJob } from '@/services/mlTrainingService';
import apiClient from '@/services/client';

const ModelTrainingStudio: React.FC = () => {
    const [symbol, setSymbol] = useState('BTC/USDT');
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
    
    const [isTraining, setIsTraining] = useState(false);
    const [isClearing, setIsClearing] = useState(false);
    const [currentJob, setCurrentJob] = useState<TrainingJob | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    const INDICATORS = ['RSI', 'MACD', 'BBANDS'];
    const ALGORITHMS = ['Random Forest', 'XGBoost', 'LSTM'];
    const TIMEFRAMES = ['5m', '15m', '1h', '4h', '1d'];

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
                    resample_l2: dataSource === 'l2_orderbook' ? isResampleL2 : undefined
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

    return (
        <div className="h-full flex flex-col space-y-6">
            <header className="flex items-center justify-between">
                <div>
                    <h2 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 to-orange-400 flex items-center gap-3">
                        <BrainCircuit className="w-8 h-8 text-red-500" />
                        Model Training Studio
                    </h2>
                    <p className="text-slate-500 dark:text-slate-400 mt-1">Train machine learning models with real market data natively.</p>
                </div>
            </header>

            <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-6 min-h-0">
                {/* Configuration Panel (Left) */}
                <div className="lg:col-span-4 flex flex-col bg-white dark:bg-[#0A0A0A] border border-gray-200 dark:border-white/10 rounded-2xl p-6 shadow-xl relative overflow-hidden h-full overflow-y-auto custom-scrollbar">
                    {/* Glass reflection */}
                    <div className="absolute top-0 inset-x-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent"></div>
                    
                    <h3 className="text-lg font-semibold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <Settings className="w-5 h-5 text-brand-primary" />
                        Training Configuration
                    </h3>

                    <div className="space-y-5 flex-1">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Asset Symbol</label>
                            <input 
                                type="text" 
                                value={symbol} 
                                onChange={e => setSymbol(e.target.value.toUpperCase())}
                                disabled={isTraining}
                                className="w-full bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary outline-none transition-all disabled:opacity-50"
                                placeholder="e.g., BTC/USDT or AAPL"
                            />
                        </div>

                        {(dataSource === 'ohlcv' || isResampleL2) && (
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Candle Interval</label>
                                <div className="grid grid-cols-5 gap-2">
                                {TIMEFRAMES.map(tf => (
                                    <button
                                        key={tf}
                                        disabled={isTraining}
                                        onClick={() => setTimeframe(tf)}
                                        className={`py-2 rounded-xl text-sm font-medium transition-all ${timeframe === tf ? 'bg-brand-primary/10 text-brand-primary border border-brand-primary/20' : 'bg-gray-50 dark:bg-white/5 text-slate-500 hover:bg-gray-100 dark:hover:bg-white/10 border border-transparent'}`}
                                    >
                                        {tf}
                                    </button>
                                ))}
                            </div>
                        </div>
                        )}

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Algorithm</label>
                            <div className="space-y-2">
                                {ALGORITHMS.map(algo => (
                                    <label key={algo} className={`flex items-center p-3 rounded-xl border cursor-pointer transition-all ${algorithm === algo ? 'border-brand-primary bg-brand-primary/5' : 'border-gray-200 dark:border-white/10 bg-transparent hover:bg-gray-50 dark:hover:bg-white/5'}`}>
                                        <input 
                                            type="radio" 
                                            name="algorithm" 
                                            value={algo}
                                            checked={algorithm === algo}
                                            onChange={() => setAlgorithm(algo)}
                                            disabled={isTraining}
                                            className="text-brand-primary focus:ring-brand-primary bg-gray-800 border-gray-600"
                                        />
                                        <span className="ml-3 text-sm text-slate-700 dark:text-slate-200 font-medium">{algo}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Epochs / Trees</label>
                            <input 
                                type="number" 
                                value={epochs} 
                                onChange={e => setEpochs(parseInt(e.target.value))}
                                disabled={isTraining}
                                min={1}
                                max={500}
                                className="w-full bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary outline-none transition-all disabled:opacity-50"
                            />
                        </div>

                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                    <Database className="w-4 h-4" /> Data Source
                                </label>
                                <button 
                                    onClick={handleClearL2Cache}
                                    disabled={isTraining || isClearing}
                                    className="text-xs text-red-500 hover:text-red-600 flex items-center gap-1 bg-red-500/10 px-2 py-1 rounded transition-all"
                                >
                                    {isClearing ? <Loader2 className="w-3 h-3 animate-spin"/> : <Trash2 className="w-3 h-3" />}
                                    Clear L2 Cache
                                </button>
                            </div>
                            <div className="grid grid-cols-2 gap-2 mb-4">
                                <button
                                    onClick={() => setDataSource('ohlcv')}
                                    disabled={isTraining}
                                    className={`py-2 rounded-xl text-sm font-medium transition-all ${dataSource === 'ohlcv' ? 'bg-brand-primary text-white' : 'bg-gray-50 dark:bg-white/5 text-slate-500 hover:bg-gray-100 dark:hover:bg-white/10'}`}
                                >
                                    Standard OHLCV
                                </button>
                                <button
                                    onClick={() => setDataSource('l2_orderbook')}
                                    disabled={isTraining}
                                    className={`py-2 rounded-xl text-sm font-medium transition-all ${dataSource === 'l2_orderbook' ? 'bg-brand-primary text-white' : 'bg-gray-50 dark:bg-white/5 text-slate-500 hover:bg-gray-100 dark:hover:bg-white/10'}`}
                                >
                                    Level 2 Orderbook
                                </button>
                            </div>
                            
                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Training Data Lookback (Hours)</label>
                                <select 
                                    value={dataLookback}
                                    onChange={(e) => setDataLookback(Number(e.target.value))}
                                    disabled={isTraining}
                                    className="w-full bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary outline-none transition-all disabled:opacity-50"
                                >
                                    <option value={1}>Last 1 Hour</option>
                                    <option value={6}>Last 6 Hours</option>
                                    <option value={12}>Last 12 Hours</option>
                                    <option value={24}>Last 24 Hours</option>
                                </select>
                                <p className="text-xs text-slate-500 mt-1 ml-1">Amount of historical data to use for training.</p>
                            </div>

                            {dataSource === 'l2_orderbook' && (
                                <div className="flex items-center justify-between p-3 bg-brand-primary/5 rounded-xl border border-brand-primary/10">
                                    <div>
                                        <h4 className="text-sm font-medium text-brand-primary">Resample to Candle Interval</h4>
                                        <p className="text-xs text-slate-500 mt-0.5">Group High-Frequency tick data into {timeframe} candles.</p>
                                    </div>
                                    <label className="relative inline-flex items-center cursor-pointer">
                                        <input 
                                            type="checkbox" 
                                            className="sr-only peer" 
                                            checked={isResampleL2}
                                            onChange={() => setIsResampleL2(!isResampleL2)}
                                            disabled={isTraining}
                                        />
                                        <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all dark:border-gray-600 peer-checked:bg-brand-primary"></div>
                                    </label>
                                </div>
                            )}
                        </div>

                        {dataSource === 'ohlcv' && (
                            <>
                                <div>
                                    <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Historical Period (OHLCV)</label>
                                <select 
                                    value={ohlcvPeriod}
                                    onChange={(e) => setOhlcvPeriod(e.target.value)}
                                    disabled={isTraining}
                                    className="w-full bg-gray-50 dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-xl px-4 py-2.5 text-sm text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary/50 focus:border-brand-primary outline-none transition-all disabled:opacity-50"
                                >
                                    {timeframe === '1d' ? (
                                        <>
                                            <option value="1mo">1 Month</option>
                                            <option value="3mo">3 Months</option>
                                            <option value="6mo">6 Months</option>
                                            <option value="1y">1 Year</option>
                                            <option value="2y">2 Years</option>
                                            <option value="5y">5 Years</option>
                                            <option value="max">Max Available</option>
                                        </>
                                    ) : (
                                        <>
                                            <option value="1d">1 Day</option>
                                            <option value="5d">5 Days</option>
                                            <option value="1mo">1 Month</option>
                                            <option value="60d">60 Days (Max for Intraday)</option>
                                        </>
                                    )}
                                </select>
                                <p className="text-xs text-slate-500 mt-1 ml-1">Total history to download from Yahoo Finance.</p>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-2">
                                    <Activity className="w-4 h-4" /> Feature Engineering
                                </label>
                                <div className="flex flex-wrap gap-2">
                                    {INDICATORS.map(ind => (
                                        <button
                                            key={ind}
                                            disabled={isTraining}
                                            onClick={() => handleToggleIndicator(ind)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${selectedIndicators.includes(ind) ? 'bg-brand-primary text-white border-brand-primary' : 'bg-transparent text-slate-500 border-gray-200 dark:border-gray-700 hover:border-gray-400'}`}
                                        >
                                            {ind}
                                        </button>
                                    ))}
                                </div>
                            </div>
                            </>
                        )}


                        <div className="p-4 bg-gray-50 dark:bg-white/5 rounded-xl border border-gray-200 dark:border-white/10 space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-sm font-semibold text-slate-800 dark:text-white">Auto Retrain</h4>
                                    <p className="text-xs text-slate-500 mt-0.5">Keep model updated with fresh data automatically</p>
                                </div>
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input 
                                        type="checkbox" 
                                        className="sr-only peer" 
                                        checked={isAutoRetrain}
                                        onChange={() => setIsAutoRetrain(!isAutoRetrain)}
                                        disabled={isTraining}
                                    />
                                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer dark:bg-gray-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-gray-600 peer-checked:bg-brand-primary"></div>
                                </label>
                            </div>
                            
                            {isAutoRetrain && (
                                <div>
                                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">Retrain Interval (Hours)</label>
                                    <select 
                                        value={retrainInterval}
                                        onChange={(e) => setRetrainInterval(Number(e.target.value))}
                                        disabled={isTraining}
                                        className="w-full bg-white dark:bg-black/50 border border-gray-200 dark:border-white/10 rounded-lg px-3 py-2 text-sm text-slate-900 dark:text-white outline-none"
                                    >
                                        <option value={1}>Every 1 Hour</option>
                                        <option value={6}>Every 6 Hours</option>
                                        <option value={12}>Every 12 Hours</option>
                                        <option value={24}>Every 24 Hours</option>
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-6 mt-4 border-t border-gray-200 dark:border-white/10">
                        <button 
                            onClick={handleStartTraining}
                            disabled={isTraining || !symbol}
                            className={`w-full py-3.5 rounded-xl font-bold flex items-center justify-center gap-2 transition-all shadow-lg ${isTraining ? 'bg-gray-200 dark:bg-gray-800 text-gray-400 cursor-not-allowed shadow-none' : 'bg-gradient-to-r from-red-600 to-red-500 text-white hover:shadow-red-500/25 hover:-translate-y-0.5'}`}
                        >
                            {isTraining ? <><Loader2 className="w-5 h-5 animate-spin" /> Training in Progress...</> : <><Play className="w-5 h-5 fill-current" /> Start Deep Training</>}
                        </button>
                    </div>
                </div>

                {/* Live Execution Terminal (Right) */}
                <div className="lg:col-span-8 flex flex-col bg-[#050505] border border-gray-800 rounded-2xl shadow-2xl overflow-hidden h-full relative">
                    {/* Header */}
                    <div className="px-4 py-3 bg-[#111111] border-b border-gray-800 flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Terminal className="w-4 h-4 text-gray-400" />
                            <span className="text-xs font-mono text-gray-400 tracking-wider">LIVE_CONSOLE_OUTPUT</span>
                        </div>
                        <div className="flex gap-1.5">
                            <div className="w-3 h-3 rounded-full bg-red-500/20 border border-red-500/50"></div>
                            <div className="w-3 h-3 rounded-full bg-yellow-500/20 border border-yellow-500/50"></div>
                            <div className="w-3 h-3 rounded-full bg-green-500/20 border border-green-500/50"></div>
                        </div>
                    </div>

                    {/* Progress Bar */}
                    {currentJob && (
                        <div className="h-1 bg-gray-900 w-full relative overflow-hidden">
                            <motion.div 
                                className={`absolute top-0 left-0 h-full ${currentJob.status === 'FAILED' ? 'bg-red-500' : currentJob.status === 'COMPLETED' ? 'bg-emerald-500' : 'bg-brand-primary'}`}
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
                                        // Highlight specific keywords for terminal feel
                                        let coloredLog = log;
                                        let textColor = "text-gray-300";
                                        
                                        if (log.includes("ERROR")) textColor = "text-red-400";
                                        else if (log.includes("complete") || log.includes("successfully")) textColor = "text-emerald-400";
                                        else if (log.includes("Epoch") || log.includes("Loss")) textColor = "text-cyan-400";
                                        else if (log.includes("Fetching") || log.includes("Calculating")) textColor = "text-yellow-400";

                                        return (
                                            <motion.div 
                                                key={idx}
                                                initial={{ opacity: 0, x: -10 }}
                                                animate={{ opacity: 1, x: 0 }}
                                                className={`break-words ${textColor}`}
                                            >
                                                <span className="text-gray-600 mr-3 opacity-50 select-none">~</span>
                                                {coloredLog}
                                            </motion.div>
                                        );
                                    })}
                                </AnimatePresence>
                                
                                {isTraining && (
                                    <div className="flex items-center gap-2 text-brand-primary mt-4 animate-pulse">
                                        <span className="text-gray-600">~</span>
                                        <span className="w-2 h-4 bg-brand-primary"></span>
                                    </div>
                                )}
                                <div ref={logsEndRef} />
                            </div>
                        )}
                    </div>

                    {/* Footer Status */}
                    {currentJob && (
                        <div className={`px-4 py-2 text-xs font-mono font-bold flex items-center justify-between ${
                            currentJob.status === 'COMPLETED' ? 'bg-emerald-500/10 text-emerald-500 border-t border-emerald-500/20' : 
                            currentJob.status === 'FAILED' ? 'bg-red-500/10 text-red-500 border-t border-red-500/20' : 
                            'bg-brand-primary/5 text-brand-primary border-t border-brand-primary/10'
                        }`}>
                            <div className="flex items-center gap-2">
                                {currentJob.status === 'COMPLETED' ? <CheckCircle2 className="w-4 h-4" /> : 
                                 currentJob.status === 'FAILED' ? <XCircle className="w-4 h-4" /> : 
                                 <Loader2 className="w-4 h-4 animate-spin" />}
                                STATUS: {currentJob.status}
                            </div>
                            <div>
                                {currentJob.progress.toFixed(0)}%
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ModelTrainingStudio;
