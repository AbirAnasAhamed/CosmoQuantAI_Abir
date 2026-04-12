import React from 'react';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { ResponsiveContainer, PieChart, Pie, Cell, Tooltip } from 'recharts';
import { SentimentLabel, SentimentSource } from '@/types';
import { useTheme } from '@/context/ThemeContext';

const PIE_COLORS = { 'Positive': '#10B981', 'Negative': '#F43F5E', 'Neutral': '#64748B' };

interface SentimentSignalAnalysisProps {
    sourceBreakdownData: { name: string; value: number }[];
    sentimentSources: SentimentSource[];
    aiSummary: string;
    isSummaryLoading: boolean;
    selectedProvider: string;
    setSelectedProvider: (provider: string) => void;
    onGenerateSummary: () => void;
}

export const SentimentSignalAnalysis: React.FC<SentimentSignalAnalysisProps> = ({
    sourceBreakdownData,
    sentimentSources,
    aiSummary,
    isSummaryLoading,
    selectedProvider,
    setSelectedProvider,
    onGenerateSummary
}) => {
    const { theme } = useTheme();
    const getSentimentColor = (sentiment: SentimentLabel) => PIE_COLORS[sentiment] || '#64748B';

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <Card className="flex flex-col">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">Signal Sources</h3>
                <div className="flex items-center justify-between h-full">
                    <div className="h-48 w-48 relative">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={sourceBreakdownData}
                                    dataKey="value"
                                    nameKey="name"
                                    cx="50%"
                                    cy="50%"
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={5}
                                    stroke="none"
                                >
                                    {sourceBreakdownData.map(entry => <Cell key={`cell-${entry.name}`} fill={getSentimentColor(entry.name as SentimentLabel)} />)}
                                </Pie>
                                <Tooltip />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                            <div className="text-center">
                                <p className="text-2xl font-bold text-slate-900 dark:text-white">{sentimentSources.length}</p>
                                <p className="text-[10px] text-gray-500 uppercase">Signals</p>
                            </div>
                        </div>
                    </div>
                    <div className="flex-1 ml-8 space-y-3">
                        {sourceBreakdownData.map(entry => (
                            <div key={entry.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: getSentimentColor(entry.name as SentimentLabel) }}></div>
                                    <span className="text-sm font-medium text-gray-600 dark:text-gray-300">{entry.name}</span>
                                </div>
                                <span className="text-sm font-bold text-slate-900 dark:text-white">{entry.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </Card>

            <Card className="flex flex-col bg-slate-900 border-slate-800 relative overflow-hidden">
                <div className="absolute inset-0 bg-[linear-gradient(rgba(18,16,16,0)_50%,rgba(0,0,0,0.25)_50%),linear-gradient(90deg,rgba(255,0,0,0.06),rgba(0,255,0,0.02),rgba(0,0,255,0.06))] z-0 pointer-events-none bg-[length:100%_2px,3px_100%]"></div>

                <div className="relative z-10 flex flex-col h-full">
                    <div className="flex justify-between items-center mb-4">
                        <h3 className="text-lg font-bold text-white flex items-center gap-2">
                            <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse"></span>
                            AI Intelligence Stream
                        </h3>

                        <div className="flex items-center gap-2">
                            <select
                                value={selectedProvider}
                                onChange={(e) => setSelectedProvider(e.target.value)}
                                className="bg-slate-800 text-white text-xs border border-slate-700 rounded px-2 py-1 outline-none focus:border-blue-500 cursor-pointer"
                            >
                                <option value="gemini">Gemini 2.5</option>
                                <option value="openai">GPT-4o</option>
                                <option value="deepseek">DeepSeek V3</option>
                            </select>

                            <Button size="sm" variant="outline" className="text-xs border-blue-500/50 text-blue-400 hover:bg-blue-500/10" onClick={onGenerateSummary} disabled={isSummaryLoading}>
                                {isSummaryLoading ? 'Analyzing...' : 'Synthesize'}
                            </Button>
                        </div>
                    </div>

                    <div className="flex-grow bg-black/40 rounded-xl p-4 border border-white/5 font-mono text-sm text-blue-300 overflow-y-auto custom-scrollbar min-h-[150px]">
                        {isSummaryLoading ? (
                            <div className="flex items-center gap-2">
                                <span className="animate-bounce">.</span>
                                <span className="animate-bounce [animation-delay:0.1s]">.</span>
                                <span className="animate-bounce [animation-delay:0.2s]">.</span>
                                <span>Processing Neural Data via {selectedProvider.toUpperCase()}...</span>
                            </div>
                        ) : aiSummary ? (
                            <div className="animate-fade-in-up">
                                <span className="text-blue-500 mr-2">{">"}</span>
                                {aiSummary}
                                <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse align-middle"></span>
                            </div>
                        ) : (
                            <div className="text-gray-500 italic">
                                <span className="text-blue-500 mr-2">{">"}</span>
                                System Ready. Awaiting command to analyze market sentiment.
                                <span className="inline-block w-2 h-4 bg-blue-500 ml-1 animate-pulse align-middle"></span>
                            </div>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};
