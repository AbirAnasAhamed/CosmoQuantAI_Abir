import React from 'react';

// Placeholder data for regional sentiment
const REGIONAL_SENTIMENT = [
    { region: 'North America', sentiment: 'Bullish', score: 0.75, code: 'NA' },
    { region: 'Europe', sentiment: 'Neutral', score: 0.52, code: 'EU' },
    { region: 'Asia', sentiment: 'Bearish', score: 0.35, code: 'AS' },
    { region: 'South America', sentiment: 'Bullish', score: 0.68, code: 'SA' },
];

const SentimentGeoMap: React.FC = () => {
    // This is a simplified "Map" which is just a list for now, as per requirements.
    // In a real app, this would be an SVG map or Leaflet integration.
    return (
        <div className="bg-gray-800 p-4 rounded-xl shadow-lg border border-gray-700 h-full">
            <h3 className="text-xl font-bold text-white mb-4">Regional Sentiment</h3>
            <div className="space-y-4">
                {REGIONAL_SENTIMENT.map((item) => (
                    <div key={item.code} className="flex items-center justify-between p-3 bg-gray-700 rounded-lg">
                        <div className="flex items-center">
                            <span className="text-gray-200 font-medium">{item.region}</span>
                        </div>
                        <div className="flex items-center space-x-4">
                            <span className={`px-2 py-1 rounded text-xs font-bold ${item.sentiment === 'Bullish' ? 'bg-green-500/20 text-green-400' :
                                    item.sentiment === 'Bearish' ? 'bg-red-500/20 text-red-400' :
                                        'bg-yellow-500/20 text-yellow-400'
                                }`}>
                                {item.sentiment}
                            </span>
                            <div className="w-24 bg-gray-600 rounded-full h-2">
                                <div
                                    className={`h-2 rounded-full ${item.score > 0.6 ? 'bg-green-500' :
                                            item.score < 0.4 ? 'bg-red-500' : 'bg-yellow-500'
                                        }`}
                                    style={{ width: `${item.score * 100}%` }}
                                ></div>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            <div className="mt-4 text-center text-xs text-gray-500">
                * Heatmap integration coming soon
            </div>
        </div>
    );
};

export default SentimentGeoMap;
