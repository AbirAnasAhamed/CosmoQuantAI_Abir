import React, { useMemo, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IndicatorSettings } from './IndicatorSelector';
import { 
    calculateEMA, calculateRSI, calculateMACD, calculateSqueeze,
    calculateOBV, calculateStochRSI, calculateADX, calculateStructure 
} from '../../../utils/indicators';

interface DualEngineDashboardProps {
    settings: IndicatorSettings;
    candles: any[];
    currentPrice: number;
}

export const DualEngineDashboard: React.FC<DualEngineDashboardProps> = ({ settings, candles, currentPrice }) => {
    const [isVisible, setIsVisible] = useState(true);
    const [cpiStatus, setCpiStatus] = useState<string>("FETCHING...");
    const [position, setPosition] = useState({ x: 0, y: 0 });
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

    const handleMouseDown = (e: React.MouseEvent) => {
        setIsDragging(true);
        setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    };

    const handleMouseMove = (e: MouseEvent) => {
        if (!isDragging) return;
        setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    };

    const handleMouseUp = () => {
        setIsDragging(false);
    };

    useEffect(() => {
        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        } else {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        }
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragStart]);

    // Effect to fetch Fred CPI if key is provided
    useEffect(() => {
        if (settings.dualEngineMode === 'Legacy' && settings.fredApiKey) {
            setCpiStatus("FETCHING...");
            // Due to CORS from full browser, FRED API normally requires server side proxy.
            // For this implementation, we attempt a direct fetch. If CORS fails, we handle it beautifully.
            fetch(`https://api.stlouisfed.org/fred/series/observations?series_id=CPIAUCSL&api_key=${settings.fredApiKey}&file_type=json&sort_order=desc&limit=2`)
                .then(res => res.json())
                .then(data => {
                    if (data && data.observations && data.observations.length >= 2) {
                        const current = parseFloat(data.observations[0].value);
                        const previous = parseFloat(data.observations[1].value);
                        if (current > previous) setCpiStatus("RISING (BEARISH)");
                        else if (current < previous) setCpiStatus("FALLING (BULLISH)");
                        else setCpiStatus("FLAT (NEUTRAL)");
                    } else {
                        setCpiStatus("UNAVAILABLE");
                    }
                })
                .catch(err => {
                    console.error("FRED API Error:", err);
                    setCpiStatus("UNAVAILABLE (CORS/NETWORK)");
                });
        } else if (settings.dualEngineMode === 'Legacy') {
            setCpiStatus("UNAVAILABLE (NO API KEY)");
        }
    }, [settings.dualEngineMode, settings.fredApiKey]);

    // Compute live state for both Hybrid & Legacy
    const engineState = useMemo(() => {
        if (!candles || candles.length < 50) return null;

        const closePrices = candles.map(c => ({ 
            time: c.time, 
            close: c.close, 
            high: c.high || c.close, 
            low: c.low || c.close,
            volume: c.volume || 0 
        }));
        
        const currentClose = currentPrice || candles[candles.length - 1].close;

        // --- Core 4 Engine Metrics ---
        // 1. EMA
        const emaData = calculateEMA(closePrices, settings.dualEngineEmaPeriod);
        const lastEma = emaData.length > 0 ? emaData[emaData.length - 1].value : currentClose;
        const trendBullish = currentClose > lastEma;

        // 2. RSI
        const rsiData = calculateRSI(closePrices, settings.dualEngineRsiPeriod);
        const lastRsi = rsiData.length > 0 ? rsiData[rsiData.length - 1].value : 50;
        const rsiBullish = lastRsi > 50 && lastRsi < settings.dualEngineRsiOB;
        const rsiBearish = lastRsi < 50 && lastRsi > settings.dualEngineRsiOS;

        // 3. MACD
        const macdData = calculateMACD(closePrices, settings.dualEngineMacdFast, settings.dualEngineMacdSlow, settings.dualEngineMacdSignal);
        const lastMacd = macdData.length > 0 ? macdData[macdData.length - 1] : { macd: 0, signal: 0, histogram: 0 };
        const macdBullish = lastMacd.histogram > 0;

        // 4. Squeeze Breakout
        const squeezeData = calculateSqueeze(closePrices, settings.dualEngineSqueezeLength, settings.dualEngineSqueezeBB, settings.dualEngineSqueezeKC);
        const lastSqueeze = squeezeData.length > 0 ? squeezeData[squeezeData.length - 1] : { squeezeOn: false, squeezeOff: true };
        
        // --- Legacy Engine Metrics ---
        // HTF Proxy (Since we only have current timeframe candles, we use a 200 EMA to simulate HTF trend)
        const htfEmaData = calculateEMA(closePrices, 200);
        const lastHtfEma = htfEmaData.length > 0 ? htfEmaData[htfEmaData.length - 1].value : currentClose;
        const htfBullish = currentClose > lastHtfEma;
        const htfBearish = currentClose < lastHtfEma;

        // Structure
        const struct = calculateStructure(closePrices, 5);
        
        // OBV
        const obvData = calculateOBV(closePrices);
        const obvEMA = calculateEMA(obvData.map(d => ({ time: d.time, close: d.value })), 20); // 20 SMA proxy
        const lastObv = obvData.length > 0 ? obvData[obvData.length - 1].value : 0;
        const lastObvEma = obvEMA.length > 0 ? obvEMA[obvEMA.length - 1].value : 0;
        const obvBullish = lastObv > lastObvEma;

        // ADX
        let adxValue = 0;
        let isStrongTrend = false;
        try {
            const adxPeriod = settings.dualEngineAdxLength || 14;
            const adxThresh = settings.dualEngineAdxThreshold || 25;
            const adxData = calculateADX(closePrices, adxPeriod);
            if (adxData.length > 0) {
                adxValue = adxData[adxData.length - 1].adx;
                isStrongTrend = adxValue > adxThresh;
            }
        } catch(e) {}

        // Stoch RSI
        let stochStatus = 'NEUTRAL';
        try {
            const stochData = calculateStochRSI(closePrices, 14, 14, 3);
            if (stochData.length > 0) {
                const k = stochData[stochData.length - 1].k;
                if (k > 80) stochStatus = 'OVERBOUGHT';
                else if (k < 20) stochStatus = 'OVERSOLD';
            }
        } catch(e) {}

        // Momentum Speed
        const momFastEma = calculateEMA(closePrices, 9);
        const momSlowEma = calculateEMA(closePrices, 21);
        let momSpeedStatus = 'NEUTRAL';
        if (momFastEma.length > 1 && momSlowEma.length > 1) {
            const fast0 = momFastEma[momFastEma.length - 1].value;
            const slow0 = momSlowEma[momSlowEma.length - 1].value;
            const fast1 = momFastEma[momFastEma.length - 2].value;
            const slow1 = momSlowEma[momSlowEma.length - 2].value;
            
            const isBullMom = fast0 > slow0;
            const isStrengthening = Math.abs(fast0 - slow0) > Math.abs(fast1 - slow1);
            if (isBullMom && isStrengthening) momSpeedStatus = "STRONG BULL";
            else if (isBullMom) momSpeedStatus = "WEAK BULL";
            else if (!isBullMom && isStrengthening) momSpeedStatus = "STRONG BEAR";
            else momSpeedStatus = "WEAK BEAR";
        }

        // --- Overall Insight Score Calculation ---
        let overallScore = 0;
        if (htfBullish) overallScore += 2;
        else if (htfBearish) overallScore -= 2;

        if (trendBullish) overallScore += 1;
        else overallScore -= 1;

        if (struct.isBullStruct) overallScore += 1;
        else if (struct.isBearStruct) overallScore -= 1;

        if (lastMacd.macd > lastMacd.signal) overallScore += 1;
        else overallScore -= 1;

        if (obvBullish) overallScore += 1;
        else overallScore -= 1;

        if (momSpeedStatus === "STRONG BULL") overallScore += 1;
        else if (momSpeedStatus === "STRONG BEAR") overallScore -= 1;

        let insightStatus = "NEUTRAL / RANGING";
        if (overallScore >= 4) insightStatus = "STRONG BULLISH";
        else if (overallScore >= 1) insightStatus = "SLIGHTLY BULLISH";
        else if (overallScore <= -4) insightStatus = "STRONG BEARISH";
        else if (overallScore <= -1) insightStatus = "SLIGHTLY BEARISH";


        // Final Signal Logic (Hybrid)
        let signal = 'NEUTRAL';
        let signalColor = 'text-gray-400';
        let signalBg = 'bg-gray-500/10 border-gray-500/20';

        if (trendBullish && rsiBullish && macdBullish && lastSqueeze.squeezeOff) {
            signal = 'STRONG BUY';
            signalColor = 'text-green-500 drop-shadow-[0_0_8px_rgba(34,197,94,0.8)]';
            signalBg = 'bg-green-500/10 border-green-500/20';
        } else if (!trendBullish && rsiBearish && !macdBullish && lastSqueeze.squeezeOff) {
            signal = 'STRONG SELL';
            signalColor = 'text-red-500 drop-shadow-[0_0_8px_rgba(239,68,68,0.8)]';
            signalBg = 'bg-red-500/10 border-red-500/20';
        }

        return {
            // Core
            ema: lastEma,
            trendBullish,
            rsi: lastRsi,
            rsiBullish,
            rsiBearish,
            macd: lastMacd,
            macdBullish,
            squeeze: lastSqueeze,
            signal,
            signalColor,
            signalBg,
            // Legacy Extended
            insightStatus,
            htfBullish,
            htfBearish,
            struct,
            obvBullish,
            adxValue,
            isStrongTrend,
            stochStatus,
            momSpeedStatus
        };

    }, [candles, currentPrice, settings]);

    if (!settings.showDualEngine || !engineState) return null;

    // Helper for Legacy Table Colors
    const getStatusColor = (status: string) => {
        if (['BULLISH','UP', 'ACCUMULATION', "STRONG BULLISH", "SLIGHTLY BULLISH", "STRONG BULL", "FALLING (BULLISH)"].includes(status)) return "bg-green-500/20 text-green-400";
        if (['BEARISH','DOWN', 'DISTRIBUTION', "STRONG BEARISH", "SLIGHTLY BEARISH", "STRONG BEAR", "RISING (BEARISH)"].includes(status)) return "bg-red-500/20 text-red-400";
        if (['OVERSOLD'].includes(status)) return "bg-teal-500/20 text-teal-400";
        if (['OVERBOUGHT'].includes(status)) return "bg-fuchsia-500/20 text-fuchsia-400";
        if (['SQUEEZE', 'BUILDING ⚠️'].includes(status)) return "bg-yellow-500/20 text-yellow-400";
        return "bg-gray-500/20 text-gray-400"; // Neutral/Other
    };

    const dashboardLayout = settings.dualEngineMode === 'Legacy' ? (
        // ==========================================
        //         FULL LEGACY DASHBOARD
        // ==========================================
        <div className={`backdrop-blur-xl border border-gray-600/50 rounded-lg p-2 w-[340px] shadow-2xl bg-[#1e222d]/95 font-sans`}>
            {/* Overall Insight Score */}
            <div 
                className="flex justify-between items-center bg-[#2a2e39] border border-gray-600/50 p-1.5 mb-2 cursor-move select-none"
                onMouseDown={handleMouseDown}
            >
                <span className="text-[10px] text-white font-semibold">OVERALL INSIGHT (DRAG ME)</span>
                <span className={`text-[10px] font-bold px-3 py-0.5 rounded-sm ${getStatusColor(engineState.insightStatus)}`}>
                    {engineState.insightStatus}
                </span>
            </div>

            {/* Separator */}
            <div className="h-[1px] bg-gray-600/50 mb-2 w-full" />

            {/* Table Generator */}
            <div className="flex flex-col gap-[1px] bg-[#2a2e39] text-[10px]">
                {[
                    { label: "HTF Proxy Trend", status: engineState.htfBullish ? 'BULLISH' : engineState.htfBearish ? 'BEARISH' : 'NEUTRAL' },
                    { label: "LTF Trend", status: engineState.trendBullish ? 'UP' : 'DOWN' },
                    { label: "Market Structure", status: engineState.struct.isBullStruct ? 'BULLISH' : engineState.struct.isBearStruct ? 'BEARISH' : 'CONSOLIDATION' },
                    { label: "Trend Strength (ADX)", status: engineState.isStrongTrend ? 'STRONG TREND' : 'WEAK TREND' },
                    { label: "RSI Status", status: engineState.rsi > settings.dualEngineRsiOB ? 'OVERBOUGHT' : engineState.rsi < settings.dualEngineRsiOS ? 'OVERSOLD' : 'NEUTRAL' },
                    { label: "Stoch RSI Status", status: engineState.stochStatus },
                    { label: "MACD Status", status: engineState.macdBullish ? 'BULLISH' : 'BEARISH' },
                    { label: "Volume Flow (OBV)", status: engineState.obvBullish ? 'ACCUMULATION' : 'DISTRIBUTION' },
                    { label: "Momentum Speed", status: engineState.momSpeedStatus },
                    { label: "Price vs BB", status: engineState.squeeze.squeezeOn ? 'SQUEEZE' : 'INSIDE/EXPANDED' },
                    { label: "US CPI Status", status: cpiStatus }
                ].map((row, idx) => (
                    <div key={idx} className="flex bg-[#1e222d] hover:bg-[#2a2e39] transition-colors border border-gray-600/20">
                        <div className="w-1/2 p-2 border-r border-gray-600/50 text-gray-300 flex items-center">
                            {row.label}
                        </div>
                        <div className={`w-1/2 p-1.5 flex justify-center items-center font-bold`}>
                            <span className={`w-full py-1 text-center rounded-sm ${getStatusColor(row.status)}`}>
                                {row.status}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    ) : (
        // ==========================================
        //         HYBRID MODERN HUD
        // ==========================================
        <div className={`backdrop-blur-xl border rounded-2xl p-4 w-72 shadow-2xl transition-colors duration-500 ${engineState.signalBg}`}>
            
            {/* Header */}
            <div 
                className="flex items-center justify-between mb-4 border-b border-white/5 pb-2 cursor-move select-none"
                onMouseDown={handleMouseDown}
            >
                <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse shadow-[0_0_8px_rgba(34,211,238,0.8)]" />
                    <h2 className="text-xs font-black text-white uppercase tracking-widest opacity-90">Dual Engine HUD (DRAG ME)</h2>
                </div>
            </div>

            {/* Overall Insight - Added to Hybrid Mode */}
            <div className="mb-3 px-2 py-1.5 rounded bg-black/30 border border-white/5 flex justify-between items-center text-[9px]">
                <span className="text-gray-400 font-bold uppercase tracking-wider">Overall Insight</span>
                <span className={`font-black tracking-wider px-2 py-0.5 rounded ${getStatusColor(engineState.insightStatus)}`}>
                    {engineState.insightStatus}
                </span>
            </div>

            {/* Final Signal Element */}
            <div className="flex flex-col items-center justify-center py-3 mb-4 bg-black/40 rounded-xl border border-white/5 relative overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none" />
                <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest mb-1 z-10">System Signal</span>
                <span className={`text-2xl font-black italic tracking-tighter z-10 transition-colors ${engineState.signalColor}`}>
                    {engineState.signal}
                </span>
            </div>

            {/* Conditions Grid */}
            <div className="grid grid-cols-2 gap-2">
                {/* Trend Block */}
                <div className="p-2 bg-black/20 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">EMA Trend</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${engineState.trendBullish ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,1)]' : 'bg-red-500 shadow-[0_0_5px_rgba(239,68,68,1)]'}`} />
                    </div>
                    <div className="text-xs font-bold text-white">
                        {engineState.trendBullish ? 'BULLISH' : 'BEARISH'}
                    </div>
                </div>

                {/* RSI Block */}
                <div className="p-2 bg-black/20 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">RSI Mom</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${(engineState.rsiBullish || engineState.rsiBearish) ? 'bg-green-500 shadow-[0_0_5px_rgba(34,197,94,1)]' : 'bg-yellow-500 shadow-[0_0_5px_rgba(234,179,8,1)]'}`} />
                    </div>
                    <div className={`text-xs font-bold ${engineState.rsi > settings.dualEngineRsiOB ? 'text-red-400' : engineState.rsi < settings.dualEngineRsiOS ? 'text-green-400' : 'text-gray-300'}`}>
                        {engineState.rsi > settings.dualEngineRsiOB ? 'OVERBOUGHT' : engineState.rsi < settings.dualEngineRsiOS ? 'OVERSOLD' : 'NEUTRAL'}
                    </div>
                </div>

                {/* MACD Block */}
                <div className="p-2 bg-black/20 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">MACD Flow</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${engineState.macdBullish ? 'bg-emerald-400 shadow-[0_0_5px_rgba(52,211,153,1)]' : 'bg-rose-400 shadow-[0_0_5px_rgba(251,113,133,1)]'}`} />
                    </div>
                    <div className={`text-xs font-bold ${engineState.macdBullish ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {engineState.macdBullish ? 'POSITIVE' : 'NEGATIVE'}
                    </div>
                </div>

                {/* Squeeze Block */}
                <div className="p-2 bg-black/20 rounded-lg border border-white/5">
                    <div className="flex justify-between items-center mb-1">
                        <span className="text-[9px] text-gray-500 font-bold uppercase">Squeeze</span>
                        <div className={`w-1.5 h-1.5 rounded-full ${engineState.squeeze.squeezeOn ? 'bg-yellow-400 shadow-[0_0_5px_rgba(250,204,21,1)]' : 'bg-blue-400 shadow-[0_0_5px_rgba(96,165,250,1)]'}`} />
                    </div>
                    <div className="text-xs font-bold text-white">
                        {engineState.squeeze.squeezeOn ? 'BUILDING ⚠️' : 'FIRED 💥'}
                    </div>
                </div>
            </div>
        </div>
    );

    const dashboardElement = (
        <div 
            className={`fixed z-[9999] pointer-events-auto transition-opacity duration-300 ease-in-out ${isVisible ? 'opacity-100' : 'opacity-0 pointer-events-none'} ${isDragging ? 'cursor-grabbing' : ''}`}
            style={{ 
                top: `100px`, 
                right: `24px`,
                transform: `translate(${position.x}px, ${position.y}px)` 
            }}
        >
            {dashboardLayout}
        </div>
    );

    // Render into document.body using a React Portal so it escapes all parent container overflow:hidden restrictions
    return typeof window !== 'undefined' ? createPortal(dashboardElement, document.body) : null;
};
