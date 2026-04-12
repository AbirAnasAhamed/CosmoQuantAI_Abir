import { Time } from 'lightweight-charts';

// ─── Interfaces ─────────────────────────────────────────────────────────────

export interface LuxIctConfigs {
    luxShowIndicator: boolean;
    mode: 'Present' | 'Historical';
    showMS: boolean;
    swingLength: number;
    showMSS: boolean;
    showBOS: boolean;
    showDisplacement: boolean;
    percBody: number;
    showVIMB: boolean;
    vimbThreshold: number;
    showOB: boolean;
    obLookback: number;
    showBullOB: number;
    showBearOB: number;
    showOBLabels: boolean;
    showLiq: boolean;
    liqMargin: number; // usually 10 / 4 = 2.5
    liqVisibleCount: number;
    showFVG: boolean;
    bpr: boolean;
    fvgType: 'FVG' | 'IFVG';
    fvgVisibleCount: number;
    showNWOG: boolean;
    nwogMax: number;
    showNDOG: boolean;
    ndogMax: number;
    fibMode: 'FVG' | 'BPR' | 'OB' | 'Liq' | 'VI' | 'NWOG' | 'NONE';
    fibExtend: boolean;
    showKillzones: boolean;
}

export interface FVG {
    id: string;
    type: 'bull' | 'bear';
    top: number;
    bottom: number;
    left: number;
    right: number;
    isBPR?: boolean;
    active: boolean;
    broken?: boolean;
    mitigatedAt?: number;
}

export interface OB {
    id: string;
    type: 'bull' | 'bear';
    top: number;
    bottom: number;
    left: number;
    right: number;
    breaker: boolean;
    breakLoc?: number;
}

export interface Liq {
    id: string;
    type: 'buyside' | 'sellside';
    top: number;
    bottom: number;
    left: number;
    right: number;
    broken: boolean;
    brokenTop: boolean;
    brokenBtm: boolean;
    price: number;
}

export interface ZigZagPoint {
    dir: number; // 1 (ph), -1 (pl)
    x: number;   // Timestamp
    y: number;   // Price
    isNew: boolean;
}

export interface MSLine {
    id: string;
    type: 'BOS' | 'MSS';
    dir: 'bull' | 'bear';
    x1: number;
    x2: number;
    y: number;
}

export interface VolImbalance {
    id: string;
    type: 'bull' | 'bear';
    top: number;
    bottom: number;
    x1: number; // start
}

export interface LuxGap {
    id: string;
    type: 'NWOG' | 'NDOG';
    top: number;
    bottom: number;
    left: number;
}

export interface LuxIctResult {
    fvgs: FVG[];
    bprs: FVG[];
    obs: OB[];
    liqs: Liq[];
    zigzags: ZigZagPoint[];
    msLines: MSLine[];
    vimbs: VolImbalance[];
    gaps: LuxGap[];
    displacements: { time: number; type: 'up' | 'down'; price: number }[];
}

export const calculateLuxIctConcepts = (data: any[], configs: LuxIctConfigs): LuxIctResult => {
    const result: LuxIctResult = {
        fvgs: [], bprs: [], obs: [], liqs: [], zigzags: [],
        msLines: [], vimbs: [], gaps: [], displacements: []
    };

    if (!data || data.length < Math.max(configs.swingLength || 5, 10)) return result;

    // --- State variables mimicking series ---
    const zz: ZigZagPoint[] = [];
    let mssDir = 0; // 1 for bull, -1 for bear
    
    // Arrays for tracking active elements
    const activeBullFVGs: FVG[] = [];
    const activeBearFVGs: FVG[] = [];
    const activeBPRs: FVG[] = [];
    
    let lastDay = -1;
    let fridayClose = 0;
    
    // Formatters for Time checks
    const partsFormatter = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York',
        year: 'numeric', month: 'numeric', day: 'numeric', weekday: 'long'
    });

    for (let i = 0; i < data.length; i++) {
        const bar = data[i];
        const timeMs = (typeof bar.time === 'number' && bar.time < 10000000000) ? bar.time * 1000 : bar.time;
        
        const open = bar.open;
        const high = bar.high;
        const low = bar.low;
        const close = bar.close;
        const mx = Math.max(open, close);
        const mn = Math.min(open, close);
        const bodySize = Math.abs(open - close);

        // Calculate simple moving average of body size
        let sumBody = 0;
        let countBody = 0;
        for (let j = Math.max(0, i - configs.swingLength); j <= i; j++) {
            sumBody += Math.abs(data[j].open - data[j].close);
            countBody++;
        }
        const meanBody = countBody > 0 ? sumBody / countBody : 0;

        // ─── 1. Displacement Calculation ───────────────────────────────────────
        const L_body = (high - mx < bodySize * configs.percBody) && (mn - low < bodySize * configs.percBody);
        const L_bodyUP = bodySize > meanBody && L_body && close > open;
        const L_bodyDN = bodySize > meanBody && L_body && close < open;

        if (configs.showDisplacement) {
            if (L_bodyUP) result.displacements.push({ time: timeMs, type: 'up', price: low });
            if (L_bodyDN) result.displacements.push({ time: timeMs, type: 'down', price: high });
        }

        // ─── 1.b Volume Imbalance Calculation ──────────────────────────────────
        if (configs.showVIMB && i >= 1) {
            const bar1 = data[i-1];
            const vImb_Bl = open > bar1.close && bar1.high > low && close > bar1.close && open > bar1.open && bar1.high < mn;
            const vImb_Br = open < bar1.close && bar1.low < high && close < bar1.close && open < bar1.open && bar1.low > mx;
            
            if (vImb_Bl) {
                 result.vimbs.unshift({ id: `vimb_${timeMs}`, type: 'bull', top: Math.max(open, close), bottom: Math.min(open, close), x1: bar1.time });
            }
            if (vImb_Br) {
                 result.vimbs.unshift({ id: `vimb_${timeMs}`, type: 'bear', top: Math.max(open, close), bottom: Math.min(open, close), x1: bar1.time });
            }
        }

        // ─── 1.c Swings & ZigZag (for OB & MSS) ───────────────────────────────
        if (i >= configs.swingLength * 2) {
             const len = configs.swingLength;
             // We look back to i - len, and compare to highest/lowest in the window before it.
             // Actually, simplest true swing detection:
             // Is high[i-len] strict highest in the window [i-2*len, i]?
             let isTop = true;
             let isBtm = true;
             const pivotIdx = i - len;
             const pivotHigh = data[pivotIdx].high;
             const pivotLow = data[pivotIdx].low;

             for (let j = i - 2 * len; j <= i; j++) {
                 if (j === pivotIdx) continue;
                 if (data[j].high >= pivotHigh) isTop = false;
                 if (data[j].low <= pivotLow) isBtm = false;
             }

             if (isTop) {
                 zz.unshift({ dir: 1, x: data[pivotIdx].time, y: pivotHigh, isNew: true });
                 
                 // Generate Bearish OB
                 if (configs.showOB) {
                     let maxima = data[pivotIdx].high;
                     let minima = data[pivotIdx].low;
                     let obLoc = data[pivotIdx].time;
                     for (let k = 1; k < len; k++) {
                         let tempBar = data[pivotIdx - k];
                         if (!tempBar) continue;
                         if (tempBar.high > maxima) {
                             maxima = tempBar.high;
                             minima = tempBar.low;
                             obLoc = tempBar.time;
                         }
                     }
                     result.obs.unshift({ id: `ob_bear_${obLoc}`, type: 'bear', top: maxima, bottom: minima, left: obLoc, right: timeMs, breaker: false });
                 }
             }
             if (isBtm) {
                 zz.unshift({ dir: -1, x: data[pivotIdx].time, y: pivotLow, isNew: true });

                 // Generate Bullish OB
                 if (configs.showOB) {
                     let maxima = data[pivotIdx].high;
                     let minima = data[pivotIdx].low;
                     let obLoc = data[pivotIdx].time;
                     for (let k = 1; k < len; k++) {
                         let tempBar = data[pivotIdx - k];
                         if (!tempBar) continue;
                         if (tempBar.low < minima) {
                             minima = tempBar.low;
                             maxima = tempBar.high;
                             obLoc = tempBar.time;
                         }
                     }
                     result.obs.unshift({ id: `ob_bull_${obLoc}`, type: 'bull', top: maxima, bottom: minima, left: obLoc, right: timeMs, breaker: false });
                 }
             }

             // OB Mitigation Logic
             result.obs.forEach(ob => {
                 ob.right = timeMs;
                 if (!ob.breaker) {
                     if (ob.type === 'bull' && Math.min(close, open) < ob.bottom) {
                         ob.breaker = true;
                         ob.breakLoc = timeMs;
                     }
                     if (ob.type === 'bear' && Math.max(close, open) > ob.top) {
                         ob.breaker = true;
                         ob.breakLoc = timeMs;
                     }
                 }
             });

             // MSS / BOS Logic
             if (configs.showMS && zz.length > 2) {
                 const currentTrend = mssDir;
                 // simplified detection
                 if (currentTrend <= 0 && close > zz[0].y && zz[0].dir === 1) {
                     mssDir = 1;
                     if (configs.showMSS) result.msLines.push({ id: `mss_bull_${timeMs}`, type: 'MSS', dir: 'bull', x1: zz[0].x, x2: timeMs, y: zz[0].y });
                 } else if (currentTrend >= 0 && close < zz[0].y && zz[0].dir === -1) {
                     mssDir = -1;
                     if (configs.showMSS) result.msLines.push({ id: `mss_bear_${timeMs}`, type: 'MSS', dir: 'bear', x1: zz[0].x, x2: timeMs, y: zz[0].y });
                 } else if (currentTrend === 1 && close > zz[0].y && zz[0].dir === 1) {
                     if (configs.showBOS) result.msLines.push({ id: `bos_bull_${timeMs}`, type: 'BOS', dir: 'bull', x1: zz[0].x, x2: timeMs, y: zz[0].y });
                     zz[0].isNew = false; // prevents spamming
                 } else if (currentTrend === -1 && close < zz[0].y && zz[0].dir === -1) {
                     if (configs.showBOS) result.msLines.push({ id: `bos_bear_${timeMs}`, type: 'BOS', dir: 'bear', x1: zz[0].x, x2: timeMs, y: zz[0].y });
                     zz[0].isNew = false;
                 }
                 
                 // Remove duplicates
                 result.msLines = result.msLines.filter((v,i,a)=>a.findIndex(t=>(t.y===v.y && t.dir===v.dir))===i);
             }
             
             // Liquidity (Equal Highs / Equal Lows)
             if (configs.showLiq && zz.length > 1) {
                 const atrEstimate = meanBody * 2; // rough proxy for ATR inside quick lookback
                 const margin = atrEstimate / configs.liqMargin; // margin tolerance

                 // Check EqH
                 if (isTop) {
                     let eqhCount = 1;
                     let eqhMin = pivotHigh;
                     let eqhMax = pivotHigh;
                     let startIdx = Object.assign({}, zz[0]);
                     for (let j = 1; j < Math.min(zz.length, 50); j++) {
                         if (zz[j].dir !== 1) continue;
                         if (zz[j].y > pivotHigh + margin) break;
                         if (zz[j].y > pivotHigh - margin && zz[j].y < pivotHigh + margin) {
                             eqhCount++;
                             startIdx = zz[j];
                             eqhMin = Math.min(eqhMin, zz[j].y);
                             eqhMax = Math.max(eqhMax, zz[j].y);
                         }
                     }
                     if (eqhCount > 1) {
                         // We have EQH (Buy Side Liquidity)
                         result.liqs.unshift({
                             id: `liq_buy_${startIdx.x}`, type: 'buyside',
                             top: eqhMax + margin, bottom: Math.max(eqhMin - margin, 0),
                             left: startIdx.x, right: timeMs,
                             broken: false, brokenTop: false, brokenBtm: false, price: (eqhMax + eqhMin) / 2
                         });
                     }
                 }

                 // Check EqL
                 if (isBtm) {
                     let eqlCount = 1;
                     let eqlMin = pivotLow;
                     let eqlMax = pivotLow;
                     let startIdx = Object.assign({}, zz[0]);
                     for (let j = 1; j < Math.min(zz.length, 50); j++) {
                         if (zz[j].dir !== -1) continue;
                         if (zz[j].y < pivotLow - margin) break;
                         if (zz[j].y > pivotLow - margin && zz[j].y < pivotLow + margin) {
                             eqlCount++;
                             startIdx = zz[j];
                             eqlMin = Math.min(eqlMin, zz[j].y);
                             eqlMax = Math.max(eqlMax, zz[j].y);
                         }
                     }
                     if (eqlCount > 1) {
                         // We have EQL (Sell Side Liquidity)
                         result.liqs.unshift({
                             id: `liq_sell_${startIdx.x}`, type: 'sellside',
                             top: eqlMax + margin, bottom: Math.max(eqlMin - margin, 0),
                             left: startIdx.x, right: timeMs,
                             broken: false, brokenTop: false, brokenBtm: false, price: (eqlMax + eqlMin) / 2
                         });
                     }
                 }
             }

             // Liquidity Mitigations
             result.liqs.forEach(l => {
                 if (!l.broken) {
                     l.right = timeMs;
                     if (l.type === 'buyside' && close > l.top) l.broken = true;
                     if (l.type === 'sellside' && close < l.bottom) l.broken = true;
                 }
             });
        }

        // ─── 2. Fair Value Gaps (FVG) ──────────────────────────────────────────
        if (configs.showFVG && i >= 2) {
            const bar2 = data[i - 2];
            
            // Bullish FVG
            const isBullFVG = data[i-1].close > data[i-1].open && bodySize > meanBody && (configs.fvgType === 'FVG' ? low > bar2.high : low < bar2.high);
            if (isBullFVG) {
                const top = configs.fvgType === 'FVG' ? low : bar2.high;
                const bottom = configs.fvgType === 'FVG' ? bar2.high : low;
                if (top > bottom) {
                    activeBullFVGs.unshift({
                        id: `fvg_bull_${timeMs}`, type: 'bull',
                        top, bottom, left: bar2.time, right: timeMs, active: true
                    });
                }
            }

            // Bearish FVG
            const isBearFVG = data[i-1].close < data[i-1].open && bodySize > meanBody && (configs.fvgType === 'FVG' ? high < bar2.low : high > bar2.low);
            if (isBearFVG) {
                const top = configs.fvgType === 'FVG' ? bar2.low : high;
                const bottom = configs.fvgType === 'FVG' ? high : bar2.low;
                if (top > bottom) {
                    activeBearFVGs.unshift({
                        id: `fvg_bear_${timeMs}`, type: 'bear',
                        top, bottom, left: bar2.time, right: timeMs, active: true
                    });
                }
            }
        }

        // Evaluate FVG Mitigations
        activeBullFVGs.forEach(f => {
            if (!f.active) return;
            f.right = timeMs;
            if (low < f.bottom) {
                f.active = false;
                f.broken = true;
                f.mitigatedAt = timeMs;
            }
        });
        activeBearFVGs.forEach(f => {
            if (!f.active) return;
            f.right = timeMs;
            if (high > f.top) {
                f.active = false;
                f.broken = true;
                f.mitigatedAt = timeMs;
            }
        });

        // ─── 3. Balance Price Range (BPR) ──────────────────────────────────────
        // Advanced overlap logic runs here in Pine Script.
        if (configs.bpr && activeBullFVGs.length > 0 && activeBearFVGs.length > 0) {
            const bxUP = activeBullFVGs[0];
            const bxDN = activeBearFVGs[0];
            
            if (bxUP.bottom < bxDN.top && bxDN.bottom < bxUP.bottom) {
                activeBPRs.unshift({
                    id: `bpr_up_${timeMs}`, type: 'bull', isBPR: true,
                    top: bxDN.top, bottom: bxUP.bottom,
                    left: Math.min(bxUP.left, bxDN.left), right: timeMs, active: true
                });
            }
            if (bxDN.bottom < bxUP.top && bxUP.bottom < bxDN.bottom) {
                activeBPRs.unshift({
                    id: `bpr_dn_${timeMs}`, type: 'bear', isBPR: true,
                    top: bxUP.top, bottom: bxDN.bottom,
                    left: Math.min(bxUP.left, bxDN.left), right: timeMs, active: true
                });
            }
        }

        // Evaluate BPR Mitigations
        activeBPRs.forEach(b => {
             if (!b.active) return;
             b.right = timeMs;
             if (b.type === 'bull' && low < b.bottom) b.active = false;
             if (b.type === 'bear' && high > b.top) b.active = false;
        });

        // ─── 4. NWOG / NDOG ────────────────────────────────────────────────────
        if (configs.showNWOG || configs.showNDOG) {
            const barDate = new Date(timeMs);
            const parts = partsFormatter.formatToParts(barDate);
            const pMap = new Map(parts.map(p => [p.type, p.value]));
            const currentDay = parseInt(pMap.get('day')!);
            const currentWeekday = pMap.get('weekday')!;

            if (currentDay !== lastDay) {
                 if (i > 0) {
                     const prevBar = data[i-1];
                     if (configs.showNWOG && currentWeekday === 'Monday') {
                         result.gaps.push({
                             id: `nwog_${timeMs}`, type: 'NWOG', 
                             top: Math.max(open, prevBar.close),
                             bottom: Math.min(open, prevBar.close),
                             left: timeMs
                         });
                     } else if (configs.showNDOG && currentWeekday !== 'Monday') {
                         result.gaps.push({
                             id: `ndog_${timeMs}`, type: 'NDOG', 
                             top: Math.max(open, prevBar.close),
                             bottom: Math.min(open, prevBar.close),
                             left: timeMs
                         });
                     }
                 }
                 lastDay = currentDay;
            }
        }
    }

    // Assign final active FVGs / BPRs bounded by limit
    result.fvgs = [...activeBullFVGs, ...activeBearFVGs]
         .filter(f => configs.mode === 'Historical' || f.active)
         .slice(0, configs.fvgVisibleCount * 2);
    
    result.bprs = activeBPRs
         .filter(f => configs.mode === 'Historical' || f.active)
         .slice(0, configs.fvgVisibleCount);

    return result;
}
