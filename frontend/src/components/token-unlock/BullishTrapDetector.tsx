import React from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/client';

interface TrapData {
    social_sentiment_score: number; sentiment_label: string; price_action_7d_pct: number;
    exchange_deposit_trend_pct: number; days_to_unlock: number;
    is_diverging: boolean; is_bullish_trap: boolean; trap_confidence_pct: number;
    verdict: string; predicted_impact_range: string; recommended_action: string;
}

interface Props { eventId: string; }

const BullishTrapDetector: React.FC<Props> = ({ eventId }) => {
    const { data, isLoading } = useQuery<TrapData>({
        queryKey: ['unlock-trap', eventId],
        queryFn: async () => (await apiClient.get(`/token-unlocks/${eventId}/trap-signal`)).data,
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-64 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Signal data unavailable</div>;

    const isTrap = data.is_bullish_trap;
    const sentimentWidth = data.social_sentiment_score;
    const depositWidth = Math.min(data.exchange_deposit_trend_pct / 4, 100);

    return (
        <div className="space-y-4">
            {/* Trap Banner */}
            <div className={`rounded-2xl p-5 border ${isTrap ? 'bg-rose-900/30 border-rose-500/50' : 'bg-emerald-900/20 border-emerald-500/30'} relative overflow-hidden`}>
                {isTrap && <div className="absolute inset-0 bg-rose-500/5 animate-pulse pointer-events-none" />}
                <div className="relative z-10">
                    <div className={`text-xl font-black mb-1 ${isTrap ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {isTrap ? '⚠️ BULLISH TRAP DETECTED' : '✅ NO TRAP SIGNAL'}
                    </div>
                    {isTrap && (
                        <div className="text-xs text-rose-300/70">
                            Confidence: <span className="font-bold">{data.trap_confidence_pct}%</span> • {data.days_to_unlock}d to unlock
                        </div>
                    )}
                </div>
            </div>

            {/* Divergence Meters */}
            <div className="space-y-3">
                <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Social Sentiment</span>
                        <span className={data.sentiment_label === 'BULLISH' ? 'text-emerald-400' : 'text-gray-400'}>
                            {data.sentiment_label} ({data.social_sentiment_score.toFixed(0)}/100)
                        </span>
                    </div>
                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${sentimentWidth}%` }} />
                    </div>
                </div>

                <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Exchange Deposit Trend</span>
                        <span className={data.exchange_deposit_trend_pct > 150 ? 'text-rose-400 font-bold' : 'text-gray-400'}>
                            +{data.exchange_deposit_trend_pct.toFixed(0)}% vs baseline
                        </span>
                    </div>
                    <div className="h-2.5 bg-gray-800 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-1000" style={{
                            width: `${depositWidth}%`,
                            backgroundColor: data.exchange_deposit_trend_pct > 150 ? '#F43F5E' : '#F59E0B',
                        }} />
                    </div>
                </div>

                <div>
                    <div className="flex justify-between text-xs text-gray-500 mb-1">
                        <span>Price Action (7d)</span>
                        <span className={data.price_action_7d_pct > 5 ? 'text-emerald-400' : data.price_action_7d_pct < -5 ? 'text-rose-400' : 'text-gray-400'}>
                            {data.price_action_7d_pct > 0 ? '+' : ''}{data.price_action_7d_pct.toFixed(1)}%
                        </span>
                    </div>
                </div>
            </div>

            {/* Verdict + Action */}
            <div className={`rounded-xl p-4 border space-y-2 ${isTrap ? 'bg-rose-900/10 border-rose-500/20' : 'bg-emerald-900/10 border-emerald-500/20'}`}>
                <div className={`text-sm font-semibold ${isTrap ? 'text-rose-300' : 'text-emerald-300'}`}>{data.verdict}</div>
                {isTrap && (
                    <div className="text-xs text-gray-400">
                        Predicted Price Impact: <span className="text-rose-400 font-mono font-bold">{data.predicted_impact_range}</span>
                    </div>
                )}
                <div className="text-xs text-gray-400 border-t border-white/5 pt-2">
                    🎯 <span className="font-semibold">Action:</span> {data.recommended_action}
                </div>
            </div>
        </div>
    );
};

export default BullishTrapDetector;
