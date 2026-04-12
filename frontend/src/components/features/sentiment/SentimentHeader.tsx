import React from 'react';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { Loader2, RefreshCw } from 'lucide-react';
import { EntityAnalysisWidget } from '@/components/features/sentiment/EntityAnalysisWidget';
import AssetSearchControl from '@/components/common/AssetSearchControl';
import { DigitalClock } from '@/components/common/DigitalClock';
// import { pairs } from '@/hooks/useSentimentEngine'; // Removed

interface SentimentHeaderProps {
    activePair: string;
    setActivePair: (pair: string) => void;
    activeExchange: string;
    setActiveExchange: (exchange: string) => void;
    onRefresh: () => void;
    isSyncing?: boolean;
    isNerEnabled: boolean;
    setIsNerEnabled: (enabled: boolean) => void;
    nerData: any;
    isNerLoading: boolean;
    aiModel: 'vader' | 'finbert';
    setAiModel: (model: 'vader' | 'finbert') => void;
    chartData?: any[];
    sentimentSources?: any[];
}

export const SentimentHeader: React.FC<SentimentHeaderProps> = ({
    activePair,
    setActivePair,
    activeExchange,
    setActiveExchange,
    onRefresh,
    isSyncing,
    isNerEnabled,
    setIsNerEnabled,
    nerData,
    isNerLoading,
    aiModel,
    setAiModel,
    chartData,
    sentimentSources
}) => {
    const [isExportOpen, setIsExportOpen] = React.useState(false);
    const exportRef = React.useRef<HTMLDivElement>(null);

    React.useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (exportRef.current && !exportRef.current.contains(event.target as Node)) {
                setIsExportOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleExportCSV = (type: 'chart' | 'news') => {
        if (type === 'chart' && chartData) {
            import('@/utils/exportUtils').then(({ downloadCSV }) => {
                downloadCSV(chartData, `sentiment_chart_data_${activePair}_${new Date().toISOString().split('T')[0]}`);
            });
        } else if (type === 'news' && sentimentSources) {
            import('@/utils/exportUtils').then(({ downloadCSV }) => {
                downloadCSV(sentimentSources, `news_feed_data_${activePair}_${new Date().toISOString().split('T')[0]}`);
            });
        }
        setIsExportOpen(false);
    };

    const handlePrint = () => {
        window.print();
        setIsExportOpen(false);
    };

    return (
        <div className="space-y-4">
            <Card className="!p-4 flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-brand-primary/10 flex items-center justify-center text-brand-primary animate-pulse">
                        <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" /></svg>
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
                            Sentiment Engine V2
                            <div className="hidden md:block w-px h-6 bg-slate-300 dark:bg-slate-700 mx-2"></div>
                            <DigitalClock className="text-lg text-blue-600 dark:text-blue-400" />
                        </h2>
                        <p className="text-xs text-gray-500 dark:text-gray-400">Real-time social volume & momentum analysis</p>
                    </div>
                </div>

                <div className="flex items-center gap-4">
                    <div className="relative" ref={exportRef}>
                        <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => setIsExportOpen(!isExportOpen)}
                            className="flex items-center gap-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                            Export
                        </Button>

                        {isExportOpen && (
                            <div className="absolute right-0 mt-2 w-56 bg-white dark:bg-slate-800 rounded-lg shadow-xl border border-slate-200 dark:border-slate-700 z-50 overflow-hidden">
                                <button
                                    onClick={() => handleExportCSV('chart')}
                                    className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><line x1="16" y1="13" x2="8" y2="13"></line><line x1="16" y1="17" x2="8" y2="17"></line><polyline points="10 9 9 9 8 9"></polyline></svg>
                                    Download Chart Data (CSV)
                                </button>
                                <button
                                    onClick={() => handleExportCSV('news')}
                                    className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors border-t border-slate-100 dark:border-slate-700"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline><path d="M16 13H8"></path><path d="M16 17H8"></path><path d="M10 9H8"></path></svg>
                                    Download News Feed (CSV)
                                </button>
                                <button
                                    onClick={handlePrint}
                                    className="w-full text-left px-4 py-3 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700 flex items-center gap-2 transition-colors border-t border-slate-100 dark:border-slate-700"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
                                    Print / Save as PDF
                                </button>
                            </div>
                        )}
                    </div>

                    <Button
                        variant="primary"
                        size="sm"
                        onClick={onRefresh}
                        disabled={isSyncing}
                        className="bg-brand-primary hover:bg-brand-primary-hover text-white shadow-lg shadow-brand-primary/20"
                    >
                        {isSyncing ? (
                            <span className="flex items-center gap-2">
                                <Loader2 className="animate-spin w-4 h-4" /> Syncing...
                            </span>
                        ) : (
                            <span className="flex items-center gap-2">
                                <RefreshCw className="w-4 h-4" /> Sync Data
                            </span>
                        )}
                    </Button>
                </div>
            </Card>

            {/* Smart Analysis Toggle & Widget */}
            <div className="flex flex-col gap-4">
                <div className="flex items-center justify-between px-2">
                    <div className="flex items-center gap-3">
                        <AssetSearchControl
                            activeExchange={activeExchange}
                            setActiveExchange={setActiveExchange}
                            activePair={activePair}
                            setActivePair={setActivePair}
                        />
                    </div>

                    <div className="flex items-center gap-4">
                        {/* Model Toggle */}
                        <div className="flex items-center bg-slate-100 dark:bg-slate-800 p-1 rounded-lg">
                            <button
                                onClick={() => setAiModel('vader')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${aiModel === 'vader'
                                    ? 'bg-white dark:bg-slate-700 text-green-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                    }`}
                            >
                                🚀 Eco (VADER)
                            </button>
                            <button
                                onClick={() => setAiModel('finbert')}
                                className={`px-3 py-1.5 text-xs font-bold rounded-md flex items-center gap-2 transition-all ${aiModel === 'finbert'
                                    ? 'bg-white dark:bg-slate-700 text-purple-600 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                                    }`}
                            >
                                🧠 Pro (FinBERT)
                            </button>
                        </div>

                        <div className="flex items-center gap-2">
                            <span className={`text-sm font-semibold ${isNerEnabled ? 'text-indigo-500' : 'text-slate-500'}`}>
                                Deep Entity Analysis (AI)
                            </span>
                            <button
                                onClick={() => setIsNerEnabled(!isNerEnabled)}
                                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${isNerEnabled ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700'
                                    }`}
                            >
                                <span
                                    className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${isNerEnabled ? 'translate-x-6' : 'translate-x-1'
                                        }`}
                                />
                            </button>
                        </div>
                    </div>
                </div>

                {/* Entity Widget */}
                {isNerEnabled && nerData && (
                    <EntityAnalysisWidget data={nerData} isLoading={isNerLoading} />
                )}
            </div>
        </div>
    );
};
