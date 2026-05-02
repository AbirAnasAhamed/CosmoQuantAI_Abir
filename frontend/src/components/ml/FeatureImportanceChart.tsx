import React from 'react';
import { motion } from 'framer-motion';
import { BarChart3 } from 'lucide-react';

interface FeatureImportanceChartProps {
    data: Record<string, number>;
}

const FeatureImportanceChart: React.FC<FeatureImportanceChartProps> = ({ data }) => {
    // Sort features by importance descending
    const sortedFeatures = Object.entries(data)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5); // Take top 5

    // Find max value for scaling
    const maxVal = sortedFeatures.length > 0 ? Math.max(...sortedFeatures.map(f => f[1])) : 1;

    if (sortedFeatures.length === 0) return null;

    return (
        <div className="mt-6 p-4 bg-gradient-to-br from-cyan-900/20 to-blue-900/10 rounded-2xl border border-cyan-500/20 shadow-inner">
            <h4 className="text-xs font-bold text-cyan-400 mb-4 flex items-center gap-2 tracking-widest uppercase">
                <BarChart3 className="w-4 h-4" /> Feature Importance (Top 5)
            </h4>
            <div className="space-y-3">
                {sortedFeatures.map(([feature, importance], idx) => {
                    const pct = (importance / maxVal) * 100;
                    return (
                        <div key={feature}>
                            <div className="flex justify-between text-[10px] font-mono text-cyan-100 mb-1">
                                <span>{feature}</span>
                                <span>{(importance * 100).toFixed(1)}%</span>
                            </div>
                            <div className="h-1.5 w-full bg-black/50 rounded-full overflow-hidden">
                                <motion.div 
                                    initial={{ width: 0 }}
                                    animate={{ width: `${pct}%` }}
                                    transition={{ duration: 1, delay: idx * 0.1 }}
                                    className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 shadow-[0_0_10px_#22d3ee]"
                                />
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
};

export default FeatureImportanceChart;
