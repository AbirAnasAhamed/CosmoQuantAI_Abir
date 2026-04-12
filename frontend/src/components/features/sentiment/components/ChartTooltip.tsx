import React from 'react';
import { TooltipProps } from 'recharts';

import { formatToLocalTime } from '@/utils/dateUtils';

const ChartTooltip: React.FC<any> = ({ active, payload, label }) => {
    if (active && payload && payload.length) {
        return (
            <div className="backdrop-blur-xl bg-white/95 dark:bg-slate-900/95 border border-slate-200 dark:border-slate-800 p-4 rounded-xl shadow-xl min-w-[200px]">
                <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider border-b border-slate-100 dark:border-slate-800 pb-2">
                    {formatToLocalTime(label)}
                </p>
                <div className="space-y-2">
                    {payload.map((entry: any, index: number) => {
                        // Skip if the value is null or undefined or if it's the vol bar which might clutter
                        if (entry.value === null || entry.value === undefined || entry.dataKey === 'social_volume') return null;

                        const isPrice = entry.dataKey === 'price';
                        const labelName = entry.name === 'score' ? 'Sentiment' : entry.name;

                        return (
                            <div key={index} className="flex items-center justify-between gap-4 text-sm">
                                <div className="flex items-center gap-2">
                                    <span
                                        className="w-2 h-2 rounded-full ring-2 ring-opacity-50 ring-offset-1 dark:ring-offset-slate-900"
                                        style={{
                                            backgroundColor: entry.color,
                                            // Use specific colors if provided in entry, fallback to standard
                                            boxShadow: `0 0 8px ${entry.color}`
                                        }}
                                    />
                                    <span className="font-medium text-slate-600 dark:text-slate-300">
                                        {labelName}:
                                    </span>
                                </div>
                                <span className={`font-bold font-mono ${isPrice ? 'text-emerald-500' : 'text-slate-900 dark:text-white'}`}>
                                    {isPrice
                                        ? `$${Number(entry.value).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                                        : Number(entry.value).toFixed(2)
                                    }
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        );
    }

    return null;
};

export default ChartTooltip;
