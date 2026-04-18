import React, { useEffect, useRef, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { createChart, ISeriesApi, CandlestickData, CandlestickSeries, LineSeries, HistogramSeries, HistogramData, createSeriesMarkers, LineStyle } from 'lightweight-charts';
import { WickSRRenderer } from '../../components/features/market/WickSRRenderer';
import { useLevel2MarketData } from '@/hooks/useLevel2MarketData';
import { useOrderFlowData } from '../../hooks/useOrderFlowData';
import { useHeatmapData } from '../../hooks/useHeatmapData';
import { useIcebergEvents } from '../../hooks/useIcebergEvents.tsx';
import { useVolumeFilter } from '../../hooks/useVolumeFilter';
import { marketDepthService } from '../../services/marketDepthService';
import { HeatmapSymbolSelector } from '../../components/features/market/HeatmapSymbolSelector';
import { TimeframeSelector } from '../../components/features/market/TimeframeSelector';
import { VolumeFilterControl } from '../../components/features/market/VolumeFilterControl';
import { LiquidityHeatmapRenderer, HeatmapDataPoint } from '../../components/features/market/LiquidityHeatmapRenderer';
import { VolumeProfileWidget, VPVRData } from '../../components/features/market/VolumeProfileWidget';
import { CVDChart, CVDDataPoint } from '../../components/features/market/CVDChart';
import { FootprintRenderer, FootprintCandleData, FootprintDataTick } from '../../components/features/market/FootprintRenderer';
import { GodModeHUD } from '../../components/features/market/GodModeHUD';
import { LiquidationRenderer } from '../../components/features/market/LiquidationRenderer';
import { useGodModeData } from '../../hooks/useGodModeData';
import { FibonacciCloudRenderer, FibonacciData } from '../../components/features/market/FibonacciCloudRenderer';
import { IchimokuRenderer } from '../../components/features/market/IchimokuRenderer';
import { calculateQuantumAi, QuantumAiResult } from '../../utils/quantumAi';
import { IndicatorSelector, IndicatorSettings } from '../../components/features/market/IndicatorSelector';
import { MACDRenderer } from '../../components/features/market/MACDRenderer';
import { calculateEMA, calculateBollingerBands, BollingerBandsDataPoint, calculateMACD, calculateRSI, updateEMA, updateBollingerBands, updateRSI, calculateIchimoku, IchimokuDataPoint, calculateAdaptiveTrendFinder, TrendFinderResult, calculateUTBotAlerts, UTBotDataPoint, calculateSessions, SessionData, calculateSupertrend, SupertrendDataPoint, calculateMsbOb, MsbObResult, calculateWickRejectionSR, WickSRResult } from '../../utils/indicators';
import { TrendFinderRenderer } from '../../components/features/market/TrendFinderRenderer';
import { SessionsRenderer } from '../../components/features/market/SessionsRenderer';
import { SupertrendRenderer } from '../../components/features/market/SupertrendRenderer';
import { MsbObRenderer } from '../../components/features/market/MsbObRenderer';
import { SMCRenderer } from '../../components/features/market/SMCRenderer';
import { calculateSMC, SMCResult, DEFAULT_SMC_SETTINGS } from '../../utils/smartMoneyConcepts';
import { calculateICTSuite, ICTResult } from '../../utils/ictKillzones';
import { ICTKillzonesRenderer } from '../../components/features/market/ICTKillzonesRenderer';
import { calculateLuxIctConcepts, LuxIctResult } from '../../utils/luxIctConcepts';
import { LuxIctRenderer } from '../../components/features/market/LuxIctRenderer';
import { BollingerBandsRenderer } from '../../components/features/market/BollingerBandsRenderer';
import { SessionsDashboard, SessionStatus } from '../../components/features/market/SessionsDashboard';
import { HeatmapSubNav } from '../../components/features/market/HeatmapSubNav';
import { BotSettingsTab } from '../../components/features/market/BotSettingsTab';
import { BotLogsTab } from '../../components/features/market/BotLogsTab';
import { WallHunterModal } from '../../components/features/market/WallHunterModal';
import { ManualTradeModal } from '../../components/features/market/ManualTradeModal';
import { DualEngineDashboard } from '../../components/features/market/DualEngineDashboard';
import { WatchlistScanner } from '../../components/features/market/WatchlistScanner';
import { botService } from '../../services/botService';
import { useWallHunterStatus } from '@/hooks/useWallHunterStatus';
import { toast } from 'react-hot-toast';
import { useMarketStore } from '@/store/marketStore';
import { useBotStore } from '@/store/botStore';
import { useUIStore } from '@/store/uiStore';
import { useOpenOrders, OpenLimitOrder } from '../../hooks/useOpenOrders';


// Helper to convert interval string to ms
const parseIntervalToMs = (interval: string): number => {
    const value = parseInt(interval) || 1;
    const unit = interval.replace(/[0-9]/g, '') || 'm';
    switch (unit) {
        case 'm': return value * 60 * 1000;
        case 'h': return value * 60 * 60 * 1000;
        case 'd': return value * 24 * 60 * 60 * 1000;
        case 'w': return value * 7 * 24 * 60 * 60 * 1000;
        case 'M': return value * 30 * 24 * 60 * 60 * 1000; // approximation for month
        default: return value * 60 * 1000; // default to minutes
    }
};

// Chart Component
const OrderFlowChart: React.FC<{ exchange: string; symbol: string; interval: string; walls: { price: number, type: 'buy' | 'sell', size?: number }[]; currentPrice: number; showFootprint: boolean; showCVD: boolean; indicatorSettings: IndicatorSettings; tradeEvent: any; botStatus: any; openOrders: OpenLimitOrder[] }> = ({ exchange, symbol, interval, walls, currentPrice, showFootprint, showCVD, indicatorSettings, tradeEvent, botStatus, openOrders }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const chartRef = useRef<any>(null);
    const candlestickSeriesRef = useRef<ISeriesApi<'Candlestick'> | null>(null);
    const emaSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbUpperSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbMiddleSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const bbLowerSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const rsiSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const volumeSeriesRef = useRef<ISeriesApi<'Histogram'> | null>(null);
    const utBotSeriesRef = useRef<ISeriesApi<'Line'> | null>(null);
    const utBotMarkersRef = useRef<any[]>([]);
    const quantumAiMarkersRef = useRef<any[]>([]);
    const botTradeMarkersRef = useRef<any[]>([]);
    const patternMarkersRef = useRef<any[]>([]);
    const wallLinesRef = useRef<Map<string, any>>(new Map());
    const currentPriceLineRef = useRef<any>(null);
    const lastCandleRef = useRef<CandlestickData | null>(null);
    const allCandlesRef = useRef<any[]>([]);
    const lastTradeEventRef = useRef<any>(null);
    const lastProcessedPriceRef = useRef<number>(0);
    const prevPositionRef = useRef<boolean>(false);
    const markersPluginRef = useRef<any>(null);
    const [countdownFormatted, setCountdownFormatted] = useState<string>('');
    const [fiboData, setFiboData] = useState<FibonacciData | null>(null);
    const [ichimokuData, setIchimokuData] = useState<IchimokuDataPoint[]>([]);
    const [trendFinderData, setTrendFinderData] = useState<TrendFinderResult | null>(null);
    const { vpvrData, cvdData, footprintData } = useOrderFlowData(symbol, exchange, interval);
    const { heatmapData: realHeatmapData } = useHeatmapData(symbol, exchange);
    useIcebergEvents(symbol);
    const godModeData = useGodModeData(symbol);
    const [sessionsData, setSessionsData] = useState<{ a: SessionData[]; b: SessionData[]; c: SessionData[]; d: SessionData[]; }>({
        a: [], b: [], c: [], d: []
    });
    const [sessionStatuses, setSessionStatuses] = useState<SessionStatus[]>([]);
    const [smcData, setSmcData] = useState<SMCResult | null>(null);
    const [ictData, setIctData] = useState<ICTResult | null>(null);
    const [luxIctData, setLuxIctData] = useState<LuxIctResult | null>(null);
    const [quantumAiData, setQuantumAiData] = useState<QuantumAiResult[]>([]);
    const [supertrendData, setSupertrendData] = useState<SupertrendDataPoint[]>([]);
    const [msbObData, setMsbObData] = useState<MsbObResult | null>(null);
    const [patternData, setPatternData] = useState<any[]>([]); // Added for patterns
    const [wickSRData, setWickSRData] = useState<WickSRResult | null>(null);
    const [wickSRCandles, setWickSRCandles] = useState<any[]>([]);
    const [bbData, setBbData] = useState<BollingerBandsDataPoint[]>([]);
    
    // Default to the right side (rough estimate, can be adjusted by screen size)
    const [quantumAiHudPos, setQuantumAiHudPos] = useState(() => {
        const savedPos = localStorage.getItem('quantumAiHudPos');
        if (savedPos) {
            try {
                return JSON.parse(savedPos);
            } catch (e) {
                return { x: window.innerWidth - 320, y: 150 };
            }
        }
        return { x: window.innerWidth - 320, y: 150 };
    });

    const [isDraggingQuantumAi, setIsDraggingQuantumAi] = useState(false);
    const dragStartRef = useRef({ x: 0, y: 0 });

    // Handle window resize to keep HUD in view if needed
    useEffect(() => {
        const handleResize = () => {
            setQuantumAiHudPos(prev => ({
                ...prev,
                x: Math.min(prev.x, window.innerWidth - 280)
            }));
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    // ── Quantum AI HUD Draggable Logic ──
    const handleHudMouseDown = (e: React.MouseEvent) => {
        setIsDraggingQuantumAi(true);
        dragStartRef.current = {
            x: e.clientX - quantumAiHudPos.x,
            y: e.clientY - quantumAiHudPos.y
        };
    };

    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (!isDraggingQuantumAi) return;
            const newPos = {
                x: e.clientX - dragStartRef.current.x,
                y: e.clientY - dragStartRef.current.y
            };
            setQuantumAiHudPos(newPos);
            localStorage.setItem('quantumAiHudPos', JSON.stringify(newPos));
        };

        const handleMouseUp = () => {
            setIsDraggingQuantumAi(false);
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDraggingQuantumAi, quantumAiHudPos]);

    // Throttling State
    const marketDataBufferRef = useRef<{ price: number; trade: any } | null>(null);
    const lastIndicatorStateRef = useRef<{
        prevEMA: number;
        prevRSI: { avgUp: number; avgDown: number; prevClose: number };
    } | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        const chart = createChart(chartContainerRef.current, {
            layout: {
                background: { type: 'solid', color: 'transparent' } as any,
                textColor: '#94a3b8',
            },
            grid: {
                vertLines: { color: 'rgba(255, 255, 255, 0.05)' },
                horzLines: { color: 'rgba(255, 255, 255, 0.05)' },
            },
            timeScale: {
                borderColor: 'rgba(255, 255, 255, 0.1)',
            },
            rightPriceScale: {
                visible: true,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: { top: 0.1, bottom: 0.2 }, // Leave bottom 20% for RSI
            },
            leftPriceScale: {
                visible: false,
                borderColor: 'rgba(255, 255, 255, 0.1)',
                scaleMargins: { top: 0.8, bottom: 0 }, // RSI takes bottom 20%
            },
        });

        const candlestickSeries = chart.addSeries(CandlestickSeries, {
            upColor: '#22c55e',
            downColor: '#ef4444',
            borderVisible: false,
            wickUpColor: '#22c55e',
            wickDownColor: '#ef4444',
            priceScaleId: 'right',
            lastValueVisible: false,
            priceLineVisible: false,
            priceFormat: {
                type: 'custom',
                minMove: 0.0000000001,
                formatter: (price: number) => {
                    if (price < 0.000001) return price.toFixed(12);
                    if (price < 0.00001) return price.toFixed(10);
                    if (price < 0.0001) return price.toFixed(8);
                    if (price < 0.001) return price.toFixed(6);
                    if (price < 1) return price.toFixed(5);
                    if (price < 10) return price.toFixed(4);
                    return price.toFixed(2);
                }
            }
        });

        const emaSeries = chart.addSeries(LineSeries, { color: '#f59e0b', lineWidth: 2, crosshairMarkerVisible: false, lastValueVisible: false, priceScaleId: 'right' });
        const bbUpperSeries = chart.addSeries(LineSeries, { color: 'rgba(56, 189, 248, 0.5)', lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceScaleId: 'right' });
        const bbMiddleSeries = chart.addSeries(LineSeries, { color: 'rgba(56, 189, 248, 0.8)', lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceScaleId: 'right' });
        const bbLowerSeries = chart.addSeries(LineSeries, { color: 'rgba(56, 189, 248, 0.5)', lineWidth: 1, crosshairMarkerVisible: false, lastValueVisible: false, priceScaleId: 'right' });
        const utBotSeries = chart.addSeries(LineSeries, { color: '#00ffff', lineWidth: 1, lineStyle: LineStyle.Solid, crosshairMarkerVisible: false, lastValueVisible: false, priceScaleId: 'right' });
        const rsiSeries = chart.addSeries(LineSeries, { color: '#db2777', lineWidth: 2, priceScaleId: 'left', crosshairMarkerVisible: false, lastValueVisible: false });
        
        const volumeSeries = chart.addSeries(HistogramSeries, {
            color: '#26a69a',
            priceFormat: {
                type: 'volume',
            },
            priceScaleId: 'volume', // Give it a separate scale
        });

        // Configure the volume price scale
        chart.priceScale('volume').applyOptions({
            scaleMargins: {
                top: 0.8, // dock to bottom 20%
                bottom: 0,
            },
            visible: false, // Don't show volume numbers on the axis to reduce clutter
        });

        chartRef.current = chart;
        candlestickSeriesRef.current = candlestickSeries;
        markersPluginRef.current = createSeriesMarkers(candlestickSeries, []);
        emaSeriesRef.current = emaSeries;
        bbUpperSeriesRef.current = bbUpperSeries;
        bbMiddleSeriesRef.current = bbMiddleSeries;
        bbLowerSeriesRef.current = bbLowerSeries;
        utBotSeriesRef.current = utBotSeries;
        rsiSeriesRef.current = rsiSeries;
        volumeSeriesRef.current = volumeSeries;

        // Fetch real historical data
        let isMounted = true;
        const fetchKlines = async () => {
            try {
                const data = await marketDepthService.getOHLCV(
                    symbol.toUpperCase(),
                    exchange,
                    interval,
                    200
                );
                
                if (!isMounted) return;

                const candles = data.map((k: any) => ({
                    time: k.time as any,
                    open: parseFloat(k.open),
                    high: parseFloat(k.high),
                    low: parseFloat(k.low),
                    close: parseFloat(k.close),
                    volume: parseFloat(k.volume || 100),
                    patterns: k.patterns || [],
                }));
                if (candlestickSeriesRef.current && isMounted) {
                    candlestickSeriesRef.current.setData(candles);
                    allCandlesRef.current = candles;
                    if (candles.length > 0) {
                        lastCandleRef.current = { ...candles[candles.length - 1] };
                    }

                    // Format and set volume data
                    if (volumeSeriesRef.current && isMounted) {
                        const volumeData = candles.map((k: any) => ({
                            time: k.time,
                            value: k.volume,
                            color: k.close >= k.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
                        }));
                        volumeSeriesRef.current.setData(volumeData);
                    }

                    chart.timeScale().fitContent();

                    // Initialize Indicators immediately after fetching history
                    if (candles.length > 0) {
                        if (indicatorSettings.showEMA && emaSeriesRef.current) {
                            emaSeriesRef.current.setData(calculateEMA(candles, indicatorSettings.emaPeriod) as any);
                        }
                        if (indicatorSettings.showBB && bbUpperSeriesRef.current && bbMiddleSeriesRef.current && bbLowerSeriesRef.current) {
                            const bbResult = calculateBollingerBands(candles, indicatorSettings.bbPeriod, indicatorSettings.bbStdDev);
                            bbUpperSeriesRef.current.setData(bbResult.map((d: any) => ({ time: d.time, value: d.upper })) as any);
                            bbMiddleSeriesRef.current.setData(bbResult.map((d: any) => ({ time: d.time, value: d.middle })) as any);
                            bbLowerSeriesRef.current.setData(bbResult.map((d: any) => ({ time: d.time, value: d.lower })) as any);
                            setBbData(bbResult);
                        }
                        if (indicatorSettings.showRSI && rsiSeriesRef.current) {
                            rsiSeriesRef.current.setData(calculateRSI(candles, indicatorSettings.rsiPeriod) as any);
                        }
                        if (indicatorSettings.showUTBot && utBotSeriesRef.current) {
                            const utData = calculateUTBotAlerts(candles, indicatorSettings.utBotSensitivity, indicatorSettings.utBotAtrPeriod, indicatorSettings.utBotUseHeikinAshi);
                            utBotSeriesRef.current.setData(utData.map(d => ({ time: d.time, value: d.trailingStop })) as any);
                            
                            // Apply default colors
                            const newCandles = candles.map(c => {
                                const utPoint = utData.find(d => d.time === c.time);
                                if (utPoint) {
                                    const color = utPoint.color === 'green' ? '#22c55e' : utPoint.color === 'red' ? '#ef4444' : '#3b82f6';
                                    return { ...c, color, wickColor: color };
                                }
                                return c;
                            });
                            candlestickSeriesRef.current.setData(newCandles);
                            allCandlesRef.current = newCandles;
                            
                            utBotMarkersRef.current = utData.filter(d => d.isBuy || d.isSell).map(d => ({
                                time: d.time,
                                position: d.isBuy ? 'belowBar' : 'aboveBar',
                                color: d.isBuy ? '#22c55e' : '#ef4444',
                                shape: d.isBuy ? 'arrowUp' : 'arrowDown',
                                text: d.isBuy ? 'BUY' : 'SELL'
                            }));
                            // Replaced by safeSetMarkers inside effect or wait to sync
                            // We can just rely on the existing interval/effects, but for instant UI update we call it
                            setTimeout(safeSetMarkers, 100);
                        }
                    }
                }
            } catch (err) {
                if (isMounted) console.error("Failed to fetch klines for heatmap:", err);
            }
        };

        fetchKlines();

        const resizeObserver = new ResizeObserver(entries => {
            if (entries.length === 0 || entries[0].target !== chartContainerRef.current) { return; }
            const newRect = entries[0].contentRect;
            chart.applyOptions({ height: newRect.height, width: newRect.width });
        });

        if (chartContainerRef.current) {
            resizeObserver.observe(chartContainerRef.current);
        }

        return () => {
            isMounted = false;
            resizeObserver.disconnect();
            chart.remove();

            // Cleanup refs so they respawn on the newly created chart instance
            candlestickSeriesRef.current = null;
            currentPriceLineRef.current = null;
            wallLinesRef.current.clear();
            lastCandleRef.current = null;
            allCandlesRef.current = [];
            emaSeriesRef.current = null;
            bbUpperSeriesRef.current = null;
            bbMiddleSeriesRef.current = null;
            bbLowerSeriesRef.current = null;
            utBotSeriesRef.current = null;
            rsiSeriesRef.current = null;
            volumeSeriesRef.current = null;
        };
    }, [symbol, interval, exchange]);

    // Update Indicators
    useEffect(() => {
        if (!emaSeriesRef.current || !bbUpperSeriesRef.current || !bbMiddleSeriesRef.current || !bbLowerSeriesRef.current || !rsiSeriesRef.current) return;

        const data = allCandlesRef.current;

        emaSeriesRef.current.applyOptions({ visible: indicatorSettings.showEMA });
        const showBB = indicatorSettings.showBB;
        bbUpperSeriesRef.current.applyOptions({ visible: showBB });
        bbMiddleSeriesRef.current.applyOptions({ visible: showBB });
        bbLowerSeriesRef.current.applyOptions({ visible: showBB });
        rsiSeriesRef.current.applyOptions({ visible: indicatorSettings.showRSI });
        if (utBotSeriesRef.current) utBotSeriesRef.current.applyOptions({ visible: indicatorSettings.showUTBot });
        
        if (chartRef.current) {
            chartRef.current.priceScale('left').applyOptions({ visible: indicatorSettings.showRSI || indicatorSettings.showMACD });
        }
        
        if (volumeSeriesRef.current) {
            volumeSeriesRef.current.applyOptions({ visible: indicatorSettings.showVolume });
        }

        if (data.length === 0) return;

        if (indicatorSettings.showEMA) {
            emaSeriesRef.current.setData(calculateEMA(data, indicatorSettings.emaPeriod) as any);
        }
        if (showBB) {
            const bbResult = calculateBollingerBands(data, indicatorSettings.bbPeriod, indicatorSettings.bbStdDev);
            bbUpperSeriesRef.current.setData(bbResult.map(d => ({ time: d.time, value: d.upper })) as any);
            bbMiddleSeriesRef.current.setData(bbResult.map(d => ({ time: d.time, value: d.middle })) as any);
            bbLowerSeriesRef.current.setData(bbResult.map(d => ({ time: d.time, value: d.lower })) as any);
            setBbData(bbResult);
        }
        if (indicatorSettings.showRSI) {
            rsiSeriesRef.current.setData(calculateRSI(data, indicatorSettings.rsiPeriod) as any);
        }
        
        if (indicatorSettings.showUTBot && utBotSeriesRef.current) {
           const utData = calculateUTBotAlerts(data, indicatorSettings.utBotSensitivity, indicatorSettings.utBotAtrPeriod, indicatorSettings.utBotUseHeikinAshi);
           utBotSeriesRef.current.setData(utData.map(d => ({ time: d.time, value: d.trailingStop })) as any);
           
           const newCandles = data.map(c => {
               const utPoint = utData.find(d => d.time === c.time);
               if (utPoint) {
                    const color = utPoint.color === 'green' ? '#22c55e' : utPoint.color === 'red' ? '#ef4444' : '#3b82f6';
                    return { ...c, color, wickColor: color };
               }
               return c;
           });
           candlestickSeriesRef.current?.setData(newCandles);
           allCandlesRef.current = newCandles;
           
           utBotMarkersRef.current = utData.filter(d => d.isBuy || d.isSell).map(d => ({
               time: d.time,
               position: d.isBuy ? 'belowBar' : 'aboveBar',
               color: d.isBuy ? '#22c55e' : '#ef4444',
               shape: d.isBuy ? 'arrowUp' : 'arrowDown',
               text: d.isBuy ? 'BUY' : 'SELL'
           }));
           
           setTimeout(safeSetMarkers, 50);
        } else if (!indicatorSettings.showUTBot && utBotSeriesRef.current) {
           const newCandles = data.map(c => ({ ...c, color: undefined, wickColor: undefined }));
           candlestickSeriesRef.current?.setData(newCandles);
           allCandlesRef.current = newCandles;
           utBotMarkersRef.current = [];
           
           setTimeout(safeSetMarkers, 50);
        }

    }, [indicatorSettings]);

    // Reference live order flow data to avoid React dependency array thrashing
    const smcDataRef = useRef({ walls, cvdData, footprintData, currentPrice });
    smcDataRef.current = { walls, cvdData, footprintData, currentPrice };

    // SMC Calculation Effect (Throttled)
    useEffect(() => {
        if (!indicatorSettings.showSMC) {
            setSmcData(null);
            return;
        }

        const smcSettings = {
            mode: indicatorSettings.smcMode,
            style: indicatorSettings.smcStyle,
            showInternals: indicatorSettings.smcShowInternals,
            internalBullFilter: indicatorSettings.smcInternalBullFilter,
            internalBearFilter: indicatorSettings.smcInternalBearFilter,
            confluenceFilter: indicatorSettings.smcConfluenceFilter,
            showSwing: indicatorSettings.smcShowSwing,
            swingBullFilter: indicatorSettings.smcSwingBullFilter,
            swingBearFilter: indicatorSettings.smcSwingBearFilter,
            showSwingPoints: false,
            swingLength: indicatorSettings.smcSwingLength,
            showStrongWeakHL: indicatorSettings.smcShowStrongWeakHL,
            showInternalOB: indicatorSettings.smcShowInternalOB,
            internalOBCount: indicatorSettings.smcInternalOBCount,
            showSwingOB: indicatorSettings.smcShowSwingOB,
            swingOBCount: indicatorSettings.smcSwingOBCount,
            obFilter: indicatorSettings.smcOBFilter,
            obMitigation: indicatorSettings.smcOBMitigation,
            showEqualHL: indicatorSettings.smcShowEqualHL,
            equalHLLength: indicatorSettings.smcEqualHLLength,
            equalHLThreshold: indicatorSettings.smcEqualHLThreshold,
            showFVG: indicatorSettings.smcShowFVG,
            fvgAutoThreshold: indicatorSettings.smcFVGAutoThreshold,
            fvgExtendBars: indicatorSettings.smcFVGExtendBars,
            showPDZones: indicatorSettings.smcShowPDZones,
            smcL2Validation: indicatorSettings.smcL2Validation,
            smcCVDTrap: indicatorSettings.smcCVDTrap,
            smcMicroFVG: indicatorSettings.smcMicroFVG,
            smcSweepDetection: indicatorSettings.smcSweepDetection,
            smcShowSwingPatterns: indicatorSettings.smcShowSwingPatterns,
        };

        let isCancelled = false;

        const runCalc = () => {
            const candles = allCandlesRef.current;
            if (candles.length < 10) return;
            const { walls: liveWalls, cvdData: liveCvd, footprintData: liveFp, currentPrice: livePx } = smcDataRef.current;
            try {
                const result = calculateSMC(candles, smcSettings as any, liveWalls as any, liveCvd, liveFp as any, livePx);
                if (!isCancelled) setSmcData(result);
            } catch (err) {
                console.warn('SMC calculation error:', err);
            }
        };

        // Run instantly immediately via setTimeout 0 to render visuals without blocking UI toggle switch
        setTimeout(runCalc, 0);

        // Throttle updates to exactly once per second, ignoring rapid sub-second WebSocket ticks
        const intervalId = setInterval(runCalc, 1000);

        return () => {
            isCancelled = true;
            clearInterval(intervalId);
        };
    }, [indicatorSettings]);

    // ICT Killzones Calculation Effect (Throttled)
    useEffect(() => {
        if (!indicatorSettings.showICTKillzones) {
            setIctData(null);
            return;
        }

        const ictConfigs = {
            sessions: [
                { id: 'asia', name: 'Asia', session: indicatorSettings.ictAsiaSession, color: '#3b82f6', enabled: true },
                { id: 'london', name: 'London', session: indicatorSettings.ictLondonSession, color: '#ef4444', enabled: true },
                { id: 'nyam', name: 'NY AM', session: indicatorSettings.ictNyAmSession, color: '#089981', enabled: true },
                { id: 'nylu', name: 'NY Lunch', session: indicatorSettings.ictNyLunchSession, color: '#f59e0b', enabled: true },
                { id: 'nypm', name: 'NY PM', session: indicatorSettings.ictNyPmSession, color: '#a855f7', enabled: true },
            ],
            openingPrices: [
                { id: 'h1', label: 'Midnight', session: '0000-0001', color: '#ffffff', enabled: indicatorSettings.ictShowMidnightOpen },
                { id: 'h2', label: '06:00', session: '0600-0601', color: '#94a3b8', enabled: true },
                { id: 'h3', label: '10:00', session: '1000-1001', color: '#94a3b8', enabled: true },
                { id: 'h4', label: '14:00', session: '1400-1401', color: '#94a3b8', enabled: true },
            ],
            timestamps: [
                { id: 'v1', session: '0000-0001', color: '#334155', enabled: true },
                { id: 'v2', session: '0830-0831', color: '#334155', enabled: true },
                { id: 'v3', session: '1000-1001', color: '#334155', enabled: true },
                { id: 'v4', session: '1200-1201', color: '#334155', enabled: true },
            ],
            showPivots: indicatorSettings.ictShowPivots,
            showDWM: indicatorSettings.ictShowDWM,
            showOpeningPrices: indicatorSettings.ictShowOpeningPrices,
            showTimestamps: indicatorSettings.ictShowTimestamps,
            pivotsExtend: indicatorSettings.ictPivotsExtend,
            showSilverBullet: indicatorSettings.ictShowSilverBullet,
            showConfluence: indicatorSettings.ictShowConfluence,
            showAMD: indicatorSettings.ictShowAMD,
            showGaps: indicatorSettings.ictShowGaps,
            showVolatility: indicatorSettings.ictShowVolatility,
            showEquilibrium: indicatorSettings.ictShowEquilibrium,
        };

        const runIctCalc = () => {
            const candles = allCandlesRef.current;
            if (candles.length < 10) return;
            try {
                const result = calculateICTSuite(candles, ictConfigs);
                setIctData(result);
            } catch (err) {
                console.warn('ICT calculation error:', err);
            }
        };

        setTimeout(runIctCalc, 0);
        const intervalId = setInterval(runIctCalc, 1000);

        return () => clearInterval(intervalId);
    }, [indicatorSettings]);

    // LuxAlgo ICT Concepts Engine
    useEffect(() => {
        if (!indicatorSettings.luxShowIndicator) {
            setLuxIctData(null);
            return;
        }

        const luxConfigs = {
            mode: indicatorSettings.luxMode,
            showMS: indicatorSettings.luxShowMS,
            swingLength: indicatorSettings.luxSwingLength,
            showMSS: indicatorSettings.luxShowMSS,
            showBOS: indicatorSettings.luxShowBOS,
            showDisplacement: indicatorSettings.luxShowDisplacement,
            percBody: indicatorSettings.luxPercBody,
            showVIMB: indicatorSettings.luxShowVIMB,
            vimbThreshold: indicatorSettings.luxVIMBThreshold,
            showOB: indicatorSettings.luxShowOB,
            obLookback: indicatorSettings.luxOBLookback,
            showBullOB: indicatorSettings.luxShowBullOB,
            showBearOB: indicatorSettings.luxShowBearOB,
            showOBLabels: indicatorSettings.luxShowOBLabels,
            showLiq: indicatorSettings.luxShowLiq,
            liqMargin: indicatorSettings.luxLiqMargin,
            liqVisibleCount: indicatorSettings.luxLiqVisibleCount,
            showFVG: indicatorSettings.luxShowFVG,
            bpr: indicatorSettings.luxBPR,
            fvgType: indicatorSettings.luxFVGType,
            fvgVisibleCount: indicatorSettings.luxFVGVisibleCount,
            showNWOG: indicatorSettings.luxShowNWOG,
            nwogMax: indicatorSettings.luxNWOGMax,
            showNDOG: indicatorSettings.luxShowNDOG,
            ndogMax: indicatorSettings.luxNDOGMax,
            fibMode: indicatorSettings.luxFibMode,
            fibExtend: indicatorSettings.luxFibExtend,
            showKillzones: indicatorSettings.luxShowKillzones,
        };

        const runLuxCalc = () => {
            const candles = allCandlesRef.current;
            if (candles.length < 10) return;
            try {
                // @ts-ignore
                const result = calculateLuxIctConcepts(candles, luxConfigs);
                setLuxIctData(result);
            } catch (err) {
                console.warn('LuxAlgo ICT calculation error:', err);
            }
        };

        setTimeout(runLuxCalc, 0);
        const intervalId = setInterval(runLuxCalc, 1000);

        return () => clearInterval(intervalId);
    }, [indicatorSettings]);

    // Supertrend Calculation Effect (Throttled)
    useEffect(() => {
        if (!indicatorSettings.showSupertrend) {
            setSupertrendData([]);
            return;
        }

        const runSupertrendCalc = () => {
            const candles = allCandlesRef.current;
            if (candles.length < 10) return;
            try {
                const result = calculateSupertrend(
                    candles, 
                    indicatorSettings.supertrendAtrPeriod, 
                    indicatorSettings.supertrendMultiplier, 
                    indicatorSettings.supertrendChangeATR
                );
                setSupertrendData(result);
            } catch (err) {
                console.warn('Supertrend calculation error:', err);
            }
        };

        setTimeout(runSupertrendCalc, 0);
        const intervalId = setInterval(runSupertrendCalc, 1000);

        return () => clearInterval(intervalId);
    }, [indicatorSettings]);

    // MSB-OB Calculation Effect (Throttled)
    useEffect(() => {
        if (!indicatorSettings.showMsbOb) {
            setMsbObData(null);
            return;
        }

        const runMsbObCalc = () => {
            const candles = allCandlesRef.current;
            if (candles.length < 10) return;
            try {
                const result = calculateMsbOb(
                    candles,
                    indicatorSettings.msbObZigzagLen,
                    indicatorSettings.msbObFibFactor,
                    indicatorSettings.msbObDeleteBroken
                );
                setMsbObData(result);
            } catch (err) {
                console.warn('MSB-OB calculation error:', err);
            }
        };

        setTimeout(runMsbObCalc, 0);
        const intervalId = setInterval(runMsbObCalc, 1000);

        return () => clearInterval(intervalId);
    }, [indicatorSettings]);

    // ── Wick Rejection S/R Calculation Effect ──
    useEffect(() => {
        let isMounted = true;
        if (!indicatorSettings.showWickSR) {
            setWickSRData(null);
            setWickSRCandles([]);
            return;
        }

        const runWickSRCalc = async () => {
            try {
                const tf = indicatorSettings.wickSRTimeframe || '5m';
                // If it's 1m, and chart is 1m, we could reuse allCandlesRef, but for true generic support, we fetch independent data series for Wick SR
                const data = await marketDepthService.getOHLCV(symbol.toUpperCase(), exchange, tf, 500);
                if (!isMounted) return;

                const formatted = data.map((k: any) => ({
                    time: k.time, open: parseFloat(k.open), high: parseFloat(k.high), 
                    low: parseFloat(k.low), close: parseFloat(k.close), volume: parseFloat(k.volume || 100)
                }));
                setWickSRCandles(formatted);

                const result = calculateWickRejectionSR(
                    formatted,
                    indicatorSettings.wickSRLookback,
                    indicatorSettings.wickSRMinTouches,
                    indicatorSettings.wickSRAtrPeriod,
                    indicatorSettings.wickSRAtrMultiplier,
                );
                setWickSRData(result);
            } catch (err) {
                console.warn('[WickSR] Calculation error:', err);
            }
        };

        // Run immediately, then throttle updates
        setTimeout(runWickSRCalc, 0);
        // Throttle updates purely based on timeframe (e.g., polling every 10s is sufficient, as HTF wicks don't change natively per ms)
        const intervalId = setInterval(runWickSRCalc, 10000);
        return () => {
            isMounted = false;
            clearInterval(intervalId);
        };
    }, [indicatorSettings.showWickSR, indicatorSettings.wickSRTimeframe, indicatorSettings.wickSRLookback, indicatorSettings.wickSRMinTouches, indicatorSettings.wickSRAtrPeriod, indicatorSettings.wickSRAtrMultiplier, symbol, exchange]);

    // ── Quantum AI v8 Calculation Effect ──
    useEffect(() => {
        if (!indicatorSettings.showQuantumAI) {
            setQuantumAiData([]);
            return;
        }

        const runQuantumCalc = () => {
            const candles = allCandlesRef.current;
            if (!candles || candles.length < 200) return;
            try {
                const pocPrice = vpvrData && vpvrData.length > 0 ? vpvrData.reduce((max, row) => (row.volume > max.volume ? row : max), vpvrData[0]).price : 0;
                const results = calculateQuantumAi(candles, {
                    showQuantumAI: indicatorSettings.showQuantumAI,
                    quantumMinConf: indicatorSettings.quantumMinConf,
                    quantumVolatilityFilter: indicatorSettings.quantumVolatilityFilter,
                    quantumVolThreshold: indicatorSettings.quantumVolThreshold,
                }, pocPrice);
                setQuantumAiData(results);
            } catch (err) {
                console.warn('Quantum AI calculation error:', err);
            }
        };

        setTimeout(runQuantumCalc, 0);
        const intervalId = setInterval(runQuantumCalc, 2000);

        return () => clearInterval(intervalId);
    }, [indicatorSettings]);

    // ── Safe Marker Setter Utility ──
    const safeSetMarkers = () => {
        if (!markersPluginRef.current) return;
        const allMarkers = [
            ...botTradeMarkersRef.current,
            ...utBotMarkersRef.current,
            ...quantumAiMarkersRef.current,
            ...patternMarkersRef.current,
        ];
        
        const grouped = allMarkers.reduce((acc, curr) => {
             if (!acc[curr.time]) acc[curr.time] = [];
             acc[curr.time].push(curr);
             return acc;
        }, {} as Record<string, any[]>);
        
        const deduplicatedMarkers = Object.keys(grouped).map(timeStr => {
             const items = grouped[timeStr];
             const bullItems = items.filter(i => i.position === 'belowBar');
             const bearItems = items.filter(i => i.position === 'aboveBar');
             const inItems = items.filter(i => i.position === 'inBar');
             
             const final = [];
             if (bullItems.length > 0) final.push({ ...bullItems[0], text: Array.from(new Set(bullItems.map(i => i.text))).filter(t => t).join(', ') });
             if (bearItems.length > 0) final.push({ ...bearItems[0], text: Array.from(new Set(bearItems.map(i => i.text))).filter(t => t).join(', ') });
             if (inItems.length > 0) final.push({ ...inItems[0], text: Array.from(new Set(inItems.map(i => i.text))).filter(t => t).join(', ') });
             return final;
        }).flat().sort((a, b) => a.time - b.time);
        
        try {
            markersPluginRef.current.setMarkers(deduplicatedMarkers);
        } catch (err) {
            console.error('Failed to set markers:', err);
        }
    };

    // ── Quantum AI Marker Rendering Effect ──
    useEffect(() => {
        if (!markersPluginRef.current) return;
        if (!indicatorSettings.showQuantumAI || quantumAiData.length === 0) {
            quantumAiMarkersRef.current = [];
        } else {
            quantumAiMarkersRef.current = quantumAiData
                .filter(d => d.bullEntry || d.bearEntry)
                .map(d => ({
                    time: d.time,
                    position: d.bullEntry ? 'belowBar' : 'aboveBar',
                    color: d.bullEntry ? '#a855f7' : '#ec4899', // purple for bull, pink for bear
                    shape: d.bullEntry ? 'arrowUp' : 'arrowDown',
                    text: d.bullEntry 
                        ? `⚡ ${Math.round(d.bullConfidence)}%` 
                        : `⚡ ${Math.round(d.bearConfidence)}%`,
                }));
        }
        safeSetMarkers();
    }, [quantumAiData, indicatorSettings.showQuantumAI]);

    // ── Candlestick Pattern Interval & Marker Data ──
    useEffect(() => {
        if (!indicatorSettings.showCandlestickPatterns) {
            setPatternData([]);
            return;
        }

        const runPatternExtraction = () => {
            const candles = allCandlesRef.current;
            if (candles.length === 0) return;
            const markers: any[] = [];
            candles.forEach(c => {
                if (c.patterns && c.patterns.length > 0) {
                    c.patterns.forEach((p: any) => {
                        const isBullish = p.direction === 'bullish';
                        markers.push({
                            time: c.time,
                            position: isBullish ? 'belowBar' : 'aboveBar',
                            color: isBullish ? '#22c55e' : '#ef4444',
                            shape: isBullish ? 'arrowUp' : 'arrowDown',
                            text: p.name
                        });
                    });
                }
            });
            setPatternData(markers);
        };

        setTimeout(runPatternExtraction, 0);
        const pid = setInterval(runPatternExtraction, 2000);
        return () => clearInterval(pid);
    }, [indicatorSettings.showCandlestickPatterns]);

    useEffect(() => {
        if (!markersPluginRef.current) return;
        if (!indicatorSettings.showCandlestickPatterns) {
            patternMarkersRef.current = [];
        } else {
            patternMarkersRef.current = patternData;
        }
        safeSetMarkers();
    }, [patternData, indicatorSettings.showCandlestickPatterns]);

    // Buffer market data updates
    useEffect(() => {
        if (!currentPrice && !tradeEvent) return;
        marketDataBufferRef.current = {
            price: currentPrice || (marketDataBufferRef.current?.price || 0),
            trade: tradeEvent || (marketDataBufferRef.current?.trade || null)
        };
    }, [currentPrice, tradeEvent]);

    // Throttled Chart and Indicator Updates (every 300ms)
    useEffect(() => {
        const updateInterval = setInterval(() => {
            const bufferedData = marketDataBufferRef.current;
            if (!bufferedData || !candlestickSeriesRef.current || !lastCandleRef.current) return;
            
            // Reset buffer after capturing
            marketDataBufferRef.current = null;

            const { price: latestPrice, trade: latestTrade } = bufferedData;
            let needsUpdate = false;
            let isNewCandle = false;
            const lastCandle = lastCandleRef.current as any;
            
            let newClose = lastCandle.close;
            let newHigh = lastCandle.high;
            let newLow = lastCandle.low;
            let newVolume = lastCandle.volume || 0;
            let eventTimestamp = Date.now();

            // Update from trade event
            if (latestTrade && latestTrade.price > 0 && !isNaN(latestTrade.price) && latestTrade !== lastTradeEventRef.current) {
                newClose = latestTrade.price;
                newHigh = Math.max(newHigh, latestTrade.price);
                newLow = Math.min(newLow, latestTrade.price);
                newVolume += (latestTrade.volume || 0);
                eventTimestamp = latestTrade.timestamp || Date.now();
                lastTradeEventRef.current = latestTrade;
                needsUpdate = true;
            }

            // Update from price tick
            if (latestPrice && latestPrice > 0 && !isNaN(latestPrice) && latestPrice !== lastProcessedPriceRef.current) {
                newClose = latestPrice;
                newHigh = Math.max(newHigh, latestPrice);
                newLow = Math.min(newLow, latestPrice);
                lastProcessedPriceRef.current = latestPrice;
                needsUpdate = true;
            }

            if (!needsUpdate) return;

            const intervalMs = parseIntervalToMs(interval);
            let candleTimeMs = lastCandle.time as number;
            const isSeconds = candleTimeMs < 10000000000;
            if (isSeconds) candleTimeMs *= 1000;

            let updatedCandle: any;

            if (eventTimestamp >= candleTimeMs + intervalMs) {
                // Crosses the timeframe boundary, create a new candle
                const nextCandleTimeMs = Math.floor(eventTimestamp / intervalMs) * intervalMs;
                const startPrice = newClose;
                updatedCandle = {
                    time: isSeconds ? Math.floor(nextCandleTimeMs / 1000) : nextCandleTimeMs,
                    open: lastCandle.close,
                    high: startPrice,
                    low: startPrice,
                    close: startPrice,
                    volume: (latestTrade && latestTrade.price > 0) ? latestTrade.volume : 0,
                };
                isNewCandle = true;

                // No need to track indicator state manually anymore
            } else {
                updatedCandle = {
                    ...lastCandle,
                    close: newClose,
                    high: newHigh,
                    low: newLow,
                    volume: newVolume,
                };
            }

            try {
                candlestickSeriesRef.current.update(updatedCandle);
                lastCandleRef.current = updatedCandle;

                if (volumeSeriesRef.current) {
                    volumeSeriesRef.current.update({
                        time: updatedCandle.time,
                        value: updatedCandle.volume,
                        color: updatedCandle.close >= updatedCandle.open ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'
                    });
                }

                const len = allCandlesRef.current.length;
                const MAX_CANDLES = 2000;
                
                if (isNewCandle) {
                    allCandlesRef.current.push(updatedCandle);
                    // Prevent memory leak by limiting array size
                    if (allCandlesRef.current.length > MAX_CANDLES) {
                        allCandlesRef.current = allCandlesRef.current.slice(-MAX_CANDLES);
                    }
                } else if (len > 0 && allCandlesRef.current[len - 1].time === updatedCandle.time) {
                    allCandlesRef.current[len - 1] = updatedCandle;
                }

                // --- ACCELERATED INDICATOR INJECTION ON NEW DATA ---
                // Fetch the latest processed indicators and update the Canvas using O(1) point updates 
                // Instead of completely destroying and remounting the entire visual line chart every 300ms.
                const curData = allCandlesRef.current;
                if (curData.length > 0) {
                    if (indicatorSettings.showEMA && emaSeriesRef.current) {
                        const emaData = calculateEMA(curData, indicatorSettings.emaPeriod);
                        if (emaData.length > 0) emaSeriesRef.current.update(emaData[emaData.length - 1] as any);
                    }
                    if (indicatorSettings.showBB && bbUpperSeriesRef.current && bbMiddleSeriesRef.current && bbLowerSeriesRef.current) {
                        const bbData = calculateBollingerBands(curData, indicatorSettings.bbPeriod, indicatorSettings.bbStdDev);
                        if (bbData.length > 0) {
                            const lastBB = bbData[bbData.length - 1];
                            bbUpperSeriesRef.current.update({ time: lastBB.time, value: lastBB.upper } as any);
                            bbMiddleSeriesRef.current.update({ time: lastBB.time, value: lastBB.middle } as any);
                            bbLowerSeriesRef.current.update({ time: lastBB.time, value: lastBB.lower } as any);
                        }
                    }
                    if (indicatorSettings.showRSI && rsiSeriesRef.current) {
                        const rsiData = calculateRSI(curData, indicatorSettings.rsiPeriod);
                        if (rsiData.length > 0) rsiSeriesRef.current.update(rsiData[rsiData.length - 1] as any);
                    }
                    if (indicatorSettings.showUTBot && utBotSeriesRef.current) {
                        const utData = calculateUTBotAlerts(curData, indicatorSettings.utBotSensitivity, indicatorSettings.utBotAtrPeriod, indicatorSettings.utBotUseHeikinAshi);
                        if (utData.length > 0) {
                            const lastUT = utData[utData.length - 1];
                            utBotSeriesRef.current.update({ time: lastUT.time, value: lastUT.trailingStop } as any);
                            
                            const candleColor = lastUT.color === 'green' ? '#22c55e' : lastUT.color === 'red' ? '#ef4444' : '#3b82f6';
                            allCandlesRef.current[allCandlesRef.current.length - 1] = {
                                ...updatedCandle,
                                color: candleColor,
                                wickColor: candleColor
                            };
                            candlestickSeriesRef.current.update(allCandlesRef.current[allCandlesRef.current.length - 1]);
                            
                            const newMarkers = utData.filter(d => d.isBuy || d.isSell).map(d => ({
                                time: d.time,
                                position: d.isBuy ? 'belowBar' : 'aboveBar',
                                color: d.isBuy ? '#22c55e' : '#ef4444',
                                shape: d.isBuy ? 'arrowUp' : 'arrowDown',
                                text: d.isBuy ? 'BUY' : 'SELL'
                            }));
                            utBotMarkersRef.current = newMarkers;
                            
                            const allMarkers = [...botTradeMarkersRef.current, ...utBotMarkersRef.current].sort((a, b) => a.time - b.time);
                            markersPluginRef.current?.setMarkers(allMarkers);
                        }
                    }

                    // --- SESSIONS CALCULATION (Throttled) ---
                    if (indicatorSettings.showSessions) {
                        const sessData = allCandlesRef.current;
                        const tz = indicatorSettings.timezoneOffset || 0;
                        
                        const sa = calculateSessions(sessData, indicatorSettings.sessionA.session, tz);
                        const sb = calculateSessions(sessData, indicatorSettings.sessionB.session, tz);
                        const sc = calculateSessions(sessData, indicatorSettings.sessionC.session, tz);
                        const sd = calculateSessions(sessData, indicatorSettings.sessionD.session, tz);

                        setSessionsData({ a: sa, b: sb, c: sc, d: sd });

                        const lastA = sa[sa.length - 1];
                        const lastB = sb[sb.length - 1];
                        const lastC = sc[sc.length - 1];
                        const lastD = sd[sd.length - 1];

                        setSessionStatuses([
                            { name: indicatorSettings.sessionA.name, isActive: lastA?.isSession || false, color: indicatorSettings.sessionA.color, r2: lastA?.linReg?.r2 || null, stdev: lastA?.linReg?.stdev || null, volume: null },
                            { name: indicatorSettings.sessionB.name, isActive: lastB?.isSession || false, color: indicatorSettings.sessionB.color, r2: lastB?.linReg?.r2 || null, stdev: lastB?.linReg?.stdev || null, volume: null },
                            { name: indicatorSettings.sessionC.name, isActive: lastC?.isSession || false, color: indicatorSettings.sessionC.color, r2: lastC?.linReg?.r2 || null, stdev: lastC?.linReg?.stdev || null, volume: null },
                            { name: indicatorSettings.sessionD.name, isActive: lastD?.isSession || false, color: indicatorSettings.sessionD.color, r2: lastD?.linReg?.r2 || null, stdev: lastD?.linReg?.stdev || null, volume: null },
                        ]);
                    }
                }
            } catch (e) {
                console.error("Failed to update realtime candle and indicators", e);
            }
        }, 300);

        return () => clearInterval(updateInterval);
    }, [interval, indicatorSettings]);

    // Auto Fibonacci Indicator
    useEffect(() => {
        if (!indicatorSettings.showAutoFibo || allCandlesRef.current.length === 0) {
            setFiboData(null);
            return;
        }

        const data = allCandlesRef.current;
        const lookback = Math.min(indicatorSettings.autoFiboLookback, data.length);
        const windowData = data.slice(-lookback);
        
        let highest = -Infinity;
        let lowest = Infinity;
        let highTime = 0;
        let lowTime = 0;
        
        for (let i = 0; i < windowData.length; i++) {
            if (windowData[i].high > highest) {
                highest = windowData[i].high;
                highTime = windowData[i].time;
            }
            if (windowData[i].low < lowest) {
                lowest = windowData[i].low;
                lowTime = windowData[i].time;
            }
        }

        if (highest === lowest) {
            setFiboData(null);
            return;
        }

        const diff = highest - lowest;
        // Match the colors and levels from standard premium trading tools (like the user image)
        const levels = [
            { level: 0, title: '0% (Low)', color: '#ffffff', cloudColor: 'rgba(239, 68, 68, 0.15)' },
            { level: 0.236, title: '23.6%', color: '#ef4444', cloudColor: 'rgba(132, 204, 22, 0.15)' },
            { level: 0.382, title: '38.2%', color: '#84cc16', cloudColor: 'rgba(34, 197, 94, 0.15)' },
            { level: 0.5, title: '50.0%', color: '#22c55e', cloudColor: 'rgba(20, 184, 166, 0.15)' },
            { level: 0.618, title: '61.8%', color: '#14b8a6', cloudColor: 'rgba(59, 130, 246, 0.15)' },
            { level: 0.786, title: '78.6%', color: '#3b82f6', cloudColor: 'rgba(156, 163, 175, 0.15)' },
            { level: 1, title: '100% (High)', color: '#ffffff', cloudColor: 'rgba(0,0,0,0)' }
        ].map(l => ({
            ...l,
            price: lowest + diff * l.level
        }));

        setFiboData({
            highest,
            lowest,
            highTime,
            lowTime,
            levels
        });

    }, [indicatorSettings.showAutoFibo, indicatorSettings.autoFiboLookback, allCandlesRef.current.length, currentPrice]);

    // Ichimoku Cloud Calculation
    useEffect(() => {
        if (!indicatorSettings.showIchimoku || allCandlesRef.current.length === 0) {
            setIchimokuData([]);
            return;
        }

        const data = allCandlesRef.current;
        const result = calculateIchimoku(
            data,
            indicatorSettings.tenkanPeriod,
            indicatorSettings.kijunPeriod,
            indicatorSettings.senkouBPeriod,
            indicatorSettings.displacement
        );
        setIchimokuData(result);
    }, [
        indicatorSettings.showIchimoku,
        indicatorSettings.tenkanPeriod,
        indicatorSettings.kijunPeriod,
        indicatorSettings.senkouBPeriod,
        indicatorSettings.displacement,
        allCandlesRef.current.length,
        currentPrice
    ]);

    // Adaptive Trend Finder Calculation
    useEffect(() => {
        if (!indicatorSettings.showTrendFinder || allCandlesRef.current.length === 0) {
            setTrendFinderData(null);
            return;
        }

        const result = calculateAdaptiveTrendFinder(
            allCandlesRef.current,
            indicatorSettings.trendFinderLookback,
            indicatorSettings.trendFinderDev,
            indicatorSettings.trendFinderThreshold,
            indicatorSettings.enableTrendFinderVolumeFilter,
            indicatorSettings.trendFinderVolumeMultiplier
        );
        setTrendFinderData(result);
    }, [
        indicatorSettings.showTrendFinder,
        indicatorSettings.trendFinderLookback,
        indicatorSettings.trendFinderDev,
        allCandlesRef.current.length,
        currentPrice
    ]);

    // Update horizontal price lines for walls intelligently without blindly clearing
    useEffect(() => {
        if (!candlestickSeriesRef.current || !chartRef.current) return;

        const currentLineKeys = new Set<string>();

        // 1. Process Order Book Walls
        walls.forEach(wall => {
            const key = `wall-${wall.type}-${wall.price}`;
            currentLineKeys.add(key);

            const isBuy = wall.type === 'buy';
            const wallVolume = wall.size ?? 0;
            const showLabel = wallVolume >= 5_000_000;

            if (!wallLinesRef.current.has(key)) {
                // Create new line
                const priceLine = candlestickSeriesRef.current?.createPriceLine({
                    price: wall.price,
                    color: isBuy ? 'rgba(34, 197, 94, 0.45)' : 'rgba(239, 68, 68, 0.45)',
                    lineWidth: 1,
                    lineStyle: 1, // Dotted
                    axisLabelVisible: showLabel,
                    title: showLabel ? `${(wallVolume / 1_000_000).toFixed(1)}M` : '',
                });
                if (priceLine) wallLinesRef.current.set(key, priceLine);
            } else {
                // Update label visibility on existing line (e.g. after volume threshold change)
                const existingLine = wallLinesRef.current.get(key);
                existingLine?.applyOptions({
                    axisLabelVisible: showLabel,
                    title: showLabel ? `${(wallVolume / 1_000_000).toFixed(1)}M` : '',
                });
            }
        });

        // 2. Process Bot Status Lines
        if (botStatus && botStatus.position) {
            if (botStatus.entry_price && botStatus.entry_price > 0) {
                const epKey = 'bot-entry';
                currentLineKeys.add(epKey);
                if (!wallLinesRef.current.has(epKey)) {
                    const epLine = candlestickSeriesRef.current?.createPriceLine({
                        price: botStatus.entry_price,
                        color: '#f59e0b', // Golden
                        lineWidth: 2,
                        lineStyle: 2, // Dashed
                        axisLabelVisible: true,
                        title: 'BOT ENTRY',
                    });
                    if (epLine) wallLinesRef.current.set(epKey, epLine);
                } else {
                    // Update price if trailing/changed
                    const line = wallLinesRef.current.get(epKey);
                    line.applyOptions({ price: botStatus.entry_price });
                }
            }

            if (botStatus.tp_price && botStatus.tp_price > 0) {
                const tpKey = 'bot-tp';
                currentLineKeys.add(tpKey);
                if (!wallLinesRef.current.has(tpKey)) {
                    const tpLine = candlestickSeriesRef.current?.createPriceLine({
                        price: botStatus.tp_price,
                        color: '#22c55e', // Green
                        lineWidth: 2,
                        lineStyle: 1, // Dotted
                        axisLabelVisible: true,
                        title: 'BOT TP',
                    });
                    if (tpLine) wallLinesRef.current.set(tpKey, tpLine);
                } else {
                    const line = wallLinesRef.current.get(tpKey);
                    line.applyOptions({ price: botStatus.tp_price });
                }
            }

            if (botStatus.sl_price && botStatus.sl_price > 0) {
                const slKey = 'bot-sl';
                currentLineKeys.add(slKey);
                if (!wallLinesRef.current.has(slKey)) {
                    const slLine = candlestickSeriesRef.current?.createPriceLine({
                        price: botStatus.sl_price,
                        color: '#ef4444', // Red
                        lineWidth: 2,
                        lineStyle: 1, // Dotted
                        axisLabelVisible: true,
                        title: 'BOT TSL',
                    });
                    if (slLine) wallLinesRef.current.set(slKey, slLine);
                } else {
                    const line = wallLinesRef.current.get(slKey);
                    line.applyOptions({ price: botStatus.sl_price });
                }
            }
        }

        // 3. Cleanup Stale Lines (Lines that exist in Map but aren't in currentLineKeys)
        for (const [key, line] of wallLinesRef.current.entries()) {
            // Ignore order lines, they are managed by the next useEffect
            if (key.startsWith('order-')) continue;
            
            if (!currentLineKeys.has(key)) {
                try {
                    candlestickSeriesRef.current?.removePriceLine(line);
                } catch (e) {
                    // Ignore errors if line was already removed internally
                }
                wallLinesRef.current.delete(key);
            }
        }

    }, [walls, botStatus]);

    // Open Limit Orders — color-coded horizontal price lines
    useEffect(() => {
        if (!candlestickSeriesRef.current) return;

        const orderKeys = new Set<string>();

        openOrders.forEach(order => {
            if (!order.price || order.price <= 0) return;
            const key = `order-${order.id}`;
            orderKeys.add(key);

            const isBuy = order.side === 'buy';
            const color = isBuy ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
            const label = `${isBuy ? '▲ BUY' : '▼ SELL'} ${order.remaining > 0 ? order.remaining.toFixed(4) : order.amount.toFixed(4)}`;

            if (!wallLinesRef.current.has(key)) {
                const line = candlestickSeriesRef.current?.createPriceLine({
                    price: order.price,
                    color,
                    lineWidth: 1,
                    lineStyle: 2, // Dashed
                    axisLabelVisible: true,
                    title: label,
                });
                if (line) wallLinesRef.current.set(key, line);
            } else {
                wallLinesRef.current.get(key)?.applyOptions({ price: order.price, title: label, color });
            }
        });

        // Cleanup stale order lines
        for (const [key, line] of wallLinesRef.current.entries()) {
            if (key.startsWith('order-') && !orderKeys.has(key)) {
                try { candlestickSeriesRef.current?.removePriceLine(line); } catch { /* ignore */ }
                wallLinesRef.current.delete(key);
            }
        }
    }, [openOrders]);



    // Custom Current Price Line (Black Label)
    useEffect(() => {
        if (!candlestickSeriesRef.current || currentPrice <= 0) return;

        if (!currentPriceLineRef.current) {
            currentPriceLineRef.current = candlestickSeriesRef.current.createPriceLine({
                price: currentPrice,
                color: '#3b82f6', // Tailwind blue-500 for the line
                lineWidth: 1,
                lineStyle: 1, // Dotted
                axisLabelVisible: true,
                title: '',
                axisLabelColor: '#000000', // Black background
                axisLabelTextColor: '#ffffff', // White text
            });
        } else {
            currentPriceLineRef.current.applyOptions({ price: currentPrice });
        }
    }, [currentPrice]);

    // Update Trade & Absorption Markers
    useEffect(() => {
        if (!botStatus || !candlestickSeriesRef.current || !lastCandleRef.current) return;

        const isPositionOpen = botStatus.position;
        const wasPositionOpen = prevPositionRef.current;
        let markersChanged = false;

        // 1. Position Markers (BUY/SELL)
        if (isPositionOpen && !wasPositionOpen) {
            botTradeMarkersRef.current.push({
                time: lastCandleRef.current.time,
                position: 'belowBar',
                color: '#f59e0b',
                shape: 'arrowUp',
                text: 'BOT ENTRY',
            });
            markersChanged = true;
        } else if (!isPositionOpen && wasPositionOpen) {
            botTradeMarkersRef.current.push({
                time: lastCandleRef.current.time,
                position: 'aboveBar',
                color: '#3b82f6',
                shape: 'arrowDown',
                text: 'BOT CLOSE',
            });
            markersChanged = true;
        }

        // 2. Absorption Markers (CVD Confirmation)
        if (botStatus.is_absorbing) {
            // Only add if not recently added for the same candle to avoid spam
            const lastMarker = botTradeMarkersRef.current[botTradeMarkersRef.current.length - 1];
            if (!lastMarker || lastMarker.time !== lastCandleRef.current.time || lastMarker.text !== 'ABSORPTION') {
                botTradeMarkersRef.current.push({
                    time: lastCandleRef.current.time,
                    position: 'inBar',
                    color: '#f59e0b',
                    shape: 'circle',
                    text: 'ABSORPTION',
                });
                markersChanged = true;
            }
        }

        if (markersChanged) {
            botTradeMarkersRef.current.sort((a, b) => a.time - b.time);
            if (botTradeMarkersRef.current.length > 100) {
                botTradeMarkersRef.current = botTradeMarkersRef.current.slice(-100);
            }
            const allMarkers = [...botTradeMarkersRef.current, ...utBotMarkersRef.current].sort((a, b) => a.time - b.time);
            markersPluginRef.current?.setMarkers(allMarkers);
        }

        prevPositionRef.current = isPositionOpen;
    }, [botStatus]);

    // Countdown Timer logic
    useEffect(() => {
        const intervalMs = parseIntervalToMs(interval);

        const tick = () => {
            const now = Date.now();
            let remaining = 0;

            if (lastCandleRef.current && lastCandleRef.current.time) {
                let candleTimeMs = lastCandleRef.current.time as number;
                // If the timestamp is in seconds, convert to ms
                if (candleTimeMs < 10000000000) {
                    candleTimeMs = candleTimeMs * 1000;
                }
                const nextCandleTimeMs = candleTimeMs + intervalMs;
                remaining = nextCandleTimeMs - now;
            } else {
                const nextBoundary = Math.ceil(now / intervalMs) * intervalMs;
                remaining = nextBoundary - now;
            }

            if (remaining < 0) remaining = 0;

            const h = Math.floor(remaining / (1000 * 60 * 60));
            const m = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
            const s = Math.floor((remaining % (1000 * 60)) / 1000);

            if (h > 0) {
                setCountdownFormatted(`${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            } else {
                setCountdownFormatted(`${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`);
            }
        };

        tick();
        const timerId = setInterval(tick, 1000);
        return () => clearInterval(timerId);
    }, [interval]);

    return (
        <div className="w-full h-full flex flex-col absolute inset-0">
            <div className="flex-1 relative">
                <div ref={chartContainerRef} className="w-full h-full absolute inset-0 z-0" />
                <div className="absolute inset-0 z-10 pointer-events-none overflow-hidden" style={{ right: 60, bottom: 26 }}>
                    <GodModeHUD data={godModeData} visible={indicatorSettings.showLiquidationHeatmap} />
                    <DualEngineDashboard settings={indicatorSettings} candles={allCandlesRef.current} currentPrice={currentPrice} />
                    <WatchlistScanner settings={indicatorSettings} exchange={exchange} interval={interval} />
                    <LiquidityHeatmapRenderer chart={chartRef.current} series={candlestickSeriesRef.current} data={realHeatmapData} />
                    <FibonacciCloudRenderer chart={chartRef.current} series={candlestickSeriesRef.current} data={fiboData} />
                    <BollingerBandsRenderer chart={chartRef.current} series={candlestickSeriesRef.current} data={bbData} visible={indicatorSettings.showBB} />
                <MACDRenderer 
                    chart={chartRef.current} 
                    data={allCandlesRef.current} 
                    visible={indicatorSettings.showMACD}
                    fast={indicatorSettings.macdFast}
                    slow={indicatorSettings.macdSlow}
                    signal={indicatorSettings.macdSignal}
                />
                    <IchimokuRenderer chart={chartRef.current} series={candlestickSeriesRef.current} data={ichimokuData} displacement={indicatorSettings.displacement} />
                    <TrendFinderRenderer 
                        chart={chartRef.current} 
                        series={candlestickSeriesRef.current} 
                        data={trendFinderData} 
                        visible={indicatorSettings.showTrendFinder} 
                        threshold={indicatorSettings.trendFinderThreshold}
                        hideLowConfidenceTrend={indicatorSettings.hideLowConfidenceTrend}
                    />
                    {showFootprint && <FootprintRenderer chart={chartRef.current} series={candlestickSeriesRef.current} data={footprintData} visible={showFootprint} />}
                    {indicatorSettings.showLiquidationHeatmap && (
                        <LiquidationRenderer
                            chart={chartRef.current}
                            series={candlestickSeriesRef.current}
                            data={godModeData}
                            showBubbles={indicatorSettings.liquidationShowBubbles}
                            intensityScale={indicatorSettings.liquidationHeatmapIntensity}
                        />
                    )}
                    {indicatorSettings.showSessions && (
                        <SessionsRenderer 
                            chart={chartRef.current} 
                            series={candlestickSeriesRef.current} 
                            sessionsData={sessionsData} 
                            settings={indicatorSettings} 
                        />
                    )}
                    <SMCRenderer
                        chart={chartRef.current}
                        series={candlestickSeriesRef.current}
                        data={smcData}
                        settings={{
                            mode: indicatorSettings.smcMode,
                            style: indicatorSettings.smcStyle,
                            showInternals: indicatorSettings.smcShowInternals,
                            internalBullFilter: indicatorSettings.smcInternalBullFilter,
                            internalBearFilter: indicatorSettings.smcInternalBearFilter,
                            confluenceFilter: indicatorSettings.smcConfluenceFilter,
                            showSwing: indicatorSettings.smcShowSwing,
                            swingBullFilter: indicatorSettings.smcSwingBullFilter,
                            swingBearFilter: indicatorSettings.smcSwingBearFilter,
                            showSwingPoints: false,
                            swingLength: indicatorSettings.smcSwingLength,
                            showStrongWeakHL: indicatorSettings.smcShowStrongWeakHL,
                            showInternalOB: indicatorSettings.smcShowInternalOB,
                            internalOBCount: indicatorSettings.smcInternalOBCount,
                            showSwingOB: indicatorSettings.smcShowSwingOB,
                            swingOBCount: indicatorSettings.smcSwingOBCount,
                            obFilter: indicatorSettings.smcOBFilter,
                            obMitigation: indicatorSettings.smcOBMitigation,
                            showEqualHL: indicatorSettings.smcShowEqualHL,
                            equalHLLength: indicatorSettings.smcEqualHLLength,
                            equalHLThreshold: indicatorSettings.smcEqualHLThreshold,
                            showFVG: indicatorSettings.smcShowFVG,
                            fvgAutoThreshold: indicatorSettings.smcFVGAutoThreshold,
                            fvgExtendBars: indicatorSettings.smcFVGExtendBars,
                            showPDZones: indicatorSettings.smcShowPDZones,
                        }}
                        visible={indicatorSettings.showSMC}
                    />
                    {(indicatorSettings.showICTKillzones || indicatorSettings.luxShowKillzones) && (
                        <ICTKillzonesRenderer
                            chart={chartRef.current}
                            series={candlestickSeriesRef.current}
                            data={ictData}
                            visible={indicatorSettings.showICTKillzones || indicatorSettings.luxShowIndicator}
                            settings={indicatorSettings}
                        />
                    )}
                    <LuxIctRenderer
                        chart={chartRef.current}
                        series={candlestickSeriesRef.current}
                        luxIctData={luxIctData}
                        configs={{
                            mode: indicatorSettings.luxMode,
                            showMS: indicatorSettings.luxShowMS,
                            swingLength: indicatorSettings.luxSwingLength,
                            showMSS: indicatorSettings.luxShowMSS,
                            showBOS: indicatorSettings.luxShowBOS,
                            showDisplacement: indicatorSettings.luxShowDisplacement,
                            percBody: indicatorSettings.luxPercBody,
                            showVIMB: indicatorSettings.luxShowVIMB,
                            vimbThreshold: indicatorSettings.luxVIMBThreshold,
                            showOB: indicatorSettings.luxShowOB,
                            obLookback: indicatorSettings.luxOBLookback,
                            showBullOB: indicatorSettings.luxShowBullOB,
                            showBearOB: indicatorSettings.luxShowBearOB,
                            showOBLabels: indicatorSettings.luxShowOBLabels,
                            showLiq: indicatorSettings.luxShowLiq,
                            liqMargin: indicatorSettings.luxLiqMargin,
                            liqVisibleCount: indicatorSettings.luxLiqVisibleCount,
                            showFVG: indicatorSettings.luxShowFVG,
                            bpr: indicatorSettings.luxBPR,
                            fvgType: indicatorSettings.luxFVGType,
                            fvgVisibleCount: indicatorSettings.luxFVGVisibleCount,
                            showNWOG: indicatorSettings.luxShowNWOG,
                            nwogMax: indicatorSettings.luxNWOGMax,
                            showNDOG: indicatorSettings.luxShowNDOG,
                            ndogMax: indicatorSettings.luxNDOGMax,
                            fibMode: indicatorSettings.luxFibMode,
                            fibExtend: indicatorSettings.luxFibExtend,
                            showKillzones: indicatorSettings.luxShowKillzones,
                            luxShowIndicator: indicatorSettings.luxShowIndicator,
                        } as any}
                        visibleLogicalRange={chartRef.current?.timeScale().getVisibleLogicalRange()}
                    />
                    <SupertrendRenderer 
                        chart={chartRef.current} 
                        series={candlestickSeriesRef.current} 
                        data={supertrendData} 
                        ohlcData={allCandlesRef.current}
                        showSignals={indicatorSettings.supertrendShowSignals}
                        highlighter={indicatorSettings.supertrendHighlighting}
                    />
                    {indicatorSettings.showMsbOb && msbObData && (
                        <MsbObRenderer 
                            chart={chartRef.current} 
                            series={candlestickSeriesRef.current} 
                            data={msbObData} 
                            ohlcData={allCandlesRef.current}
                            showZigzag={indicatorSettings.msbObShowZigzag}
                        />
                    )}
                    {/* Wick Rejection Support & Resistance */}
                    <WickSRRenderer
                        chart={chartRef.current}
                        series={candlestickSeriesRef.current}
                        data={wickSRData}
                        showZones={indicatorSettings.wickSRShowZones}
                        showLabels={indicatorSettings.wickSRShowLabels}
                        visible={indicatorSettings.showWickSR}
                    />
                </div>
                <SessionsDashboard settings={indicatorSettings} statuses={sessionStatuses} />
                <VolumeProfileWidget chart={chartRef.current} series={candlestickSeriesRef.current} data={vpvrData} />

                {/* ── Quantum AI v8 Dashboard HUD ── */}
                {indicatorSettings.showQuantumAI && quantumAiData.length > 0 && (() => {
                    const last = quantumAiData[quantumAiData.length - 1];
                    const hasSignal = last.bullEntry || last.bearEntry;
                    const isBull = last.bullEntry;
                    const conf = isBull ? last.bullConfidence : last.bearConfidence;
                    const qp = Math.round(last.quantumPower);

                    // Helpers
                    const HudDot = ({ color }: { color: string }) => (
                        <span style={{ display: 'inline-block', width: 8, height: 8, borderRadius: '50%', background: color, flexShrink: 0, marginRight: 4 }} />
                    );
                    const HudSectionHeader = ({ label, color }: { label: string; color: string }) => (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4, margin: '6px 0 2px' }}>
                            <div style={{ flex: 1, height: 1, borderTop: '1px dashed rgba(255,255,255,0.12)' }} />
                            <span style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: '0.12em', whiteSpace: 'nowrap', padding: '0 4px' }}>{label}</span>
                            <div style={{ flex: 1, height: 1, borderTop: '1px dashed rgba(255,255,255,0.12)' }} />
                        </div>
                    );
                    const HudRow = ({ label, value, dot, valColor }: { label: string; value: string; dot?: string; valColor?: string }) => (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '2.5px 0', borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                            <span style={{ fontSize: 10, color: '#718096', letterSpacing: '0.04em' }}>{label}</span>
                            <span style={{ display: 'flex', alignItems: 'center', fontSize: 10, fontWeight: 600, color: valColor || '#e2e8f0', fontFamily: 'monospace' }}>
                                {dot && <HudDot color={dot} />}{value}
                            </span>
                        </div>
                    );

                    const signalColor = hasSignal ? (isBull ? '#00d4aa' : '#ff4d4d') : '#718096';
                    const volLabel = last.isMarketVolatile ? 'Trending' : 'Ranging';
                    const volColor = last.isMarketVolatile ? '#a78bfa' : '#718096';
                    const signalLabel = hasSignal ? (isBull ? 'BUY' : 'SELL') : 'NO SIGNAL';
                    const trendColor = last.emaBull ? '#00d4aa' : last.emaBear ? '#ff4d4d' : '#718096';
                    const trendLabel = last.emaBull ? 'Bullish' : last.emaBear ? 'Bearish' : 'Neutral';
                    const htfTrendColor = last.htfTrend === 'Bullish' ? '#00d4aa' : '#ff4d4d';
                    const mtfTrendColor = last.mtfTrend === 'Bullish' ? '#00d4aa' : '#ff4d4d';
                    const ichiColor = last.ichimokuStatus.includes('Bullish') ? '#00d4aa' : last.ichimokuStatus.includes('Bearish') ? '#ff4d4d' : '#718096';
                    const divColor = last.divergenceStatus.includes('Bullish') ? '#00d4aa' : last.divergenceStatus.includes('Bearish') ? '#ff4d4d' : '#718096';

                    const quantumHudElement = (
                        <div className="fixed z-[9999] select-none" style={{ 
                            width: 280, 
                            fontFamily: "'Inter', sans-serif",
                            left: `${quantumAiHudPos.x}px`,
                            top: `${quantumAiHudPos.y}px`
                        }}>
                            <div style={{
                                background: 'linear-gradient(180deg, #0e1724 0%, #0b1220 100%)',
                                border: '1px solid rgba(100,120,180,0.3)',
                                borderRadius: 10,
                                overflow: 'hidden',
                                boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
                            }}>
                                {/* Header */}
                                <div 
                                    onMouseDown={handleHudMouseDown}
                                    style={{
                                        background: 'linear-gradient(90deg, #1a1f3c 0%, #12192e 100%)',
                                        borderBottom: '1px solid rgba(100,120,200,0.25)',
                                        padding: '10px 14px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 8,
                                        cursor: isDraggingQuantumAi ? 'grabbing' : 'grab'
                                    }}
                                >
                                    <span style={{ fontSize: 16 }}>🚀</span>
                                    <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.12em', background: 'linear-gradient(90deg, #a78bfa, #f0abfc)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                                        QUANTUM AI v8 - ENHANCED
                                    </span>
                                </div>

                                {/* Body */}
                                <div style={{ padding: '10px 14px 12px' }}>
                                    {/* Signal rows */}
                                    <HudRow label="SIGNAL" value={signalLabel} dot={signalColor} valColor={signalColor} />
                                    <HudRow label="REASON" value={last.signalReason || 'No Signal'} valColor="#94a3b8" />
                                    <HudRow label="CONFIDENCE" value={`${Math.round(conf)}%`} valColor={conf >= 80 ? '#a78bfa' : conf >= 60 ? '#f59e0b' : '#718096'} />
                                    <HudRow label="STRATEGY" value="Adaptive Quantum" valColor="#94a3b8" />

                                    {/* Quantum AI Section */}
                                    <HudSectionHeader label="QUANTUM AI" color="#a78bfa" />
                                    <HudRow label="Quantum Power" value={`${qp}%`} valColor={qp >= 70 ? '#a78bfa' : qp >= 40 ? '#f59e0b' : '#718096'} />

                                    {/* Multi-Timeframe Section */}
                                    <HudSectionHeader label="MULTI-TIMEFRAME" color="#f59e0b" />
                                    <HudRow label="HTF Trend" value={`${last.htfTrend || 'N/A'} (240)`} dot={htfTrendColor} valColor={htfTrendColor} />
                                    <HudRow label="MTF Trend" value={`${last.mtfTrend || 'N/A'} (60)`} dot={mtfTrendColor} valColor={mtfTrendColor} />
                                    <HudRow label="Alignment" value={last.alignmentStatus || 'Mixed'} valColor="#e2e8f0" />

                                    {/* Ichimoku Section */}
                                    <HudSectionHeader label="ICHIMOKU" color="#f59e0b" />
                                    <HudRow label="Cloud Status" value={last.ichimokuStatus || 'N/A'} dot={ichiColor} valColor={ichiColor} />
                                    <HudRow label="TK Cross" value={last.tkCross || 'N/A'} valColor="#e2e8f0" />

                                    {/* Volume Profile Section */}
                                    <HudSectionHeader label="VOLUME PROFILE" color="#f59e0b" />
                                    <HudRow label="POC" value={`${last.close.toFixed(5)}`} valColor="#94a3b8" />

                                    {/* Active Patterns Section */}
                                    <HudSectionHeader label="ACTIVE PATTERNS" color="#a78bfa" />
                                    <HudRow label="Chart Pattern" value={last.activePattern || 'None'} valColor={last.activePattern !== 'None' ? '#00d4aa' : '#4a5568'} />
                                    <HudRow label="Divergence" value={last.divergenceStatus || 'None'} dot={divColor} valColor={divColor} />

                                    {/* Market State Section */}
                                    <HudSectionHeader label="MARKET STATE" color="#f59e0b" />
                                    <HudRow label="Volatility" value={volLabel} dot={volColor} valColor={volColor} />
                                    <HudRow label="Trend" value={trendLabel} dot={trendColor} valColor={trendColor} />
                                    <HudRow label="Quantum Signal" value={hasSignal ? signalLabel : '—'} valColor={signalColor} />

                                </div>

                                {/* Footer signal badge */}
                                <div style={{
                                    borderTop: '1px solid rgba(100,120,200,0.15)',
                                    padding: '8px 14px',
                                    textAlign: 'center',
                                    background: hasSignal
                                        ? isBull ? 'rgba(0,212,170,0.08)' : 'rgba(255,77,77,0.08)'
                                        : 'rgba(255,255,255,0.03)',
                                    animation: hasSignal ? 'pulse 2s infinite' : 'none',
                                }}>
                                    <span style={{
                                        fontSize: 11,
                                        fontWeight: 900,
                                        letterSpacing: '0.18em',
                                        color: signalColor,
                                        textTransform: 'uppercase',
                                    }}>
                                        {hasSignal ? `⚡ ${signalLabel} SIGNAL` : '○ NO SIGNAL'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );

                    return typeof window !== 'undefined' ? createPortal(quantumHudElement, document.body) : null;
                })()}

                {countdownFormatted && (
                    <div className="absolute bottom-[40px] right-[75px] z-20 pointer-events-none flex flex-col items-end gap-2">
                        {botStatus && botStatus.is_absorbing && (
                             <div className="bg-orange-600 border border-orange-400 text-white text-[16px] font-bold px-3 py-1.5 rounded animate-pulse shadow-lg">
                                🧬 ABSORPTION DETECTED
                             </div>
                        )}
                        {botStatus && botStatus.absorption_delta !== undefined && (
                             <div className="bg-black/60 border border-white/10 text-[14px] font-mono px-3 py-1.5 rounded backdrop-blur-md">
                                <span className="text-gray-400 mr-2 text-[11px] uppercase tracking-tighter">Backend CVD</span>
                                <span className={botStatus.absorption_delta >= 0 ? 'text-green-400' : 'text-red-400'}>
                                    {botStatus.absorption_delta > 0 ? '+' : ''}{botStatus.absorption_delta.toLocaleString()}
                                </span>
                             </div>
                        )}
                        <div className="bg-black/60 dark:bg-black/60 border border-white/10 text-[#d1d5db] text-[20px] font-mono font-bold px-3 py-1.5 rounded shadow-lg backdrop-blur-md">
                            {countdownFormatted}
                        </div>
                    </div>
                )}
            </div>
            {showCVD && (
                <div className="h-[25%] border-t border-gray-200 dark:border-white/5 relative z-0">
                    <CVDChart mainChart={chartRef.current} data={cvdData} />
                </div>
            )}
        </div>
    );
};

// ─── Advanced L2 Order Book ───────────────────────────────────────────────────
type L2Event = {
    id: number;
    time: string;
    type: 'new_wall' | 'removed' | 'absorbed' | 'spoof';
    side: 'bid' | 'ask';
    price: number;
    size: number;
};

const BUCKET_OPTIONS = [0, 10, 25, 50, 100, 500] as const;
type BucketSize = typeof BUCKET_OPTIONS[number];

// ── STEP 2: Depth Chart SVG Sub-component ─────────────────────────────────────
const DepthChart: React.FC<{
    bidPoints: { price: number; vol: number }[];
    askPoints: { price: number; vol: number }[];
    formatPrice: (p: number) => string;
    formatSize: (s: number) => string;
}> = ({ bidPoints, askPoints, formatPrice, formatSize }) => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [hover, setHover] = useState<{ x: number; price: number; vol: number; side: 'bid' | 'ask' } | null>(null);
    const allPoints = [...bidPoints, ...askPoints];
    if (allPoints.length === 0) return <div className="text-gray-500 text-center pt-8 text-xs">No data</div>;
    const minPrice = Math.min(...allPoints.map(p => p.price));
    const maxPrice = Math.max(...allPoints.map(p => p.price));
    const maxVol   = Math.max(...allPoints.map(p => p.vol), 1);
    const W = 100; const H = 100;
    const PAD = 2;
    const px = (price: number) => PAD + ((price - minPrice) / (maxPrice - minPrice || 1)) * (W - PAD * 2);
    const py = (vol: number)   => (H - PAD) - (vol / maxVol) * (H - PAD * 2);
    const buildPath = (points: { price: number; vol: number }[]) => {
        if (points.length === 0) return '';
        let d = `M ${px(points[0].price)} ${H - PAD}`;
        points.forEach(p => { d += ` L ${px(p.price)} ${py(p.vol)}`; });
        d += ` L ${px(points[points.length - 1].price)} ${H - PAD} Z`;
        return d;
    };
    const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
        if (!svgRef.current) return;
        const rect = svgRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const price = minPrice + relX * (maxPrice - minPrice);
        let closest: { price: number; vol: number; side: 'bid' | 'ask' } | null = null;
        let minDist = Infinity;
        bidPoints.forEach(p => { const d = Math.abs(p.price - price); if (d < minDist) { minDist = d; closest = { ...p, side: 'bid' }; } });
        askPoints.forEach(p => { const d = Math.abs(p.price - price); if (d < minDist) { minDist = d; closest = { ...p, side: 'ask' }; } });
        setHover(closest ? { x: relX * 100, ...closest } : null);
    };
    return (
        <div className="relative w-full h-full">
            <svg ref={svgRef} viewBox={`0 0 ${W} ${H}`} className="w-full h-full" preserveAspectRatio="none"
                onMouseMove={handleMouseMove} onMouseLeave={() => setHover(null)}>
                <defs>
                    <linearGradient id="bidGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#22c55e" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#22c55e" stopOpacity="0.05" />
                    </linearGradient>
                    <linearGradient id="askGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="#ef4444" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#ef4444" stopOpacity="0.05" />
                    </linearGradient>
                </defs>
                <path d={buildPath(bidPoints)} fill="url(#bidGrad)" stroke="#22c55e" strokeWidth="0.5" />
                <path d={buildPath(askPoints)} fill="url(#askGrad)" stroke="#ef4444" strokeWidth="0.5" />
                {hover && <line x1={hover.x} y1="0" x2={hover.x} y2={H} stroke="rgba(255,255,255,0.2)" strokeWidth="0.5" strokeDasharray="2,2" />}
            </svg>
            {hover && (
                <div className="absolute top-2 left-1/2 -translate-x-1/2 bg-black/80 border border-white/10 rounded px-2 py-1 text-[9px] font-mono pointer-events-none z-10 whitespace-nowrap">
                    <span className={hover.side === 'bid' ? 'text-green-400' : 'text-red-400'}>{hover.side.toUpperCase()}</span>
                    <span className="text-gray-300 ml-1">@ {formatPrice(hover.price)}</span>
                    <span className="text-white ml-1">Vol: {formatSize(hover.vol)}</span>
                </div>
            )}
        </div>
    );
};

const OrderBook: React.FC<{ bids: any[], asks: any[], maxTotal: number, volumeThreshold: number }> = ({ bids, asks, maxTotal, volumeThreshold }) => {
    const [view, setView] = useState<'book' | 'depth'>('book');
    const [bucket, setBucket] = useState<BucketSize>(0);
    const [events, setEvents] = useState<L2Event[]>([]);
    const prevBidsRef = useRef<Map<number, number>>(new Map());
    const prevAsksRef = useRef<Map<number, number>>(new Map());
    const wallTimestampsRef = useRef<Map<string, number>>(new Map());
    const eventIdRef = useRef(0);

    const isEmpty = bids.length === 0 && asks.length === 0;

    const formatPrice = (price: number) => {
        if (price < 0.000001) return price.toFixed(12);
        if (price < 0.00001) return price.toFixed(10);
        if (price < 0.0001) return price.toFixed(8);
        if (price < 0.001) return price.toFixed(6);
        if (price < 1) return price.toFixed(5);
        if (price < 10) return price.toFixed(4);
        return price.toFixed(2);
    };
    const formatSize = (s: number) => {
        if (s >= 1_000_000_000) return (s / 1_000_000_000).toFixed(2) + 'B';
        if (s >= 1_000_000) return (s / 1_000_000).toFixed(2) + 'M';
        if (s >= 1_000) return (s / 1_000).toFixed(2) + 'k';
        return s.toFixed(2);
    };
    const nowStr = () => new Date().toLocaleTimeString('en-US', { hour12: false });
    const addEvent = (ev: Omit<L2Event, 'id' | 'time'>) =>
        setEvents(prev => [{ ...ev, id: ++eventIdRef.current, time: nowStr() }, ...prev].slice(0, 60));

    // ── STEP 3 + 4 + 5: Absorption, Spoof, Event Detection ───────────────────
    // eslint-disable-next-line react-hooks/rules-of-hooks
    useEffect(() => {
        if (bids.length === 0 && asks.length === 0) return;
        const sigSize = volumeThreshold > 0 ? volumeThreshold : maxTotal * 0.05;
        const nowMs = Date.now();
        const curBids = new Map<number, number>(bids.map((b: any) => [b.price, b.size * b.price]));
        const curAsks = new Map<number, number>(asks.map((a: any) => [a.price, a.size * a.price]));

        // New large walls appeared (or existing orders sized up into walls)
        curBids.forEach((qv, price) => {
            const key = `bid-${price}`;
            const prevQv = prevBidsRef.current.get(price) || 0;
            if (qv >= sigSize && prevQv < sigSize) {
                wallTimestampsRef.current.set(key, nowMs);
                addEvent({ type: 'new_wall', side: 'bid', price, size: qv });
            }
        });
        curAsks.forEach((qv, price) => {
            const key = `ask-${price}`;
            const prevQv = prevAsksRef.current.get(price) || 0;
            if (qv >= sigSize && prevQv < sigSize) {
                wallTimestampsRef.current.set(key, nowMs);
                addEvent({ type: 'new_wall', side: 'ask', price, size: qv });
            }
        });

        // Walls that disappeared → spoof or removed
        const minBidPrice = bids.length > 0 ? bids[bids.length - 1].price : 0;
        const maxAskPrice = asks.length > 0 ? asks[asks.length - 1].price : Infinity;

        prevBidsRef.current.forEach((qv, price) => {
            const key = `bid-${price}`;
            if (qv >= sigSize && !curBids.has(price)) {
                if (price < minBidPrice) {
                    wallTimestampsRef.current.delete(key);
                    return; // Silently drop, just fell out of depth scope
                }
                const elapsed = nowMs - (wallTimestampsRef.current.get(key) ?? 0);
                wallTimestampsRef.current.delete(key);
                addEvent({ type: elapsed < 6000 ? 'spoof' : 'removed', side: 'bid', price, size: qv });
            }
        });
        prevAsksRef.current.forEach((qv, price) => {
            const key = `ask-${price}`;
            if (qv >= sigSize && !curAsks.has(price)) {
                if (price > maxAskPrice) {
                    wallTimestampsRef.current.delete(key);
                    return; // Silently drop, fell out of depth scope
                }
                const elapsed = nowMs - (wallTimestampsRef.current.get(key) ?? 0);
                wallTimestampsRef.current.delete(key);
                addEvent({ type: elapsed < 6000 ? 'spoof' : 'removed', side: 'ask', price, size: qv });
            }
        });

        // Absorption: existing wall lost ≥50% size without disappearing completely
        prevBidsRef.current.forEach((prevQv, price) => {
            const curQv = curBids.get(price);
            if (prevQv >= sigSize && curQv !== undefined && curQv < prevQv * 0.5)
                addEvent({ type: 'absorbed', side: 'bid', price, size: prevQv - curQv });
        });
        prevAsksRef.current.forEach((prevQv, price) => {
            const curQv = curAsks.get(price);
            if (prevQv >= sigSize && curQv !== undefined && curQv < prevQv * 0.5)
                addEvent({ type: 'absorbed', side: 'ask', price, size: prevQv - curQv });
        });

        prevBidsRef.current = curBids;
        prevAsksRef.current = curAsks;
    }, [bids, asks, maxTotal, volumeThreshold]);

    // ── STEP 1: Imbalance ─────────────────────────────────────────────────────
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const imbalance = useMemo(() => {
        const bidPow = bids.reduce((s: number, b: any) => s + b.size * b.price, 0);
        const askPow = asks.reduce((s: number, a: any) => s + a.size * a.price, 0);
        const total = bidPow + askPow;
        return total === 0 ? 0.5 : bidPow / total;
    }, [bids, asks]);
    const imbalancePct = Math.round(imbalance * 100);
    const imbalanceColor = imbalance > 0.6 ? '#22c55e' : imbalance < 0.4 ? '#ef4444' : '#f59e0b';
    const imbalanceLabel = imbalance > 0.65 ? 'Strong Buy' : imbalance < 0.35 ? 'Strong Sell' : imbalance > 0.55 ? 'Buy Bias' : imbalance < 0.45 ? 'Sell Bias' : 'Balanced';

    // ── STEP 6: Price Bucket Grouping ─────────────────────────────────────────
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { displayBids, displayAsks, displayMax } = useMemo(() => {
        if (bucket === 0) return { displayBids: bids, displayAsks: asks, displayMax: maxTotal };
        const group = (levels: any[], side: 'bid' | 'ask') => {
            const map = new Map<number, { price: number; size: number; total: number }>();
            levels.forEach((l: any) => {
                const key = side === 'bid' ? Math.floor(l.price / bucket) * bucket : Math.ceil(l.price / bucket) * bucket;
                const ex = map.get(key);
                if (ex) ex.size += l.size;
                else map.set(key, { price: key, size: l.size, total: 0 });
            });
            const arr = Array.from(map.values()).sort((a, b) => side === 'bid' ? b.price - a.price : a.price - b.price);
            let cum = 0; arr.forEach(l => { cum += l.size; l.total = cum; });
            return arr;
        };
        const gb = group(bids, 'bid');
        const ga = group(asks, 'ask');
        const mxB = gb.length ? gb[gb.length - 1].total : 0;
        const mxA = ga.length ? ga[ga.length - 1].total : 0;
        return { displayBids: gb, displayAsks: ga, displayMax: Math.max(mxB, mxA, 1) };
    }, [bids, asks, bucket, maxTotal]);

    // eslint-disable-next-line react-hooks/rules-of-hooks
    const reversedAsks = useMemo(() => displayAsks.slice().reverse(), [displayAsks]);

    // ── STEP 2: Depth Chart data ──────────────────────────────────────────────
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const depthData = useMemo(() => {
        const bidLevels = [...bids].sort((a: any, b: any) => b.price - a.price);
        const askLevels = [...asks].sort((a: any, b: any) => a.price - b.price);
        let c = 0;
        const bidPoints = bidLevels.map((b: any) => { c += b.size; return { price: b.price, vol: c }; }).reverse();
        c = 0;
        const askPoints = askLevels.map((a: any) => { c += a.size; return { price: a.price, vol: c }; });
        return { bidPoints, askPoints };
    }, [bids, asks]);

    const sigSize = volumeThreshold > 0 ? volumeThreshold : maxTotal * 0.05;
    const eventCfg: Record<L2Event['type'], { icon: string; color: string; label: string }> = {
        new_wall: { icon: '🟢', color: '#22c55e', label: 'NEW WALL' },
        removed:  { icon: '🔴', color: '#ef4444', label: 'REMOVED ' },
        absorbed: { icon: '⚡', color: '#f59e0b', label: 'ABSORBED' },
        spoof:    { icon: '⚠️', color: '#a855f7', label: 'SPOOF?  ' },
    };

    return (
        <div className="flex flex-col h-full font-mono text-[11px] select-none overflow-hidden">
            {isEmpty ? (
                <div className="flex-1 flex items-center justify-center text-gray-500 text-xs">Loading order book...</div>
            ) : (<>
            {/* ── STEP 1: Imbalance Gauge ─────────────────────────────────── */}
            <div className="px-2 pt-2 pb-1.5 flex-shrink-0 border-b border-white/5">
                <div className="flex justify-between items-center mb-1">
                    <span className="text-[9px] uppercase tracking-widest font-black" style={{ color: imbalanceColor }}>{imbalanceLabel}</span>
                    <span className="text-[9px] text-gray-500 tabular-nums">{imbalancePct}% Bid · {100 - imbalancePct}% Ask</span>
                </div>
                <div className="relative h-[5px] rounded-full bg-white/5 overflow-hidden">
                    <div className="absolute left-0 top-0 h-full rounded-full transition-all duration-500"
                        style={{ width: `${imbalancePct}%`, background: `linear-gradient(90deg, #22c55e80, ${imbalanceColor})` }} />
                    <div className="absolute left-1/2 top-0 h-full w-px bg-white/20" />
                </div>
                <div className="flex justify-between text-[8px] text-gray-600 mt-0.5"><span>Bids</span><span>Asks</span></div>
            </div>

            {/* ── Toolbar ────────────────────────────────────────────────── */}
            <div className="flex items-center justify-between px-2 py-1 border-b border-white/5 flex-shrink-0 gap-1">
                <div className="flex rounded overflow-hidden border border-white/10 text-[9px]">
                    {(['book', 'depth'] as const).map(v => (
                        <button key={v} onClick={() => setView(v)}
                            className={`px-2 py-0.5 uppercase tracking-wider font-bold transition-all ${
                                view === v ? 'bg-indigo-600 text-white' : 'text-gray-500 hover:text-white'}`}>{v}
                        </button>
                    ))}
                </div>
                {view === 'book' && (
                    <div className="flex items-center gap-0.5">
                        <span className="text-[8px] text-gray-600 mr-0.5">Grp</span>
                        {BUCKET_OPTIONS.map(b => (
                            <button key={b} onClick={() => setBucket(b)}
                                className={`px-1.5 py-0.5 rounded text-[8px] font-bold transition-all ${
                                    bucket === b ? 'bg-indigo-600/80 text-white' : 'text-gray-600 hover:text-gray-300'}`}>
                                {b === 0 ? 'Tick' : b}
                            </button>
                        ))}
                    </div>
                )}
            </div>

            {/* ── STEP 2: Depth Chart ──────────────────────────────────────── */}
            {view === 'depth' ? (
                <div className="flex-1 p-2 overflow-hidden">
                    <DepthChart bidPoints={depthData.bidPoints} askPoints={depthData.askPoints} formatPrice={formatPrice} formatSize={formatSize} />
                </div>
            ) : (
                <>
                    {/* Column headers */}
                    <div className="flex text-gray-600 py-1 px-2 uppercase tracking-wider font-bold flex-shrink-0 text-[9px] border-b border-white/5">
                        <div className="w-1/3 text-left">Price</div>
                        <div className="w-1/3 text-right">Size</div>
                        <div className="w-1/3 text-right">Total</div>
                    </div>

                    {/* Asks */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar flex flex-col justify-end">
                        {reversedAsks.map((ask: any, i: number) => {
                            const isWall = ask.size * ask.price >= sigSize;
                            return (
                                <div key={i} className={`flex px-2 py-[2px] relative hover:bg-white/5 cursor-pointer ${
                                    isWall ? 'ring-1 ring-inset ring-red-500/25' : ''}`}>
                                    <div className="absolute right-0 top-0 h-full bg-red-500/10 dark:bg-red-500/15 transition-all duration-300 pointer-events-none"
                                        style={{ width: `${(ask.total / displayMax) * 100}%` }} />
                                    <div className={`w-1/3 text-left relative z-10 font-bold ${ isWall ? 'text-red-400' : 'text-red-500/60'}`}>{formatPrice(ask.price)}</div>
                                    <div className={`w-1/3 text-right relative z-10 ${ isWall ? 'text-white font-bold' : 'text-gray-600'}`}>{formatSize(ask.size)}</div>
                                    <div className="w-1/3 text-right text-gray-700 relative z-10">{formatSize(ask.total)}</div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Spread */}
                    <div className="flex-shrink-0 px-2 py-1.5 border-y border-white/5 bg-black/20">
                        <div className="flex items-center justify-between text-[10px]">
                            <span className="text-gray-500 font-sans">Spread</span>
                            {asks.length > 0 && asks[asks.length - 1] && bids.length > 0 && (
                                <span className="text-indigo-400 font-bold">
                                    {(asks[asks.length - 1].price - bids[0].price).toFixed(10).replace(/\.?0+$/, '')}
                                </span>
                            )}
                        </div>
                    </div>

                    {/* Bids */}
                    <div className="flex-1 overflow-y-auto custom-scrollbar">
                        {displayBids.map((bid: any, i: number) => {
                            const isWall = bid.size * bid.price >= sigSize;
                            return (
                                <div key={i} className={`flex px-2 py-[2px] relative hover:bg-white/5 cursor-pointer ${
                                    isWall ? 'ring-1 ring-inset ring-green-500/25' : ''}`}>
                                    <div className="absolute right-0 top-0 h-full bg-green-500/10 dark:bg-green-500/15 transition-all duration-300 pointer-events-none"
                                        style={{ width: `${(bid.total / displayMax) * 100}%` }} />
                                    <div className={`w-1/3 text-left relative z-10 font-bold ${ isWall ? 'text-green-400' : 'text-green-500/60'}`}>{formatPrice(bid.price)}</div>
                                    <div className={`w-1/3 text-right relative z-10 ${ isWall ? 'text-white font-bold' : 'text-gray-600'}`}>{formatSize(bid.size)}</div>
                                    <div className="w-1/3 text-right text-gray-700 relative z-10">{formatSize(bid.total)}</div>
                                </div>
                            );
                        })}
                    </div>
                </>
            )}

            {/* ── STEP 5: Activity Feed / Event Log ───────────────────────── */}
            <div className="flex-shrink-0 border-t border-white/10 mt-1">
                <div className="flex items-center justify-between px-3 py-1.5 bg-black/20">
                    <span className="text-[10px] uppercase tracking-widest text-gray-500 font-bold">⚡ Activity Feed</span>
                    {events.length > 0 && (
                        <button onClick={() => setEvents([])} className="text-[9px] text-gray-600 hover:text-gray-400 transition-colors uppercase font-bold tracking-wider">clear</button>
                    )}
                </div>
                <div className="h-[140px] overflow-y-auto custom-scrollbar">
                    {events.length === 0 ? (
                        <div className="text-center text-[10px] text-gray-600 py-6">Monitoring for significant wall activity...</div>
                    ) : events.map(ev => {
                        const cfg = eventCfg[ev.type];
                        return (
                            <div key={ev.id} className="flex items-center gap-2 px-3 py-1 hover:bg-white/5 border-b border-white/5 last:border-0 transition-colors">
                                <span className="text-[9px] text-gray-500 tabular-nums w-[60px] flex-shrink-0 font-medium">{ev.time}</span>
                                <span className="text-[10px] font-bold flex-shrink-0" style={{ color: cfg.color }}>{cfg.icon} {cfg.label}</span>
                                <span className={`text-[10px] font-black flex-shrink-0 ${ ev.side === 'bid' ? 'text-green-500' : 'text-red-500'}`}>{ev.side.toUpperCase()}</span>
                                <span className="text-[10px] text-gray-300 truncate font-sans tracking-wide">{formatSize(ev.size)} <span className="text-gray-500 text-[9px] font-mono mx-1">@</span> {formatPrice(ev.price)}</span>
                            </div>
                        );
                    })}
                </div>
            </div>
            </>)}
        </div>
    );
};

// Helper to format prices dynamically
const formatDisplayPrice = (price: number | undefined | null) => {
    if (price === undefined || price === null || isNaN(price)) return '---';
    if (price < 0.000001) return price.toFixed(12);
    if (price < 0.00001) return price.toFixed(10);
    if (price < 0.0001) return price.toFixed(8);
    if (price < 0.001) return price.toFixed(6);
    if (price < 1) return price.toFixed(5);
    if (price < 10) return price.toFixed(4);
    return price.toFixed(2);
};

// Main Page Component
const OrderFlowHeatmap: React.FC = () => {
    const { globalExchange: exchange, setGlobalExchange: setExchange, globalSymbol: symbol, setGlobalSymbol: setSymbol, globalInterval: interval, setGlobalInterval: setInterval } = useMarketStore();
    const { activeWallHunterId, setActiveWallHunterId, indicatorSettings, setIndicatorSettings } = useBotStore();
    const { orderFlowActiveTab: activeTab, setOrderFlowActiveTab: setActiveTab, orderFlowShowFootprint: showFootprint, setOrderFlowShowFootprint: setShowFootprint } = useUIStore();
    
    const [isWallHunterOpen, setIsWallHunterOpen] = useState(false);
    const [isEmergencySelling, setIsEmergencySelling] = useState(false); // NEW STATE
    const [isFullscreen, setIsFullscreen] = useState(false); // NEW STATE
    const [showCVD, setShowCVD] = useState(false); // NEW STATE
    const { bids, asks, walls, currentPrice, tradeEvent } = useLevel2MarketData(symbol, exchange);
    const { volumeThreshold, setVolumeThreshold, volumeMode, setVolumeMode } = useVolumeFilter(5000000);
    const { statusData: botStatus, isConnected: botWsConnected } = useWallHunterStatus(activeWallHunterId);
    const [selectedApiKeyId, setSelectedApiKeyId] = useState<string | null>(null);
    const openOrders = useOpenOrders(selectedApiKeyId, symbol, 5000);


    const filteredWalls = useMemo(() => {
        if (volumeThreshold <= 0) return walls;

        const newWalls: { price: number; type: 'buy' | 'sell'; size: number }[] = [];
        asks.forEach(ask => {
            const comparisonValue = volumeMode === 'quote' ? ask.size * ask.price : ask.size;
            if (comparisonValue >= volumeThreshold) {
                newWalls.push({ price: ask.price, type: 'sell', size: ask.size });
            }
        });
        bids.forEach(bid => {
            const comparisonValue = volumeMode === 'quote' ? bid.size * bid.price : bid.size;
            if (comparisonValue >= volumeThreshold) {
                newWalls.push({ price: bid.price, type: 'buy', size: bid.size });
            }
        });
        return newWalls;
    }, [walls, bids, asks, volumeThreshold, volumeMode]);

    const maxTotal = useMemo(() => {
        const maxBid = bids.length > 0 ? bids[bids.length - 1].total : 0;
        const maxAsk = asks.length > 0 ? asks[asks.length - 1].total : 0;
        return Math.max(maxBid, maxAsk, 1); // Avoid division by zero
    }, [bids, asks]);

    // Emergency Sell Handler
    const handleEmergencySell = async (type: 'market' | 'limit') => {
        if (!activeWallHunterId || isEmergencySelling) return;
        setIsEmergencySelling(true);
        try {
            await botService.emergencySell(activeWallHunterId, type);
            toast.success(`Emergency ${type} sell triggered successfully`);
        } catch (err: any) {
            console.error(`Emergency ${type} sell failed:`, err);
            toast.error(`Emergency ${type} sell failed: ` + (err.response?.data?.detail || err.message));
        } finally {
            setIsEmergencySelling(false);
        }
    };

    return (
        <div className="flex flex-col h-full bg-brand-light dark:bg-brand-darkest text-slate-900 dark:text-white overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
            <header className="relative z-40 flex-shrink-0 p-4 border-b border-gray-200 dark:border-white/10 flex justify-between items-center bg-white dark:bg-[#0B1120]">
                <div className="flex items-center gap-4">
                    <HeatmapSymbolSelector symbol={symbol} exchange={exchange} onSymbolChange={setSymbol} onExchangeChange={setExchange} />
                    <TimeframeSelector interval={interval} onIntervalChange={setInterval} />
                    <IndicatorSelector settings={indicatorSettings} onSettingsChange={setIndicatorSettings} />
                    
                    <div className="flex bg-gray-100 dark:bg-black/30 p-1 rounded-lg border border-gray-200 dark:border-white/10">
                        <button
                            onClick={() => setActiveTab('bot_settings')}
                            className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'bot_settings'
                                ? 'bg-green-600/10 text-green-500 border border-green-500/20 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-black/10'
                                }`}
                        >
                             <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-settings"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.38a2 2 0 0 0-.73-2.73l-.15-.1a2 2 0 0 1-1-1.72v-.51a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
                            <span>OrderBlockBot</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('bot_logs')}
                            className={`flex items-center space-x-2 px-3 py-1.5 text-xs font-bold rounded-md transition-all ${activeTab === 'bot_logs'
                                ? 'bg-purple-600/10 text-purple-400 border border-purple-500/20 shadow-sm'
                                : 'text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white hover:bg-black/10'
                                }`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="lucide lucide-align-left"><line x1="21" y1="6" x2="3" y2="6"/><line x1="15" y1="12" x2="3" y2="12"/><line x1="17" y1="18" x2="3" y2="18"/></svg>
                            <span>Bot Logs</span>
                        </button>
                    </div>

                    <span className="text-lg font-mono font-bold text-gray-800 dark:text-white">
                        {formatDisplayPrice(currentPrice)}
                    </span>
                </div>
                <div className="flex gap-2">
                    <span className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${botWsConnected ? 'bg-indigo-500/10 text-indigo-500 border-indigo-500/20' : 'bg-green-500/10 text-green-500 border-green-500/20'}`}>
                        <span className={`w-2 h-2 rounded-full animate-pulse ${botWsConnected ? 'bg-indigo-500' : 'bg-green-500'}`}></span>
                        {botWsConnected ? `Bot ${activeWallHunterId} Connected` : 'Live Data Socket'}
                    </span>
                    <button
                        onClick={() => setShowCVD(!showCVD)}
                        className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-all ${showCVD
                            ? 'bg-purple-600 text-white border-purple-600 shadow-[0_0_15px_rgba(147,51,234,0.3)]'
                            : 'bg-white dark:bg-black/20 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                    >
                        {showCVD ? 'Hide CVD' : 'Show CVD'}
                    </button>
                    <button
                        onClick={() => setShowFootprint(!showFootprint)}
                        className={`text-xs font-semibold px-4 py-2 rounded-lg border transition-all ${showFootprint
                            ? 'bg-brand-primary text-white border-brand-primary shadow-[0_0_15px_rgba(59,130,246,0.3)]'
                            : 'bg-white dark:bg-black/20 text-gray-600 dark:text-gray-300 border-gray-200 dark:border-white/10 hover:bg-gray-50 dark:hover:bg-white/5'}`}
                    >
                        {showFootprint ? 'Hide Footprint' : 'Show Footprint'}
                    </button>
                </div>
            </header>

            <HeatmapSubNav 
                activeTab={activeTab} 
                onChange={setActiveTab} 
                volumeThreshold={volumeThreshold}
                setVolumeThreshold={setVolumeThreshold}
                volumeMode={volumeMode}
                setVolumeMode={setVolumeMode}
            />

            <div className={isFullscreen ? 'fixed inset-0 z-[200] bg-gray-50 dark:bg-[#050B14] p-4' : 'flex-1 p-4 overflow-hidden relative bg-gray-50 dark:bg-[#050B14]'}>
                {/* IN FULLSCREEN MODE, RENDER ONLY THE MAIN CHART WITHOUT THE LEFT PADDING. OTHERWISE RENDER NORMALLY */}
                <div className={`flex flex-row h-full gap-4 ${isFullscreen ? 'flex-col' : ''}`}>
                    <div className={`${isFullscreen ? 'w-full h-full' : 'w-[70%]'} bg-white dark:bg-[#0B1120] rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] flex flex-col`}>
                        <div className="p-3 border-b border-gray-200 dark:border-white/5 flex justify-between items-center">
                            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Order Flow Chart</h3>
                            <button
                                onClick={() => setIsFullscreen(!isFullscreen)}
                                className="text-gray-500 hover:text-brand-primary transition-colors"
                            >
                                {isFullscreen ? (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12" /></svg>
                                ) : (
                                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" /></svg>
                                )}
                            </button>
                        </div>
                        <div className="flex-1 relative">
                            <OrderFlowChart exchange={exchange} symbol={symbol} interval={interval} walls={filteredWalls} currentPrice={currentPrice} showFootprint={showFootprint} showCVD={showCVD} indicatorSettings={indicatorSettings} tradeEvent={tradeEvent} botStatus={botStatus} openOrders={openOrders} />
                        </div>
                    </div>
                    {!isFullscreen && (
                        <div className="w-[30%] bg-white dark:bg-[#0B1120] rounded-xl border border-gray-200 dark:border-white/5 overflow-hidden shadow-[0_4px_20px_rgba(0,0,0,0.05)] dark:shadow-[0_4px_20px_rgba(0,0,0,0.2)] flex flex-col">
                            <div className="p-3 border-b border-gray-200 dark:border-white/5 flex justify-between items-center">
                                <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider">Level 2 Order Book</h3>
                            </div>
                            <div className="flex-1 overflow-hidden p-2">
                                <OrderBook bids={bids} asks={asks} maxTotal={maxTotal} volumeThreshold={volumeThreshold} />
                            </div>
                        </div>
                    )}
                </div>

                {/* ACTIVE BOT STATUS HUD */}
                {activeWallHunterId && botStatus && (
                    <div className="absolute top-6 right-6 z-50 pointer-events-none">
                        <div className="bg-white/10 dark:bg-black/40 backdrop-blur-xl border border-white/20 dark:border-white/10 p-4 rounded-xl shadow-[0_8px_32px_rgba(0,0,0,0.3)] w-64">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-2 flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${botStatus.position ? 'bg-yellow-400 animate-pulse' : 'bg-indigo-500 animate-pulse'}`}></span>
                                {botStatus.position ? 'In Trade' : 'Monitoring L2 Wall'}
                            </h4>
                            <div className="flex flex-col gap-2">
                                <div className="flex justify-between items-center bg-black/20 p-2 rounded-lg border border-white/5">
                                    <span className="text-gray-400 font-mono text-xs">Unrealized PnL:</span>
                                    <span className={`font-mono font-bold text-lg ${botStatus.pnl >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                        ${(botStatus.pnl || 0).toFixed(2)} ({botStatus.pnl_percent > 0 ? '+' : ''}{(botStatus.pnl_percent || 0).toFixed(2)}%)
                                    </span>
                                </div>
                                <div className="grid grid-cols-2 gap-2">
                                    <div className="bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col">
                                        <span className="text-gray-400 font-mono text-[10px] uppercase">Total PnL</span>
                                        <span className={`font-mono font-bold ${botStatus.total_pnl && botStatus.total_pnl < 0 ? 'text-red-400' : 'text-green-400'}`}>
                                            ${(botStatus.total_pnl || 0).toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col">
                                        <span className="text-gray-400 font-mono text-[10px] uppercase">Orders Executed</span>
                                        <span className="font-mono font-bold text-blue-400">
                                            {botStatus.total_orders || 0}
                                        </span>
                                    </div>
                                    <div className="bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col">
                                        <span className="text-gray-400 font-mono text-[10px] uppercase">Wins</span>
                                        <span className="font-mono font-bold text-green-400">
                                            {botStatus.total_wins || 0}
                                        </span>
                                    </div>
                                    <div className="bg-black/20 p-2 rounded-lg border border-white/5 flex flex-col">
                                        <span className="text-gray-400 font-mono text-[10px] uppercase">Losses</span>
                                        <span className="font-mono font-bold text-red-400">
                                            {botStatus.total_losses || 0}
                                        </span>
                                    </div>
                                </div>
                                {botStatus.position && (
                                    <>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-gray-500">Target TP:</span>
                                            <span className="text-green-400 font-bold">{formatDisplayPrice(botStatus.tp_price)}</span>
                                        </div>
                                        <div className="flex justify-between text-xs font-mono">
                                            <span className="text-gray-500">Trailing SL:</span>
                                            <span className="text-red-400 font-bold">{formatDisplayPrice(botStatus.sl_price)}</span>
                                        </div>
                                        
                                        {/* EMERGENCY EXIT BLOCKS */}
                                        <div className="mt-2 grid grid-cols-2 gap-2 pointer-events-auto">
                                            <button
                                                onClick={() => handleEmergencySell('market')}
                                                disabled={isEmergencySelling}
                                                className={`py-1.5 px-2 text-[10px] font-bold rounded ${botStatus.mode === 'short' ? 'bg-green-500/20 text-green-400 hover:bg-green-500 border-green-500/30' : 'bg-red-500/20 text-red-400 hover:bg-red-500 border-red-500/30'} hover:text-white border transition-colors uppercase flex items-center justify-center gap-1 ${isEmergencySelling ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                                {botStatus.mode === 'short' ? 'Market Buy' : 'Market Sell'}
                                            </button>
                                            <button
                                                onClick={() => handleEmergencySell('limit')}
                                                disabled={isEmergencySelling}
                                                className={`py-1.5 px-2 text-[10px] font-bold rounded ${botStatus.mode === 'short' ? 'bg-indigo-500/20 text-indigo-400 hover:bg-indigo-500 border-indigo-500/30' : 'bg-blue-500/20 text-blue-400 hover:bg-blue-500 border-blue-500/30'} hover:text-white border transition-colors uppercase flex items-center justify-center gap-1 ${isEmergencySelling ? 'opacity-50 cursor-not-allowed' : ''}`}
                                            >
                                                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 6l3 1m0 0l-3 9a5.002 5.002 0 006.001 0M6 7l3 9M6 7l6-2m6 2l3-1m-3 1l-3 9a5.002 5.002 0 006.001 0M18 7l3 9m-3-9l-6-2m0-2v2m0 16V5m0 16H9m3 0h3" /></svg>
                                                {botStatus.mode === 'short' ? 'Limit Buy' : 'Limit Sell'}
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                    </div>
                )}

                {/* BOT SETTINGS MODAL */}
                {activeTab === 'bot_settings' && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="relative w-[90%] md:w-[70%] lg:w-[60%] max-w-4xl max-h-[90vh] bg-white dark:bg-[#0B1120] rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden flex flex-col transform transition-all scale-100">
                            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-white/10 shrink-0">
                                <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-purple-500">OrderBlockBot Configuration</h2>
                                <button
                                    onClick={() => setActiveTab('heatmap')}
                                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                                <BotSettingsTab />
                            </div>
                        </div>
                    </div>
                )}

                {/* BOT LOGS MODAL */}
                {activeTab === 'bot_logs' && (
                    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
                        <div className="relative w-[90%] md:w-[70%] lg:w-[60%] max-w-4xl max-h-[90vh] bg-white dark:bg-[#0B1120] rounded-xl shadow-2xl border border-gray-200 dark:border-white/10 overflow-hidden flex flex-col transform transition-all scale-100">
                            <div className="flex justify-between items-center p-4 border-b border-gray-200 dark:border-white/10 shrink-0">
                                <h2 className="text-lg font-bold bg-clip-text text-transparent bg-gradient-to-r from-brand-primary to-purple-500">OrderBlockBot Terminal Logs</h2>
                                <button
                                    onClick={() => setActiveTab('heatmap')}
                                    className="p-2 text-gray-500 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                </button>
                            </div>
                            <div className="flex-1 overflow-y-auto custom-scrollbar relative">
                                <BotLogsTab botId={activeWallHunterId} />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* WALLHUNTER FLOATING ACTION BUTTON */}
            {
                activeWallHunterId ? (
                    <button
                        onClick={async () => {
                            try {
                                await botService.controlBot(activeWallHunterId, 'stop');
                                setActiveWallHunterId(null);
                            } catch (err) {
                                console.error("Failed to stop WallHunter bot", err);
                            }
                        }}
                        className="fixed bottom-8 right-8 z-[100] group"
                        title="Abort WallHunter"
                    >
                        <div className="absolute inset-0 bg-red-500 rounded-full blur-xl opacity-40 group-hover:opacity-100 transition-opacity animate-pulse" />
                        <div className="relative w-16 h-16 bg-gradient-to-br from-red-500 to-red-700 rounded-full flex items-center justify-center border-4 border-white/20 shadow-[0_0_30px_rgba(239,68,68,0.5)] group-hover:scale-110 transition-transform cursor-pointer">
                            <svg className="w-8 h-8 text-white group-hover:rotate-180 transition-transform duration-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                        </div>
                    </button>
                ) : (
                    <button
                        onClick={() => setIsWallHunterOpen(true)}
                        className="fixed bottom-8 right-8 z-[100] group"
                        title="Deploy WallHunter"
                    >
                        <div className="absolute inset-0 bg-yellow-500 rounded-full blur-xl opacity-40 group-hover:opacity-100 transition-opacity animate-pulse" />
                        <div className="relative w-16 h-16 bg-gradient-to-br from-yellow-400 to-orange-600 rounded-full flex items-center justify-center border-4 border-white/20 shadow-2xl group-hover:scale-110 transition-transform cursor-pointer">
                            <svg className="w-8 h-8 text-white group-hover:rotate-12 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M13 10V3L4 14h7v7l9-11h-7z" />
                            </svg>
                        </div>
                    </button>
                )
            }

            {/* MANUAL TRADE MODAL */}
            <ManualTradeModal symbol={symbol} currentPrice={currentPrice} onApiKeyChange={setSelectedApiKeyId} />

            <WallHunterModal
                isOpen={isWallHunterOpen}
                onClose={() => setIsWallHunterOpen(false)}
                symbol={symbol}
                bids={bids}
                asks={asks}
                onDeploySuccess={(botId) => {
                    setActiveWallHunterId(botId);
                    setIsWallHunterOpen(false);
                }}
            />
        </div >
    );
};

export default OrderFlowHeatmap;
