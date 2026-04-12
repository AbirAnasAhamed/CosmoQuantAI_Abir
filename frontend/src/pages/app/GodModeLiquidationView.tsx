import React, { useState, useEffect, useRef } from 'react';
import Card from '@/components/common/Card';
import { useGodModeWebsocket } from '../../hooks/useGodModeWebsocket';
import { useCCXTMarkets } from '../../hooks/useCCXTMarkets';

const GodModeLiquidationView: React.FC = () => {
    const { selectedPair } = useCCXTMarkets();
    const activePair = selectedPair || 'BTC/USDT';
    
    // Connect to live backend stream
    const { state, isConnected } = useGodModeWebsocket(activePair);
    const widgetRef = useRef<any>(null);

    // Initialize TradingView Widget
    useEffect(() => {
        const containerId = 'tradingview_godmode_chart';
        const createWidget = () => {
            const container = document.getElementById(containerId);
            if (!container) return;
            if (widgetRef.current) { try { widgetRef.current.remove(); } catch (e) { } widgetRef.current = null; }

            // @ts-ignore
            const widget = new window.TradingView.widget({
                symbol: `BINANCE:${activePair.replace('/', '')}`,
                interval: '15',
                autosize: true,
                container_id: containerId,
                theme: 'Dark',
                style: '1',
                locale: 'en',
                toolbar_bg: '#05080F',
                enable_publishing: false,
                hide_side_toolbar: true,
                hide_top_toolbar: true,
                allow_symbol_change: false,
                studies: ["Volume@tv-basicstudies"]
            });
            widgetRef.current = widget;
        };
        
        const checkLibraryAndCreate = () => { 
            if (typeof window.TradingView !== 'undefined' && window.TradingView.widget) createWidget(); 
            else setTimeout(checkLibraryAndCreate, 100); 
        }
        
        // Only run after state is initialized and the UI is rendered
        if (state) {
            checkLibraryAndCreate();
        }
        
        return () => { if (widgetRef.current) { try { widgetRef.current.remove(); widgetRef.current = null; } catch (e) { } } };
    }, [activePair, state !== null]);

    // Show loading state if data hasn't arrived
    if (!state) {
        return (
            <div className="flex flex-col h-full items-center justify-center gap-4 text-rose-500 font-mono">
                <div className="w-12 h-12 border-4 border-rose-500 border-t-transparent rounded-full animate-spin"></div>
                <div className="animate-pulse tracking-widest uppercase">Initializing God Mode Protocols...</div>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-full gap-4 overflow-hidden animate-fade-in-up">
            <div className="bg-brand-darkest text-center text-rose-500 font-mono text-[10px] py-0.5 border-b border-rose-500/20 shadow-[0_0_15px_rgba(244,63,94,0.3)] tracking-widest uppercase flex-shrink-0 z-10 flex justify-between px-4">
                <span>SYSTEM OVERRIDE: GOD MODE ACTIVATED // INSTITUTIONAL DATA UNCAPPED</span>
                <span className={isConnected ? "text-emerald-500" : "text-yellow-500"}>{isConnected ? "LIVE" : "RECONNECTING"}</span>
            </div>
            
            {/* Global Vulnerability Marquee */}
            <div className="flex-shrink-0 flex items-center bg-[#0B1120] border border-rose-500/30 rounded-xl p-1.5 overflow-hidden shadow-[0_0_20px_rgba(244,63,94,0.15)] mx-4 z-10">
                <span className="text-[10px] font-bold text-white bg-rose-600 px-3 py-1 rounded shadow-[0_0_10px_rgba(225,29,72,0.8)] uppercase whitespace-nowrap z-10 relative flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-white animate-ping"></div>
                    Vulnerability Scan
                </span>
                <div className="flex-1 overflow-hidden relative min-w-0 flex items-center">
                    <div className="absolute left-0 w-8 h-full bg-gradient-to-r from-[#0B1120] to-transparent z-10"></div>
                    <div className="absolute right-0 w-8 h-full bg-gradient-to-l from-[#0B1120] to-transparent z-10"></div>
                     <div className="flex animate-marquee whitespace-nowrap min-w-max pl-[10%] gap-8 text-[11px] font-mono text-gray-400">
                        {state.vulnerability.map((item, i) => (
                            <div key={item.coin + i} className="flex items-center gap-2">
                                <span className="font-bold text-gray-300">{item.coin}/USDT</span>
                                {item.side && (
                                    <span className={item.side === 'SHORTS' ? "text-emerald-400 font-bold border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 rounded-sm" : "text-rose-400 font-bold border border-rose-500/20 bg-rose-500/10 px-1.5 py-0.5 rounded-sm"}>
                                        🎯 {item.side}
                                    </span>
                                )}
                                <span className="text-yellow-400 font-bold ml-1">Risk: {item.risk}%</span>
                                <span className="text-gray-600 font-mono text-[10px]">| Est. Liq: ${item.est_liq}M</span>
                                <div className="w-1.5 h-1.5 rounded-full bg-white/10 mx-3"></div>
                            </div>
                        ))}
                     </div>
                </div>
            </div>

            <div className="flex-1 grid grid-cols-12 gap-4 min-h-0 px-4 pb-4">
                
                {/* LEFT HUD: Cross-Exchange & Arbitrage Radar */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 min-h-0">
                    <Card className="flex-1 overflow-hidden bg-gradient-to-b from-[#0F172A] to-[#0B1120] border-rose-500/10 p-0 relative group flex flex-col">
                        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_left,rgba(244,63,94,0.1)_0%,transparent_70%)] pointer-events-none"></div>
                        <div className="p-4 border-b border-white/5 flex items-center justify-between z-10">
                            <h3 className="text-xs font-bold font-mono text-white tracking-widest uppercase flex items-center gap-2">
                                <svg className="w-4 h-4 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>
                                Arbitrage Radar
                            </h3>
                            <span className="text-[9px] bg-emerald-500/20 text-emerald-400 px-1.5 py-0.5 rounded border border-emerald-500/30 animate-pulse">ACTIVE</span>
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar z-10 flex flex-col gap-3">
                            {state.arbitrage.length === 0 && (
                                <div className="text-[10px] text-gray-500 font-mono text-center mt-10 opacity-50">SCANNING SPREADS...</div>
                            )}
                            {state.arbitrage.map((arb, i) => (
                                <div key={i} className="bg-black/40 border border-white/5 rounded-lg p-3 hover:border-emerald-500/30 transition-colors group cursor-pointer relative overflow-hidden">
                                     <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/5 to-emerald-500/0 -translate-x-full group-hover:animate-[shimmer_1.5s_infinite]"></div>
                                    <div className="flex justify-between items-center mb-1 relative z-10">
                                        <span className="text-xs font-bold text-white">{arb.pair} gap detected</span>
                                        <span className="text-xs font-mono font-bold text-emerald-400">+{arb.diff}%</span>
                                    </div>
                                    <div className="text-[10px] text-gray-500 font-mono mb-2 relative z-10">{arb.target}</div>
                                    <div className="flex justify-between items-end relative z-10">
                                        <span className="text-[9px] text-gray-400">Vol: <span className="text-white">${arb.vol}</span></span>
                                        <button className="text-[9px] font-bold text-emerald-500 bg-emerald-500/10 hover:bg-emerald-500/20 px-2 py-1 rounded border border-emerald-500/20 transition-colors uppercase">
                                            Capture
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </Card>

                    <Card className="h-64 bg-[#0F172A]/80 border-rose-500/10 p-4 relative overflow-hidden flex flex-col items-center justify-center group flex-shrink-0">
                        <div className="absolute inset-0 bg-gradient-to-t from-rose-500/5 to-transparent pointer-events-none"></div>
                        <h3 className="text-xs font-bold font-mono text-gray-400 tracking-widest uppercase mb-4 absolute top-4 left-4 z-10 flex items-center gap-2">
                             Pain Threshold
                        </h3>
                        {/* Dynamic Speedometer */}
                        <div className="relative w-40 h-40 mt-4 flex items-center justify-center">
                            <svg className="w-full h-full transform transition-transform" viewBox="0 0 100 100" style={{ overflow: 'visible' }}>
                                {/* Background Arc */}
                                <path d="M 20 80 A 30 30 0 0 1 80 80" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="8" strokeLinecap="round" />
                                {/* Dynamic Fill Arc */}
                                <path d="M 20 80 A 30 30 0 0 1 80 80" fill="none" stroke="url(#painGradient)" strokeWidth="8" strokeLinecap="round" strokeDasharray="94.25" strokeDashoffset={94.25 - (state.pain_threshold.level / 100) * 94.25} className="transition-all duration-1000 ease-out" />
                                <defs>
                                    <linearGradient id="painGradient" x1="0%" y1="100%" x2="100%" y2="100%">
                                        <stop offset="0%" stopColor="#34D399" />
                                        <stop offset="50%" stopColor="#FBBF24" />
                                        <stop offset="100%" stopColor="#F43F5E" />
                                    </linearGradient>
                                </defs>
                            </svg>
                            {/* Dynamic Needle */}
                            <div className="absolute bottom-[20%] left-1/2 w-1 h-[45%] bg-white rounded-t origin-bottom transform transition-transform duration-1000 shadow-[0_0_10px_white] z-10" style={{ transform: `rotate(${-90 + (state.pain_threshold.level / 100) * 180}deg)` }}></div>
                            <div className="absolute bottom-[20%] left-1/2 w-4 h-4 -ml-2 rounded-full bg-brand-primary shadow-[0_0_15px_rgba(59,130,246,0.8)] z-20"></div>
                            
                            <div className="absolute bottom-[-10px] text-center w-full">
                                <div className="text-xl font-bold font-mono text-white drop-shadow-[0_0_8px_rgba(255,255,255,0.4)]">{state.pain_threshold.level}%</div>
                                <div className={`text-[9px] font-bold uppercase tracking-widest ${state.pain_threshold.status === 'EXTREME' ? 'text-rose-500 animate-pulse' : 'text-emerald-500'}`}>{state.pain_threshold.status}</div>
                            </div>
                        </div>
                    </Card>
                </div>

                {/* CENTER HUD: Advanced Chart & Magnet Zones & AI Predictor */}
                <div className="col-span-12 lg:col-span-6 flex flex-col gap-4 min-h-[400px] relative">
                    <Card className="flex-1 bg-gradient-to-b from-[#090E17] to-[#05080F] border-brand-primary/20 p-0 relative overflow-hidden group shadow-[0_0_30px_rgba(0,0,0,0.8)] flex flex-col">
                        <div className="p-3 sm:p-4 border-b border-white/5 flex flex-col sm:flex-row gap-2 sm:items-center justify-between z-20 absolute top-0 w-full bg-black/40 backdrop-blur-md">
                            <div className="flex gap-4">
                                <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><div className="w-2 h-2 bg-rose-500 rounded-sm"></div> Cascade Predictor</span>
                                <span className="text-[9px] sm:text-[10px] font-bold text-gray-400 uppercase tracking-widest flex items-center gap-1.5"><div className="w-2 h-2 bg-yellow-400 rounded-sm"></div> Magnet Zones</span>
                            </div>
                            <div className="flex items-center gap-2 pr-2 sm:pr-4">
                                 <span className={`text-[8px] sm:text-[9px] px-2 py-0.5 rounded font-mono uppercase whitespace-nowrap transition-colors ${state.cvd_spoof !== 'NEGATIVE' ? 'text-rose-500 border border-rose-500/50 bg-rose-500/20 blink' : 'text-brand-primary border border-brand-primary/30 bg-brand-primary/10'}`}>CVD Spoof Alert: {state.cvd_spoof}</span>
                            </div>
                        </div>
                        
                        {/* Live Overlay System */}
                        <div className="flex-1 mt-14 sm:mt-12 relative flex justify-between">
                             {/* Magnet Zones Overlay (Left Edge) */}
                             <div className="w-16 sm:w-20 border-r border-white/10 bg-black/30 backdrop-blur-sm relative py-10 px-1 flex flex-col justify-center shrink-0">
                                 <div className="absolute top-2 right-0 w-full text-center text-[7px] sm:text-[8px] text-gray-500 font-mono uppercase tracking-widest px-1">Magnets</div>
                                 
                                 {/* Map Short Magnets (above price) */}
                                 {state.magnet_zones.map((zone, i) => zone.price > state.current_price && (
                                     <div key={`mag-short-${i}`} className="h-6 w-full border border-yellow-500/20 rounded-sm mb-1 relative group cursor-crosshair overflow-hidden">
                                         <div className="absolute left-0 h-full bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.5)] transition-all" style={{width: `${zone.intensity}%`}}></div>
                                         <div className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] text-yellow-100 font-mono font-bold z-10 drop-shadow-[0_0_3px_black]">${zone.price}</div>
                                     </div>
                                 ))}
                                 
                                 {/* Spacer for current price */}
                                 <div className="h-16 w-full"></div>

                                 {/* Map Long Magnets (below price) */}
                                 {state.magnet_zones.map((zone, i) => zone.price <= state.current_price && (
                                     <div key={`mag-long-${i}`} className="h-6 w-full border border-yellow-500/20 rounded-sm mt-1 relative group cursor-crosshair overflow-hidden">
                                         <div className="absolute left-0 h-full bg-yellow-500/80 shadow-[0_0_10px_rgba(234,179,8,0.5)] transition-all" style={{width: `${zone.intensity}%`}}></div>
                                         <div className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] text-yellow-100 font-mono font-bold z-10 drop-shadow-[0_0_3px_black]">${zone.price}</div>
                                     </div>
                                 ))}
                             </div>

                             <div className="flex-1 relative bg-black/50">
                                  <div id="tradingview_godmode_chart" className="absolute inset-0"></div>
                             </div>
                             
                             {/* AI Predicted Cascade Overlay (Right Edge) */}
                             <div className="w-16 sm:w-20 border-l border-white/10 bg-black/30 backdrop-blur-sm relative py-10 px-1 flex flex-col justify-center shrink-0">
                                 <div className="absolute top-2 left-0 w-full text-center text-[7px] sm:text-[8px] text-gray-500 font-mono uppercase tracking-widest px-1">Probs</div>
                                 
                                 {/* Map Short cascades (above price) */}
                                 {state.cascade_probs.map((zone, i) => zone.price > state.current_price && (
                                     <div key={`short-${i}`} className="h-6 w-full bg-rose-500/20 rounded-sm mb-1 relative group cursor-crosshair">
                                         <div className="absolute right-0 h-full bg-rose-500 shadow-[0_0_10px_rgba(244,63,94,0.8)] rounded-sm transition-all" style={{width: `${zone.prob}%`}}></div>
                                         <div className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] text-white font-mono font-bold z-10 drop-shadow-[0_0_3px_black]">${zone.price} ({zone.prob}%)</div>
                                     </div>
                                 ))}
                                 
                                 {/* Current Price Line */}
                                 <div className="w-[150%] -ml-4 sm:-ml-6 h-px bg-white/50 relative shadow-[0_0_8px_white] my-8">
                                     <div className="absolute right-0 top-1/2 -translate-y-1/2 bg-white text-black text-[8px] sm:text-[9px] font-bold font-mono px-1 rounded">${state.current_price.toLocaleString()}</div>
                                 </div>

                                 {/* Map Long cascades (below price) */}
                                 {state.cascade_probs.map((zone, i) => zone.price <= state.current_price && (
                                     <div key={`long-${i}`} className="h-6 w-full bg-emerald-500/20 rounded-sm mt-1 relative group cursor-crosshair">
                                         <div className="absolute right-0 h-full bg-emerald-500 shadow-[0_0_10px_rgba(16,185,129,0.8)] rounded-sm transition-all" style={{width: `${zone.prob}%`}}></div>
                                         <div className="absolute inset-0 flex items-center justify-center text-[9px] sm:text-[10px] text-white font-mono font-bold z-10 drop-shadow-[0_0_3px_black]">${zone.price} ({zone.prob}%)</div>
                                     </div>
                                 ))}
                             </div>

                        </div>
                    </Card>
                </div>

                {/* RIGHT HUD: Smart vs Dumb Money & Advanced Feed */}
                <div className="col-span-12 lg:col-span-3 flex flex-col gap-4 min-h-0">
                    <Card className="h-48 bg-[#0F172A]/80 border-emerald-500/10 p-0 relative overflow-hidden flex flex-col group flex-shrink-0">
                        <div className="p-4 border-b border-white/5 bg-black/20 text-[10px] sm:text-xs font-bold font-mono text-gray-400 tracking-widest uppercase flex items-center gap-2">
                            <span className="w-2 h-2 rounded-full bg-purple-500 shadow-[0_0_8px_rgba(168,85,247,0.8)]"></span>
                            Smart vs Dumb Money
                        </div>
                        <div className="flex-1 flex items-center justify-around p-4 relative">
                            {/* Dynamic Donuts */}
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-full relative flex items-center justify-center shadow-[0_0_15px_rgba(168,85,247,0.2)]">
                                    <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                        <path className="text-gray-800" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                        <path className="text-purple-500 transition-all duration-500" strokeDasharray={`${state.smart_money}, 100`} strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                    </svg>
                                    <span className="text-xs font-mono font-bold text-white relative z-10">{state.smart_money}%</span>
                                </div>
                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Institutions</span>
                            </div>
                            
                            <div className="h-10 w-px bg-white/10 hidden sm:block"></div>

                            <div className="flex flex-col items-center gap-2">
                                <div className="w-16 h-16 rounded-full relative flex items-center justify-center shadow-[0_0_15px_rgba(251,113,133,0.2)]">
                                     <svg className="absolute inset-0 w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                                        <path className="text-gray-800" strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                        <path className="text-rose-400 transition-all duration-500" strokeDasharray={`${state.dumb_money}, 100`} strokeWidth="3" stroke="currentColor" fill="none" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                    </svg>
                                    <span className="text-xs font-mono font-bold text-white relative z-10">{state.dumb_money}%</span>
                                </div>
                                <span className="text-[9px] text-gray-400 font-bold uppercase tracking-widest">Retail</span>
                            </div>
                        </div>
                        {/* Dynamic Flow bar */}
                        <div className="h-1.5 w-full bg-gray-800 flex mt-auto">
                            <div className="h-full bg-purple-500 transition-all duration-500" style={{width: `${state.smart_money}%`}}></div>
                            <div className="h-full bg-rose-400 transition-all duration-500" style={{width: `${state.dumb_money}%`}}></div>
                        </div>
                    </Card>

                    <Card className="flex-1 overflow-hidden bg-gradient-to-b from-[#0F172A] to-[#0B1120] border-rose-500/10 p-0 relative group flex flex-col min-h-0">
                         <div className="p-4 border-b border-white/5 bg-black/20 text-xs font-bold font-mono text-rose-400 tracking-widest uppercase flex items-center gap-2">
                            <svg className="w-4 h-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2a7 7 0 0 0-7 7v1.53a4.004 4.004 0 0 0 .994 2.634L7.96 16H6a1 1 0 0 0 0 2h12a1 1 0 0 0 0-2h-1.96l1.966-2.836A4.004 4.004 0 0 0 19 10.53V9a7 7 0 0 0-7-7Zm-2.5 7a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Zm5 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3Z" /><path d="M8 20a1 1 0 0 0 0 2h8a1 1 0 0 0 0-2H8Z" /></svg>
                            Whale Kill Feed
                        </div>
                        <div className="flex-1 overflow-y-auto p-4 custom-scrollbar gap-2 flex flex-col">
                            {state.whale_feed.length === 0 && (
                                <div className="text-[10px] text-gray-500 font-mono text-center mt-10 opacity-50">NO WHALE ACTIVITY DETECTED...</div>
                            )}
                            {state.whale_feed.map((item, index) => (
                                <div key={index} className="bg-black/50 border border-rose-500/20 rounded-lg p-2.5 flex items-center gap-3 relative overflow-hidden group/item animate-fade-in-right">
                                     <div className="absolute left-0 top-0 bottom-0 w-1 bg-rose-500 shadow-[0_0_8px_rgba(244,63,94,1)] group-hover/item:w-1.5 transition-all"></div>
                                     <div className="flex-1 pl-1">
                                         <div className="flex justify-between items-center mb-0.5">
                                             <span className={`text-[10px] font-bold uppercase ${item.type.includes('Long') ? 'text-rose-500' : 'text-emerald-500'}`}>{item.type}</span>
                                             <span className="text-[9px] text-gray-500 font-mono">{item.time}</span>
                                         </div>
                                         <div className="flex justify-between items-end">
                                             <span className="text-sm font-mono font-bold text-white">${(item.value / 1000000).toFixed(2)}M</span>
                                             <span className="text-[9px] bg-yellow-500/20 text-yellow-500 border border-yellow-500/30 px-1 rounded uppercase tracking-widest shadow-[0_0_5px_rgba(234,179,8,0.5)]">Smart Money</span>
                                         </div>
                                     </div>
                                </div>
                            ))}
                        </div>
                    </Card>
                </div>
            </div>

            <style dangerouslySetInnerHTML={{__html: `
                @keyframes marquee {
                    0% { transform: translateX(0); }
                    100% { transform: translateX(-100%); }
                }
                .animate-marquee {
                    animation: marquee 30s linear infinite;
                }
                .blink {
                    animation: blink 2s infinite;
                }
                @keyframes blink {
                    0%, 100% { opacity: 1; }
                    50% { opacity: 0.5; }
                }
                @keyframes shimmer {
                    100% { transform: translateX(100%); }
                }
                .animate-fade-in-up {
                    animation: fadeInUp 0.5s ease-out forwards;
                }
                @keyframes fadeInUp {
                    from { opacity: 0; transform: translateY(20px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}} />
        </div>
    );
};

export default GodModeLiquidationView;
