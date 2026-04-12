import React, { useState, useEffect } from 'react';
import { useBacktest } from '@/context/BacktestContext';
import SearchableSelect from '@/components/common/SearchableSelect';
import DatePicker from "react-datepicker";
import "react-datepicker/dist/react-datepicker.css";
import {
    UploadCloud, RefreshCw, ShieldCheck, ShieldAlert, Wallet, Calendar, Clock, History,
    ChevronLeft, ChevronRight, PlusCircle, CheckSquare, Square
} from 'lucide-react';
import { StrategyBuilderModal } from './StrategyBuilderModal';
import { StrategyParams } from './StrategyParams';
import { getYear, getMonth } from 'date-fns';
import Button from '@/components/common/Button';
import { marketDataService } from '@/services/marketData';
import { SavedIndicator } from '@/types';

// Constants
const range = (start: number, end: number, step = 1) => {
    const result = [];
    for (let i = start; i <= end; i += step) {
        result.push(i);
    }
    return result;
};

const DEFAULT_TIMEFRAMES = ["1m", "5m", "15m", "1h", "4h", "1d"];

interface BacktestFormProps {
    strategies: string[];
    customStrategies: string[];
    strategy: string;
    setStrategy: (s: string) => void;
    exchanges: string[];
    selectedExchange: string;
    setSelectedExchange: (e: string) => void;
    markets: string[];
    symbol: string;
    setSymbol: (s: string) => void;
    timeframe: string;
    setTimeframe: (t: string) => void;
    startDate: string;
    setStartDate: (d: string) => void;
    endDate: string;
    setEndDate: (d: string) => void;
    dataSource: 'database' | 'csv';
    setDataSource: (source: 'database' | 'csv') => void;
    handleDataFileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
    isUploadingData: boolean;
    dataFileInputRef: React.RefObject<HTMLInputElement>;
    // ❌ REMOVED: tradeFiles, selectedTradeFile, handleConvertTradesToCandles, isConverting
    csvFileName: string;
    handleSyncData: () => void;
    isSyncing: boolean;
    syncProgress: number;
    syncStatusText: string;
    enableRiskManagement: boolean;
    setEnableRiskManagement: (v: boolean) => void;
    initialCash: number;
    setInitialCash: (v: number) => void;
    mode: 'backtest' | 'optimization' | 'walk_forward' | 'batch';
    setMode: (m: 'backtest' | 'optimization' | 'walk_forward' | 'batch') => void;

    // WFA Specific State Props
    wfaTrainWindow: number;
    setWfaTrainWindow: (n: number) => void;
    wfaTestWindow: number;
    setWfaTestWindow: (n: number) => void;
    wfaMethod: string;
    setWfaMethod: (s: string) => void;
    wfaPopSize: number;
    setWfaPopSize: (n: number) => void;
    wfaGenerations: number;
    setWfaGenerations: (n: number) => void;
    wfaOptTarget: string;
    setWfaOptTarget: (s: string) => void;
    wfaMinTrades: number;
    setWfaMinTrades: (n: number) => void;

    // Batch Props
    batchStrategies: string[];
    setBatchStrategies: (list: string[]) => void;

    // Params Props
    activeTab: string;
    params: any; setParams: any;
    optimizationParams: any; setOptimizationParams: any;
    optimizableParams: any;
    optimizationMethod: any; setOptimizationMethod: any;
    gaParams: any; setGaParams: any;
    // New Props for Indicators
    savedIndicators: SavedIndicator[];
    selectedIndicatorId: number | null;
    setSelectedIndicatorId: (id: number | null) => void;
}

export const BacktestForm: React.FC<BacktestFormProps> = ({
    strategies,
    customStrategies,
    strategy,
    setStrategy,
    exchanges,
    selectedExchange,
    setSelectedExchange,
    markets,
    symbol,
    setSymbol,
    timeframe,
    setTimeframe,
    startDate,
    setStartDate,
    endDate,
    setEndDate,
    dataSource,
    setDataSource,
    handleDataFileUpload,
    isUploadingData,
    dataFileInputRef,
    // ❌ REMOVED: Convert props from destructuring
    csvFileName,
    handleSyncData,
    isSyncing,
    syncProgress,
    syncStatusText,
    enableRiskManagement,
    setEnableRiskManagement,
    initialCash,
    setInitialCash,
    mode, setMode,
    wfaTrainWindow, setWfaTrainWindow,
    wfaTestWindow, setWfaTestWindow,
    wfaMethod, setWfaMethod,
    wfaPopSize, setWfaPopSize,
    wfaGenerations, setWfaGenerations,
    wfaOptTarget, setWfaOptTarget,
    wfaMinTrades, setWfaMinTrades,
    batchStrategies, setBatchStrategies,
    activeTab,
    params, setParams,
    optimizationParams, setOptimizationParams,

    optimizableParams,
    optimizationMethod, setOptimizationMethod,
    gaParams, setGaParams,
    savedIndicators, selectedIndicatorId, setSelectedIndicatorId
}) => {
    const {
        commission, setCommission,
        slippage, setSlippage,
        leverage, setLeverage,
        secondaryTimeframe, setSecondaryTimeframe,
        stopLoss, setStopLoss,
        takeProfit, setTakeProfit,
        trailingStop, setTrailingStop
    } = useBacktest();

    const toggleBatchStrategy = (strat: string) => {
        if (batchStrategies.includes(strat)) {
            setBatchStrategies(batchStrategies.filter(s => s !== strat));
        } else {
            setBatchStrategies([...batchStrategies, strat]);
        }
    };

    const safeStrategies = strategies || [];
    const safeCustomStrategies = customStrategies || [];
    const uniqueCustomStrategies = safeCustomStrategies.filter(s => !safeStrategies.includes(s));
    const allBatchStrategies = Array.from(new Set([...safeStrategies, ...safeCustomStrategies]));

    const [availableTimeframes, setAvailableTimeframes] = useState<string[]>(DEFAULT_TIMEFRAMES);
    const [isLoadingTimeframes, setIsLoadingTimeframes] = useState(false);
    const [isBuilderOpen, setIsBuilderOpen] = useState(false);

    useEffect(() => {
        const fetchTimeframes = async () => {
            if (!selectedExchange) return;
            setIsLoadingTimeframes(true);
            try {
                const tfs = await marketDataService.getExchangeTimeframes(selectedExchange);
                setAvailableTimeframes(tfs);
            } catch (error) {
                console.error("Failed to fetch timeframes:", error);
                setAvailableTimeframes(DEFAULT_TIMEFRAMES);
            } finally {
                setIsLoadingTimeframes(false);
            }
        };
        fetchTimeframes();
    }, [selectedExchange]);

    const inputBaseClasses = "w-full bg-white dark:bg-brand-dark/50 border border-brand-border-light dark:border-brand-border-dark rounded-md p-2 text-slate-900 dark:text-white focus:ring-brand-primary focus:border-brand-primary";

    const handlePresetChange = (days: number) => {
        const end = new Date();
        const start = new Date();
        start.setDate(end.getDate() - days);
        setEndDate(end.toISOString().split('T')[0]);
        setStartDate(start.toISOString().split('T')[0]);
    };

    const presetOptions = [
        { label: '1W', days: 7 },
        { label: '1M', days: 30 },
        { label: '3M', days: 90 },
        { label: '6M', days: 180 },
        { label: '1Y', days: 365 },
        { label: 'YTD', days: Math.floor((new Date().getTime() - new Date(new Date().getFullYear(), 0, 1).getTime()) / (1000 * 60 * 60 * 24)) },
    ];

    const CustomInputHeader = ({
        date, changeYear, changeMonth, decreaseMonth, increaseMonth, prevMonthButtonDisabled, nextMonthButtonDisabled,
    }: any) => {
        const years = range(1990, getYear(new Date()) + 1, 1);
        const months = [
            "January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December",
        ];
        return (
            <div className="m-2 flex items-center justify-between px-2 py-2 bg-white dark:bg-slate-800 rounded-lg border-b border-gray-200 dark:border-gray-700">
                <button onClick={decreaseMonth} disabled={prevMonthButtonDisabled} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50" type="button"><ChevronLeft size={18} /></button>
                <div className="flex gap-2">
                    <select value={months[getMonth(date)]} onChange={({ target: { value } }) => changeMonth(months.indexOf(value))} className="bg-transparent text-sm font-bold text-slate-800 dark:text-white cursor-pointer focus:outline-none hover:text-brand-primary dark:hover:text-brand-primary transition-colors appearance-none text-center">
                        {months.map((option) => (<option key={option} value={option} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{option}</option>))}
                    </select>
                    <select value={getYear(date)} onChange={({ target: { value } }) => changeYear(Number(value))} className="bg-transparent text-sm font-bold text-slate-800 dark:text-white cursor-pointer focus:outline-none hover:text-brand-primary dark:hover:text-brand-primary transition-colors appearance-none text-center">
                        {years.map((option) => (<option key={option} value={option} className="bg-white dark:bg-slate-800 text-slate-900 dark:text-white">{option}</option>))}
                    </select>
                </div>
                <button onClick={increaseMonth} disabled={nextMonthButtonDisabled} className="p-1 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full text-slate-600 dark:text-slate-300 transition-colors disabled:opacity-50" type="button"><ChevronRight size={18} /></button>
            </div>
        );
    };

    return (
        <div className="space-y-6">
            {/* Control Panel Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">Settings</h2>
                <Button variant="secondary" onClick={handleSyncData} disabled={isSyncing} className={`transition-all duration-300 ${isSyncing ? 'bg-blue-50 text-blue-600 border-blue-200' : ''}`}>
                    {isSyncing ? (<span className="flex items-center gap-2"><RefreshCw className="animate-spin" size={16} /> Syncing...</span>) : (<span className="flex items-center gap-2"><UploadCloud size={16} /> Sync Data</span>)}
                </Button>
            </div>

            {/* Sync Progress */}
            {isSyncing && (
                <div className="mb-4 p-4 rounded-xl border border-blue-100 dark:border-blue-900/30 bg-blue-50/50 dark:bg-blue-900/10 backdrop-blur-sm shadow-sm animate-fade-in">
                    <div className="flex justify-between items-center mb-2">
                        <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">{syncStatusText}</span>
                        <span className="text-sm font-bold text-blue-600 dark:text-blue-400">{syncProgress}%</span>
                    </div>
                    <div className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-500 ease-out" style={{ width: `${syncProgress}%` }} />
                    </div>
                </div>
            )}

            {/* Data Source Selection */}
            <div className="mb-6 border-b border-gray-200 dark:border-gray-700 pb-4">
                <label className="text-sm font-semibold text-gray-500 mb-2 block">Data Source</label>
                <div className="flex gap-4">
                    <button onClick={() => setDataSource('database')} className={`flex-1 flex items-center gap-2 px-4 py-3 border rounded-lg transition-all ${dataSource === 'database' ? 'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <span className="text-lg">🗄️</span>
                        <div className="text-left">
                            <div className="font-semibold text-sm text-slate-900 dark:text-white">Exchange Database</div>
                            <div className="text-xs text-gray-500">Sync from Binance/Bybit</div>
                        </div>
                    </button>
                    <button onClick={() => setDataSource('csv')} className={`flex-1 flex items-center gap-2 px-4 py-3 border rounded-lg transition-all ${dataSource === 'csv' ? 'border-brand-primary bg-brand-primary/5 ring-2 ring-brand-primary/20' : 'border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800'}`}>
                        <span className="text-lg">📂</span>
                        <div className="text-left">
                            <div className="font-semibold text-sm text-slate-900 dark:text-white">Upload CSV</div>
                            <div className="text-xs text-gray-500">Use local OHLCV data</div>
                        </div>
                    </button>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {dataSource === 'database' && (
                    <>
                        <div>
                            <label className="block text-sm font-medium text-gray-500 mb-1">Exchange</label>
                            <select className={inputBaseClasses} value={selectedExchange} onChange={(e) => setSelectedExchange(e.target.value)}>
                                {exchanges.map(ex => <option key={ex} value={ex}>{ex.toUpperCase()}</option>)}
                            </select>
                        </div>
                        <div>
                            <SearchableSelect label="Market Pair" options={markets} value={symbol} onChange={setSymbol} />
                        </div>
                    </>
                )}

                {/* ✅ UPDATED: Cleaned up CSV Section (Convert section removed) */}
                {dataSource === 'csv' && (
                    <div className="col-span-2">
                        <label className="block text-sm font-medium text-gray-500 mb-1">Upload Data (CSV)</label>
                        <div className="flex gap-2">
                            <input type="file" ref={dataFileInputRef} onChange={handleDataFileUpload} className="hidden" accept=".csv" />
                            <Button variant="outline" onClick={() => dataFileInputRef.current?.click()} className="w-full h-10 border-dashed border-2 flex items-center justify-center gap-2">
                                <UploadCloud size={16} /> {isUploadingData ? 'Uploading...' : 'Choose CSV'}
                            </Button>
                        </div>
                        {csvFileName && <p className="text-xs text-green-600 mt-1">✅ {csvFileName}</p>}
                    </div>
                )}

                {mode !== 'batch' ? (
                    <div>
                        {/* Indicator Selector */}
                        <div className="mb-4 p-3 bg-indigo-50 dark:bg-slate-900 border border-indigo-200 dark:border-indigo-900 rounded-lg">
                            <label className="block text-xs font-bold text-indigo-700 dark:text-indigo-400 mb-1">Use Saved Indicator (Optional)</label>
                            <select
                                className={inputBaseClasses}
                                value={selectedIndicatorId || ''}
                                onChange={(e) => {
                                    const val = e.target.value ? Number(e.target.value) : null;
                                    setSelectedIndicatorId(val);
                                    if (val) {
                                        // Optional: Clear strategy selection to avoid confusion?
                                        // or setStrategy('')
                                    }
                                }}
                            >
                                <option value="">-- No Indicator (Use Strategy Below) --</option>
                                {savedIndicators.map(ind => (
                                    <option key={ind.id} value={ind.id}>
                                        {ind.name} ({ind.baseType || ind.base_type || 'Custom'})
                                    </option>
                                ))}
                            </select>
                        </div>

                        <div className={`transition-opacity duration-300 ${selectedIndicatorId ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
                            <div className="flex justify-between items-center mb-1">
                                <label className="block text-sm font-medium text-gray-500">Strategy</label>
                                <button onClick={() => setIsBuilderOpen(true)} className="text-xs flex items-center gap-1 text-brand-primary hover:text-brand-primary/80 font-semibold transition-colors"><PlusCircle size={12} /> New</button>
                            </div>
                            <select className={inputBaseClasses} value={strategy} onChange={(e) => setStrategy(e.target.value)}>
                                <optgroup label="Strategy Library">{safeStrategies.map(s => <option key={`lib-${s}`} value={s}>{s}</option>)}</optgroup>
                                {uniqueCustomStrategies.length > 0 && (<optgroup label="My Custom Strategies">{uniqueCustomStrategies.map(s => <option key={`cust-${s}`} value={s}>{s}</option>)}</optgroup>)}
                            </select>
                        </div>
                    </div>
                ) : (
                    <div className="bg-gray-50 dark:bg-slate-800 p-4 rounded-lg border border-gray-200 dark:border-gray-700 col-span-1 md:col-span-2 lg:col-span-3">
                        <h3 className="text-sm font-bold mb-3 flex items-center gap-2 text-slate-700 dark:text-slate-300"><CheckSquare size={16} /> Select Strategies for Batch Run</h3>
                        <div className="h-40 overflow-y-auto border border-gray-300 dark:border-gray-600 rounded p-2 bg-white dark:bg-slate-900 grid grid-cols-2 md:grid-cols-3 gap-2">
                            {allBatchStrategies.length > 0 ? (allBatchStrategies.map(s => (
                                <div key={`batch-${s}`} onClick={() => toggleBatchStrategy(s)} className={`flex items-center gap-2 p-2 rounded cursor-pointer transition-colors border select-none ${(batchStrategies || []).includes(s) ? 'bg-blue-100 dark:bg-blue-900/30 border-blue-500' : 'hover:bg-gray-100 dark:hover:bg-gray-800 border-transparent'}`}>
                                    {(batchStrategies || []).includes(s) ? <CheckSquare size={14} className="text-blue-600" /> : <Square size={14} className="text-gray-400" />}
                                    <span className="text-xs font-medium text-slate-700 dark:text-slate-300 truncate" title={s}>{s}</span>
                                </div>
                            ))) : (<div className="col-span-full flex flex-col items-center justify-center text-gray-400 h-full"><ShieldAlert size={24} className="mb-2 opacity-50" /><span className="text-xs">No strategies found available for batch testing.</span></div>)}
                        </div>
                        <div className="flex justify-between items-center mt-2">
                            <p className="text-xs text-gray-500">Selected: {(batchStrategies || []).length}</p>
                            <div className="flex gap-2">
                                <button onClick={() => setBatchStrategies(allBatchStrategies)} className="text-[10px] text-blue-600 hover:underline">Select All</button>
                                <button onClick={() => setBatchStrategies([])} className="text-[10px] text-gray-500 hover:underline">Clear</button>
                            </div>
                        </div>
                    </div>
                )}

                {/* Rest of the UI (Params, WFA, Optimization, Timeframe, Dates) - KEPT SAME */}
                {mode !== 'batch' && (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3">
                        <StrategyParams mode={(mode === 'optimization' || mode === 'walk_forward') ? 'optimization' : 'single'} activeParamsConfig={optimizableParams} params={params} setParams={setParams} optimizationParams={optimizationParams} setOptimizationParams={setOptimizationParams} optimizationMethod={optimizationMethod} setOptimizationMethod={setOptimizationMethod} hideOptimizationMethod={mode === 'walk_forward'} gaParams={gaParams} setGaParams={setGaParams} />
                    </div>
                )}

                {/* ... (WFA and Optimization config sections kept as is) ... */}
                {mode === 'walk_forward' && (
                    <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-blue-50/50 dark:bg-blue-900/10 border border-blue-200 dark:border-blue-800 rounded-xl p-4 animate-fade-in space-y-4 mb-6">
                        <div className="flex items-center gap-2 border-b border-blue-200 dark:border-blue-800 pb-2">
                            <h3 className="text-sm font-bold text-blue-800 dark:text-blue-300">WFA Configuration</h3>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Training Window</label><input type="number" value={wfaTrainWindow} onChange={(e) => setWfaTrainWindow(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-gray-700 rounded p-2 text-sm" /></div>
                            <div><label className="text-xs font-semibold text-gray-500 mb-1 block">Testing Window</label><input type="number" value={wfaTestWindow} onChange={(e) => setWfaTestWindow(Number(e.target.value))} className="w-full bg-white dark:bg-slate-900 border border-gray-300 dark:border-gray-700 rounded p-2 text-sm" /></div>
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Timeframe {isLoadingTimeframes && <span className="text-xs text-brand-primary ml-2 animate-pulse">Loading...</span>}</label>
                    <select className={inputBaseClasses} value={timeframe} onChange={(e) => setTimeframe(e.target.value)} disabled={isLoadingTimeframes}>
                        {availableTimeframes.map(t => (<option key={t} value={t}>{t}</option>))}
                    </select>
                </div>
                <div>
                    <label className="block text-sm font-medium text-gray-500 mb-1">Secondary TF</label>
                    <select className={inputBaseClasses} value={secondaryTimeframe} onChange={(e) => setSecondaryTimeframe(e.target.value)}><option value="">None</option>{availableTimeframes.map(t => (<option key={t} value={t}>{t}</option>))}</select>
                </div>

                <div className="col-span-1 md:col-span-2 lg:col-span-3 bg-gray-50 dark:bg-slate-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="flex items-center gap-2 mb-3"><History size={16} className="text-brand-primary" /><label className="text-sm font-bold text-slate-700 dark:text-slate-300">Time Horizon</label></div>
                    <div className="flex flex-col lg:flex-row gap-4 items-end">
                        <div className="flex-1 grid grid-cols-2 gap-4 w-full">
                            <div className="relative group">
                                <label className="text-xs font-semibold text-gray-500 mb-1.5 block ml-1">Start Date</label>
                                <DatePicker selected={startDate ? new Date(startDate) : null} onChange={(date: Date) => setStartDate(date?.toISOString().split('T')[0] || '')} className={`${inputBaseClasses} pl-2 font-medium cursor-pointer`} dateFormat="yyyy-MM-dd" placeholderText="Select start" renderCustomHeader={CustomInputHeader} calendarClassName="!bg-white dark:!bg-slate-900 !border-gray-200 dark:!border-gray-700" />
                            </div>
                            <div className="relative group">
                                <label className="text-xs font-semibold text-gray-500 mb-1.5 block ml-1">End Date</label>
                                <DatePicker selected={endDate ? new Date(endDate) : null} onChange={(date: Date) => setEndDate(date?.toISOString().split('T')[0] || '')} className={`${inputBaseClasses} pl-2 font-medium cursor-pointer`} dateFormat="yyyy-MM-dd" placeholderText="Select end" renderCustomHeader={CustomInputHeader} calendarClassName="!bg-white dark:!bg-slate-900 !border-gray-200 dark:!border-gray-700" />
                            </div>
                        </div>
                        <div className="w-full lg:w-auto">
                            <label className="text-xs font-semibold text-gray-500 mb-1.5 block ml-1 lg:text-right px-1">Quick Select</label>
                            <div className="flex bg-white dark:bg-slate-900 rounded-lg border border-gray-200 dark:border-gray-700 p-1">
                                {presetOptions.map((option) => (<button key={option.label} onClick={() => handlePresetChange(option.days)} className="flex-1 px-3 py-1.5 text-xs font-medium rounded-md text-slate-600 dark:text-slate-400 hover:bg-brand-primary/10 hover:text-brand-primary transition-all">{option.label}</button>))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>

            <div className="mt-4 pt-4 border-t border-brand-border-light dark:border-brand-border-dark">
                <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">{enableRiskManagement ? <ShieldCheck size={16} className="text-green-500" /> : <ShieldAlert size={16} className="text-gray-400" />} Risk Management & Execution</h3>
                    <input type="checkbox" checked={enableRiskManagement} onChange={(e) => setEnableRiskManagement(e.target.checked)} className="w-4 h-4 text-brand-primary rounded" />
                </div>
                <div className={`grid grid-cols-2 md:grid-cols-5 gap-4 transition-opacity duration-300 ${enableRiskManagement ? 'opacity-100' : 'opacity-50'}`}>
                    <div><label className="block text-xs text-gray-500 mb-1">Initial Cash ($)</label><input type="number" value={initialCash} onChange={(e) => setInitialCash(Number(e.target.value))} className={`${inputBaseClasses} font-bold text-green-600 dark:text-green-400`} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Commission (%)</label><input type="number" step="0.01" value={commission} onChange={(e) => setCommission(parseFloat(e.target.value))} className={inputBaseClasses} /></div>
                    <div><label className="block text-xs text-gray-500 mb-1">Slippage (%)</label><input type="number" step="0.01" value={slippage} onChange={(e) => setSlippage(parseFloat(e.target.value))} className={inputBaseClasses} /></div>
                    <div className="col-span-2 md:col-span-3">
                        <div className="space-y-2 border border-gray-700 p-2 rounded-lg">
                            <label className="text-xs font-medium text-gray-300 flex justify-between"><span>Leverage (x{leverage})</span><span className="text-[10px] text-gray-500">{leverage > 1 ? "Futures Mode" : "Spot Mode"}</span></label>
                            <div className="flex items-center gap-4"><input type="range" min="1" max="20" step="1" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500" /><input type="number" min="1" max="125" value={leverage} onChange={(e) => setLeverage(Number(e.target.value))} className="w-16 px-2 py-1 bg-gray-800 border border-gray-700 rounded-md text-white text-xs" /></div>
                        </div>
                    </div>
                </div>
            </div>

            <StrategyBuilderModal isOpen={isBuilderOpen} onClose={() => setIsBuilderOpen(false)} onSuccess={() => { window.location.reload(); }} />
        </div>
    );
}
