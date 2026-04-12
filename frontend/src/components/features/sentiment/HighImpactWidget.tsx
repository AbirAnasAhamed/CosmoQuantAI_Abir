import React from 'react';
import Card from '@/components/common/Card';
import { AlertTriangle, TrendingUp, TrendingDown, Bell, Zap, ExternalLink, Activity } from 'lucide-react';
import { SentimentSource } from '@/types';
import { ImpactBadge } from './ImpactBadge';
import { formatClockTime } from '@/utils/dateUtils';

interface HighImpactWidgetProps {
    news: SentimentSource[];
}

export const HighImpactWidget: React.FC<HighImpactWidgetProps> = ({ news }) => {
    // Filter High Impact news, show more items (up to 8) for "bigger downwards" look
    const highImpactNews = news.filter(item => item.impact_level === 'HIGH').slice(0, 8);

    if (highImpactNews.length === 0) {
        return (
            <div className="relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-950 p-6 shadow-xl">
                <div className="flex flex-col items-center justify-center text-slate-500 py-10 gap-3">
                    <div className="p-3 bg-slate-100 dark:bg-slate-900 rounded-full">
                        <Activity className="w-6 h-6 opacity-50" />
                    </div>
                    <span className="text-sm font-medium tracking-wide">Market Conditions Stable. No Critical Alerts.</span>
                </div>
            </div>
        );
    }

    return (
        <div className="relative group rounded-2xl p-[1px] bg-gradient-to-b from-red-500/50 via-orange-500/30 to-transparent shadow-2xl">
            {/* Animated Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-r from-red-600/20 to-orange-600/20 blur-xl opacity-50 animate-pulse pointer-events-none" />

            <div className="relative bg-white dark:bg-slate-950 rounded-2xl overflow-hidden h-full flex flex-col">
                {/* Header Section */}
                <div className="flex items-center justify-between p-5 border-b border-slate-100 dark:border-slate-900 bg-slate-50/50 dark:bg-slate-900/20 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                        <div className="relative flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-red-500 to-orange-600 shadow-lg shadow-red-500/20">
                            <Zap className="w-4 h-4 text-white fill-white animate-bounce-slow" />
                        </div>
                        <div>
                            <h3 className="font-black text-lg tracking-tight text-slate-900 dark:text-white uppercase">
                                Flash Impact
                            </h3>
                            <p className="text-[10px] uppercase tracking-widest text-red-500 font-bold">
                                Critical Market Movers
                            </p>
                        </div>
                    </div>
                    <span className="flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-bold bg-red-500/10 text-red-600 border border-red-500/20 animate-pulse">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>
                        LIVE FEED
                    </span>
                </div>

                {/* News List - Scrollable but tall */}
                <div className="flex-1 overflow-y-auto custom-scrollbar p-2 space-y-2 min-h-[300px] max-h-[500px]">
                    {highImpactNews.map((item, index) => (
                        <div
                            key={index}
                            className="group/item relative flex flex-col gap-2 p-4 rounded-xl transition-all duration-300 hover:bg-slate-50 dark:hover:bg-slate-900/50 border border-transparent hover:border-slate-200 dark:hover:border-slate-800"
                        >
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-2">
                                        <ImpactBadge level="HIGH" sentiment={item.sentiment} score={item.impact_score} />
                                        <span className="text-[10px] font-mono text-slate-400 opacity-70">
                                            | {item.source}
                                        </span>
                                    </div>

                                    <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" className="block text-sm font-bold text-slate-800 dark:text-slate-200 leading-snug group-hover/item:text-blue-500 transition-colors">
                                        {item.content}
                                    </a>
                                </div>

                                <div className={`flex-shrink-0 p-2 rounded-lg bg-opacity-10 ${item.sentiment === 'Positive' ? 'bg-emerald-500 text-emerald-500' :
                                    item.sentiment === 'Negative' ? 'bg-rose-500 text-rose-500' :
                                        'bg-orange-500 text-orange-500'
                                    }`}>
                                    {item.sentiment === 'Positive' ? <TrendingUp className="w-4 h-4" /> :
                                        item.sentiment === 'Negative' ? <TrendingDown className="w-4 h-4" /> :
                                            <AlertTriangle className="w-4 h-4" />}
                                </div>
                            </div>

                            <div className="flex items-center justify-between pt-2 mt-1 border-t border-slate-100 dark:border-slate-900/50">
                                <span className="text-[10px] text-slate-400 font-medium font-mono">{formatClockTime(item.timestamp)}</span>
                                <a href={item.url || '#'} target="_blank" rel="noopener noreferrer" className="opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center gap-1 text-[10px] font-bold text-blue-500">
                                    READ FULL INTEL <ExternalLink className="w-3 h-3" />
                                </a>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer Gradient Fade */}
                <div className="h-4 bg-gradient-to-t from-white dark:from-slate-950 to-transparent pointer-events-none" />
            </div>
        </div>
    );
};
