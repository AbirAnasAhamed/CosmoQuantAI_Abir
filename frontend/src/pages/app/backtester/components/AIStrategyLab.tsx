import React from 'react';
import CodeEditor from '@/components/common/CodeEditor';
import {
    Sparkles,
    Code2,
    Save,
    UploadCloud,
    FileCode2,
    Cpu,
    Zap,
    PlayCircle
} from 'lucide-react';

interface AIStrategyLabProps {
    aiPrompt: string;
    setAiPrompt: (p: string) => void;
    handleAiGenerate: () => void;
    isGenerating: boolean;
    fileInputRef: React.RefObject<HTMLInputElement>;
    handleFileChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    handleUpload: () => void;
    fileName: string;
    strategy: string;
    currentStrategyCode: string;
    setCurrentStrategyCode: (code: string) => void;
}

export const AIStrategyLab: React.FC<AIStrategyLabProps> = ({
    aiPrompt,
    setAiPrompt,
    handleAiGenerate,
    isGenerating,
    fileInputRef,
    handleFileChange,
    handleUpload,
    fileName,
    strategy,
    currentStrategyCode,
    setCurrentStrategyCode
}) => {
    // Quick suggestion chips for better UX
    const suggestions = [
        "SMA Crossover Strategy",
        "RSI & Bollinger Bands",
        "MACD Trend Following"
    ];

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-fade-in h-[calc(100vh-140px)] min-h-[600px]">
            {/* Left Panel: AI Control Center */}
            <div className="lg:col-span-4 flex flex-col gap-4 h-full">

                {/* AI Input Card */}
                <div className="flex-1 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 rounded-2xl p-5 shadow-xl flex flex-col relative overflow-hidden group">
                    {/* Decorative Background Gradient */}
                    <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 via-pink-500 to-blue-500"></div>
                    <div className="absolute -right-10 -top-10 w-32 h-32 bg-purple-500/10 blur-3xl rounded-full pointer-events-none"></div>

                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-gradient-to-br from-purple-600 to-blue-600 rounded-lg shadow-lg shadow-purple-500/20">
                            <Sparkles className="text-white w-5 h-5 animate-pulse" />
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">AI Architect</h2>
                            <p className="text-[10px] font-medium text-purple-600 dark:text-purple-400 uppercase tracking-wider">Powered by Gemini</p>
                        </div>
                    </div>

                    <p className="text-sm text-slate-600 dark:text-slate-400 mb-3">
                        Describe your strategy logic. The AI will code it for you.
                    </p>

                    <div className="relative flex-1 flex flex-col">
                        <textarea
                            value={aiPrompt}
                            onChange={(e) => setAiPrompt(e.target.value)}
                            placeholder="Example: Buy when EMA(50) crosses above EMA(200) and RSI < 30..."
                            className="flex-1 w-full bg-slate-50 dark:bg-[#0f111a] border border-gray-200 dark:border-gray-700/50 rounded-xl p-4 text-sm text-slate-900 dark:text-slate-200 focus:ring-2 focus:ring-purple-500/50 focus:border-purple-500 transition-all resize-none shadow-inner font-mono"
                        />

                        {/* Suggestion Chips */}
                        <div className="absolute bottom-3 left-3 right-3 flex gap-2 overflow-x-auto pb-1 no-scrollbar">
                            {suggestions.map((s, i) => (
                                <button
                                    key={i}
                                    onClick={() => setAiPrompt(s)}
                                    className="whitespace-nowrap px-2 py-1 bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 rounded-md text-[10px] text-gray-500 hover:text-purple-500 hover:border-purple-500 transition-colors"
                                >
                                    {s}
                                </button>
                            ))}
                        </div>
                    </div>

                    <button
                        onClick={handleAiGenerate}
                        disabled={isGenerating}
                        className="mt-4 w-full relative group overflow-hidden rounded-xl bg-slate-900 dark:bg-white text-white dark:text-slate-900 font-bold py-3.5 shadow-lg hover:shadow-purple-500/25 transition-all active:scale-[0.98] disabled:opacity-70 disabled:cursor-not-allowed"
                    >
                        <div className="absolute inset-0 w-full h-full bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:animate-shimmer" />
                        <span className="flex items-center justify-center gap-2">
                            {isGenerating ? (
                                <><Cpu className="animate-spin w-4 h-4" /> Processing Logic...</>
                            ) : (
                                <><Zap className="w-4 h-4 text-yellow-400" /> Generate Strategy Code</>
                            )}
                        </span>
                    </button>
                </div>

                {/* Upload Section (Compact & Stylish) */}
                <div className="bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl border border-white/20 dark:border-gray-700/50 rounded-2xl p-4 shadow-lg flex flex-col justify-center">
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                            <UploadCloud className="w-4 h-4 text-blue-500" /> Import Code
                        </h3>
                    </div>

                    <div className="flex gap-2 items-center">
                        <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".py" />

                        <div className="flex-1 border border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-2 flex items-center justify-center cursor-pointer hover:bg-gray-50 dark:hover:bg-slate-800/50 transition-colors" onClick={() => fileInputRef.current?.click()}>
                            <span className="text-xs text-gray-500 truncate max-w-[150px]">
                                {fileName || "Select .py file"}
                            </span>
                        </div>

                        <button
                            onClick={handleUpload}
                            disabled={!fileName}
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-xs font-bold disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                        >
                            Upload
                        </button>
                    </div>
                </div>
            </div>

            {/* Right Panel: Code Editor (IDE Style) */}
            <div className="lg:col-span-8 h-full">
                <div className="h-full bg-[#1e1e1e] rounded-2xl border border-gray-800 shadow-2xl overflow-hidden flex flex-col relative group">
                    {/* IDE Header */}
                    <div className="h-10 bg-[#252526] border-b border-[#333] flex items-center justify-between px-4 select-none">
                        <div className="flex items-center gap-2">
                            <div className="flex gap-1.5">
                                <div className="w-3 h-3 rounded-full bg-red-500/80" />
                                <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
                                <div className="w-3 h-3 rounded-full bg-green-500/80" />
                            </div>
                            <div className="ml-4 flex items-center gap-2 px-3 py-1 bg-[#1e1e1e] rounded-t-md border-t border-x border-[#333] text-xs text-blue-400 font-mono">
                                <FileCode2 size={12} />
                                {strategy || 'strategy'}.py
                            </div>
                        </div>

                        <div className="flex items-center gap-3">
                            <span className="text-[10px] text-gray-500 uppercase tracking-wider font-bold">Python 3.10</span>
                            <button className="flex items-center gap-1.5 px-3 py-1 rounded bg-blue-600/20 text-blue-400 hover:bg-blue-600/30 text-xs font-medium transition-colors border border-blue-600/30">
                                <Save size={12} /> Save
                            </button>
                        </div>
                    </div>

                    {/* Editor Area */}
                    <div className="flex-1 relative font-mono text-sm bg-[#1e1e1e]">
                        <CodeEditor
                            value={currentStrategyCode}
                            onChange={setCurrentStrategyCode}
                            language="python"
                        />

                        {/* Status Bar */}
                        <div className="absolute bottom-0 left-0 right-0 h-6 bg-[#007acc] text-white text-[10px] flex items-center px-3 justify-between z-10 opacity-90">
                            <div className="flex gap-4">
                                <span>main*</span>
                                <span className="flex items-center gap-1"><Code2 size={10} /> Python</span>
                            </div>
                            <div>
                                Ln 1, Col 1
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};
