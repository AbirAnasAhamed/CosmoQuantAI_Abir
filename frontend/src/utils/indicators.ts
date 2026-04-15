export interface IndicatorDataPoint {
    time: string | number;
    value: number;
}

export interface SupertrendDataPoint {
    time: string | number;
    value: number;
    trend: 1 | -1;
    isBuy: boolean;
    isSell: boolean;
    upLine: number | null;
    dnLine: number | null;
}

export interface BollingerBandsDataPoint {
    time: string | number;
    upper: number;
    middle: number;
    lower: number;
}

export interface MsbObZone {
    type: 'Bu-OB' | 'Be-OB' | 'Bu-BB' | 'Be-BB' | 'Bu-MB' | 'Be-MB';
    top: number;
    bottom: number;
    startX: number;
    endX: number;
    isBroken: boolean;
    id: string;
}

export interface MsbObDataPoint {
    time: string | number;
    high: number;
    low: number;
    isHigh: boolean;
    isLow: boolean;
    msbType: 'Bullish' | 'Bearish' | null;
    msbPrice: number | null;
    msbAvgIdx: number | null;
    zigzagPrice: number | null;
}

export interface MsbObResult {
    points: MsbObDataPoint[];
    zones: MsbObZone[];
}

// Simple Moving Average
export const calculateSMA = (data: { time: any; close: number }[], period: number): IndicatorDataPoint[] => {
    const result: IndicatorDataPoint[] = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        result.push({ time: data[i].time, value: sum / period });
    }
    return result;
};

// Exponential Moving Average
export const calculateEMA = (data: { time: any; close: number }[], period: number): IndicatorDataPoint[] => {
    const result: IndicatorDataPoint[] = [];
    if (data.length < period) return result;

    const multiplier = 2 / (period + 1);

    // First EMA is SMA
    let sum = 0;
    for (let i = 0; i < period; i++) {
        sum += data[i].close;
    }
    let prevEMA = sum / period;

    result.push({ time: data[period - 1].time, value: prevEMA });

    for (let i = period; i < data.length; i++) {
        const ema = (data[i].close - prevEMA) * multiplier + prevEMA;
        result.push({ time: data[i].time, value: ema });
        prevEMA = ema;
    }

    return result;
};

// Bollinger Bands
// Returns { time, upper, middle, lower }
export const calculateBollingerBands = (data: { time: any; close: number }[], period: number, stdDev: number = 2): BollingerBandsDataPoint[] => {
    const result: BollingerBandsDataPoint[] = [];
    for (let i = period - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < period; j++) {
            sum += data[i - j].close;
        }
        const middle = sum / period;

        let varianceSum = 0;
        for (let j = 0; j < period; j++) {
            varianceSum += Math.pow(data[i - j].close - middle, 2);
        }
        const variance = varianceSum / period;
        const sd = Math.sqrt(variance);

        result.push({
            time: data[i].time,
            upper: middle + stdDev * sd,
            middle: middle,
            lower: middle - stdDev * sd
        });
    }
    return result;
};

// Relative Strength Index
export const calculateRSI = (data: { time: any; close: number }[], period: number = 14): IndicatorDataPoint[] => {
    const result: IndicatorDataPoint[] = [];
    if (data.length <= period) return result;

    let upSum = 0;
    let downSum = 0;

    // Calculate initial average gain/loss
    for (let i = 1; i <= period; i++) {
        const diff = data[i].close - data[i - 1].close;
        if (diff > 0) {
            upSum += diff;
        } else {
            downSum -= diff;
        }
    }

    let avgUp = upSum / period;
    let avgDown = downSum / period;

    result.push({
        time: data[period].time,
        value: avgDown === 0 ? 100 : 100 - (100 / (1 + avgUp / avgDown))
    });

    // Wilder's Smoothing
    for (let i = period + 1; i < data.length; i++) {
        const diff = data[i].close - data[i - 1].close;
        let up = 0;
        let down = 0;

        if (diff > 0) {
            up = diff;
        } else {
            down = -diff;
        }

        avgUp = (avgUp * (period - 1) + up) / period;
        avgDown = (avgDown * (period - 1) + down) / period;

        let rsi = 100;
        if (avgDown > 0) {
            rsi = 100 - (100 / (1 + avgUp / avgDown));
        }

        result.push({ time: data[i].time, value: rsi });
    }

    return result;
};

// --- Incremental Updates for Real-time Performance ---

/**
 * Updates EMA for the latest data point without recalculating history
 * @param data The candle data including the latest point
 * @param prevEMA The EMA value of the previous candle
 * @param period EMA period
 */
export const updateEMA = (data: { time: any; close: number }, prevEMA: number, period: number): IndicatorDataPoint => {
    const multiplier = 2 / (period + 1);
    const ema = (data.close - prevEMA) * multiplier + prevEMA;
    return { time: data.time, value: ema };
};

/**
 * Updates Bollinger Bands for the latest data point
 * Note: BB needs some history to calculate standard deviation accurately.
 * For efficiency, we only use the last 'period' candles.
 */
export const updateBollingerBands = (dataSlice: { time: any; close: number }[], period: number, stdDev: number = 2): BollingerBandsDataPoint => {
    const lastPoint = dataSlice[dataSlice.length - 1];
    let sum = 0;
    for (let i = 0; i < dataSlice.length; i++) {
        sum += dataSlice[i].close;
    }
    const middle = sum / dataSlice.length;

    let varianceSum = 0;
    for (let i = 0; i < dataSlice.length; i++) {
        varianceSum += Math.pow(dataSlice[i].close - middle, 2);
    }
    const variance = varianceSum / dataSlice.length;
    const sd = Math.sqrt(variance);

    return {
        time: lastPoint.time,
        upper: middle + stdDev * sd,
        middle: middle,
        lower: middle - stdDev * sd
    };
};

/**
 * Updates RSI for the latest data point using Wilder's Smoothing
 */
export const updateRSI = (data: { close: number; time: any }, prevClose: number, prevAvgUp: number, prevAvgDown: number, period: number): { rsi: IndicatorDataPoint, avgUp: number, avgDown: number } => {
    const diff = data.close - prevClose;
    let up = 0;
    let down = 0;

    if (diff > 0) {
        up = diff;
    } else {
        down = -diff;
    }

    const avgUp = (prevAvgUp * (period - 1) + up) / period;
    const avgDown = (prevAvgDown * (period - 1) + down) / period;

    let rsiValue = 100;
    if (avgDown > 0) {
        rsiValue = 100 - (100 / (1 + avgUp / avgDown));
    }

    return {
        rsi: { time: data.time, value: rsiValue },
        avgUp,
        avgDown
    };
};

/**
 * Calculates Average True Range (ATR)
 * @param data OHLCV data
 * @param period ATR period
 */
export const calculateATR = (data: { time: any; high: number; low: number; close: number }[], period: number = 14): IndicatorDataPoint[] => {
    const result: IndicatorDataPoint[] = [];
    if (data.length <= period) return result;

    const trs: number[] = [];
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const pc = data[i - 1].close;
        const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
        trs.push(tr);
    }

    // First ATR is SMA of TRs
    let trSum = 0;
    for (let i = 0; i < period; i++) {
        trSum += trs[i];
    }
    let prevATR = trSum / period;
    result.push({ time: data[period].time, value: prevATR });

    // Subsequent ATRs use smoothing
    for (let i = period; i < trs.length; i++) {
        const atr = (prevATR * (period - 1) + trs[i]) / period;
        result.push({ time: data[i + 1].time, value: atr });
        prevATR = atr;
    }

    return result;
};

// --- Ichimoku Cloud ---
export interface IchimokuDataPoint {
    time: string | number;
    tenkan: number | null;
    kijun: number | null;
    senkouA: number | null;
    senkouB: number | null;
    chikou: number | null;
}

export const calculateIchimoku = (
    data: { time: any; high: number; low: number; close: number }[],
    tenkanPeriod: number = 9,
    kijunPeriod: number = 26,
    senkouBPeriod: number = 52,
    displacement: number = 26
): IchimokuDataPoint[] => {
    const result: IchimokuDataPoint[] = [];
    if (data.length < Math.min(tenkanPeriod, kijunPeriod, senkouBPeriod)) return result;

    const getExtremes = (slice: { high: number; low: number }[]) => {
        let h = -Infinity;
        let l = Infinity;
        for (const p of slice) {
            if (p.high > h) h = p.high;
            if (p.low < l) l = p.low;
        }
        return (h + l) / 2;
    };

    for (let i = 0; i < data.length; i++) {
        const tenkan = i >= tenkanPeriod - 1 ? getExtremes(data.slice(i - tenkanPeriod + 1, i + 1)) : null;
        const kijun = i >= kijunPeriod - 1 ? getExtremes(data.slice(i - kijunPeriod + 1, i + 1)) : null;
        const senkouB = i >= senkouBPeriod - 1 ? getExtremes(data.slice(i - senkouBPeriod + 1, i + 1)) : null;
        
        let senkouA = null;
        if (tenkan !== null && kijun !== null) {
            senkouA = (tenkan + kijun) / 2;
        }

        let chikou = null;
        if (i + displacement < data.length) {
            chikou = data[i + displacement].close;
        }

        result.push({
            time: data[i].time,
            tenkan,
            kijun,
            senkouA, 
            senkouB,
            chikou
        });
    }

    return result;
};

// --- Adaptive Trend Finder (Log) ---
export interface TrendFinderDataPoint {
    time: string | number;
    value: number; // Midline value
    upper: number;
    lower: number;
}

export interface TrendFinderResult {
    period: number;
    stdDev: number;
    pearsonR: number;
    slope: number;
    intercept: number;
    confidence: string;
    points: TrendFinderDataPoint[];
    trendDirection: 'bullish' | 'bearish' | 'neutral';
    volumeConfirmed: boolean;
    currentVolume: number;
    requiredVolume: number;
}

export const getTrendConfidence = (pearsonR: number): string => {
    const p = Math.abs(pearsonR);
    if (p < 0.2) return 'Extremely Weak';
    if (p < 0.3) return 'Very Weak';
    if (p < 0.4) return 'Weak';
    if (p < 0.5) return 'Mostly Weak';
    if (p < 0.6) return 'Somewhat Weak';
    if (p < 0.7) return 'Moderately Weak';
    if (p < 0.8) return 'Moderate';
    if (p < 0.9) return 'Moderately Strong';
    if (p < 0.92) return 'Mostly Strong';
    if (p < 0.94) return 'Strong';
    if (p < 0.96) return 'Very Strong';
    if (p < 0.98) return 'Exceptionally Strong';
    return 'Ultra Strong';
};

export const calculateAdaptiveTrendFinder = (
    data: { time: any; close: number; volume?: number }[],
    lookback: number = 200,
    devMultiplier: number = 2.0,
    threshold: string = 'Strong',
    enableVolumeFilter: boolean = false,
    volumeMultiplier: number = 1.5
): TrendFinderResult | null => {
    const periods = [lookback];
    
    if (data.length < 2) return null; // Need minimum data

    let bestPeriod = periods[0];
    let bestPearsonR = -1; // We compare absolute values, so start negative
    let bestStdDev = 0;
    let MathLogStr: { [key: number]: number } = {};
    
    // Cache logarithms to speed up calculation
    for (let i = 0; i < data.length; i++) {
        MathLogStr[i] = Math.log(data[i].close);
    }

    let detectedSlope = 0;
    let detectedIntercept = 0;
    let actualPearsonRSigned = 0;

    for (const length of periods) {
        if (data.length < length) continue;
        
        let sumX = 0;
        let sumXX = 0;
        let sumYX = 0;
        let sumY = 0;
        
        // PineScript backward loop logic: i=1 to length, logSource[i-1]
        // This means it takes the last `length` items from the array, in reverse order
        for (let i = 1; i <= length; i++) {
            const idx = data.length - i;
            const lSrc = MathLogStr[idx];
            sumX += i;
            sumXX += i * i;
            sumYX += i * lSrc;
            sumY += lSrc;
        }

        const denominator = (length * sumXX - sumX * sumX);
        const slope = denominator === 0 ? 0 : (length * sumYX - sumX * sumY) / denominator;
        const average = sumY / length;
        const intercept = average - slope * sumX / length + slope;
        
        const period_1 = length - 1;
        const regres = intercept + slope * period_1 * 0.5;
        let sumSlp = intercept;
        
        let sumDxx = 0;
        let sumDyy = 0;
        let sumDyx = 0;
        let sumDev = 0;
        
        for (let i = 0; i <= period_1; i++) {
            const idx = data.length - 1 - i;
            let lSrc = MathLogStr[idx];
            const dxt = lSrc - average;
            const dyt = sumSlp - regres;
            
            lSrc = lSrc - sumSlp;
            sumSlp += slope;
            
            sumDxx += dxt * dxt;
            sumDyy += dyt * dyt;
            sumDyx += dxt * dyt;
            sumDev += lSrc * lSrc;
        }
        
        const unStdDev = Math.sqrt(sumDev / period_1);
        const divisor = sumDxx * sumDyy;
        const pearsonR = divisor === 0 ? 0 : sumDyx / Math.sqrt(divisor);
        
        // Find the highest absolute pearsonR
        if (bestPearsonR === -1 || Math.abs(pearsonR) > Math.abs(bestPearsonR)) {
            bestPearsonR = Math.abs(pearsonR);
            actualPearsonRSigned = pearsonR;
            bestPeriod = length;
            bestStdDev = unStdDev;
            detectedSlope = slope;
            detectedIntercept = intercept;
        }
    }

    if (bestPearsonR === -1 || bestStdDev === 0) return null;

    // Generate the projection points
    const points: TrendFinderDataPoint[] = [];
    const pointsLength = Math.min(bestPeriod, data.length);
    
    // slope > 0 in PineScript means DOWN trend over time since index 0 is latest and i grows backwards
    // So if slope is positive, older bars had higher log prices, so trend is DOWN
    
    for (let i = 0; i < pointsLength; i++) {
        const idx = data.length - 1 - i;
        // Pine formula: line at idx i is `intercept + slope * i`
        const midLog = detectedIntercept + detectedSlope * i;
        const midVal = Math.exp(midLog);
        
        const upperVal = midVal * Math.exp(devMultiplier * bestStdDev);
        const lowerVal = midVal / Math.exp(devMultiplier * bestStdDev);
        
        points.push({
            time: data[idx].time,
            value: midVal,
            upper: upperVal,
            lower: lowerVal
        });
    }
    
    // We generated points from latest (index 0) to oldest. Reverse to match data order.
    points.reverse();

    // --- VOLUME CONFIRMATION LOGIC ---
    let volumeConfirmed = true;
    let currentVol = 0;
    let avgVol = 0;

    if (data.length >= 1) {
        currentVol = data[data.length - 1].volume || 0;
    }

    if (enableVolumeFilter && data.length >= 2) {
        // Calculate average volume over the lookback period
        const volSamples = data.slice(-bestPeriod);
        avgVol = volSamples.reduce((sum, p) => sum + (p.volume || 0), 0) / bestPeriod;
        volumeConfirmed = currentVol >= (avgVol * volumeMultiplier);
    }

    return {
        period: bestPeriod,
        stdDev: bestStdDev,
        pearsonR: actualPearsonRSigned,
        slope: detectedSlope,
        intercept: detectedIntercept,
        confidence: getTrendConfidence(bestPearsonR),
        points,
        trendDirection: detectedSlope > 0 ? 'bearish' : detectedSlope < 0 ? 'bullish' : 'neutral',
        volumeConfirmed,
        currentVolume: currentVol,
        requiredVolume: avgVol * (volumeMultiplier || 1.5)
    };
};

// --- UT Bot Alerts ---
export interface UTBotDataPoint {
    time: string | number;
    trailingStop: number;
    direction: 1 | -1 | 0;
    isBuy: boolean;
    isSell: boolean;
    color: 'green' | 'red' | 'blue';
}

/**
 * Calculates UT Bot Alerts exactly matching Pine Script logic.
 * Uses RMA (Rolling Moving Average) for ATR to match TradingView's default `atr()`.
 */
export const calculateUTBotAlerts = (
    data: { time: any; open: number; high: number; low: number; close: number }[],
    a: number = 1,
    c: number = 10,
    h: boolean = false
): UTBotDataPoint[] => {
    const result: UTBotDataPoint[] = [];
    if (data.length <= c) return result;

    // Calculate True Range and RMA (TradingView ATR)
    const trs: number[] = [0]; 
    for (let i = 1; i < data.length; i++) {
        const h_val = data[i].high;
        const l_val = data[i].low;
        const pc = data[i - 1].close;
        const tr = Math.max(h_val - l_val, Math.abs(h_val - pc), Math.abs(l_val - pc));
        trs.push(tr);
    }

    const atrs: number[] = new Array(data.length).fill(0);
    let trSum = 0;
    for (let i = 1; i <= c; i++) {
        trSum += trs[i];
    }
    atrs[c] = trSum / c;

    const alpha = 1 / c;
    for (let i = c + 1; i < data.length; i++) {
        atrs[i] = alpha * trs[i] + (1 - alpha) * atrs[i - 1];
    }

    // Heikin Ashi Calculation
    const haCloses: number[] = new Array(data.length).fill(0);
    let prevHaOpen = data[0].open;
    let prevHaClose = (data[0].open + data[0].high + data[0].low + data[0].close) / 4;
    haCloses[0] = prevHaClose;

    for (let i = 1; i < data.length; i++) {
        const haClose = (data[i].open + data[i].high + data[i].low + data[i].close) / 4;
        const haOpen = (prevHaOpen + prevHaClose) / 2;
        haCloses[i] = haClose;
        
        prevHaOpen = haOpen;
        prevHaClose = haClose;
    }

    let xATRTrailingStop = 0.0;
    let pos = 0;
    
    for (let i = 1; i < data.length; i++) {
        const src = h ? haCloses[i] : data[i].close;
        const src1 = h ? haCloses[i - 1] : data[i - 1].close;
        const nLoss = a * atrs[i];
        
        let newXATRTrailingStop = xATRTrailingStop;
        
        if (src > xATRTrailingStop && src1 > xATRTrailingStop) {
            newXATRTrailingStop = Math.max(xATRTrailingStop, src - nLoss);
        } else if (src < xATRTrailingStop && src1 < xATRTrailingStop) {
            newXATRTrailingStop = Math.min(xATRTrailingStop, src + nLoss);
        } else if (src > xATRTrailingStop) {
            newXATRTrailingStop = src - nLoss;
        } else {
            newXATRTrailingStop = src + nLoss;
        }

        let newPos = pos;
        if (src1 < xATRTrailingStop && src > xATRTrailingStop) {
            newPos = 1;
        } else if (src1 > xATRTrailingStop && src < xATRTrailingStop) {
            newPos = -1;
        }
        
        // Crossovers logic from PineScript:
        // ema = ema(src, 1) -> Which is just `src`
        // above = crossover(ema, xATRTrailingStop)
        const above = src > newXATRTrailingStop && src1 <= xATRTrailingStop;
        const below = src < newXATRTrailingStop && src1 >= xATRTrailingStop;
        
        const buy = src > newXATRTrailingStop && above;
        const sell = src < newXATRTrailingStop && below;
        const barbuy = src > newXATRTrailingStop;
        const barsell = src < newXATRTrailingStop;
        
        if (i >= c) {
            result.push({
                time: data[i].time,
                trailingStop: newXATRTrailingStop,
                direction: newPos as 1 | -1 | 0,
                isBuy: buy,
                isSell: sell,
                color: barbuy ? 'green' : barsell ? 'red' : 'blue'
            });
        }
        
        xATRTrailingStop = newXATRTrailingStop;
        pos = newPos;
    }

    return result;
};
// --- Session Indicators ---

export interface SessionData {
    time: number;
    isSession: boolean;
    high: number;
    low: number;
    avg: number;
    vwap: number;
    linReg: { y1: number; y2: number; stdev: number; r2: number } | null;
    startIdx: number;
}

/**
 * Checks if a time falls within a session string (e.g. "1300-2200")
 * @param timestamp Unix timestamp (can be seconds or ms)
 * @param sessionStr Session string in "HHMM-HHMM" format
 * @param timezoneOffset Minutes offset from UTC (e.g. +330 for IST)
 */
export const isTimeInSession = (timestamp: number, sessionStr: string, timezoneOffset: number = 0): boolean => {
    // Normalize to ms
    const ms = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
    const date = new Date(ms + timezoneOffset * 60 * 1000);
    const hours = date.getUTCHours();
    const minutes = date.getUTCMinutes();
    const timeNum = hours * 100 + minutes;

    const [start, end] = sessionStr.split('-').map(s => parseInt(s));
    
    if (start < end) {
        return timeNum >= start && timeNum < end;
    } else {
        // Overnights (e.g. "2200-0500")
        return timeNum >= start || timeNum < end;
    }
};

/**
 * Calculates Sessions metrics (Min/Max, Mean, VWAP, LinReg) per bar
 */
export const calculateSessions = (
    data: { time: any; open: number; high: number; low: number; close: number; volume: number }[],
    sessionStr: string,
    timezoneOffset: number = 0
): SessionData[] => {
    const result: SessionData[] = [];
    
    let currentHigh = -Infinity;
    let currentLow = Infinity;
    let sumClose = 0;
    let count = 0;
    let sumPV = 0;
    let sumV = 0;
    
    // For LinReg
    let sumX = 0;
    let sumXX = 0;
    let sumYX = 0;
    let sumY = 0;
    let sumY2 = 0;
    let cwma = 0;

    let inSession = false;
    let sessionStartIdx = -1;

    for (let i = 0; i < data.length; i++) {
        const bar = data[i];
        const timeMs = (typeof bar.time === 'number' && bar.time < 10000000000) ? bar.time * 1000 : bar.time;
        const nowInSession = isTimeInSession(timeMs, sessionStr, timezoneOffset);
        
        // Reset on session start
        if (nowInSession && !inSession) {
            currentHigh = bar.high;
            currentLow = bar.low;
            sumClose = bar.close;
            count = 1;
            sumPV = bar.close * bar.volume;
            sumV = bar.volume;
            sessionStartIdx = i;
            
            // LinReg reset
            sumX = 1;
            sumXX = 1;
            sumYX = bar.close;
            sumY = bar.close;
            sumY2 = bar.close * bar.close;
            cwma = bar.close;
            
        } else if (nowInSession && inSession) {
            currentHigh = Math.max(currentHigh, bar.high);
            currentLow = Math.min(currentLow, bar.low);
            sumClose += bar.close;
            count += 1;
            sumPV += bar.close * bar.volume;
            sumV += bar.volume;
            
            // LinReg update
            sumX += count;
            sumXX += count * count;
            sumYX += bar.close * count;
            sumY += bar.close;
            sumY2 += bar.close * bar.close;
            cwma += bar.close * count;
        }

        inSession = nowInSession;
        
        let linReg = null;
        if (nowInSession && count >= 2) {
            const denominator = (count * sumXX - sumX * sumX);
            const slope = denominator === 0 ? 0 : (count * sumYX - sumX * sumY) / denominator;
            const average = sumY / count;
            // Intercept at bar 1 of session (from Pine: 4*sma - 3*wma)
            
            const wma = cwma / (count * (count + 1) / 2);
            const sma = average;
            
            const cov = (wma - sma) * (count + 1) / 2;
            const variance = (sumY2 / count) - (sma * sma);
            const stdev = Math.sqrt(Math.max(0, variance));
            
            // Pearson R logic from Pine
            const r = stdev === 0 ? 0 : cov / (stdev * (Math.sqrt(count * count - 1) / (2 * Math.sqrt(3))));
            
            linReg = {
                y1: 4 * sma - 3 * wma, // Start price of LR line
                y2: 3 * wma - 2 * sma, // End price of LR line (at current bar)
                stdev,
                r2: r // This is R in Pine calculation but often used as trend strength
            };
        }

        result.push({
            time: bar.time,
            isSession: nowInSession,
            high: nowInSession ? currentHigh : 0,
            low: nowInSession ? currentLow : 0,
            avg: nowInSession ? sumClose / count : 0,
            vwap: (nowInSession && sumV > 0) ? sumPV / sumV : 0,
            linReg,
            startIdx: sessionStartIdx
        });
    }

    return result;
};

// --- MACD ---
export interface MACDDataPoint {
    time: string | number;
    macd: number;
    signal: number;
    histogram: number;
}

export const calculateMACD = (
    data: { time: any; close: number }[],
    fastPeriod: number = 12,
    slowPeriod: number = 26,
    signalPeriod: number = 9
): MACDDataPoint[] => {
    const result: MACDDataPoint[] = [];
    if (data.length < slowPeriod) return result;

    const fastEMA = calculateEMA(data, fastPeriod);
    const slowEMA = calculateEMA(data, slowPeriod);

    const macdLineData: { time: any; close: number }[] = [];
    for (let i = slowPeriod - 1; i < data.length; i++) {
        const time = data[i].time;
        const currentFast = fastEMA.find(e => e.time === time)?.value || 0;
        const currentSlow = slowEMA.find(e => e.time === time)?.value || 0;
        macdLineData.push({ time, close: currentFast - currentSlow });
    }

    const signalEMA = calculateEMA(macdLineData, signalPeriod);

    for (let i = 0; i < macdLineData.length; i++) {
        const time = macdLineData[i].time;
        const macdValue = macdLineData[i].close;
        const signalValue = signalEMA.find(e => e.time === time)?.value || 0;
        
        result.push({
            time,
            macd: macdValue,
            signal: signalValue,
            histogram: macdValue - signalValue
        });
    }

    return result;
};

// --- Supertrend [Custom Port] ---
/**
 * Calculates Supertrend exactly matching Pine Script logic.
 * @param data OHLCV data
 * @param period ATR period
 * @param multiplier ATR multiplier
 * @param changeATR If true, use standard ATR (RMA). If false, use SMA of TR.
 */
export const calculateSupertrend = (
    data: { time: any; high: number; low: number; close: number }[],
    period: number = 10,
    multiplier: number = 3.0,
    changeATR: boolean = true
): SupertrendDataPoint[] => {
    const result: SupertrendDataPoint[] = [];
    if (data.length <= period) return result;

    const hl2 = data.map(d => (d.high + d.low) / 2);
    
    // 1. Calculate True Range
    const trs: number[] = [0];
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const pc = data[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }

    // 2. Calculate ATR
    const atrs: number[] = new Array(data.length).fill(0);
    if (changeATR) {
        // Pine's atr(period) is RMA (Relative Moving Average)
        let trSum = 0;
        for (let i = 1; i <= period; i++) trSum += trs[i];
        atrs[period] = trSum / period;
        const alpha = 1 / period;
        for (let i = period + 1; i < data.length; i++) {
            atrs[i] = alpha * trs[i] + (1 - alpha) * atrs[i - 1];
        }
    } else {
        // SMA of TR
        for (let i = period; i < data.length; i++) {
            let sum = 0;
            for (let j = 0; j < period; j++) sum += trs[i - j];
            atrs[i] = sum / period;
        }
    }

    // 3. Supertrend Logic
    let prevUp = 0;
    let prevDn = 0;
    let trend = 1; // 1 for Up, -1 for Down
    let prevTrend = 1;

    for (let i = 0; i < data.length; i++) {
        if (i < period) {
            result.push({ 
                time: data[i].time, 
                value: 0, 
                trend: 1, 
                isBuy: false, 
                isSell: false,
                upLine: null,
                dnLine: null
            });
            continue;
        }

        const src = hl2[i];
        const atr = atrs[i];
        
        // Initial Up/Dn levels
        let up = src - multiplier * atr;
        let dn = src + multiplier * atr;
        
        const prevClose = data[i - 1].close;

        // Pine Logic:
        // up := close[1] > up1 ? max(up, up1) : up
        // dn := close[1] < dn1 ? min(dn, dn1) : dn
        up = i > period ? (prevClose > prevUp ? Math.max(up, prevUp) : up) : up;
        dn = i > period ? (prevClose < prevDn ? Math.min(dn, prevDn) : dn) : dn;

        // Trend calculation:
        // trend := trend == -1 and close > dn1 ? 1 : trend == 1 and close < up1 ? -1 : trend
        let currentTrend = prevTrend;
        if (prevTrend === -1 && data[i].close > prevDn) {
            currentTrend = 1;
        } else if (prevTrend === 1 && data[i].close < prevUp) {
            currentTrend = -1;
        }

        const isBuy = currentTrend === 1 && prevTrend === -1;
        const isSell = currentTrend === -1 && prevTrend === 1;

        result.push({
            time: data[i].time,
            value: currentTrend === 1 ? up : dn,
            trend: currentTrend as 1 | -1,
            isBuy,
            isSell,
            upLine: currentTrend === 1 ? up : null,
            dnLine: currentTrend === -1 ? dn : null
        });

        prevUp = up;
        prevDn = dn;
        prevTrend = currentTrend;
    }

    return result;
};

// --- Squeeze Breakout ---
export interface SqueezeDataPoint {
    time: string | number;
    squeezeOn: boolean;
    squeezeOff: boolean;
}

export const calculateSqueeze = (
    data: { time: any; high: number; low: number; close: number }[],
    length: number = 20,
    bbMult: number = 2.0,
    kcMult: number = 1.5
): SqueezeDataPoint[] => {
    const result: SqueezeDataPoint[] = [];
    if (data.length < length) return result;

    const bbData = calculateBollingerBands(data, length, bbMult);
    const smaData = calculateSMA(data, length);
    
    // Fast TR array
    const trs: number[] = [0];
    for (let i = 1; i < data.length; i++) {
        const h = data[i].high;
        const l = data[i].low;
        const pc = data[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    
    for (let i = length - 1; i < data.length; i++) {
        let sum = 0;
        for (let j = 0; j < length; j++) {
            sum += trs[i - j];
        }
        const range = sum / length;
        
        const time = data[i].time;
        const bb = bbData.find(b => b.time === time);
        const sma = smaData.find(s => s.time === time)?.value || 0;
        
        if (!bb || !sma) continue;

        const kcUpper = sma + (kcMult * range);
        const kcLower = sma - (kcMult * range);

        const squeezeOn = (bb.upper < kcUpper) && (bb.lower > kcLower);
        
        result.push({
            time,
            squeezeOn,
            squeezeOff: !squeezeOn
        });
    }

    return result;
};

// On-Balance Volume (OBV)
export const calculateOBV = (data: { time: any; close: number; volume: number }[]): IndicatorDataPoint[] => {
    const result: IndicatorDataPoint[] = [];
    if (data.length === 0) return result;

    let obv = 0;
    result.push({ time: data[0].time, value: obv });

    for (let i = 1; i < data.length; i++) {
        const prevClose = data[i - 1].close;
        const currentClose = data[i].close;
        const currentVolume = data[i].volume || 0;

        if (currentClose > prevClose) {
            obv += currentVolume;
        } else if (currentClose < prevClose) {
            obv -= currentVolume;
        }
        
        result.push({ time: data[i].time, value: obv });
    }
    return result;
};

// Stochastic RSI
export const calculateStochRSI = (data: { time: any; close: number }[], rsiPeriod: number, stochPeriod: number, kPeriod: number): { time: any; k: number }[] => {
    const result: { time: any; k: number }[] = [];
    const rsiData = calculateRSI(data, rsiPeriod);
    if (rsiData.length < stochPeriod) return result;

    const stochRSI: { time: any; stoch: number }[] = [];
    for (let i = stochPeriod - 1; i < rsiData.length; i++) {
        const window = rsiData.slice(i - stochPeriod + 1, i + 1).map(r => r.value);
        const highestRSI = Math.max(...window);
        const lowestRSI = Math.min(...window);
        
        let stoch = 0;
        if (highestRSI !== lowestRSI) {
            stoch = 100 * ((rsiData[i].value - lowestRSI) / (highestRSI - lowestRSI));
        }
        stochRSI.push({ time: rsiData[i].time, stoch });
    }

    // Smooth %K
    for (let i = kPeriod - 1; i < stochRSI.length; i++) {
        let sum = 0;
        for (let j = 0; j < kPeriod; j++) {
            sum += stochRSI[i - j].stoch;
        }
        result.push({ time: stochRSI[i].time, k: sum / kPeriod });
    }

    return result;
};

// ADX (Average Directional Index)
export const calculateADX = (data: { time: any; high: number; low: number; close: number }[], period: number): { time: any; adx: number; diPlus: number; diMinus: number }[] => {
    const result: { time: any; adx: number; diPlus: number; diMinus: number }[] = [];
    if (data.length < period + 1) return result;

    const tr: number[] = [];
    const plusDM: number[] = [];
    const minusDM: number[] = [];

    for (let i = 1; i < data.length; i++) {
        const high = data[i].high;
        const low = data[i].low;
        const prevHigh = data[i - 1].high;
        const prevLow = data[i - 1].low;
        const prevClose = data[i - 1].close;

        // True Range
        const tr1 = high - low;
        const tr2 = Math.abs(high - prevClose);
        const tr3 = Math.abs(low - prevClose);
        tr.push(Math.max(tr1, tr2, tr3));

        // Directional Movement
        const upMove = high - prevHigh;
        const downMove = prevLow - low;

        let pDM = 0;
        let mDM = 0;

        if (upMove > downMove && upMove > 0) pDM = upMove;
        if (downMove > upMove && downMove > 0) mDM = downMove;

        plusDM.push(pDM);
        minusDM.push(mDM);
    }

    // Wilder's Smoothing
    const smooth = (arr: number[], period: number) => {
        const smoothed = [];
        let currSum = arr.slice(0, period).reduce((a, b) => a + b, 0);
        smoothed.push(currSum);

        for (let i = period; i < arr.length; i++) {
            currSum = currSum - (currSum / period) + arr[i];
            smoothed.push(currSum);
        }
        return smoothed;
    };

    const str = smooth(tr, period);
    const spDM = smooth(plusDM, period);
    const smDM = smooth(minusDM, period);

    const dx: number[] = [];
    for (let i = 0; i < str.length; i++) {
        let diPlus = 0, diMinus = 0;
        if (str[i] > 0) {
            diPlus = 100 * (spDM[i] / str[i]);
            diMinus = 100 * (smDM[i] / str[i]);
        }
        let dxVal = 0;
        if (diPlus + diMinus > 0) {
            dxVal = 100 * (Math.abs(diPlus - diMinus) / (diPlus + diMinus));
        }
        dx.push(dxVal);
    }
    
    // Simpler ADX formulation for dashboard speed matching Wilder's logic
    let currAdx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
    
    for (let i = period - 1; i < dx.length; i++) {
        if (i > period - 1) {
            currAdx = ((currAdx * (period - 1)) + dx[i]) / period;
        }
        const dataIndex = i + 1; // offset by 1 because TR starts at index 1
        
        let diPlus = 0, diMinus = 0;
        if (str[i] > 0) {
            diPlus = 100 * (spDM[i] / str[i]);
            diMinus = 100 * (smDM[i] / str[i]);
        }
        
        result.push({
            time: data[dataIndex].time,
            adx: currAdx,
            diPlus,
            diMinus
        });
    }

    return result;
};

// Calculate Pivots (Structure)
export const calculateStructure = (data: { high: number; low: number }[], lookback: number = 5): { isBullStruct: boolean; isBearStruct: boolean } => {
    if (data.length < lookback * 2 + 1) return { isBullStruct: false, isBearStruct: false };

    let lastPh = 0, prevPh = 0;
    let lastPl = Infinity, prevPl = Infinity;

    for (let i = lookback; i < data.length - lookback; i++) {
        const h = data[i].high;
        const l = data[i].low;
        
        let isPh = true;
        let isPl = true;
        
        for (let j = 1; j <= lookback; j++) {
            if (data[i - j].high >= h || data[i + j].high > h) isPh = false;
            if (data[i - j].low <= l || data[i + j].low < l) isPl = false;
        }

        if (isPh) {
            prevPh = lastPh;
            lastPh = h;
        }
        if (isPl) {
            prevPl = lastPl;
            lastPl = l;
        }
    }

    const isBullStruct = lastPh > prevPh && lastPl > prevPl;
    const isBearStruct = lastPh < prevPh && lastPl < prevPl;

    return { isBullStruct, isBearStruct };
};

// --- Market Structure Break & Order Block (MSB-OB) ---
/**
 * Calculates MSB-OB exactly matching the provided Pine Script.
 */
export const calculateMsbOb = (
    data: { time: any; open: number; high: number; low: number; close: number }[],
    zigzagLen: number = 9,
    fibFactor: number = 0.33,
    deleteBroken: boolean = true
): MsbObResult => {
    const points: MsbObDataPoint[] = [];
    const zones: MsbObZone[] = [];
    if (data.length < zigzagLen * 2) return { points, zones };

    const highPointsArr: { val: number; idx: number }[] = [];
    const lowPointsArr: { val: number; idx: number }[] = [];

    let trend = 1; // 1: Up, -1: Down
    let market = 1; // 1: Bullish, -1: Bearish
    
    // For box searching
    let lastTrendChangeIdx = 0;

    for (let i = 0; i < data.length; i++) {
        const bar = data[i];
        
        // --- ZigZag Logic ---
        let highest = -Infinity;
        let lowest = Infinity;
        for (let j = Math.max(0, i - zigzagLen + 1); j <= i; j++) {
            if (data[j].high > highest) highest = data[j].high;
            if (data[j].low < lowest) lowest = data[j].low;
        }

        const toUp = bar.high >= highest;
        const toDown = bar.low <= lowest;

        const prevTrend = trend;
        if (trend === 1 && toDown) {
            trend = -1;
        } else if (trend === -1 && toUp) {
            trend = 1;
        }

        if (trend !== prevTrend) {
            if (trend === 1) {
                // Low point formed
                let lowestVal = Infinity;
                let lowestIdx = i;
                for (let j = lastTrendChangeIdx; j <= i; j++) {
                    if (data[j].low < lowestVal) {
                        lowestVal = data[j].low;
                        lowestIdx = j;
                    }
                }
                lowPointsArr.push({ val: lowestVal, idx: lowestIdx });
            } else {
                // High point formed
                let highestVal = -Infinity;
                let highestIdx = i;
                for (let j = lastTrendChangeIdx; j <= i; j++) {
                    if (data[j].high > highestVal) {
                        highestVal = data[j].high;
                        highestIdx = j;
                    }
                }
                highPointsArr.push({ val: highestVal, idx: highestIdx });
            }
            lastTrendChangeIdx = i;
        }

        const h0 = highPointsArr.length > 0 ? highPointsArr[highPointsArr.length - 1] : null;
        const h1 = highPointsArr.length > 1 ? highPointsArr[highPointsArr.length - 2] : null;
        const l0 = lowPointsArr.length > 0 ? lowPointsArr[lowPointsArr.length - 1] : null;
        const l1 = lowPointsArr.length > 1 ? lowPointsArr[lowPointsArr.length - 2] : null;

        // --- MSB Logic ---
        let msbType: 'Bullish' | 'Bearish' | null = null;
        let msbPrice: number | null = null;
        let msbAvgIdx: number | null = null;

        if (h0 && h1 && l0 && l1) {
            const prevMarket = market;
            if (market === 1 && l0.val < l1.val && l0.val < l1.val - Math.abs(h0.val - l1.val) * fibFactor) {
                market = -1;
            } else if (market === -1 && h0.val > h1.val && h0.val > h1.val + Math.abs(h1.val - l0.val) * fibFactor) {
                market = 1;
            }

            if (market !== prevMarket) {
                if (market === 1) {
                    msbType = 'Bullish';
                    msbPrice = h1.val;
                    msbAvgIdx = Math.floor((h1.idx + l0.idx) / 2);

                    // Create Bu-OB: Last down candle (open > close) between h1 and l0
                    let buObIdx = -1;
                    for (let j = h1.idx; j <= l0.idx; j++) {
                        if (data[j].open > data[j].close) buObIdx = j;
                    }
                    if (buObIdx !== -1) {
                        zones.push({
                            type: 'Bu-OB',
                            top: data[buObIdx].high,
                            bottom: data[buObIdx].low,
                            startX: buObIdx,
                            endX: i + 10,
                            isBroken: false,
                            id: `bu-ob-${buObIdx}-${i}`
                        });
                    }

                    // Create Bu-BB: Last up candle between l1-zigzagLen and h1
                    let buBbIdx = -1;
                    for (let j = Math.max(0, l1.idx - zigzagLen); j <= h1.idx; j++) {
                        if (data[j].open < data[j].close) buBbIdx = j;
                    }
                    if (buBbIdx !== -1) {
                        zones.push({
                            type: l0.val < l1.val ? 'Bu-BB' : 'Bu-MB',
                            top: data[buBbIdx].high,
                            bottom: data[buBbIdx].low,
                            startX: buBbIdx,
                            endX: i + 10,
                            isBroken: false,
                            id: `bu-bb-${buBbIdx}-${i}`
                        });
                    }
                } else {
                    msbType = 'Bearish';
                    msbPrice = l1.val;
                    msbAvgIdx = Math.floor((l1.idx + h0.idx) / 2);

                    // Create Be-OB: Last up candle (open < close) between l1 and h0
                    let beObIdx = -1;
                    for (let j = l1.idx; j <= h0.idx; j++) {
                        if (data[j].open < data[j].close) beObIdx = j;
                    }
                    if (beObIdx !== -1) {
                        zones.push({
                            type: 'Be-OB',
                            top: data[beObIdx].high,
                            bottom: data[beObIdx].low,
                            startX: beObIdx,
                            endX: i + 10,
                            isBroken: false,
                            id: `be-ob-${beObIdx}-${i}`
                        });
                    }

                    // Create Be-BB: Last down candle between h1-zigzagLen and l1
                    let beBbIdx = -1;
                    for (let j = Math.max(0, h1.idx - zigzagLen); j <= l1.idx; j++) {
                        if (data[j].open > data[j].close) beBbIdx = j;
                    }
                    if (beBbIdx !== -1) {
                        zones.push({
                            type: h0.val > h1.val ? 'Be-BB' : 'Be-MB',
                            top: data[beBbIdx].high,
                            bottom: data[beBbIdx].low,
                            startX: beBbIdx,
                            endX: i + 10,
                            isBroken: false,
                            id: `be-bb-${beBbIdx}-${i}`
                        });
                    }
                }
            }
        }

        // --- Zone Life Extension & Breaking ---
        for (let k = zones.length - 1; k >= 0; k--) {
            const z = zones[k];
            if (z.isBroken) continue;
            
            z.endX = i + 10;
            
            if (z.type.startsWith('Bu')) {
                if (bar.close < z.bottom) z.isBroken = true;
            } else {
                if (bar.close > z.top) z.isBroken = true;
            }
            
            if (deleteBroken && z.isBroken) {
                zones.splice(k, 1);
            }
        }

        points.push({
            time: bar.time,
            high: bar.high,
            low: bar.low,
            isHigh: h0?.idx === i,
            isLow: l0?.idx === i,
            msbType,
            msbPrice,
            msbAvgIdx,
            zigzagPrice: trend === 1 ? l0?.val || null : h0?.val || null
        });
    }

    return { points, zones };
};

// ─────────────────────────────────────────────────────────────────────────────
// Wick Rejection Support / Resistance
// ─────────────────────────────────────────────────────────────────────────────

export interface SRLevel {
    price: number;               // cluster average price (the line)
    type: 'resistance' | 'support';
    touchCount: number;          // how many wick tips landed in this zone
    strength: 'weak' | 'moderate' | 'strong' | 'ultra';
    startTime: any;              // time of first wick touch
    endTime: any;                // time of last wick touch
    zone: { top: number; bottom: number }; // ATR-based zone band
    isBroken: boolean;           // price closed beyond this level after forming
}

export interface WickSRResult {
    levels: SRLevel[];
}

/**
 * Detects strong support/resistance levels by clustering candle wicks.
 *
 * RESISTANCE: upper wicks (highs) that cluster at the same price repeatedly → price was rejected there.
 * SUPPORT:    lower wicks (lows)  that cluster at the same price repeatedly → price bounced from there.
 *
 * @param data          OHLCV candle array (must include high, low, close)
 * @param lookback      How many recent candles to analyze
 * @param minTouches    Minimum wick touches to qualify as a level (default 10)
 * @param atrPeriod     ATR period for dynamic tolerance zone (default 14)
 * @param atrMultiplier ATR multiplier for clustering tolerance (default 0.5)
 */
export const calculateWickRejectionSR = (
    data: { time: any; open: number; high: number; low: number; close: number }[],
    lookback: number = 300,
    minTouches: number = 10,
    atrPeriod: number = 14,
    atrMultiplier: number = 0.5,
): WickSRResult => {
    const result: WickSRResult = { levels: [] };
    if (data.length < atrPeriod + 2) return result;

    // ── Step 1: Use the lookback slice ──────────────────────────────────────
    const slice = data.slice(-Math.min(lookback, data.length));

    // ── Step 2: Calculate ATR over the full slice for tolerance ─────────────
    let atr = 0;
    {
        const trs: number[] = [];
        for (let i = 1; i < slice.length; i++) {
            const h = slice[i].high, l = slice[i].low, pc = slice[i - 1].close;
            trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
        }
        // Use Wilder's RMA
        let rma = trs.slice(0, atrPeriod).reduce((s, v) => s + v, 0) / atrPeriod;
        const alpha = 1 / atrPeriod;
        for (let i = atrPeriod; i < trs.length; i++) {
            rma = alpha * trs[i] + (1 - alpha) * rma;
        }
        atr = rma;
    }
    if (atr <= 0) return result;

    const tolerance = atr * atrMultiplier;

    // ── Step 3: Collect wick tips ────────────────────────────────────────────
    const highWicks: { price: number; time: any }[] = [];
    const lowWicks: { price: number; time: any }[] = [];

    for (const bar of slice) {
        highWicks.push({ price: bar.high, time: bar.time });
        lowWicks.push({ price: bar.low, time: bar.time });
    }

    // ── Step 4: Cluster function ─────────────────────────────────────────────
    type WickPoint = { price: number; time: any };

    const clusterWicks = (wicks: WickPoint[], type: 'resistance' | 'support'): SRLevel[] => {
        // Sort by price to make clustering easier
        const sorted = [...wicks].sort((a, b) => a.price - b.price);
        const clusters: { prices: number[]; times: any[] }[] = [];

        for (const wick of sorted) {
            let placed = false;
            for (const cluster of clusters) {
                const clusterMid = cluster.prices.reduce((s, v) => s + v, 0) / cluster.prices.length;
                if (Math.abs(wick.price - clusterMid) <= tolerance) {
                    cluster.prices.push(wick.price);
                    cluster.times.push(wick.time);
                    placed = true;
                    break;
                }
            }
            if (!placed) {
                clusters.push({ prices: [wick.price], times: [wick.time] });
            }
        }

        // Filter clusters by minTouches
        const levels: SRLevel[] = [];
        for (const cluster of clusters) {
            if (cluster.prices.length < minTouches) continue;

            const avgPrice = cluster.prices.reduce((s, v) => s + v, 0) / cluster.prices.length;
            const touchCount = cluster.prices.length;
            const sortedTimes = [...cluster.times].sort((a, b) => Number(a) - Number(b));
            const startTime = sortedTimes[0];
            const endTime = sortedTimes[sortedTimes.length - 1];

            // Strength classification
            let strength: SRLevel['strength'] = 'weak';
            if (touchCount >= minTouches * 3) strength = 'ultra';
            else if (touchCount >= minTouches * 2) strength = 'strong';
            else if (touchCount >= Math.ceil(minTouches * 1.5)) strength = 'moderate';

            // Break detection: did price close beyond this level after formation?
            const lastBar = slice[slice.length - 1];
            let isBroken = false;
            if (type === 'resistance' && lastBar.close > avgPrice + tolerance) isBroken = true;
            if (type === 'support' && lastBar.close < avgPrice - tolerance) isBroken = true;

            levels.push({
                price: avgPrice,
                type,
                touchCount,
                strength,
                startTime,
                endTime,
                zone: { top: avgPrice + tolerance * 0.5, bottom: avgPrice - tolerance * 0.5 },
                isBroken,
            });
        }

        // Sort by touch count descending (strongest first) then limit to top 10
        return levels.sort((a, b) => b.touchCount - a.touchCount).slice(0, 10);
    };

    // ── Step 5: Deduplicate overlapping resistance vs support ─────────────────
    const resistanceLevels = clusterWicks(highWicks, 'resistance');
    const supportLevels    = clusterWicks(lowWicks,  'support');

    // Merge and remove levels that are within tolerance of each other (keep higher touch count)
    const allLevels = [...resistanceLevels, ...supportLevels].sort((a, b) => b.touchCount - a.touchCount);
    const deduplicated: SRLevel[] = [];

    for (const level of allLevels) {
        const hasDuplicate = deduplicated.some(
            existing => Math.abs(existing.price - level.price) <= tolerance * 1.5
        );
        if (!hasDuplicate) {
            deduplicated.push(level);
        }
    }

    result.levels = deduplicated;
    return result;
};
