export interface QuantumAiSettings {
    showQuantumAI: boolean;
    quantumMinConf: number;
    quantumVolatilityFilter: boolean;
    quantumVolThreshold: number; // usually 0.2
}

export interface QuantumAiResult {
    time: number;
    close: number;
    emaBull: boolean;
    emaBear: boolean;
    quantumPower: number;
    isMarketVolatile: boolean;
    bullConfidence: number;
    bearConfidence: number;
    bullEntry: boolean;
    bearEntry: boolean;
    stopLossValue: number;
    takeProfitValue: number;
    signalReason: string;
    // Phase 3 Extensions
    htfTrend: string;
    mtfTrend: string;
    alignmentStatus: string;
    ichimokuStatus: string;
    tkCross: string;
    activePattern: string;
    divergenceStatus: string;
}

// ── Helpers ──

const calculateSMA = (data: number[], period: number): number => {
    if (data.length < period) return data[data.length - 1] || 0;
    const slice = data.slice(-period);
    const sum = slice.reduce((a, b) => a + b, 0);
    return sum / period;
};

const calculateEMAArray = (data: number[], period: number): number[] => {
    const k = 2 / (period + 1);
    const result: number[] = [];
    let ema = data[0];
    result.push(ema);
    for (let i = 1; i < data.length; i++) {
        ema = data[i] * k + ema * (1 - k);
        result.push(ema);
    }
    return result;
};

const calculateTR = (high: number, low: number, prevClose: number): number => {
    return Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
};

const calculateRSI = (data: number[], period: number): number[] => {
    const rsi: number[] = [];
    let avgGain = 0;
    let avgLoss = 0;
    for (let i = 1; i < data.length; i++) {
        const change = data[i] - data[i - 1];
        if (i <= period) {
            avgGain += Math.max(0, change);
            avgLoss += Math.max(0, -change);
            if (i === period) {
                avgGain /= period;
                avgLoss /= period;
                rsi.push(100 - 100 / (1 + avgGain / avgLoss));
            } else {
                rsi.push(50); // placeholder
            }
        } else {
            const gain = Math.max(0, change);
            const loss = Math.max(0, -change);
            avgGain = (avgGain * (period - 1) + gain) / period;
            avgLoss = (avgLoss * (period - 1) + loss) / period;
            rsi.push(100 - 100 / (1 + avgGain / avgLoss));
        }
    }
    while (rsi.length < data.length) rsi.unshift(50);
    return rsi;
};

// ── Quantum AI v8 - Phase 3 Engine ──

export const calculateQuantumAi = (
    candles: any[],
    settings: QuantumAiSettings,
    vp_poc_price: number = 0 // Optional: can be passed from outside (VPVR Data)
): QuantumAiResult[] => {
    if (!settings.showQuantumAI || candles.length < 100) return [];

    const closes = candles.map(c => c.close);
    const highs = candles.map(c => c.high);
    const lows = candles.map(c => c.low);
    const opens = candles.map(c => c.open);

    // 1. Technical Indicators
    const ema8 = calculateEMAArray(closes, 8);
    const ema21 = calculateEMAArray(closes, 21);
    const ema55 = calculateEMAArray(closes, 55);
    const ema200 = calculateEMAArray(closes, 200);
    const rsi = calculateRSI(closes, 14);

    // Fib EMAs for Quantum Power
    const fib13 = calculateEMAArray(closes, 13);
    const fib34 = calculateEMAArray(closes, 34);
    const fib89 = calculateEMAArray(closes, 89);
    const fib144 = calculateEMAArray(closes, 144);

    // ATR for Volatility
    const trs = [highs[0] - lows[0]];
    for (let i = 1; i < candles.length; i++) trs.push(calculateTR(highs[i], lows[i], closes[i - 1]));
    const atr14: number[] = [];
    for (let i = 0; i < candles.length; i++) {
        atr14.push(i < 14 ? calculateSMA(trs.slice(0, i + 1), i + 1) : calculateSMA(trs.slice(i - 13, i + 1), 14));
    }

    // 2. Ichimoku Cloud (9, 26, 52)
    const tenkanLen = 9, kijunLen = 26, senkouB_Len = 52;
    const tenkan: number[] = [];
    const kijun: number[] = [];
    const senkouA: number[] = [];
    const senkouB: number[] = [];

    for (let i = 0; i < candles.length; i++) {
        const getHigh = (len: number, idx: number) => Math.max(...highs.slice(Math.max(0, idx - len + 1), idx + 1));
        const getLow = (len: number, idx: number) => Math.min(...lows.slice(Math.max(0, idx - len + 1), idx + 1));
        
        tenkan.push((getHigh(tenkanLen, i) + getLow(tenkanLen, i)) / 2);
        kijun.push((getHigh(kijunLen, i) + getLow(kijunLen, i)) / 2);
        senkouA.push((tenkan[i] + kijun[i]) / 2);
        senkouB.push((getHigh(senkouB_Len, i) + getLow(senkouB_Len, i)) / 2);
    }

    // 3. Multi-Timeframe Analysis Simulation (Aggregating 5m -> 1H / 4H)
    // We simulate by viewing larger windows. HTF (240) = 48 candles of 5m. MTF (60) = 12 candles.
    const htfLookback = 200, mtfLookback = 50;

    const results: QuantumAiResult[] = [];

    // Main Loop
    for (let i = 0; i < candles.length; i++) {
        const close = closes[i];
        
        // Base Trends
        const isEmaBull = close > ema8[i] && ema8[i] > ema21[i] && ema21[i] > ema55[i];
        const isEmaBear = close < ema8[i] && ema8[i] < ema21[i] && ema21[i] < ema55[i];

        // Quantum Power
        let qScore = 0;
        [ema8[i], fib13[i], ema21[i], fib34[i], ema55[i], fib89[i], fib144[i]].forEach(ema => { if (close > ema) qScore++; });
        const quantumPower = (qScore / 7.0) * 100;

        // Volatility Filter
        const volPercent = (atr14[i] / close) * 100;
        const isVolatile = !settings.quantumVolatilityFilter || (volPercent >= settings.quantumVolThreshold);

        // MTF Analysis (Simulated)
        const htfEMA = calculateSMA(closes.slice(Math.max(0, i - htfLookback), i + 1), 200);
        const mtfEMA = calculateSMA(closes.slice(Math.max(0, i - mtfLookback), i + 1), 50);
        const htfTrendStr = close > htfEMA ? "Bullish" : "Bearish";
        const mtfTrendStr = close > mtfEMA ? "Bullish" : "Bearish";
        
        let alignmentValue = 0;
        if (htfTrendStr === "Bullish") alignmentValue++; else alignmentValue--;
        if (mtfTrendStr === "Bullish") alignmentValue++; else alignmentValue--;
        if (isEmaBull) alignmentValue++; else if (isEmaBear) alignmentValue--;

        const alignmentStatus = alignmentValue === 3 ? "🟢 Perfect Bull" : alignmentValue === 2 ? "🟢 Strong Bull" : alignmentValue === 1 ? "🟡 Weak Bull" : alignmentValue === -3 ? "🔴 Perfect Bear" : alignmentValue === -2 ? "🔴 Strong Bear" : alignmentValue === -1 ? "🟡 Weak Bear" : "⚪ Mixed";

        // Ichimoku Status
        const sA = i >= 26 ? senkouA[i - 26] : senkouA[i];
        const sB = i >= 26 ? senkouB[i - 26] : senkouB[i];
        const ichimokuStatus = close > Math.max(sA, sB) ? "🟢 Bullish" : close < Math.min(sA, sB) ? "🔴 Bearish" : "⚪ In Cloud";
        const tkCross = tenkan[i] > kijun[i] ? "🟢 TK Bull" : "🔴 TK Bear";

        // 4. Enhanced Confidence Engine (Scoring)
        const calcConf = (isBull: boolean) => {
            let score = 0;
            // 1. Base Trend (EMA) - 20 pts
            if (isBull && isEmaBull) score += 20; else if (!isBull && isEmaBear) score += 20;
            // 2. Quantum Power - 20 pts
            score += isBull ? (quantumPower / 100) * 20 : ((100 - quantumPower) / 100) * 20;
            // 3. MTF Analysis - 25 pts (Max)
            if (isBull) {
                if (htfTrendStr === "Bullish") score += 15;
                if (mtfTrendStr === "Bullish") score += 10;
            } else {
                if (htfTrendStr === "Bearish") score += 15;
                if (mtfTrendStr === "Bearish") score += 10;
            }
            // 4. Ichimoku - 15 pts
            if (isBull && ichimokuStatus === "🟢 Bullish") score += 15; else if (!isBull && ichimokuStatus === "🔴 Bearish") score += 15;
            // 5. POC Proximity - 10 pts
            if (vp_poc_price > 0) {
                if (isBull && close > vp_poc_price) score += 10; else if (!isBull && close < vp_poc_price) score += 10;
            } else {
                score += 10; // Default if POC not available
            }
            // 6. VWAP (Close vs average of bar) - 10 pts
            const vwapPlaceholder = (opens[i] + highs[i] + lows[i] + close) / 4;
            if (isBull && close > vwapPlaceholder) score += 10; else if (!isBull && close < vwapPlaceholder) score += 10;
            
            return Math.min(score, 100);
        };

        const bullConf = calcConf(true);
        const bearConf = calcConf(false);

        // 5. Divergence Status (Simplified RSI check)
        let divergenceStatus = "None";
        if (i > 10) {
            const rsiP = rsi[i], rsiOld = rsi[i - 10];
            const p = closes[i], pOld = closes[i - 10];
            if (p < pOld && rsiP > rsiOld) divergenceStatus = "🟢 Bullish Div";
            else if (p > pOld && rsiP < rsiOld) divergenceStatus = "🔴 Bearish Div";
        }

        // 6. Simplified Pattern Detection
        let activePattern = "None";
        const bodySize = Math.abs(close - opens[i]);
        if (close > opens[i] && (highs[i] - close) < bodySize * 0.5 && (opens[i] - lows[i]) > bodySize * 2) activePattern = "🕯️ Hammer";
        else if (close < opens[i] && (highs[i] - opens[i]) > bodySize * 2 && (close - lows[i]) < bodySize * 0.5) activePattern = "🕯️ S.Star";

        // Entry Logic
        const bullEntry = bullConf >= settings.quantumMinConf && (isEmaBull || activePattern === "🕯️ Hammer") && isVolatile;
        const bearEntry = bearConf >= settings.quantumMinConf && (isEmaBear || activePattern === "🕯️ S.Star") && isVolatile;

        // Reason Builder
        let reason = "No Signal";
        if (bullEntry) {
            reason = (isEmaBull ? "EMA Bull " : "") + (activePattern !== "None" ? "Pattern " : "") + (divergenceStatus !== "None" ? "RSI Div" : "");
        } else if (bearEntry) {
            reason = (isEmaBear ? "EMA Bear " : "") + (activePattern !== "None" ? "Pattern " : "") + (divergenceStatus !== "None" ? "RSI Div" : "");
        }

        const sl = bullEntry ? close - atr14[i] * 1.5 : bearEntry ? close + atr14[i] * 1.5 : 0;
        const tp = bullEntry ? close + (close - sl) * 2 : bearEntry ? close - (sl - close) * 2 : 0;

        results.push({
            time: candles[i].time,
            close,
            emaBull: isEmaBull,
            emaBear: isEmaBear,
            quantumPower,
            isMarketVolatile: isVolatile,
            bullConfidence: bullConf,
            bearConfidence: bearConf,
            bullEntry,
            bearEntry,
            stopLossValue: sl,
            takeProfitValue: tp,
            signalReason: reason,
            htfTrend: htfTrendStr,
            mtfTrend: mtfTrendStr,
            alignmentStatus,
            ichimokuStatus,
            tkCross,
            activePattern,
            divergenceStatus
        });
    }

    return results;
};
