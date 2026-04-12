import React, { useState, useEffect } from 'react';
import Card from "@/components/common/Card";
import { Shield, TrendingUp, TrendingDown, Activity, Zap, Layers } from 'lucide-react';
import axios from 'axios';
import { ResponsiveContainer, BarChart, Bar, Cell, Tooltip } from 'recharts';

interface BlockTrade {
    timestamp: string;
    volume: number;
    price: number;
    side: 'BUY' | 'SELL';
    source: string;
    value_usd: number;
}

interface InstitutionalData {
    sentiment_score: number;
    net_flow: number;
    large_buy_volume: number;
    large_sell_volume: number;
    block_trades: BlockTrade[];
}

interface DarkPoolWidgetProps {
    symbol?: string;
}

export const DarkPoolWidget: React.FC<DarkPoolWidgetProps> = ({ symbol = 'BTC' }) => {
    const [data, setData] = useState<InstitutionalData | null>(null);
    const [loading, setLoading] = useState(true);
    const API_URL = import.meta.env.VITE_API_URL || '/api/v1';

    // Mock data for chart
    const mockChartData = [
        { name: '10:00', flow: 2.5 },
        { name: '10:15', flow: -1.2 },
        { name: '10:30', flow: 4.0 },
        { name: '10:45', flow: -0.5 },
        { name: '11:00', flow: 1.8 },
        { name: '11:15', flow: 3.2 },
        { name: '11:30', flow: -2.1 },
    ];

    useEffect(() => {
        const fetchData = async () => {
            try {
                const res = await axios.get(`${API_URL}/sentiment/dark-pool/${symbol}`);
                setData(res.data);
            } catch (error) {
                console.error("Failed to fetch dark pool data", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 15000);
        return () => clearInterval(interval);
    }, [symbol]);

    const getSentimentColor = (score: number) => {
        if (score > 0.2) return 'text-emerald-400 drop-shadow-[0_0_8px_rgba(52,211,153,0.5)]';
        if (score < -0.2) return 'text-rose-500 drop-shadow-[0_0_8px_rgba(244,63,94,0.5)]';
        return 'text-slate-400';
    };

    const getSentimentGradient = (score: number | undefined) => {
        if (!score) return 'from-slate-800 to-slate-900';
        if (score > 0.2) return 'from-emerald-950/40 to-slate-900 border-emerald-500/20';
        if (score < -0.2) return 'from-rose-950/40 to-slate-900 border-rose-500/20';
        return 'from-slate-800 to-slate-900 border-slate-700/30';
    };

    return (
        <Card className="w-full h-[380px] p-0 border border-slate-700/50 bg-[#0B0F19] shadow-2xl overflow-hidden relative group">
            {/* Dynamic Background Mesh */}
            <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-5 mix-blend-overlay pointer-events-none"></div>
            <div className={`absolute -top-20 -right-20 w-64 h-64 rounded-full blur-[100px] opacity-20 transition-colors duration-1000 ${data?.sentiment_score && data.sentiment_score > 0 ? 'bg-emerald-500' : 'bg-rose-500'}`} />

            {/* Header with Neon Border */}
            <div className="relative px-5 py-4 border-b border-white/5 flex justify-between items-center bg-white/5 backdrop-blur-sm">
                <div className="flex items-center gap-3">
                    <div className="p-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 shadow-[0_0_15px_rgba(99,102,241,0.15)]">
                        <Shield className="h-4 w-4 text-indigo-400" />
                    </div>
                    <div>
                        <h3 className="text-sm font-bold text-slate-100 tracking-wide uppercase">Dark Pool Intel</h3>
                        <div className="flex items-center gap-1.5 text-[10px] text-indigo-300 font-mono">
                            <Zap className="h-3 w-3" /> INSTITUTIONAL FLOW
                        </div>
                    </div>
                </div>
                <div className="flex flex-col items-end">
                    <span className="flex items-center gap-1.5">
                        <span className="relative flex h-2 w-2">
                            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                        </span>
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider">LIVE</span>
                    </span>
                    <span className="text-[9px] text-slate-600 mt-0.5">{symbol}/USD (OTC)</span>
                </div>
            </div>

            <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 h-[calc(100%-65px)]">

                {/* Visual Sentiment Column */}
                <div className="flex flex-col justify-between h-full space-y-2">
                    {/* Big Score Card */}
                    <div className={`flex-1 relative rounded-2xl border p-4 flex flex-col items-center justify-center bg-gradient-to-br transition-all duration-500 ${getSentimentGradient(data?.sentiment_score)}`}>
                        <div className="absolute inset-0 bg-[linear-gradient(45deg,transparent_25%,rgba(255,255,255,0.03)_50%,transparent_75%)] bg-[length:250%_250%] animate-shine pointer-events-none" />

                        <div className="text-[10px] uppercase tracking-[0.2em] text-slate-500 mb-2 font-semibold">Net Bias</div>

                        {loading ? (
                            <div className="h-10 w-20 bg-slate-800 animate-pulse rounded" />
                        ) : (
                            <div className="text-center">
                                <div className={`text-4xl font-black font-mono tracking-tighter ${getSentimentColor(data?.sentiment_score || 0)}`}>
                                    {data?.sentiment_score && data.sentiment_score > 0 ? '+' : ''}{data?.sentiment_score.toFixed(2)}
                                </div>
                                <div className="text-xs text-slate-400 font-medium mt-1 tracking-wide">
                                    {data?.sentiment_score && data.sentiment_score > 0.1 ? 'ACCUMULATION' : data?.sentiment_score && data.sentiment_score < -0.1 ? 'DISTRIBUTION' : 'NEUTRAL'}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Mini Chart */}
                    <div className="h-20 w-full rounded-xl border border-slate-800/60 bg-slate-950/50 p-3 relative overflow-hidden">
                        <div className="flex items-center justify-between text-[9px] text-slate-500 uppercase font-semibold mb-1">
                            <span>Flow Delta</span>
                            <Activity className="h-3 w-3 opacity-50" />
                        </div>
                        <ResponsiveContainer width="100%" height="80%">
                            <BarChart data={mockChartData}>
                                <Tooltip
                                    cursor={{ fill: 'rgba(255,255,255,0.05)' }}
                                    contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', fontSize: '12px' }}
                                />
                                <Bar dataKey="flow" radius={[2, 2, 0, 0]}>
                                    {mockChartData.map((entry, index) => (
                                        <Cell
                                            key={`cell-${index}`}
                                            fill={entry.flow > 0 ? '#10b981' : '#f43f5e'}
                                            fillOpacity={0.8}
                                        />
                                    ))}
                                </Bar>
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                </div>

                {/* Trade Feed Column */}
                <div className="flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-3 border-b border-dashed border-slate-800 pb-2">
                        <h4 className="text-xs font-bold text-slate-400 uppercase flex items-center gap-2">
                            <Layers className="h-3 w-3" /> Recent Blocks
                        </h4>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-400 border border-slate-700">
                            &gt; $100k
                        </span>
                    </div>

                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 scrollbar-thin scrollbar-thumb-slate-700 scrollbar-track-transparent">
                        {loading ? (
                            [1, 2, 3, 4].map(i => <div key={i} className="h-12 bg-slate-800/30 rounded animate-pulse" />)
                        ) : (
                            data?.block_trades.map((trade, idx) => (
                                <div key={idx} className="group/item relative flex items-center justify-between p-2.5 rounded-lg border border-slate-800/60 bg-slate-900/40 hover:bg-slate-800 hover:border-slate-700 hover:shadow-lg hover:shadow-black/20 transition-all duration-200">
                                    <div className="flex items-center gap-3">
                                        <div className={`p-1.5 rounded bg-opacity-10 ${trade.side === 'BUY' ? 'bg-emerald-500' : 'bg-rose-500'}`}>
                                            {trade.side === 'BUY' ? (
                                                <TrendingUp className="h-3.5 w-3.5 text-emerald-400" />
                                            ) : (
                                                <TrendingDown className="h-3.5 w-3.5 text-rose-400" />
                                            )}
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-slate-200 flex items-center gap-2">
                                                {trade.volume.toFixed(2)} <span className="text-slate-500 text-[10px] font-normal">{symbol}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-500 uppercase tracking-wide">
                                                {trade.source}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right">
                                        <div className={`text-xs font-mono font-medium ${trade.side === 'BUY' ? 'text-emerald-400' : 'text-rose-400'}`}>
                                            ${(trade.value_usd / 1000).toFixed(0)}k
                                        </div>
                                        <div className="text-[9px] text-slate-600">
                                            {new Date(trade.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                        {data?.block_trades.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-slate-600 text-xs gap-2 opacity-60">
                                <Activity className="h-8 w-8 text-slate-800" />
                                No large blocks detected
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </Card>
    );
};
