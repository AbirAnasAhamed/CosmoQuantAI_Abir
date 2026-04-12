import React from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/client';

interface ArbData {
    strategy: string; is_opportunity: boolean; opportunity_grade: string;
    spot_price: number; perp_price: number; perp_premium_pct: number;
    funding_rate_8h: number; days_to_unlock: number;
    trade: { buy_spot_usd: number; sell_perp_usd: number; spot_quantity: number; perp_quantity: number; };
    expected_pnl: { funding_collected_usd: number; basis_gain_usd: number; total_pnl_usd: number; roi_pct: number; annualized_apr_pct: number; };
    risk: string;
}

const GRADE_CONFIG: Record<string, { color: string; bg: string }> = {
    'A+': { color: 'text-emerald-400', bg: 'bg-emerald-900/30 border-emerald-500/40' },
    'B':  { color: 'text-amber-400', bg: 'bg-amber-900/30 border-amber-500/40' },
    'C':  { color: 'text-gray-400', bg: 'bg-gray-900/30 border-gray-700/40' },
};

interface Props { eventId: string; }

const ArbitrageScreener: React.FC<Props> = ({ eventId }) => {
    const { data, isLoading } = useQuery<ArbData>({
        queryKey: ['unlock-arb', eventId],
        queryFn: async () => (await apiClient.get(`/token-unlocks/${eventId}/arbitrage`)).data,
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-64 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Arbitrage data unavailable</div>;

    const grade = GRADE_CONFIG[data.opportunity_grade] || GRADE_CONFIG['C'];

    return (
        <div className="space-y-4">
            {/* Strategy Header */}
            <div className={`rounded-2xl p-5 border ${grade.bg}`}>
                <div className="flex items-start justify-between">
                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">{data.strategy}</div>
                        <div className="flex items-center gap-2">
                            <span className={`text-4xl font-black ${grade.color}`}>{data.opportunity_grade}</span>
                            <div>
                                <div className={`text-sm font-bold ${grade.color}`}>
                                    {data.is_opportunity ? 'OPPORTUNITY DETECTED' : 'NO OPPORTUNITY'}
                                </div>
                                <div className="text-xs text-gray-500">{data.days_to_unlock}d to unlock</div>
                            </div>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500">Annualized APR</div>
                        <div className={`text-2xl font-mono font-bold ${grade.color}`}>{data.expected_pnl.annualized_apr_pct.toFixed(0)}%</div>
                    </div>
                </div>
            </div>

            {/* Pricing */}
            <div className="grid grid-cols-2 gap-3">
                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Spot Price</div>
                    <div className="text-xl font-mono font-bold text-white">${data.spot_price.toFixed(4)}</div>
                    <div className="text-xs text-gray-500 mt-1">BUY</div>
                </div>
                <div className="bg-black/20 border border-white/5 rounded-xl p-4">
                    <div className="text-xs text-gray-500 uppercase tracking-wider mb-1">Perp Price</div>
                    <div className="text-xl font-mono font-bold text-amber-400">${data.perp_price.toFixed(4)}</div>
                    <div className="text-xs text-amber-400 mt-1">+{data.perp_premium_pct.toFixed(2)}% premium → SELL</div>
                </div>
            </div>

            {/* P&L Breakdown */}
            <div className="bg-black/20 border border-white/5 rounded-xl p-4 space-y-3">
                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold">Expected P&L (per $10,000)</div>
                <div className="space-y-2">
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Basis Gain at Convergence</span>
                        <span className="text-sm font-mono font-bold text-emerald-400">+${data.expected_pnl.basis_gain_usd.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-400">Funding Collected</span>
                        <span className="text-sm font-mono font-bold text-emerald-400">+${data.expected_pnl.funding_collected_usd.toFixed(2)}</span>
                    </div>
                    <div className="border-t border-white/10 pt-2 flex justify-between items-center">
                        <span className="text-sm font-bold text-white">Net P&L</span>
                        <span className="text-lg font-mono font-bold text-emerald-400">+${data.expected_pnl.total_pnl_usd.toFixed(2)} ({data.expected_pnl.roi_pct.toFixed(2)}%)</span>
                    </div>
                </div>
            </div>

            <div className="text-xs text-amber-400/70 bg-amber-900/10 border border-amber-500/10 rounded-xl p-3">
                ⚠️ {data.risk}
            </div>
        </div>
    );
};

export default ArbitrageScreener;
