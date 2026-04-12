import React, { useEffect, useState } from 'react';
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Maximize2 } from 'lucide-react';

interface EquityDataPoint {
    time: string; // ISO String or similar
    value: number;
    timestamp: number; // For sorting/logic
}

interface EquityCurveProps {
    data: EquityDataPoint[];
    initialEquity?: number;
}

const EquityCurve: React.FC<EquityCurveProps> = ({ data, initialEquity = 10000 }) => {
    const [maxDrawdown, setMaxDrawdown] = useState<number>(0);
    const [currentEquity, setCurrentEquity] = useState<number>(initialEquity);
    const [pnlPercent, setPnlPercent] = useState<number>(0);

    useEffect(() => {
        if (data.length > 0) {
            const latest = data[data.length - 1];
            setCurrentEquity(latest.value);

            // Calculate Max Drawdown
            let peak = -Infinity;
            let maxDD = 0;

            for (const point of data) {
                if (point.value > peak) {
                    peak = point.value;
                }
                const dd = (peak - point.value) / peak;
                if (dd > maxDD) {
                    maxDD = dd;
                }
            }
            setMaxDrawdown(maxDD * 100);

            // Calculate PnL %
            const pnl = (latest.value - initialEquity) / initialEquity * 100;
            setPnlPercent(pnl);
        } else {
            setCurrentEquity(initialEquity);
            setMaxDrawdown(0);
            setPnlPercent(0);
        }
    }, [data, initialEquity]);

    return (
        <div className="flex flex-col h-full w-full">
            <div className="flex justify-between items-end mb-4 px-2">
                <div>
                    <h3 className="text-sm font-medium text-slate-500 dark:text-slate-400">Total Equity</h3>
                    <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-bold text-slate-900 dark:text-white">
                            ${currentEquity.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </span>
                        <span className={`text-xs font-bold px-1.5 py-0.5 rounded ${pnlPercent >= 0 ? 'bg-emerald-500/10 text-emerald-500' : 'bg-red-500/10 text-red-500'}`}>
                            {pnlPercent >= 0 ? '+' : ''}{pnlPercent.toFixed(2)}%
                        </span>
                    </div>
                </div>
                <div className="text-right">
                    <h3 className="text-xs font-medium text-slate-500 dark:text-slate-400">Max Drawdown</h3>
                    <span className="text-sm font-bold text-red-500">
                        {maxDrawdown.toFixed(2)}%
                    </span>
                </div>
            </div>

            <div className="flex-1 w-full min-h-[0px] h-[200px]">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <XAxis
                            dataKey="time"
                            hide={true}
                        />
                        <YAxis
                            domain={['auto', 'auto']}
                            hide={true}
                        />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e293b', borderColor: '#334155', color: '#f8fafc' }}
                            itemStyle={{ color: '#818cf8' }}
                            labelStyle={{ color: '#94a3b8' }}
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Equity']}
                            labelFormatter={(label) => new Date(label).toLocaleTimeString()}
                        />
                        <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#6366f1"
                            strokeWidth={2}
                            fillOpacity={1}
                            fill="url(#colorEquity)"
                            isAnimationActive={false}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default EquityCurve;
