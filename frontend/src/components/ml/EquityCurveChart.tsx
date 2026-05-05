import React from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from 'recharts';
import { motion } from 'framer-motion';
import { TrendingUp } from 'lucide-react';

interface EquityPoint {
    step: number;
    equity: number;
}

interface EquityCurveChartProps {
    data: EquityPoint[];
}

const EquityCurveChart: React.FC<EquityCurveChartProps> = ({ data }) => {
    if (!data || data.length === 0) return null;

    const initialEquity = data[0].equity;
    const finalEquity = data[data.length - 1].equity;
    const profitPct = ((finalEquity - initialEquity) / initialEquity) * 100;
    const isProfit = profitPct >= 0;

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6 mb-6 p-5 bg-black/40 backdrop-blur-xl border border-white/10 rounded-3xl shadow-2xl overflow-hidden relative"
        >
            {/* Background Glow */}
            <div className={`absolute -top-24 -right-24 w-48 h-48 blur-[100px] rounded-full ${isProfit ? 'bg-emerald-500/20' : 'bg-red-500/20'}`}></div>

            <div className="flex items-center justify-between mb-6 relative z-10">
                <div>
                    <h4 className="text-white font-bold text-sm tracking-widest flex items-center gap-2">
                        <TrendingUp className={`w-4 h-4 ${isProfit ? 'text-emerald-400' : 'text-red-400'}`} />
                        AGENT EQUITY CURVE
                    </h4>
                    <p className="text-[10px] text-slate-500 uppercase mt-1">Real-time portfolio performance during training</p>
                </div>
                <div className="text-right">
                    <div className={`text-xl font-black ${isProfit ? 'text-emerald-400' : 'text-red-400'}`}>
                        {isProfit ? '+' : ''}{profitPct.toFixed(2)}%
                    </div>
                    <div className="text-[10px] text-slate-400 font-medium">${finalEquity.toLocaleString(undefined, {minimumFractionDigits: 2})}</div>
                </div>
            </div>

            <div className="h-[250px] w-full relative z-10">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={data}>
                        <defs>
                            <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor={isProfit ? "#10b981" : "#ef4444"} stopOpacity={0.3}/>
                                <stop offset="95%" stopColor={isProfit ? "#10b981" : "#ef4444"} stopOpacity={0}/>
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
                        <XAxis 
                            dataKey="step" 
                            hide 
                        />
                        <YAxis 
                            domain={['auto', 'auto']} 
                            orientation="right"
                            tick={{ fontSize: 10, fill: '#64748b' }}
                            axisLine={false}
                            tickLine={false}
                            tickFormatter={(val) => `$${(val / 1000).toFixed(1)}k`}
                        />
                        <Tooltip 
                            contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', fontSize: '12px' }}
                            itemStyle={{ color: '#fff' }}
                            formatter={(value: number) => [`$${value.toFixed(2)}`, 'Equity']}
                            labelFormatter={(label) => `Step: ${label}`}
                        />
                        <Area 
                            type="monotone" 
                            dataKey="equity" 
                            stroke={isProfit ? "#10b981" : "#ef4444"} 
                            strokeWidth={3}
                            fillOpacity={1} 
                            fill="url(#colorEquity)" 
                            animationDuration={2000}
                        />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </motion.div>
    );
};

export default EquityCurveChart;
