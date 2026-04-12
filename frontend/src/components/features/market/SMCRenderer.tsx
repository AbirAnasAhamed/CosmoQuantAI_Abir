import React, { useEffect, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import type { SMCResult, SMCSettings } from '../../../utils/smartMoneyConcepts';

// ─── Color Palette ─────────────────────────────────────────────────────────────
const COLORS = {
    bullish: '#089981',
    bearish: '#F23645',
    neutral: '#878b94',
    monoBull: '#b2b5be',
    monoBear: '#5d606b',
    intBullOB: 'rgba(49, 121, 245, 0.18)',
    intBearOB: 'rgba(247, 124, 128, 0.18)',
    swBullOB: 'rgba(24, 72, 204, 0.22)',
    swBearOB: 'rgba(178, 40, 51, 0.22)',
    fvgBull: 'rgba(0, 255, 104, 0.13)',
    fvgBear: 'rgba(255, 0, 8, 0.13)',
    premium: 'rgba(242, 54, 69, 0.08)',
    discount: 'rgba(8, 153, 129, 0.08)',
    equilibrium: 'rgba(135, 139, 148, 0.18)',
};

interface SMCRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: SMCResult | null;
    settings: SMCSettings;
    visible: boolean;
}

/**
 * Renders Smart Money Concepts overlays on top of a lightweight-charts canvas.
 * Uses absolutely-positioned DOM elements converted from price/time coordinates.
 */
export const SMCRenderer: React.FC<SMCRendererProps> = ({
    chart,
    series,
    data,
    settings,
    visible,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const animFrameRef = useRef<number>(0);

    const getColor = useCallback((type: 'bull' | 'bear', mono: boolean) => {
        if (mono) return type === 'bull' ? COLORS.monoBull : COLORS.monoBear;
        return type === 'bull' ? COLORS.bullish : COLORS.bearish;
    }, []);

    const isMono = settings.style === 'Monochrome';

    const render = useCallback(() => {
        if (!containerRef.current || !chart || !data || !visible) {
            if (containerRef.current) containerRef.current.innerHTML = '';
            return;
        }

        const el = containerRef.current;
        el.innerHTML = ''; // Clear previous draw

        const chartRect = (chart as any).chartElement?.()?.getBoundingClientRect?.() ??
            el.parentElement?.getBoundingClientRect();
        if (!chartRect) return;

        const timeScale = chart.timeScale();

        /** Convert unix timestamp (seconds or ms) to pixel X */
        const toX = (time: number): number | null => {
            try {
                const t = time < 10_000_000_000 ? time : Math.floor(time / 1000);
                return timeScale.timeToCoordinate(t as any);
            } catch {
                return null;
            }
        };

        /** Convert price to pixel Y */
        const toY = (price: number): number | null => {
            try {
                return series?.priceToCoordinate(price) ?? null;
            } catch {
                return null;
            }
        };

        const W = el.offsetWidth;
        const H = el.offsetHeight;
        if (!W || !H) return;

        // ── Helpers ────────────────────────────────────────────────────────────

        /** Draw an absolutely-positioned box */
        const drawBox = (
            x1: number, y1: number, x2: number, y2: number,
            bg: string, border: string = 'transparent', borderWidth: number = 0
        ) => {
            const left = Math.max(0, Math.min(x1, x2));
            const top = Math.max(0, Math.min(y1, y2));
            const width = Math.abs(x2 - x1);
            const height = Math.abs(y2 - y1);
            if (width < 1 || height < 1) return null;

            const div = document.createElement('div');
            div.style.cssText = `
                position:absolute;
                left:${left}px;top:${top}px;
                width:${Math.min(width, W - left)}px;
                height:${Math.min(height, H - top)}px;
                background:${bg};
                border:${borderWidth}px solid ${border};
                pointer-events:none;
                box-sizing:border-box;
            `;
            el.appendChild(div);
            return div;
        };

        /** Draw a horizontal label */
        const drawLabel = (
            x: number, y: number,
            text: string, color: string,
            align: 'left' | 'center' | 'right' = 'center',
            yOffset: number = 0,
            fontSize: number = 9,
            fontWeight: string = 'bold',
        ) => {
            if (x < 0 || x > W || y < 0 || y > H) return;
            const span = document.createElement('span');
            span.innerText = text;
            span.style.cssText = `
                position:absolute;
                left:${align === 'right' ? x - 60 : x}px;
                top:${y + yOffset}px;
                color:${color};
                font-size:${fontSize}px;
                font-weight:${fontWeight};
                font-family:monospace;
                pointer-events:none;
                user-select:none;
                white-space:nowrap;
                text-shadow:0 0 6px rgba(0,0,0,0.9);
                transform:translateY(-50%);
            `;
            el.appendChild(span);
        };

        /** Draw an SVG line (for EQH/EQL) */
        const drawLine = (
            x1: number, y1: number, x2: number, y2: number,
            color: string, dashed: boolean = false, width: number = 1
        ) => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;overflow:visible`;
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(x1));
            line.setAttribute('y1', String(y1));
            line.setAttribute('x2', String(x2));
            line.setAttribute('y2', String(y2));
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', String(width));
            if (dashed) line.setAttribute('stroke-dasharray', '4,4');
            svg.appendChild(line);
            el.appendChild(svg);
        };

        // ── 1. Order Blocks ────────────────────────────────────────────────────
        if (settings.showInternalOB) {
            data.internalOrderBlocks.slice(0, settings.internalOBCount).forEach(ob => {
                const x1 = toX(ob.barTime);
                const x2 = toX(ob.toTime) ?? W;
                const y1 = toY(ob.barHigh);
                const y2 = toY(ob.barLow);
                if (x1 === null || y1 === null || y2 === null) return;
                
                let bg, border, borderWidth;
                if (ob.isValidated) {
                    bg = ob.bias === 'bearish' ? 'rgba(255, 0, 8, 0.25)' : 'rgba(0, 255, 104, 0.25)';
                    border = ob.bias === 'bearish' ? '#FF0008' : '#00FF68';
                    borderWidth = 1.5;
                } else if (ob.isValidated === false) {
                    bg = isMono ? 'rgba(150,150,150,0.05)' : (ob.bias === 'bearish' ? 'rgba(247, 124, 128, 0.05)' : 'rgba(49, 121, 245, 0.05)');
                    border = 'transparent';
                    borderWidth = 0;
                } else {
                    bg = isMono
                        ? (ob.bias === 'bearish' ? 'rgba(93,96,107,0.2)' : 'rgba(178,181,190,0.2)')
                        : (ob.bias === 'bearish' ? COLORS.intBearOB : COLORS.intBullOB);
                    border = 'transparent';
                    borderWidth = 0;
                }
                
                const div = drawBox(x1, y1, x2, y2, bg, border, borderWidth);
                if (div && ob.isValidated) div.style.boxShadow = `0 0 8px ${border}`;
                
                // OB label at right edge
                const xRight = Math.min(x2, W - 30);
                const yMid = (y1 + y2) / 2;
                const labelText = ob.isValidated ? (ob.bias === 'bullish' ? 'Valid OB' : 'Valid OB') : (ob.bias === 'bullish' ? 'Bull OB' : 'Bear OB');
                drawLabel(xRight - 28, yMid, labelText,
                    ob.isValidated ? border : getColor(ob.bias === 'bullish' ? 'bull' : 'bear', isMono), 'right', 0, 8);
            });
        }

        if (settings.showSwingOB) {
            data.swingOrderBlocks.slice(0, settings.swingOBCount).forEach(ob => {
                const x1 = toX(ob.barTime);
                const x2 = toX(ob.toTime) ?? W;
                const y1 = toY(ob.barHigh);
                const y2 = toY(ob.barLow);
                if (x1 === null || y1 === null || y2 === null) return;
                
                let bg, border, borderWidth = 1;
                if (ob.isValidated) {
                    bg = ob.bias === 'bearish' ? 'rgba(255, 0, 8, 0.3)' : 'rgba(0, 255, 104, 0.3)';
                    border = ob.bias === 'bearish' ? '#FF0008' : '#00FF68';
                    borderWidth = 2;
                } else if (ob.isValidated === false) {
                    bg = isMono ? 'rgba(150,150,150,0.1)' : (ob.bias === 'bearish' ? 'rgba(178, 40, 51, 0.1)' : 'rgba(24, 72, 204, 0.1)');
                    border = isMono ? 'rgba(150,150,150,0.5)' : (ob.bias === 'bearish' ? 'rgba(178, 40, 51, 0.5)' : 'rgba(24, 72, 204, 0.5)');
                } else {
                    bg = isMono
                        ? (ob.bias === 'bearish' ? 'rgba(93,96,107,0.25)' : 'rgba(178,181,190,0.25)')
                        : (ob.bias === 'bearish' ? COLORS.swBearOB : COLORS.swBullOB);
                    border = isMono
                        ? (ob.bias === 'bearish' ? '#5d606b' : '#b2b5be')
                        : (ob.bias === 'bearish' ? '#b22833' : '#1848cc');
                }
                
                const div = drawBox(x1, y1, x2, y2, bg, border, borderWidth);
                if (div && ob.isValidated) div.style.boxShadow = `0 0 12px ${border}`;
                const xRight = Math.min(x2, W - 30);
                const yMid = (y1 + y2) / 2;
                const labelText = ob.isValidated ? 'OB +' : (ob.bias === 'bullish' ? 'OB ▲' : 'OB ▼');
                drawLabel(xRight - 28, yMid, labelText,
                    ob.isValidated ? border : getColor(ob.bias === 'bullish' ? 'bull' : 'bear', isMono), 'right', 0, 8, '900');
            });
        }

        // ── 2. BOS / CHoCH Structure Labels ────────────────────────────────────
        data.structureEvents.forEach(ev => {
            const x1 = toX(ev.fromTime);
            const x2 = toX(ev.toTime);
            const y = toY(ev.level);
            if (x1 === null || x2 === null || y === null) return;

            let color = getColor(ev.bias === 'bullish' ? 'bull' : 'bear', isMono);
            let displayType: string = ev.type;
            let displayWeight = 'bold';
            
            if (ev.isTrap) {
                color = '#FFA500'; // Orange Trap color
                displayType = `TRAP ${ev.bias === 'bullish' ? '▲' : '▼'}`;
                displayWeight = '900';
            }

            const xMid = (x1 + x2) / 2;
            const yOffset = ev.bias === 'bullish' ? -14 : 4;

            // Horizontal line
            drawLine(x1, y, x2, y, color, ev.isInternal, ev.isTrap ? 2 : (ev.isInternal ? 1 : 1.5));

            // Label
            const fontSize = ev.isInternal ? 9 : 10;
            drawLabel(xMid, y, displayType, color, 'center', yOffset, fontSize, displayWeight);
        });

        // ── 3. Equal Highs / Lows ──────────────────────────────────────────────
        if (settings.showEqualHL) {
            data.equalHighsLows.forEach(eq => {
                const x1 = toX(eq.fromTime);
                const x2 = toX(eq.toTime);
                const y = toY(eq.level);
                if (x1 === null || x2 === null || y === null) return;

                const color = eq.type === 'EQH'
                    ? getColor('bear', isMono)
                    : getColor('bull', isMono);
                const xMid = (x1 + x2) / 2;
                let yOffset = eq.type === 'EQH' ? -13 : 3;

                drawLine(x1, y, x2, y, color, true, 1);
                drawLabel(xMid, y, eq.type, color, 'center', yOffset, 9);
                
                if (eq.isSweep) {
                    const sweepColor = '#9400D3'; // Purple Inst. Sweep
                    yOffset += (eq.type === 'EQH' ? -12 : 12);
                    drawLabel(xMid, y, 'Inst. Sweep', sweepColor, 'center', yOffset, 10, '900');
                    drawLine(xMid - 20, y, xMid + 20, y, sweepColor, false, 2.5);
                }
            });
        }

        // ── 4. Fair Value Gaps ─────────────────────────────────────────────────
        if (settings.showFVG) {
            data.fairValueGaps.forEach(fvg => {
                const x1 = toX(fvg.startTime);
                let x2 = toX(fvg.endTime);

                if (x1 === null || x2 === null) return;

                // Extend by fvgExtendBars pixels (approximation)
                const barWidthApprox = 8;
                x2 = Math.min(W, x2 + settings.fvgExtendBars * barWidthApprox);

                const yTop = toY(fvg.top);
                const yMid = toY(fvg.midpoint);
                const yBot = toY(fvg.bottom);
                if (yTop === null || yMid === null || yBot === null) return;

                const bg = fvg.bias === 'bullish' ? COLORS.fvgBull : COLORS.fvgBear;
                const border = fvg.bias === 'bullish'
                    ? (isMono ? COLORS.monoBull : COLORS.bullish)
                    : (isMono ? COLORS.monoBear : COLORS.bearish);

                // Two sub-boxes (top half and bottom half) to match Pine's display
                drawBox(x1, yTop, x2, yMid, bg, border, 0.5);
                drawBox(x1, yMid, x2, yBot, bg, border, 0.5);

                // Micro Imbalances Check
                if (fvg.microImbalances && fvg.microImbalances.length > 0) {
                    const intenseBg = fvg.bias === 'bullish' ? '#00FF68' : '#FF0008';
                    fvg.microImbalances.forEach(price => {
                        const tickY = toY(price);
                        if (tickY !== null) {
                            drawBox(x1, tickY - 0.5, x2, tickY + 0.5, intenseBg, 'transparent', 0);
                        }
                    });
                }

                // Small FVG label
                const xMid = (x1 + x2) / 2;
                const yCenter = (yTop + yBot) / 2;
                drawLabel(xMid, yCenter, 'FVG', border, 'center', 0, 8, '700');
            });
        }

        // ── 5. Swing Candlestick Patterns ──────────────────────────────────────
        if (settings.smcShowSwingPatterns && data.swingPatterns) {
            data.swingPatterns.forEach(pat => {
                const x = toX(pat.time);
                const y = toY(pat.level);
                if (x === null || y === null) return;

                const isBullish = pat.type === 'bullish';
                const isBearish = pat.type === 'bearish';
                
                const color = isBullish 
                    ? getColor('bull', isMono) 
                    : (isBearish ? getColor('bear', isMono) : '#888888');

                // If it's a bullish pattern at a swing low, draw below the wick.
                // If it's a bearish pattern at a swing high, draw above the wick.
                const yOffset = isBullish ? 16 : -24;

                drawLabel(x, y, pat.patternName, color, 'center', yOffset, 10, 'bold');
            });
        }

        // ── 6. Premium / Discount Zones ────────────────────────────────────────
        if (settings.showPDZones && data.zones) {
            const z = data.zones;
            const xStart = toX(z.startTime);
            if (xStart !== null) {
                const xEnd = W;
                const yTop = toY(z.top);
                const yEqTop = toY(z.top * 0.95 + z.bottom * 0.05);
                const yEqHi = toY(z.top * 0.525 + z.bottom * 0.475);
                const yEqLo = toY(z.top * 0.475 + z.bottom * 0.525);
                const yEqBot = toY(z.top * 0.05 + z.bottom * 0.95);
                const yBot = toY(z.bottom);
                const yEq = toY(z.equilibrium);

                if (yTop !== null && yEqTop !== null) {
                    drawBox(xStart, yTop, xEnd, yEqTop, COLORS.premium);
                    drawLabel(xEnd - 60, (yTop + yEqTop) / 2, 'Premium', isMono ? COLORS.monoBear : COLORS.bearish, 'right', 0, 9);
                }
                if (yEqHi !== null && yEqLo !== null) {
                    drawBox(xStart, yEqHi, xEnd, yEqLo, COLORS.equilibrium);
                    if (yEq !== null) drawLabel(xEnd - 60, yEq, 'Equilibrium', COLORS.neutral, 'right', 0, 9);
                }
                if (yEqBot !== null && yBot !== null) {
                    drawBox(xStart, yEqBot, xEnd, yBot, COLORS.discount);
                    drawLabel(xEnd - 60, (yEqBot + yBot) / 2, 'Discount', isMono ? COLORS.monoBull : COLORS.bullish, 'right', 0, 9);
                }
            }
        }

        // ── 6. Strong / Weak High / Low ────────────────────────────────────────
        if (settings.showStrongWeakHL && data.trailingExtreme) {
            const te = data.trailingExtreme;
            const bullColor = getColor('bull', isMono);
            const bearColor = getColor('bear', isMono);

            const xTopStart = toX(te.lastTopTime);
            const xBotStart = toX(te.lastBottomTime);
            const yTop = toY(te.top);
            const yBot = toY(te.bottom);

            if (xTopStart !== null && yTop !== null) {
                drawLine(xTopStart, yTop, W, yTop, bearColor, false, 1.5);
                drawLabel(W - 70, yTop,
                    data.swingBias === 'bearish' ? 'Strong High' : 'Weak High',
                    bearColor, 'right', -10, 9, '700');
            }
            if (xBotStart !== null && yBot !== null) {
                drawLine(xBotStart, yBot, W, yBot, bullColor, false, 1.5);
                drawLabel(W - 70, yBot,
                    data.swingBias === 'bullish' ? 'Strong Low' : 'Weak Low',
                    bullColor, 'right', 2, 9, '700');
            }
        }

    }, [chart, series, data, settings, visible, isMono, getColor]);

    // Re-render on scroll/zoom
    useEffect(() => {
        if (!chart) return;

        const scheduleRender = () => {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = requestAnimationFrame(render);
        };

        scheduleRender();

        chart.timeScale().subscribeVisibleTimeRangeChange(scheduleRender);
        chart.timeScale().subscribeVisibleLogicalRangeChange(scheduleRender);

        return () => {
            cancelAnimationFrame(animFrameRef.current);
            chart.timeScale().unsubscribeVisibleTimeRangeChange(scheduleRender);
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(scheduleRender);
        };
    }, [chart, render]);

    // Re-render when data changes
    useEffect(() => {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = requestAnimationFrame(render);
        return () => cancelAnimationFrame(animFrameRef.current);
    }, [render]);

    return (
        <div
            ref={containerRef}
            style={{
                position: 'absolute',
                inset: 0,
                pointerEvents: 'none',
                zIndex: 5,
                overflow: 'hidden',
            }}
        />
    );
};
