import React from 'react';

export interface Influencer {
    id?: number;
    name: string;
    handle: string;
    platform: string;
    last_sentiment: string; // 'Bullish', 'Bearish'
    reliability_score: number; // 0.0 to 10.0 or 0 to 100
}

interface InfluencerWatchlistProps {
    influencers: Influencer[];
}

const InfluencerWatchlist: React.FC<InfluencerWatchlistProps> = ({ influencers }) => {
    if (!influencers || influencers.length === 0) {
        return <div className="text-gray-400 text-center py-4">No influencers tracked.</div>;
    }

    return (
        <div className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
            <div className="p-4 border-b border-gray-700">
                <h3 className="text-xl font-bold text-white">Top Influencers</h3>
            </div>
            <div className="divide-y divide-gray-700">
                {influencers.map((inf, index) => (
                    <div key={index} className="p-4 flex items-center justify-between hover:bg-gray-750 transition-colors">
                        {/* Info */}
                        <div className="flex items-center space-x-3">
                            <div className="h-10 w-10 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold">
                                {inf.name.charAt(0)}
                            </div>
                            <div>
                                <div className="text-sm font-semibold text-white">{inf.name}</div>
                                <div className="text-xs text-gray-400">@{inf.handle} • {inf.platform}</div>
                            </div>
                        </div>

                        {/* Score & Sentiment */}
                        <div className="flex flex-col items-end space-y-1">
                            <div className="flex items-center space-x-2">
                                <span className="text-xs text-gray-400">Reliability:</span>
                                <div className="w-16 bg-gray-600 rounded-full h-1.5">
                                    <div
                                        className="bg-indigo-400 h-1.5 rounded-full"
                                        style={{ width: `${(inf.reliability_score / 10) * 100}%` }}
                                    ></div>
                                </div>
                                <span className="text-xs font-mono text-indigo-300">{inf.reliability_score}</span>
                            </div>
                            <div>
                                <span className={`px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider ${inf.last_sentiment.toLowerCase() === 'bullish'
                                        ? 'bg-green-500/20 text-green-400'
                                        : 'bg-red-500/20 text-red-400'
                                    }`}>
                                    {inf.last_sentiment}
                                </span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default InfluencerWatchlist;
