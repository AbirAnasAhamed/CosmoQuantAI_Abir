import React, { useState, useEffect } from 'react';
import { Skull, TrendingUp, Activity, Layers, Plus } from 'lucide-react';
import AnimatedNumber from '@/components/common/AnimatedNumber';
import { systemService } from '@/services/systemService';
import type { ActiveBot } from '@/types';

interface BotLabHeaderProps {
    bots: ActiveBot[];
    stats: { 
        total_pnl: number; 
        average_win_rate: number; 
        active_bots: number; 
        total_bots: number 
    };
    onOpenCreate: () => void;
}

const BotLabHeader: React.FC<BotLabHeaderProps> = ({ bots, stats, onOpenCreate }) => {
    const [killSwitchActive, setKillSwitchActive] = useState(false);
    const [isLoading, setIsLoading] = useState(false);

    useEffect(() => {
        systemService.getKillSwitchStatus().then(data => setKillSwitchActive(data.active));
    }, []);

    const toggleKillSwitch = async () => {
        if (!killSwitchActive && !window.confirm("🚨 EMERGENCY: KILL ALL BOTS?")) return;
        setIsLoading(true);
        try {
            const data = await systemService.toggleKillSwitch(!killSwitchActive);
            setKillSwitchActive(data.active);
            if (data.active) alert("☠️ KILL SWITCH ACTIVATED.");
        } catch (e) { alert("Failed"); } finally { setIsLoading(false); }
    };

    return (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            {/* Kill Switch */}
            <button
                onClick={toggleKillSwitch}
                className={`relative overflow-hidden rounded-2xl p-4 border transition-all duration-500 group ${killSwitchActive
                    ? 'bg-red-600 border-red-500 shadow-[0_0_30px_rgba(220,38,38,0.5)] animate-pulse'
                    : 'bg-slate-900/50 border-white/5 hover:border-red-500/50 hover:bg-red-950/20'
                    }`}
            >
                <div className="relative z-10 flex flex-col items-center justify-center text-center h-full">
                    <div className={`p-3 rounded-full mb-2 transition-transform duration-300 group-hover:scale-110 ${killSwitchActive ? 'bg-white/20 text-white' : 'bg-red-500/10 text-red-500'}`}>
                        <Skull size={24} />
                    </div>
                    <p className={`text-xs font-bold uppercase tracking-wider ${killSwitchActive ? 'text-white' : 'text-red-500'}`}>
                        {isLoading ? 'Processing...' : killSwitchActive ? 'SYSTEM HALTED' : 'Kill Switch'}
                    </p>
                </div>
            </button>

            {/* Total PnL */}
            <div className="md:col-span-1 bg-gradient-to-br from-indigo-600 to-violet-600 rounded-2xl p-5 text-white shadow-lg relative overflow-hidden group">
                <div className="relative z-10">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-200 mb-1">Total PnL</p>
                    <div className="text-3xl font-bold font-mono tracking-tight">
                        {stats.total_pnl >= 0 ? '+' : '-'}<AnimatedNumber value={Math.abs(stats.total_pnl)} prefix="$" />
                    </div>
                </div>
                <TrendingUp className="absolute right-[-10px] bottom-[-10px] w-24 h-24 text-white/10 group-hover:scale-110 transition-transform duration-500 rotate-[-10deg]" />
            </div>

            {/* Active Bots */}
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Active Bots</p>
                    <Activity size={16} className="text-emerald-500" />
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">{stats.active_bots}</span>
                    <span className="text-xs text-gray-500">/ {stats.total_bots}</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-1 mt-3 overflow-hidden">
                    <div className="bg-emerald-500 h-full rounded-full transition-all duration-1000" style={{ width: `${(stats.active_bots / (stats.total_bots || 1)) * 100}%` }}></div>
                </div>
            </div>

            {/* Win Rate */}
            <div className="bg-slate-900/50 border border-white/5 rounded-2xl p-5 flex flex-col justify-center">
                <div className="flex items-center justify-between mb-2">
                    <p className="text-[10px] text-gray-500 uppercase font-bold tracking-wider">Win Rate</p>
                    <Layers size={16} className="text-cyan-500" />
                </div>
                <div className="flex items-baseline gap-2">
                    <span className="text-2xl font-bold text-white">{stats.average_win_rate.toFixed(1)}%</span>
                    <span className="text-xs text-emerald-400 flex items-center">▲ 2.4%</span>
                </div>
            </div>

            {/* Deploy Button */}
            <button
                onClick={onOpenCreate}
                className="bg-slate-900/50 border border-white/5 border-dashed hover:border-cyan-500 hover:bg-cyan-950/20 rounded-2xl p-4 flex flex-col items-center justify-center text-center transition-all duration-300 group"
            >
                <div className="w-10 h-10 rounded-full bg-cyan-500/10 text-cyan-500 flex items-center justify-center mb-2 group-hover:scale-110 group-hover:bg-cyan-500 group-hover:text-black transition-all">
                    <Plus size={24} />
                </div>
                <p className="text-xs font-bold text-cyan-500 group-hover:text-cyan-400">Deploy New</p>
            </button>
        </div>
    );
};

export default BotLabHeader;
