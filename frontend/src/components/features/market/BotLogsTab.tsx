import React, { useEffect, useRef } from 'react';
import { useBotLogs } from '../../../hooks/useBotLogs';

interface BotLogsTabProps {
    botId?: number | null;
}

export const BotLogsTab: React.FC<BotLogsTabProps> = ({ botId }) => {
    // 1. Fetch real logs via Hook
    const { logs, isConnected, clearLogs } = useBotLogs(botId || null);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // 2. Auto-scroll to bottom when new logs arrive
    useEffect(() => {
        if (logsEndRef.current) {
            logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
        }
    }, [logs]);

    const getLogColor = (type: string) => {
        const lowerType = type.toLowerCase();
        if (lowerType.includes('info')) return 'text-blue-400';
        if (lowerType.includes('signal')) return 'text-purple-400';
        if (lowerType.includes('trade') || lowerType.includes('profit')) return 'text-green-500';
        if (lowerType.includes('warning') || lowerType.includes('risk')) return 'text-orange-400';
        if (lowerType.includes('error') || lowerType.includes('stop')) return 'text-red-500';
        if (lowerType.includes('system')) return 'text-teal-400';
        return 'text-gray-400';
    };

    return (
        <div className="w-full h-full p-6 flex flex-col">
            <div className="w-full h-full bg-[#0A0E17] rounded-xl border border-gray-800 shadow-2xl flex flex-col font-mono text-sm">
                <div className="flex items-center justify-between p-3 border-b border-gray-800 bg-[#0F1423]">
                    <div className="flex items-center space-x-2">
                        <div className={`w-3 h-3 rounded-full ${isConnected ? 'bg-green-500 animate-pulse' : 'bg-red-500'} `}></div>
                        <span className="text-gray-300 font-bold tracking-wider">
                            TERMINAL :: ALGO_BOT_{botId || 'NONE'}
                        </span>
                    </div>
                    <button 
                        onClick={clearLogs}
                        className="text-xs text-gray-500 hover:text-white px-2 py-1 rounded border border-gray-700 bg-gray-800/50 transition-colors"
                    >
                        Clear Logs
                    </button>
                </div>
                <div className="flex-1 p-4 overflow-y-auto custom-scrollbar space-y-2">
                    {logs.length === 0 ? (
                        <div className="flex space-x-4 p-1">
                            <span className="text-gray-500">[{new Date().toLocaleTimeString('en-US', { hour12: false })}]</span>
                            <span className="font-semibold uppercase w-16 text-gray-500">WAIT</span>
                            <span className="text-gray-600 animate-pulse">
                                {botId ? 'Awaiting backend logs...' : 'No bot selected...'}
                            </span>
                        </div>
                    ) : (
                        logs.map((log, index) => (
                            <div key={index} className="flex space-x-4 p-1 hover:bg-white/5 rounded">
                                <span className="text-gray-500 shrink-0">[{log.time}]</span>
                                <span className={`font-semibold uppercase w-16 shrink-0 ${getLogColor(log.type)}`}>
                                    {log.type}
                                </span>
                                <span className="text-gray-300">{log.message}</span>
                            </div>
                        ))
                    )}
                    {/* Empty div for auto-scroll anchor */}
                    <div ref={logsEndRef} />
                </div>
            </div>
        </div>
    );
};
