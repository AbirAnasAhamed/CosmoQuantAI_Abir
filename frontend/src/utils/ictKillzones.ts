
/**
 * ICT Killzones & Pivots [TFO] Logic Utility
 * Ported from Pine Script v6
 */

export interface ICTSessionConfig {
    id: string;
    name: string;
    session: string; // HHMM-HHMM
    color: string;
    enabled: boolean;
}

export interface ICTKillzoneData {
    id: string;
    name: string;
    color: string;
    startTime: number;
    endTime: number | null;
    high: number;
    low: number;
    isActive: boolean;
}

export interface ICTPivotLine {
    time: number;
    endTime: number | null;
    price: number;
    type: 'high' | 'low' | 'mid';
    sessionName: string;
    color: string;
    isMitigated: boolean;
    mitigationTime: number | null;
}

export interface ICTDWMData {
    dayOpen: number | null;
    dayHigh: number | null;
    dayLow: number | null;
    weekOpen: number | null;
    weekHigh: number | null;
    weekLow: number | null;
    monthOpen: number | null;
    monthHigh: number | null;
    monthLow: number | null;
}

export interface ICTOpeningPrice {
    time: number;
    price: number;
    label: string;
    color: string;
}

export interface ICTVerticalTimestamp {
    time: number;
    color: string;
}

export interface ICTResult {
    killzones: ICTKillzoneData[];
    pivots: ICTPivotLine[];
    dwm: ICTDWMData;
    openingPrices: ICTOpeningPrice[];
    timestamps: ICTVerticalTimestamp[];
    dayLabels: { time: number; text: string }[];
    silverBullets: ICTKillzoneData[];
    gaps: { time: number; price: number; type: 'NDOG' | 'NWOG'; color: string }[];
    amdSignals: { time: number; price: number; type: 'accumulation' | 'manipulation' | 'distribution'; text: string }[];
    volatility: { name: string; averageRange: number }[];
}

// Reusable formatters to avoid memory/CPU leaks in loops
const timeFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
});

const partsFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'long'
});

const dayFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric'
});

/**
 * Checks if a time falls within a session string (e.g. "1300-2200")
 * Handles overnights.
 */
export const isTimeInSession = (timestamp: number, sessionStr: string): boolean => {
    const date = new Date(timestamp);
    const nyTime = timeFormatter.format(date);
    
    const [hStr, mStr] = nyTime.split(':');
    let h = parseInt(hStr, 10);
    // Handle 24:xx from some browsers for midnight
    if (h === 24) h = 0;
    const m = parseInt(mStr, 10);
    
    const timeNum = h * 100 + m;

    const [startStr, endStr] = sessionStr.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    
    if (start < end) {
        return timeNum >= start && timeNum < end;
    } else {
        // Overnights (e.g. "2200-0500")
        return timeNum >= start || timeNum < end;
    }
};

/**
 * Gets the "start of day" in the given timezone (standard for ICT).
 * Typically 00:00 New York.
 */
export const getDayStart = (timestamp: number): number => {
    const date = new Date(timestamp);
    const parts = dayFormatter.formatToParts(date);
    const map = new Map(parts.map(p => [p.type, p.value]));
    
    const nyDate = new Date(`${map.get('year')}-${map.get('month')?.padStart(2, '0')}-${map.get('day')?.padStart(2, '0')}T00:00:00`);
    
    return nyDate.getTime();
}

export interface ICTOpeningPriceConfig {
    id: string;
    label: string;
    session: string;
    color: string;
    enabled: boolean;
}

export interface ICTVerticalTimestampConfig {
    id: string;
    session: string;
    color: string;
    enabled: boolean;
}

/**
 * Core calculation function for ICT Suite
 */
export const calculateICTSuite = (
    data: { time: any; open: number; high: number; low: number; close: number; volume?: number }[],
    configs: {
        sessions: ICTSessionConfig[];
        openingPrices?: ICTOpeningPriceConfig[];
        timestamps?: ICTVerticalTimestampConfig[];
        showPivots: boolean;
        showDWM: boolean;
        showOpeningPrices: boolean;
        showTimestamps: boolean;
        pivotsExtend: 'Until Mitigated' | 'Past Mitigation';
        showSilverBullet?: boolean;
        showConfluence?: boolean;
        showAMD?: boolean;
        showGaps?: boolean;
        showVolatility?: boolean;
        showEquilibrium?: boolean;
    }
): ICTResult => {
    const result: ICTResult = {
        killzones: [],
        pivots: [],
        dwm: {
            dayOpen: null, dayHigh: null, dayLow: null,
            weekOpen: null, weekHigh: null, weekLow: null,
            monthOpen: null, monthHigh: null, monthLow: null
        },
        openingPrices: [],
        timestamps: [],
        dayLabels: [],
        silverBullets: [],
        gaps: [],
        amdSignals: [],
        volatility: []
    };

    if (data.length === 0) return result;

    const sessionTrackers = configs.sessions.map(s => ({
        ...s,
        currentHigh: -Infinity,
        currentLow: Infinity,
        startTime: 0,
        inSession: false
    }));

    // DWM state
    let lastDay = -1;
    let lastWeek = -1;
    let lastMonth = -1;

    for (let i = 0; i < data.length; i++) {
        const bar = data[i];
        const timeMs = (typeof bar.time === 'number' && bar.time < 10000000000) ? bar.time * 1000 : bar.time;
        const barDate = new Date(timeMs);
        
        // Get day/week/month in NY time for accurate ICT boundaries
        const nyDateParts = partsFormatter.formatToParts(barDate);
        const nyDateMap = new Map(nyDateParts.map(p => [p.type, p.value]));
        
        const currentDay = parseInt(nyDateMap.get('day')!);
        const currentMonth = parseInt(nyDateMap.get('month')!);
        const currentYear = parseInt(nyDateMap.get('year')!);
        const currentWeekday = nyDateMap.get('weekday')!;

        const isNewDay = currentDay !== lastDay;

        // ─── Opening Prices & Gaps ──────────────────────────────────────────────
        if (configs.showGaps && isNewDay && lastDay !== -1) {
            if (i > 0) {
                const prevBar = data[i-1];
                const gapDiff = Math.abs(bar.open - prevBar.close);
                if (gapDiff > bar.open * 0.0001) {
                    if (currentWeekday === 'Monday') {
                        result.gaps.push({ time: timeMs, price: Math.max(bar.open, prevBar.close), type: 'NWOG', color: '#f59e0b' });
                        result.gaps.push({ time: timeMs, price: Math.min(bar.open, prevBar.close), type: 'NWOG', color: '#f59e0b' });
                    } else {
                        result.gaps.push({ time: timeMs, price: bar.open, type: 'NDOG', color: '#10b981' });
                        result.gaps.push({ time: timeMs, price: prevBar.close, type: 'NDOG', color: '#10b981' });
                    }
                }
            }
        }

        // ─── Day / Week / Month Open & HL ──────────────────────────────────────
        if (isNewDay) {
            result.dwm.dayOpen = bar.open;
            result.dwm.dayHigh = bar.high;
            result.dwm.dayLow = bar.low;
            result.dayLabels.push({ time: timeMs, text: currentWeekday.toUpperCase() });
            lastDay = currentDay;
        } else {
            result.dwm.dayHigh = Math.max(result.dwm.dayHigh || -Infinity, bar.high);
            result.dwm.dayLow = Math.min(result.dwm.dayLow || Infinity, bar.low);
        }

        // ─── Opening Prices (Horizontal Logs) ──────────────────────────────────
        if (configs.showOpeningPrices && configs.openingPrices) {
            configs.openingPrices.forEach(op => {
                if (op.enabled && isTimeInSession(timeMs, op.session)) {
                    // Check if we already have an entry for this session on this day
                    const dayKey = `${currentYear}-${currentMonth}-${currentDay}`;
                    const existing = result.openingPrices.find(p => p.label === op.label && new Date(p.time).toDateString() === barDate.toDateString());
                    if (!existing) {
                        result.openingPrices.push({
                            time: timeMs,
                            price: bar.open,
                            label: op.label,
                            color: op.color
                        });
                    }
                }
            });
        }

        // ─── Vertical Timestamps ──────────────────────────────────────────────
        if (configs.showTimestamps && configs.timestamps) {
            configs.timestamps.forEach(ts => {
                if (ts.enabled && isTimeInSession(timeMs, ts.session)) {
                    const existing = result.timestamps.find(p => p.color === ts.color && new Date(p.time).toDateString() === barDate.toDateString());
                    if (!existing) {
                        result.timestamps.push({
                            time: timeMs,
                            color: ts.color
                        });
                    }
                }
            });
        }


        // ─── Silver Bullets ───────────────────────────────────────────────────
        if (configs.showSilverBullet) {
            const isSb1 = isTimeInSession(timeMs, '0300-0400');
            const isSb2 = isTimeInSession(timeMs, '1000-1100');
            const isSb3 = isTimeInSession(timeMs, '1400-1500');
            
            if (isSb1 || isSb2 || isSb3) {
                 const sbName = isSb1 ? 'London SB' : isSb2 ? 'NY AM SB' : 'NY PM SB';
                 const sbId = `sb_${sbName}_${currentDay}`;
                 const existing = result.silverBullets.find(sb => sb.id === sbId);
                 if (!existing) {
                     result.silverBullets.push({
                        id: sbId, name: sbName, color: 'rgba(255, 215, 0, 0.4)', // Gold
                        startTime: timeMs, endTime: timeMs, high: bar.high, low: bar.low, isActive: true
                     });
                 } else {
                     existing.endTime = timeMs;
                     existing.high = Math.max(existing.high, bar.high);
                     existing.low = Math.min(existing.low, bar.low);
                 }
            }
        }

        // Add DWM logic for week and month here if needed...
        // For now focusing on Killzones as per the user's focus.

        // ─── Killzones ────────────────────────────────────────────────────────
        sessionTrackers.forEach(st => {
            if (!st.enabled) return;
            const nowIn = isTimeInSession(timeMs, st.session);
            
            if (nowIn && !st.inSession) {
                // New session start
                st.inSession = true;
                st.startTime = timeMs;
                st.currentHigh = bar.high;
                st.currentLow = bar.low;
            } else if (nowIn && st.inSession) {
                // Ongoing session
                st.currentHigh = Math.max(st.currentHigh, bar.high);
                st.currentLow = Math.min(st.currentLow, bar.low);
            } else if (!nowIn && st.inSession) {
                // Session ended
                st.inSession = false;
                result.killzones.push({
                    id: st.id,
                    name: st.name,
                    color: st.color,
                    startTime: st.startTime,
                    endTime: timeMs,
                    high: st.currentHigh,
                    low: st.currentLow,
                    isActive: false
                });

                // Create Pivots
                if (configs.showPivots) {
                    result.pivots.push({
                        time: st.startTime,
                        endTime: null,
                        price: st.currentHigh,
                        type: 'high',
                        sessionName: st.name,
                        color: st.color,
                        isMitigated: false,
                        mitigationTime: null
                    });
                    result.pivots.push({
                        time: st.startTime,
                        endTime: null,
                        price: st.currentLow,
                        type: 'low',
                        sessionName: st.name,
                        color: st.color,
                        isMitigated: false,
                        mitigationTime: null
                    });
                }
            }
        });

        // ─── Active Killzone Tracking ──────────────────────────────────────────
        sessionTrackers.forEach(st => {
            if (st.inSession) {
                 // Update ongoing killzone range for potential real-time visualization
                 // But we usually only push the finalized ones to the main list.
                 // We can handle the "current" one separately if needed.
            }
        });

        // ─── Mitigation Logic ──────────────────────────────────────────────
        if (configs.pivotsExtend === 'Until Mitigated') {
            result.pivots.forEach(p => {
                if (!p.isMitigated) {
                    if (p.type === 'high' && bar.high > p.price) {
                        p.isMitigated = true;
                        p.endTime = timeMs;
                        p.mitigationTime = timeMs;
                    } else if (p.type === 'low' && bar.low < p.price) {
                        p.isMitigated = true;
                        p.endTime = timeMs;
                        p.mitigationTime = timeMs;
                    }
                }
            });
        }
    }

    // Set endTime for active/unmitigated pivots to the last bar
    const lastTime = (typeof data[data.length-1].time === 'number' && data[data.length-1].time < 10000000000) 
        ? data[data.length-1].time * 1000 : data[data.length-1].time;
    
    result.pivots.forEach(p => {
        if (!p.endTime) p.endTime = lastTime;
    });

    return result;
};
