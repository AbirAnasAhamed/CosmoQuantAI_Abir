import React from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/client';

interface DnaFingerprintData {
    symbol: string;
    pattern: string;
    pattern_icon: string;
    avg_48h_impact_pct: number;
    avg_7d_impact_pct: number;
    avg_recovery_days: number;
    sell_probability_pct: number;
    historical_events_count: number;
    model_accuracy_pct: number;
    worst_case_95th_pct: number;
    optimal_hedge: string;
    description: string;
}

interface Props {
    eventId: string;
    tokenName: string;
    tokenSymbol: string;
}

const MetricPill: React.FC<{ label: string; value: string; color: string }> = ({ label, value, color }) => (
    <div className="flex flex-col items-center bg-black/20 rounded-xl p-3 border border-white/10">
        <span className={`text-lg font-mono font-bold ${color}`}>{value}</span>
        <span className="text-[10px] text-gray-400 uppercase tracking-wider mt-0.5 text-center">{label}</span>
    </div>
);

const PATTERN_STYLES: Record<string, { bg: string; border: string; text: string; glow: string }> = {
    'Slow Bleed':     { bg: 'from-rose-900/40 to-rose-800/20',   border: 'border-rose-500/30',   text: 'text-rose-400',   glow: 'shadow-rose-500/20' },
    'Flash Dump':     { bg: 'from-orange-900/40 to-orange-800/20', border: 'border-orange-500/30', text: 'text-orange-400', glow: 'shadow-orange-500/20' },
    'Holder Profile': { bg: 'from-emerald-900/40 to-emerald-800/20', border: 'border-emerald-500/30', text: 'text-emerald-400', glow: 'shadow-emerald-500/20' },
    'Unknown':        { bg: 'from-gray-900/40 to-gray-800/20',   border: 'border-gray-500/30',   text: 'text-gray-400',   glow: 'shadow-gray-500/20' },
};

const DnaFingerprintWidget: React.FC<Props> = ({ eventId, tokenName, tokenSymbol }) => {
    const { data, isLoading, error } = useQuery<DnaFingerprintData>({
        queryKey: ['unlock-dna', eventId],
        queryFn: async () => {
            const res = await apiClient.get(`/token-unlocks/${eventId}/dna`);
            return res.data;
        },
        staleTime: 10 * 60 * 1000,
    });

    if (isLoading) {
        return (
            <div className="animate-pulse space-y-3">
                <div className="h-24 bg-gray-700/50 rounded-xl" />
                <div className="grid grid-cols-3 gap-3">
                    {[...Array(3)].map((_, i) => <div key={i} className="h-16 bg-gray-700/50 rounded-xl" />)}
                </div>
            </div>
        );
    }

    if (error || !data) {
        return <div className="text-center text-gray-500 py-8 text-sm">DNA analysis unavailable</div>;
    }

    const style = PATTERN_STYLES[data.pattern] || PATTERN_STYLES['Unknown'];

    return (
        <div className="space-y-4">
            {/* Pattern Banner */}
            <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${style.bg} border ${style.border} p-5 shadow-xl ${style.glow}`}>
                <div className="absolute top-0 right-0 w-40 h-40 blur-3xl bg-white/3 rounded-full -mr-10 -mt-10 pointer-events-none" />
                <div className="flex items-start justify-between relative z-10">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">{data.pattern_icon}</span>
                            <span className={`text-xs font-bold uppercase tracking-widest ${style.text}`}>SELL PATTERN DNA</span>
                        </div>
                        <h3 className={`text-3xl font-black tracking-tight ${style.text}`}>{data.pattern}</h3>
                        <p className="text-xs text-gray-400 mt-2 max-w-xs leading-relaxed">{data.description}</p>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500 mb-1">Model Accuracy</div>
                        <div className={`text-2xl font-mono font-bold ${style.text}`}>{data.model_accuracy_pct.toFixed(0)}%</div>
                        <div className="text-xs text-gray-500">{data.historical_events_count} events</div>
                    </div>
                </div>
            </div>

            {/* Metrics Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <MetricPill
                    label="48h Impact"
                    value={`${data.avg_48h_impact_pct.toFixed(1)}%`}
                    color={data.avg_48h_impact_pct < 0 ? 'text-rose-400' : 'text-emerald-400'}
                />
                <MetricPill
                    label="7d Impact"
                    value={`${data.avg_7d_impact_pct.toFixed(1)}%`}
                    color={data.avg_7d_impact_pct < 0 ? 'text-rose-400' : 'text-emerald-400'}
                />
                <MetricPill
                    label="Sell Prob."
                    value={`${data.sell_probability_pct.toFixed(0)}%`}
                    color={data.sell_probability_pct > 60 ? 'text-rose-400' : data.sell_probability_pct > 35 ? 'text-amber-400' : 'text-emerald-400'}
                />
                <MetricPill
                    label="Recovery"
                    value={`${data.avg_recovery_days}d`}
                    color="text-sky-400"
                />
            </div>

            {/* Worst Case + Hedge */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="bg-rose-900/20 border border-rose-500/20 rounded-xl p-4">
                    <div className="text-xs text-rose-400/70 uppercase tracking-wider font-semibold mb-1">Worst Case (95th Pctl)</div>
                    <div className="text-2xl font-mono font-bold text-rose-400">{data.worst_case_95th_pct.toFixed(1)}%</div>
                    <div className="text-xs text-gray-500 mt-1">Tail risk scenario</div>
                </div>
                <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-xl p-4">
                    <div className="text-xs text-indigo-400/70 uppercase tracking-wider font-semibold mb-1">Optimal Hedge</div>
                    <div className="text-sm font-semibold text-indigo-300">{data.optimal_hedge}</div>
                    <div className="text-xs text-gray-500 mt-1">Based on pattern classification</div>
                </div>
            </div>
        </div>
    );
};

export default DnaFingerprintWidget;
