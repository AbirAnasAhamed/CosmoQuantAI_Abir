import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { SupertrendDataPoint } from '../../../utils/indicators';

interface SupertrendRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: SupertrendDataPoint[];
    ohlcData: { time: any; high: number; low: number; close: number; open: number }[];
    showSignals: boolean;
    highlighter: boolean;
}

export const SupertrendRenderer: React.FC<SupertrendRendererProps> = ({
    chart,
    series,
    data,
    ohlcData,
    showSignals,
    highlighter
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawSupertrend();
            });
        }
    }, [chart, series, data, ohlcData, showSignals, highlighter]);

    const drawSupertrend = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!chart || !series || data.length === 0) return;

        const timeScale = chart.timeScale();
        const priceScale = series.priceScale();
        if (!timeScale || !priceScale) return;

        const parent = canvas.parentElement;
        if (parent) {
            if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
            if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
        }

        const logicalRange = timeScale.getVisibleLogicalRange();
        if (!logicalRange) return;

        const getX = (time: any) => timeScale.timeToCoordinate(time);

        // --- 1. Draw Trend Lines and Highlighter ---
        for (let i = 0; i < data.length - 1; i++) {
            const pt1 = data[i];
            const pt2 = data[i + 1];

            // Skip points not in visible range for performance (optional, lightweight-charts handle some of this but canvas needs help)
            const x1 = getX(pt1.time);
            const x2 = getX(pt2.time);
            if (x1 === null || x2 === null) continue;
            if (x2 < 0 || x1 > canvas.width) continue;

            const isUp = pt2.trend === 1;
            const color = isUp ? '#22c55e' : '#ef4444'; // Green / Red

            // Only draw if trend is the same between points to avoid diagonal transition lines
            if (pt1.trend === pt2.trend) {
                const y1 = series.priceToCoordinate(pt1.value);
                const y2 = series.priceToCoordinate(pt2.value);
                if (y1 !== null && y2 !== null) {
                    // Line
                    ctx.beginPath();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    ctx.moveTo(x1, y1);
                    ctx.lineTo(x2, y2);
                    ctx.stroke();

                    // Highlighter (Area fill between Supertrend and OHLC4)
                    if (highlighter) {
                        const ohlc1 = ohlcData.find(d => d.time === pt1.time);
                        const ohlc2 = ohlcData.find(d => d.time === pt2.time);
                        if (ohlc1 && ohlc2) {
                            const p1 = (ohlc1.high + ohlc1.low + ohlc1.close + ohlc1.open) / 4;
                            const p2 = (ohlc2.high + ohlc2.low + ohlc2.close + ohlc2.open) / 4;
                            const py1 = series.priceToCoordinate(p1);
                            const py2 = series.priceToCoordinate(p2);

                            if (py1 !== null && py2 !== null) {
                                ctx.beginPath();
                                ctx.fillStyle = isUp ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                                ctx.moveTo(x1, y1);
                                ctx.lineTo(x2, y2);
                                ctx.lineTo(x2, py2);
                                ctx.lineTo(x1, py1);
                                ctx.closePath();
                                ctx.fill();
                            }
                        }
                    }
                }
            }
        }

        // --- 2. Draw Buy/Sell Signals ---
        if (showSignals) {
            data.forEach((pt, i) => {
                if (!pt.isBuy && !pt.isSell) return;

                const x = getX(pt.time);
                if (x === null || x < 0 || x > canvas.width) return;

                const ohlc = ohlcData.find(d => d.time === pt.time);
                if (!ohlc) return;

                if (pt.isBuy) {
                    const y = series.priceToCoordinate(ohlc.low);
                    if (y === null) return;

                    const buyY = y + 100; // Increased to 100 pixels
                    const width = 45;
                    const height = 22;
                    const radius = 6;

                    // Draw Dotted Line
                    ctx.beginPath();
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = 'rgba(34, 197, 94, 0.4)';
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, buyY);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset line dash

                    // Shadow/Glow
                    ctx.shadowColor = 'rgba(34, 197, 94, 0.5)';
                    ctx.shadowBlur = 10;

                    // Draw Pill
                    ctx.beginPath();
                    ctx.roundRect(x - width / 2, buyY, width, height, radius);
                    ctx.fillStyle = '#22c55e';
                    ctx.fill();

                    // Reset Shadow
                    ctx.shadowBlur = 0;

                    // Draw Arrow Icon (Triangle)
                    ctx.beginPath();
                    ctx.moveTo(x - 12, buyY + 14);
                    ctx.lineTo(x - 8, buyY + 8);
                    ctx.lineTo(x - 4, buyY + 14);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    // Draw Text
                    ctx.font = 'bold 11px Inter, sans-serif';
                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'left';
                    ctx.fillText('BUY', x, buyY + 15);
                } else if (pt.isSell) {
                    const y = series.priceToCoordinate(ohlc.high);
                    if (y === null) return;

                    const sellY = y - 100; // Increased to 100 pixels
                    const width = 45;
                    const height = 22;
                    const radius = 6;

                    // Draw Dotted Line
                    ctx.beginPath();
                    ctx.setLineDash([3, 3]);
                    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
                    ctx.moveTo(x, y);
                    ctx.lineTo(x, sellY + height);
                    ctx.stroke();
                    ctx.setLineDash([]); // Reset line dash

                    // Shadow/Glow
                    ctx.shadowColor = 'rgba(239, 68, 68, 0.5)';
                    ctx.shadowBlur = 10;

                    // Draw Pill
                    ctx.beginPath();
                    ctx.roundRect(x - width / 2, sellY, width, height, radius);
                    ctx.fillStyle = '#ef4444';
                    ctx.fill();

                    // Reset Shadow
                    ctx.shadowBlur = 0;

                    // Draw Arrow Icon (Triangle Down)
                    ctx.beginPath();
                    ctx.moveTo(x - 12, sellY + 8);
                    ctx.lineTo(x - 8, sellY + 14);
                    ctx.lineTo(x - 4, sellY + 8);
                    ctx.fillStyle = 'white';
                    ctx.fill();

                    // Draw Text
                    ctx.font = 'bold 11px Inter, sans-serif';
                    ctx.fillStyle = 'white';
                    ctx.textAlign = 'left';
                    ctx.fillText('SELL', x, sellY + 15);
                }
            });
        }

    }, [chart, series, data, ohlcData, showSignals, highlighter]);

    useEffect(() => {
        if (!chart || !series) return;
        requestDraw();
        const timeScale = chart.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        chart.subscribeCrosshairMove(requestDraw);
        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
            chart.unsubscribeCrosshairMove(requestDraw);
        };
    }, [chart, series, requestDraw]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ zIndex: 1 }}
        />
    );
};
