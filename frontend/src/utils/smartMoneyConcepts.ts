/**
 * Smart Money Concepts [LuxAlgo] — TypeScript Port
 * Original: © LuxAlgo (Attribution-NonCommercial-ShareAlike 4.0)
 * Ported to TypeScript for CosmoQuantAI by faithfully replicating
 * the Pine Script logic bar-by-bar.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SMCCandle {
    time: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume?: number;
}

export interface SMCL2Wall {
    price: number;
    type: 'buy' | 'sell';
    size?: number;
}

export interface SMCCVDPoint {
    time: number;
    value: number;
}

export interface SMCFootprintTick {
    price: number;
    bid: number;
    ask: number;
    delta: number;
    volume: number;
}

export interface SMCFootprintCandle {
    time: number;
    ticks: SMCFootprintTick[];
}

/** A detected swing/internal pivot point */
export interface SMCPivot {
    currentLevel: number;
    lastLevel: number;
    crossed: boolean;
    barTime: number;
    barIndex: number;
}

/** BOS or CHoCH structure event */
export interface SMCStructureEvent {
    type: 'BOS' | 'CHoCH';
    bias: 'bullish' | 'bearish';
    level: number;
    fromTime: number;
    toTime: number;
    fromIndex: number;
    toIndex: number;
    isInternal: boolean;
    isTrap?: boolean;
}

/** An Order Block zone */
export interface SMCOrderBlock {
    barHigh: number;
    barLow: number;
    barTime: number;
    toTime: number; // extends to last bar
    bias: 'bullish' | 'bearish';
    isInternal: boolean;
    isValidated?: boolean;
}

/** A Fair Value Gap zone */
export interface SMCFairValueGap {
    top: number;
    bottom: number;
    midpoint: number;
    bias: 'bullish' | 'bearish';
    startTime: number;
    endTime: number;
    barIndex: number;
    microImbalances?: number[];
}

/** Equal High or Equal Low */
export interface SMCEqualHL {
    type: 'EQH' | 'EQL';
    level: number;
    fromTime: number;
    fromIndex: number;
    toTime: number;
    toIndex: number;
    isSweep?: boolean;
}

/** Trailing swing extremes for Strong/Weak H/L display */
export interface SMCTrailingExtreme {
    top: number;
    bottom: number;
    lastTopTime: number;
    lastBottomTime: number;
    lastTopIndex: number;
    lastBottomIndex: number;
    barTime: number;
    barIndex: number;
}

/** Premium / Discount / Equilibrium zones */
export interface SMCZones {
    top: number;
    bottom: number;
    equilibrium: number;
    /** Start of the current swing (for zone box left edge) */
    startTime: number;
}

/** A detected candlestick pattern at a swing point */
export interface SMCSwingPattern {
    time: number;
    level: number;
    type: 'bullish' | 'bearish' | 'neutral';
    patternName: string;
}

/** Full result of a single SMC calculation pass */
export interface SMCResult {
    structureEvents: SMCStructureEvent[];
    internalOrderBlocks: SMCOrderBlock[];
    swingOrderBlocks: SMCOrderBlock[];
    fairValueGaps: SMCFairValueGap[];
    equalHighsLows: SMCEqualHL[];
    swingPatterns: SMCSwingPattern[];
    trailingExtreme: SMCTrailingExtreme | null;
    zones: SMCZones | null;
    /** Last swing trend bias */
    swingBias: 'bullish' | 'bearish' | 'neutral';
    /** Last internal trend bias */
    internalBias: 'bullish' | 'bearish' | 'neutral';
}

export interface SMCSettings {
    mode: 'Historical' | 'Present';
    style: 'Colored' | 'Monochrome';
    // Internal Structure
    showInternals: boolean;
    internalBullFilter: 'All' | 'BOS' | 'CHoCH';
    internalBearFilter: 'All' | 'BOS' | 'CHoCH';
    confluenceFilter: boolean;
    // Swing Structure
    showSwing: boolean;
    swingBullFilter: 'All' | 'BOS' | 'CHoCH';
    swingBearFilter: 'All' | 'BOS' | 'CHoCH';
    showSwingPoints: boolean;
    swingLength: number;
    showStrongWeakHL: boolean;
    // Order Blocks
    showInternalOB: boolean;
    internalOBCount: number;
    showSwingOB: boolean;
    swingOBCount: number;
    obFilter: 'Atr' | 'CumMeanRange';
    obMitigation: 'Close' | 'High/Low';
    // Equal Highs/Lows
    showEqualHL: boolean;
    equalHLLength: number;
    equalHLThreshold: number;
    // Fair Value Gaps
    showFVG: boolean;
    fvgAutoThreshold: boolean;
    fvgExtendBars: number;
    // Premium / Discount Zones
    showPDZones: boolean;
    
    // Order Flow / Secret Features
    smcL2Validation?: boolean;
    smcCVDTrap?: boolean;
    smcMicroFVG?: boolean;
    smcSweepDetection?: boolean;
    smcShowSwingPatterns?: boolean;
}

export const DEFAULT_SMC_SETTINGS: SMCSettings = {
    mode: 'Historical',
    style: 'Colored',
    showInternals: true,
    internalBullFilter: 'All',
    internalBearFilter: 'All',
    confluenceFilter: false,
    showSwing: true,
    swingBullFilter: 'All',
    swingBearFilter: 'All',
    showSwingPoints: false,
    swingLength: 50,
    showStrongWeakHL: true,
    showInternalOB: true,
    internalOBCount: 5,
    showSwingOB: false,
    swingOBCount: 5,
    obFilter: 'Atr',
    obMitigation: 'High/Low',
    showEqualHL: true,
    equalHLLength: 3,
    equalHLThreshold: 0.1,
    showFVG: false,
    fvgAutoThreshold: true,
    fvgExtendBars: 1,
    showPDZones: false,
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Wilder RMA (same as Pine's ta.atr internally uses) */
function rma(values: number[], period: number): number[] {
    const result: number[] = new Array(values.length).fill(0);
    let sum = 0;
    for (let i = 0; i < period; i++) sum += values[i];
    result[period - 1] = sum / period;
    const alpha = 1 / period;
    for (let i = period; i < values.length; i++) {
        result[i] = alpha * values[i] + (1 - alpha) * result[i - 1];
    }
    return result;
}

/** ATR using Wilder's RMA (Pine's default) */
function calculateATR(candles: SMCCandle[], period: number = 200): number[] {
    const trs: number[] = [0];
    for (let i = 1; i < candles.length; i++) {
        const h = candles[i].high;
        const l = candles[i].low;
        const pc = candles[i - 1].close;
        trs.push(Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc)));
    }
    const atrArr = rma(trs, period);
    return atrArr;
}

/** 
 * Get the current "leg" value at candle index `i` using `size` lookback.
 * Returns 1 (BULLISH_LEG) or 0 (BEARISH_LEG).
 * Mirrors Pine's `leg(size)` function.
 */
function getLeg(candles: SMCCandle[], i: number, size: number): 0 | 1 {
    if (i < size) return 0;
    const high_i = candles[i - size].high;
    const low_i = candles[i - size].low;

    // Is high[size] greater than highest(size) looking forward from i-size?
    let highest = -Infinity;
    let lowest = Infinity;
    for (let j = i - size + 1; j <= i; j++) {
        if (candles[j].high > highest) highest = candles[j].high;
        if (candles[j].low < lowest) lowest = candles[j].low;
    }

    const newLegHigh = high_i > highest; // high[size] > ta.highest(size) in pine (looks at current bar forward, size bars)
    const newLegLow = low_i < lowest;

    if (newLegHigh) return 0; // BEARISH_LEG
    if (newLegLow) return 1;  // BULLISH_LEG
    return 0;
}

// ─── Main SMC Calculation ─────────────────────────────────────────────────────

/** Detects reversal candlestick pattern at index i */
function detectCandlePattern(candles: SMCCandle[], i: number): { type: 'bullish' | 'bearish' | 'neutral', name: string } | null {
    if (i < 2 || i >= candles.length) return null;
    
    const c0 = candles[i];
    const c1 = candles[i - 1];
    const c2 = candles[i - 2];

    const body0 = Math.abs(c0.close - c0.open);
    const range0 = c0.high - c0.low;
    
    const isBull0 = c0.close > c0.open;
    const isBear0 = c0.close < c0.open;
    const isBull1 = c1.close > c1.open;
    const isBear1 = c1.close < c1.open;

    // Doji
    if (body0 <= range0 * 0.25) return { type: 'neutral', name: 'Doji' };

    // Engulfing
    if (isBull0 && isBear1 && c0.close > c1.close && c0.open < c1.open) return { type: 'bullish', name: 'Engulfing' };
    if (isBear0 && isBull1 && c0.close < c1.close && c0.open > c1.open) return { type: 'bearish', name: 'Engulfing' };

    // Pin Bar / Hammer / Shooting Star
    const upperWick = c0.high - Math.max(c0.open, c0.close);
    const lowerWick = Math.min(c0.open, c0.close) - c0.low;
    if (lowerWick > body0 * 1.5 && upperWick < body0 * 1.5) return { type: 'bullish', name: 'Hammer' };
    if (upperWick > body0 * 1.5 && lowerWick < body0 * 1.5) return { type: 'bearish', name: 'Shooting Star' };

    // Harami (Inside Bar)
    if (isBull0 && isBear1 && c0.close < c1.open && c0.open > c1.close) return { type: 'bullish', name: 'Harami' };
    if (isBear0 && isBull1 && c0.close > c1.open && c0.open < c1.close) return { type: 'bearish', name: 'Harami' };

    // Morning/Evening Star (3-bar)
    const isBull2 = c2.close > c2.open;
    const isBear2 = c2.close < c2.open;
    if (isBull0 && isBear2 && Math.abs(c1.close - c1.open) < (c2.high - c2.low) * 0.3 && c0.close > c2.open - (c2.open - c2.close) * 0.5) {
        return { type: 'bullish', name: 'Morning Star' };
    }
    if (isBear0 && isBull2 && Math.abs(c1.close - c1.open) < (c2.high - c2.low) * 0.3 && c0.close < c2.open + (c2.close - c2.open) * 0.5) {
        return { type: 'bearish', name: 'Evening Star' };
    }

    return null;
}

/**
 * Main entry point — calculates all SMC data from OHLCV candles.
 * This is a faithful port of the LuxAlgo Pine Script logic.
 */
export function calculateSMC(
    candles: SMCCandle[], 
    settings: SMCSettings,
    walls?: SMCL2Wall[],
    cvdData?: SMCCVDPoint[],
    footprintData?: SMCFootprintCandle[],
    currentPrice?: number
): SMCResult {
    if (candles.length < 10) {
        return {
            structureEvents: [],
            internalOrderBlocks: [],
            swingOrderBlocks: [],
            fairValueGaps: [],
            equalHighsLows: [],
            swingPatterns: [],
            trailingExtreme: null,
            zones: null,
            swingBias: 'neutral',
            internalBias: 'neutral',
        };
    }

    const n = candles.length;
    const ATR_PERIOD = 200;
    const atrArr = calculateATR(candles, ATR_PERIOD);

    // Cumulative mean range (alternative to ATR for OB filtering)
    let cumTR = 0;
    const cumMeanRange: number[] = new Array(n).fill(0);
    for (let i = 1; i < n; i++) {
        const tr = Math.max(
            candles[i].high - candles[i].low,
            Math.abs(candles[i].high - candles[i - 1].close),
            Math.abs(candles[i].low - candles[i - 1].close)
        );
        cumTR += tr;
        cumMeanRange[i] = cumTR / i;
    }

    // Volatility measure per bar
    const volatility: number[] = candles.map((c, i) =>
        settings.obFilter === 'Atr' ? (atrArr[i] || atrArr[ATR_PERIOD] || 0) : cumMeanRange[i]
    );

    // "parsed" highs/lows (high-vol bars get swapped)
    const parsedHighs: number[] = candles.map((c, i) => {
        const isHighVol = (c.high - c.low) >= 2 * (volatility[i] || 1e-8);
        return isHighVol ? c.low : c.high;
    });
    const parsedLows: number[] = candles.map((c, i) => {
        const isHighVol = (c.high - c.low) >= 2 * (volatility[i] || 1e-8);
        return isHighVol ? c.high : c.low;
    });

    // ── State machines ─────────────────────────────────────
    const initPivot = (): SMCPivot => ({
        currentLevel: NaN,
        lastLevel: NaN,
        crossed: false,
        barTime: 0,
        barIndex: 0,
    });

    let swingHigh = initPivot();
    let swingLow = initPivot();
    let internalHigh = initPivot();
    let internalLow = initPivot();
    let equalHigh = initPivot();
    let equalLow = initPivot();
    let swingBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';
    let internalBias: 'bullish' | 'bearish' | 'neutral' = 'neutral';

    let trailing: SMCTrailingExtreme = {
        top: -Infinity,
        bottom: Infinity,
        lastTopTime: candles[0].time,
        lastBottomTime: candles[0].time,
        lastTopIndex: 0,
        lastBottomIndex: 0,
        barTime: candles[0].time,
        barIndex: 0,
    };

    // Output arrays
    const structureEvents: SMCStructureEvent[] = [];
    const internalOrderBlocks: SMCOrderBlock[] = [];
    const swingOrderBlocks: SMCOrderBlock[] = [];
    const fairValueGaps: SMCFairValueGap[] = [];
    const equalHighsLows: SMCEqualHL[] = [];
    const swingPatterns: SMCSwingPattern[] = [];

    // For tracking legs (need previous leg to detect change)
    let prevSwingLeg: 0 | 1 = 0;
    let prevInternalLeg: 0 | 1 = 0;
    let prevEqualLeg: 0 | 1 = 0;

    // Helper: process pivot detection for a given size
    const processLeg = (
        i: number,
        size: number,
        isInternal: boolean,
        isEqualHL: boolean,
    ) => {
        const currentLeg = getLeg(candles, i, size);

        let legChanged = false;
        let pivotLow = false;
        let pivotHigh_ = false;

        if (isInternal) {
            if (currentLeg !== prevInternalLeg) {
                legChanged = true;
                pivotLow = currentLeg === 1; // transition to bullish leg = new low pivot was found
                pivotHigh_ = currentLeg === 0;
                prevInternalLeg = currentLeg;
            }
        } else if (isEqualHL) {
            if (currentLeg !== prevEqualLeg) {
                legChanged = true;
                pivotLow = currentLeg === 1;
                pivotHigh_ = currentLeg === 0;
                prevEqualLeg = currentLeg;
            }
        } else {
            if (currentLeg !== prevSwingLeg) {
                legChanged = true;
                pivotLow = currentLeg === 1;
                pivotHigh_ = currentLeg === 0;
                prevSwingLeg = currentLeg;
            }
        }

        if (!legChanged) return;

        const atr = atrArr[i] || 0;

        if (pivotLow) {
            const pivotRef = isEqualHL ? equalLow : isInternal ? internalLow : swingLow;
            const pivotLevel = candles[i - size]?.low ?? NaN;

            // Check for equal lows
            if (isEqualHL && !isNaN(pivotRef.currentLevel) && Math.abs(pivotRef.currentLevel - pivotLevel) < settings.equalHLThreshold * atr) {
                equalHighsLows.push({
                    type: 'EQL',
                    level: pivotLevel,
                    fromTime: pivotRef.barTime,
                    fromIndex: pivotRef.barIndex,
                    toTime: candles[i - size]?.time ?? 0,
                    toIndex: i - size,
                });
            }

            pivotRef.lastLevel = pivotRef.currentLevel;
            pivotRef.currentLevel = pivotLevel;
            pivotRef.crossed = false;
            pivotRef.barTime = candles[i - size]?.time ?? 0;
            pivotRef.barIndex = i - size;

            if (!isEqualHL && !isInternal) {
                trailing.bottom = Math.min(trailing.bottom, pivotLevel);
                trailing.lastBottomTime = pivotLevel <= trailing.bottom ? candles[i - size].time : trailing.lastBottomTime;
                trailing.lastBottomIndex = pivotLevel <= trailing.bottom ? i - size : trailing.lastBottomIndex;
                trailing.barTime = candles[i - size]?.time ?? 0;
                trailing.barIndex = i - size;
            }
        } else if (pivotHigh_) {
            const pivotRef = isEqualHL ? equalHigh : isInternal ? internalHigh : swingHigh;
            const pivotLevel = candles[i - size]?.high ?? NaN;

            // Check for equal highs
            if (isEqualHL && !isNaN(pivotRef.currentLevel) && Math.abs(pivotRef.currentLevel - pivotLevel) < settings.equalHLThreshold * atr) {
                equalHighsLows.push({
                    type: 'EQH',
                    level: pivotLevel,
                    fromTime: pivotRef.barTime,
                    fromIndex: pivotRef.barIndex,
                    toTime: candles[i - size]?.time ?? 0,
                    toIndex: i - size,
                });
            }

            pivotRef.lastLevel = pivotRef.currentLevel;
            pivotRef.currentLevel = pivotLevel;
            pivotRef.crossed = false;
            pivotRef.barTime = candles[i - size]?.time ?? 0;
            pivotRef.barIndex = i - size;

            if (!isEqualHL && !isInternal) {
                trailing.top = Math.max(trailing.top, pivotLevel);
                trailing.lastTopTime = pivotLevel >= trailing.top ? candles[i - size].time : trailing.lastTopTime;
                trailing.lastTopIndex = pivotLevel >= trailing.top ? i - size : trailing.lastTopIndex;
                trailing.barTime = candles[i - size]?.time ?? 0;
                trailing.barIndex = i - size;
            }
        }

        if (!isEqualHL && settings.smcShowSwingPatterns) {
            const pivotIdx = i - size;
            if (pivotIdx >= 0) {
                // Check the pivot and the two candles immediately following it to catch confirmations
                let pat = detectCandlePattern(candles, pivotIdx);
                if (!pat && pivotIdx + 1 < candles.length) pat = detectCandlePattern(candles, pivotIdx + 1);
                if (!pat && pivotIdx + 2 < candles.length) pat = detectCandlePattern(candles, pivotIdx + 2);

                if (pat) {
                    if (pivotLow && pat.type !== 'bearish') {
                        swingPatterns.push({
                            time: candles[pivotIdx].time,
                            level: candles[pivotIdx].low,
                            type: pat.type,
                            patternName: pat.name
                        });
                    } else if (pivotHigh_ && pat.type !== 'bullish') {
                        swingPatterns.push({
                            time: candles[pivotIdx].time,
                            level: candles[pivotIdx].high,
                            type: pat.type,
                            patternName: pat.name
                        });
                    }
                }
            }
        }
    };

    // Helper: detect BOS/CHoCH and order blocks
    const processStructure = (i: number, isInternal: boolean) => {
        const c = candles[i];

        // Confluence filter (optional)
        let bullishBarOk = true;
        let bearishBarOk = true;
        if (settings.confluenceFilter && isInternal) {
            const bodyUp = c.high - Math.max(c.close, c.open);
            const bodyDown = Math.min(c.close, c.open) - c.low;
            bullishBarOk = bodyUp > bodyDown;
            bearishBarOk = bodyUp < bodyDown;
        }

        const highPivot = isInternal ? internalHigh : swingHigh;
        const lowPivot = isInternal ? internalLow : swingLow;

        // Extra condition: internal structure shouldn't overlap swing structure
        const extraBullOk = isInternal
            ? (internalHigh.currentLevel !== swingHigh.currentLevel && bullishBarOk)
            : true;
        const extraBearOk = isInternal
            ? (internalLow.currentLevel !== swingLow.currentLevel && bearishBarOk)
            : true;

        // Bullish cross (breakout above pivot high)
        if (
            !isNaN(highPivot.currentLevel) &&
            !highPivot.crossed &&
            extraBullOk &&
            c.close > highPivot.currentLevel &&
            (i === 0 || candles[i - 1].close <= highPivot.currentLevel)
        ) {
            const tag: 'BOS' | 'CHoCH' = (isInternal ? internalBias : swingBias) === 'bearish' ? 'CHoCH' : 'BOS';

            // Check filter
            const filter = isInternal ? settings.internalBullFilter : settings.swingBullFilter;
            const shouldDisplay = filter === 'All' || filter === tag;

            if (shouldDisplay) {
                let isTrap = false;
                if (settings.smcCVDTrap && cvdData) {
                    const prevCVD = cvdData.find(d => d.time === highPivot.barTime)?.value;
                    const curCVD = cvdData.find(d => d.time === c.time)?.value;
                    if (prevCVD !== undefined && curCVD !== undefined) {
                        // Price broke higher, but CVD is lower (divergence)
                        if (c.close > highPivot.currentLevel && curCVD < prevCVD) {
                            isTrap = true;
                        }
                    }
                }
                
                structureEvents.push({
                    type: tag,
                    bias: 'bullish',
                    level: highPivot.currentLevel,
                    fromTime: highPivot.barTime,
                    toTime: c.time,
                    fromIndex: highPivot.barIndex,
                    toIndex: i,
                    isInternal,
                    isTrap,
                });
            }

            highPivot.crossed = true;
            if (isInternal) internalBias = 'bullish';
            else swingBias = 'bullish';

            // Store order block on bullish BOS/CHoCH
            if ((isInternal && settings.showInternalOB) || (!isInternal && settings.showSwingOB)) {
                storeOrderBlock(highPivot.barIndex, i, 'bullish', isInternal);
            }
        }

        // Bearish cross (breakdown below pivot low)
        if (
            !isNaN(lowPivot.currentLevel) &&
            !lowPivot.crossed &&
            extraBearOk &&
            c.close < lowPivot.currentLevel &&
            (i === 0 || candles[i - 1].close >= lowPivot.currentLevel)
        ) {
            const tag: 'BOS' | 'CHoCH' = (isInternal ? internalBias : swingBias) === 'bullish' ? 'CHoCH' : 'BOS';

            const filter = isInternal ? settings.internalBearFilter : settings.swingBearFilter;
            const shouldDisplay = filter === 'All' || filter === tag;

            if (shouldDisplay) {
                let isTrap = false;
                if (settings.smcCVDTrap && cvdData) {
                    const prevCVD = cvdData.find(d => d.time === lowPivot.barTime)?.value;
                    const curCVD = cvdData.find(d => d.time === c.time)?.value;
                    if (prevCVD !== undefined && curCVD !== undefined) {
                        // Price broke lower, but CVD is higher (divergence)
                        if (c.close < lowPivot.currentLevel && curCVD > prevCVD) {
                            isTrap = true;
                        }
                    }
                }
                
                structureEvents.push({
                    type: tag,
                    bias: 'bearish',
                    level: lowPivot.currentLevel,
                    fromTime: lowPivot.barTime,
                    toTime: c.time,
                    fromIndex: lowPivot.barIndex,
                    toIndex: i,
                    isInternal,
                    isTrap,
                });
            }

            lowPivot.crossed = true;
            if (isInternal) internalBias = 'bearish';
            else swingBias = 'bearish';

            // Store order block on bearish BOS/CHoCH
            if ((isInternal && settings.showInternalOB) || (!isInternal && settings.showSwingOB)) {
                storeOrderBlock(lowPivot.barIndex, i, 'bearish', isInternal);
            }
        }
    };

    // Store order block: find the best candle between pivotIdx and breakoutIdx
    const storeOrderBlock = (
        pivotIdx: number,
        breakIdx: number,
        bias: 'bullish' | 'bearish',
        isInternal: boolean,
    ) => {
        if (pivotIdx >= breakIdx) return;
        const slice_ph = parsedHighs.slice(pivotIdx, breakIdx);
        const slice_pl = parsedLows.slice(pivotIdx, breakIdx);

        let obIdx: number;
        if (bias === 'bearish') {
            // Pine: find index of max parsed high
            const maxVal = Math.max(...slice_ph);
            obIdx = pivotIdx + slice_ph.indexOf(maxVal);
        } else {
            // Pine: find index of min parsed low
            const minVal = Math.min(...slice_pl);
            obIdx = pivotIdx + slice_pl.indexOf(minVal);
        }

        if (obIdx < 0 || obIdx >= candles.length) return;

        let isValidated = undefined;
        if (settings.smcL2Validation && walls && walls.length > 0) {
            // Check if there is a significant wall resting within the OB range
            const obHigh = candles[obIdx].high;
            const obLow = candles[obIdx].low;
            isValidated = walls.some(w => {
                const typeMatch = bias === 'bullish' ? w.type === 'buy' : w.type === 'sell';
                const priceMatch = w.price >= obLow && w.price <= obHigh;
                return typeMatch && priceMatch;
            });
        }

        const ob: SMCOrderBlock = {
            barHigh: candles[obIdx].high,
            barLow: candles[obIdx].low,
            barTime: candles[obIdx].time,
            toTime: candles[candles.length - 1].time,
            bias,
            isInternal,
            isValidated,
        };

        if (isInternal) {
            internalOrderBlocks.unshift(ob);
            // Trim to max count (keep only the most recent N)
        } else {
            swingOrderBlocks.unshift(ob);
        }
    };

    // ── FVG Detection ─────────────────────────────────────────────────────────
    const detectFVG = (i: number) => {
        if (i < 2) return;

        const c0 = candles[i];     // Current bar
        const c1 = candles[i - 1]; // Middle bar
        const c2 = candles[i - 2]; // Two bars ago

        // Cumulative percentage change for auto-threshold
        let threshold = 0;
        if (settings.fvgAutoThreshold) {
            // Simplified: use average |% change| over history
            const pDelta = Math.abs((c1.close - c1.open) / (c1.open || 1));
            threshold = pDelta * 0.5; // simplified version of Pine's rolling avg * 2
        }

        const barDeltaPct = (c1.close - c1.open) / (c1.open || 1);

        // Bullish FVG: gap between previous high and current low
        if (c0.low > c2.high && c1.close > c2.high && barDeltaPct > threshold) {
            let microImbalances: number[] = [];
            if (settings.smcMicroFVG && footprintData) {
                const fp = footprintData.find(d => d.time === c1.time);
                if (fp) {
                    fp.ticks.forEach(t => {
                        if (t.price >= c2.high && t.price <= c0.low && t.ask > (t.bid * 2)) {
                            microImbalances.push(t.price);
                        }
                    });
                }
            }
            
            fairValueGaps.push({
                bias: 'bullish',
                top: c0.low,
                bottom: c2.high,
                midpoint: (c0.low + c2.high) / 2,
                startTime: c1.time,
                endTime: c0.time,
                barIndex: i,
                microImbalances,
            });
        }

        // Bearish FVG: gap between previous low and current high
        if (c0.high < c2.low && c1.close < c2.low && -barDeltaPct > threshold) {
            let microImbalances: number[] = [];
            if (settings.smcMicroFVG && footprintData) {
                const fp = footprintData.find(d => d.time === c1.time);
                if (fp) {
                    fp.ticks.forEach(t => {
                        if (t.price >= c0.high && t.price <= c2.low && t.bid > (t.ask * 2)) {
                            microImbalances.push(t.price);
                        }
                    });
                }
            }
            
            fairValueGaps.push({
                bias: 'bearish',
                top: c2.low,
                bottom: c0.high,
                midpoint: (c2.low + c0.high) / 2,
                startTime: c1.time,
                endTime: c0.time,
                barIndex: i,
                microImbalances,
            });
        }
    };

    // ── Mitigate (remove) Order Blocks ────────────────────────────────────────
    const mitigateOrderBlocks = (
        i: number,
        blocks: SMCOrderBlock[],
        toRemove: Set<number>
    ) => {
        const c = candles[i];
        const mitigSource_bear = settings.obMitigation === 'Close' ? c.close : c.high;
        const mitigSource_bull = settings.obMitigation === 'Close' ? c.close : c.low;

        blocks.forEach((ob, idx) => {
            if (ob.bias === 'bearish' && mitigSource_bear > ob.barHigh) {
                toRemove.add(idx);
            } else if (ob.bias === 'bullish' && mitigSource_bull < ob.barLow) {
                toRemove.add(idx);
            }
        });
    };

    // ── Mitigate FVGs ─────────────────────────────────────────────────────────
    const mitigateFVGs = (i: number, fvgs: SMCFairValueGap[], toRemove: Set<number>) => {
        const c = candles[i];
        fvgs.forEach((fvg, idx) => {
            if (fvg.bias === 'bullish' && c.low < fvg.bottom) {
                toRemove.add(idx);
            } else if (fvg.bias === 'bearish' && c.high > fvg.top) {
                toRemove.add(idx);
            }
        });
    };

    // ── MAIN LOOP ─────────────────────────────────────────────────────────────
    for (let i = 0; i < n; i++) {
        // 1. Detect swing pivots (size = swingLength)
        processLeg(i, settings.swingLength, false, false);

        // 2. Detect internal pivots (size = 5, hardcoded in Pine)
        processLeg(i, 5, true, false);

        // 3. Detect equal highs/lows (size = equalHLLength)
        if (settings.showEqualHL) {
            processLeg(i, settings.equalHLLength, false, true);
        }

        // 4. Detect internal structure (BOS/CHoCH) and order blocks
        if (settings.showInternals || settings.showInternalOB) {
            processStructure(i, true);
        }

        // 5. Detect swing structure (BOS/CHoCH) and order blocks
        if (settings.showSwing || settings.showSwingOB || settings.showStrongWeakHL) {
            processStructure(i, false);
        }

        // 6. Update trailing extremes
        if (settings.showStrongWeakHL || settings.showPDZones) {
            if (candles[i].high > trailing.top) {
                trailing.top = candles[i].high;
                trailing.lastTopTime = candles[i].time;
                trailing.lastTopIndex = i;
            }
            if (candles[i].low < trailing.bottom) {
                trailing.bottom = candles[i].low;
                trailing.lastBottomTime = candles[i].time;
                trailing.lastBottomIndex = i;
            }
        }

        // 7. FVG detection
        if (settings.showFVG) {
            detectFVG(i);
        }

        // 8. Mitigate order blocks and FVGs on each bar
        const intToRemove = new Set<number>();
        const swgToRemove = new Set<number>();
        const fvgToRemove = new Set<number>();

        mitigateOrderBlocks(i, internalOrderBlocks, intToRemove);
        mitigateOrderBlocks(i, swingOrderBlocks, swgToRemove);
        if (settings.showFVG) mitigateFVGs(i, fairValueGaps, fvgToRemove);

        // Remove mitigated items (reverse order to preserve indices)
        [...intToRemove].sort((a, b) => b - a).forEach(idx => internalOrderBlocks.splice(idx, 1));
        [...swgToRemove].sort((a, b) => b - a).forEach(idx => swingOrderBlocks.splice(idx, 1));
        [...fvgToRemove].sort((a, b) => b - a).forEach(idx => fairValueGaps.splice(idx, 1));
    }

    // ── Live Sweep Detection at Equal H/L ─────────────────────────────────────
    if (settings.smcSweepDetection && currentPrice && footprintData && footprintData.length > 0) {
        const lastFp = footprintData[footprintData.length - 1];
        const fpVol = lastFp.ticks.reduce((sum, t) => sum + t.volume, 0);
        const fpDelta = lastFp.ticks.reduce((sum, t) => sum + t.delta, 0);
        
        equalHighsLows.forEach(eq => {
            const range = settings.equalHLThreshold * (atrArr[candles.length - 1] || 1);
            if (Math.abs(currentPrice - eq.level) <= range) {
                // If price is near EQH/EQL, check for massive volume & heavy delta with no push
                if (fpVol > 500) { 
                    // basic heuristic: large volume at equal high/low = absorption sweep
                    eq.isSweep = true;
                }
            }
        });
    }

    // ── Trim Order Blocks to user-specified count ─────────────────────────────
    const trimmedInternalOB = internalOrderBlocks.slice(0, settings.internalOBCount);
    const trimmedSwingOB = swingOrderBlocks.slice(0, settings.swingOBCount);

    // Update toTime on all surviving OBs to last candle time
    const lastBarTime = candles[n - 1].time;
    trimmedInternalOB.forEach(ob => { ob.toTime = lastBarTime; });
    trimmedSwingOB.forEach(ob => { ob.toTime = lastBarTime; });

    // ── Premium / Discount Zones ──────────────────────────────────────────────
    let zones: SMCZones | null = null;
    if (settings.showPDZones && trailing.top !== -Infinity && trailing.bottom !== Infinity) {
        zones = {
            top: trailing.top,
            bottom: trailing.bottom,
            equilibrium: (trailing.top + trailing.bottom) / 2,
            startTime: trailing.barTime,
        };
    }

    return {
        structureEvents,
        internalOrderBlocks: trimmedInternalOB,
        swingOrderBlocks: trimmedSwingOB,
        fairValueGaps,
        equalHighsLows,
        swingPatterns,
        trailingExtreme: (settings.showStrongWeakHL || settings.showPDZones)
            ? { ...trailing }
            : null,
        zones,
        swingBias,
        internalBias,
    };
}
