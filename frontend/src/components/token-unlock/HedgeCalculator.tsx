import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import apiClient from '@/services/client';

interface HedgeData {
    holding_usd: number;
    expected_drawdown_pct: number;
    pattern: string;
    perp_short: { ratio: number; usd_size: number; daily_funding_cost_usd: number; coverage: string; };
    put_option: { strike_pct: number; days_to_expiry: number; premium_usd: number; coverage: string; };
    total_hedge_cost_usd: number;
    total_hedge_cost_pct: number;
    expected_saved_usd: number;
    worst_case_saved_usd: number;
    hedge_roi_pct: number;
    recommendation: string;
}

interface Props { eventId: string; }

const HedgeCalculator: React.FC<Props> = ({ eventId }) => {
    const [holdingUSD, setHoldingUSD] = useState(10000);
    const [inputVal, setInputVal] = useState('10000');

    const { data, isLoading, refetch } = useQuery<HedgeData>({
        queryKey: ['unlock-hedge', eventId, holdingUSD],
        queryFn: async () => (await apiClient.get(`/token-unlocks/${eventId}/hedge?holding_usd=${holdingUSD}`)).data,
        staleTime: 5 * 60 * 1000,
    });

    const handleCalculate = () => {
        const val = parseFloat(inputVal);
        if (!isNaN(val) && val >= 100) {
            setHoldingUSD(val);
        }
    };

    if (isLoading) return <div className="animate-pulse h-72 bg-gray-700/50 rounded-xl" />;

    return (
        <div className="space-y-4">
            {/* Input Row */}
            <div className="flex gap-3">
                <div className="flex-1">
                    <label className="text-xs text-gray-500 uppercase tracking-wider font-semibold block mb-1">Your Holding ($)</label>
                    <input
                        type="number"
                        value={inputVal}
                        onChange={e => setInputVal(e.target.value)}
                        className="w-full bg-black/30 border border-white/10 rounded-xl px-4 py-2.5 text-white font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
                        placeholder="10000"
                        min={100}
                    />
                </div>
                <button
                    onClick={handleCalculate}
                    className="self-end px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-bold rounded-xl transition-colors"
                >
                    Calculate
                </button>
            </div>

            {data && (
                <>
                    {/* Pattern badge */}
                    <div className="text-xs text-gray-500">
                        Based on <span className="text-indigo-400 font-semibold">{data.pattern}</span> pattern •{' '}
                        Expected drawdown: <span className="text-rose-400 font-mono">{data.expected_drawdown_pct.toFixed(1)}%</span>
                    </div>

                    {/* Hedge Components */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="bg-indigo-900/20 border border-indigo-500/20 rounded-xl p-4">
                            <div className="text-xs text-indigo-400 uppercase tracking-wider font-bold mb-2">① Perp Short</div>
                            <div className="text-lg font-mono font-bold text-white">${data.perp_short.usd_size.toLocaleString()}</div>
                            <div className="text-xs text-gray-400 mt-1">Ratio: {data.perp_short.ratio}x</div>
                            <div className="text-xs text-gray-500">${data.perp_short.daily_funding_cost_usd}/day funding cost</div>
                            <div className="text-xs text-indigo-400 mt-1">{data.perp_short.coverage}</div>
                        </div>
                        <div className="bg-purple-900/20 border border-purple-500/20 rounded-xl p-4">
                            <div className="text-xs text-purple-400 uppercase tracking-wider font-bold mb-2">② Put Option</div>
                            <div className="text-lg font-mono font-bold text-white">${data.put_option.premium_usd.toLocaleString()}</div>
                            <div className="text-xs text-gray-400 mt-1">Strike: -{100 - data.put_option.strike_pct}% OTM</div>
                            <div className="text-xs text-gray-500">{data.put_option.days_to_expiry} DTE</div>
                            <div className="text-xs text-purple-400 mt-1">{data.put_option.coverage}</div>
                        </div>
                    </div>

                    {/* ROI Summary */}
                    <div className="bg-emerald-900/20 border border-emerald-500/30 rounded-xl p-4">
                        <div className="grid grid-cols-3 gap-4 text-center">
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider">Total Cost</div>
                                <div className="text-lg font-mono font-bold text-white">${data.total_hedge_cost_usd.toLocaleString()}</div>
                                <div className="text-xs text-gray-500">{data.total_hedge_cost_pct}%</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider">Expected Saved</div>
                                <div className="text-lg font-mono font-bold text-emerald-400">${data.expected_saved_usd.toLocaleString()}</div>
                            </div>
                            <div>
                                <div className="text-xs text-gray-500 uppercase tracking-wider">Hedge ROI</div>
                                <div className="text-lg font-mono font-bold text-emerald-400">{data.hedge_roi_pct.toLocaleString()}%</div>
                            </div>
                        </div>
                    </div>

                    <div className="text-xs text-indigo-300 bg-indigo-900/10 border border-indigo-500/10 rounded-xl p-3">
                        🎯 <span className="font-semibold">Recommendation:</span> {data.recommendation}
                    </div>
                </>
            )}
        </div>
    );
};

export default HedgeCalculator;
