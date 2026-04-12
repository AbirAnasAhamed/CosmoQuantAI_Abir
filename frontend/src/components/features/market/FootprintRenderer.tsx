import React, { useEffect, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { formatFootprintVolume } from '../../../utils/volumeFormatter';

export interface FootprintDataTick {
    price: number;
    bidVolume: number;
    askVolume: number;
    isImbalance?: boolean;
    imbalanceType?: 'bid' | 'ask';
    isStackedImbalance?: boolean;
    isUnfinishedAuction?: boolean;
    isAbsorption?: boolean;
}

export interface FootprintCandleData {
    time: number;
    open?: number;
    high: number;
    low: number;
    close?: number;
    pocPrice?: number;
    totalDelta?: number;
    hasDeltaDivergence?: boolean;
    ticks: FootprintDataTick[];
}

interface FootprintRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: FootprintCandleData[];
    visible: boolean;
}

export const FootprintRenderer: React.FC<FootprintRendererProps> = ({ chart, series, data, visible }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!visible || !chart || !series || !canvasRef.current || data.length === 0) return;

        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        let animationFrameId: number;

        const drawFootprint = () => {
            const timeScale = chart.timeScale();
            const timeWidth = timeScale.width();

            // Sync canvas size to fit its own bounding box mapped to the inner pane space
            if (canvas.width !== canvas.clientWidth) canvas.width = canvas.clientWidth;
            if (canvas.height !== canvas.clientHeight) canvas.height = canvas.clientHeight;

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            const logicalRange = timeScale.getVisibleLogicalRange();
            if (!logicalRange) return;

            ctx.font = 'bold 9px monospace';
            ctx.textBaseline = 'middle';

            // Optimization: Measure rough monospace char width once instead of thousands of times
            const charWidth = ctx.measureText("0").width;

            for (let i = 0; i < data.length; i++) {
                const candle = data[i];
                if (!candle) continue;

                const x = timeScale.timeToCoordinate(candle.time as any);
                if (x === null) continue;

                // Optimization: Don't draw if clearly outside horizontal canvas area
                if (x < -100 || x > canvas.width + 100) continue;

                let nextX = x + 50; // default spacing fallback
                if (i < data.length - 1 && data[i+1]) {
                    const nx = timeScale.timeToCoordinate(data[i+1].time as any);
                    if (nx !== null) nextX = nx;
                    else {
                        // If next candle is not in view but exists, we might need a better estimate
                        // But timeToCoordinate returns null for anything off-screen?
                        // Actually it returns coords for off-screen if they are within the timeScale range.
                        // If it's truly null, it's far off.
                    }
                }
                const candleSpacing = Math.abs(nextX - x);
                const isZoomedIn = candleSpacing > 30; // Min px per candle to draw text

                // NEW: Divergence Indicator (Only show if zoomed in somewhat to avoid clutter)
                if (candle.hasDeltaDivergence && candleSpacing > 15) {
                    const lowY = series.priceToCoordinate(candle.low);
                    if (lowY !== null) {
                        ctx.fillStyle = '#ef4444'; // Red warning
                        ctx.font = '10px sans-serif';
                        ctx.textAlign = 'center';
                        ctx.fillText('⚠️ DIV', x, lowY + 15);
                    }
                }

                for (let j = 0; j < candle.ticks.length; j++) {
                    const tick = candle.ticks[j];
                    const y = series.priceToCoordinate(tick.price);
                    if (y === null) continue;

                    // Optimization: Don't draw if outside vertical canvas area
                    if (y < -20 || y > canvas.height + 20) continue;

                    const bidStr = formatFootprintVolume(tick.bidVolume);
                    const askStr = formatFootprintVolume(tick.askVolume);
                    const sepStr = ' x ';

                    const totalStrLength = bidStr.length + sepStr.length + askStr.length;
                    const textWidth = totalStrLength * charWidth;
                    const boxWidth = textWidth + 8; // 4px padding on each side
                    const boxHeight = 14;
                    const boxX = x - boxWidth / 2;
                    const boxY = y - boxHeight / 2;

                    // Draw Absorption Glow Effect regardless of zoom
                    if (tick.isAbsorption) {
                        const rWidth = isZoomedIn ? boxWidth : 20;
                        const gradient = ctx.createRadialGradient(x, y, 0, x, y, rWidth);
                        gradient.addColorStop(0, 'rgba(168, 85, 247, 0.4)'); // Purple glow
                        gradient.addColorStop(1, 'rgba(168, 85, 247, 0)');
                        ctx.fillStyle = gradient;
                        ctx.fillRect(x - rWidth * 1.5, y - boxHeight*2, rWidth * 3, boxHeight * 4);
                    }

                    // Draw Stacked Imbalance Rectangle
                    if (tick.isStackedImbalance && tick.imbalanceType) {
                        ctx.fillStyle = tick.imbalanceType === 'bid' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(34, 197, 94, 0.15)';
                        const stretchWidth = isZoomedIn ? Math.max(candleSpacing * 1.5, 40) : Math.max(candleSpacing * 0.8, 15);
                        const startX = isZoomedIn ? (boxX + boxWidth) : (x + 5);
                        ctx.fillRect(startX, boxY, stretchWidth, boxHeight);
                        
                        ctx.strokeStyle = tick.imbalanceType === 'bid' ? 'rgba(239, 68, 68, 0.5)' : 'rgba(34, 197, 94, 0.5)';
                        ctx.lineWidth = 1;
                        ctx.beginPath();
                        ctx.moveTo(startX, boxY);
                        ctx.lineTo(startX + stretchWidth, boxY);
                        ctx.stroke();
                    }

                    if (isZoomedIn) {
                        // Draw Background
                        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
                        ctx.beginPath();
                        if (ctx.roundRect) {
                            ctx.roundRect(boxX, boxY, boxWidth, boxHeight, 2);
                        } else {
                            ctx.rect(boxX, boxY, boxWidth, boxHeight);
                        }
                        ctx.fill();

                        // POC Outline
                        if (tick.price === candle.pocPrice) {
                            ctx.strokeStyle = '#ffffff'; 
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        } else if (tick.isImbalance) {
                            ctx.strokeStyle = 'rgba(251, 191, 36, 0.5)';
                            ctx.lineWidth = 1;
                            ctx.stroke();
                        }

                        // Unfinished Auction Marker
                        if (tick.isUnfinishedAuction) {
                            ctx.fillStyle = '#fbbf24'; // Warning yellow
                            ctx.font = 'bold 12px monospace';
                            ctx.fillText('*', boxX - 10, y);
                        }

                        // Draw Texts manually spaced out
                        let currentX = boxX + 4; // Add left padding origin
                        ctx.textAlign = 'left';

                        // Bid Volume (Red)
                        ctx.fillStyle = '#f87171';
                        ctx.fillText(bidStr, currentX, y);
                        currentX += bidStr.length * charWidth;

                        // Divider (Gray)
                        ctx.fillStyle = '#9ca3af';
                        ctx.fillText(sepStr, currentX, y);
                        currentX += sepStr.length * charWidth;

                        // Ask Volume (Green)
                        ctx.fillStyle = '#4ade80';
                        ctx.fillText(askStr, currentX, y);
                    }
                }
            }
        };

        const renderLoop = () => {
            drawFootprint();
            animationFrameId = requestAnimationFrame(renderLoop);
        };
        renderLoop();

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [chart, series, data, visible]);

    if (!visible) return null;

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full pointer-events-none z-20"
        />
    );
};
