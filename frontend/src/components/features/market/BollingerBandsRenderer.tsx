import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { BollingerBandsDataPoint } from '../../../utils/indicators';

interface BollingerBandsRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: BollingerBandsDataPoint[];
    visible: boolean;
}

export const BollingerBandsRenderer: React.FC<BollingerBandsRendererProps> = ({ chart, series, data, visible }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawShading();
            });
        }
    }, [chart, series, data, visible]);

    const drawShading = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!chart || !series || !visible || data.length === 0) return;

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

        const timeWidth = timeScale.width();
        const barSpacing = timeWidth / (logicalRange.to - logicalRange.from);

        // Define shading color (very light blue matching existing bands)
        ctx.fillStyle = 'rgba(56, 189, 248, 0.08)';

        const getX = (i: number) => {
            if (i >= 0 && i < data.length) {
                return timeScale.timeToCoordinate(data[i].time as any);
            }
            return null;
        };

        // Draw Shading between Middle and Lower bands
        for (let i = 0; i < data.length - 1; i++) {
            const x = getX(i);
            const xNext = getX(i + 1);
            if (x === null || xNext === null) continue;

            // Only draw if within or near visible range
            if (xNext < 0 || x > canvas.width) continue;

            const yUpper = series.priceToCoordinate(data[i].upper);
            const yMid = series.priceToCoordinate(data[i].middle);
            const yLow = series.priceToCoordinate(data[i].lower);

            const yUpperNext = series.priceToCoordinate(data[i+1].upper);
            const yMidNext = series.priceToCoordinate(data[i+1].middle);
            const yLowNext = series.priceToCoordinate(data[i+1].lower);

            if (yUpper === null || yMid === null || yLow === null || yUpperNext === null || yMidNext === null || yLowNext === null) continue;

            // 1. Upper Cloud (Upper to Middle)
            ctx.beginPath();
            ctx.moveTo(x, yUpper);
            ctx.lineTo(xNext, yUpperNext);
            ctx.lineTo(xNext, yMidNext);
            ctx.lineTo(x, yMid);
            ctx.closePath();
            ctx.fill();

            // 2. Lower Cloud (Middle to Lower)
            ctx.beginPath();
            ctx.moveTo(x, yMid);
            ctx.lineTo(xNext, yMidNext);
            ctx.lineTo(xNext, yLowNext);
            ctx.lineTo(x, yLow);
            ctx.closePath();
            ctx.fill();
        }

    }, [chart, series, data, visible]);

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
            style={{ zIndex: 0 }} // Lower zIndex to stay behind candles if needed, but in overlay container
        />
    );
};
