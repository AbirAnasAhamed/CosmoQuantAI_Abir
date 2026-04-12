import React, { useMemo } from 'react';
import { ResponsiveContainer, AreaChart, Area } from 'recharts';
import { Cpu, Zap, Settings, Activity, Trash2, BarChart2 } from 'lucide-react';
import Button from '@/components/common/Button';
import AnimatedNumber from '@/components/common/AnimatedNumber';
import { useBotStatus } from '@/hooks/useBotStatus';
import type { ActiveBot } from '@/types';

const MiniEquityChart: React.FC<{ isPositive: boolean; id: string; data?: number[] }> = ({ isPositive, id, data }) => {
    const chartData = useMemo(() => {
        if (!data || data.length === 0) {
            // Fallback: simple straight line if no data
            return Array.from({ length: 20 }, (_, i) => ({ i, value: 100 }));
        }
        return data.map((val, i) => ({ i, value: val }));
    }, [data]);

    // Neon colors
    const color = isPositive ? '#10B981' : '#F43F5E';
    const hasData = data && data.length > 0;

    return (
        <div className="h-24 w-full absolute bottom-0 left-0 right-0 opacity-20 group-hover:opacity-40 transition-opacity duration-500 pointer-events-none">
            {hasData ? (
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id={`gradient-${id}`} x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={color} stopOpacity={0.4} />
                                <stop offset="95%" stopColor={color} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke={color}
                            strokeWidth={2}
                            fill={`url(#gradient-${id})`}
                            isAnimationActive={true}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            ) : (
                <div className="w-full h-full flex items-end justify-center pb-2">
                    {/* Subtle empty state - maybe just a flat line or nothing. 
                        User requested "simple straight line or subtle text".
                        The fallback data above creates a straight line (value 100).
                        So we can still render the chart with the flat line data.
                     */}
                    <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={chartData}>
                            <defs>
                                <linearGradient id={`gradient-${id}-empty`} x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor={'#64748b'} stopOpacity={0.1} />
                                    <stop offset="95%" stopColor={'#64748b'} stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <Area
                                type="monotone"
                                dataKey="value"
                                stroke="#64748b"
                                strokeWidth={1}
                                strokeDasharray="3 3"
                                fill={`url(#gradient-${id}-empty)`}
                                isAnimationActive={false}
                            />
                        </AreaChart>
                    </ResponsiveContainer>
                </div>
            )}
        </div>
    );
};

const BotCard: React.FC<{
    bot: ActiveBot;
    index: number;
    isLoading?: boolean;
    onRunBacktest: (bot: ActiveBot) => void;
    onToggleStatus: (id: string, currentStatus?: string) => void;
    onDelete: (id: string) => void;
    onDetails: (bot: ActiveBot) => void;
    onSettings: (bot: ActiveBot) => void;
}> = ({ bot: initialBot, index, isLoading, onRunBacktest, onToggleStatus, onDelete, onDetails, onSettings }) => {
    const { liveBot: bot } = useBotStatus(initialBot);
    const isPositive = bot.pnl >= 0;

    return (
        <div
            className="group relative bg-slate-900/40 backdrop-blur-md border border-white/5 rounded-3xl overflow-hidden hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] transition-all duration-500 transform hover:-translate-y-1 flex flex-col"
            style={{ animation: `fadeInUp 0.6s ease-out ${index * 0.1}s backwards` }}
        >
            {/* Top Gradient Line */}
            <div className={`absolute top-0 left-0 w-full h-[2px] ${bot.status === 'active' ? 'bg-gradient-to-r from-transparent via-cyan-400 to-transparent shadow-[0_0_10px_#22d3ee]' : 'bg-white/10'}`} />

            <div className="p-6 relative z-10 flex flex-col h-full">
                {/* Header */}
                <div className="flex justify-between items-start mb-6">
                    <div>
                        <div className="flex items-center gap-3">
                            <div className={`p-2 rounded-xl ${bot.status === 'active' ? 'bg-cyan-500/20 text-cyan-400' : 'bg-slate-800 text-slate-500'}`}>
                                <Cpu size={20} />
                            </div>
                            <div>
                                <h3 className="font-bold text-lg text-white group-hover:text-cyan-400 transition-colors">{bot.name}</h3>
                                <div className="flex items-center gap-2 mt-1">
                                    <span className="text-[10px] uppercase tracking-wider font-bold bg-white/5 px-2 py-0.5 rounded text-gray-400 border border-white/5">{bot.market}</span>
                                    {bot.isRegimeAware && <span className="text-[10px] text-purple-400 flex items-center gap-1"><Zap size={10} /> SMART</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    <button
                        onClick={(e) => { e.stopPropagation(); onToggleStatus(bot.id, bot.status); }}
                        className={`relative w-10 h-6 rounded-full transition-colors duration-300 ${bot.status === 'active' ? 'bg-cyan-500/20' : 'bg-slate-700/50'}`}
                    >
                        <div className={`absolute top-1 left-1 w-4 h-4 rounded-full transition-all duration-300 shadow-lg ${bot.status === 'active' ? 'translate-x-4 bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]' : 'bg-slate-500'}`} />
                    </button>
                </div>

                {/* Metrics */}
                <div className="grid grid-cols-2 gap-4 mb-6">
                    <div className="bg-slate-800/30 rounded-xl p-3 border border-white/5">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">Net PnL</p>
                        <div className={`text-xl font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {isPositive ? '+' : '-'}<AnimatedNumber value={Math.abs(bot.pnl)} prefix="$" />
                        </div>
                    </div>
                    <div className="bg-slate-800/30 rounded-xl p-3 border border-white/5 text-right">
                        <p className="text-[10px] text-gray-500 uppercase tracking-wider font-semibold mb-1">ROI</p>
                        <div className={`text-lg font-bold font-mono ${isPositive ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {Math.abs(bot.pnlPercent).toFixed(2)}%
                        </div>
                    </div>
                </div>

                {/* Spacer */}
                <div className="flex-grow min-h-[40px]"></div>

                {/* Actions */}
                <div className="flex justify-between items-center mt-auto pt-4 border-t border-white/5 relative z-20">
                    <div className="flex gap-1">
                        <button
                            onClick={(e) => { e.stopPropagation(); onSettings(bot); }}
                            className="p-2 rounded-lg hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            title="Settings"
                        >
                            <Settings size={16} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDetails(bot); }}
                            className="p-2 rounded-lg hover:bg-blue-500/20 text-gray-400 hover:text-blue-400 transition-colors"
                            title="Details"
                        >
                            <Activity size={16} />
                        </button>
                        <button
                            onClick={(e) => { e.stopPropagation(); onDelete(bot.id); }}
                            className="p-2 rounded-lg hover:bg-rose-500/20 text-gray-400 hover:text-rose-400 transition-colors"
                            title="Delete"
                        >
                            <Trash2 size={16} />
                        </button>
                    </div>

                    <Button
                        size="sm"
                        className="relative overflow-hidden bg-transparent hover:bg-gradient-to-r hover:from-violet-600 hover:to-cyan-600 text-cyan-400 hover:text-white border border-cyan-500/30 hover:border-cyan-400 shadow-[0_0_10px_rgba(6,182,212,0.1)] hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] text-xs px-4 h-8 transition-all duration-300 group/btn"
                        onClick={() => onRunBacktest(bot)}
                        disabled={isLoading}
                    >
                        <span className="relative z-10 flex items-center">
                            {isLoading ? <span className="animate-spin mr-2">⟳</span> : <BarChart2 size={14} className="mr-2 group-hover/btn:animate-bounce" />}
                            Run Simulation
                        </span>
                    </Button>
                </div>
            </div>

            {/* Background Chart */}
            <MiniEquityChart isPositive={isPositive} id={bot.id} data={bot.equity_history} />
        </div>
    );
};

export default BotCard;
