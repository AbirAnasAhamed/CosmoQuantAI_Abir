import React, { useEffect, useRef, useState, useMemo } from 'react';
import {
    Terminal,
    Search,
    Download,
    PauseCircle,
    PlayCircle,
    Trash2,
    AlertTriangle,
    Info,
    Activity,
    Cpu,
    XCircle,
    CheckCircle2
} from 'lucide-react';

interface LogEntry {
    time: string;
    type: 'INFO' | 'TRADE' | 'ERROR' | 'SYSTEM' | 'WAIT' | 'WARNING' | string;
    message: string;
}

interface BotLogViewerProps {
    botId: string;
    botName?: string;
    className?: string;
}

const BotLogViewer: React.FC<BotLogViewerProps> = ({ botId, botName, className = '' }) => {
    const [logs, setLogs] = useState<LogEntry[]>([]);
    const [connectionStatus, setConnectionStatus] = useState<"Connected" | "Disconnected" | "Connecting">("Connecting");
    const [searchQuery, setSearchQuery] = useState('');
    const [isAutoScroll, setIsAutoScroll] = useState(true);
    const [activeFilters, setActiveFilters] = useState<string[]>([]);

    // Refs
    const wsRef = useRef<WebSocket | null>(null);
    const logsEndRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    // WebSocket Connection
    useEffect(() => {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const host = window.location.host; // Use dynamic host
        const wsUrl = `${protocol}//${host}/ws/logs/${botId}`;

        console.log("Connecting into the Matrix...", wsUrl);

        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;

        ws.onopen = () => {
            setConnectionStatus("Connected");
            addSystemLog("UPLINK ESTABLISHED. CONNECTED TO NEURAL NETWORK.");
        };

        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                setLogs(prev => [...prev, data]);
            } catch (e) {
                console.error("Data corruption detected", e);
            }
        };

        ws.onerror = () => {
            setConnectionStatus("Disconnected");
            addSystemLog("CONNECTION FAILURE. RETRYING...", "ERROR");
        };

        ws.onclose = () => {
            setConnectionStatus("Disconnected");
            addSystemLog("UPLINK TERMINATED.");
        };

        return () => {
            if (ws.readyState === WebSocket.OPEN) {
                ws.close();
            }
        };
    }, [botId]);

    // Auto-scroll logic
    useEffect(() => {
        if (isAutoScroll && logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs, isAutoScroll]);

    const addSystemLog = (message: string, type: string = 'SYSTEM') => {
        setLogs(prev => [...prev, {
            time: new Date().toLocaleTimeString(),
            type,
            message
        }]);
    };

    const handleDownloadLogs = () => {
        const content = logs.map(l => `[${l.time}] [${l.type}] ${l.message}`).join('\n');
        const blob = new Blob([content], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${botName || botId}_logs_${new Date().toISOString()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const toggleFilter = (filterType: string) => {
        setActiveFilters(prev =>
            prev.includes(filterType)
                ? prev.filter(f => f !== filterType)
                : [...prev, filterType]
        );
    };

    const filteredLogs = useMemo(() => {
        return logs.filter(log => {
            const matchesSearch = log.message.toLowerCase().includes(searchQuery.toLowerCase()) ||
                log.type.toLowerCase().includes(searchQuery.toLowerCase());
            const matchesFilter = activeFilters.length === 0 || activeFilters.includes(log.type);
            return matchesSearch && matchesFilter;
        });
    }, [logs, searchQuery, activeFilters]);

    const getLogColor = (type: string) => {
        const t = type.toUpperCase();
        if (t === 'ERROR') return 'text-red-500 border-red-500/30 bg-red-500/5';
        if (t === 'TRADE' || t === 'BUY' || t === 'SELL') return 'text-amber-400 border-amber-400/30 bg-amber-400/5';
        if (t === 'SUCCESS') return 'text-emerald-400 border-emerald-400/30 bg-emerald-400/5';
        if (t === 'WARNING') return 'text-orange-400 border-orange-400/30 bg-orange-400/5';
        if (t === 'SYSTEM') return 'text-cyan-400 border-cyan-400/30 bg-cyan-400/5';
        return 'text-blue-300 border-blue-400/30 bg-blue-400/5';
    };

    const getLogIcon = (type: string) => {
        const t = type.toUpperCase();
        if (t === 'ERROR') return <XCircle className="w-3.5 h-3.5" />;
        if (t === 'TRADE') return <Activity className="w-3.5 h-3.5" />;
        if (t === 'SUCCESS') return <CheckCircle2 className="w-3.5 h-3.5" />;
        if (t === 'WARNING') return <AlertTriangle className="w-3.5 h-3.5" />;
        if (t === 'SYSTEM') return <Cpu className="w-3.5 h-3.5" />;
        return <Info className="w-3.5 h-3.5" />;
    };

    return (
        <div className={`flex flex-col h-full bg-[#050B14] rounded-xl border border-slate-800 shadow-2xl overflow-hidden relative ${className}`}>

            {/* Cyberpunk Grid Background */}
            <div className="absolute inset-0 opacity-5 pointer-events-none z-0"
                style={{
                    backgroundImage: 'linear-gradient(rgba(6, 182, 212, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(6, 182, 212, 0.1) 1px, transparent 1px)',
                    backgroundSize: '20px 20px'
                }}>
            </div>

            {/* Header / Control Panel */}
            <div className="relative z-10 flex flex-col md:flex-row justify-between items-center p-3 border-b border-slate-800 bg-[#080E1A]/90 backdrop-blur-md gap-3">

                {/* Visual Status */}
                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/80 border border-slate-700">
                        <Terminal className="w-4 h-4 text-cyan-400" />
                        <span className="text-xs font-mono text-cyan-100 font-bold tracking-wider">
                            TERMINAL_V2.0
                        </span>
                        <div className={`w-2 h-2 rounded-full ml-2 ${connectionStatus === 'Connected' ? 'bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]' : 'bg-red-500'}`}></div>
                    </div>
                </div>

                {/* Search & Filters */}
                <div className="flex-1 flex w-full md:w-auto gap-2 items-center">
                    <div className="relative flex-1 group">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-500 group-focus-within:text-cyan-400 transition-colors" />
                        <input
                            type="text"
                            placeholder="Scan logs..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full bg-slate-900/50 border border-slate-700 rounded-lg pl-9 pr-3 py-1.5 text-xs text-slate-300 focus:outline-none focus:border-cyan-500/50 focus:bg-slate-900 transition-all font-mono"
                        />
                    </div>
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1.5 w-full md:w-auto justify-end">
                    <button
                        onClick={() => setIsAutoScroll(!isAutoScroll)}
                        className={`p-1.5 rounded-lg border transition-all ${isAutoScroll ? 'bg-cyan-500/10 border-cyan-500/50 text-cyan-400' : 'bg-transparent border-slate-700 text-slate-500 hover:text-slate-300'}`}
                        title={isAutoScroll ? "Auto-scroll ON" : "Auto-scroll OFF"}
                    >
                        {isAutoScroll ? <PauseCircle className="w-4 h-4" /> : <PlayCircle className="w-4 h-4" />}
                    </button>

                    <button
                        onClick={() => setLogs([])}
                        className="p-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-red-400 hover:border-red-500/30 hover:bg-red-500/10 transition-all"
                        title="Clear Buffer"
                    >
                        <Trash2 className="w-4 h-4" />
                    </button>

                    <button
                        onClick={handleDownloadLogs}
                        className="p-1.5 rounded-lg border border-slate-700 text-slate-500 hover:text-cyan-400 hover:border-cyan-500/30 hover:bg-cyan-500/10 transition-all"
                        title="Export Logs"
                    >
                        <Download className="w-4 h-4" />
                    </button>
                </div>
            </div>

            {/* Filter Chips */}
            <div className="relative z-10 px-3 py-2 border-b border-slate-800 bg-[#080E1A]/80 backdrop-blur flex gap-2 overflow-x-auto no-scrollbar">
                {['ERROR', 'TRADE', 'INFO', 'SYSTEM'].map(type => (
                    <button
                        key={type}
                        onClick={() => toggleFilter(type)}
                        className={`px-2.5 py-0.5 text-[10px] font-mono rounded border transition-all uppercase tracking-wide
                            ${activeFilters.includes(type)
                                ? 'bg-slate-700 text-white border-slate-500'
                                : 'bg-transparent text-slate-500 border-slate-800 hover:border-slate-600'
                            }`}
                    >
                        {type}
                    </button>
                ))}
                {activeFilters.length > 0 && (
                    <button
                        onClick={() => setActiveFilters([])}
                        className="px-2 py-0.5 text-[10px] text-xs text-red-400 hover:text-red-300 ml-auto"
                    >
                        Reset
                    </button>
                )}
            </div>

            {/* Main Console Area */}
            <div className="relative flex-1 overflow-hidden">
                <div
                    ref={containerRef}
                    className="absolute inset-0 overflow-y-auto p-4 font-mono text-sm space-y-1 custom-scrollbar scroll-smooth"
                >
                    {filteredLogs.length === 0 ? (
                        <div className="h-full flex flex-col items-center justify-center text-slate-700 opacity-50">
                            <Activity className="w-12 h-12 mb-4 animate-pulse" />
                            <p className="text-xs uppercase tracking-widest">Awaiting Data Stream...</p>
                        </div>
                    ) : (
                        filteredLogs.map((log, i) => (
                            <div
                                key={i}
                                className={`group flex items-start gap-3 p-2 rounded border border-transparent hover:border-slate-800 hover:bg-slate-900/50 transition-all duration-200 animate-in fade-in slide-in-from-left-2`}
                            >
                                <span className="text-[10px] text-slate-600 min-w-[70px] pt-0.5 select-none font-medium">
                                    {log.time}
                                </span>

                                <span className={`flex items-center gap-1.5 px-2 py-0.5 rounded text-[10px] font-bold border ${getLogColor(log.type)} min-w-[85px] justify-center select-none uppercase shadow-sm`}>
                                    {getLogIcon(log.type)}
                                    {log.type}
                                </span>

                                <span className="text-slate-300 text-xs break-all leading-relaxed group-hover:text-white transition-colors">
                                    {log.message}
                                </span>
                            </div>
                        ))
                    )}
                    <div ref={logsEndRef} />
                </div>
            </div>

            {/* Status Bar / Footer */}
            <div className="relative z-10 px-3 py-1.5 border-t border-slate-800 bg-[#050B14] flex justify-between items-center text-[10px] text-slate-600 font-mono uppercase tracking-wider">
                <span>Mem: OK</span>
                <div className="flex gap-4">
                    <span>Buffer: {logs.length} entries</span>
                    <span className={connectionStatus === 'Connected' ? 'text-emerald-500/70' : 'text-red-500/70'}>
                        {connectionStatus === 'Connected' ? '• LIVE' : '• OFFLINE'}
                    </span>
                </div>
            </div>
        </div>
    );
};

export default BotLogViewer;
