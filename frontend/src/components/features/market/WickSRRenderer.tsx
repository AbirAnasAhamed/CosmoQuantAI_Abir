import React, { useEffect, useRef } from 'react';
import { ISeriesApi, LineStyle } from 'lightweight-charts';
import { WickSRResult, SRLevel } from '../../../utils/indicators';

interface WickSRRendererProps {
    chart: any;
    series: ISeriesApi<'Candlestick'> | null;
    data: WickSRResult | null;
    showZones: boolean;
    showLabels: boolean;
    visible: boolean;
}

// Returns RGBA color string based on level type, strength, and broken state
const getLevelColor = (level: SRLevel): { line: string; zone: string } => {
    const isResistance = level.type === 'resistance';
    const isBroken = level.isBroken;

    if (isBroken) {
        // Broken levels render as faded grey/purple
        return {
            line: 'rgba(148, 163, 184, 0.5)',
            zone: 'rgba(148, 163, 184, 0.06)',
        };
    }

    // Strength-based opacity
    const opacityMap = { weak: 0.55, moderate: 0.70, strong: 0.85, ultra: 1.0 };
    const opacity = opacityMap[level.strength];

    if (isResistance) {
        // Resistance → Red family
        const lineRgb = `255, 80, 80`;
        return {
            line: `rgba(${lineRgb}, ${opacity})`,
            zone: `rgba(${lineRgb}, 0.08)`,
        };
    } else {
        // Support → Green family
        const lineRgb = `34, 211, 120`;
        return {
            line: `rgba(${lineRgb}, ${opacity})`,
            zone: `rgba(${lineRgb}, 0.08)`,
        };
    }
};

// All lines are 1px — clean and unobtrusive on the chart
const getLineWidth = (_strength: SRLevel['strength']): 1 => 1;

// Broken levels use dashed style, active ones solid
const getLineStyle = (level: SRLevel): LineStyle => {
    if (level.isBroken) return LineStyle.LargeDashed;
    if (level.strength === 'weak') return LineStyle.Dashed;
    return LineStyle.Solid;
};

export const WickSRRenderer: React.FC<WickSRRendererProps> = ({
    chart,
    series,
    data,
    showZones,
    showLabels,
    visible,
}) => {
    // Track all created price lines so we can remove/recreate on data change
    const mainLinesRef  = useRef<any[]>([]);
    const zoneTopLinesRef = useRef<any[]>([]);
    const zoneBotLinesRef = useRef<any[]>([]);

    // Cleanup helper
    const clearAllLines = () => {
        for (const line of mainLinesRef.current) {
            try { series?.removePriceLine(line); } catch (_) { /* already gone */ }
        }
        for (const line of zoneTopLinesRef.current) {
            try { series?.removePriceLine(line); } catch (_) { /* already gone */ }
        }
        for (const line of zoneBotLinesRef.current) {
            try { series?.removePriceLine(line); } catch (_) { /* already gone */ }
        }
        mainLinesRef.current  = [];
        zoneTopLinesRef.current = [];
        zoneBotLinesRef.current = [];
    };

    useEffect(() => {
        // Always clear previous lines first
        clearAllLines();

        if (!series || !chart || !visible || !data || data.levels.length === 0) return;

        for (const level of data.levels) {
            const colors = getLevelColor(level);
            const lw     = getLineWidth(level.strength);
            const ls     = getLineStyle(level);

            // Build axis label text
            let labelText = '';
            if (showLabels) {
                const typeTag  = level.type === 'resistance' ? 'R' : 'S';
                const strTag   = level.strength === 'ultra'    ? '★★★' :
                                 level.strength === 'strong'   ? '★★'  :
                                 level.strength === 'moderate' ? '★'   : '·';
                const brokenTag = level.isBroken ? ' [X]' : '';
                labelText = `${typeTag}${strTag} ×${level.touchCount}${brokenTag}`;
            }

            // ── Main S/R line ────────────────────────────────────────────────
            try {
                const mainLine = series.createPriceLine({
                    price: level.price,
                    color: colors.line,
                    lineWidth: lw,
                    lineStyle: ls,
                    axisLabelVisible: showLabels,
                    title: labelText,
                });
                mainLinesRef.current.push(mainLine);
            } catch (e) {
                console.warn('[WickSRRenderer] Failed to create main line:', e);
            }

            // ── Zone lines (top & bottom of ATR band) ────────────────────────
            if (showZones && !level.isBroken) {
                try {
                    const topLine = series.createPriceLine({
                        price: level.zone.top,
                        color: colors.zone.replace('0.08', '0.25'),
                        lineWidth: 1,
                        lineStyle: LineStyle.Dotted,
                        axisLabelVisible: false,
                        title: '',
                    });
                    zoneTopLinesRef.current.push(topLine);
                } catch (_) { /* ignore */ }

                try {
                    const botLine = series.createPriceLine({
                        price: level.zone.bottom,
                        color: colors.zone.replace('0.08', '0.25'),
                        lineWidth: 1,
                        lineStyle: LineStyle.Dotted,
                        axisLabelVisible: false,
                        title: '',
                    });
                    zoneBotLinesRef.current.push(botLine);
                } catch (_) { /* ignore */ }
            }
        }

        // Cleanup on unmount or before next render
        return clearAllLines;
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [data, visible, showZones, showLabels, series]);

    // Nothing to render in DOM — all drawing is via lightweight-charts price lines
    return null;
};
