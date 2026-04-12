import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { ActiveBot } from '@/types';
import { useTheme } from '@/context/ThemeContext';
import { X, Play, Pause, RefreshCw, Terminal, Activity, AlertTriangle, CheckCircle, Info, Filter, Download, Trash2, Lock } from 'lucide-react';

// --- Types for Smart Logger ---
type LogLevel = 'INFO' | 'TRADE' | 'ERROR' | 'SYSTEM' | 'WARNING' | 'SUCCESS';

interface SmartLogEntry {
    id: string;
    timestamp: string;
    level: LogLevel;
    message: string;
    metadata?: Record<string, any>;
}

interface BotDetailsModalProps {
    bot: ActiveBot;
    onClose: () => void;
}

// --- Helper Components ---

// 1. Log Row Component (Individual Line)
const LogRow: React.FC<{ log: SmartLogEntry; index: number }> = ({ log, index }) => {
    const getLevelColor = (level: LogLevel) => {
        switch (level) {
            case 'TRADE': return 'text-emerald-400 bg-emerald-400/10 border-emerald-400/20';
            case 'ERROR': return 'text-red-400 bg-red-400/10 border-red-400/20';
            case 'WARNING': return 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20';
            case 'SYSTEM': return 'text-purple-400 bg-purple-400/10 border-purple-400/20';
            case 'SUCCESS': return 'text-blue-400 bg-blue-400/10 border-blue-400/20';
            default: return 'text-gray-300 hover:bg-gray-800';
        }
    };

    const getIcon = (level: LogLevel) => {
        switch (level) {
            case 'TRADE': return <Activity size={14} />;
            case 'ERROR': return <AlertTriangle size={14} />;
            case 'WARNING': return <AlertTriangle size={14} />;
            case 'SUCCESS': return <CheckCircle size={14} />;
            case 'SYSTEM': return <Terminal size={14} />;
            default: return <Info size={14} />;
        }
    };

    return (
        <div className={`flex items-start gap-3 p-2 rounded mb-1 text-xs font-mono transition-colors border-l-2 ${getLevelColor(log.level)} hover:bg-white/5`}>
            <span className="text-gray-500 min-w-[80px] select-none opacity-70">[{log.timestamp}]</span>
            <span className="mt-0.5 opacity-80">{getIcon(log.level)}</span>
            <span className="break-all flex-1 leading-relaxed">
                <span className="font-bold opacity-90 mr-2">[{log.level}]</span>
                {log.message}
            </span>
        </div>
    );
};

// --- Main Modal Component ---
const BotDetailsModal: React.FC<BotDetailsModalProps> = ({ bot, onClose }) => {
    const { theme } = useTheme();
    const [activeTab, setActiveTab] = useState<'overview' | 'config' | 'logs'>('overview');

    // Logger States
    const [logs, setLogs] = useState<SmartLogEntry[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<'Connecting' | 'Connected' | 'Disconnected'>('Connecting');
    const [latency, setLatency] = useState<number>(0);
    const [autoScroll, setAutoScroll] = useState(true);
    const [filter, setFilter] = useState<LogLevel | 'ALL'>('ALL');

    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const scrollContainerRef = useRef<HTMLDivElement>(null);

    // Auto Scroll Logic
    useEffect(() => {
        if (autoScroll && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, autoScroll, activeTab]);

    // WebSocket Connection
    useEffect(() => {
        if (activeTab === 'logs') {
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            const host = window.location.host; // Use dynamic host
            const wsUrl = `${protocol}//${host}/api/v1/bots/${bot.id}/ws/logs`;

            const ws = new WebSocket(wsUrl);
            wsRef.current = ws;

            ws.onopen = () => {
                setConnectionStatus('Connected');
                addLog('SYSTEM', 'Connected to real-time log stream...');
            };

            ws.onmessage = (event) => {
                try {
                    // Calculating Latency (Pseudo)
                    const start = performance.now();
                    const data = JSON.parse(event.data);

                    // Backend থেকে যদি সাধারণ স্ট্রিং আসে, সেটাকে SmartLogEntry তে কনভার্ট করা
                    const newLog: SmartLogEntry = {
                        id: Math.random().toString(36).substr(2, 9),
                        timestamp: data.time || new Date().toLocaleTimeString(),
                        level: data.type || 'INFO',
                        message: data.message || JSON.stringify(data),
                        metadata: data.metadata
                    };

                    setLogs(prev => [...prev, newLog]);
                    setLatency(Math.round(performance.now() - start));
                } catch (e) {
                    // Fallback for plain text
                    addLog('INFO', event.data);
                }
            };

            ws.onclose = () => {
                setConnectionStatus('Disconnected');
                addLog('ERROR', 'Connection lost. Reconnecting...');
            };

            return () => ws.close();
        }
    }, [activeTab, bot.id]);

    const addLog = (level: LogLevel, message: string) => {
        setLogs(prev => [...prev, {
            id: Date.now().toString(),
            timestamp: new Date().toLocaleTimeString(),
            level,
            message
        }]);
    };

    const filteredLogs = useMemo(() => {
        if (filter === 'ALL') return logs;
        return logs.filter(log => log.level === filter);
    }, [logs, filter]);

    const handleDownloadLogs = () => {
        const content = logs.map(l => `[${l.timestamp}] [${l.level}] ${l.message}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${bot.name}_logs_${new Date().toISOString()}.txt`;
        a.click();
    };

    return createPortal(
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[70] flex items-center justify-center p-4 animate-in fade-in duration-200" onClick={onClose}>
            <div className="bg-[#0f172a] w-full max-w-5xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden border border-gray-800 ring-1 ring-white/10" onClick={e => e.stopPropagation()}>

                {/* --- 1. Header Section --- */}
                <div className="h-16 px-6 border-b border-gray-800 bg-[#1e293b]/50 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={`p-2 rounded-lg ${bot.status === 'active' ? 'bg-emerald-500/10 text-emerald-500' : 'bg-gray-700/50 text-gray-400'}`}>
                            {bot.status === 'active' ? <Activity size={20} className="animate-pulse" /> : <Pause size={20} />}
                        </div>
                        <div>
                            <h2 className="text-lg font-bold text-white tracking-wide">{bot.name}</h2>
                            <div className="flex items-center gap-2 text-xs text-gray-400">
                                <span className="font-mono bg-gray-800 px-1.5 py-0.5 rounded text-gray-300">{bot.id}</span>
                                <span>•</span>
                                <span className="text-blue-400">{bot.market}</span>
                                <span>•</span>
                                <span>{bot.strategy}</span>
                            </div>
                        </div>
                    </div>
                    <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors p-2 hover:bg-gray-800 rounded-full">
                        <X size={24} />
                    </button>
                </div>

                {/* --- 2. Navigation Tabs --- */}
                <div className="flex border-b border-gray-800 bg-[#0f172a] px-6">
                    {['overview', 'config', 'logs'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as any)}
                            className={`px-6 py-4 text-sm font-medium capitalize border-b-2 transition-all ${activeTab === tab
                                    ? 'border-blue-500 text-blue-400 bg-blue-500/5'
                                    : 'border-transparent text-gray-500 hover:text-gray-300 hover:bg-gray-800/50'
                                }`}
                        >
                            {tab}
                        </button>
                    ))}
                </div>

                {/* --- 3. Content Area --- */}
                <div className="flex-1 overflow-hidden bg-[#0B1120] relative">

                    {/* OVERVIEW TAB */}
                    {activeTab === 'overview' && (
                        <div className="p-8 space-y-6 overflow-y-auto h-full">
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-gray-800/50 p-5 rounded-xl border border-gray-700/50">
                                    <p className="text-xs text-gray-500 uppercase font-bold tracking-wider">Total PnL</p>
                                    <p className={`text-2xl font-mono font-bold mt-2 ${bot.pnl >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                        {bot.pnl >= 0 ? '+' : ''}${Math.abs(bot.pnl).toFixed(2)}
                                    </p>
                                </div>
                                {/* Add more overview cards as needed... */}
                            </div>
                        </div>
                    )}

                    {/* CONFIG TAB */}
                    {activeTab === 'config' && (
                        <div className="p-0 h-full overflow-hidden flex flex-col">
                            <div className="flex-1 overflow-auto p-6">
                                <pre className="text-xs font-mono text-emerald-300 bg-[#1e1e1e] p-4 rounded-lg border border-gray-800">
                                    {JSON.stringify(bot, null, 2)}
                                </pre>
                            </div>
                        </div>
                    )}

                    {/* LOGS TAB - THE SMART WINDOW */}
                    {activeTab === 'logs' && (
                        <div className="flex flex-col h-full bg-[#0d1117]">
                            {/* Toolbar */}
                            <div className="h-10 border-b border-gray-800 flex items-center justify-between px-4 bg-[#161b22]">
                                <div className="flex items-center gap-2">
                                    <div className={`w-2 h-2 rounded-full ${connectionStatus === 'Connected' ? 'bg-emerald-500' : 'bg-red-500'}`}></div>
                                    <span className="text-[10px] text-gray-400 uppercase tracking-wider font-bold">{connectionStatus}</span>
                                    {latency > 0 && <span className="text-[10px] text-gray-600 ml-2">Ping: {latency}ms</span>}
                                </div>

                                <div className="flex items-center gap-2">
                                    <select
                                        className="bg-gray-800 text-gray-300 text-xs px-2 py-1 rounded border border-gray-700 focus:outline-none"
                                        value={filter}
                                        onChange={(e) => setFilter(e.target.value as any)}
                                    >
                                        <option value="ALL">All Events</option>
                                        <option value="TRADE">Trades Only</option>
                                        <option value="ERROR">Errors</option>
                                        <option value="SYSTEM">System</option>
                                    </select>

                                    <button
                                        onClick={() => setAutoScroll(!autoScroll)}
                                        className={`p-1.5 rounded ${autoScroll ? 'text-blue-400 bg-blue-400/10' : 'text-gray-500 hover:bg-gray-800'}`}
                                        title="Toggle Auto-Scroll"
                                    >
                                        <Lock size={14} />
                                    </button>

                                    <button
                                        onClick={handleDownloadLogs}
                                        className="p-1.5 text-gray-500 hover:text-white hover:bg-gray-800 rounded transition-colors"
                                        title="Download Logs"
                                    >
                                        <Download size={14} />
                                    </button>

                                    <button
                                        onClick={() => setLogs([])}
                                        className="p-1.5 text-gray-500 hover:text-rose-400 hover:bg-gray-800 rounded transition-colors"
                                        title="Clear Console"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>

                            {/* Terminal Area */}
                            <div
                                className="flex-1 overflow-y-auto p-4 font-mono text-sm custom-scrollbar bg-black/50"
                                ref={scrollContainerRef}
                            >
                                {filteredLogs.length === 0 ? (
                                    <div className="flex flex-col items-center justify-center h-full text-gray-600 opacity-50">
                                        <Terminal size={48} className="mb-4" />
                                        <p>No logs to display yet...</p>
                                        <p className="text-xs mt-2">Waiting for bot activity</p>
                                    </div>
                                ) : (
                                    filteredLogs.map((log, i) => (
                                        <LogRow key={i} log={log} index={i} />
                                    ))
                                )}
                                <div ref={logsEndRef} />
                            </div>

                            {/* Status Footer */}
                            <div className="h-8 bg-[#161b22] border-t border-gray-800 px-4 flex items-center justify-between text-[10px] text-gray-500">
                                <span>Total Events: {logs.length}</span>
                                <span>Memory Usage: ~{(JSON.stringify(logs).length / 1024).toFixed(2)} KB</span>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>,
        document.body
    );
};

export default BotDetailsModal;
