import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';
import { GodModeState } from '../../../hooks/useGodModeData';

interface LiquidationRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: GodModeState | null;
    showBubbles: boolean;
    intensityScale: number; // 10-100
}

export const LiquidationRenderer: React.FC<LiquidationRendererProps> = ({ chart, series, data, showBubbles, intensityScale }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);
    
    // Track persisting bubbles
    const bubblesRef = useRef<any[]>([]);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawHeatmap();
            });
        }
    }, [chart, series, data, showBubbles, intensityScale]);

    const drawHeatmap = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!chart || !series || !data) return;

        const timeScale = chart.timeScale();
        const priceScale = series.priceScale();
        if (!timeScale || !priceScale) return;

        const timeWidth = timeScale.width();
        const parent = canvas.parentElement;
        if (parent) {
            if (canvas.width !== parent.clientWidth) canvas.width = parent.clientWidth;
            if (canvas.height !== parent.clientHeight) canvas.height = parent.clientHeight;
        }

        const currentPrice = data.current_price;
        const zoneThickness = currentPrice * 0.005; // 0.5% thickness

        // 1. Draw Magnet Zones & Cascade Probs (Heatmap Bands)
        const allZones = [
            ...(data.magnet_zones || []).map(z => ({ ...z, type: 'magnet' })),
            ...(data.cascade_probs || []).map(z => ({ price: z.price, intensity: z.prob, type: 'cascade' }))
        ];

        // Ensure text labels don't overlap vertically on compressed scales
        const drawnTextY: number[] = [];

        allZones.forEach(zone => {
            const yTop = series.priceToCoordinate(zone.price + (zoneThickness/2));
            const yBottom = series.priceToCoordinate(zone.price - (zoneThickness/2));
            const yCenter = series.priceToCoordinate(zone.price);

            if (yTop !== null && yBottom !== null && yCenter !== null) {
                const height = Math.abs(yBottom - yTop);
                // Base opacity scaled by user intensity ratio 
                const alpha = (zone.intensity / 100) * (intensityScale / 100);
                
                // Color logic: Cascade Red, Magnet Green
                let colorBase = zone.type === 'magnet' ? `34, 197, 94` : `239, 68, 68`; // Green, Red
                
                // ── TRADITIONAL HEATMAP BAND (Spans behind candles) ──
                // Draw glow block exactly behind the candles
                ctx.fillStyle = `rgba(${colorBase}, ${alpha * 0.25})`; // Soften background
                ctx.fillRect(0, Math.min(yTop, yBottom), timeWidth, height);
                
                // Center Horizontal Laser Line
                ctx.beginPath();
                ctx.strokeStyle = `rgba(${colorBase}, ${alpha * 0.8})`;
                ctx.setLineDash([4, 4]);
                ctx.lineWidth = 1;
                ctx.moveTo(0, yCenter);
                ctx.lineTo(timeWidth, yCenter);
                ctx.stroke();
                ctx.setLineDash([]); // reset dash for future drawing

                // Draw Text Label on the right edge
                ctx.fillStyle = `rgba(${colorBase}, 0.95)`;
                ctx.font = 'bold 11px Inter, sans-serif';
                ctx.textAlign = 'right';
                ctx.textBaseline = 'middle';
                const formattedPrice = zone.price < 0.1 ? zone.price.toFixed(5) : zone.price < 1 ? zone.price.toFixed(4) : zone.price.toFixed(2);
                const label = zone.type === 'magnet' ? `🧲 MGNT ${zone.intensity}% @ ${formattedPrice}` : `🔥 LIQ ${zone.intensity}% @ ${formattedPrice}`;
                
                // Basic Collision Detection for Text
                let textY = yCenter as number;
                for (let i = 0; i < 10; i++) {
                    const hasCollision = drawnTextY.some(dy => Math.abs(dy - textY) < 16);
                    if (hasCollision) {
                        textY -= 16; // Push label up if colliding
                    } else {
                        break;
                    }
                }
                drawnTextY.push(textY);

                ctx.fillText(label, timeWidth - 6, textY);
            }
        });

        // 2. Draw Live Liquidation Bubbles
        if (showBubbles && data.whale_feed) {
            // Unify new bubbles with existing ones, expiring after 60 seconds
            const now = Date.now();
            
            data.whale_feed.forEach(wf => {
                if (wf.price && wf.timestamp) {
                    const existing = bubblesRef.current.find(b => b.timestamp === wf.timestamp && b.price === wf.price);
                    if (!existing) {
                        bubblesRef.current.push({ ...wf, createdAt: now });
                    }
                }
            });

            // Clean old bubbles (> 1 min)
            bubblesRef.current = bubblesRef.current.filter(b => now - b.createdAt < 60000);

            bubblesRef.current.forEach(bubble => {
                const x = timeScale.timeToCoordinate((bubble.timestamp / 1000) as any);
                const y = series.priceToCoordinate(bubble.price);
                
                if (x !== null && y !== null) {
                    // Radius based on USD value (e.g. 100k -> small, 1m -> big)
                    const baseRadius = Math.max(8, Math.min(40, (bubble.value / 1000000) * 15));
                    const isLongRekt = bubble.type?.toLowerCase().includes('long');
                    
                    // Bubble core color based on exchange
                    const ex = bubble.exchange?.toLowerCase();
                    const coreColor = ex === 'binance' ? '250, 204, 21' : ex === 'bybit' ? '59, 130, 246' : '168, 85, 247'; // Yellow, Blue, Purple
                    // Stroke color based on Long/Short
                    const strokeColor = isLongRekt ? '239, 68, 68' : '34, 197, 94';

                    const age = now - bubble.createdAt;
                    
                    // Ripple Blast Animation (up to 2000ms)
                    if (age < 2000) {
                        const progress = age / 2000; // 0 to 1
                        const rippleRadius = baseRadius + (progress * 150); // expands up to 150px
                        const rippleAlpha = (1 - progress) * 0.6; // fades out
                        
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(${strokeColor}, ${rippleAlpha})`;
                        ctx.lineWidth = Math.max(1, 4 * (1 - progress));
                        ctx.arc(x, y, rippleRadius, 0, 2 * Math.PI);
                        ctx.stroke();

                        // Second inner ripple
                        if (progress > 0.2) {
                            const prog2 = (age - 400) / 1600;
                            const r2 = baseRadius + (prog2 * 100);
                            const alpha2 = (1 - prog2) * 0.5;
                            ctx.beginPath();
                            ctx.strokeStyle = `rgba(${coreColor}, ${alpha2})`;
                            ctx.lineWidth = Math.max(1, 3 * (1 - prog2));
                            ctx.arc(x, y, r2, 0, 2 * Math.PI);
                            ctx.stroke();
                        }
                    }

                    // Horizontal Footprint Laser (Fades over 10 seconds)
                    if (age < 10000) {
                        const footprintAlpha = (1 - (age / 10000)) * 0.6;
                        ctx.beginPath();
                        ctx.strokeStyle = `rgba(${strokeColor}, ${footprintAlpha})`;
                        ctx.setLineDash([4, 4]);
                        ctx.lineWidth = footprintAlpha > 0.3 ? 2 : 1;
                        ctx.moveTo(x, y);
                        ctx.lineTo(timeWidth, y);
                        ctx.stroke();
                        ctx.setLineDash([]);
                    }

                    // Main Pulse Bubble
                    const pulse = Math.sin(age / 200) * 2;
                    const radius = baseRadius + pulse;

                    ctx.beginPath();
                    ctx.fillStyle = `rgba(${coreColor}, 0.3)`;
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);
                    ctx.fill();

                    // Inner bright core
                    ctx.beginPath();
                    ctx.fillStyle = `rgba(${coreColor}, 0.8)`;
                    ctx.arc(x, y, radius * 0.3, 0, 2 * Math.PI);
                    ctx.fill();

                    ctx.beginPath();
                    ctx.strokeStyle = `rgba(${strokeColor}, 1)`;
                    ctx.lineWidth = 2;
                    ctx.arc(x, y, radius, 0, 2 * Math.PI);
                    ctx.stroke();
                    
                    // Value text Float above bubble
                    ctx.fillStyle = '#fff';
                    ctx.font = 'bold 9px Arial';
                    ctx.textAlign = 'center';
                    ctx.textBaseline = 'middle';
                    const valK = bubble.value >= 1000000 ? (bubble.value / 1000000).toFixed(1) + 'M' : (bubble.value / 1000).toFixed(0) + 'k';
                    ctx.fillText(valK, x, y - radius - 8);
                }
            });
        }

    }, [chart, series, data, showBubbles, intensityScale]);

    useEffect(() => {
        if (!chart || !series) return;
        requestDraw();

        const timeScale = chart.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        timeScale.subscribeSizeChange(requestDraw);
        chart.subscribeCrosshairMove(requestDraw);

        // Continuous animation loop for bubbles
        let animationFrameId: number;
        const animate = () => {
            if (showBubbles && bubblesRef.current.length > 0) {
                requestDraw();
            }
            animationFrameId = requestAnimationFrame(animate);
        };
        animate();

        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
            timeScale.unsubscribeSizeChange(requestDraw);
            chart.unsubscribeCrosshairMove(requestDraw);
            cancelAnimationFrame(animationFrameId);
        };
    }, [chart, series, requestDraw, showBubbles]);

    // Force redraw when data changes
    useEffect(() => {
        requestDraw();
    }, [data, requestDraw]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ zIndex: 5 }}
        />
    );
};
