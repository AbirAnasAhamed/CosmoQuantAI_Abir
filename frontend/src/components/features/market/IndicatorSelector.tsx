import React, { useState, useRef, useEffect } from 'react';

export interface SessionSettings {
    show: boolean;
    name: string;
    session: string;
    color: string;
    showRange: boolean;
    showTrendline: boolean;
    showMean: boolean;
    showVWAP: boolean;
    showMaxMin: boolean;
}

export interface IndicatorSettings {
    showEMA: boolean;
    showBB: boolean;
    showRSI: boolean;
    showVolume: boolean;
    showAutoFibo: boolean;
    showIchimoku: boolean;
    showTrendFinder: boolean;
    showUTBot: boolean;
    showSessions: boolean;
    showQuantumAI: boolean;
    quantumMinConf: number;
    quantumVolatilityFilter: boolean;
    quantumVolThreshold: number;
    showLiquidationHeatmap: boolean;
    emaPeriod: number;
    bbPeriod: number;
    bbStdDev: number;
    rsiPeriod: number;
    autoFiboLookback: number;
    tenkanPeriod: number;
    kijunPeriod: number;
    senkouBPeriod: number;
    displacement: number;
    trendFinderLookback: number;
    trendFinderDev: number;
    trendFinderThreshold: string;
    enableTrendFinderVolumeFilter: boolean;
    trendFinderVolumeMultiplier: number;
    hideLowConfidenceTrend: boolean;
    utBotSensitivity: number;
    utBotAtrPeriod: number;
    utBotUseHeikinAshi: boolean;
    sessionA: SessionSettings;
    sessionB: SessionSettings;
    sessionC: SessionSettings;
    sessionD: SessionSettings;
    timezoneOffset: number;
    rangeTransparency: number;
    showOutline: boolean;
    showSessionLabel: boolean;
    showSessionDashboard: boolean;
    advancedDashboard: boolean;
    // ── Smart Money Concepts [LuxAlgo] ──
    showSMC: boolean;
    smcStyle: 'Colored' | 'Monochrome';
    smcMode: 'Historical' | 'Present';
    smcShowInternals: boolean;
    smcInternalBullFilter: 'All' | 'BOS' | 'CHoCH';
    smcInternalBearFilter: 'All' | 'BOS' | 'CHoCH';
    smcConfluenceFilter: boolean;
    smcShowSwing: boolean;
    smcSwingBullFilter: 'All' | 'BOS' | 'CHoCH';
    smcSwingBearFilter: 'All' | 'BOS' | 'CHoCH';
    smcSwingLength: number;
    smcShowStrongWeakHL: boolean;
    smcShowInternalOB: boolean;
    smcInternalOBCount: number;
    smcShowSwingOB: boolean;
    smcSwingOBCount: number;
    smcOBFilter: 'Atr' | 'CumMeanRange';
    smcOBMitigation: 'Close' | 'High/Low';
    smcShowEqualHL: boolean;
    smcEqualHLLength: number;
    smcEqualHLThreshold: number;
    smcShowFVG: boolean;
    smcFVGAutoThreshold: boolean;
    smcFVGExtendBars: number;
    smcShowPDZones: boolean;
    smcL2Validation: boolean;
    smcCVDTrap: boolean;
    smcMicroFVG: boolean;
    smcSweepDetection: boolean;
    smcShowSwingPatterns: boolean;
    // ── Dual Engine Command Center ──
    // ── Dual Engine Command Center ──
    showDualEngine: boolean;
    dualEngineEmaPeriod: number;
    dualEngineRsiPeriod: number;
    dualEngineRsiOB: number;
    dualEngineRsiOS: number;
    dualEngineMacdFast: number;
    dualEngineMacdSlow: number;
    dualEngineMacdSignal: number;
    dualEngineSqueezeLength: number;
    dualEngineSqueezeBB: number;
    dualEngineSqueezeKC: number;
    dualEngineMode: 'Hybrid' | 'Legacy';
    fredApiKey: string;
    showWatchlistScanner: boolean;
    // ── ICT Killzones & Pivots [TFO] ──
    showICTKillzones: boolean;
    ictShowPivots: boolean;
    ictPivotsExtend: 'Until Mitigated' | 'Past Mitigation';
    ictShowDWM: boolean;
    ictShowDailyOpen: boolean;
    ictShowWeeklyOpen: boolean;
    ictShowMonthlyOpen: boolean;
    ictShowMidnightOpen: boolean;
    ictShowOpeningPrices: boolean;
    ictShowTimestamps: boolean;
    ictAsiaSession: string;
    ictLondonSession: string;
    ictNyAmSession: string;
    ictNyLunchSession: string;
    ictNyPmSession: string;
    ictShowSilverBullet: boolean;
    ictShowConfluence: boolean;
    ictShowAMD: boolean;
    ictShowGaps: boolean;
    ictShowVolatility: boolean;
    ictShowEquilibrium: boolean;

    // LuxAlgo ICT Concepts Settings
    luxShowIndicator: boolean;
    luxMode: 'Present' | 'Historical';
    luxShowMS: boolean;
    luxSwingLength: number;
    luxShowMSS: boolean;
    luxShowBOS: boolean;
    luxShowDisplacement: boolean;
    luxPercBody: number;
    luxShowVIMB: boolean;
    luxVIMBThreshold: number;
    luxShowOB: boolean;
    luxOBLookback: number;
    luxShowBullOB: number;
    luxShowBearOB: number;
    luxShowOBLabels: boolean;
    luxShowLiq: boolean;
    luxLiqMargin: number;
    luxLiqVisibleCount: number;
    luxShowFVG: boolean;
    luxBPR: boolean;
    luxFVGType: 'FVG' | 'IFVG';
    luxFVGVisibleCount: number;

    // Supertrend Settings
    showSupertrend: boolean;
    supertrendAtrPeriod: number;
    supertrendMultiplier: number;
    supertrendChangeATR: boolean;
    supertrendShowSignals: boolean;
    supertrendHighlighting: boolean;

    luxShowNWOG: boolean;
    luxNWOGMax: number;
    luxShowNDOG: boolean;
    luxNDOGMax: number;
    luxFibMode: 'FVG' | 'BPR' | 'OB' | 'Liq' | 'VI' | 'NWOG' | 'NONE';
    luxFibExtend: boolean;
    luxShowKillzones: boolean;
    liquidationHeatmapIntensity: number;
    liquidationShowBubbles: boolean;
    // MSB-OB Settings
    showMsbOb: boolean;
    msbObZigzagLen: number;
    msbObFibFactor: number;
    msbObShowZigzag: boolean;
    msbObDeleteBroken: boolean;
}

interface IndicatorSelectorProps {
    settings: IndicatorSettings;
    onSettingsChange: (settings: IndicatorSettings) => void;
}

export const IndicatorSelector: React.FC<IndicatorSelectorProps> = ({ settings, onSettingsChange }) => {
    const [isOpen, setIsOpen] = useState(false);
    const [multiplierLocal, setMultiplierLocal] = useState(settings.trendFinderVolumeMultiplier?.toString() || '1.5');
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMultiplierLocal(settings.trendFinderVolumeMultiplier?.toString() || '1.5');
    }, [settings.trendFinderVolumeMultiplier]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const toggleIndicator = (key: keyof IndicatorSettings) => {
        onSettingsChange({
            ...settings,
            [key]: !settings[key]
        });
    };

    const updateSetting = (key: keyof IndicatorSettings, value: number) => {
        if (!isNaN(value)) {
            onSettingsChange({
                ...settings,
                [key]: value
            });
        }
    };

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium transition-all ${isOpen
                    ? 'bg-brand-primary/10 border-brand-primary text-brand-primary dark:text-brand-primary'
                    : 'bg-white dark:bg-black/20 text-gray-700 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'
                    }`}
            >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                </svg>
                Indicators
                <svg className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {isOpen && (
                <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-[#0B1120] border border-gray-200 dark:border-white/10 rounded-xl shadow-xl z-50 overflow-hidden">
                    <div className="p-3 border-b border-gray-200 dark:border-white/10">
                        <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Technical Indicators</h3>
                    </div>
                    <div className="p-2 flex flex-col gap-1 max-h-[70vh] overflow-y-auto custom-scrollbar">
                        <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showEMA}
                                    onChange={() => toggleIndicator('showEMA')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-brand-primary transition-colors">EMA</span>
                            </label>
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                <span className="text-xs text-gray-500">P:</span>
                                <input
                                    type="number"
                                    value={settings.emaPeriod}
                                    onChange={(e) => updateSetting('emaPeriod', Number(e.target.value))}
                                    className="w-10 text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary"
                                    min={1} max={500}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showBB}
                                    onChange={() => toggleIndicator('showBB')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-brand-primary transition-colors">Bollinger</span>
                            </label>
                            <div className="flex items-center gap-2 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                <div className="flex items-center">
                                    <span className="text-xs text-gray-500">P:</span>
                                    <input
                                        type="number"
                                        value={settings.bbPeriod}
                                        onChange={(e) => updateSetting('bbPeriod', Number(e.target.value))}
                                        className="w-8 text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary"
                                        min={1} max={500}
                                    />
                                </div>
                                <div className="flex items-center border-l dark:border-white/10 pl-2">
                                    <span className="text-xs text-gray-500">D:</span>
                                    <input
                                        type="number"
                                        value={settings.bbStdDev}
                                        onChange={(e) => updateSetting('bbStdDev', parseFloat(e.target.value))}
                                        className="w-8 text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary"
                                        min={0.1} max={10} step={0.1}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showRSI}
                                    onChange={() => toggleIndicator('showRSI')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-brand-primary transition-colors">RSI</span>
                            </label>
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                <span className="text-xs text-gray-500">P:</span>
                                <input
                                    type="number"
                                    value={settings.rsiPeriod}
                                    onChange={(e) => updateSetting('rsiPeriod', Number(e.target.value))}
                                    className="w-10 text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary"
                                    min={1} max={500}
                                />
                            </div>
                        </div>

                        <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showVolume}
                                    onChange={() => toggleIndicator('showVolume')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-brand-primary transition-colors">Volume</span>
                            </label>
                        </div>

                        <div className="flex items-center justify-between p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showAutoFibo}
                                    onChange={() => toggleIndicator('showAutoFibo')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-brand-primary transition-colors">Auto Fibo</span>
                            </label>
                            <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                <span className="text-xs text-gray-500">LB:</span>
                                <input
                                    type="number"
                                    value={settings.autoFiboLookback}
                                    onChange={(e) => updateSetting('autoFiboLookback', Number(e.target.value))}
                                    className="w-10 text-xs bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary"
                                    min={10} max={1000} step={10}
                                />
                            </div>
                        </div>

                        <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                           <div className="flex items-center justify-between">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showIchimoku}
                                    onChange={() => toggleIndicator('showIchimoku')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-brand-primary transition-colors">Ichimoku Cloud</span>
                            </label>
                           </div>
                           <div className="grid grid-cols-2 gap-2 text-[10px]">
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                    <span className="text-gray-500">T:</span>
                                    <input
                                        type="number"
                                        value={settings.tenkanPeriod}
                                        onChange={(e) => updateSetting('tenkanPeriod', Number(e.target.value))}
                                        className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-center"
                                        min={1} max={100}
                                    />
                                </div>
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                    <span className="text-gray-500">K:</span>
                                    <input
                                        type="number"
                                        value={settings.kijunPeriod}
                                        onChange={(e) => updateSetting('kijunPeriod', Number(e.target.value))}
                                        className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-center"
                                        min={1} max={200}
                                    />
                                </div>
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                    <span className="text-gray-500">B:</span>
                                    <input
                                        type="number"
                                        value={settings.senkouBPeriod}
                                        onChange={(e) => updateSetting('senkouBPeriod', Number(e.target.value))}
                                        className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-center"
                                        min={1} max={400}
                                    />
                                </div>
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                    <span className="text-gray-500">D:</span>
                                    <input
                                        type="number"
                                        value={settings.displacement}
                                        onChange={(e) => updateSetting('displacement', Number(e.target.value))}
                                        className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-center"
                                        min={1} max={100}
                                    />
                                </div>
                           </div>
                        </div>

                        {/* Supertrend Indicator */}
                        <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                           <div className="flex items-center justify-between">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showSupertrend}
                                    onChange={() => toggleIndicator('showSupertrend')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-green-500 transition-colors">Supertrend</span>
                            </label>
                           </div>
                           {settings.showSupertrend && (
                               <div className="flex flex-col gap-2 pl-7 animate-in slide-in-from-top-1 duration-200">
                                   <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                            <span className="text-gray-500">Period:</span>
                                            <input
                                                type="number"
                                                value={settings.supertrendAtrPeriod}
                                                onChange={(e) => updateSetting('supertrendAtrPeriod', Number(e.target.value))}
                                                className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-green-500 text-center"
                                                min={1} max={100}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                            <span className="text-gray-500">Mult:</span>
                                            <input
                                                type="number"
                                                value={settings.supertrendMultiplier}
                                                onChange={(e) => updateSetting('supertrendMultiplier', Number(e.target.value))}
                                                className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-green-500 text-center"
                                                min={0.1} max={20} step={0.1}
                                            />
                                        </div>
                                   </div>
                                   <div className="flex flex-col gap-1.5">
                                       <label className="flex items-center gap-2 cursor-pointer">
                                           <input type="checkbox" checked={settings.supertrendChangeATR}
                                               onChange={() => onSettingsChange({...settings, supertrendChangeATR: !settings.supertrendChangeATR})}
                                               className="w-3 h-3 rounded text-green-500" />
                                           <span className="text-[10px] text-gray-500">Standard ATR (RMA)</span>
                                       </label>
                                       <label className="flex items-center gap-2 cursor-pointer">
                                           <input type="checkbox" checked={settings.supertrendShowSignals}
                                               onChange={() => onSettingsChange({...settings, supertrendShowSignals: !settings.supertrendShowSignals})}
                                               className="w-3 h-3 rounded text-green-500" />
                                           <span className="text-[10px] text-gray-500">Show Buy/Sell Signals</span>
                                       </label>
                                       <label className="flex items-center gap-2 cursor-pointer">
                                           <input type="checkbox" checked={settings.supertrendHighlighting}
                                               onChange={() => onSettingsChange({...settings, supertrendHighlighting: !settings.supertrendHighlighting})}
                                               className="w-3 h-3 rounded text-green-500" />
                                           <span className="text-[10px] text-gray-500">Enable Highlighter</span>
                                       </label>
                                   </div>
                               </div>
                           )}
                        </div>

                        {/* MSB-OB Indicator */}
                        <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                           <div className="flex items-center justify-between">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showMsbOb}
                                    onChange={() => toggleIndicator('showMsbOb')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-orange-400 to-red-500 group-hover:from-orange-300 group-hover:to-red-400 transition-colors">MSB & Order Block</span>
                            </label>
                           </div>
                           {settings.showMsbOb && (
                               <div className="flex flex-col gap-2 pl-7 animate-in slide-in-from-top-1 duration-200">
                                   <div className="grid grid-cols-2 gap-2 text-[10px]">
                                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                            <span className="text-gray-500">Len:</span>
                                            <input
                                                type="number"
                                                value={settings.msbObZigzagLen}
                                                onChange={(e) => updateSetting('msbObZigzagLen', Number(e.target.value))}
                                                className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-orange-500 text-center"
                                                min={2} max={100}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-0.5 rounded">
                                            <span className="text-gray-500">Fib:</span>
                                            <input
                                                type="number"
                                                value={settings.msbObFibFactor}
                                                onChange={(e) => updateSetting('msbObFibFactor', parseFloat(e.target.value))}
                                                className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-orange-500 text-center"
                                                min={0.01} max={1} step={0.01}
                                            />
                                        </div>
                                   </div>
                                   <div className="flex flex-col gap-1.5">
                                       <label className="flex items-center gap-2 cursor-pointer">
                                           <input type="checkbox" checked={settings.msbObShowZigzag}
                                               onChange={() => onSettingsChange({...settings, msbObShowZigzag: !settings.msbObShowZigzag})}
                                               className="w-3 h-3 rounded text-orange-500" />
                                           <span className="text-[10px] text-gray-500">Show ZigZag Lines</span>
                                       </label>
                                       <label className="flex items-center gap-2 cursor-pointer">
                                           <input type="checkbox" checked={settings.msbObDeleteBroken}
                                               onChange={() => onSettingsChange({...settings, msbObDeleteBroken: !settings.msbObDeleteBroken})}
                                               className="w-3 h-3 rounded text-orange-500" />
                                           <span className="text-[10px] text-gray-500">Delete Broken Zones</span>
                                       </label>
                                   </div>
                               </div>
                           )}
                        </div>

                        <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group">
                           <div className="flex items-center justify-between">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showTrendFinder}
                                    onChange={() => toggleIndicator('showTrendFinder')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-medium text-gray-900 dark:text-gray-200 group-hover:text-brand-primary transition-colors">Adaptive Trend Finder</span>
                            </label>
                           </div>
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-1 rounded">
                                    <span className="text-gray-500 text-[10px]">Lookback:</span>
                                    <input
                                        type="number"
                                        value={settings.trendFinderLookback}
                                        onChange={(e) => updateSetting('trendFinderLookback', Number(e.target.value))}
                                        className="w-12 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-[10px]"
                                        min={20} max={2000} step={10}
                                    />
                                </div>
                                <div className="flex items-center gap-1 bg-gray-100 dark:bg-white/10 px-1.5 py-1 rounded">
                                    <span className="text-gray-500 text-[10px]">Dev:</span>
                                    <input
                                        type="number"
                                        value={settings.trendFinderDev}
                                        onChange={(e) => updateSetting('trendFinderDev', Number(e.target.value))}
                                        className="w-10 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-[10px]"
                                        min={0.1} max={5.0} step={0.1}
                                    />
                                </div>
                           </div>
                           <div className="flex flex-col gap-1 mt-1">
                                <label className="text-gray-500 text-[10px] font-bold uppercase">Min. Confidence:</label>
                                <select 
                                    className="w-full bg-gray-100 dark:bg-white/10 border border-transparent dark:border-white/5 rounded p-1 text-gray-700 dark:text-gray-200 text-[10px] focus:outline-none focus:border-brand-primary"
                                    value={settings.trendFinderThreshold || 'Strong'}
                                    onChange={(e) => onSettingsChange({ ...settings, trendFinderThreshold: e.target.value })}
                                >
                                    <option className="bg-white dark:bg-[#0B1120]" value="Moderate">Moderate (0.7+)</option>
                                    <option className="bg-white dark:bg-[#0B1120]" value="Moderately Strong">Moderately Strong (0.8+)</option>
                                    <option className="bg-white dark:bg-[#0B1120]" value="Mostly Strong">Mostly Strong (0.9+)</option>
                                    <option className="bg-white dark:bg-[#0B1120]" value="Strong">Strong (0.92+)</option>
                                    <option className="bg-white dark:bg-[#0B1120]" value="Very Strong">Very Strong (0.94+)</option>
                                    <option className="bg-white dark:bg-[#0B1120]" value="Exceptionally Strong">Exceptionally Strong (0.96+)</option>
                                    <option className="bg-white dark:bg-[#0B1120]" value="Ultra Strong">Ultra Strong (0.98+)</option>
                                </select>
                           </div>
                           <div className="flex flex-col gap-1 mt-1">
                                <label className="flex items-center cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={settings.hideLowConfidenceTrend}
                                        onChange={() => onSettingsChange({ ...settings, hideLowConfidenceTrend: !settings.hideLowConfidenceTrend })}
                                        className="w-3.5 h-3.5 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase group-hover:text-brand-primary transition-colors italic">Hide Below Min. Conf.</span>
                                </label>
                           </div>
                           <div className="flex flex-col gap-2 mt-2 pt-2 border-t dark:border-white/5">
                                <label className="flex items-center cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={settings.enableTrendFinderVolumeFilter}
                                        onChange={() => onSettingsChange({ ...settings, enableTrendFinderVolumeFilter: !settings.enableTrendFinderVolumeFilter })}
                                        className="w-3.5 h-3.5 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase group-hover:text-brand-primary transition-colors italic">Volume Filter (Confirmation)</span>
                                </label>
                                {settings.enableTrendFinderVolumeFilter && (
                                    <div className="flex items-center justify-between bg-gray-100 dark:bg-white/5 p-1.5 rounded animate-fadeIn">
                                        <span className="text-[10px] text-gray-500">Multiplier:</span>
                                        <input
                                            type="text"
                                            value={multiplierLocal}
                                            onChange={(e) => {
                                                const val = e.target.value;
                                                if (val === '' || /^\d*\.?\d*$/.test(val)) {
                                                    setMultiplierLocal(val);
                                                    const num = parseFloat(val);
                                                    if (!isNaN(num)) {
                                                        onSettingsChange({ ...settings, trendFinderVolumeMultiplier: num });
                                                    }
                                                }
                                            }}
                                            className="w-12 bg-transparent text-gray-700 dark:text-gray-200 focus:outline-none text-[10px] text-right font-mono"
                                            placeholder="1.5"
                                        />
                                    </div>
                                )}
                           </div>
                         </div>
                         
                         {/* UT Bot Alerts Block */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                           <div className="flex items-center justify-between">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showUTBot}
                                    onChange={() => toggleIndicator('showUTBot')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-400 to-emerald-600 group-hover:from-green-300 group-hover:to-emerald-500 transition-colors">UT Bot Alerts</span>
                            </label>
                           </div>
                           
                            <div className="flex items-center gap-2 mt-1">
                                <div className="flex items-center justify-between w-1/2 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded">
                                    <span className="text-gray-500 text-[10px] font-bold">Key Value:</span>
                                    <input
                                        type="number"
                                        value={settings.utBotSensitivity}
                                        onChange={(e) => updateSetting('utBotSensitivity', Number(e.target.value))}
                                        className="w-12 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-[10px] text-right"
                                        min={0.1} max={100} step={0.1}
                                    />
                                </div>
                                <div className="flex items-center justify-between w-1/2 bg-gray-100 dark:bg-white/10 px-2 py-1 rounded">
                                    <span className="text-gray-500 text-[10px] font-bold">ATR P:</span>
                                    <input
                                        type="number"
                                        value={settings.utBotAtrPeriod}
                                        onChange={(e) => updateSetting('utBotAtrPeriod', Number(e.target.value))}
                                        className="w-10 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none focus:text-brand-primary text-[10px] text-right"
                                        min={1} max={200} step={1}
                                    />
                                </div>
                           </div>
                           
                           <div className="flex flex-col gap-1 mt-1">
                                <label className="flex items-center cursor-pointer group">
                                    <input
                                        type="checkbox"
                                        checked={settings.utBotUseHeikinAshi}
                                        onChange={() => onSettingsChange({ ...settings, utBotUseHeikinAshi: !settings.utBotUseHeikinAshi })}
                                        className="w-3.5 h-3.5 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-2 text-[10px] font-bold text-gray-500 uppercase group-hover:text-brand-primary transition-colors italic">Heikin Ashi Signal (Pine)</span>
                                </label>
                           </div>
                         </div>

                         {/* ── Quantum AI v8 Block ── */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                           <div className="flex items-center justify-between">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showQuantumAI}
                                    onChange={() => toggleIndicator('showQuantumAI')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-purple-400 via-pink-500 to-orange-400 group-hover:brightness-125 transition-all">🚀 Quantum AI v8</span>
                            </label>
                           </div>

                           {settings.showQuantumAI && (
                               <div className="flex flex-col gap-2 mt-1 text-[10px]">
                                    <div className="flex items-center justify-between bg-gray-100 dark:bg-white/10 px-2 py-1.5 rounded-lg">
                                        <span className="text-gray-500 font-bold uppercase">Min Confidence</span>
                                        <div className="flex items-center gap-1">
                                            <input
                                                type="number"
                                                value={settings.quantumMinConf}
                                                onChange={(e) => updateSetting('quantumMinConf', Number(e.target.value))}
                                                className="w-12 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none text-right font-mono"
                                                min={0} max={100} step={5}
                                            />
                                            <span className="text-gray-400">%</span>
                                        </div>
                                    </div>
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-transparent hover:border-purple-500/30 transition-all">
                                        <div className="flex items-center justify-between mb-1.5">
                                            <label className="flex items-center cursor-pointer group">
                                                <input
                                                    type="checkbox"
                                                    checked={settings.quantumVolatilityFilter}
                                                    onChange={() => onSettingsChange({ ...settings, quantumVolatilityFilter: !settings.quantumVolatilityFilter })}
                                                    className="w-3.5 h-3.5 text-brand-primary bg-gray-100 border-gray-300 rounded"
                                                />
                                                <span className="ml-2 font-bold text-gray-500 uppercase group-hover:text-purple-400 transition-colors">Volatility Filter</span>
                                            </label>
                                        </div>
                                        {settings.quantumVolatilityFilter && (
                                            <div className="flex items-center justify-between bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-2 py-1">
                                                <span className="text-gray-500">ATR Vol Threshold %:</span>
                                                <input
                                                    type="number"
                                                    value={settings.quantumVolThreshold}
                                                    onChange={(e) => updateSetting('quantumVolThreshold', parseFloat(e.target.value))}
                                                    className="w-12 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none text-right font-mono"
                                                    min={0.05} max={5.0} step={0.05}
                                                />
                                            </div>
                                        )}
                                    </div>
                               </div>
                           )}
                         </div>

                         {/* Sessions Block */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                            <div className="flex items-center justify-between">
                             <label className="flex items-center cursor-pointer flex-1">
                                 <input
                                     type="checkbox"
                                     checked={settings.showSessions}
                                     onChange={() => toggleIndicator('showSessions')}
                                     className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                 />
                                 <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-indigo-600 group-hover:from-blue-300 group-hover:to-indigo-500 transition-colors">Sessions [LuxAlgo]</span>
                             </label>
                            </div>

                            {settings.showSessions && (
                                <>
                                    <div className="flex flex-col gap-3 mt-2">
                                        {[
                                            { key: 'sessionA', label: 'Session A' },
                                            { key: 'sessionB', label: 'Session B' },
                                            { key: 'sessionC', label: 'Session C' },
                                            { key: 'sessionD', label: 'Session D' }
                                        ].map(({ key, label }) => {
                                            const sess = settings[key as keyof IndicatorSettings] as SessionSettings;
                                            return (
                                                <div key={key} className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-transparent hover:border-brand-primary/30 transition-all">
                                                    <div className="flex items-center justify-between mb-2">
                                                        <div className="flex items-center gap-2">
                                                            <input
                                                                type="checkbox"
                                                                checked={sess.show}
                                                                onChange={() => onSettingsChange({
                                                                    ...settings,
                                                                    [key]: { ...sess, show: !sess.show }
                                                                })}
                                                                className="w-3.5 h-3.5 rounded text-brand-primary"
                                                            />
                                                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">{sess.name}</span>
                                                        </div>
                                                        <input
                                                            type="color"
                                                            value={sess.color}
                                                            onChange={(e) => onSettingsChange({
                                                                ...settings,
                                                                [key]: { ...sess, color: e.target.value }
                                                            })}
                                                            className="w-4 h-4 rounded cursor-pointer border-none bg-transparent"
                                                        />
                                                    </div>
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <span className="text-[10px] text-gray-500 font-bold">Time:</span>
                                                        <input
                                                            type="text"
                                                            value={sess.session}
                                                            onChange={(e) => onSettingsChange({
                                                                ...settings,
                                                                [key]: { ...sess, session: e.target.value }
                                                            })}
                                                            className="flex-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1.5 py-0.5 text-[10px] text-gray-700 dark:text-gray-300 focus:outline-none"
                                                        />
                                                    </div>
                                                    <div className="grid grid-cols-2 gap-x-2 gap-y-1">
                                                        {[
                                                            { skey: 'showRange', slabel: 'Range' },
                                                            { skey: 'showTrendline', slabel: 'LinReg' },
                                                            { skey: 'showMean', slabel: 'Mean' },
                                                            { skey: 'showVWAP', slabel: 'VWAP' },
                                                            { skey: 'showMaxMin', slabel: 'Max/Min' }
                                                        ].map(({ skey, slabel }) => (
                                                            <label key={skey} className="flex items-center gap-1.5 cursor-pointer group/item">
                                                                <input
                                                                    type="checkbox"
                                                                    checked={sess[skey as keyof SessionSettings] as boolean}
                                                                    onChange={() => onSettingsChange({
                                                                        ...settings,
                                                                        [key]: { ...sess, [skey]: !(sess[skey as keyof SessionSettings]) }
                                                                    })}
                                                                    className="w-2.5 h-2.5 rounded text-brand-primary"
                                                                />
                                                                <span className="text-[9px] text-gray-500 group-hover/item:text-brand-primary transition-colors">{slabel}</span>
                                                            </label>
                                                        ))}
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>

                                    <div className="mt-2 space-y-2 border-t dark:border-white/5 pt-2">
                                       <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-gray-500 font-bold">Timezone UTC (+/-):</span>
                                            <input
                                                type="number"
                                                value={settings.timezoneOffset / 60}
                                                onChange={(e) => onSettingsChange({ ...settings, timezoneOffset: Number(e.target.value) * 60 })}
                                                className="w-12 bg-gray-100 dark:bg-white/10 rounded px-1.5 py-0.5 text-[10px] text-gray-700 dark:text-gray-300 focus:outline-none"
                                            />
                                       </div>
                                       <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-gray-500 font-bold">Range Alpha (0-100):</span>
                                            <input
                                                type="number"
                                                value={settings.rangeTransparency}
                                                onChange={(e) => onSettingsChange({ ...settings, rangeTransparency: Number(e.target.value) })}
                                                className="w-12 bg-gray-100 dark:bg-white/10 rounded px-1.5 py-0.5 text-[10px] text-gray-700 dark:text-gray-300 focus:outline-none"
                                                min={0} max={100}
                                            />
                                       </div>
                                       <div className="grid grid-cols-2 gap-2">
                                            {[
                                                { skey: 'showOutline', slabel: 'Outline' },
                                                { skey: 'showSessionLabel', slabel: 'Labels' },
                                                { skey: 'showSessionDashboard', slabel: 'Dashboard' },
                                                { skey: 'advancedDashboard', slabel: 'Advanced Info' }
                                            ].map(({ skey, slabel }) => (
                                                <label key={skey} className="flex items-center gap-2 cursor-pointer group">
                                                    <input
                                                        type="checkbox"
                                                        checked={settings[skey as keyof IndicatorSettings] as boolean}
                                                        onChange={() => onSettingsChange({ ...settings, [skey]: !settings[skey as keyof IndicatorSettings] })}
                                                        className="w-3.5 h-3.5 rounded text-brand-primary"
                                                    />
                                                    <span className="text-[10px] text-gray-500 group-hover:text-brand-primary transition-colors uppercase font-bold">{slabel}</span>
                                                </label>
                                            ))}
                                       </div>
                                    </div>
                                </>
                            )}
                         </div>

                         {/* ── Dual Engine Command Center Block ── */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center cursor-pointer flex-1">
                                    <input
                                        type="checkbox"
                                        checked={settings.showDualEngine}
                                        onChange={() => toggleIndicator('showDualEngine')}
                                        className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-blue-500 group-hover:from-cyan-300 group-hover:to-blue-400 transition-colors">
                                        ⚡ Command Center HUD
                                    </span>
                                </label>
                                <div className="flex rounded overflow-hidden border border-gray-200 dark:border-white/10 text-[9px] ml-2">
                                    {(['Hybrid', 'Legacy'] as const).map(s => (
                                        <button key={s}
                                            onClick={() => onSettingsChange({ ...settings, dualEngineMode: s })}
                                            className={`px-1.5 py-0.5 font-bold transition-all ${
                                                settings.dualEngineMode === s ? 'bg-cyan-500 text-white' : 'text-gray-500 hover:text-white'}`}>
                                            {s}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {settings.showDualEngine && (
                                <div className="flex flex-col gap-2 mt-2 text-[10px]">
                                    
                                    {settings.dualEngineMode === 'Legacy' && (
                                        <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-amber-500/30">
                                            <div className="flex flex-col gap-1">
                                                <span className="text-amber-500/80 font-bold uppercase text-[9px]">FRED API Key (For US CPI Data)</span>
                                                <input type="password" value={settings.fredApiKey || ''}
                                                    onChange={e => onSettingsChange({ ...settings, fredApiKey: e.target.value })}
                                                    className="w-full bg-black/20 border border-white/10 rounded px-1.5 py-1 text-gray-300 focus:outline-none focus:border-amber-500" placeholder="Enter API Key from fred.stlouisfed.org" />
                                            </div>
                                        </div>
                                    )}
                                    {/* EMA & RSI */}
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <div className="grid grid-cols-2 gap-2 mb-2">
                                            <div className="flex items-center justify-between bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1.5 py-1">
                                                <span className="text-gray-500 font-bold">EMA Length:</span>
                                                <input type="number" value={settings.dualEngineEmaPeriod}
                                                    onChange={e => updateSetting('dualEngineEmaPeriod', Number(e.target.value))}
                                                    className="w-10 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none text-right" min={1} max={500} />
                                            </div>
                                            <div className="flex items-center justify-between bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1.5 py-1">
                                                <span className="text-gray-500 font-bold">RSI Period:</span>
                                                <input type="number" value={settings.dualEngineRsiPeriod}
                                                    onChange={e => updateSetting('dualEngineRsiPeriod', Number(e.target.value))}
                                                    className="w-10 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none text-right" min={2} max={200} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                            <div className="flex items-center justify-between bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1.5 py-1">
                                                <span className="text-gray-500 font-bold">RSI OB:</span>
                                                <input type="number" value={settings.dualEngineRsiOB}
                                                    onChange={e => updateSetting('dualEngineRsiOB', Number(e.target.value))}
                                                    className="w-10 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none text-right text-red-400" min={50} max={100} />
                                            </div>
                                            <div className="flex items-center justify-between bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1.5 py-1">
                                                <span className="text-gray-500 font-bold">RSI OS:</span>
                                                <input type="number" value={settings.dualEngineRsiOS}
                                                    onChange={e => updateSetting('dualEngineRsiOS', Number(e.target.value))}
                                                    className="w-10 bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none text-right text-green-400" min={0} max={50} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* MACD */}
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <p className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5 text-[9px]">MACD Settings</p>
                                        <div className="grid grid-cols-3 gap-1">
                                            <div className="flex items-center gap-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-1">
                                                <span className="text-gray-500">Fast:</span>
                                                <input type="number" value={settings.dualEngineMacdFast}
                                                    onChange={e => updateSetting('dualEngineMacdFast', Number(e.target.value))}
                                                    className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none" min={1} />
                                            </div>
                                            <div className="flex items-center gap-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-1">
                                                <span className="text-gray-500">Slow:</span>
                                                <input type="number" value={settings.dualEngineMacdSlow}
                                                    onChange={e => updateSetting('dualEngineMacdSlow', Number(e.target.value))}
                                                    className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none" min={2} />
                                            </div>
                                            <div className="flex items-center gap-1 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-1">
                                                <span className="text-gray-500">Sig:</span>
                                                <input type="number" value={settings.dualEngineMacdSignal}
                                                    onChange={e => updateSetting('dualEngineMacdSignal', Number(e.target.value))}
                                                    className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none" min={1} />
                                            </div>
                                        </div>
                                    </div>

                                    {/* Squeeze */}
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <p className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5 text-[9px]">Squeeze Breakout</p>
                                        <div className="grid grid-cols-3 gap-1">
                                            <div className="flex flex-col bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-1">
                                                <span className="text-gray-500 text-[8px] uppercase">Length</span>
                                                <input type="number" value={settings.dualEngineSqueezeLength}
                                                    onChange={e => updateSetting('dualEngineSqueezeLength', Number(e.target.value))}
                                                    className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none" min={5} />
                                            </div>
                                            <div className="flex flex-col bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-1">
                                                <span className="text-gray-500 text-[8px] uppercase">BB Mult</span>
                                                <input type="number" value={settings.dualEngineSqueezeBB}
                                                    onChange={e => updateSetting('dualEngineSqueezeBB', parseFloat(e.target.value))}
                                                    className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none" step={0.1} />
                                            </div>
                                            <div className="flex flex-col bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-1">
                                                <span className="text-gray-500 text-[8px] uppercase">KC Mult</span>
                                                <input type="number" value={settings.dualEngineSqueezeKC}
                                                    onChange={e => updateSetting('dualEngineSqueezeKC', parseFloat(e.target.value))}
                                                    className="w-full bg-transparent text-gray-700 dark:text-gray-300 focus:outline-none" step={0.1} />
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>

                         {/* ── Watchlist Scanner ── */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                            <label className="flex items-center cursor-pointer flex-1">
                                <input
                                    type="checkbox"
                                    checked={settings.showWatchlistScanner}
                                    onChange={() => toggleIndicator('showWatchlistScanner')}
                                    className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                />
                                <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-500 group-hover:from-indigo-300 group-hover:to-purple-400 transition-colors">
                                    📡 Watchlist Scanner (Multi-Pair)
                                </span>
                            </label>
                        </div>

                         {/* ── God Mode Liquidation Heatmap ── */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center cursor-pointer flex-1">
                                    <input
                                        type="checkbox"
                                        checked={settings.showLiquidationHeatmap}
                                        onChange={() => toggleIndicator('showLiquidationHeatmap')}
                                        className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-red-500 via-orange-400 to-yellow-500 group-hover:opacity-80 transition-opacity">
                                        🔥 Liquidation Heatmap [God Mode]
                                    </span>
                                </label>
                                {settings.showLiquidationHeatmap && (
                                     <button
                                         onClick={(e) => { 
                                             e.stopPropagation(); 
                                             const content = e.currentTarget.parentElement?.nextElementSibling as HTMLElement;
                                             if (content) content.classList.toggle('hidden');
                                         }}
                                         className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500"
                                     >
                                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                     </button>
                                )}
                            </div>

                            {settings.showLiquidationHeatmap && (
                                <div className="pl-7 pr-2 py-2 flex flex-col gap-3 animate-fadeIn text-[10px]">
                                    <div className="flex flex-col gap-1.5">
                                        <label className="flex items-center justify-between cursor-pointer group">
                                            <span className="text-gray-400 font-bold group-hover:text-gray-200">Show Live Bubbles</span>
                                            <input type="checkbox" checked={settings.liquidationShowBubbles as boolean} onChange={() => onSettingsChange({ ...settings, liquidationShowBubbles: !settings.liquidationShowBubbles })} className="w-3 h-3 rounded" />
                                        </label>
                                    </div>
                                    <div className="flex flex-col gap-1.5 mt-1 border-t dark:border-white/10 pt-2">
                                        <div className="flex justify-between items-center">
                                            <span className="text-gray-400 font-bold">Heatmap Intensity</span>
                                            <span className="text-brand-primary">{settings.liquidationHeatmapIntensity}%</span>
                                        </div>
                                        <input 
                                            type="range" 
                                            min="10" 
                                            max="100" 
                                            value={settings.liquidationHeatmapIntensity as number} 
                                            onChange={(e) => updateSetting('liquidationHeatmapIntensity' as any, Number(e.target.value))}
                                            className="w-full accent-orange-500"
                                        />
                                    </div>
                                </div>
                            )}
                         </div>

                         {/* ── ICT Killzones & Pivots [TFO] ── */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center cursor-pointer flex-1">
                                    <input
                                        type="checkbox"
                                        checked={settings.showICTKillzones}
                                        onChange={() => toggleIndicator('showICTKillzones')}
                                        className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-rose-400 to-purple-500 group-hover:opacity-80 transition-opacity">
                                        🏹 ICT Killzones & Pivots
                                    </span>
                                </label>
                            </div>

                            {settings.showICTKillzones && (
                                <div className="flex flex-col gap-2 mt-2 text-[10px]">
                                    <div className="grid grid-cols-2 gap-2">
                                        <label className="flex items-center gap-2 cursor-pointer group">
                                            <input type="checkbox" checked={settings.ictShowPivots}
                                                onChange={() => onSettingsChange({ ...settings, ictShowPivots: !settings.ictShowPivots })}
                                                className="w-3.5 h-3.5 rounded text-rose-500" />
                                            <span className="text-gray-500 group-hover:text-rose-400 transition-colors uppercase font-bold">Show Pivots</span>
                                        </label>
                                        <select 
                                            value={settings.ictPivotsExtend}
                                            onChange={(e) => onSettingsChange({ ...settings, ictPivotsExtend: e.target.value as any })}
                                            className="bg-black/20 border border-white/10 rounded px-1 py-0.5 text-gray-300 focus:outline-none"
                                        >
                                            <option value="Until Mitigated">Mitigated</option>
                                            <option value="Past Mitigation">Permanent</option>
                                        </select>
                                    </div>

                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <p className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5 text-[9px]">DWM & Open Lines</p>
                                        <div className="grid grid-cols-2 gap-y-1">
                                            {[
                                                { k: 'ictShowDWM', l: 'HTF High/Low' },
                                                { k: 'ictShowDailyOpen', l: 'Daily Open' },
                                                { k: 'ictShowWeeklyOpen', l: 'Weekly Open' },
                                                { k: 'ictShowMonthlyOpen', l: 'Monthly Open' },
                                                { k: 'ictShowOpeningPrices', l: 'Time Logs' },
                                                { k: 'ictShowTimestamps', l: 'Verticals' },
                                            ].map(item => (
                                                <label key={item.k} className="flex items-center gap-2 cursor-pointer group">
                                                    <input type="checkbox" checked={settings[item.k as keyof IndicatorSettings] as boolean}
                                                        onChange={() => onSettingsChange({ ...settings, [item.k]: !settings[item.k as keyof IndicatorSettings] })}
                                                        className="w-2.5 h-2.5 rounded text-brand-primary" />
                                                    <span className="text-[9px] text-gray-500 group-hover:text-brand-primary transition-colors uppercase">{item.l}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>

                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <p className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5 text-[9px]">Sessions (New York Time)</p>
                                        <div className="flex flex-col gap-1.5">
                                            {[
                                                { k: 'ictAsiaSession', l: 'Asia', c: 'text-blue-400' },
                                                { k: 'ictLondonSession', l: 'London', c: 'text-red-400' },
                                                { k: 'ictNyAmSession', l: 'NY AM', c: 'text-emerald-400' },
                                                { k: 'ictNyLunchSession', l: 'NY Lunch', c: 'text-yellow-400' },
                                                { k: 'ictNyPmSession', l: 'NY PM', c: 'text-purple-400' },
                                            ].map(item => (
                                                <div key={item.k} className="flex items-center justify-between">
                                                    <span className={`font-bold ${item.c}`}>{item.l}:</span>
                                                    <input type="text" value={settings[item.k as keyof IndicatorSettings] as string}
                                                        onChange={(e) => onSettingsChange({ ...settings, [item.k]: e.target.value })}
                                                        className="w-20 bg-black/20 border border-white/10 rounded px-1.5 py-0.5 text-gray-300 text-right focus:outline-none focus:border-brand-primary" />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5 mt-2">
                                        <p className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5 text-[9px]">Advanced ICT Suite</p>
                                        <div className="grid grid-cols-2 gap-y-1">
                                            {[
                                                { k: 'ictShowSilverBullet', l: 'Silver Bullet' },
                                                { k: 'ictShowEquilibrium', l: 'Equilibrium' },
                                                { k: 'ictShowConfluence', l: 'Confluence' },
                                                { k: 'ictShowAMD', l: 'Power of 3' },
                                                { k: 'ictShowGaps', l: 'Open Gaps' },
                                                { k: 'ictShowVolatility', l: 'Volatility' },
                                            ].map(item => (
                                                <label key={item.k} className="flex items-center gap-2 cursor-pointer group">
                                                    <input type="checkbox" checked={settings[item.k as keyof IndicatorSettings] as boolean}
                                                        onChange={() => onSettingsChange({ ...settings, [item.k]: !settings[item.k as keyof IndicatorSettings] })}
                                                        className="w-2.5 h-2.5 rounded text-brand-primary" />
                                                    <span className="text-[9px] text-gray-500 group-hover:text-brand-primary transition-colors uppercase">{item.l}</span>
                                                </label>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>

                         {/* ── LuxAlgo ICT Concepts ── */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center cursor-pointer flex-1">
                                    <input
                                        type="checkbox"
                                        checked={settings.luxShowIndicator}
                                        onChange={() => toggleIndicator('luxShowIndicator')}
                                        className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-indigo-400 to-purple-500 group-hover:opacity-80 transition-opacity">
                                        ICT Concepts [LuxAlgo]
                                    </span>
                                </label>
                                {settings.luxShowIndicator && (
                                     <button
                                         onClick={(e) => { 
                                             e.stopPropagation(); 
                                             // simple local toggle
                                             const content = e.currentTarget.parentElement?.nextElementSibling as HTMLElement;
                                             if (content) content.classList.toggle('hidden');
                                         }}
                                         className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded text-gray-500"
                                     >
                                         <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M19 9l-7 7-7-7"></path></svg>
                                     </button>
                                )}
                            </div>

                            {settings.luxShowIndicator && (
                                <div className="pl-7 pr-2 py-2 flex flex-col gap-3 animate-fadeIn text-[10px]">
                                    
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                        {/* Core Toggles */}
                                        <div className="flex flex-col gap-1.5">
                                            <p className="font-bold text-gray-400 mb-0.5">STRUCTURE</p>
                                            {[
                                                { k: 'luxShowMS', l: 'Market Structure' },
                                                { k: 'luxShowMSS', l: 'MSS' },
                                                { k: 'luxShowBOS', l: 'BOS' },
                                                { k: 'luxShowDisplacement', l: 'Displacement' },
                                            ].map((t) => (
                                                <label key={t.k} className="flex items-center justify-between cursor-pointer group">
                                                    <span className="text-gray-400 group-hover:text-gray-200">{t.l}</span>
                                                    <input type="checkbox" checked={settings[t.k as keyof IndicatorSettings] as boolean} onChange={() => onSettingsChange({ ...settings, [t.k]: !settings[t.k as keyof IndicatorSettings] })} className="w-3 h-3 rounded" />
                                                </label>
                                            ))}
                                            <div className="flex justify-between items-center mt-1">
                                                <span className="text-gray-400">Swing Length</span>
                                                <input type="number" value={settings.luxSwingLength} onChange={(e) => onSettingsChange({ ...settings, luxSwingLength: parseInt(e.target.value)||5 })} className="w-12 bg-black/20 border border-white/10 rounded px-1 py-0.5 text-right" />
                                            </div>
                                        </div>

                                        <div className="flex flex-col gap-1.5">
                                            <p className="font-bold text-gray-400 mb-0.5">ZONES</p>
                                            {[
                                                { k: 'luxShowVIMB', l: 'Vol Imbalance' },
                                                { k: 'luxShowOB', l: 'Order Blocks' },
                                                { k: 'luxShowLiq', l: 'Liquidity' },
                                                { k: 'luxShowFVG', l: 'FVG / IFVG' },
                                                { k: 'luxShowNWOG', l: 'NWOG' },
                                                { k: 'luxShowKillzones', l: 'Killzones' },
                                            ].map((t) => (
                                                <label key={t.k} className="flex items-center justify-between cursor-pointer group">
                                                    <span className="text-gray-400 group-hover:text-gray-200">{t.l}</span>
                                                    <input type="checkbox" checked={settings[t.k as keyof IndicatorSettings] as boolean} onChange={() => onSettingsChange({ ...settings, [t.k]: !settings[t.k as keyof IndicatorSettings] })} className="w-3 h-3 rounded" />
                                                </label>
                                            ))}
                                            <div className="flex justify-between items-center mt-1">
                                                <span className="text-gray-400">Fib Mode</span>
                                                <select value={settings.luxFibMode} onChange={(e) => onSettingsChange({ ...settings, luxFibMode: e.target.value as any })} className="w-16 bg-black/20 border border-white/10 rounded px-1 py-0.5 text-right">
                                                    <option>NONE</option><option>FVG</option><option>BPR</option><option>OB</option><option>Liq</option><option>VI</option><option>NWOG</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>
                                </div>
                            )}
                         </div>

                         {/* ── Smart Money Concepts [LuxAlgo] Block ── */}
                         <div className="flex flex-col gap-2 p-2 hover:bg-gray-50 dark:hover:bg-white/5 rounded-lg transition-colors group border-t border-gray-100 dark:border-white/5 mt-1 pt-3">
                            <div className="flex items-center justify-between">
                                <label className="flex items-center cursor-pointer flex-1">
                                    <input
                                        type="checkbox"
                                        checked={settings.showSMC}
                                        onChange={() => toggleIndicator('showSMC')}
                                        className="w-4 h-4 text-brand-primary bg-gray-100 border-gray-300 rounded focus:ring-brand-primary dark:focus:ring-brand-primary dark:ring-offset-gray-800 focus:ring-2 dark:bg-gray-700 dark:border-gray-600"
                                    />
                                    <span className="ml-3 text-sm font-bold bg-clip-text text-transparent bg-gradient-to-r from-amber-400 via-orange-400 to-rose-500 group-hover:opacity-80 transition-opacity">
                                        Smart Money Concepts
                                    </span>
                                </label>
                                <div className="flex rounded overflow-hidden border border-gray-200 dark:border-white/10 text-[9px]">
                                    {(['Colored', 'Monochrome'] as const).map(s => (
                                        <button key={s}
                                            onClick={() => onSettingsChange({ ...settings, smcStyle: s })}
                                            className={`px-1.5 py-0.5 font-bold transition-all ${
                                                settings.smcStyle === s ? 'bg-amber-500 text-white' : 'text-gray-500 hover:text-white'}`}>
                                            {s.slice(0, 4)}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {settings.showSMC && (
                                <div className="flex flex-col gap-2 mt-1 text-[10px]">

                                    {/* Internal Structure */}
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <label className="flex items-center gap-1.5 cursor-pointer mb-1.5">
                                            <input type="checkbox" checked={settings.smcShowInternals}
                                                onChange={() => onSettingsChange({ ...settings, smcShowInternals: !settings.smcShowInternals })}
                                                className="w-3 h-3 rounded text-amber-500" />
                                            <span className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Internal Structure</span>
                                        </label>
                                        <div className="grid grid-cols-2 gap-1">
                                            <div>
                                                <span className="text-gray-500 block mb-0.5">Bullish:</span>
                                                <select value={settings.smcInternalBullFilter}
                                                    onChange={e => onSettingsChange({ ...settings, smcInternalBullFilter: e.target.value as any })}
                                                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none text-[9px]">
                                                    <option value="All">All</option>
                                                    <option value="BOS">BOS Only</option>
                                                    <option value="CHoCH">CHoCH Only</option>
                                                </select>
                                            </div>
                                            <div>
                                                <span className="text-gray-500 block mb-0.5">Bearish:</span>
                                                <select value={settings.smcInternalBearFilter}
                                                    onChange={e => onSettingsChange({ ...settings, smcInternalBearFilter: e.target.value as any })}
                                                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none text-[9px]">
                                                    <option value="All">All</option>
                                                    <option value="BOS">BOS Only</option>
                                                    <option value="CHoCH">CHoCH Only</option>
                                                </select>
                                            </div>
                                        </div>
                                        <label className="flex items-center gap-1.5 cursor-pointer mt-1.5">
                                            <input type="checkbox" checked={settings.smcConfluenceFilter}
                                                onChange={() => onSettingsChange({ ...settings, smcConfluenceFilter: !settings.smcConfluenceFilter })}
                                                className="w-2.5 h-2.5 rounded text-amber-500" />
                                            <span className="text-gray-500 italic">Confluence Filter</span>
                                        </label>
                                    </div>

                                    {/* Swing Structure */}
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <label className="flex items-center gap-1.5 cursor-pointer mb-1.5">
                                            <input type="checkbox" checked={settings.smcShowSwing}
                                                onChange={() => onSettingsChange({ ...settings, smcShowSwing: !settings.smcShowSwing })}
                                                className="w-3 h-3 rounded text-amber-500" />
                                            <span className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide">Swing Structure</span>
                                        </label>
                                        <div className="grid grid-cols-2 gap-1 mb-1.5">
                                            <div>
                                                <span className="text-gray-500 block mb-0.5">Bullish:</span>
                                                <select value={settings.smcSwingBullFilter}
                                                    onChange={e => onSettingsChange({ ...settings, smcSwingBullFilter: e.target.value as any })}
                                                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none text-[9px]">
                                                    <option value="All">All</option>
                                                    <option value="BOS">BOS Only</option>
                                                    <option value="CHoCH">CHoCH Only</option>
                                                </select>
                                            </div>
                                            <div>
                                                <span className="text-gray-500 block mb-0.5">Bearish:</span>
                                                <select value={settings.smcSwingBearFilter}
                                                    onChange={e => onSettingsChange({ ...settings, smcSwingBearFilter: e.target.value as any })}
                                                    className="w-full bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none text-[9px]">
                                                    <option value="All">All</option>
                                                    <option value="BOS">BOS Only</option>
                                                    <option value="CHoCH">CHoCH Only</option>
                                                </select>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-gray-500">Swing Length:</span>
                                            <input type="number" value={settings.smcSwingLength}
                                                onChange={e => onSettingsChange({ ...settings, smcSwingLength: Number(e.target.value) })}
                                                className="w-14 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1.5 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none"
                                                min={10} max={200} step={5} />
                                        </div>
                                        <label className="flex items-center gap-1.5 cursor-pointer">
                                            <input type="checkbox" checked={settings.smcShowStrongWeakHL}
                                                onChange={() => onSettingsChange({ ...settings, smcShowStrongWeakHL: !settings.smcShowStrongWeakHL })}
                                                className="w-2.5 h-2.5 rounded text-amber-500" />
                                            <span className="text-gray-500 italic">Show Strong/Weak H/L</span>
                                        </label>
                                    </div>

                                    {/* Order Blocks */}
                                    <div className="p-2 bg-gray-50 dark:bg-white/5 rounded-lg border border-gray-100 dark:border-white/5">
                                        <p className="font-bold text-gray-600 dark:text-gray-300 uppercase tracking-wide mb-1.5">Order Blocks</p>
                                        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                <input type="checkbox" checked={settings.smcShowInternalOB}
                                                    onChange={() => onSettingsChange({ ...settings, smcShowInternalOB: !settings.smcShowInternalOB })}
                                                    className="w-2.5 h-2.5 rounded text-amber-500" />
                                                <span className="text-gray-500">Internal OB</span>
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <span className="text-gray-500">N:</span>
                                                <input type="number" value={settings.smcInternalOBCount}
                                                    onChange={e => onSettingsChange({ ...settings, smcInternalOBCount: Number(e.target.value) })}
                                                    className="w-10 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none"
                                                    min={1} max={20} />
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 gap-1.5 mb-1.5">
                                            <label className="flex items-center gap-1.5 cursor-pointer">
                                                <input type="checkbox" checked={settings.smcShowSwingOB}
                                                    onChange={() => onSettingsChange({ ...settings, smcShowSwingOB: !settings.smcShowSwingOB })}
                                                    className="w-2.5 h-2.5 rounded text-amber-500" />
                                                <span className="text-gray-500">Swing OB</span>
                                            </label>
                                            <div className="flex items-center gap-1">
                                                <span className="text-gray-500">N:</span>
                                                <input type="number" value={settings.smcSwingOBCount}
                                                    onChange={e => onSettingsChange({ ...settings, smcSwingOBCount: Number(e.target.value) })}
                                                    className="w-10 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none"
                                                    min={1} max={20} />
                                            </div>
                                        </div>
                                        <div className="flex items-center justify-between mb-1">
                                            <span className="text-gray-500">OB Filter:</span>
                                            <select value={settings.smcOBFilter}
                                                onChange={e => onSettingsChange({ ...settings, smcOBFilter: e.target.value as any })}
                                                className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none text-[9px]">
                                                <option value="Atr">ATR</option>
                                                <option value="CumMeanRange">Cum. Mean Range</option>
                                            </select>
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-500">OB Mitigation:</span>
                                            <select value={settings.smcOBMitigation}
                                                onChange={e => onSettingsChange({ ...settings, smcOBMitigation: e.target.value as any })}
                                                className="bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none text-[9px]">
                                                <option value="High/Low">High/Low</option>
                                                <option value="Close">Close</option>
                                            </select>
                                        </div>
                                    </div>

                                    {/* Equal H/L + FVG + Premium/Discount */}
                                    <div className="flex flex-col gap-1.5">
                                        <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                            <input type="checkbox" checked={settings.smcShowEqualHL}
                                                onChange={() => onSettingsChange({ ...settings, smcShowEqualHL: !settings.smcShowEqualHL })}
                                                className="w-2.5 h-2.5 rounded text-amber-500" />
                                            <span className="text-gray-500">Equal Highs/Lows</span>
                                            {settings.smcShowEqualHL && (
                                                <div className="ml-auto flex items-center gap-1">
                                                    <span className="text-gray-600">Thr:</span>
                                                    <input type="number" value={settings.smcEqualHLThreshold}
                                                        onChange={e => onSettingsChange({ ...settings, smcEqualHLThreshold: parseFloat(e.target.value) })}
                                                        className="w-10 bg-white dark:bg-black/20 border border-gray-200 dark:border-white/10 rounded px-1 py-0.5 text-gray-700 dark:text-gray-300 focus:outline-none text-[9px]"
                                                        min={0} max={0.5} step={0.05} />
                                                </div>
                                            )}
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                            <input type="checkbox" checked={settings.smcShowFVG}
                                                onChange={() => onSettingsChange({ ...settings, smcShowFVG: !settings.smcShowFVG })}
                                                className="w-2.5 h-2.5 rounded text-amber-500" />
                                            <span className="text-gray-500">Fair Value Gaps</span>
                                        </label>
                                        <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                            <input type="checkbox" checked={settings.smcShowPDZones}
                                                onChange={() => onSettingsChange({ ...settings, smcShowPDZones: !settings.smcShowPDZones })}
                                                className="w-2.5 h-2.5 rounded text-amber-500" />
                                            <span className="text-gray-500">Premium/Discount Zones</span>
                                        </label>
                                    </div>

                                    {/* Secret Order Flow Features */}
                                    <div className="pt-2 mt-2 border-t border-gray-100 dark:border-white/5">
                                        <div className="text-[10px] font-bold text-amber-600 dark:text-amber-500 mb-1.5 uppercase tracking-wider">
                                            Institutional Order Flow ✨
                                        </div>
                                        <div className="flex flex-col gap-1.5">
                                            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                                <input type="checkbox" checked={settings.smcL2Validation}
                                                    onChange={() => onSettingsChange({ ...settings, smcL2Validation: !settings.smcL2Validation })}
                                                    className="w-2.5 h-2.5 rounded text-amber-500 accent-amber-500" />
                                                <span className="text-gray-500">L2 Validated OBs (Glow)</span>
                                            </label>
                                            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                                <input type="checkbox" checked={settings.smcCVDTrap}
                                                    onChange={() => onSettingsChange({ ...settings, smcCVDTrap: !settings.smcCVDTrap })}
                                                    className="w-2.5 h-2.5 rounded text-amber-500 accent-amber-500" />
                                                <span className="text-gray-500">CVD Trap Detection (BOS)</span>
                                            </label>
                                            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                                <input type="checkbox" checked={settings.smcSweepDetection}
                                                    onChange={() => onSettingsChange({ ...settings, smcSweepDetection: !settings.smcSweepDetection })}
                                                    className="w-2.5 h-2.5 rounded text-amber-500 accent-amber-500" />
                                                <span className="text-gray-500">Live Absorption Sweeps (EQH)</span>
                                            </label>
                                            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                                <input type="checkbox" checked={settings.smcMicroFVG}
                                                    onChange={() => onSettingsChange({ ...settings, smcMicroFVG: !settings.smcMicroFVG })}
                                                    className="w-2.5 h-2.5 rounded text-amber-500 accent-amber-500" />
                                                <span className="text-gray-500">Footprint Micro-FVG Lines</span>
                                            </label>
                                            <label className="flex items-center gap-1.5 cursor-pointer p-1.5 bg-gray-50 dark:bg-white/5 rounded">
                                                <input type="checkbox" checked={settings.smcShowSwingPatterns}
                                                    onChange={() => onSettingsChange({ ...settings, smcShowSwingPatterns: !settings.smcShowSwingPatterns })}
                                                    className="w-2.5 h-2.5 rounded text-amber-500 accent-amber-500" />
                                                <span className="text-gray-500">Swing Candlestick Patterns</span>
                                            </label>
                                        </div>
                                    </div>
                                    
                                </div>
                            )}
                         </div>

                    </div>
                </div>
            )}
        </div>
    );
};
