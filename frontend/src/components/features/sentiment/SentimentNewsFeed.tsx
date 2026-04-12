import React, { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { SentimentSource, SentimentLabel } from '@/types';
import { ImpactBadge } from './ImpactBadge';
import api from '@/services/client';
import { formatRelativeTime } from '@/utils/dateUtils';

const PIE_COLORS = { 'Positive': '#10B981', 'Negative': '#F43F5E', 'Neutral': '#64748B' };

const VerifyButton = ({ content }: { content: string }) => {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<any>(null);

    const handleVerify = async (e: any) => {
        e.preventDefault();
        e.stopPropagation();
        setLoading(true);
        try {
            const res = await api.post('/sentiment/verify-news', { content });
            setResult(res.data);
        } catch (error) {
            console.error("Verification failed", error);
        } finally {
            setLoading(false);
        }
    };

    if (result) {
        return (
            <div className={`mt-2 p-2 rounded text-[10px] border ${result.score > 70 ? 'bg-green-500/10 border-green-500/20 text-green-600' : 'bg-red-500/10 border-red-500/20 text-red-600'}`}>
                <div className="font-bold flex items-center gap-1">
                    {result.score > 70 ? '✅ Credible' : '⚠️ Potential FUD'} ({result.score}/100)
                </div>
                <div className="opacity-80 mt-1">{result.reason}</div>
            </div>
        );
    }

    return (
        <button
            onClick={handleVerify}
            disabled={loading}
            className="text-[10px] flex items-center gap-1 text-slate-400 hover:text-brand-primary transition-colors border border-slate-200 dark:border-slate-800 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800"
            style={{ zIndex: 20, position: 'relative' }}
        >
            {loading ? <Loader2 className="w-3 h-3 animate-spin" /> : <span className="text-blue-500">🛡️</span>}
            {loading ? 'Analyzing...' : 'Verify Fact'}
        </button>
    );
};

interface SentimentNewsFeedProps {
    news: SentimentSource[];
    activeFilter: 'All' | SentimentLabel;
    setActiveFilter: (filter: 'All' | SentimentLabel) => void;
    activeSourceFilter: 'All' | string;
    onSourceSelect: (source: 'All' | string) => void;
    availableSources: string[];
}

export const SentimentNewsFeed: React.FC<SentimentNewsFeedProps> = ({
    news,
    activeFilter,
    setActiveFilter,
    activeSourceFilter,
    onSourceSelect,
    availableSources
}) => {
    return (
        <div className="mt-8 space-y-6">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <div className="absolute inset-0 bg-blue-500 blur-lg opacity-20 animate-pulse"></div>
                        <h3 className="relative text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-slate-900 to-slate-600 dark:from-white dark:to-slate-400">
                            📡 Neural Data Stream
                        </h3>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono bg-blue-500/10 text-blue-500 border border-blue-500/20">
                        LIVE
                    </span>
                </div>

                <div className="flex flex-wrap gap-2 items-center">
                    {/* Sentiment Filter */}
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                        {(['All', 'Positive', 'Negative', 'Neutral'] as const).map(filter => (
                            <button
                                key={filter}
                                onClick={() => setActiveFilter(filter)}
                                className={`px-4 py-1.5 text-xs font-bold uppercase rounded-md transition-all duration-300 ${activeFilter === filter
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm scale-105'
                                    : 'text-gray-500 hover:text-slate-700 dark:hover:text-slate-300'
                                    }`}
                            >
                                {filter}
                            </button>
                        ))}
                    </div>
                </div>
            </div>

            {/* Source Filter Bar */}
            <div className="flex overflow-x-auto pb-2 gap-2 scrollbar-thin scrollbar-thumb-slate-200 dark:scrollbar-thumb-slate-700">
                <button
                    onClick={() => onSourceSelect('All')}
                    className={`whitespace-nowrap px-3 py-1 text-xs font-medium rounded-full transition-colors border ${activeSourceFilter === 'All'
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'
                        }`}
                >
                    All Sources
                </button>
                {availableSources.map(source => (
                    <button
                        key={source}
                        onClick={() => onSourceSelect(source)}
                        className={`whitespace-nowrap px-3 py-1 text-xs font-medium rounded-full transition-colors border ${activeSourceFilter === source
                            ? 'bg-blue-600 text-white border-blue-600'
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 border-transparent'
                            }`}
                    >
                        {source}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {news.sort((a, b) => {
                    // Prioritize HIGH impact
                    if (a.impact_level === 'HIGH' && b.impact_level !== 'HIGH') return -1;
                    if (a.impact_level !== 'HIGH' && b.impact_level === 'HIGH') return 1;
                    // Then Medium
                    if (a.impact_level === 'MEDIUM' && b.impact_level === 'LOW') return -1;
                    if (a.impact_level === 'LOW' && b.impact_level === 'MEDIUM') return 1;
                    return 0; // Keep original order (usually time)
                }).map((source, index) => {
                    const isNew = false;
                    const moodColor = source.sentiment === 'Positive' ? 'emerald' :
                        source.sentiment === 'Negative' ? 'rose' : 'slate';
                    const moodGradient = source.sentiment === 'Positive' ? 'from-emerald-500/20 to-transparent' :
                        source.sentiment === 'Negative' ? 'from-rose-500/20 to-transparent' :
                            'from-slate-500/20 to-transparent';

                    const Wrapper = source.url ? 'a' : 'div';
                    const wrapperProps = source.url ? { href: source.url, target: '_blank', rel: 'noopener noreferrer' } : {};

                    return (
                        <Wrapper
                            key={`${source.id}-${index}`}
                            {...wrapperProps // @ts-ignore
                            }
                            className={`group relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/50 backdrop-blur-sm p-5 transition-all duration-300 hover:scale-[1.02] hover:shadow-xl hover:border-${moodColor}-500/30 ${isNew ? 'animate-pulse ring-2 ring-blue-500/50' : ''}`}
                        >
                            <div className={`absolute inset-0 bg-gradient-to-br ${moodGradient} opacity-0 group-hover:opacity-100 transition-opacity duration-500`}></div>
                            <div className="relative z-10 flex flex-col h-full justify-between">
                                <div>
                                    <div className="flex justify-between items-start mb-3">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-gray-400">{source.source}</span>
                                            <ImpactBadge level={source.impact_level} sentiment={source.sentiment} score={source.impact_score} />
                                        </div>
                                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold uppercase border shadow-sm ${source.sentiment === 'Positive' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20' :
                                            source.sentiment === 'Negative' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20' :
                                                'bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20'
                                            }`}>
                                            {source.sentiment}
                                        </span>
                                    </div>
                                    <p className="text-sm font-medium text-slate-700 dark:text-slate-200 leading-relaxed line-clamp-3 mb-4 group-hover:text-slate-900 dark:group-hover:text-white transition-colors">{source.content}</p>
                                    <div className="mb-3"><VerifyButton content={source.content} /></div>
                                </div>
                                <div className="flex items-center justify-between border-t border-gray-100 dark:border-slate-800 pt-3 mt-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-[10px] text-gray-400 font-mono">{formatRelativeTime(source.timestamp)}</span>
                                        {source.is_translated && (
                                            <span className="text-[10px] bg-indigo-100 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 px-1.5 py-0.5 rounded flex items-center gap-1 cursor-help" title="Translated from local market source">
                                                🌐 <span className='hidden sm:inline'>Translated</span>
                                            </span>
                                        )}
                                    </div>
                                    {source.url && <span className="opacity-0 group-hover:opacity-100 transition-opacity text-blue-500 text-xs font-bold">Read &rarr;</span>}
                                </div>
                            </div>
                        </Wrapper>
                    );
                })}
            </div>
            {news.length === 0 && (
                <div className="flex flex-col items-center justify-center py-20 text-gray-400 opacity-50">
                    <p>No signals found.</p>
                </div>
            )}
        </div>
    );
};
