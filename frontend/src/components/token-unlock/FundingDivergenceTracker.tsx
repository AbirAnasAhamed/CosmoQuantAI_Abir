import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, ReferenceLine } from 'recharts';
import apiClient from '@/services/client';
import { useTheme } from '@/context/ThemeContext';

interface FundingPoint { days_before_unlock: number; label: string; funding_rate: number; }
interface FundingData {
    current_funding_rate: number;
    funding_timeline: FundingPoint[];
    pre_unlock_norm_pct: number;
    divergence_score: number;
    is_bearish_signal: boolean;
    signal_direction: string;
    signal_description: string;
    suggested_action: string;
}

interface Props { eventId: string; }

const FundingDivergenceTracker: React.FC<Props> = ({ eventId }) => {
    const { theme } = useTheme();
    const { data, isLoading } = useQuery<FundingData>({
        queryKey: ['unlock-funding', eventId],
        queryFn: async () => (await apiClient.get(`/token-unlocks/${eventId}/funding`)).data,
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-64 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Funding data unavailable</div>;

    const axisColor = theme === 'dark' ? '#6B7280' : '#9CA3AF';
    const bearish = data.is_bearish_signal;

    const chartData = data.funding_timeline.map(p => ({
        ...p,
        value: p.funding_rate * 100,
    }));

    return (
        <div className="space-y-4">
            {/* Signal Banner */}
            <div className={`rounded-2xl p-4 border ${bearish ? 'bg-rose-900/20 border-rose-500/30' : 'bg-emerald-900/20 border-emerald-500/30'}`}>
                <div className="flex items-center justify-between">
                    <div>
                        <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${bearish ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {bearish ? '⚡ SMART MONEY SIGNAL: BEARISH' : '✅ NEUTRAL — No Positioning Detected'}
                        </div>
                        <div className={`text-2xl font-mono font-bold ${bearish ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {(data.current_funding_rate * 100).toFixed(4)}%
                            <span className="text-sm text-gray-500 ml-2 font-normal">current funding</span>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500">Divergence Score</div>
                        <div className={`text-3xl font-mono font-bold ${bearish ? 'text-rose-400' : 'text-gray-400'}`}>
                            {data.divergence_score.toFixed(0)}
                        </div>
                    </div>
                </div>
            </div>

            {/* Chart */}
            <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={chartData}>
                        <defs>
                            <linearGradient id="fundingGrad" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={bearish ? '#F43F5E' : '#10B981'} stopOpacity={0.3} />
                                <stop offset="95%" stopColor={bearish ? '#F43F5E' : '#10B981'} stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis dataKey="label" stroke={axisColor} fontSize={9} tickLine={false} axisLine={false} />
                        <YAxis stroke={axisColor} fontSize={9} tickFormatter={v => `${v.toFixed(2)}%`} tickLine={false} axisLine={false} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
                            formatter={(v: number) => [`${v.toFixed(4)}%`, 'Funding Rate']}
                        />
                        <ReferenceLine y={0} stroke="#475569" strokeDasharray="3 3" />
                        <Area type="monotone" dataKey="value" stroke={bearish ? '#F43F5E' : '#10B981'} strokeWidth={2} fill="url(#fundingGrad)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Action Box */}
            <div className="bg-black/20 border border-white/5 rounded-xl p-4 space-y-2">
                <p className="text-xs text-gray-400 leading-relaxed">{data.signal_description}</p>
                <div className={`text-xs font-semibold ${bearish ? 'text-rose-400' : 'text-emerald-400'}`}>
                    → {data.suggested_action}
                </div>
            </div>
        </div>
    );
};

export default FundingDivergenceTracker;
