import React, { useEffect, useState } from 'react';
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid, ReferenceLine } from 'recharts';
import Card from '@/components/common/Card';
import { XMarkIcon } from '@heroicons/react/24/outline';
import { fetchRollingCorrelation, RollingCorrelationPoint } from '@/services/analytics';
import { useTheme } from '@/context/ThemeContext';

interface RollingCorrelationModalProps {
    symbolA: string;
    symbolB: string;
    onClose: () => void;
}

const RollingCorrelationModal: React.FC<RollingCorrelationModalProps> = ({ symbolA, symbolB, onClose }) => {
    const { theme } = useTheme();
    const [data, setData] = useState<RollingCorrelationPoint[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const loadData = async () => {
            setLoading(true);
            setError(null);
            try {
                const result = await fetchRollingCorrelation(symbolA, symbolB);
                setData(result);
            } catch (err) {
                console.error(err);
                setError("Failed to load rolling correlation history.");
            } finally {
                setLoading(false);
            }
        };

        if (symbolA && symbolB) {
            loadData();
        }
    }, [symbolA, symbolB]);

    // Format date for X-Axis
    const formatXAxis = (tickItem: string) => {
        const date = new Date(tickItem);
        return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    };

    return (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-modal-fade-in" onClick={onClose}>
            <Card className="w-full max-w-4xl h-[600px] flex flex-col relative" onClick={(e) => e.stopPropagation()}>
                <button
                    onClick={onClose}
                    className="absolute top-4 right-4 text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
                >
                    <XMarkIcon className="w-6 h-6" />
                </button>

                <div className="mb-6">
                    <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        Rolling Correlation History
                    </h2>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        {symbolA} vs {symbolB} (30-period rolling window)
                    </p>
                </div>

                <div className="flex-1 w-full min-h-0">
                    {loading ? (
                        <div className="h-full flex items-center justify-center">
                            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-brand-primary"></div>
                        </div>
                    ) : error ? (
                        <div className="h-full flex items-center justify-center text-rose-500">
                            {error}
                        </div>
                    ) : (
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={data}>
                                <CartesianGrid strokeDasharray="3 3" stroke={theme === 'dark' ? '#334155' : '#e2e8f0'} />
                                <XAxis
                                    dataKey="time"
                                    tickFormatter={formatXAxis}
                                    stroke={theme === 'dark' ? '#94a3b8' : '#64748b'}
                                    fontSize={12}
                                />
                                <YAxis
                                    domain={[-1, 1]}
                                    stroke={theme === 'dark' ? '#94a3b8' : '#64748b'}
                                    fontSize={12}
                                />
                                <Tooltip
                                    contentStyle={theme === 'dark' ? { backgroundColor: '#0F172A', border: '1px solid #334155' } : {}}
                                    itemStyle={{ color: '#6366F1' }}
                                    formatter={(value: number) => [value.toFixed(4), 'Correlation']}
                                    labelFormatter={(label) => new Date(label).toLocaleDateString() + ' ' + new Date(label).toLocaleTimeString()}
                                />
                                <ReferenceLine y={0} stroke="#94A3B8" strokeDasharray="3 3" />
                                <Line
                                    type="monotone"
                                    dataKey="value"
                                    stroke="#6366F1"
                                    strokeWidth={3}
                                    dot={false}
                                    activeDot={{ r: 6 }}
                                />
                            </LineChart>
                        </ResponsiveContainer>
                    )}
                </div>
            </Card>
        </div>
    );
};

export default RollingCorrelationModal;
