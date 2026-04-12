import React, { useEffect, useState } from 'react';
import { getFearAndGreedIndex, FearAndGreedData } from '../../../services/fng';

const FearGreedWidget: React.FC = () => {
    const [data, setData] = useState<FearAndGreedData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                const result = await getFearAndGreedIndex();
                setData(result);
            } catch (err) {
                console.error("Failed to load Fear & Greed index", err);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
    }, []);

    if (loading) {
        return (
            <div className="bg-gray-800 rounded-xl p-4 shadow-lg flex items-center justify-center h-48 border border-gray-700 animate-pulse">
                <span className="text-gray-400 text-sm">Loading...</span>
            </div>
        );
    }

    if (!data) {
        return (
            <div className="bg-gray-800 rounded-xl p-4 shadow-lg h-48 border border-gray-700 flex items-center justify-center">
                <span className="text-red-400 text-sm">Unavailable</span>
            </div>
        );
    }

    const { value, value_classification, time_until_update } = data;

    // Color Logic
    let colorClass = 'text-gray-400';
    let progressColor = '#9CA3AF'; // Gray

    if (value <= 25) {
        colorClass = 'text-red-500';
        progressColor = '#EF4444'; // Red
    } else if (value <= 49) {
        colorClass = 'text-orange-500';
        progressColor = '#F97316'; // Orange
    } else if (value <= 54) {
        colorClass = 'text-gray-400';
        progressColor = '#9CA3AF'; // Gray
    } else if (value <= 75) {
        colorClass = 'text-lime-400';
        progressColor = '#A3E635'; // Light Green
    } else {
        colorClass = 'text-green-500';
        progressColor = '#22C55E'; // Bright Green
    }

    // Calculate rotation for semi-circle
    // 0 -> -90deg, 100 -> 90deg
    const rotation = (value / 100) * 180 - 90;

    return (
        <div className="bg-gray-800 rounded-xl p-4 shadow-lg border border-gray-700 flex flex-col items-center justify-between h-auto py-6 relative overflow-hidden group hover:border-blue-500/30 transition-all duration-300">
            {/* Background Glow */}
            <div className="absolute top-0 left-0 w-full h-full bg-gradient-to-br from-gray-800/50 to-gray-900/50 -z-10" />
            <div
                className="absolute top-1/2 left-1/2 w-24 h-24 rounded-full blur-2xl -z-10 opacity-20 transform -translate-x-1/2 -translate-y-1/2"
                style={{ backgroundColor: progressColor }}
            />

            <h3 className="text-base font-semibold text-gray-100 mb-1 z-10">Crypto Fear & Greed</h3>

            <div className="relative w-32 h-16 mt-2 overflow-hidden">
                {/* Semi-circle background */}
                <div className="absolute top-0 left-0 w-full h-full border-4 border-gray-700 rounded-t-full" style={{ borderBottom: 'none' }}></div>

                {/* Simple Needle/Bar Indication using CSS rotation is complex for exact semi-circle,
             let's use a simpler SVG approach for precision and aesthetics */}
                <svg viewBox="0 0 100 50" className="w-full h-full transform translate-y-[2%]">
                    {/* Background Arc */}
                    <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#374151" strokeWidth="6" strokeLinecap="round" />

                    {/* Progress Arc */}
                    <path
                        d="M 10 50 A 40 40 0 0 1 90 50"
                        fill="none"
                        stroke={progressColor}
                        strokeWidth="6"
                        strokeLinecap="round"
                        strokeDasharray="126" // Approx length of arc
                        strokeDashoffset={126 - (126 * (value / 100))}
                        className="transition-all duration-1000 ease-out"
                    />
                </svg>

                {/* Value Text centered */}
                <div className="absolute bottom-0 left-1/2 transform -translate-x-1/2 text-center translate-y-1">
                    <span className={`text-2xl font-bold ${colorClass} drop-shadow-sm`}>{value}</span>
                </div>
            </div>

            <div className="text-center mt-1 z-10">
                <p className={`text-sm font-medium ${colorClass} tracking-wide`}>
                    {value_classification}
                </p>

                {time_until_update && (
                    <p className="text-[10px] text-gray-500 mt-1 font-mono">
                        Next Update: {time_until_update}s
                    </p>
                )}
            </div>
        </div>
    );
};

export default FearGreedWidget;
