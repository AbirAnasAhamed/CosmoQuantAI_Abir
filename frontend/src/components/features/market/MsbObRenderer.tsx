import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { MsbObResult } from '../../../utils/indicators';

interface MsbObRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: MsbObResult;
    ohlcData: { time: any; high: number; low: number; close: number; open: number }[];
    showZigzag: boolean;
}

export const MsbObRenderer: React.FC<MsbObRendererProps> = ({
    chart,
    series,
    data,
    ohlcData,
    showZigzag
}) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawMsbOb();
            });
        }
    }, [chart, series, data, ohlcData, showZigzag]);

    const drawMsbOb = useCallback(() => {
        if (!canvasRef.current || !chart || !series || data.points.length === 0) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        
        // Handle resizing
        const parent = canvas.parentElement;
        if (parent) {
            if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
            if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
        }

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const timeScale = chart.timeScale();
        const priceScale = series.priceScale();
        if (!timeScale || !priceScale) return;

        const getX = (time: any) => timeScale.timeToCoordinate(time);
        const getY = (price: number) => series.priceToCoordinate(price);

        // --- 1. Draw ZigZag ---
        if (showZigzag) {
            let lastX: number | null = null;
            let lastY: number | null = null;

            ctx.beginPath();
            ctx.setLineDash([2, 4]);
            ctx.strokeStyle = '#f97316'; // Orange-500
            ctx.lineWidth = 1;

            data.points.forEach((pt) => {
                if (pt.zigzagPrice !== null) {
                    const x = getX(pt.time);
                    const y = getY(pt.zigzagPrice);
                    if (x !== null && y !== null) {
                        if (lastX !== null && lastY !== null) {
                            ctx.moveTo(lastX, lastY);
                            ctx.lineTo(x, y);
                        }
                        lastX = x;
                        lastY = y;
                    }
                }
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }

        // --- 2. Draw Zones (OB/BB) ---
        data.zones.forEach((zone) => {
            const startX = getX(ohlcData[zone.startX]?.time);
            const endX = getX(ohlcData[Math.min(zone.endX, ohlcData.length - 1)]?.time) || canvas.width + 50;
            const topY = getY(zone.top);
            const bottomY = getY(zone.bottom);

            if (startX !== null && topY !== null && bottomY !== null) {
                const isBull = zone.type.startsWith('Bu');
                const bgColor = isBull ? 'rgba(34, 197, 94, 0.15)' : 'rgba(239, 68, 68, 0.15)';
                const borderColor = isBull ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)';
                const textColor = isBull ? '#22c55e' : '#ef4444';

                const width = endX - startX;
                const height = bottomY - topY;

                // Box
                ctx.fillStyle = bgColor;
                ctx.fillRect(startX, topY, width, height);
                ctx.strokeStyle = borderColor;
                ctx.lineWidth = 1;
                ctx.strokeRect(startX, topY, width, height);

                // Label
                ctx.font = 'bold 9px Inter, sans-serif';
                ctx.fillStyle = textColor;
                ctx.textAlign = 'right';
                ctx.fillText(zone.type, Math.min(canvas.width - 5, endX - 2), topY + 12);
            }
        });

        // --- 3. Draw MSB Labels & Lines ---
        data.points.forEach((pt, i) => {
            if (pt.msbType && pt.msbPrice !== null) {
                const x = getX(pt.time);
                const y = getY(pt.msbPrice);
                
                if (x !== null && y !== null) {
                    const isBull = pt.msbType === 'Bullish';
                    const color = isBull ? '#22c55e' : '#ef4444';

                    // MSB Horizontal Line
                    ctx.beginPath();
                    ctx.strokeStyle = color;
                    ctx.lineWidth = 2;
                    // Start line from previous point or a bit back
                    const startX = getX(ohlcData[Math.max(0, i - 10)]?.time) || x - 50;
                    ctx.moveTo(startX, y);
                    ctx.lineTo(x, y);
                    ctx.stroke();

                    // MSB Label
                    ctx.font = 'bold 10px Inter, sans-serif';
                    ctx.fillStyle = color;
                    ctx.textAlign = 'center';
                    const labelY = isBull ? y - 15 : y + 25;
                    ctx.fillText('MSB', x, labelY);
                }
            }
        });

    }, [chart, series, data, ohlcData, showZigzag]);

    useEffect(() => {
        if (!chart || !series) return;
        requestDraw();
        const timeScale = chart.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
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
