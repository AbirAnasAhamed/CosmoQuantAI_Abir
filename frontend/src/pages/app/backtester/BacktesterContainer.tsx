import React, { useState, useEffect, useRef } from 'react';
import { useBacktest } from '@/context/BacktestContext';
import { useToast } from '@/context/ToastContext';
import { MOCK_STRATEGIES, MOCK_STRATEGY_PARAMS } from '@/constants';
import {
    fetchCustomStrategyList, fetchStrategyCode, generateStrategy,
    fetchStandardStrategyParams, uploadStrategyFile,
    fetchTradeFiles, revokeBacktestTask,
    uploadBacktestDataFile // ✅ Ensure this is imported
} from '@/services/backtester';
import { indicatorService } from '@/services/indicatorService';
import { SavedIndicator } from '@/types';
import { useMarketData } from './hooks/useMarketData';
import { useBacktestExecution } from './hooks/useBacktestExecution';

import { BacktestForm } from './components/BacktestForm';
import { ResultsPanel } from './components/ResultsPanel';
import { BatchResults } from './components/BatchResults';
import { AIStrategyLab } from './components/AIStrategyLab';
import { DownloadDataModal } from './components/DownloadDataModal';
import { useDownloadData } from './hooks/useDownloadData';

import { WalkForwardResults } from './components/WalkForwardResults';
import { PlayIcon, CodeIcon, Download, GitMerge, Square, LayoutGrid, Layers, UploadCloud } from 'lucide-react';

// --- Helper Functions ---
const parseParamsFromCode = (code: string): Record<string, any> => {
    const match = code.match(/#\s*@params\s*([\s\S]*?)#\s*@params_end/);
    if (match && match[1]) {
        try {
            const jsonString = match[1].replace(/^\s*#\s*/gm, '');
            return JSON.parse(jsonString);
        } catch (e) {
            console.error("Failed to parse param config:", e);
            return {};
        }
    }
    return {};
};

export const BacktesterContainer: React.FC = () => {
    const { showToast } = useToast();
    const {
        exchanges, markets, selectedExchange, setSelectedExchange,
        symbol, setSymbol, handleSyncData, isSyncing, syncProgress, syncStatusText
    } = useMarketData();

    const {
        isDownloadModalOpen, setIsDownloadModalOpen, downloadType, setDownloadType,
        dlExchange, setDlExchange, dlMarkets, dlSymbol, setDlSymbol,
        dlTimeframe, setDlTimeframe, dlStartDate, setDlStartDate, dlEndDate, setDlEndDate,
        isDownloading, downloadProgress, isLoadingDlMarkets,
        handleStartDownload, handleStopDownload,
        tradeFiles: dlTradeFiles,
        selectedTradeFile: dlSelectedTradeFile,
        setSelectedTradeFile: setDlSelectedTradeFile,
        handleConvertData,
        isConverting: isDlConverting
    } = useDownloadData();

    const { execute, isLoading, progress, statusMessage, results, mode: currentMode, taskId } = useBacktestExecution();
    const { commission, slippage, stopLoss, takeProfit, trailingStop, setParams: setContextParams } = useBacktest();

    const [initialCash, setInitialCash] = useState(10000);
    const [enableRiskManagement, setEnableRiskManagement] = useState(true);
    const [activeTab, setActiveTabState] = useState<'single' | 'batch' | 'optimization' | 'walk_forward' | 'editor'>('single');
    const [batchStrategies, setBatchStrategies] = useState<string[]>([]);
    const [allStrategies, setAllStrategies] = useState<string[]>([]);
    const [strategies, setStrategies] = useState<string[]>([]);
    const [customStrategies, setCustomStrategies] = useState<string[]>([]);
    const [savedIndicators, setSavedIndicators] = useState<SavedIndicator[]>([]);
    const [selectedIndicatorId, setSelectedIndicatorId] = useState<number | null>(null);
    const [strategy, setStrategy] = useState('');
    const [timeframe, setTimeframe] = useState('1h');
    const [startDate, setStartDate] = useState('2023-01-01');
    const [endDate, setEndDate] = useState(new Date().toISOString().split('T')[0]);
    const [mode, setMode] = useState<'backtest' | 'optimization' | 'walk_forward' | 'batch'>('backtest');

    // WFA States
    const [wfaTrainWindow, setWfaTrainWindow] = useState(90);
    const [wfaTestWindow, setWfaTestWindow] = useState(30);
    const [wfaMethod, setWfaMethod] = useState('grid');
    const [wfaPopSize, setWfaPopSize] = useState(10);
    const [wfaGenerations, setWfaGenerations] = useState(5);
    const [wfaOptTarget, setWfaOptTarget] = useState('profit');
    const [wfaMinTrades, setWfaMinTrades] = useState(5);

    // Params State
    const [params, setParams] = useState<Record<string, any>>({});
    const [optimizationParams, setOptimizationParams] = useState<any>({});
    const [optimizableParams, setOptimizableParams] = useState<Record<string, any>>({});
    const [standardParamsConfig, setStandardParamsConfig] = useState<Record<string, any>>(MOCK_STRATEGY_PARAMS);
    const [optimizationMethod, setOptimizationMethod] = useState<'gridSearch' | 'geneticAlgorithm'>('gridSearch');
    const [gaParams, setGaParams] = useState({ populationSize: 50, generations: 20 });

    const [aiPrompt, setAiPrompt] = useState('');
    const [currentStrategyCode, setCurrentStrategyCode] = useState('# Code will appear here');
    const [isGenerating, setIsGenerating] = useState(false);
    const [fileName, setFileName] = useState('');
    const fileInputRef = useRef<HTMLInputElement>(null);
    const [dataSource, setDataSource] = useState<'database' | 'csv'>('database');
    const [csvFileName, setCsvFileName] = useState('');
    const [isUploadingData, setIsUploadingData] = useState(false);
    const dataFileInputRef = useRef<HTMLInputElement>(null);
    const [resultsTab, setResultsTab] = useState('overview');

    useEffect(() => {
        const loadStrategies = async () => {
            try {
                const [fullList, indicators] = await Promise.all([
                    fetchCustomStrategyList(),
                    indicatorService.getAll().catch(e => { console.error("Err indicators", e); return []; })
                ]);

                setSavedIndicators(indicators || []);

                setSavedIndicators(indicators || []);

                const combined = Array.isArray(fullList) ? fullList : [];

                if (combined.length > 0) {
                    setAllStrategies(combined);
                    setStrategies(combined);
                    setCustomStrategies(combined);
                    setStrategy((prev) => (!prev || !combined.includes(prev)) ? combined[0] : prev);
                }
            } catch (e) {
                console.error("Failed to load strategies:", e);
                showToast("Failed to load strategy list", "error");
            }
        };
        loadStrategies();
    }, []);

    useEffect(() => {
        const updateParams = async () => {
            if (selectedIndicatorId) {
                const ind = savedIndicators.find((i: any) => i.id === selectedIndicatorId);
                if (ind) {
                    // Use indicator code (or placeholder)
                    setCurrentStrategyCode(ind.code || '# Custom Indicator Logic');

                    // Use stored parameters
                    const finalParams = ind.parameters || {};
                    setOptimizableParams(finalParams);

                    const newParams: any = {};
                    const newOptParams: any = {};

                    Object.entries(finalParams).forEach(([key, val]: [string, any]) => {
                        // Simple heuristic for defaults
                        let defaultVal = val;
                        if (typeof val === 'object' && val !== null && 'default' in val) {
                            defaultVal = val.default;
                        }

                        newParams[key] = defaultVal;
                        // Optimize heuristic: +/- 50% or similar
                        let numVal = Number(defaultVal);
                        if (!isNaN(numVal)) {
                            newOptParams[key] = { start: numVal, end: numVal * 2, step: 1 };
                        } else {
                            newOptParams[key] = { start: 0, end: 10, step: 1 };
                        }
                    });

                    setParams(newParams);
                    setOptimizationParams(newOptParams);
                    return;
                }
            }

            const isCustom = customStrategies.includes(strategy);

            if (isCustom) {
                try {
                    const data = await fetchStrategyCode(strategy);
                    setCurrentStrategyCode(data.code);
                    const extracted = parseParamsFromCode(data.code);
                    const finalParams = Object.keys(extracted).length ? extracted : (data.inferred_params || {});
                    setOptimizableParams(finalParams);
                    const newParams: any = {};
                    const newOptParams: any = {};
                    Object.entries(finalParams).forEach(([key, config]: [string, any]) => {
                        newParams[key] = config.default;
                        newOptParams[key] = { start: config.default, end: config.max || config.default * 2, step: config.step || 1 };
                    });
                    setParams(newParams);
                    setOptimizationParams(newOptParams);
                } catch (e) { console.error(e); }
            } else {
                setCurrentStrategyCode(`# Standard Source: ${strategy}`);
                const config = standardParamsConfig[strategy] || MOCK_STRATEGY_PARAMS[strategy] || {};
                setOptimizableParams(config);
                const newParams: any = {};
                const newOptParams: any = {};
                Object.keys(config).forEach(key => {
                    const conf = config[key];
                    const def = conf.default ?? conf.defaultValue;
                    newParams[key] = def;
                    newOptParams[key] = { start: conf.min ?? def, end: conf.max ?? def, step: conf.step || 1 };
                });
                setParams(newParams);
                setOptimizationParams(newOptParams);
            }
        };

        updateParams();
    }, [strategy, customStrategies, standardParamsConfig, savedIndicators, selectedIndicatorId]);

    useEffect(() => { setContextParams(params); }, [params]);

    const handleTabChange = (tab: 'single' | 'batch' | 'optimization' | 'walk_forward' | 'editor') => {
        setActiveTabState(tab);
        if (tab === 'walk_forward') setMode('walk_forward');
        else if (tab === 'optimization') setMode('optimization');
        else if (tab === 'single' || tab === 'batch') setMode('backtest');
    };

    // ✅ FIXED: Proper CSV Upload Implementation
    const handleDataFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setIsUploadingData(true);
        try {
            const response = await uploadBacktestDataFile(file);
            if (response && response.filename) {
                setCsvFileName(response.filename);
                showToast("CSV Uploaded Successfully!", "success");
            } else {
                showToast("Upload failed: No filename returned", "error");
            }
        } catch (error) {
            console.error("Upload failed", error);
            showToast("Failed to upload CSV file", "error");
        } finally {
            setIsUploadingData(false);
            if (dataFileInputRef.current) {
                dataFileInputRef.current.value = ""; // Reset input
            }
        }
    };

    const handleStrategyUpload = async () => { /* ... implementation ... */ };
    const handleAiGenerate = async () => { /* ... implementation ... */ };

    const handleStop = async () => {
        if (!taskId) return;
        try { await revokeBacktestTask(taskId); showToast('Task stopping...', 'info'); }
        catch (e) { console.error(e); }
    };

    const onRun = () => {
        if ((!strategy || strategy === 'Unknown') && !selectedIndicatorId) {
            showToast("Please select a valid strategy or indicator.", "error");
            return;
        }

        let indicatorId: number | undefined = undefined;
        let selectedStrategy = strategy;

        if (selectedIndicatorId) {
            const ind = savedIndicators.find((i: any) => i.id === selectedIndicatorId);
            if (ind) {
                indicatorId = ind.id;
                selectedStrategy = (ind as any).base_type || ind.baseType || 'GenericStrategy';
            }
        }

        const commonParams = {
            symbol: dataSource === 'csv' ? `FILE: ${csvFileName}` : symbol,
            timeframe,
            strategy: selectedStrategy, // ✅ Use resolved strategy
            indicator_id: indicatorId, // ✅ Pass ID
            initial_cash: initialCash,
            params,
            start_date: startDate,
            end_date: endDate,
            commission,
            slippage,
            leverage: 1
        };

        if (activeTab === 'walk_forward') {
            execute({ ...commonParams, train_window_days: wfaTrainWindow, test_window_days: wfaTestWindow, method: wfaMethod, population_size: wfaPopSize, generations: wfaGenerations, opt_target: wfaOptTarget, min_trades: wfaMinTrades }, 'walk_forward');
        } else if (activeTab === 'optimization') {
            execute({ ...commonParams, params: optimizationParams, method: optimizationMethod === 'gridSearch' ? 'grid' : 'genetic', population_size: gaParams.populationSize, generations: gaParams.generations }, 'optimization');
        } else if (activeTab === 'batch') {
            if (batchStrategies.length === 0) {
                showToast("Select at least one strategy.", "error");
                return;
            }
            execute({ ...commonParams, strategies: batchStrategies }, 'batch');
        } else {
            execute(commonParams, 'backtest');
        }
    };

    return (
        <div className="space-y-8 staggered-fade-in">
            <div className="flex flex-col md:flex-row justify-between items-center gap-4">
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2"><span className="text-brand-primary">⚡</span> Algo Backtester</h1>
                <div className="flex bg-gray-200 dark:bg-brand-dark p-1 rounded-lg flex-wrap">
                    {[{ id: 'single', icon: PlayIcon, label: 'Single' }, { id: 'batch', icon: LayoutGrid, label: 'Batch' }, { id: 'optimization', icon: Layers, label: 'Optimize' }, { id: 'walk_forward', icon: GitMerge, label: 'WFA' }, { id: 'editor', icon: CodeIcon, label: 'Editor' }].map(tab => (
                        <button key={tab.id} onClick={() => handleTabChange(tab.id as any)} className={`flex items-center gap-2 px-3 py-2 rounded-md text-xs font-medium transition-colors ${activeTab === tab.id ? 'bg-white dark:bg-brand-primary text-slate-900 dark:text-white shadow' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}`}><tab.icon size={14} /> {tab.label}</button>
                    ))}
                </div>
                <button onClick={() => setIsDownloadModalOpen(true)} className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg shadow-lg transition-all"><Download size={16} /> Data</button>
            </div>

            {activeTab === 'editor' ? (
                <AIStrategyLab aiPrompt={aiPrompt} setAiPrompt={setAiPrompt} handleAiGenerate={handleAiGenerate} isGenerating={isGenerating} fileInputRef={fileInputRef} handleFileChange={(e) => { if (e.target.files?.[0]) setFileName(e.target.files[0].name); }} handleUpload={handleStrategyUpload} fileName={fileName} strategy={strategy} currentStrategyCode={currentStrategyCode} setCurrentStrategyCode={setCurrentStrategyCode} />
            ) : (
                <>
                    <BacktestForm
                        strategies={strategies} customStrategies={customStrategies} strategy={strategy} setStrategy={setStrategy}
                        batchStrategies={batchStrategies} setBatchStrategies={setBatchStrategies}
                        exchanges={exchanges} selectedExchange={selectedExchange} setSelectedExchange={setSelectedExchange}
                        markets={markets} symbol={symbol} setSymbol={setSymbol}
                        timeframe={timeframe} setTimeframe={setTimeframe}
                        startDate={startDate} setStartDate={setStartDate}
                        endDate={endDate} setEndDate={setEndDate}
                        dataSource={dataSource} setDataSource={setDataSource}
                        handleDataFileUpload={handleDataFileUpload} isUploadingData={isUploadingData} dataFileInputRef={dataFileInputRef}
                        // ❌ REMOVED: tradeFiles, selectedTradeFile, handleConvertTradesToCandles, isConverting
                        csvFileName={csvFileName}
                        handleSyncData={() => handleSyncData(timeframe, startDate, endDate)} isSyncing={isSyncing} syncProgress={syncProgress} syncStatusText={syncStatusText}
                        enableRiskManagement={enableRiskManagement} setEnableRiskManagement={setEnableRiskManagement}
                        initialCash={initialCash} setInitialCash={setInitialCash}
                        mode={activeTab === 'batch' ? 'batch' : mode} setMode={setMode}
                        wfaTrainWindow={wfaTrainWindow} setWfaTrainWindow={setWfaTrainWindow}
                        wfaTestWindow={wfaTestWindow} setWfaTestWindow={setWfaTestWindow}
                        wfaMethod={wfaMethod} setWfaMethod={setWfaMethod}
                        wfaPopSize={wfaPopSize} setWfaPopSize={setWfaPopSize}
                        wfaGenerations={wfaGenerations} setWfaGenerations={setWfaGenerations}
                        wfaOptTarget={wfaOptTarget} setWfaOptTarget={setWfaOptTarget}
                        wfaMinTrades={wfaMinTrades} setWfaMinTrades={setWfaMinTrades}
                        activeTab={activeTab}
                        params={params} setParams={setParams}
                        optimizationParams={optimizationParams} setOptimizationParams={setOptimizationParams}
                        optimizableParams={optimizableParams}
                        optimizationMethod={optimizationMethod} setOptimizationMethod={setOptimizationMethod}
                        gaParams={gaParams} setGaParams={setGaParams}
                        savedIndicators={savedIndicators}
                        selectedIndicatorId={selectedIndicatorId}
                        setSelectedIndicatorId={setSelectedIndicatorId}
                    />
                    <div className="mt-8 pt-6 border-t border-brand-border-light dark:border-brand-border-dark">
                        {isLoading && (
                            <div className="w-full mt-4 animate-fade-in">
                                <div className="flex justify-between text-xs text-blue-400 mb-1 font-mono uppercase"><span>{statusMessage || 'Processing...'}</span><span>{progress}%</span></div>
                                <div className="h-3 w-full bg-[#131722] rounded-full overflow-hidden border border-[#2A2E39] relative shadow-[0_0_10px_rgba(41,98,255,0.1)]"><div className="h-full bg-gradient-to-r from-blue-600 via-purple-500 to-blue-400 transition-all duration-300 ease-out relative" style={{ width: `${progress}%` }}><div className="absolute top-0 left-0 w-full h-full bg-white/20 animate-pulse"></div></div></div>
                            </div>
                        )}
                        <div className="flex items-center gap-4">
                            <button onClick={onRun} disabled={isLoading} className="flex-1 py-3 text-lg shadow-lg shadow-brand-primary/20 bg-brand-primary text-white rounded-lg font-bold hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-2">{isLoading ? (<span className="flex items-center gap-2">Processing...</span>) : (<span className="flex items-center gap-2">{activeTab === 'walk_forward' ? <GitMerge size={20} /> : activeTab === 'batch' ? <LayoutGrid size={20} /> : <PlayIcon size={20} />} Run {activeTab === 'walk_forward' ? 'WFA' : activeTab === 'optimization' ? 'Optimization' : activeTab === 'batch' ? 'Batch Analysis' : 'Backtest'}</span>)}</button>
                            {isLoading && (<button onClick={handleStop} className="px-4 py-3 bg-red-500 hover:bg-red-600 text-white rounded-lg shadow-lg" title="Stop"><Square size={20} fill="currentColor" /></button>)}
                        </div>
                    </div>
                    {results ? (activeTab === 'walk_forward' ? (<WalkForwardResults results={results} />) : activeTab === 'batch' ? (<BatchResults batchResults={results.results || []} viewMode={resultsTab as any} setViewMode={(m) => setResultsTab(m)} />) : (<ResultsPanel singleResult={results!} resultsTab={resultsTab} setResultsTab={setResultsTab} taskId={taskId!} />)) : null}
                </>
            )}

            <DownloadDataModal
                isOpen={isDownloadModalOpen} onClose={() => setIsDownloadModalOpen(false)}
                downloadType={downloadType} setDownloadType={setDownloadType}
                exchanges={exchanges} dlExchange={dlExchange} setDlExchange={setDlExchange}
                dlMarkets={dlMarkets} dlSymbol={dlSymbol} setDlSymbol={setDlSymbol}
                dlTimeframe={dlTimeframe} setDlTimeframe={setDlTimeframe}
                dlStartDate={dlStartDate} setDlStartDate={setDlStartDate}
                dlEndDate={dlEndDate} setDlEndDate={setDlEndDate}
                isDownloading={isDownloading} downloadProgress={downloadProgress}
                isLoadingDlMarkets={isLoadingDlMarkets}
                handleStartDownload={handleStartDownload} handleStopDownload={handleStopDownload}
                tradeFiles={dlTradeFiles} selectedTradeFile={dlSelectedTradeFile} setSelectedTradeFile={setDlSelectedTradeFile}
                handleConvertData={handleConvertData} isConverting={isDlConverting}
            />
        </div>
    );
}
