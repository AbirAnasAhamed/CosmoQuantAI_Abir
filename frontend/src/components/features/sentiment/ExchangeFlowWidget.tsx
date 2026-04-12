import React, { useEffect, useState } from 'react';

interface ExchangeFlowData {
    inflow_eth: number;
    outflow_eth: number;
    net_flow: number;
    sentiment: string;
    tx_count: number;
}

const ExchangeFlowWidget: React.FC = () => {
    const [data, setData] = useState<ExchangeFlowData | null>(null);
    const [loading, setLoading] = useState<boolean>(true);

    useEffect(() => {
        const fetchData = async () => {
            try {
                // Adjust base URL as needed
                const response = await fetch(`${import.meta.env.VITE_API_URL || ''}/api/v1/on-chain/exchange-flow`);
                if (response.ok) {
                    const result = await response.json();
                    setData(result);
                }
            } catch (error) {
                console.error("Failed to fetch exchange flow metrics", error);
            } finally {
                setLoading(false);
            }
        };

        fetchData();
        const interval = setInterval(fetchData, 60000); // 1 min poll (Block time is ~12s, but 1m is safe)
        return () => clearInterval(interval);
    }, []);

    if (loading) return <div className="animate-pulse h-32 bg-gray-900/50 rounded-xl" />;

    // Default zero state if no data or missing fields
    const safeData = {
        inflow_eth: data?.inflow_eth ?? 0,
        outflow_eth: data?.outflow_eth ?? 0,
        net_flow: data?.net_flow ?? 0,
        sentiment: data?.sentiment || 'Neutral',
        tx_count: data?.tx_count ?? 0
    };

    const totalFlow = safeData.inflow_eth + safeData.outflow_eth;
    const inflowPct = totalFlow > 0 ? (safeData.inflow_eth / totalFlow) * 100 : 50;

    const isBullish = safeData.net_flow > 0;
    const isNeutral = safeData.net_flow === 0;

    return (
        <div className="bg-gray-900 border border-gray-800 p-4 rounded-xl shadow-lg relative overflow-hidden group">
            {/* Background Glow Effect */}
            <div className={`absolute -right-10 -top-10 w-32 h-32 blur-[80px] rounded-full opacity-20 group-hover:opacity-40 transition-opacity ${isBullish ? 'bg-green-500' : 'bg-red-500'}`}></div>

            <h3 className="text-lg font-bold text-gray-100 mb-4 flex items-center justify-between relative z-10">
                Exchange Netflow (Live)
                <span className={`text-xs px-2 py-1 rounded-full border border-opacity-30 ${isBullish ? 'bg-green-900/40 text-green-400 border-green-500' :
                    isNeutral ? 'bg-gray-700 text-gray-400 border-gray-500' :
                        'bg-red-900/40 text-red-400 border-red-500'
                    }`}>
                    {safeData.sentiment ? safeData.sentiment.toUpperCase() : 'NEUTRAL'}
                </span>
            </h3>

            <div className="relative z-10 space-y-4">
                {/* Stats Row */}
                <div className="flex justify-between items-end text-sm">
                    <div className="text-left">
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Inflow (Sell)</p>
                        <p className="text-red-400 font-mono font-bold text-lg">{safeData.inflow_eth.toFixed(2)} <span className="text-xs">ETH</span></p>
                    </div>

                    <div className="text-right">
                        <p className="text-gray-500 text-xs uppercase tracking-wider">Outflow (Buy)</p>
                        <p className="text-green-400 font-mono font-bold text-lg">{safeData.outflow_eth.toFixed(2)} <span className="text-xs">ETH</span></p>
                    </div>
                </div>

                {/* Split Progress Bar */}
                <div className="h-3 bg-gray-800 rounded-full overflow-hidden flex relative shadow-inner">
                    <div
                        className="h-full bg-gradient-to-r from-red-600 to-red-400 transition-all duration-700 ease-out relative"
                        style={{ width: `${inflowPct}%` }}
                    >
                        {inflowPct > 10 && <span className="absolute right-1 top-0 bottom-0 text-[8px] text-black/50 font-bold flex items-center pr-1">{inflowPct.toFixed(0)}%</span>}
                    </div>

                    <div
                        className="h-full bg-gradient-to-r from-green-400 to-green-600 transition-all duration-700 ease-out relative"
                        style={{ width: `${100 - inflowPct}%` }}
                    >
                        {inflowPct < 90 && <span className="absolute left-1 top-0 bottom-0 text-[8px] text-black/50 font-bold flex items-center pl-1">{(100 - inflowPct).toFixed(0)}%</span>}
                    </div>
                </div>

                {/* Footer Info */}
                <div className="flex justify-between items-center text-xs text-gray-500 pt-2 border-t border-gray-800">
                    <span>Analyzed <span className="text-gray-300">{safeData.tx_count}</span> Tx/Block</span>
                    <span>Net: <span className={isBullish ? 'text-green-400' : 'text-red-400'}>{safeData.net_flow > 0 ? '+' : ''}{safeData.net_flow.toFixed(2)} ETH</span></span>
                </div>
            </div>
        </div>
    );
};

export default ExchangeFlowWidget;
