import React, { useEffect, useRef, useCallback } from 'react';
import { IChartApi, ISeriesApi, LineSeries } from 'lightweight-charts';
import { TrendFinderResult, TrendFinderDataPoint } from '../../../utils/indicators';

interface TrendFinderRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: TrendFinderResult | null;
    visible: boolean;
    threshold: string;
    hideLowConfidenceTrend: boolean;
}

export const TrendFinderRenderer: React.FC<TrendFinderRendererProps> = ({ chart, series, data, visible, threshold, hideLowConfidenceTrend }) => {
    const midlineRef = useRef<ISeriesApi<'Line'> | null>(null);
    const upperLineRef = useRef<ISeriesApi<'Line'> | null>(null);
    const lowerLineRef = useRef<ISeriesApi<'Line'> | null>(null);
    const initedRef = useRef(false);
    
    // Canvas variables for Cloud Fill
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const drawRequested = useRef<boolean>(false);

    useEffect(() => {
        if (!chart || !series) return;

        if (!initedRef.current) {
            midlineRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(59, 130, 246, 0.8)', // Blue
                lineWidth: 2,
                lineStyle: 2, // Dashed
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });

            upperLineRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(156, 163, 175, 0.4)', // Gray
                lineWidth: 1,
                lineStyle: 0, // Solid
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });

            lowerLineRef.current = chart.addSeries(LineSeries, {
                color: 'rgba(156, 163, 175, 0.4)', // Gray
                lineWidth: 1,
                lineStyle: 0, // Solid
                crosshairMarkerVisible: false,
                lastValueVisible: false,
                priceLineVisible: false,
            });

            initedRef.current = true;
        }

        return () => {
            if (chart && initedRef.current) {
                if (midlineRef.current) {
                    try { chart.removeSeries(midlineRef.current); } catch(e) {}
                    midlineRef.current = null;
                }
                if (upperLineRef.current) {
                    try { chart.removeSeries(upperLineRef.current); } catch(e) {}
                    upperLineRef.current = null;
                }
                if (lowerLineRef.current) {
                    try { chart.removeSeries(lowerLineRef.current); } catch(e) {}
                    lowerLineRef.current = null;
                }
                initedRef.current = false;
            }
        };
    }, [chart, series]);

    useEffect(() => {
        if (!visible || !data || !initedRef.current) {
            midlineRef.current?.setData([]);
            upperLineRef.current?.setData([]);
            lowerLineRef.current?.setData([]);
            return;
        }

        try {
            const validPoints = data.points.filter((p: any) => 
                p && p.time && 
                !isNaN(p.value) && isFinite(p.value) &&
                !isNaN(p.upper) && isFinite(p.upper) &&
                !isNaN(p.lower) && isFinite(p.lower)
            );

            // Deduplicate by time and ensure strict ascending order
            const deduplicated: any[] = [];
            const seenTimes = new Set<number>();
            
            for (const p of validPoints) {
                const t = Number(p.time);
                if (!seenTimes.has(t)) {
                    seenTimes.add(t);
                    deduplicated.push(p);
                }
            }
            
            deduplicated.sort((a, b) => Number(a.time) - Number(b.time));

            if (deduplicated.length > 0) {
                const midData = deduplicated.map(p => ({ time: p.time as any, value: p.value }));
                const upperData = deduplicated.map(p => ({ time: p.time as any, value: p.upper }));
                const lowerData = deduplicated.map(p => ({ time: p.time as any, value: p.lower }));

                midlineRef.current?.setData(midData);
                upperLineRef.current?.setData(upperData);
                lowerLineRef.current?.setData(lowerData);
            } else {
                midlineRef.current?.setData([]);
                upperLineRef.current?.setData([]);
                lowerLineRef.current?.setData([]);
            }
        } catch (err) {
            console.error('[TrendFinderRenderer] Error setting data:', err);
        }

    }, [data, visible]);

    // --- CANVAS CLOUD FILL LOGIC ---
    
    const drawCloud = useCallback(() => {
        if (!canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        if (!chart || !series || !visible || !data || data.points.length === 0) return;

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

        const isBearish = data.trendDirection === 'bearish';
        
        // --- NEW: Confidence Based Colors ---
        const confidence_levels: { [key: string]: number } = {
            'Extremely Weak': 0.1,
            'Very Weak': 0.2,
            'Weak': 0.3,
            'Mostly Weak': 0.4,
            'Somewhat Weak': 0.5,
            'Moderately Weak': 0.6,
            'Moderate': 0.7,
            'Moderately Strong': 0.8,
            'Mostly Strong': 0.9,
            'Strong': 0.92,
            'Very Strong': 0.94,
            'Exceptionally Strong': 0.96,
            'Ultra Strong': 0.98
        };

        const currentConf = confidence_levels[data.confidence] || 0.1;
        const targetConf = confidence_levels[threshold] || 0.92;
        const isMet = currentConf >= targetConf;
        
        // --- NEW: Hiding logic ---
        if (hideLowConfidenceTrend && !isMet) {
            // Clean up lines if they exist
            if (midlineRef.current) midlineRef.current.setData([]);
            if (upperLineRef.current) upperLineRef.current.setData([]);
            if (lowerLineRef.current) lowerLineRef.current.setData([]);
            return;
        }
        
        // --- DRAW TOP TREND BADGE ---
        const badgeX = 20;
        const badgeY = 20;
        const badgeWidth = 240; // Original width for trend only
        const badgeHeight = 35;
        
        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = isMet ? (isBearish ? '#ef4444' : '#22c55e') : 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        
        // Rounded rect helper
        const roundedRect = (x: number, y: number, w: number, h: number, r: number) => {
            ctx.beginPath();
            ctx.moveTo(x + r, y);
            ctx.lineTo(x + w - r, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + r);
            ctx.lineTo(x + w, y + h - r);
            ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
            ctx.lineTo(x + r, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - r);
            ctx.lineTo(x, y + r);
            ctx.quadraticCurveTo(x, y, x + r, y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        };
        
        roundedRect(badgeX, badgeY, badgeWidth, badgeHeight, 8);
        
        // Text
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('TREND', badgeX + 10, badgeY + 22);
        
        ctx.font = '900 12px Inter, sans-serif';
        const statusColor = isMet ? (isBearish ? '#ef4444' : '#22c55e') : '#64748b';
        ctx.fillStyle = statusColor;
        const displayStatus = `${data.trendDirection.toUpperCase()} | ${data.confidence.toUpperCase()}`;
        ctx.fillText(displayStatus, badgeX + 50, badgeY + 22);

        // --- DRAW BOTTOM VOLUME BADGE ---
        const volBadgeX = 20;
        const volBadgeY = ctx.canvas.height / window.devicePixelRatio - 55;
        const volBadgeWidth = 180;
        const volBadgeHeight = 30;

        // Draw background
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.strokeStyle = data.volumeConfirmed ? '#22c55e' : '#ef4444';
        ctx.lineWidth = 1;
        roundedRect(volBadgeX, volBadgeY, volBadgeWidth, volBadgeHeight, 6);

        // Text
        const formatVol = (v: number) => {
            if (v >= 1000000) return (v / 1000000).toFixed(1) + 'M';
            if (v >= 1000) return (v / 1000).toFixed(1) + 'K';
            return v.toFixed(0);
        };
        
        ctx.font = 'bold 9px Inter, sans-serif';
        ctx.fillStyle = '#94a3b8';
        ctx.fillText('VOL CONFIRMATION', volBadgeX + 10, volBadgeY + 18);
        
        const volText = `${formatVol(data.currentVolume)} / ${formatVol(data.requiredVolume)}`;
        const volColor = data.volumeConfirmed ? '#22c55e' : '#ef4444';
        ctx.font = 'bold 10px Inter, sans-serif';
        ctx.fillStyle = volColor;
        ctx.fillText(volText, volBadgeX + 105, volBadgeY + 18);

        // --- DRAW CLOUD ---
        // Base colors with opacity linked to confidence
        // If met, use stronger colors. If not, use dim colors.
        const opacity = isMet ? 0.25 : 0.08;
        ctx.fillStyle = isBearish 
            ? `rgba(239, 68, 68, ${opacity})` 
            : `rgba(34, 197, 94, ${opacity})`;

        ctx.beginPath();
        let started = false;
        
        // 1. Draw top band going FORWARDS
        for (let i = 0; i < data.points.length; i++) {
            const pt = data.points[i];
            const x = timeScale.timeToCoordinate(pt.time as any);
            const yTop = series.priceToCoordinate(pt.upper);
            if (x !== null && yTop !== null) {
                if (!started) {
                    ctx.moveTo(x, yTop);
                    started = true;
                } else {
                    ctx.lineTo(x, yTop);
                }
            }
        }
        
        // 2. Draw bottom band going BACKWARDS
        for (let i = data.points.length - 1; i >= 0; i--) {
            const pt = data.points[i];
            const x = timeScale.timeToCoordinate(pt.time as any);
            const yBot = series.priceToCoordinate(pt.lower);
            if (x !== null && yBot !== null) {
                ctx.lineTo(x, yBot);
            }
        }
        
        if (started) {
            ctx.closePath();
            ctx.fill();
        }
    }, [chart, series, data, visible]);

    const requestDraw = useCallback(() => {
        if (!drawRequested.current) {
            drawRequested.current = true;
            requestAnimationFrame(() => {
                drawRequested.current = false;
                drawCloud();
            });
        }
    }, [drawCloud]);

    useEffect(() => {
        if (!chart || !series || !visible) {
            if (canvasRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                if (ctx) ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);
            }
            return;
        }
        requestDraw();
        const timeScale = chart.timeScale();
        timeScale.subscribeVisibleTimeRangeChange(requestDraw);
        chart.subscribeCrosshairMove(requestDraw);
        return () => {
            timeScale.unsubscribeVisibleTimeRangeChange(requestDraw);
            chart.unsubscribeCrosshairMove(requestDraw);
        };
    }, [chart, series, requestDraw, visible]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute top-0 left-0 pointer-events-none"
            style={{ zIndex: 1,  width: '100%', height: '100%' }}
        />
    );
};
