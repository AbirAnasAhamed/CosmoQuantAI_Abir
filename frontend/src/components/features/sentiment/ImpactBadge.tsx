import React from 'react';
import { Zap, Activity, BarChart2 } from 'lucide-react';

interface ImpactBadgeProps {
    level: 'HIGH' | 'MEDIUM' | 'LOW' | undefined;
    sentiment?: 'Positive' | 'Negative' | 'Neutral';
    score?: number;
}

export const ImpactBadge: React.FC<ImpactBadgeProps> = ({ level = 'LOW', sentiment, score }) => {

    // Normalize level to ensure safety
    const normalizedLevel = level?.toUpperCase() || 'LOW';

    let bgClass = "bg-slate-500/10 text-slate-500 border-slate-500/20";
    let icon = <Activity className="w-3 h-3" />;

    if (normalizedLevel === 'HIGH') {
        // High Impact: Red (Negative) or Green (Positive) or Purple (Neutral/Unknown)
        if (sentiment === 'Negative') {
            bgClass = "bg-red-500/20 text-red-600 border-red-500/30 dark:bg-red-900/40 dark:text-red-400";
            icon = <Zap className="w-3 h-3 text-red-600 dark:text-red-400" />;
        } else if (sentiment === 'Positive') {
            bgClass = "bg-green-500/20 text-green-600 border-green-500/30 dark:bg-green-900/40 dark:text-green-400";
            icon = <Zap className="w-3 h-3 text-green-600 dark:text-green-400" />;
        } else {
            bgClass = "bg-purple-500/20 text-purple-600 border-purple-500/30 dark:bg-purple-900/40 dark:text-purple-400";
            icon = <Zap className="w-3 h-3 text-purple-600 dark:text-purple-400" />;
        }
    } else if (normalizedLevel === 'MEDIUM') {
        bgClass = "bg-orange-500/10 text-orange-600 border-orange-500/20 dark:text-orange-400";
        icon = <BarChart2 className="w-3 h-3 text-orange-600 dark:text-orange-400" />;
    } else {
        // Low Impact - subtle
        bgClass = "bg-slate-200 text-slate-500 border-slate-300 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700";
    }

    if (normalizedLevel === 'LOW') {
        return (
            <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-medium uppercase border ${bgClass} opacity-70`}>
                <span>Low Impact</span>
            </div>
        )
    }

    return (
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border shadow-sm ${bgClass}`}>
            {icon}
            <span>{normalizedLevel} Impact</span>
            {score !== undefined && <span className="opacity-80 text-[9px]">({score})</span>}
        </div>
    );
};
