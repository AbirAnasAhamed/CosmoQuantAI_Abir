import React, { useEffect, useState } from 'react';
import { OnChainMetric } from '../../../types/on_chain';
// Assuming axios or fetch is used. For modularity, usually imported from a service.
// But as per instructions "Modular Architecture... Small, single-responsibility files"
// I'll keep the fetch logic simple or assume a service exists. 
// Instructions: "Build a modular widget that displays..."

const OnChainLiquidityWidget: React.FC<{ symbol: string }> = ({ symbol }) => {
    // Mocking fetch or using direct fetch for now as instructed "Do not assume business logic outside of the instructions"
    // I will simulate the data fetching or use a hypothetical service if available.
    // Given zero-inference: "Action: Build a modular widget... A comparison bar... A text badge"

    // I will implement with local state and fetch logic inline or mocked for display if API not ready,
    // but API IS ready (GET /on-chain/{symbol}).

    const [data, setData] = useState<OnChainMetric | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Adjust base URL as needed, assuming proxy or env set up
                // Extract base symbol (e.g. "BTC" from "BTC/USDT") to avoid slash routing issues
                const baseSymbol = symbol.includes('/') ? symbol.split('/')[0] : symbol;
                const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/on-chain/${baseSymbol}`);
                if (response.ok) {
                    const result = await response.json();
                    setData(result);
                }
            } catch (error) {
                console.error("Failed to fetch on-chain metrics", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 30000); // Poll every 30s
        return () => clearInterval(interval);
    }, [symbol]);

    if (loading) return <div className="animate-pulse h-32 bg-gray-800 rounded-xl"></div>;
    if (!data) return <div className="text-gray-400">No On-Chain Data</div>;

    const totalVol = data.exchange_inflow_volume + data.exchange_outflow_volume;
    const inflowPct = totalVol ? (data.exchange_inflow_volume / totalVol) * 100 : 50;

    const isBullish = data.net_flow_status === 'Strong Buying Pressure';
    const isBearish = data.net_flow_status === 'High Sell Pressure';

    return (
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-lg hover:shadow-cyan-500/10 transition-all">
            <h3 className="text-lg font-bold text-gray-100 mb-2 flex items-center justify-between">
                On-Chain Exchange Flow
                <span className={`text-xs px-2 py-1 rounded-full border ${isBullish ? 'bg-green-900/40 text-green-400 border-green-800' :
                    isBearish ? 'bg-red-900/40 text-red-400 border-red-800' :
                        'bg-gray-700 text-gray-300'
                    }`}>
                    {data.net_flow_status}
                </span>
            </h3>

            <div className="mt-4 space-y-2">
                <div className="flex justify-between text-sm text-gray-400">
                    <span>Inflow (Sell Pressure): <span className="text-red-400">${data.exchange_inflow_volume.toLocaleString()}</span></span>
                    <span>Outflow (Buy Pressure): <span className="text-green-400">${data.exchange_outflow_volume.toLocaleString()}</span></span>
                </div>

                {/* Comparison Bar */}
                <div className="h-4 bg-gray-700 rounded-full overflow-hidden flex relative">
                    <div
                        className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-500"
                        style={{ width: `${inflowPct}%` }}
                    />
                    <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-500"
                        style={{ width: `${100 - inflowPct}%` }}
                    />

                    {/* Marker */}
                    <div className="absolute top-0 bottom-0 w-0.5 bg-black/50 left-1/2" />
                </div>
                <div className="flex justify-between text-xs text-gray-500">
                    <span>{inflowPct.toFixed(1)}%</span>
                    <span>{(100 - inflowPct).toFixed(1)}%</span>
                </div>
            </div>

            <div className="mt-4 text-xs text-center text-gray-500">
                Last updated: {new Date(data.timestamp).toLocaleTimeString()}
            </div>
        </div>
    );
};

export default OnChainLiquidityWidget;
