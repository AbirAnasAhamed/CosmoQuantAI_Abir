import React, { useState } from 'react';
import { ThumbsUp, ThumbsDown } from 'lucide-react';
import InfluencerWatchlist, { Influencer } from '@/components/features/sentiment/InfluencerWatchlist';

// --- Sub Component: CommunityPoll ---
const CommunityPoll = ({ stats, onVote }: { stats: any, onVote: any }) => {
    const [hasVoted, setHasVoted] = useState(false);

    // Use props instead of local state
    const bullishPercent = stats.bullish_pct || 0;
    const bearishPercent = stats.bearish_pct || 0;
    const totalVotes = stats.total_votes || 0;

    const handleLocalVote = (type: 'bullish' | 'bearish') => {
        if (hasVoted) return;
        onVote(type);
        setHasVoted(true);
    };

    return (
        <div className="h-full flex flex-col relative overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-800 dark:text-white text-center mb-1">
                Market Sentiment Poll
            </h3>
            <p className="text-[10px] text-center text-slate-400 mb-6 uppercase tracking-wider">
                What's your outlook?
            </p>

            {!hasVoted && totalVotes === 0 ? (
                <div className="flex flex-col gap-3 h-full justify-center">
                    <button
                        onClick={() => handleLocalVote('bullish')}
                        className="group relative flex items-center justify-between p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 hover:bg-emerald-500/10 transition-all overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-emerald-500/0 via-emerald-500/0 to-emerald-500/5 group-hover:via-emerald-500/10 transition-all duration-700"></div>
                        <div className="flex items-center gap-3 z-10">
                            <div className="p-2 bg-emerald-500/10 rounded-lg text-emerald-500 group-hover:scale-110 transition-transform">
                                <ThumbsUp size={18} />
                            </div>
                            <span className="font-bold text-emerald-600 dark:text-emerald-400">Bullish</span>
                        </div>
                        <span className="text-xs font-mono text-emerald-500/60 opacity-0 group-hover:opacity-100 transition-opacity">VOTE</span>
                    </button>

                    <button
                        onClick={() => handleLocalVote('bearish')}
                        className="group relative flex items-center justify-between p-4 rounded-xl border border-rose-500/20 bg-rose-500/5 hover:bg-rose-500/10 transition-all overflow-hidden"
                    >
                        <div className="absolute inset-0 bg-gradient-to-r from-rose-500/0 via-rose-500/0 to-rose-500/5 group-hover:via-rose-500/10 transition-all duration-700"></div>
                        <div className="flex items-center gap-3 z-10">
                            <div className="p-2 bg-rose-500/10 rounded-lg text-rose-500 group-hover:scale-110 transition-transform">
                                <ThumbsDown size={18} />
                            </div>
                            <span className="font-bold text-rose-600 dark:text-rose-400">Bearish</span>
                        </div>
                        <span className="text-xs font-mono text-rose-500/60 opacity-0 group-hover:opacity-100 transition-opacity">VOTE</span>
                    </button>
                </div>
            ) : (
                <div className="flex flex-col gap-6 animate-fade-in-up mt-2">
                    {/* Visual Bar Representation */}
                    <div className="relative h-12 w-full bg-slate-100 dark:bg-slate-800/50 rounded-full overflow-hidden flex font-bold text-xs">
                        <div
                            style={{ width: `${bullishPercent}%` }}
                            className="h-full bg-gradient-to-r from-emerald-500 to-teal-400 text-white flex items-center pl-3 transition-all duration-1000"
                        >
                            {bullishPercent > 15 && `Bullish ${bullishPercent}%`}
                        </div>
                        <div
                            style={{ width: `${bearishPercent}%` }}
                            className="h-full bg-gradient-to-l from-rose-500 to-pink-500 text-white flex items-center justify-end pr-3 transition-all duration-1000"
                        >
                            {bearishPercent > 15 && `${bearishPercent}% Bearish`}
                        </div>
                        {/* Center Thunder Icon */}
                        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-8 h-8 bg-white dark:bg-slate-900 rounded-full flex items-center justify-center shadow-lg z-10 border-2 border-slate-100 dark:border-slate-800">
                            <span className="text-yellow-500 animate-pulse">⚡</span>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-center">
                        <div className="p-3 rounded-lg bg-emerald-500/5 border border-emerald-500/10">
                            <p className="text-[10px] text-emerald-500/80 uppercase">Bulls</p>
                            <p className="text-lg font-black text-emerald-500">{bullishPercent}%</p>
                        </div>
                        <div className="p-3 rounded-lg bg-rose-500/5 border border-rose-500/10">
                            <p className="text-[10px] text-rose-500/80 uppercase">Bears</p>
                            <p className="text-lg font-black text-rose-500">{bearishPercent}%</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

interface CommunityVotingProps {
    votes: {
        bullish_pct: number;
        bearish_pct: number;
        total_votes: number;
    };
    onVote: (type: 'bullish' | 'bearish') => void;
    influencers: Influencer[];
}

export const CommunityVoting: React.FC<CommunityVotingProps> = ({ votes, onVote, influencers }) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 h-[340px]">
            <InfluencerWatchlist influencers={influencers} />
            <CommunityPoll stats={votes} onVote={onVote} />
        </div>
    );
};
