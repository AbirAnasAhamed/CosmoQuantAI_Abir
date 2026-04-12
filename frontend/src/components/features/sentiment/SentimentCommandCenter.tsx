import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import Card from '@/components/common/Card';
import Button from '@/components/common/Button';
import { Loader2, RefreshCw, TrendingUp, Newspaper, Activity, Fish, FileText, Smartphone, X, BrainCircuit, GripVertical, Globe } from 'lucide-react';

interface SentimentCommandCenterProps {
    report: {
        score_analysis: string;
        news_summary: string;
        correlation_insight: string;
        whale_insight: string;
        executive_summary: string;
    } | null;
    isLoading: boolean;
    onGenerate: (language: 'en' | 'bn') => void;
}

export const SentimentCommandCenter: React.FC<SentimentCommandCenterProps> = ({
    report,
    isLoading,
    onGenerate
}) => {
    const [isOpen, setIsOpen] = useState(false);
    const [language, setLanguage] = useState<'en' | 'bn'>('en');

    // Draggable State
    const [position, setPosition] = useState({ x: window.innerWidth - 100, y: 125 }); // Default above Alpha Scanner
    const [isDragging, setIsDragging] = useState(false);
    const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
    const buttonRef = useRef<HTMLButtonElement>(null);

    // Load saved position from localStorage
    useEffect(() => {
        const savedPos = localStorage.getItem('sentimentWidgetPos_v2');
        if (savedPos) {
            try {
                setPosition(JSON.parse(savedPos));
            } catch (e) {
                // Invalid JSON, ignore
            }
        }
    }, []);

    // Global Mouse Listeners for Dragging
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            if (isDragging) {
                const newX = e.clientX - dragOffset.x;
                const newY = e.clientY - dragOffset.y;

                // Boundary checks (keep button on screen)
                const maxX = window.innerWidth - 80;
                const maxY = window.innerHeight - 80;

                setPosition({
                    x: Math.max(0, Math.min(newX, maxX)),
                    y: Math.max(0, Math.min(newY, maxY))
                });
            }
        };

        const handleMouseUp = () => {
            if (isDragging) {
                setIsDragging(false);
                // Save final position
                localStorage.setItem('sentimentWidgetPos_v2', JSON.stringify(position));
            }
        };

        if (isDragging) {
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isDragging, dragOffset, position]);

    const handleMouseDown = (e: React.MouseEvent) => {
        if (buttonRef.current) {
            const rect = buttonRef.current.getBoundingClientRect();
            setDragOffset({
                x: e.clientX - rect.left,
                y: e.clientY - rect.top
            });
            setIsDragging(true);
        }
    };

    // prevent click if it was a drag
    const handleClick = (e: React.MouseEvent) => {
        setIsOpen(true);
    };

    const handleGenerate = () => {
        onGenerate(language);
    };

    const sections = [
        {
            title: 'Sentiment Score Analysis',
            icon: <TrendingUp className="w-5 h-5 text-blue-500" />,
            content: report?.score_analysis,
            color: 'border-blue-500/20'
        },
        {
            title: 'News Narrative',
            icon: <Newspaper className="w-5 h-5 text-purple-500" />,
            content: report?.news_summary,
            color: 'border-purple-500/20'
        },
        {
            title: 'Correlation Insight',
            icon: <Activity className="w-5 h-5 text-green-500" />,
            content: report?.correlation_insight,
            color: 'border-green-500/20'
        },
        {
            title: 'Whale Activity',
            icon: <Fish className="w-5 h-5 text-amber-500" />,
            content: report?.whale_insight,
            color: 'border-amber-500/20'
        }
    ];

    // Main Floating Button Component (Now rendered via Portal)
    const FloatingButton = (
        <button
            ref={buttonRef}
            onMouseDown={handleMouseDown}
            onClick={handleClick}
            style={{
                left: `${position.x}px`,
                top: `${position.y}px`,
                cursor: isDragging ? 'grabbing' : 'grab',
                touchAction: 'none'
            }}
            className={`fixed z-[100] w-16 h-16 bg-gradient-to-br from-indigo-600 to-purple-700 rounded-full shadow-2xl flex items-center justify-center text-white transition-shadow duration-300 border-4 border-white/20 group animate-in zoom-in ${isDragging ? 'scale-110 shadow-indigo-500/50' : 'hover:scale-105 active:scale-95'}`}
            title="Open AI Command Center (Drag to move)"
        >
            <BrainCircuit className="w-8 h-8 pointer-events-none group-hover:rotate-12 transition-transform" />

            {/* Drag Indicator hint */}
            <div className="absolute -right-1 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-50 transition-opacity">
                <GripVertical className="w-4 h-4 text-white" />
            </div>

            {/* Ping animation to draw attention if no report */}
            {!report && !isLoading && (
                <span className="absolute top-0 right-0 w-4 h-4 bg-red-500 rounded-full border-2 border-white animate-pulse pointer-events-none"></span>
            )}
        </button>
    );

    // Modal Component
    const Modal = (
        <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[110] flex items-center justify-center p-4 animate-in fade-in duration-200"
            onClick={() => setIsOpen(false)}
        >
            <div
                className="bg-white dark:bg-slate-900 w-full max-w-5xl max-h-[90vh] rounded-3xl shadow-2xl border border-white/10 overflow-hidden flex flex-col relative animate-in zoom-in-95 duration-200"
                onClick={e => e.stopPropagation()}
            >
                {/* Modal Header */}
                <div className="p-5 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between bg-slate-50 dark:bg-slate-800/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-indigo-500/10 rounded-xl">
                            <Smartphone className="w-6 h-6 text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100">
                                Interactive AI Command Center
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-2">
                                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                Real-time Market Narrative & Strategic Analysis
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3">
                        {/* Language Toggle */}
                        <div className="flex bg-slate-100 dark:bg-slate-800 rounded-lg p-1 mr-2">
                            <button
                                onClick={() => setLanguage('en')}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${language === 'en' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                EN
                            </button>
                            <button
                                onClick={() => setLanguage('bn')}
                                className={`px-3 py-1 rounded-md text-xs font-bold transition-all ${language === 'bn' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-400' : 'text-slate-500 hover:text-slate-700'}`}
                            >
                                BN
                            </button>
                        </div>

                        <Button
                            size="sm"
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-lg shadow-indigo-500/20"
                        >
                            {isLoading ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Analyzing...
                                </>
                            ) : (
                                <>
                                    <RefreshCw className="w-4 h-4 mr-2" />
                                    Generate Report
                                </>
                            )}
                        </Button>
                        <button
                            onClick={() => setIsOpen(false)}
                            className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 transition-colors"
                        >
                            <X className="w-6 h-6" />
                        </button>
                    </div>
                </div>

                {/* Modal Content - Scrollable */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                    {!report && !isLoading ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 dark:text-slate-400 min-h-[300px]">
                            <div className="p-6 bg-slate-100 dark:bg-slate-800 rounded-full mb-6">
                                <BrainCircuit className="w-16 h-16 text-indigo-400 opacity-50" />
                            </div>
                            <h4 className="text-xl font-semibold mb-2">Ready to Analyze</h4>
                            <p className="text-center max-w-md mb-8">
                                Generate a comprehensive market report combining sentiment, news, whale activity, and correlation logic.
                            </p>
                            <Button onClick={handleGenerate} className="bg-indigo-600 text-white px-8">
                                Start Analysis ({language === 'en' ? 'English' : 'Bengali'})
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-8">
                            {/* Executive Summary (Hero Section) */}
                            <div className="bg-gradient-to-r from-indigo-50 via-purple-50 to-indigo-50 dark:from-slate-800 dark:via-slate-800/80 dark:to-slate-800 p-6 rounded-2xl border border-indigo-100 dark:border-slate-700 relative overflow-hidden shadow-sm">
                                <div className="absolute top-0 right-0 p-4 opacity-5">
                                    <FileText className="w-32 h-32 text-indigo-600" />
                                </div>
                                <h4 className="text-sm font-bold text-indigo-900 dark:text-indigo-200 uppercase tracking-wider mb-4 flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>
                                    Executive Summary
                                </h4>
                                <p className="text-lg text-slate-800 dark:text-slate-200 leading-relaxed font-medium relative z-10">
                                    {isLoading ? (
                                        <div className="space-y-2">
                                            <span className="animate-pulse block h-4 w-full bg-slate-200 dark:bg-slate-700 rounded"></span>
                                            <span className="animate-pulse block h-4 w-3/4 bg-slate-200 dark:bg-slate-700 rounded"></span>
                                        </div>
                                    ) : report?.executive_summary}
                                </p>
                            </div>

                            {/* Grid Sections */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                {sections.map((section, idx) => (
                                    <div
                                        key={idx}
                                        className={`p-6 rounded-2xl border ${section.color} bg-white dark:bg-slate-800/40 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm hover:shadow-md`}
                                    >
                                        <div className="flex items-center gap-3 mb-4">
                                            <div className={`p-2 rounded-lg ${section.color.replace('border-', 'bg-')}`}>
                                                {section.icon}
                                            </div>
                                            <h4 className="font-bold text-slate-700 dark:text-slate-200 text-lg">
                                                {section.title}
                                            </h4>
                                        </div>
                                        <div className="text-slate-600 dark:text-slate-400 leading-relaxed">
                                            {isLoading ? (
                                                <div className="space-y-2">
                                                    <span className="animate-pulse block h-3 w-full bg-slate-100 dark:bg-slate-700 rounded"></span>
                                                    <span className="animate-pulse block h-3 w-5/6 bg-slate-100 dark:bg-slate-700 rounded"></span>
                                                    <span className="animate-pulse block h-3 w-4/6 bg-slate-100 dark:bg-slate-700 rounded"></span>
                                                </div>
                                            ) : (
                                                section.content || "Data unavailable"
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );

    // Return both via portal
    return (
        <>
            {createPortal(FloatingButton, document.body)}
            {isOpen && createPortal(Modal, document.body)}
        </>
    );
};
