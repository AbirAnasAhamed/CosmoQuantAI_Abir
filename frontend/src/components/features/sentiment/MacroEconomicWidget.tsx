import React, { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Calendar, Activity, Globe, Info, RefreshCcw, Sparkles } from 'lucide-react';

interface EconomicEvent {
    event: string;
    actual: string | null;
    forecast: string;
    previous: string;
    impact: "High" | "Medium" | "Low";
    date: string;
    status: "Published" | "Upcoming";
}

export const MacroEconomicWidget: React.FC = () => {
    const [data, setData] = useState<EconomicEvent[]>([]);
    const [loading, setLoading] = useState<boolean>(true);
    const [error, setError] = useState<string | null>(null);

    // AI Summary State
    const [summary, setSummary] = useState<string | null>(null);
    const [isGenerating, setIsGenerating] = useState<boolean>(false);
    const [language, setLanguage] = useState<'en' | 'bn'>('en'); // Default English

    const fetchData = async () => {
        setLoading(true);
        try {
            const response = await fetch('/api/v1/sentiment/macro-economics');
            if (!response.ok) throw new Error("Failed to fetch macro data");
            const result = await response.json();
            setData(result);
        } catch (err) {
            console.error("Macro Widget Error:", err);
            setError("Data Unavailable");
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
    }, []);

    const generateAiSummary = async () => {
        if (data.length === 0) return;
        setIsGenerating(true);
        try {
            const response = await fetch('/api/v1/sentiment/macro-summary', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    data: JSON.stringify(data),
                    language: language
                })
            });
            if (!response.ok) throw new Error("Failed to generate summary");
            const result = await response.json();
            setSummary(result.summary);
        } catch (err) {
            console.error("Summary Gen Error:", err);
        } finally {
            setIsGenerating(false);
        }
    };

    // Helper to determine sentiment color
    const getSentimentColor = (item: EconomicEvent) => {
        if (!item.actual) return "text-slate-400"; // No data yet

        // Simple heuristic parsing
        const cleanVal = (val: string) => parseFloat(val.replace('%', '').replace('K', '').replace('M', ''));
        const actual = cleanVal(item.actual);
        const forecast = cleanVal(item.forecast);

        if (isNaN(actual) || isNaN(forecast)) return "text-slate-200";

        // Logic based on event type
        const isInflation = item.event.includes("CPI") || item.event.includes("PPI") || item.event.includes("Inflation");
        const isUnemployment = item.event.includes("Unemployment");
        const isBadIfHigh = isInflation || isUnemployment || item.event.includes("Interest Rate");

        if (isBadIfHigh) {
            return actual < forecast ? "text-emerald-400" : (actual > forecast ? "text-rose-400" : "text-slate-400");
        } else {
            // Growth/Jobs (NFP, GDP) - Higher is usually "Good" for economy (Green)
            return actual > forecast ? "text-emerald-400" : (actual < forecast ? "text-rose-400" : "text-slate-400");
        }
    };

    if (loading) return <div className="h-64 animate-pulse bg-slate-900/50 rounded-2xl"></div>;
    if (error) return <div className="h-64 flex items-center justify-center text-slate-500">{error}</div>;

    return (
        <div className="relative overflow-hidden rounded-2xl border border-slate-700/50 bg-[#0f172a] shadow-xl">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-slate-800/60 bg-slate-900/40 backdrop-blur-md">
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-blue-500/10 border border-blue-500/20 text-blue-400">
                        <Globe className="w-5 h-5" />
                    </div>
                    <div>
                        <h3 className="font-black text-transparent bg-clip-text bg-gradient-to-r from-blue-200 to-indigo-200 text-lg tracking-tight">
                            Global Macro Economy
                        </h3>
                        <p className="text-[10px] text-slate-500 font-mono uppercase tracking-wider">
                            Key Fundamental Drivers
                        </p>
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-2">
                    {/* Language Toggle */}
                    <div className="flex bg-slate-800/50 rounded-lg p-0.5 border border-slate-700/50">
                        <button
                            onClick={() => setLanguage('en')}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${language === 'en' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
                        >
                            EN
                        </button>
                        <button
                            onClick={() => setLanguage('bn')}
                            className={`px-2 py-1 rounded text-[10px] font-bold transition-all ${language === 'bn' ? 'bg-indigo-500 text-white shadow-sm' : 'text-slate-400 hover:text-slate-300'}`}
                        >
                            BN
                        </button>
                    </div>

                    <button
                        onClick={generateAiSummary}
                        disabled={isGenerating}
                        className="group flex items-center gap-2 px-3 py-1.5 rounded-lg bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 hover:bg-indigo-500/20 hover:border-indigo-500/40 transition-all text-xs font-bold uppercase tracking-wider disabled:opacity-50"
                    >
                        {isGenerating ? (
                            <Activity className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                            <Sparkles className="w-3.5 h-3.5" />
                        )}
                        <span className="hidden sm:inline">AI Overview</span>
                    </button>

                    <button
                        onClick={fetchData}
                        className="p-2 rounded-lg bg-slate-800/50 border border-slate-700 text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    >
                        <RefreshCcw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                    </button>
                </div>
            </div>

            {/* AI Summary Section (Collapsible/Conditional) */}
            {summary && (
                <div className="p-4 bg-indigo-900/10 border-b border-indigo-500/10 animate-fade-in">
                    <div className="flex gap-3">
                        <Sparkles className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
                        <div>
                            <h4 className="text-xs font-bold text-indigo-300 uppercase mb-1">
                                AI Macro Analysis ({language === 'en' ? 'English' : 'Bengali'})
                            </h4>
                            <p className="text-sm text-indigo-100/80 leading-relaxed font-medium">
                                {summary}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                    <thead>
                        <tr className="text-[10px] uppercase font-bold text-slate-500 border-b border-slate-800/50 bg-slate-900/20">
                            <th className="py-3 px-4">Event</th>
                            <th className="py-3 px-4">Date</th>
                            <th className="py-3 px-4">Actual</th>
                            <th className="py-3 px-4">Forecast</th>
                            <th className="py-3 px-4">Previous</th>
                            <th className="py-3 px-4 text-right">Impact</th>
                        </tr>
                    </thead>
                    <tbody className="text-sm font-mono divide-y divide-slate-800/30">
                        {data.map((item, idx) => (
                            <tr key={idx} className={`hover:bg-slate-800/30 transition-colors ${item.status === 'Upcoming' ? 'bg-blue-500/5' : ''}`}>
                                <td className="py-3 px-4 font-bold text-slate-200">{item.event}</td>
                                <td className="py-3 px-4 text-slate-400 text-xs">{item.date}</td>
                                <td className={`py-3 px-4 font-bold ${getSentimentColor(item)}`}>
                                    {item.actual || '--'}
                                </td>
                                <td className="py-3 px-4 text-slate-400">{item.forecast}</td>
                                <td className="py-3 px-4 text-slate-500">{item.previous}</td>
                                <td className="py-3 px-4 text-right">
                                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border
                                        ${item.impact === 'High' ? 'bg-red-500/10 text-red-500 border-red-500/20' :
                                            item.impact === 'Medium' ? 'bg-orange-500/10 text-orange-500 border-orange-500/20' :
                                                'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                                        {item.impact}
                                    </span>
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
            <div className="p-3 border-t border-slate-800/50 bg-slate-950/30 text-center">
                <p className="text-[10px] text-slate-600 font-mono">
                    Sources: BLS, FRED, Federal Reserve (Simulated Data)
                </p>
            </div>
        </div>
    );
};
