import React from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/client';

interface WalletMovement {
    address: string;
    exchange: string;
    amount_tokens: number;
    amount_usd: number;
    hours_ago: number;
    entity_label: string;
}

interface RadarData {
    signal_active: boolean;
    signal_level: 'INACTIVE' | 'MODERATE' | 'HIGH' | 'CRITICAL';
    risk_color: string;
    days_to_unlock: number;
    total_moved_usd: number;
    total_moved_pct_of_unlock: number;
    wallets: WalletMovement[];
    historical_accuracy_pct: number;
}

interface Props { eventId: string; }

const SIGNAL_CONFIG = {
    CRITICAL: { bg: 'bg-rose-900/30', border: 'border-rose-500/50', text: 'text-rose-400', dot: 'bg-rose-500', label: '🚨 CRITICAL SIGNAL' },
    HIGH:     { bg: 'bg-orange-900/30', border: 'border-orange-500/50', text: 'text-orange-400', dot: 'bg-orange-500', label: '⚠️ HIGH SIGNAL' },
    MODERATE: { bg: 'bg-amber-900/30', border: 'border-amber-500/50', text: 'text-amber-400', dot: 'bg-amber-500', label: '📡 MODERATE SIGNAL' },
    INACTIVE: { bg: 'bg-gray-900/30', border: 'border-gray-700/50', text: 'text-gray-400', dot: 'bg-gray-600', label: '🟢 INACTIVE' },
};

const ExchangeDepositRadar: React.FC<Props> = ({ eventId }) => {
    const { data, isLoading } = useQuery<RadarData>({
        queryKey: ['unlock-deposits', eventId],
        queryFn: async () => (await apiClient.get(`/token-unlocks/${eventId}/deposits`)).data,
        staleTime: 5 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-48 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Radar data unavailable</div>;

    const cfg = SIGNAL_CONFIG[data.signal_level];

    return (
        <div className="space-y-4">
            {/* Signal Header */}
            <div className={`rounded-2xl p-5 border ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                        <span className={`w-2.5 h-2.5 rounded-full ${cfg.dot} animate-pulse`} />
                        <span className={`text-sm font-bold ${cfg.text}`}>{cfg.label}</span>
                    </div>
                    <span className="text-xs text-gray-500 bg-black/20 px-2 py-1 rounded-lg">
                        {data.historical_accuracy_pct}% hist. accuracy
                    </span>
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider">Funds Moved to CEX</div>
                        <div className={`text-2xl font-mono font-bold ${data.signal_active ? 'text-rose-400' : 'text-gray-500'}`}>
                            ${data.total_moved_usd.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">{data.total_moved_pct_of_unlock.toFixed(1)}% of unlock</div>
                    </div>
                    <div>
                        <div className="text-xs text-gray-500 uppercase tracking-wider">Days to Unlock</div>
                        <div className="text-2xl font-mono font-bold text-white">{data.days_to_unlock}d</div>
                    </div>
                </div>
            </div>

            {/* Wallet Feed */}
            {data.wallets.length > 0 ? (
                <div className="space-y-2">
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold px-1">Live Wallet Feed</div>
                    {data.wallets.map((w, i) => (
                        <div key={i} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3 hover:border-rose-500/30 transition-colors">
                            <div className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg bg-rose-900/40 border border-rose-500/30 flex items-center justify-center text-xs font-bold text-rose-400">
                                    {w.exchange.charAt(0)}
                                </div>
                                <div>
                                    <div className="text-xs font-mono text-gray-300">{w.address}</div>
                                    <div className="text-[10px] text-gray-500">{w.entity_label} → {w.exchange}</div>
                                </div>
                            </div>
                            <div className="text-right">
                                <div className="text-sm font-mono font-bold text-rose-400">${w.amount_usd.toLocaleString()}</div>
                                <div className="text-[10px] text-gray-500">{w.hours_ago}h ago</div>
                            </div>
                        </div>
                    ))}
                </div>
            ) : (
                <div className="text-center py-6 text-gray-500 text-sm border border-gray-800 rounded-xl">
                    <div className="text-2xl mb-2">🔍</div>
                    No suspicious wallet movements detected yet.
                    <div className="text-xs mt-1">Monitoring {data.days_to_unlock > 14 ? 'starts 14 days before unlock' : 'active'}</div>
                </div>
            )}
        </div>
    );
};

export default ExchangeDepositRadar;
