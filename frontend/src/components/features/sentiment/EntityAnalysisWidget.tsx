import React from 'react';

interface EntityData {
    coins: string[];
    orgs: string[];
    events: string[];
}

interface EntityAnalysisWidgetProps {
    data: EntityData;
    isLoading?: boolean;
}

export const EntityAnalysisWidget: React.FC<EntityAnalysisWidgetProps> = ({ data, isLoading }) => {
    if (isLoading) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700 animate-pulse">
                <div className="h-6 bg-slate-200 dark:bg-slate-700 rounded w-1/3 mb-4"></div>
                <div className="space-y-3">
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-full"></div>
                    <div className="h-4 bg-slate-200 dark:bg-slate-700 rounded w-5/6"></div>
                </div>
            </div>
        );
    }

    const hasEntities = (data.coins?.length > 0) || (data.orgs?.length > 0) || (data.events?.length > 0);

    if (!hasEntities) {
        return (
            <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 mb-2">Deep Entity Analysis</h3>
                <p className="text-slate-500 dark:text-slate-400 text-sm">No specific crypto entities detected in the recent news cycle.</p>
            </div>
        );
    }

    return (
        <div className="bg-white dark:bg-slate-800 rounded-xl p-6 shadow-sm border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <span className="text-indigo-500">✨</span> Deep Entity Analysis
                </h3>
                <span className="text-xs px-2 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-full font-medium">
                    AI Powered
                </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Coins Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                        Coins & Assets
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {data.coins && data.coins.length > 0 ? (
                            data.coins.map((coin, idx) => (
                                <span key={idx} className="px-3 py-1 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 text-sm rounded-lg border border-blue-100 dark:border-blue-800/50">
                                    {coin}
                                </span>
                            ))
                        ) : (
                            <span className="text-slate-400 text-sm italic">None detected</span>
                        )}
                    </div>
                </div>

                {/* Orgs Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-purple-500"></span>
                        Organizations
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {data.orgs && data.orgs.length > 0 ? (
                            data.orgs.map((org, idx) => (
                                <span key={idx} className="px-3 py-1 bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm rounded-lg border border-purple-100 dark:border-purple-800/50">
                                    {org}
                                </span>
                            ))
                        ) : (
                            <span className="text-slate-400 text-sm italic">None detected</span>
                        )}
                    </div>
                </div>

                {/* Events Section */}
                <div className="space-y-3">
                    <h4 className="text-sm font-medium text-slate-500 dark:text-slate-400 uppercase tracking-wider flex items-center gap-2">
                        <span className="w-2 h-2 rounded-full bg-red-500"></span>
                        Key Events
                    </h4>
                    <div className="flex flex-wrap gap-2">
                        {data.events && data.events.length > 0 ? (
                            data.events.map((event, idx) => (
                                <span key={idx} className="px-3 py-1 bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm rounded-lg border border-red-100 dark:border-red-800/50">
                                    {event}
                                </span>
                            ))
                        ) : (
                            <span className="text-slate-400 text-sm italic">None detected</span>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
};
