import React from 'react';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';

interface SentimentNarrativesProps {
    narratives: string[];
    wordCloud: { text: string; weight: number }[];
    isNarrativeLoading: boolean;
    hasNarrativesLoaded: boolean;
    onGenerateNarratives: () => void;
    onWordClick: (word: string) => void;
    selectedWord: string | null;
}

export const SentimentNarratives: React.FC<SentimentNarrativesProps> = ({
    narratives,
    wordCloud,
    isNarrativeLoading,
    hasNarrativesLoaded,
    onGenerateNarratives,
    onWordClick,
    selectedWord
}) => {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <Card className="lg:col-span-2 relative overflow-hidden min-h-[250px] flex flex-col">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500"></div>

                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="p-1 bg-blue-100 dark:bg-blue-900 rounded text-blue-500">☁️</span>
                        Market Mindshare (Narrative Cloud)
                    </h3>

                    <Button
                        onClick={onGenerateNarratives}
                        disabled={isNarrativeLoading}
                        variant="primary"
                        size="sm"
                        className="flex items-center gap-2"
                    >
                        {isNarrativeLoading ? (
                            <>
                                <span className="animate-spin">⏳</span> Detecting...
                            </>
                        ) : (
                            <>
                                <span>⚡</span> Generate Narratives
                            </>
                        )}
                    </Button>
                </div>

                {!hasNarrativesLoaded && !isNarrativeLoading ? (
                    <div className="flex flex-col items-center justify-center flex-grow text-center text-gray-500 p-8 opacity-70">
                        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-full mb-3">
                            <span className="text-4xl">🧠</span>
                        </div>
                        <p className="font-medium">AI Narrative Engine is Ready</p>
                        <p className="text-xs max-w-xs mt-1">Click "Generate Narratives" to analyze millions of data points and detect emerging trends.</p>
                    </div>
                ) : isNarrativeLoading ? (
                    <div className="flex flex-col items-center justify-center h-40 text-gray-400 animate-pulse">
                        <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mb-3"></div>
                        Analyzing Global Sentiment Data...
                    </div>
                ) : (
                    <div className="flex flex-wrap items-center justify-center gap-4 p-4 animate-fade-in-up">
                        {wordCloud.map((word, i) => {
                            const isSelected = word.text === selectedWord;
                            const fontSize = Math.max(0.8, word.weight / 20) + 'rem';
                            const opacity = isSelected ? 1 : Math.max(0.5, word.weight / 100);

                            // Dynamic Class based on weight AND selection
                            let colorClass = 'text-gray-500 dark:text-gray-400';
                            if (isSelected) {
                                colorClass = 'text-blue-600 dark:text-blue-400 font-bold scale-110 drop-shadow-md z-10';
                            } else if (word.weight > 80) {
                                colorClass = 'text-brand-primary font-bold';
                            } else if (word.weight > 60) {
                                colorClass = 'text-blue-500 font-semibold';
                            }

                            return (
                                <span
                                    key={i}
                                    onClick={() => onWordClick(word.text)}
                                    className={`transition-all duration-300 hover:scale-110 cursor-pointer ${colorClass} ${isSelected ? 'underline decoration-blue-500 decoration-2 underline-offset-4' : ''}`}
                                    style={{ fontSize: fontSize, opacity: opacity }}
                                >
                                    {word.text}
                                </span>
                            );
                        })}
                        {wordCloud.length === 0 && <p className="text-gray-400 text-sm">No trending keywords detected.</p>}
                    </div>
                )}
            </Card>

            <Card className="lg:col-span-1 bg-gradient-to-br from-slate-50 to-white dark:from-slate-900 dark:to-slate-800 border-l-4 border-l-purple-500">
                <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-4">🔥 Top Narratives</h3>

                {!hasNarrativesLoaded && !isNarrativeLoading ? (
                    <div className="flex items-center justify-center h-full text-gray-400 text-sm italic">
                        Waiting for analysis...
                    </div>
                ) : isNarrativeLoading ? (
                    <div className="space-y-3">
                        {[1, 2, 3].map(i => <div key={i} className="h-16 bg-gray-200 dark:bg-gray-700 rounded animate-pulse"></div>)}
                    </div>
                ) : (
                    <div className="space-y-4 animate-fade-in-right">
                        {narratives.map((narrative, index) => (
                            <div key={index} className="flex gap-3 items-start group">
                                <div className="flex-shrink-0 w-6 h-6 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 flex items-center justify-center font-bold text-xs border border-purple-200 dark:border-purple-800 mt-0.5">
                                    {index + 1}
                                </div>
                                <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed group-hover:text-purple-600 dark:group-hover:text-purple-400 transition-colors">
                                    {narrative}
                                </p>
                            </div>
                        ))}
                        {narratives.length === 0 && <p className="text-gray-400 text-sm">No narratives extracted.</p>}
                    </div>
                )}
            </Card>
        </div>
    );
};
