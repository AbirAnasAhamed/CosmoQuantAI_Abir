import React, { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { GodModeState } from '../../../hooks/useGodModeData';

interface GodModeHUDProps {
    data: GodModeState | null;
    visible: boolean;
}

export const GodModeHUD: React.FC<GodModeHUDProps> = ({ data, visible }) => {
    const [position, setPosition] = useState({ x: 20, y: 80 });
    const [isDragging, setIsDragging] = useState(false);
    const dragRef = useRef<{ startX: number; startY: number; initX: number; initY: number } | null>(null);

    const onPointerDown = (e: React.PointerEvent) => {
        setIsDragging(true);
        dragRef.current = { startX: e.clientX, startY: e.clientY, initX: position.x, initY: position.y };
        e.currentTarget.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: React.PointerEvent) => {
        if (!isDragging || !dragRef.current) return;
        const dx = e.clientX - dragRef.current.startX;
        const dy = e.clientY - dragRef.current.startY;
        setPosition({ x: dragRef.current.initX + dx, y: dragRef.current.initY + dy });
    };

    const onPointerUp = (e: React.PointerEvent) => {
        setIsDragging(false);
        dragRef.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
    };

    if (!visible || !data) return null;

    const { pain_threshold, smart_money, dumb_money, cvd_spoof } = data;
    
    // Normalize Smart vs Dumb UI
    const smart = smart_money || 0;
    const dumb = dumb_money || 0;
    const totalMoney = smart + dumb;
    const smartRatio = totalMoney > 0 ? (smart / totalMoney) * 100 : 50;

    const isSqueezeImminent = pain_threshold?.value >= 90 || pain_threshold?.status === 'critical';

    const content = (
        <div 
            className="fixed z-[9999] flex flex-col gap-3 pointer-events-auto"
            style={{ left: position.x, top: position.y }}
        >
            {/* SQUEEZE ALERT */}
            {isSqueezeImminent && (
                <div className="bg-red-600/20 border border-red-500/50 backdrop-blur-md rounded-lg px-4 py-2 shadow-[0_0_20px_rgba(239,68,68,0.4)] animate-pulse cursor-default">
                    <h3 className="text-red-400 font-black text-sm uppercase tracking-widest flex items-center gap-2">
                        <span className="text-lg">🔥</span>
                        Squeeze Imminent 
                        <span className="text-lg">🔥</span>
                    </h3>
                    <p className="text-red-200/80 text-[10px] font-mono mt-0.5">Pain Threshold: {pain_threshold.value}%</p>
                </div>
            )}

            {/* MAIN HUD */}
            <div 
                className={`w-64 bg-black/40 backdrop-blur-xl border border-white/10 rounded-xl p-3 shadow-2xl transition-all ${isDragging ? 'cursor-grabbing scale-105 border-brand-primary/50' : 'cursor-grab'} select-none`}
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerUp}
            >
                <div className="flex items-center justify-between mb-3 pointer-events-none">
                    <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest flex items-center gap-1.5">
                        <svg className="w-3.5 h-3.5 text-brand-primary" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 14.5v-9l6 4.5-6 4.5z"/></svg>
                        God Mode AI
                    </h4>
                    <span className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse"></span>
                        <span className="text-[9px] text-green-400 font-mono tracking-wider">LIVE</span>
                    </span>
                </div>

                {/* PAIN THRESHOLD METER */}
                <div className="mb-3">
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-[10px] text-gray-400 font-semibold uppercase">Pain Threshold</span>
                        <span className={`text-xs font-bold font-mono ${pain_threshold?.value > 80 ? 'text-red-400' : 'text-gray-300'}`}>
                            {pain_threshold?.value || 0}%
                        </span>
                    </div>
                    <div className="w-full bg-gray-800 rounded-full h-1.5 overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-1000 ${pain_threshold?.value > 80 ? 'bg-gradient-to-r from-orange-500 to-red-500' : 'bg-gradient-to-r from-blue-500 to-indigo-500'}`}
                            style={{ width: `${Math.min(100, Math.max(0, pain_threshold?.value || 0))}%` }}
                        />
                    </div>
                </div>

                {/* SMART VS DUMB MONEY */}
                <div className="mb-3">
                    <div className="flex justify-between items-end mb-1">
                        <span className="text-[10px] text-gray-400 font-semibold uppercase">Smart vs Dumb Flow</span>
                    </div>
                    <div className="relative w-full bg-gray-800 rounded-full h-2.5 overflow-hidden flex">
                        <div 
                            className="h-full bg-gradient-to-r from-green-500 to-emerald-400 transition-all duration-1000 relative"
                            style={{ width: `${smartRatio}%` }}
                        />
                        <div 
                            className="h-full bg-gradient-to-r from-red-500 to-orange-400 transition-all duration-1000 relative"
                            style={{ width: `${100 - smartRatio}%` }}
                        />
                    </div>
                    <div className="flex justify-between mt-1 px-0.5">
                        <span className="text-[9px] font-mono text-green-400 font-bold">Smart ({(smartRatio).toFixed(1)}%)</span>
                        <span className="text-[9px] font-mono text-red-400 font-bold">Dumb ({(100 - smartRatio).toFixed(1)}%)</span>
                    </div>
                </div>

                {/* CVD SPOOF STATUS */}
                <div className="bg-white/5 rounded-lg p-2 flex justify-between items-center border border-white/5">
                    <span className="text-[10px] text-gray-400 font-semibold uppercase">Spoof Rating</span>
                    <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${cvd_spoof === 'High' ? 'bg-red-500/20 text-red-400' : cvd_spoof === 'Medium' ? 'bg-yellow-500/20 text-yellow-400' : 'bg-gray-500/20 text-gray-300'}`}>
                        {cvd_spoof || 'Normal'}
                    </span>
                </div>
            </div>
        </div>
    );

    return typeof window !== 'undefined' ? createPortal(content, document.body) : null;
};
