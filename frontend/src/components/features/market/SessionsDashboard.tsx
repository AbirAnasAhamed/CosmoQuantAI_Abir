import React from 'react';
import { IndicatorSettings } from './IndicatorSelector';

export interface SessionStatus {
    name: string;
    isActive: boolean;
    color: string;
    r2: number | null;
    stdev: number | null;
    volume: number | null;
}

interface SessionsDashboardProps {
    settings: IndicatorSettings;
    statuses: SessionStatus[];
}

export const SessionsDashboard: React.FC<SessionsDashboardProps> = ({ settings, statuses }) => {
    if (!settings.showSessions || !settings.showSessionDashboard) return null;

    return (
        <div className="absolute top-16 right-4 z-[20] flex flex-col gap-2 pointer-events-none select-none">
            <div className="backdrop-blur-xl bg-white/10 dark:bg-[#0B1120]/60 border border-white/10 rounded-2xl shadow-2xl p-4 min-w-[200px] border-l-4 border-l-brand-primary animate-in fade-in slide-in-from-right-4 duration-500 overflow-hidden">
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <div className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse shadow-[0_0_8px_rgba(var(--brand-primary-rgb),0.8)]" />
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] font-mono">Sessions Dashboard</span>
                    </div>
                </div>
                
                <div className="space-y-3">
                    {statuses.filter(s => s.isActive || !settings.advancedDashboard).map((s, idx) => (
                        <div key={idx} className="flex flex-col gap-1.5">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-2 h-2 rounded shadow-sm" style={{ backgroundColor: s.color }} />
                                    <span className="text-xs font-bold text-gray-100">{s.name}</span>
                                </div>
                                <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase tracking-wider border ${
                                    s.isActive 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : 'bg-gray-500/10 text-gray-500 border-gray-500/20'
                                }`}>
                                    {s.isActive ? 'Active' : 'Inactive'}
                                </span>
                            </div>
                            
                            {settings.advancedDashboard && s.isActive && (
                                <div className="grid grid-cols-2 gap-2 mt-1 pl-4 border-l border-white/5 bg-white/5 rounded-r-lg p-2">
                                    {s.r2 !== null && (
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-gray-500 uppercase font-black tracking-tighter">Correlation (R)</span>
                                            <span className={`text-[11px] font-mono font-bold ${Math.abs(s.r2) > 0.8 ? 'text-emerald-400' : 'text-orange-400'}`}>
                                                {s.r2.toFixed(3)}
                                            </span>
                                        </div>
                                    )}
                                    {s.stdev !== null && (
                                        <div className="flex flex-col">
                                            <span className="text-[8px] text-gray-500 uppercase font-black tracking-tighter">Volatility (σ)</span>
                                            <span className="text-[11px] text-blue-400 font-mono font-bold">
                                                {s.stdev.toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    ))}
                    
                    {statuses.every(s => !s.isActive) && !settings.advancedDashboard && (
                        <div className="text-[10px] text-gray-500 italic text-center py-2 border-t border-white/5 mt-2">
                            No active sessions in current timeframe
                        </div>
                    )}
                </div>
                
                <div className="mt-4 pt-2 border-t border-white/5 flex items-center justify-between">
                    <span className="text-[8px] text-gray-600 font-bold uppercase tracking-widest">LuxAlgo Systems</span>
                    <span className="text-[8px] text-gray-600 font-mono">v1.2</span>
                </div>
            </div>
        </div>
    );
};
