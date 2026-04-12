import React from 'react';
import {
    ResponsiveContainer, ComposedChart, Line, Area,
    XAxis, YAxis, CartesianGrid, Tooltip, Bar, Legend, Brush
} from 'recharts';
import ChartTooltip from './components/ChartTooltip';
import { formatToLocalTime } from '@/utils/dateUtils';
import { useTheme } from '@/context/ThemeContext';
import Card from '@/components/common/Card';

interface SentimentChartsProps {
    historyData: any[];
    timeframe: string;
    setTimeframe: (tf: string) => void;
    activePair?: string;
    correlation?: number;
}

const timeframes = [
    { label: '1H', value: '1h' },
    { label: '24H', value: '24h' },
    { label: '7D', value: '7d' },
    { label: '30D', value: '30d' }
];

export const SentimentPriceChart: React.FC<SentimentChartsProps> = ({
    historyData,
    timeframe,
    setTimeframe,
}) => {
    const { theme } = useTheme();

    return (
        <Card className="flex flex-col h-[500px]">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Sentiment vs Price Correlation</h3>
                    <p className="text-xs text-gray-500">Dual-axis analysis of market sentiment and price action.</p>
                </div>
                <div className="flex gap-4 text-xs font-mono">
                    <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mr-4">
                        {timeframes.map((tf) => (
                            <button
                                key={tf.value}
                                onClick={() => setTimeframe(tf.value)}
                                className={`px-3 py-1 rounded-md transition-all ${timeframe === tf.value
                                    ? 'bg-white dark:bg-slate-700 text-brand-primary shadow-sm font-bold'
                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                {tf.label}
                            </button>
                        ))}
                    </div>
                </div>
            </div>
            <div className="flex-grow w-full h-full min-h-[300px] flex items-center justify-center relative">
                {historyData && historyData.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={historyData} margin={{ top: 10, right: 0, left: 0, bottom: 30 }} syncId="sentiment-sync">
                            <defs>
                                <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#818cf8" stopOpacity={0.4} />
                                    <stop offset="50%" stopColor="#818cf8" stopOpacity={0.1} />
                                    <stop offset="95%" stopColor="#818cf8" stopOpacity={0} />
                                </linearGradient>
                                <linearGradient id="volumeGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor="#3b82f6" stopOpacity={0.3} />
                                    <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
                                </linearGradient>
                                <filter id="neonGlow" height="300%" width="300%" x="-75%" y="-75%">
                                    <feGaussianBlur stdDeviation="3" result="coloredBlur" />
                                    <feMerge>
                                        <feMergeNode in="coloredBlur" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>

                            <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#1e293b' : '#e2e8f0'} vertical={false} opacity={0.5} />
                            <XAxis
                                dataKey="time"
                                stroke={theme === 'dark' ? '#475569' : '#94a3b8'}
                                tickFormatter={time => formatToLocalTime(time)}
                                tick={{ fontSize: 10, fill: theme === 'dark' ? '#94a3b8' : '#64748b' }}
                                minTickGap={60}
                                axisLine={false}
                                tickLine={false}
                                dy={10}
                            />
                            <YAxis yAxisId="left" orientation="left" domain={[-1.5, 1.5]} hide />
                            <YAxis yAxisId="right" orientation="right" domain={['auto', 'auto']} tickFormatter={val => `$${val.toLocaleString()}`} tick={{ fontSize: 11, fontWeight: 600, fill: '#10b981' }} axisLine={false} tickLine={false} width={60} />
                            <YAxis yAxisId="vol" orientation="right" domain={[0, 'dataMax * 4']} hide />

                            <Tooltip
                                content={<ChartTooltip />}
                                cursor={{ stroke: theme === 'dark' ? '#ffffff' : '#000000', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.3 }}
                            />
                            <Brush dataKey="time" height={30} stroke="#6366f1" tickFormatter={() => ''} />

                            <Bar yAxisId="vol" dataKey="social_volume" fill="url(#volumeGradient)" barSize={6} radius={[2, 2, 0, 0]} />
                            <Area yAxisId="left" type="monotone" dataKey="score" stroke="#818cf8" strokeWidth={3} fill="url(#sentimentGradient)" filter="url(#neonGlow)" activeDot={{ r: 6, strokeWidth: 0, fill: '#818cf8' }} />
                            <Line yAxisId="right" type="monotone" dataKey="price" stroke="#10b981" strokeWidth={2} dot={false} activeDot={{ r: 4, fill: '#fff', stroke: '#10b981' }} />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-3 text-slate-500 opacity-50">
                        <div className="w-16 h-16 rounded-full border-2 border-dashed border-slate-700 flex items-center justify-center animate-pulse">
                            <span className="text-2xl">📊</span>
                        </div>
                        <p className="text-sm font-mono">NO HISTORICAL DATA DETECTED</p>
                    </div>
                )}
            </div>
        </Card>
    );
};

export const SentimentDivergenceChart: React.FC<{ data: any[], correlation: number }> = ({ data, correlation }) => {
    const { theme } = useTheme();
    const gridColor = theme === 'dark' ? '#334155' : '#E2E8F0';

    return (
        <Card className="flex flex-col h-[350px]">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white">Smart Money vs Retail Divergence</h3>
                    <p className="text-xs text-gray-500">Deep Dive Analytics</p>
                </div>

                <div className={`px-3 py-1 rounded-lg border flex items-center gap-2 ${correlation > 0.5 ? 'bg-green-500/10 border-green-500/20 text-green-500' : 'bg-yellow-500/10 border-yellow-500/20 text-yellow-500'}`}>
                    <span className="text-xs font-bold uppercase">Price-Sentiment Correlation:</span>
                    <span className="text-lg font-mono font-bold">{correlation.toFixed(2)}</span>
                </div>
            </div>

            <div className="h-full w-full flex items-center justify-center relative">
                {data && data.length > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={data} syncId="sentiment-sync">
                            <defs>
                                <linearGradient id="retailGradient" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#F43F5E" stopOpacity={0.3} />
                                    <stop offset="95%" stopColor="#F43F5E" stopOpacity={0} />
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" opacity={0.1} stroke={gridColor} />
                            <XAxis dataKey="time" hide />
                            <Tooltip
                                content={<ChartTooltip />}
                                cursor={{ stroke: theme === 'dark' ? '#ffffff' : '#000000', strokeWidth: 1, strokeDasharray: '4 4', opacity: 0.3 }}
                            />
                            <Legend />
                            <Area type="monotone" dataKey="retail_score" name="Retail (Twitter/Reddit)" stroke="#F43F5E" fill="url(#retailGradient)" fillOpacity={0.3} />
                            <Line type="monotone" dataKey="smart_money_score" name="Smart Money (Whales/News)" stroke="#10B981" strokeWidth={3} dot={false} />
                        </ComposedChart>
                    </ResponsiveContainer>
                ) : (
                    <div className="flex flex-col items-center justify-center gap-2 text-slate-500 opacity-40">
                         <span className="text-xs font-mono">ANALYSIS PENDING</span>
                    </div>
                )}
            </div>
        </Card>
    );
};
