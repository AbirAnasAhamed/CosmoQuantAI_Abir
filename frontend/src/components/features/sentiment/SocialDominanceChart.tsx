import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface SocialDominanceData {
    timestamp: string;
    BTC: number;
    ETH: number;
    SOL: number;
    Others: number;
}

interface SocialDominanceChartProps {
    data: SocialDominanceData[];
}

const SocialDominanceChart: React.FC<SocialDominanceChartProps> = ({ data }) => {
    if (!data || data.length === 0) {
        return <div className="text-gray-400 text-center py-10">No Social Dominance Data Available</div>;
    }

    return (
        <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700">
            <h3 className="text-xl font-bold text-white mb-4">Social Volume Dominance</h3>
            <div className="h-72 w-full">
                <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                        data={data}
                        margin={{
                            top: 10,
                            right: 30,
                            left: 0,
                            bottom: 0,
                        }}
                    >
                        <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                        <XAxis dataKey="timestamp" stroke="#9CA3AF" />
                        <YAxis stroke="#9CA3AF" />
                        <Tooltip
                            contentStyle={{ backgroundColor: '#1F2937', borderColor: '#374151', color: '#F3F4F6' }}
                            itemStyle={{ color: '#F3F4F6' }}
                        />
                        <Legend />
                        <Area type="monotone" dataKey="BTC" stackId="1" stroke="#F7931A" fill="#F7931A" />
                        <Area type="monotone" dataKey="ETH" stackId="1" stroke="#627EEA" fill="#627EEA" />
                        <Area type="monotone" dataKey="SOL" stackId="1" stroke="#14F195" fill="#14F195" />
                        <Area type="monotone" dataKey="Others" stackId="1" stroke="#9CA3AF" fill="#9CA3AF" />
                    </AreaChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default SocialDominanceChart;
