import React, { useState, useEffect, useRef, useCallback, FormEvent } from 'react';
import { ResponsiveContainer, AreaChart, Area, Tooltip } from 'recharts';
import { ReferenceLine } from 'recharts';
import Card from '@/components/common/Card';
import { useTheme } from '@/context/ThemeContext';
import { ExpandIcon, CollapseIcon } from '@/constants';
import ComboBox from '@/components/common/ComboBox';
import { useLiquidationWebSocket, LiquidationEvent, CldData, AggregatedStats } from '../../hooks/useLiquidationWebSocket';
import { useCCXTMarkets } from '../../hooks/useCCXTMarkets';
import LiquidationBubbleChart from '@/components/features/trading/LiquidationBubbleChart';
import { useUIStore } from '@/store/uiStore';

// --- ICONS ---


const SkullIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2a7 7 0 0 0-7 7v1.53a4.004 4.004 0 0 0 .994 2.634L7.96 16H6a1 1 0 0 0 0 2h12a1 1 0 0 0 0-2h-1.96l1.966-2.836A4.004 4.004 0 0 0 19 10.53V9a7 7 0 0 0-7-7Zm-2.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" />
        <path d="M8 20a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2H8Z" />
    </svg>
);

const FireIcon = ({ className }: { className?: string }) => (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="currentColor">
        <path fillRule="evenodd" d="M12.963 2.286a.75.75 0 0 0-1.071-.136 9.742 9.742 0 0 0-3.539 6.177 7.547 7.547 0 0 1-1.705-1.715.75.75 0 0 0-1.152.082A9 9 0 1 0 15.68 4.534a7.46 7.46 0 0 1-2.717-2.248ZM15.75 14.25a3.75 3.75 0 1 1-7.5 0 3.75 3.75 0 0 1 7.5 0Z" clipRule="evenodd" />
    </svg>
);

// Custom component for the "Kill Feed" items
const KillFeedItem: React.FC<{ event: LiquidationEvent; activePair: string }> = ({ event, activePair }) => {
    const isLong = event.type === 'Long';
    const bgColor = isLong ? 'bg-rose-500/5' : 'bg-emerald-500/5';
    const borderColor = isLong ? 'border-rose-500/20' : 'border-emerald-500/20';
    const textColor = isLong ? 'text-rose-500' : 'text-emerald-500';
    const iconWrapperBg = isLong ? 'bg-rose-500/10' : 'bg-emerald-500/10';
    const glowColor = isLong ? 'rgba(244,63,94,0.3)' : 'rgba(16,185,129,0.3)';
    const baseToken = activePair ? activePair.split('/')[0] : '';
    const label = `${baseToken} ${isLong ? 'Long Rekt' : 'Short Rekt'}`;

    return (
        <div className={`relative flex items-center justify-between p-3 mb-2 rounded-xl border ${borderColor} ${bgColor} ${event.isNew ? 'animate-fade-in-right' : ''} group overflow-hidden transition-colors hover:bg-white/5`}>
            {/* Flash effect overlay */}
            {event.isNew && <div className={`absolute inset-0 opacity-20 ${isLong ? 'bg-rose-500' : 'bg-emerald-500'} animate-ping rounded-xl pointer-events-none`}></div>}
            {/* Hover Glow */}
            <div className={`absolute -left-10 w-20 h-full blur-[20px] transition-opacity duration-300 opacity-0 group-hover:opacity-100 ${isLong ? 'bg-rose-500/20' : 'bg-emerald-500/20'}`}></div>

            <div className="flex items-center gap-3 relative z-10">
                <div className={`p-2 rounded-lg ${iconWrapperBg} border ${borderColor} relative shadow-[0_0_10px_var(--glow)]`} style={{ '--glow': glowColor } as any}>
                     {event.isNew && <div className={`absolute inset-0 ${isLong ? 'bg-rose-500/20' : 'bg-emerald-500/20'} animate-ping rounded-lg`}></div>}
                    {event.isWhale ? <SkullIcon className={`w-4 h-4 ${textColor}`} /> : <FireIcon className={`w-4 h-4 ${textColor}`} />}
                </div>
                <div className="flex flex-col gap-0.5">
                    <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${textColor}`}>{label}</span>
                        <span className="text-[9px] text-gray-500 font-mono bg-black/30 px-1 py-0.5 rounded border border-white/5">{event.time}</span>
                    </div>
                    <div className="text-sm font-mono font-bold text-white tracking-tight drop-shadow-[0_0_5px_rgba(255,255,255,0.2)]">
                        ${event.price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                    </div>
                </div>
            </div>

            <div className="text-right relative z-10 flex flex-col items-end gap-1">
                <div className={`font-bold font-mono ${event.isWhale ? 'text-lg drop-shadow-[0_0_8px_var(--glow)]' : 'text-sm'} ${textColor}`} style={{ '--glow': glowColor } as any}>
                    ${(event.amount).toLocaleString(undefined, { maximumFractionDigits: 0 })}
                </div>
                {event.isWhale && <span className="text-[8px] bg-yellow-500/10 text-yellow-500 px-1.5 py-0.5 rounded uppercase font-bold border border-yellow-500/20 tracking-widest shadow-[0_0_5px_rgba(234,179,8,0.3)] animate-pulse">Whale</span>}
            </div>
        </div>
    );
};

const StandardLiquidationView: React.FC = () => {
    const { theme } = useTheme();
    const widgetRef = useRef<any>(null);
    const chartApiRef = useRef<any>(null);
    const drawnLinesRef = useRef<any[]>([]);
    const [isChartFullScreen, setIsChartFullScreen] = useState(false);
    const [widgetKey, setWidgetKey] = useState(Date.now());

    const { exchanges, selectedExchange, setSelectedExchange, availablePairs, selectedPair, setSelectedPair, isLoading: isPairsLoading } = useCCXTMarkets();
    const activePair = selectedPair || 'BTC/USDT';

    // --- REAL DATA INTEGRATION ---
    const {
        liveFeed,
        aggregatedStats,
        cldData,
        currentPrice: wsPrice,
        priceUpdateStatus,
        isConnected
    } = useLiquidationWebSocket(selectedExchange, activePair);

    // Resize & Layout State
    const [isResizing, setIsResizing] = useState(false);
    const {
        liquidationChartWidth: chartWidth,
        setLiquidationChartWidth: setChartWidth,
        liquidationRightPanelTab: rightPanelTab,
        setLiquidationRightPanelTab: setRightPanelTab,
        liquidationHighlightedLevels: highlightedLevels,
        setLiquidationHighlightedLevels: setHighlightedLevels,
        liquidationMinThreshold: minLiquidationThreshold,
        setLiquidationMinThreshold: setMinLiquidationThreshold,
        liquidationChartView: chartView,
        setLiquidationChartView: setChartView
    } = useUIStore();
    const containerRef = useRef<HTMLDivElement>(null);

    const [highlightLevelInput, setHighlightLevelInput] = useState('');

    const toggleFullScreen = () => { setIsChartFullScreen(prev => !prev); setWidgetKey(Date.now()); };
    useEffect(() => { document.body.classList.toggle('body-no-scroll', isChartFullScreen); }, [isChartFullScreen]);
    const handleMouseDown = useCallback((e: React.MouseEvent) => { e.preventDefault(); setIsResizing(true); }, []);
    const handleMouseUp = useCallback(() => { setIsResizing(false); }, []);
    const handleMouseMove = useCallback((e: MouseEvent) => {
        if (isResizing && containerRef.current) {
            const bounds = containerRef.current.getBoundingClientRect();
            const newWidth = ((e.clientX - bounds.left) / bounds.width) * 100;
            if (newWidth > 50 && newWidth < 90) setChartWidth(newWidth);
        }
    }, [isResizing]);
    useEffect(() => {
        if (isResizing) { document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', handleMouseUp); }
        return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
    }, [isResizing, handleMouseMove, handleMouseUp]);

    // TradingView Widget
    useEffect(() => {
        if (chartView !== 'price') return; // Don't init TV if not in price mode

        const containerId = isChartFullScreen ? `tradingview_fullscreen_liquidation_chart_${widgetKey}` : `tradingview_liquidation_chart_${widgetKey}`;
        const createWidget = () => {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (widgetRef.current) { try { widgetRef.current.remove(); } catch (e) { } widgetRef.current = null; }

            // @ts-ignore
            const widget = new window.TradingView.widget({
                symbol: `${selectedExchange.toUpperCase()}:${activePair.replace('/', '')}`,
                interval: '15',
                autosize: true,
                container_id: containerId,
                theme: theme === 'dark' ? 'Dark' : 'Light',
                style: '1',
                locale: 'en',
                toolbar_bg: theme === 'dark' ? '#1E293B' : '#FFFFFF',
                enable_publishing: false,
                hide_side_toolbar: false,
                allow_symbol_change: false,
                studies: ["Volume@tv-basicstudies"],
                onready: () => { chartApiRef.current = widget.chart(); },
            });
            widgetRef.current = widget;
        };
        const checkLibraryAndCreate = () => { if (typeof window.TradingView !== 'undefined' && window.TradingView.widget) createWidget(); else setTimeout(checkLibraryAndCreate, 100); }
        checkLibraryAndCreate();
        return () => { if (widgetRef.current) { try { widgetRef.current.remove(); widgetRef.current = null; chartApiRef.current = null; } catch (e) { } } };
    }, [selectedExchange, activePair, theme, widgetKey, isChartFullScreen, chartView]);

    // Drawing Lines
    const handleAddHighlight = useCallback((level: number) => {
        if (!isNaN(level) && !highlightedLevels.includes(level)) {
            setHighlightedLevels([...highlightedLevels, level].sort((a, b) => b - a));
        }
    }, [highlightedLevels, setHighlightedLevels]);
    const handleRemoveHighlight = (level: number) => { setHighlightedLevels(highlightedLevels.filter(l => l !== level)); };
    const handleHighlightSubmit = (e: FormEvent) => {
        e.preventDefault();
        const level = parseFloat(highlightLevelInput);
        if (!isNaN(level)) { handleAddHighlight(level); setHighlightLevelInput(''); }
    };

    useEffect(() => {
        if (chartApiRef.current) {
            drawnLinesRef.current.forEach(line => { try { chartApiRef.current.removeEntity(line.id); } catch (e) { } });
            drawnLinesRef.current = [];
            highlightedLevels.forEach(level => {
                try {
                    const line = chartApiRef.current.createHorzLine({
                        price: level, text: `$${level.toLocaleString()}`, lineStyle: 2, lineColor: '#FBBF24', textColor: '#000000', backgroundColor: '#FBBF24', showLabel: true
                    });
                    drawnLinesRef.current.push(line);
                } catch (e) { }
            });
        }
    }, [highlightedLevels, chartApiRef.current]);



    // Calculate Ratio
    const totalLiq = aggregatedStats.longLiqs + aggregatedStats.shortLiqs;
    const longRatio = totalLiq > 0 ? (aggregatedStats.longLiqs / totalLiq) * 100 : 50;

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden">

            {/* High-Tech HUD */}
            <div className="flex-shrink-0 grid grid-cols-1 md:grid-cols-5 gap-4 staggered-fade-in relative z-50">
                {/* Search & Price */}
                <Card className="md:col-span-1 flex flex-col justify-center !p-5 relative bg-gradient-to-br from-[#0B1120] to-[#111827] border-white/5 shadow-2xl rounded-2xl group z-[60]">
                    <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-transparent to-transparent opacity-50 group-hover:opacity-100 transition-opacity duration-700 rounded-2xl pointer-events-none"></div>
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-brand-primary/20 blur-[50px] rounded-full pointer-events-none"></div>
                    
                    <div className="relative z-10 flex flex-col gap-4">
                        {/* Header */}
                        <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                                <div className="relative flex h-2 w-2">
                                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-primary opacity-75"></span>
                                  <span className="relative inline-flex rounded-full h-2 w-2 bg-brand-primary"></span>
                                </div>
                                <span className="text-[10px] text-gray-400 font-bold uppercase tracking-widest">Market</span>
                            </div>
                            <div className="text-[9px] px-1.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-gray-400">
                                Live
                            </div>
                        </div>

                        {/* Selectors */}
                        <div className="flex flex-col gap-2.5">
                            {/* Exchange Selector */}
                            <div className="relative group/select">
                                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                                    <svg className="w-3.5 h-3.5 text-gray-400 group-hover/select:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                                    </svg>
                                </div>
                                <select
                                    value={selectedExchange}
                                    onChange={(e) => setSelectedExchange(e.target.value)}
                                    className="w-full bg-black/40 border border-white/10 hover:border-white/20 rounded-lg py-2 pl-9 pr-8 text-xs font-bold font-mono text-white appearance-none cursor-pointer focus:border-brand-primary focus:ring-1 focus:ring-brand-primary/50 outline-none transition-all shadow-inner"
                                >
                                    {exchanges.map((ex) => (
                                        <option key={ex} value={ex} className="bg-slate-900 text-white font-mono">
                                            {ex.toUpperCase()}
                                        </option>
                                    ))}
                                </select>
                                <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                                    <svg className="w-3.5 h-3.5 text-gray-500 group-hover/select:text-white transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                    </svg>
                                </div>
                            </div>

                            {/* Pair Selector */}
                            <ComboBox
                                value={selectedPair}
                                onChange={setSelectedPair}
                                options={availablePairs.map(m => m.symbol)}
                                disabled={isPairsLoading}
                                placeholder={isPairsLoading ? "Loading..." : "Search pair..."}
                                inputClassName="!bg-black/40 !border-white/10 hover:!border-white/20 !rounded-lg !py-2 !text-xs !font-bold !font-mono shadow-inner transition-all group-hover/combo:border-white/20 focus:!border-brand-primary"
                                className="group/combo"
                                icon={
                                    <svg className="w-3.5 h-3.5 text-gray-400 group-hover/combo:text-brand-primary transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                                    </svg>
                                }
                            />
                        </div>
                    </div>
                </Card>

                {/* Filter Control */}
                <Card className="md:col-span-1 flex flex-col justify-center !p-5 relative overflow-hidden bg-gradient-to-br from-[#0B1120] to-[#111827] border-white/5 shadow-2xl rounded-2xl group">
                    <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 via-transparent to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-700"></div>
                    {minLiquidationThreshold > 50000 && (
                        <div className="absolute top-0 right-0 p-1">
                            <span className="text-[9px] bg-yellow-500/20 text-yellow-500 px-1.5 py-0.5 rounded-bl-lg uppercase font-bold border-b border-l border-yellow-500/30 shadow-[0_0_10px_rgba(234,179,8,0.3)] animate-pulse">
                                Whale
                            </span>
                        </div>
                    )}
                    <div className="relative z-10 flex flex-col h-full justify-between">
                        <div className="flex justify-between items-center">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold">Min Threshold</p>
                            <p className="text-sm font-mono font-bold text-brand-primary drop-shadow-[0_0_8px_rgba(59,130,246,0.5)]">${(minLiquidationThreshold / 1000).toFixed(0)}k</p>
                        </div>
                        <div className="mt-4 relative pt-1">
                            <div className="flex items-center gap-3">
                                <span className="text-[9px] text-gray-500 font-mono font-bold">0</span>
                                <div className="relative flex-1 group/slider">
                                    <input
                                        type="range"
                                        min="0"
                                        max="100000"
                                        step="1000"
                                        value={minLiquidationThreshold}
                                        onChange={(e) => setMinLiquidationThreshold(Number(e.target.value))}
                                        className="w-full h-1.5 bg-gray-800/50 rounded-lg appearance-none cursor-pointer accent-brand-primary focus:outline-none focus:ring-2 focus:ring-brand-primary/50 relative z-10"
                                    />
                                    <div className="absolute top-1/2 -translate-y-1/2 left-0 h-1.5 bg-brand-primary rounded-l-lg pointer-events-none transition-all duration-150 shadow-[0_0_10px_rgba(59,130,246,0.6)]" style={{ width: `${(minLiquidationThreshold / 100000) * 100}%` }}></div>
                                </div>
                                <span className="text-[9px] text-gray-500 font-mono font-bold">100k</span>
                            </div>
                        </div>
                    </div>
                </Card>

                {/* Stats: Total Vol */}
                <Card className="md:col-span-1 flex flex-col justify-center !p-5 relative overflow-hidden bg-gradient-to-br from-[#0B1120] to-[#111827] border-white/5 shadow-2xl rounded-2xl group">
                    <div className="absolute inset-0 bg-gradient-to-br from-rose-500/5 via-transparent to-transparent opacity-30 group-hover:opacity-100 transition-opacity duration-700"></div>
                    <div className="absolute -right-8 -bottom-8 w-24 h-24 bg-rose-500/10 blur-[30px] rounded-full"></div>
                    <div className="relative z-10 flex items-center gap-4">
                        <div className="p-3 bg-rose-500/10 rounded-xl text-rose-500 border border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.15)] relative">
                             <div className="absolute inset-0 bg-rose-500/20 animate-ping rounded-xl opacity-20"></div>
                             <FireIcon className="w-5 h-5 relative z-10 drop-shadow-[0_0_8px_rgba(244,63,94,0.8)]" />
                        </div>
                        <div className="flex flex-col">
                            <p className="text-[10px] text-gray-400 uppercase tracking-widest font-bold mb-0.5">Total Rekt (Session)</p>
                            <p className="text-2xl font-bold font-mono text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.2)]">
                                ${(aggregatedStats.totalVol / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k
                            </p>
                        </div>
                    </div>
                </Card>

                {/* Stats: Ratio Bar */}
                <Card className="md:col-span-2 flex flex-col justify-center !p-5 relative overflow-hidden bg-gradient-to-br from-[#0B1120] to-[#111827] border-white/5 shadow-2xl rounded-2xl group">
                    <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(255,255,255,0.02)_0%,transparent_100%)] pointer-events-none"></div>
                    <div className="relative z-10 flex flex-col h-full justify-center gap-4">
                        <div className="flex justify-between items-end">
                            <div className="flex flex-col gap-1">
                                <div className="flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse"></div>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Longs Rekt</p>
                                </div>
                                <p className="text-xl font-mono font-bold text-rose-400 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]">${(aggregatedStats.longLiqs / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k</p>
                            </div>
                            
                            <div className="flex flex-col items-center justify-center opacity-80 backdrop-blur-sm bg-black/20 px-3 py-1.5 rounded-xl border border-white/5">
                                 <span className="text-[9px] text-gray-500 uppercase font-mono font-bold tracking-widest">Ratio</span>
                                 <span className="text-xs font-bold font-mono text-white mt-0.5">{longRatio.toFixed(1)}% <span className="text-gray-600">|</span> {(100 - longRatio).toFixed(1)}%</span>
                            </div>

                            <div className="flex flex-col gap-1 items-end">
                                <div className="flex items-center gap-1.5">
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Shorts Rekt</p>
                                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.8)] animate-pulse"></div>
                                </div>
                                <p className="text-xl font-mono font-bold text-emerald-400 drop-shadow-[0_0_8px_rgba(16,185,129,0.5)]">${(aggregatedStats.shortLiqs / 1000).toLocaleString(undefined, { maximumFractionDigits: 0 })}k</p>
                            </div>
                        </div>
                        {/* The Ratio Bar */}
                        <div className="w-full h-2.5 bg-black/60 rounded-full overflow-hidden relative flex border border-white/5 shadow-inner">
                            <div className="h-full bg-gradient-to-r from-rose-600 to-rose-400 transition-all duration-700 ease-out relative" style={{ width: `${longRatio}%` }}>
                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] opacity-50"></div>
                            </div>
                            <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-600 flex-1 transition-all duration-700 ease-out relative">
                                <div className="absolute inset-0 bg-[linear-gradient(45deg,rgba(255,255,255,0.15)_25%,transparent_25%,transparent_50%,rgba(255,255,255,0.15)_50%,rgba(255,255,255,0.15)_75%,transparent_75%,transparent)] bg-[length:1rem_1rem] opacity-50"></div>
                            </div>
                            {/* Center Marker */}
                            <div className="absolute top-[-2px] bottom-[-2px] left-1/2 w-0.5 bg-white z-10 shadow-[0_0_8px_rgba(255,255,255,1)]"></div>
                        </div>
                    </div>
                </Card>
            </div>

            {/* Main Content Area */}
            <div ref={containerRef} className="flex-1 flex gap-4 relative min-h-0 staggered-fade-in" style={{ animationDelay: '100ms' }}>
                {isResizing && <div className="absolute inset-0 z-50 cursor-col-resize" />}

                {/* Left: Chart */}
                <div className="h-full flex flex-col transition-all duration-75 relative" style={{ width: `${chartWidth}%` }}>
                    <Card className="flex-1 min-h-0 relative p-0 overflow-hidden border-white/5 shadow-2xl bg-[#0B1120] rounded-2xl group">
                        {/* High-tech border effects */}
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/10 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-700 pointer-events-none z-0"></div>
                        <div className="absolute top-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-brand-primary/50 to-transparent opacity-50 z-10"></div>
                        <div className="absolute bottom-0 left-0 w-full h-px bg-gradient-to-r from-transparent via-brand-primary/20 to-transparent z-10"></div>

                        {/* View Switcher and Price (Absolute Top-Left) */}
                        <div className="absolute top-4 left-4 z-20 flex items-center gap-4">
                            <div className="flex bg-black/60 backdrop-blur-md rounded-xl p-1 shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-white/10 overflow-hidden">
                                <button
                                    onClick={() => setChartView('price')}
                                    className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 relative ${chartView === 'price' ? 'text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                >
                                    {chartView === 'price' && <div className="absolute inset-0 bg-brand-primary/20 bg-gradient-to-r from-brand-primary/40 to-brand-primary/10 rounded-lg -z-10 shadow-[inner_0_0_10px_rgba(59,130,246,0.3)] border border-brand-primary/50"></div>}
                                    Price Action
                                </button>
                                <button
                                    onClick={() => setChartView('bubbles')}
                                    className={`px-4 py-1.5 text-[10px] font-bold uppercase tracking-wider rounded-lg transition-all duration-300 relative ${chartView === 'bubbles' ? 'text-white' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}
                                >
                                    {chartView === 'bubbles' && <div className="absolute inset-0 bg-brand-primary/20 bg-gradient-to-r from-brand-primary/40 to-brand-primary/10 rounded-lg -z-10 shadow-[inner_0_0_10px_rgba(59,130,246,0.3)] border border-brand-primary/50"></div>}
                                    Liquidations
                                </button>
                            </div>

                           {/* Embedded Price Display */}
                           <div className="flex items-center gap-3 bg-black/60 backdrop-blur-md rounded-xl px-4 py-1 shadow-[0_4px_20px_rgba(0,0,0,0.5)] border border-white/10 h-[34px]">
                                <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">Oracle</span>
                                <span className={`text-base font-mono font-bold tracking-tight transition-colors duration-300 ${priceUpdateStatus === 'up' ? 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]' : priceUpdateStatus === 'down' ? 'text-rose-400 drop-shadow-[0_0_8px_rgba(251,113,133,0.5)]' : 'text-white drop-shadow-[0_0_5px_rgba(255,255,255,0.3)]'}`}>
                                    {wsPrice > 0 ? `$${wsPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '---'}
                                </span>
                                {!isConnected && (
                                    <span className="text-[8px] font-bold text-red-500 bg-red-500/10 px-1.5 py-0.5 rounded border border-red-500/20 animate-pulse">
                                        OFFLINE
                                    </span>
                                )}
                           </div>
                        </div>

                        {chartView === 'price' && (
                            <div id={`tradingview_liquidation_chart_${widgetKey}`} className="w-full h-full relative z-10" />
                        )}

                        {chartView === 'bubbles' && (
                            <div className="w-full h-full p-6 bg-transparent relative z-10">
                                <LiquidationBubbleChart data={liveFeed} activePair={activePair} />
                            </div>
                        )}

                        {/* Floating Toolbar for Highlights */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-none w-full max-w-lg px-4 transition-transform duration-500 group-hover:-translate-y-2">
                            <div className="bg-[#0B1120]/80 backdrop-blur-xl border border-white/10 rounded-2xl p-2.5 flex items-center justify-between gap-3 shadow-[0_10px_30px_rgba(0,0,0,0.5)] pointer-events-auto relative overflow-hidden group/toolbar">
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-brand-primary/5 to-transparent -translate-x-full group-hover/toolbar:animate-[shimmer_2s_infinite]"></div>
                                
                                <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-2 whitespace-nowrap flex items-center gap-1.5">
                                    <div className="w-1.5 h-1.5 rounded-full bg-yellow-500 animate-pulse shadow-[0_0_5px_rgba(234,179,8,0.8)]"></div>
                                    Track Levels
                                </span>
                                
                                <div className="h-6 w-px bg-white/10 mx-1"></div>
                                
                                <form onSubmit={handleHighlightSubmit} className="flex gap-2 w-40 shrink-0">
                                    <input
                                        type="number"
                                        value={highlightLevelInput}
                                        onChange={(e) => setHighlightLevelInput(e.target.value)}
                                        placeholder="Price..."
                                        className="bg-black/40 border border-white/5 rounded-lg px-2.5 py-1 text-xs text-white placeholder-gray-600 focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary/50 outline-none w-full font-mono transition-all"
                                    />
                                    <button type="submit" className="bg-brand-primary/20 hover:bg-brand-primary/40 text-brand-primary border border-brand-primary/30 px-2.5 py-1 rounded-lg text-xs font-bold transition-colors">+</button>
                                </form>

                                <div className="flex-1 flex gap-1.5 overflow-x-auto no-scrollbar scroll-smooth">
                                    {highlightedLevels.map(level => (
                                        <span key={level} className="flex flex-shrink-0 items-center gap-1 bg-yellow-500/10 text-yellow-500 border border-yellow-500/20 rounded-md px-2 py-0.5 text-[10px] font-mono font-bold whitespace-nowrap group/tag transition-all hover:bg-yellow-500/20 hover:border-yellow-500/40">
                                            ${level}
                                            <button onClick={() => handleRemoveHighlight(level)} className="text-yellow-500/50 group-hover/tag:text-yellow-500 hover:!text-red-400 focus:outline-none transition-colors ml-0.5" type="button">&times;</button>
                                        </span>
                                    ))}
                                    {highlightedLevels.length === 0 && (
                                        <span className="text-[10px] text-gray-600 italic px-2 py-1 whitespace-nowrap">No levels tracked</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        <button onClick={toggleFullScreen} className="absolute top-4 right-4 z-20 p-2.5 bg-black/40 backdrop-blur-md border border-white/10 rounded-xl text-gray-400 hover:text-white hover:bg-white/10 hover:border-white/20 transition-all shadow-[0_4px_15px_rgba(0,0,0,0.5)]">
                            <ExpandIcon />
                        </button>
                    </Card>
                </div>

                {/* Dragger */}
                <div
                    className="w-1.5 cursor-col-resize flex items-center justify-center group flex-shrink-0 hover:scale-x-150 transition-transform"
                    onMouseDown={handleMouseDown}
                >
                    <div className={`h-16 w-1 rounded-full bg-white/10 group-hover:bg-brand-primary transition-all duration-300 ${isResizing ? 'bg-brand-primary shadow-[0_0_10px_rgba(59,130,246,0.8)]' : ''}`}></div>
                </div>

                {/* Right: Kill Feed & CLD */}
                <div className="h-full flex flex-col gap-4" style={{ width: `calc(${100 - chartWidth}% - 22px)` }}>
                    <Card className="flex-1 flex flex-col min-h-0 !p-0 border-white/5 shadow-2xl bg-[#0B1120] rounded-2xl overflow-hidden relative">
                        {/* High-tech border effects */}
                        <div className="absolute inset-0 bg-gradient-to-br from-brand-primary/5 via-transparent to-transparent opacity-50 z-0 pointer-events-none"></div>

                        {/* Tab Switcher */}
                        <div className="flex border-b border-white/10 bg-black/40 relative z-10 w-full overflow-hidden shrink-0">
                            <button onClick={() => setRightPanelTab('feed')} className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-300 relative truncate px-2 ${rightPanelTab === 'feed' ? 'text-brand-primary bg-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                                Live Feed
                                {rightPanelTab === 'feed' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-primary shadow-[0_-2px_8px_rgba(59,130,246,0.8)]"></div>}
                            </button>
                            <button onClick={() => setRightPanelTab('cld')} className={`flex-1 py-3 text-[10px] sm:text-xs font-bold uppercase tracking-wider transition-all duration-300 relative truncate px-2 ${rightPanelTab === 'cld' ? 'text-brand-primary bg-white/5' : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'}`}>
                                Analytics
                                {rightPanelTab === 'cld' && <div className="absolute bottom-0 left-0 w-full h-0.5 bg-brand-primary shadow-[0_-2px_8px_rgba(59,130,246,0.8)]"></div>}
                            </button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-0 relative z-10 w-full">
                            {rightPanelTab === 'feed' ? (
                                <div className="absolute inset-0 overflow-y-auto p-4 custom-scrollbar">
                                    {liveFeed.length === 0 && (
                                        <div className="h-full flex flex-col items-center justify-center text-gray-500 space-y-4">
                                            <div className="relative w-12 h-12 flex items-center justify-center">
                                                <div className="absolute inset-0 border-t-2 border-brand-primary rounded-full animate-spin"></div>
                                                <div className="w-2 h-2 bg-brand-primary rounded-full animate-pulse shadow-[0_0_10px_rgba(59,130,246,0.8)]"></div>
                                            </div>
                                            <span className="text-[10px] sm:text-xs uppercase tracking-widest font-mono text-center px-4">
                                                {isConnected ? `Scanning for ${activePair} Liquidations...` : 'Connecting to Node...'}
                                            </span>
                                        </div>
                                    )}
                                    {liveFeed.filter(e => e.amount >= minLiquidationThreshold).map(e => (
                                        <KillFeedItem key={e.id} event={e} activePair={activePair} />
                                    ))}
                                </div>
                            ) : (
                                <div className="absolute inset-0 flex flex-col p-5">
                                    <div className="flex items-center justify-between mb-4">
                                        <h3 className="text-[10px] sm:text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
                                            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-brand-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
                                            </svg>
                                            <span className="hidden sm:inline">Cumulative Liq Delta</span>
                                            <span className="inline sm:hidden">CVD</span>
                                        </h3>
                                        {cldData.length > 0 && (
                                            <span className={`text-[10px] sm:text-xs font-mono font-bold px-2 py-1 rounded bg-black/40 border border-white/5 ${cldData[cldData.length-1].value >= 0 ? 'text-emerald-400 drop-shadow-[0_0_5px_rgba(16,185,129,0.5)]' : 'text-rose-400 drop-shadow-[0_0_5px_rgba(244,63,94,0.5)]'}`}>
                                                {cldData[cldData.length-1].value >= 0 ? '+' : ''}{(cldData[cldData.length-1].value / 1000).toFixed(1)}k
                                            </span>
                                        )}
                                    </div>
                                    
                                    <div className="flex-1 relative min-h-0">
                                        <div className="absolute inset-0 bg-black/20 rounded-xl border border-white/5 p-2">
                                            <ResponsiveContainer width="100%" height="100%">
                                                <AreaChart data={cldData}>
                                                    <defs>
                                                        <linearGradient id="cldGradient" x1="0" y1="0" x2="0" y2="1">
                                                            <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.4} />
                                                            <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                                                        </linearGradient>
                                                    </defs>
                                                    <Tooltip
                                                        contentStyle={{ backgroundColor: 'rgba(11, 17, 32, 0.9)', border: '1px solid rgba(255,255,255,0.1)', backdropFilter: 'blur(8px)', borderRadius: '0.5rem', color: '#fff', fontSize: '12px', fontFamily: 'monospace' }}
                                                        formatter={(v: number) => {
                                                            const isPos = v >= 0;
                                                            return [<span className={isPos ? 'text-emerald-400' : 'text-rose-400'}>{isPos ? '+' : ''}${(v).toLocaleString()}</span>, 'Delta'];
                                                        }}
                                                        labelFormatter={() => ''}
                                                    />
                                                    <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" strokeDasharray="3 3" />
                                                    <Area
                                                        type="monotone"
                                                        dataKey="value"
                                                        stroke="#3B82F6"
                                                        strokeWidth={2}
                                                        fill="url(#cldGradient)"
                                                        isAnimationActive={false}
                                                    />
                                                </AreaChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>
                                    <div className="mt-4 flex flex-col sm:flex-row justify-between items-start sm:items-center text-[9px] sm:text-[10px] font-mono border-t border-white/5 pt-3 gap-2 shrink-0">
                                        <div className="flex items-center gap-1.5 text-emerald-500">
                                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0"></div>
                                            Positive = Buy Pressure
                                        </div>
                                        <div className="flex items-center gap-1.5 text-rose-500">
                                            Negative = Sell Pressure
                                            <div className="w-1.5 h-1.5 rounded-full bg-rose-500 shrink-0"></div>
                                        </div>
                                    </div>
                                </div>
                            )}
                        </div>
                    </Card>
                </div>
            </div>

            {/* Fullscreen Chart Portal */}
            {isChartFullScreen && (
                <div className="fixed inset-0 z-[100] bg-white dark:bg-brand-darkest p-0 animate-modal-fade-in">
                    <div id={`tradingview_fullscreen_liquidation_chart_${widgetKey}`} className="w-full h-full" />
                    <button onClick={toggleFullScreen} className="absolute top-4 right-4 z-20 p-2 bg-brand-darkest/50 backdrop-blur-md rounded-lg text-white hover:bg-brand-darkest transition-colors">
                        <CollapseIcon />
                    </button>
                </div>
            )}
        </div>
    );
};

export default StandardLiquidationView;
