import React from 'react';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { Loader2, RefreshCw, Maximize2 } from 'lucide-react';
import { ResponsiveContainer, Treemap, Tooltip } from 'recharts';
import { SentimentHeatmapItem } from '@/types';

const ModernHeatmapContent = (props: any) => {
    const { x, y, width, height, name, sentimentScore, marketCap } = props;
    const score = typeof sentimentScore === 'number' ? sentimentScore : 0;

    if (!width || !height || width < 0 || height < 0) return null;

    // Dynamic Styling based on Score
    let gradient = "from-slate-700/50 to-slate-900/90";
    let borderColor = "border-slate-600/30";
    let textColor = "text-slate-200";
    let scoreColor = "text-slate-400";

    if (score > 0.5) {
        gradient = "from-emerald-500/30 via-emerald-600/20 to-emerald-900/90";
        borderColor = "border-emerald-500/50";
        textColor = "text-emerald-100";
        scoreColor = "text-emerald-400";
    } else if (score > 0.1) {
        gradient = "from-teal-500/20 via-teal-600/10 to-slate-900/90";
        borderColor = "border-teal-500/40";
        textColor = "text-teal-50";
        scoreColor = "text-teal-400";
    } else if (score < -0.5) {
        gradient = "from-rose-500/30 via-rose-600/20 to-rose-900/90";
        borderColor = "border-rose-500/50";
        textColor = "text-rose-100";
        scoreColor = "text-rose-400";
    } else if (score < -0.1) {
        gradient = "from-orange-500/20 via-orange-600/10 to-slate-900/90";
        borderColor = "border-orange-500/40";
        textColor = "text-orange-50";
        scoreColor = "text-orange-400";
    }

    const showDetail = width > 60 && height > 50;
    const showMini = width > 30 && height > 30;

    return (
        <foreignObject x={x + 2} y={y + 2} width={width - 4} height={height - 4}>
            <div
                className={`w-full h-full rounded-xl border ${borderColor} bg-gradient-to-br ${gradient} backdrop-blur-md flex flex-col items-center justify-center transition-all duration-300 hover:scale-[0.98] hover:brightness-110 overflow-hidden relative group`}
            >
                <div className="absolute inset-0 opacity-10 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] mix-blend-overlay"></div>
                <div className="z-10 flex flex-col items-center text-center p-1">
                    {showMini && (
                        <span className={`font-black tracking-tighter ${width < 50 ? 'text-[10px]' : 'text-sm'} ${textColor} drop-shadow-md`}>
                            {name}
                        </span>
                    )}
                    {showDetail && (
                        <>
                            <span className={`text-[10px] font-mono mt-0.5 font-bold ${scoreColor}`}>
                                {score > 0 ? '+' : ''}{score.toFixed(2)}
                            </span>
                            <span className="text-[8px] opacity-60 text-white mt-1 uppercase tracking-widest scale-75">
                                {(marketCap / 1_000_000_000).toFixed(0)}B
                            </span>
                        </>
                    )}
                </div>
            </div>
        </foreignObject>
    );
};

interface SentimentHeatmapProps {
    heatmapData: SentimentHeatmapItem[];
    isHeatmapLoading: boolean;
    onSync: () => void;
}

export const SentimentHeatmap: React.FC<SentimentHeatmapProps> = ({ heatmapData, isHeatmapLoading, onSync }) => {
    return (
        <Card className="min-h-[450px] flex flex-col relative overflow-hidden border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-[#0B1121]/80 backdrop-blur-xl">
            <div className="flex flex-col md:flex-row justify-between items-center mb-6 gap-4 z-10">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white shadow-lg shadow-indigo-500/20">
                        <Maximize2 size={18} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold text-slate-900 dark:text-white tracking-tight">
                            Quantum Sentiment Map
                        </h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                            Visualizing Market Emotions & Capital Flow
                        </p>
                    </div>
                </div>
                <Button
                    variant="primary"
                    size="sm"
                    onClick={onSync}
                    disabled={isHeatmapLoading}
                    className="bg-brand-primary"
                >
                    {isHeatmapLoading ? <Loader2 className="animate-spin w-4 h-4" /> : <RefreshCw className="w-4 h-4" />}
                </Button>
            </div>

            <div className="flex-grow w-full h-[380px] min-h-[380px] bg-slate-100 dark:bg-[#0f1623] rounded-2xl p-1 overflow-hidden border border-slate-200 dark:border-slate-800/60 shadow-inner relative">
                {isHeatmapLoading && heatmapData.length === 0 ? (
                    <div className="absolute inset-0 flex flex-col items-center justify-center z-20 bg-white/80 dark:bg-[#0f1623]/80 backdrop-blur-sm">
                        <Loader2 className="animate-spin w-8 h-8 text-brand-primary" />
                        <p className="text-xs font-mono text-brand-primary mt-4">INITIALIZING NEURAL GRID...</p>
                    </div>
                ) : (
                    <ResponsiveContainer width="100%" height="100%">
                        <Treemap
                            data={heatmapData}
                            dataKey="marketCap"
                            aspectRatio={4 / 3}
                            stroke="transparent"
                            fill="#8884d8"
                            content={<ModernHeatmapContent />}
                            animationDuration={800}
                        >
                            <Tooltip
                                cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 2 }}
                                content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                        const data = payload[0].payload;
                                        return (
                                            <div className="bg-white/95 dark:bg-[#0F172A]/95 backdrop-blur-xl p-4 rounded-xl shadow-2xl border border-slate-100 dark:border-slate-700 min-w-[200px]">
                                                <h4 className="text-lg font-black text-slate-800 dark:text-white">{data.name}</h4>
                                                <p>{data.sentimentScore}</p>
                                            </div>
                                        );
                                    }
                                    return null;
                                }}
                            />
                        </Treemap>
                    </ResponsiveContainer>
                )}
            </div>
        </Card>
    );
};
