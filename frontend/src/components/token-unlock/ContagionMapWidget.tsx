import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Cell } from 'recharts';
import apiClient from '@/services/client';

interface SectorData { sector: string; total_usd: number; pct: number; }
interface RotationDest { asset: string; estimated_inflow_usd: number; direction: string; }
interface ContagionData {
    days_window: number;
    total_unlock_usd: number;
    total_events: number;
    contagion_risk: 'EXTREME' | 'HIGH' | 'MODERATE' | 'LOW';
    sector_breakdown: SectorData[];
    rotation_destinations: RotationDest[];
    historical_sector_impact_pct: number;
}

const RISK_CONFIG = {
    EXTREME: { color: 'text-rose-400', bg: 'bg-rose-900/30', border: 'border-rose-500/40', label: '🔥 EXTREME CONTAGION RISK' },
    HIGH:    { color: 'text-orange-400', bg: 'bg-orange-900/30', border: 'border-orange-500/40', label: '⚠️ HIGH CONTAGION RISK' },
    MODERATE:{ color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-500/40', label: '📊 MODERATE RISK' },
    LOW:     { color: 'text-emerald-400', bg: 'bg-emerald-900/30', border: 'border-emerald-500/40', label: '✅ LOW RISK' },
};

const SECTOR_COLORS = ['#6366F1', '#F43F5E', '#F59E0B', '#10B981', '#8B5CF6'];

const ContagionMapWidget: React.FC = () => {
    const { data, isLoading } = useQuery<ContagionData>({
        queryKey: ['unlock-contagion'],
        queryFn: async () => (await apiClient.get('/token-unlocks/contagion?days=30')).data,
        staleTime: 10 * 60 * 1000,
    });

    if (isLoading) return <div className="animate-pulse h-72 bg-gray-700/50 rounded-xl" />;
    if (!data) return <div className="text-center text-gray-500 py-8 text-sm">Contagion data unavailable</div>;

    const cfg = RISK_CONFIG[data.contagion_risk];

    const barData = data.sector_breakdown.map((s, i) => ({
        name: s.sector.replace('Layer-1', 'L1').replace('Protocols', 'Proto').replace('Blockchains', ''),
        value: s.total_usd / 1_000_000,
        color: SECTOR_COLORS[i % SECTOR_COLORS.length],
    }));

    return (
        <div className="space-y-4">
            {/* Header */}
            <div className={`rounded-2xl p-5 border ${cfg.bg} ${cfg.border}`}>
                <div className="flex items-start justify-between">
                    <div>
                        <div className={`text-xs font-bold uppercase tracking-widest ${cfg.color} mb-1`}>{cfg.label}</div>
                        <div className="text-3xl font-mono font-bold text-white">
                            ${(data.total_unlock_usd / 1_000_000).toFixed(0)}M
                        </div>
                        <div className="text-xs text-gray-400 mt-1">unlocking in next {data.days_window} days ({data.total_events} events)</div>
                    </div>
                    <div className="text-right">
                        <div className="text-xs text-gray-500">Historical Sector Impact</div>
                        <div className="text-2xl font-mono font-bold text-rose-400">{data.historical_sector_impact_pct.toFixed(1)}%</div>
                        <div className="text-xs text-gray-500">avg price drop</div>
                    </div>
                </div>
            </div>

            {/* Sector Bar Chart */}
            {barData.length > 0 && (
                <div>
                    <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2 px-1">Sector Pressure</div>
                    <div className="h-36">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={barData} barSize={28}>
                                <XAxis dataKey="name" stroke="#6B7280" fontSize={9} tickLine={false} axisLine={false} />
                                <YAxis stroke="#6B7280" fontSize={9} tickFormatter={v => `$${v}M`} tickLine={false} axisLine={false} />
                                <Tooltip
                                    contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px', fontSize: '11px' }}
                                    formatter={(v: number) => [`$${v.toFixed(0)}M`, 'Unlock']}
                                />
                                <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                                    {barData.map((entry, index) => <Cell key={index} fill={entry.color} />)}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Rotation Destinations */}
            <div>
                <div className="text-xs text-gray-500 uppercase tracking-wider font-semibold mb-2 px-1">💰 Capital Rotation Destinations</div>
                <div className="space-y-2">
                    {data.rotation_destinations.map((dest, i) => (
                        <div key={i} className="flex items-center justify-between bg-black/20 border border-white/5 rounded-xl p-3">
                            <div className="flex items-center gap-2">
                                <span className={`text-lg ${dest.direction === 'UP' ? '📈' : '🔒'}`} />
                                <span className="text-sm font-semibold text-white">{dest.asset}</span>
                            </div>
                            <span className="text-sm font-mono font-bold text-emerald-400">
                                +${(dest.estimated_inflow_usd / 1_000_000).toFixed(0)}M est.
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default ContagionMapWidget;
