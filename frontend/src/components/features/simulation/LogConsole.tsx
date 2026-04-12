import React, { useEffect, useRef, useState } from 'react';
import { Terminal, Trash2, Filter, ChevronDown, Check, AlertTriangle, Info, XCircle } from 'lucide-react';
import Button from '@/components/common/Button';

export interface LogMessage {
    timestamp: string;
    level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';
    message: string;
    metadata?: any;
}

interface LogConsoleProps {
    logs: LogMessage[];
    onClear: () => void;
    className?: string;
}

const LogConsole: React.FC<LogConsoleProps> = ({ logs, onClear, className }) => {
    const endRef = useRef<HTMLDivElement>(null);
    const [filter, setFilter] = useState<'ALL' | 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR'>('ALL');
    const [autoScroll, setAutoScroll] = useState(true);

    // Auto-scroll logic
    useEffect(() => {
        if (autoScroll) {
            endRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll, filter]);

    const filteredLogs = logs.filter(log => {
        if (filter === 'ALL') return true;
        return log.level === filter;
    });

    const getLevelColor = (level: string) => {
        switch (level) {
            case 'SUCCESS': return 'text-emerald-400';
            case 'WARNING': return 'text-amber-400';
            case 'ERROR': return 'text-red-500';
            case 'INFO': default: return 'text-slate-400';
        }
    };

    const getLevelIcon = (level: string) => {
        switch (level) {
            case 'SUCCESS': return <Check size={14} />;
            case 'WARNING': return <AlertTriangle size={14} />;
            case 'ERROR': return <XCircle size={14} />;
            case 'INFO': default: return <Info size={14} />;
        }
    };

    const formatTime = (isoString: string) => {
        try {
            const date = new Date(isoString);
            return date.toLocaleTimeString([], { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
        } catch (e) {
            return isoString;
        }
    };

    return (
        <div className={`flex flex-col bg-black border border-slate-800 rounded-lg shadow-2xl overflow-hidden font-mono text-sm ${className}`}>
            {/* Header / Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800 backdrop-blur">
                <div className="flex items-center gap-2 text-slate-300 font-semibold">
                    <Terminal size={16} className="text-brand-primary" />
                    <span>System Console</span>
                    <span className="text-xs text-slate-500 ml-2">({filteredLogs.length} events)</span>
                </div>

                <div className="flex items-center gap-2">
                    {/* Filter Dropdown (Simplified as buttons for now) */}
                    <div className="flex bg-slate-800 rounded-md p-0.5">
                        {(['ALL', 'INFO', 'SUCCESS', 'WARNING', 'ERROR'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setFilter(f)}
                                className={`px-3 py-1 text-xs rounded transition-colors ${filter === f ? 'bg-slate-700 text-white shadow-sm' : 'text-slate-500 hover:text-slate-300'}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>

                    <div className="h-4 w-[1px] bg-slate-800 mx-1"></div>

                    <button
                        onClick={() => setAutoScroll(!autoScroll)}
                        className={`text-xs px-2 py-1 rounded border ${autoScroll ? 'bg-brand-primary/10 border-brand-primary/30 text-brand-primary' : 'bg-transparent border-transparent text-slate-500 hover:text-slate-300'}`}
                    >
                        {autoScroll ? 'Scroll: ON' : 'Scroll: OFF'}
                    </button>

                    <Button
                        onClick={onClear}
                        variant="ghost"
                        size="sm"
                        className="text-slate-500 hover:text-red-400 p-1 h-auto"
                        title="Clear console"
                    >
                        <Trash2 size={16} />
                    </Button>
                </div>
            </div>

            {/* Log Output */}
            <div className="flex-1 overflow-y-auto p-4 space-y-1 custom-scrollbar bg-black/90 tracking-tight">
                {logs.length === 0 && (
                    <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50 select-none">
                        <Terminal size={48} className="mb-4" />
                        <p>Waiting for simulation events...</p>
                    </div>
                )}

                {filteredLogs.map((log, i) => (
                    <div key={i} className={`flex gap-3 hover:bg-slate-900/30 px-1 rounded ${getLevelColor(log.level)}`}>
                        <span className="text-slate-600 shrink-0 select-none w-24 text-right">[{formatTime(log.timestamp)}]</span>
                        <span className="shrink-0 mt-0.5 opacity-80">{getLevelIcon(log.level)}</span>
                        <span className="break-all whitespace-pre-wrap">{log.message}</span>
                    </div>
                ))}
                <div ref={endRef} />
            </div>
        </div>
    );
};

export default LogConsole;
