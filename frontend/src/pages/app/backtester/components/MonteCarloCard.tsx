import React from 'react';
import { MonteCarloMetrics } from '../../../../types';

interface MonteCarloCardProps {
    metrics?: MonteCarloMetrics;
}

const MonteCarloCard: React.FC<MonteCarloCardProps> = ({ metrics }) => {
    if (!metrics) return null;

    const isHighRisk = metrics.risk_of_ruin_percent > 1;

    return (
        <div className="bg-white dark:bg-gray-800 p-6 rounded-xl shadow-sm border border-gray-100 dark:border-gray-700 h-full">
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                        Monte Carlo Risk Analysis
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                        Based on {metrics.simulations} simulations
                    </p>
                </div>

                {/* Risk Badge */}
                <div className={`px-3 py-1 rounded-full text-xs font-medium border ${isHighRisk
                        ? 'bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-400'
                        : 'bg-green-100 text-green-700 border-green-200 dark:bg-green-900/30 dark:text-green-400'
                    }`}>
                    {isHighRisk ? 'HIGH RISK' : 'STABLE STRATEGY'}
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">

                {/* Left: Bankruptcy Risk */}
                <div className="space-y-4">
                    <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                        <p className="text-sm text-gray-500 dark:text-gray-400 mb-1">Risk of Ruin (Bankruptcy)</p>
                        <div className="flex items-end gap-2">
                            <span className={`text-2xl font-bold ${isHighRisk ? 'text-red-500' : 'text-green-500'}`}>
                                {metrics.risk_of_ruin_percent}%
                            </span>
                            <span className="text-xs text-gray-400 mb-1.5">probability of losing capital</span>
                        </div>
                        {/* Progress Bar */}
                        <div className="w-full bg-gray-200 dark:bg-gray-600 h-2 rounded-full mt-2 overflow-hidden">
                            <div
                                className={`h-full rounded-full ${isHighRisk ? 'bg-red-500' : 'bg-green-500'}`}
                                style={{ width: `${Math.min(metrics.risk_of_ruin_percent * 5, 100)}%` }} // Scale for visibility
                            ></div>
                        </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
                            <p className="text-xs text-gray-500">Avg Drawdown</p>
                            <p className="text-lg font-semibold text-red-500">{metrics.expected_max_drawdown}%</p>
                        </div>
                        <div className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-red-100 dark:border-red-900/30">
                            <p className="text-xs text-gray-500">Worst Case DD</p>
                            <p className="text-lg font-bold text-red-600">{metrics.worst_case_drawdown_95}%</p>
                        </div>
                    </div>
                </div>

                {/* Right: Future Equity Projections */}
                <div className="space-y-3">
                    <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Equity Projections (Next 100 Trades)</p>

                    {/* Best Case */}
                    <div className="relative pt-1">
                        <div className="flex justify-between mb-1">
                            <span className="text-xs font-medium text-green-600 dark:text-green-400">Best Case (Top 5%)</span>
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">${metrics.best_case_equity_95.toLocaleString()}</span>
                        </div>
                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-green-100 dark:bg-green-900/20">
                            <div style={{ width: "95%" }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-green-500"></div>
                        </div>
                    </div>

                    {/* Median Case */}
                    <div className="relative pt-1">
                        <div className="flex justify-between mb-1">
                            <span className="text-xs font-medium text-blue-600 dark:text-blue-400">Median (Expected)</span>
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">${metrics.median_equity.toLocaleString()}</span>
                        </div>
                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-blue-100 dark:bg-blue-900/20">
                            <div style={{ width: "60%" }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-blue-500"></div>
                        </div>
                    </div>

                    {/* Worst Case */}
                    <div className="relative pt-1">
                        <div className="flex justify-between mb-1">
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">Worst Case (Bottom 5%)</span>
                            <span className="text-xs font-bold text-gray-700 dark:text-gray-200">${metrics.worst_case_equity_95.toLocaleString()}</span>
                        </div>
                        <div className="overflow-hidden h-2 mb-4 text-xs flex rounded bg-red-100 dark:bg-red-900/20">
                            <div style={{ width: "20%" }} className="shadow-none flex flex-col text-center whitespace-nowrap text-white justify-center bg-red-500"></div>
                        </div>
                    </div>

                </div>
            </div>
        </div>
    );
};

export default MonteCarloCard;
