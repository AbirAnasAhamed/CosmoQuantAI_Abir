import React, { useState, useEffect } from 'react';
import axios from 'axios';

interface AnalystRatingData {
    symbol: string;
    date: string;
    recommendation: string;
    strongBuy: number;
    buy: number;
    hold: number;
    sell: number;
    strongSell: number;
    consensus?: string; // our backend might return this
}

interface AnalystRatingsProps {
    symbol?: string;
}

const AnalystRatings: React.FC<AnalystRatingsProps> = ({ symbol = 'AAPL' }) => {
    const [ratingData, setRatingData] = useState<AnalystRatingData | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        const getRatings = async () => {
            try {
                setLoading(true);
                setError(null);
                // Fetch from our Node.js Microservice (Port 3001)
                // Note: in production, this URL should be in an env var like VITE_NODE_BACKEND_URL
                const response = await axios.get<{ success: boolean; data: AnalystRatingData }>(
                    `http://localhost:3001/ratings/${symbol}`
                );

                if (response.data.success && response.data.data) {
                    setRatingData(response.data.data);
                } else {
                    setError("No data found for this symbol");
                }
            } catch (err) {
                console.error(err);
                setError("Failed to fetch analyst ratings");
            } finally {
                setLoading(false);
            }
        };

        getRatings();
    }, [symbol]);

    if (loading) return (
        <div className="p-6 bg-gray-900/50 backdrop-blur-sm border border-gray-800 rounded-2xl animate-pulse max-w-md">
            <div className="h-6 bg-gray-800 rounded w-1/3 mb-4"></div>
            <div className="space-y-3">
                <div className="h-4 bg-gray-800 rounded w-full"></div>
                <div className="h-4 bg-gray-800 rounded w-5/6"></div>
                <div className="h-4 bg-gray-800 rounded w-4/6"></div>
            </div>
        </div>
    );

    if (error) return <div className="p-6 text-red-400 bg-red-900/10 border border-red-900/50 rounded-xl max-w-md">{error}</div>;
    if (!ratingData) return null;

    // Use either exact values or ensure defaults
    const strongBuy = ratingData.strongBuy || 0;
    const buy = ratingData.buy || 0;
    const hold = ratingData.hold || 0;
    const sell = ratingData.sell || 0;
    const strongSell = ratingData.strongSell || 0;

    const totalRatings = strongBuy + buy + hold + sell + strongSell;

    // Helper function to calculate percentage
    const getWidth = (value: number) => (totalRatings > 0 ? (value / totalRatings) * 100 : 0);

    // Determine consensus label if not provided directly
    const consensusLabel = ratingData.consensus || ratingData.recommendation || "Neutral";

    return (
        <div className="p-6 bg-[#0B0E14] border border-gray-800 rounded-2xl shadow-xl text-white max-w-md font-inter">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold tracking-tight text-white">Analyst Ratings</h2>
                    <p className="text-xs text-gray-400 mt-1">{symbol.toUpperCase()}</p>
                </div>
                <span className="px-3 py-1 bg-blue-500/10 text-blue-400 text-sm font-semibold rounded-full border border-blue-500/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]">
                    {consensusLabel}
                </span>
            </div>

            <div className="space-y-4">
                {/* Strong Buy */}
                <div className="group">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Strong Buy</span>
                        <span className="font-medium text-gray-200">{strongBuy}</span>
                    </div>
                    <div className="w-full bg-gray-800/50 h-2 rounded-full overflow-hidden">
                        <div style={{ width: `${getWidth(strongBuy)}%` }} className="bg-gradient-to-r from-green-600 to-green-400 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(74,222,128,0.3)]" />
                    </div>
                </div>

                {/* Buy */}
                <div className="group">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Buy</span>
                        <span className="font-medium text-gray-200">{buy}</span>
                    </div>
                    <div className="w-full bg-gray-800/50 h-2 rounded-full overflow-hidden">
                        <div style={{ width: `${getWidth(buy)}%` }} className="bg-gradient-to-r from-emerald-500 to-emerald-300 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(52,211,153,0.3)]" />
                    </div>
                </div>

                {/* Hold */}
                <div className="group">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Hold</span>
                        <span className="font-medium text-gray-200">{hold}</span>
                    </div>
                    <div className="w-full bg-gray-800/50 h-2 rounded-full overflow-hidden">
                        <div style={{ width: `${getWidth(hold)}%` }} className="bg-gradient-to-r from-yellow-500 to-yellow-300 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(250,204,21,0.3)]" />
                    </div>
                </div>

                {/* Sell */}
                <div className="group">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Sell</span>
                        <span className="font-medium text-gray-200">{sell}</span>
                    </div>
                    <div className="w-full bg-gray-800/50 h-2 rounded-full overflow-hidden">
                        <div style={{ width: `${getWidth(sell)}%` }} className="bg-gradient-to-r from-orange-500 to-orange-300 h-full rounded-full transition-all duration-700 ease-out" />
                    </div>
                </div>

                {/* Strong Sell */}
                <div className="group">
                    <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-400 group-hover:text-gray-300 transition-colors">Strong Sell</span>
                        <span className="font-medium text-gray-200">{strongSell}</span>
                    </div>
                    <div className="w-full bg-gray-800/50 h-2 rounded-full overflow-hidden">
                        <div style={{ width: `${getWidth(strongSell)}%` }} className="bg-gradient-to-r from-red-600 to-red-400 h-full rounded-full transition-all duration-700 ease-out shadow-[0_0_8px_rgba(248,113,113,0.3)]" />
                    </div>
                </div>
            </div>

            <div className="mt-8 pt-4 border-t border-gray-800 text-center">
                <p className="text-xs text-gray-500 font-medium">
                    Based on {totalRatings} analyst recommendations {ratingData.date ? `as of ${ratingData.date}` : ''}
                </p>
            </div>
        </div>
    );
};

export default AnalystRatings;
