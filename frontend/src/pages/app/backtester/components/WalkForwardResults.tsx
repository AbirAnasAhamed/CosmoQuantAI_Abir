import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Activity, DollarSign } from 'lucide-react';

interface WFAStep {
    step: number;
    train_period: string;
    test_period: string;
    start_equity: number;
    end_equity: number;
    profit: number;
    profit_percent: number;
    drawdown: number;
    best_params: any;
}

interface WFAResult {
    strategy: string;
    total_steps: number;
    initial_cash: number;
    final_equity: number;
    total_profit: number;
    total_profit_percent: number;
    average_drawdown: number;
    steps_detail: WFAStep[];
}

const MetricCard = ({ label, value, icon: Icon, color }: any) => (
    <div className="bg-[#1e222d] p-4 rounded-lg border border-[#2A2E39]">
        <div className="flex justify-between items-start mb-2">
            <span className="text-gray-400 text-xs uppercase font-semibold">{label}</span>
            <Icon size={16} className={color} />
        </div>
        <div className={`text-xl font-bold ${color}`}>{value}</div>
    </div>
);

export const WalkForwardResults: React.FC<{ results: WFAResult }> = ({ results }) => {
    if (!results || !results.steps_detail) return <div className="text-white">No WFA Data</div>;

    // Chart Data Preparation
    const equityData = results.steps_detail.map(step => ({
        step: `Step ${step.step}`,
        equity: step.end_equity,
        profit: step.profit,
        drawdown: step.drawdown
    }));

    return (
        <div className="space-y-6 animate-fade-in mt-6">
            <h2 className="text-xl font-bold text-white flex items-center gap-2">
                <Activity className="text-blue-500" /> Walk-Forward Analysis Report
            </h2>

            {/* Metrics Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <MetricCard
                    label="Final Equity"
                    value={`$${results.final_equity.toLocaleString()}`}
                    icon={DollarSign}
                    color="text-green-400"
                />
                <MetricCard
                    label="Total Profit"
                    value={`${results.total_profit_percent}%`}
                    icon={TrendingUp}
                    color={results.total_profit >= 0 ? "text-green-400" : "text-red-400"}
                />
                <MetricCard
                    label="Total Steps"
                    value={results.total_steps}
                    icon={Activity}
                    color="text-blue-400"
                />
                <MetricCard
                    label="Avg Drawdown"
                    value={`${results.average_drawdown}%`}
                    icon={TrendingDown}
                    color="text-red-400"
                />
            </div>

            {/* Equity Curve Chart */}
            <div className="bg-[#131722] p-4 rounded-lg border border-[#2A2E39] h-[350px]">
                <h3 className="text-gray-400 text-sm mb-4">Cumulative Equity Curve</h3>
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={equityData}>
                        <defs>
                            <linearGradient id="colorEquity" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="5%" stopColor="#2962FF" stopOpacity={0.3} />
                                <stop offset="95%" stopColor="#2962FF" stopOpacity={0} />
                            </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="#2A2E39" />
                        <XAxis dataKey="step" stroke="#64748b" fontSize={12} />
                        <YAxis stroke="#64748b" fontSize={12} />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1e222d', borderColor: '#2A2E39', color: '#fff' }}
                            itemStyle={{ color: '#fff' }}
                        />
                        <Area type="monotone" dataKey="equity" stroke="#2962FF" fillOpacity={1} fill="url(#colorEquity)" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>

            {/* Step-by-Step Table */}
            <div className="bg-[#131722] rounded-lg border border-[#2A2E39] overflow-hidden">
                <div className="p-4 border-b border-[#2A2E39]">
                    <h3 className="text-white font-semibold">Step-by-Step Breakdown</h3>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-gray-400">
                        <thead className="bg-[#1e222d] text-gray-300">
                            <tr>
                                <th className="px-4 py-3">Step</th>
                                <th className="px-4 py-3">Test Period</th>
                                <th className="px-4 py-3 text-right">Start Equity</th>
                                <th className="px-4 py-3 text-right">End Equity</th>
                                <th className="px-4 py-3 text-right">Profit %</th>
                                <th className="px-4 py-3 text-right">Drawdown %</th>
                            </tr>
                        </thead>
                        <tbody>
                            {results.steps_detail.map((row, idx) => (
                                <tr key={idx} className="border-b border-[#2A2E39] hover:bg-[#1e222d]">
                                    <td className="px-4 py-3 font-medium">#{row.step}</td>
                                    <td className="px-4 py-3">{row.test_period}</td>
                                    <td className="px-4 py-3 text-right">${row.start_equity.toLocaleString()}</td>
                                    <td className="px-4 py-3 text-right">${row.end_equity.toLocaleString()}</td>
                                    <td className={`px-4 py-3 text-right ${row.profit >= 0 ? 'text-green-500' : 'text-red-500'}`}>
                                        {row.profit_percent}%
                                    </td>
                                    <td className="px-4 py-3 text-right text-red-400">{row.drawdown}%</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
