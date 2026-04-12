import React, { useEffect, useRef, useCallback } from 'react';
import type { IChartApi, ISeriesApi } from 'lightweight-charts';
import { ICTResult } from '../../../utils/ictKillzones';

interface ICTKillzonesRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: ICTResult | null;
    visible: boolean;
    settings: any; // Using any for now to simplify
}

export const ICTKillzonesRenderer: React.FC<ICTKillzonesRendererProps> = ({
    chart,
    series,
    data,
    visible,
    settings,
}) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const animFrameRef = useRef<number>(0);

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
        const W = el.offsetWidth;
        const H = el.offsetHeight;
        if (!W || !H) return;

        /** Convert unix timestamp (ms) to pixel X */
        const toX = (time: number): number | null => {
            try {
                // Ensure time is in seconds for lightweight-charts
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

        // ── Drawing Helpers ──────────────────────────────────────────────────

        /** Helper to convert hex to rgba */
        const hexToRgba = (hex: string, alpha: number) => {
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            return `rgba(${r}, ${g}, ${b}, ${alpha})`;
        };

        const drawBox = (x1: number, y1: number, x2: number, y2: number, bg: string, border: string = 'transparent', text?: string) => {
            const left = Math.max(0, Math.min(x1, x2));
            const top = Math.max(0, Math.min(y1, y2));
            const width = Math.abs(x2 - x1);
            const height = Math.abs(y2 - y1);
            if (width < 1 || height < 1) return;

            const div = document.createElement('div');
            div.style.cssText = `
                position:absolute;
                left:${left}px;top:${top}px;
                width:${Math.min(width, W - left)}px;
                height:${Math.min(height, H - top)}px;
                background:${bg};
                border:1px solid ${border};
                pointer-events:none;
                box-sizing:border-box;
                display:flex;
                align-items:center;
                justify-content:center;
                overflow:hidden;
            `;
            
            if (text) {
                const span = document.createElement('span');
                span.innerText = text;
                span.style.cssText = `
                    color:rgba(255,255,255,0.4);
                    font-size:10px;
                    font-weight:bold;
                    text-transform:uppercase;
                    white-space:nowrap;
                `;
                div.appendChild(span);
            }
            
            el.appendChild(div);
        };

        const drawLine = (x1: number, y1: number, x2: number, y2: number, color: string, style: 'solid' | 'dashed' | 'dotted' = 'solid', width: number = 1, label?: string) => {
            const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            svg.style.cssText = `position:absolute;left:0;top:0;width:${W}px;height:${H}px;pointer-events:none;overflow:visible`;
            
            const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
            line.setAttribute('x1', String(x1));
            line.setAttribute('y1', String(y1));
            line.setAttribute('x2', String(x2));
            line.setAttribute('y2', String(y2));
            line.setAttribute('stroke', color);
            line.setAttribute('stroke-width', String(width));
            
            if (style === 'dashed') line.setAttribute('stroke-dasharray', '4,4');
            if (style === 'dotted') line.setAttribute('stroke-dasharray', '2,2');
            
            svg.appendChild(line);
            el.appendChild(svg);

            if (label) {
                const span = document.createElement('span');
                span.innerText = label;
                span.style.cssText = `
                    position:absolute;
                    left:${x2 + 4}px;
                    top:${y2}px;
                    color:${color};
                    font-size:9px;
                    font-weight:bold;
                    text-shadow:0 0 4px rgba(0,0,0,1);
                    transform:translateY(-50%);
                    white-space:nowrap;
                `;
                el.appendChild(span);
            }
        };

        // ── 1. Killzone Boxes ────────────────────────────────────────────────
        data.killzones.forEach(kz => {
            const x1 = toX(kz.startTime);
            const x2 = toX(kz.endTime || Date.now());
            const y1 = toY(kz.high);
            const y2 = toY(kz.low);
            if (x1 === null || x2 === null || y1 === null || y2 === null) return;
            
            drawBox(x1, y1, x2, y2, hexToRgba(kz.color, 0.15), kz.color, kz.name);

            // ── 1.a Equilibrium Line ──────────────────────────────────────────
            if (settings.ictShowEquilibrium) {
                const midPrice = (kz.high + kz.low) / 2;
                const yMid = toY(midPrice);
                if (yMid !== null) {
                    // Draw a dashed midline across the box
                    const div = document.createElement('div');
                    div.style.cssText = `
                        position:absolute;
                        left:${Math.max(0, Math.min(x1, x2))}px;
                        top:${yMid}px;
                        width:${Math.abs(x2 - x1)}px;
                        height:1px;
                        border-top:1px dashed ${hexToRgba(kz.color, 0.5)};
                        pointer-events:none;
                    `;
                    containerRef.current?.appendChild(div);
                }
            }
        });

        // ── 2. Pivot Lines ───────────────────────────────────────────────────
        if (settings.ictShowPivots) {
            data.pivots.forEach(p => {
                const x1 = toX(p.time);
                const x2 = toX(p.endTime || Date.now()) ?? W;
                const y = toY(p.price);
                if (x1 === null || y === null) return;

                const labelText = `${p.sessionName.slice(0, 2)}.${p.type === 'high' ? 'H' : 'L'}`;
                drawLine(x1, y, x2, y, p.color, p.isMitigated ? 'dotted' : 'solid', 1, labelText);
            });
        }

        // ── 3. DWM Open & HL ────────────────────────────────────────────────
        if (settings.ictShowDWM && data.dwm) {
             const { dayOpen, dayHigh, dayLow } = data.dwm;
             if (dayOpen) {
                 const x1 = 0; // Since it's for the current day
                 const x2 = W;
                 const y = toY(dayOpen);
                 if (y !== null) drawLine(x1, y, x2, y, '#3b82f6', 'dashed', 1, 'D. OPEN');
             }
        }

        // ── 3.a Silver Bullets ──────────────────────────────────────────────
        if (settings.ictShowSilverBullet && data.silverBullets) {
            data.silverBullets.forEach(sb => {
                const x1 = toX(sb.startTime);
                const x2 = toX(sb.endTime || Date.now());
                const y1 = toY(sb.high);
                const y2 = toY(sb.low);
                if (x1 === null || x2 === null || y1 === null || y2 === null) return;
                
                // Silver bullets are drawn with a distinct gold color and border
                drawBox(x1, y1, x2, y2, hexToRgba('#ffd700', 0.1), '#ffd700', sb.name);
            });
        }

        // ── 3.b Opening Gaps (NDOG / NWOG) ──────────────────────────────────
        if (settings.ictShowGaps && data.gaps) {
            data.gaps.forEach(gap => {
                const x = toX(gap.time);
                const y = toY(gap.price);
                if (x !== null && y !== null) {
                    // Draw a line connecting across the screen from the point
                    drawLine(x, y, W, y, gap.color, 'solid', 2, gap.type);
                }
            });
        }

        // ── 4. Opening Prices (Special Logs) ────────────────────────────────
        if (settings.ictShowOpeningPrices) {
            data.openingPrices.forEach(op => {
                const x = toX(op.time);
                const y = toY(op.price);
                if (x !== null && y !== null) {
                    drawLine(x, y, W, y, op.color, 'dotted', 1, op.label);
                }
            });
        }

        // ── 5. Vertical Timestamps ──────────────────────────────────────────
        if (settings.ictShowTimestamps) {
            data.timestamps.forEach(ts => {
                const x = toX(ts.time);
                if (x !== null) {
                    drawLine(x, 0, x, H, ts.color, 'dashed', 1);
                }
            });
        }

        // ── 6. Day Labels ──────────────────────────────────────────────────
        data.dayLabels.forEach(dl => {
            const x = toX(dl.time);
            if (x === null) return;

            const span = document.createElement('span');
            span.innerText = dl.text;
            span.style.cssText = `
                position:absolute;
                left:${x}px;
                bottom:20px;
                color:rgba(255,255,255,0.2);
                font-size:12px;
                font-weight:900;
                transform:translateX(-50%);
                letter-spacing:0.2em;
            `;
            el.appendChild(span);
        });

    }, [chart, series, data, visible, settings]);

    // Render loop
    useEffect(() => {
        if (!chart) return;
        const update = () => {
            cancelAnimationFrame(animFrameRef.current);
            animFrameRef.current = requestAnimationFrame(render);
        };
        update();
        chart.timeScale().subscribeVisibleTimeRangeChange(update);
        return () => {
            cancelAnimationFrame(animFrameRef.current);
            chart.timeScale().unsubscribeVisibleTimeRangeChange(update);
        };
    }, [chart, render]);

    return (
        <div ref={containerRef} style={{ position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 4 }} />
    );
};
