import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, Tooltip, Cell } from 'recharts';
import apiClient from '@/services/client';

interface Allocator {
    name: string; type: string; allocation_pct: number; allocation_usd: number;
    sell_probability_pct: number; expected_sell_usd: number; expected_hold_usd: number; note: string;
}
interface AllocatorData {
    symbol: string; total_unlock_usd: number; real_sell_pressure_usd: number;
    sell_pressure_pct_of_unlock: number; raw_impact_score: number;
    effective_impact_score: number; raw_vs_effective_delta: number;
    allocators: Allocator[]; key_insight: string;
}

const TYPE_COLORS: Record<string, string> = {
    'Exit VC': '#F43F5E', 'Team': '#10B981', 'Foundation': '#6366F1', 'Community': '#F59E0B',
};

interface Props { eventId: string; }

const AllocatorIntelligence: React.FC<Props> = ({ eventId }) => {
    const { data, isLoading } = useQuery<AllocatorData>({
        queryKey: ['unlock-allocators', eventId],
        queryFn: async () => (await apiClient.get(`/token-unlocks/${eventId}/allocators`)).data,
        staleTime: 10 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-64 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Allocator data unavailable</div>;

    const sellPct = data.sell_pressure_pct_of_unlock;
    const barData = data.allocators.map(a => ({
        name: a.name.split(' ').slice(-1)[0],
        sell: a.expected_sell_usd / 1_000_000,
        hold: a.expected_hold_usd / 1_000_000,
        color: TYPE_COLORS[a.type] || '#6B7280',
    }));

    return (
        <div className="space-y-4">
            {/* Real Sell Pressure Header */}
            <div className="grid grid-cols-3 gap-3">
                <div className="bg-rose-900/20 border border-rose-500/20 rounded-xl p-4 col-span-1">
                    <div className="text-xs text-rose-400/70 uppercase tracking-wider font-semibold mb-1">Real Sell Pressure</div>
                    <div className="text-2xl font-mono font-bold text-rose-400">
                        ${(data.real_sell_pressure_usd / 1_000_000).toFixed(1)}M
                    </div>
                    <div className="text-xs text-gray-500 mt-1">{sellPct.toFixed(0)}% of unlock</div>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-xl p-4 col-span-1">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-1">Raw Score</div>
                    <div className="text-2xl font-mono font-bold text-gray-400 line-through">{data.raw_impact_score.toFixed(1)}</div>
                    <div className="text-xs text-amber-400">overstated</div>
                </div>
                <div className="bg-emerald-900/20 border border-emerald-500/20 rounded-xl p-4 col-span-1">
                    <div className="text-xs text-emerald-400/70 uppercase tracking-wider font-semibold mb-1">Effective Score</div>
                    <div className="text-2xl font-mono font-bold text-emerald-400">{data.effective_impact_score.toFixed(1)}</div>
                    <div className="text-xs text-gray-500">adjusted</div>
                </div>
            </div>

            {/* Allocator Breakdown */}
            <div className="space-y-2">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold px-1">Who Is Unlocking</div>
                {data.allocators.map((a, i) => {
                    const typeColor = TYPE_COLORS[a.type] || '#6B7280';
                    const barWidth = a.sell_probability_pct;
                    return (
                        <div key={i} className="bg-black/20 border border-white/5 rounded-xl p-3 hover:border-white/10 transition-colors">
                            <div className="flex justify-between items-start mb-2">
                                <div>
                                    <div className="font-semibold text-white text-sm">{a.name}</div>
                                    <div className="text-[10px] text-gray-500">{a.note}</div>
                                </div>
                                <div className="text-right">
                                    <div className="text-xs font-mono text-white">{a.allocation_pct.toFixed(0)}%</div>
                                    <div className="text-[10px]" style={{ color: typeColor }}>{a.type}</div>
                                </div>
                            </div>
                            {/* Sell probability bar */}
                            <div className="flex items-center gap-2">
                                <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full transition-all duration-1000" style={{ width: `${barWidth}%`, backgroundColor: typeColor }} />
                                </div>
                                <span className="text-[10px] font-mono" style={{ color: typeColor }}>{a.sell_probability_pct.toFixed(0)}% sell</span>
                            </div>
                        </div>
                    );
                })}
            </div>

            {/* Key Insight */}
            <div className="bg-indigo-900/10 border border-indigo-500/10 rounded-xl p-3">
                <div className="text-xs text-gray-400 leading-relaxed">💡 {data.key_insight}</div>
            </div>
        </div>
    );
};

export default AllocatorIntelligence;
