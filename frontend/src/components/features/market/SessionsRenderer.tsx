import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { SessionData } from '@/utils/indicators';
import { IndicatorSettings, SessionSettings } from './IndicatorSelector';

interface SessionsRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    sessionsData: {
        a: SessionData[];
        b: SessionData[];
        c: SessionData[];
        d: SessionData[];
    };
    settings: IndicatorSettings;
}

export const SessionsRenderer: React.FC<SessionsRendererProps> = ({ chart, series, sessionsData, settings }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);
    
    // Stable refs for data to prevent rapid effect re-runs
    const dataRef = useRef(sessionsData);
    const settingsRef = useRef(settings);

    useEffect(() => {
        dataRef.current = sessionsData;
        settingsRef.current = settings;
        requestDraw();
    }, [sessionsData, settings]);

    const hexToRgba = useCallback((hex: string, alpha: number) => {
        let r, g, b;
        if (hex.length === 4) {
            r = parseInt(hex[1] + hex[1], 16);
            g = parseInt(hex[2] + hex[2], 16);
            b = parseInt(hex[3] + hex[3], 16);
        } else {
            r = parseInt(hex.slice(1, 3), 16);
            g = parseInt(hex.slice(3, 5), 16);
            b = parseInt(hex.slice(5, 7), 16);
        }
        return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }, []);

    const renderSessionBlock = useCallback((
        ctx: CanvasRenderingContext2D,
        block: SessionData[],
        config: SessionSettings,
        color: string,
        alpha: number,
        timeScale: any,
        series: any,
        globalSettings: IndicatorSettings
    ) => {
        if (block.length === 0) return;
        
        const first = block[0];
        const last = block[block.length - 1];

        const x1 = timeScale.timeToCoordinate(first.time);
        const x2 = timeScale.timeToCoordinate(last.time);
        
        if (x1 === null || x2 === null) return;
        
        const blockWidth = x2 - x1;

        // 1. Draw Range Box
        const highPrice = last.high;
        const lowPrice = last.low;
        const yHigh = series.priceToCoordinate(highPrice);
        const yLow = series.priceToCoordinate(lowPrice);

        if (config.showRange && yHigh !== null && yLow !== null) {
            ctx.fillStyle = hexToRgba(color, alpha);
            ctx.fillRect(x1, yHigh, blockWidth, yLow - yHigh);
            
            if (globalSettings.showOutline) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 1;
                ctx.setLineDash([4, 4]);
                ctx.strokeRect(x1, yHigh, blockWidth, yLow - yHigh);
                ctx.setLineDash([]);
            }
        }

        // 2. Session Label
        if (globalSettings.showSessionLabel && yHigh !== null) {
            ctx.fillStyle = color;
            ctx.font = 'bold 10px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText(config.name, x1 + blockWidth / 2, yHigh - 5);
        }

        // 3. Overlays
        ctx.lineWidth = 1.5;
        
        if (config.showMean) {
            ctx.strokeStyle = color;
            ctx.beginPath();
            let started = false;
            block.forEach(d => {
                const x = timeScale.timeToCoordinate(d.time);
                const y = series.priceToCoordinate(d.avg);
                if (x !== null && y !== null) {
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
        }

        if (config.showVWAP) {
            ctx.strokeStyle = color;
            ctx.setLineDash([2, 1]);
            ctx.beginPath();
            let started = false;
            block.forEach(d => {
                const x = timeScale.timeToCoordinate(d.time);
                const y = series.priceToCoordinate(d.vwap);
                if (x !== null && y !== null) {
                    if (!started) { ctx.moveTo(x, y); started = true; }
                    else ctx.lineTo(x, y);
                }
            });
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (config.showMaxMin && yHigh !== null && yLow !== null) {
            ctx.strokeStyle = color;
            ctx.lineWidth = 0.5;
            ctx.setLineDash([2, 4]);
            ctx.beginPath();
            ctx.moveTo(x1, yHigh); ctx.lineTo(x2, yHigh);
            ctx.moveTo(x1, yLow); ctx.lineTo(x2, yLow);
            ctx.stroke();
            ctx.setLineDash([]);
        }

        if (config.showTrendline && last.linReg) {
            const y1LR = series.priceToCoordinate(last.linReg.y1);
            const y2LR = series.priceToCoordinate(last.linReg.y2);
            if (y1LR !== null && y2LR !== null) {
                ctx.strokeStyle = color;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x1, y1LR);
                ctx.lineTo(x2, y2LR);
                ctx.stroke();
            }
        }
    }, [hexToRgba]);

    const drawSessions = useCallback(() => {
        if (!chart || !series || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const timeScale = chart.timeScale();
        const priceScale = series.priceScale();
        if (!timeScale || !priceScale) return;

        const data = dataRef.current;
        const currentSettings = settingsRef.current;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!currentSettings.showSessions) return;

        const keys: (keyof typeof data)[] = ['a', 'b', 'c', 'd'];
        
        keys.forEach(key => {
            const sessData = data[key];
            const sessSettings = currentSettings[`session${key.toUpperCase()}` as keyof IndicatorSettings] as SessionSettings;
            if (!sessSettings?.show || sessData.length === 0) return;

            const color = sessSettings.color;
            const alpha = currentSettings.rangeTransparency / 100;

            let currentBlock: SessionData[] = [];
            for (let i = 0; i < sessData.length; i++) {
                const d = sessData[i];
                if (d.isSession) currentBlock.push(d);
                if ((!d.isSession || i === sessData.length - 1) && currentBlock.length > 0) {
                    renderSessionBlock(ctx, currentBlock, sessSettings, color, alpha, timeScale, series, currentSettings);
                    currentBlock = [];
                }
            }
        });
    }, [chart, series, renderSessionBlock]);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawSessions();
            });
        }
    }, [drawSessions]);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        if (!parent) return;

        const resize = () => {
            canvas.width = parent.clientWidth;
            canvas.height = parent.clientHeight;
            requestDraw();
        };

        resize();
        const observer = new ResizeObserver(resize);
        observer.observe(parent);
        return () => observer.disconnect();
    }, [requestDraw]);

    useEffect(() => {
        if (!chart || !series) return;
        requestDraw();
        const timeScale = chart.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        timeScale.subscribeSizeChange(requestDraw);
        chart.subscribeCrosshairMove(requestDraw);
        
        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
            timeScale.unsubscribeSizeChange(requestDraw);
            chart.unsubscribeCrosshairMove(requestDraw);
        };
    }, [chart, series, requestDraw]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ zIndex: 5 }}
        />
    );
};
