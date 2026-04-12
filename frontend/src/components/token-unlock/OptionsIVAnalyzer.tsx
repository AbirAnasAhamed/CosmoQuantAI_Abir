import React from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/client';

interface IVRow { tenor: string; current_iv: number; norm_iv: number; elevation: number; }
interface IVData {
    current_iv_7d_pct: number; pre_unlock_norm_iv_pct: number; iv_elevation_pp: number;
    iv_surface: IVRow[]; days_to_unlock: number; is_premium_opportunity: boolean;
    opportunity_grade: string;
    straddle_trade: { strategy: string; current_premium_usd: number; fair_value_usd: number; edge_collected_usd: number; breakeven_move_pct: number; max_profit_usd: number; };
    risk_note: string; recommendation: string;
}

interface Props { eventId: string; }

const OptionsIVAnalyzer: React.FC<Props> = ({ eventId }) => {
    const { data, isLoading } = useQuery<IVData>({
        queryKey: ['unlock-iv', eventId],
        queryFn: async () => (await apiClient.get(`/token-unlocks/${eventId}/options-iv`)).data,
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-64 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Options IV data unavailable</div>;

    const isOpportunity = data.is_premium_opportunity;

    return (
        <div className="space-y-4">
            {/* IV Header */}
            <div className={`rounded-2xl p-5 border ${isOpportunity ? 'bg-purple-900/20 border-purple-500/30' : 'bg-gray-900/30 border-gray-700/30'}`}>
                <div className="flex items-start justify-between">
                    <div>
                        <div className={`text-xs font-bold uppercase tracking-widest mb-1 ${isOpportunity ? 'text-purple-400' : 'text-gray-500'}`}>
                            {isOpportunity ? `🎯 IV PREMIUM EXTRACTION — ${data.opportunity_grade}` : '📊 IV SURFACE ANALYSIS'}
                        </div>
                        <div className="text-3xl font-mono font-bold text-white">{data.current_iv_7d_pct.toFixed(1)}%</div>
                        <div className="text-xs text-gray-400 mt-1">7d ATM Implied Volatility</div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500">vs Normal</div>
                        <div className={`text-2xl font-mono font-bold ${isOpportunity ? 'text-purple-400' : 'text-gray-500'}`}>
                            +{data.iv_elevation_pp.toFixed(0)}pp
                        </div>
                        <div className="text-xs text-gray-500">elevation</div>
                    </div>
                </div>
            </div>

            {/* IV Surface Table */}
            <div className="bg-black/20 border border-white/5 rounded-xl overflow-hidden">
                <div className="grid grid-cols-4 gap-0 text-[10px] text-gray-500 uppercase tracking-wider px-4 py-2 border-b border-white/5">
                    <span>Tenor</span><span>Current IV</span><span>Normal IV</span><span>Elevation</span>
                </div>
                {data.iv_surface.map((row, i) => (
                    <div key={i} className="grid grid-cols-4 gap-0 px-4 py-3 border-b border-white/5 last:border-0 hover:bg-white/5 transition-colors">
                        <span className="font-mono text-sm text-white font-bold">{row.tenor}</span>
                        <span className="font-mono text-sm text-purple-400">{row.current_iv.toFixed(1)}%</span>
                        <span className="font-mono text-sm text-gray-500">{row.norm_iv.toFixed(1)}%</span>
                        <span className={`font-mono text-sm font-bold ${row.elevation > 10 ? 'text-purple-400' : 'text-gray-500'}`}>
                            +{row.elevation.toFixed(1)}pp {row.elevation > 10 ? '✅' : ''}
                        </span>
                    </div>
                ))}
            </div>

            {/* Straddle Trade */}
            {isOpportunity && (
                <div className="bg-purple-900/20 border border-purple-500/20 rounded-xl p-4 space-y-3">
                    <div className="text-xs text-purple-400 uppercase tracking-wider font-bold">💰 Premium Extraction Trade</div>
                    <div className="font-semibold text-white text-sm">{data.straddle_trade.strategy}</div>
                    <div className="grid grid-cols-3 gap-3 text-center">
                        <div>
                            <div className="text-xs text-gray-500">Collect</div>
                            <div className="text-base font-mono font-bold text-white">${data.straddle_trade.current_premium_usd}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Edge</div>
                            <div className="text-base font-mono font-bold text-emerald-400">+${data.straddle_trade.edge_collected_usd}</div>
                        </div>
                        <div>
                            <div className="text-xs text-gray-500">Breakeven</div>
                            <div className="text-base font-mono font-bold text-amber-400">±{data.straddle_trade.breakeven_move_pct.toFixed(1)}%</div>
                        </div>
                    </div>
                </div>
            )}

            <div className="text-xs text-amber-400/70 bg-amber-900/10 border border-amber-500/10 rounded-xl p-3">
                ⚠️ {data.risk_note}
            </div>
        </div>
    );
};

export default OptionsIVAnalyzer;
