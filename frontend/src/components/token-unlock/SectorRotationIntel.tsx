import React from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/client';

interface RotationDest { asset: string; estimated_inflow_usd: number; direction: string; }
interface TradeStep { step: number; action: string; description: string; timing: string; }
interface RotationData {
    total_sector_unlock_usd: number; contagion_risk: string;
    rotation_signals: RotationDest[];
    rotation_trade: TradeStep[];
    backtested_stats: { rotation_strategy_return_pct: number; buy_and_hold_return_pct: number; alpha_generated_pct: number; win_rate_pct: number; sample_period: string; };
    sector_breakdown: { sector: string; total_usd: number; pct: number; }[];
    historical_sector_impact_pct: number;
}

const ACTION_COLORS: Record<string, string> = {
    EXIT: 'text-rose-400 bg-rose-900/30 border-rose-500/30',
    ROTATE: 'text-amber-400 bg-amber-900/30 border-amber-500/30',
    'RE-ENTRY': 'text-emerald-400 bg-emerald-900/30 border-emerald-500/30',
};

const SectorRotationIntel: React.FC = () => {
    const { data, isLoading } = useQuery<RotationData>({
        queryKey: ['unlock-sector-rotation'],
        queryFn: async () => (await apiClient.get('/token-unlocks/sector-rotation?days=30')).data,
        staleTime: 10 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-72 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Sector rotation data unavailable</div>;

    const stats = data.backtested_stats;

    return (
        <div className="space-y-4">
            {/* Backtested Alpha Banner */}
            <div className="rounded-2xl p-5 border bg-indigo-900/20 border-indigo-500/30">
                <div className="text-xs text-indigo-400 uppercase tracking-widest font-bold mb-3">📊 Rotation Strategy vs Buy & Hold</div>
                <div className="grid grid-cols-3 gap-4 text-center">
                    <div>
                        <div className="text-2xl font-mono font-bold text-emerald-400">+{stats.rotation_strategy_return_pct}%</div>
                        <div className="text-xs text-gray-500">Rotation Return</div>
                    </div>
                    <div>
                        <div className="text-2xl font-mono font-bold text-rose-400">{stats.buy_and_hold_return_pct}%</div>
                        <div className="text-xs text-gray-500">Buy & Hold</div>
                    </div>
                    <div>
                        <div className="text-2xl font-mono font-bold text-indigo-400">+{stats.alpha_generated_pct}%</div>
                        <div className="text-xs text-gray-500">Alpha Generated</div>
                    </div>
                </div>
                <div className="text-center text-xs text-gray-500 mt-2">
                    {stats.win_rate_pct}% win rate • {stats.sample_period}
                </div>
            </div>

            {/* Rotation Trade Steps */}
            <div className="space-y-2">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold px-1">3-Phase Rotation Playbook</div>
                {data.rotation_trade.map((step) => {
                    const colorClass = ACTION_COLORS[step.action] || 'text-gray-400 bg-gray-900/30 border-gray-700/30';
                    return (
                        <div key={step.step} className={`rounded-xl p-4 border flex items-start gap-4 ${colorClass}`}>
                            <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center font-black text-sm flex-shrink-0">
                                {step.step}
                            </div>
                            <div className="flex-1">
                                <div className="font-bold text-sm">{step.action}</div>
                                <div className="text-xs text-gray-400 mt-0.5">{step.description}</div>
                            </div>
                            <div className="text-xs text-gray-500 text-right flex-shrink-0">{step.timing}</div>
                        </div>
                    );
                })}
            </div>

            {/* Beneficiaries */}
            <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2 px-1">Capital Rotation Destinations</div>
                <div className="grid grid-cols-3 gap-2">
                    {data.rotation_signals.map((dest, i) => (
                        <div key={i} className="bg-emerald-900/10 border border-emerald-500/10 rounded-xl p-3 text-center">
                            <div className="font-bold text-xs text-white">{dest.asset.split(' ')[0]}</div>
                            <div className="text-xs font-mono text-emerald-400 mt-1">
                                +${(dest.estimated_inflow_usd / 1_000_000).toFixed(0)}M
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default SectorRotationIntel;
