import { useState, useCallback, useEffect } from 'react';
import { backtestService, BacktestRequest, OptimizationRequest, WalkForwardRequest } from '@/services/backtester';
import { useToast } from '@/context/ToastContext';
import { useBacktestSocket } from '@/hooks/useBacktestSocket'; // ✅ Socket Hook Import

export const useBacktestExecution = () => {
    const [isLoading, setIsLoading] = useState(false);
    const [progress, setProgress] = useState(0);
    const [statusMessage, setStatusMessage] = useState(''); // ✅ New Status Message
    const [results, setResults] = useState<any>(null);
    const [mode, setMode] = useState<'backtest' | 'optimization' | 'walk_forward' | 'batch'>('backtest');

    const { showToast } = useToast();
    const { lastMessage } = useBacktestSocket(); // ✅ Use Socket
    const [taskId, setTaskId] = useState<string | null>(null);

    // ✅ 1. Socket Listener for Real-time Progress
    useEffect(() => {
        if (lastMessage && lastMessage.task_id === taskId) {

            // Progress Update
            if (lastMessage.progress !== undefined) {
                setProgress(lastMessage.progress);
            }

            // Status Message Update (Backend sends 'data' or 'payload')
            const metaData = lastMessage.payload || lastMessage.data;
            if (metaData && metaData.status) {
                setStatusMessage(metaData.status);
            } else if (mode === 'optimization' && metaData?.current) {
                setStatusMessage(`Processing Iteration ${metaData.current} / ${metaData.total}`);
            }

            // Completion Handling
            // Cast to string to avoid linter errors if the type definition is too strict vs runtime values
            const status = (lastMessage.status as string).toUpperCase();

            if (status === 'COMPLETED' || status === 'SUCCESS') {
                setIsLoading(false);
                setResults(lastMessage.payload || lastMessage.data); // ✅ Set Result from Socket
                setProgress(100);
                showToast('Analysis Completed Successfully!', 'success');
            }
            else if (status === 'FAILED' || status === 'FAILURE') {
                setIsLoading(false);
                showToast(`Analysis Failed`, 'error');
            }
            else if (status === 'REVOKED' || status === 'Revoked') {
                setIsLoading(false);      // লোডিং বন্ধ হবে
                setProgress(0);           // প্রোগ্রেস রিসেট
                setResults(null);         // রেজাল্ট ক্লিয়ার (অপশনাল)
                showToast('Analysis Stopped by User', 'info');
            }
        }
    }, [lastMessage, taskId, mode, showToast]);

    // ✅ 2. Execution Logic (Socket + Fallback Polling Removed)
    const execute = useCallback(async (
        payload: any,
        currentMode: 'backtest' | 'optimization' | 'walk_forward' | 'batch'
    ) => {
        setIsLoading(true);
        setResults(null);
        setProgress(0);
        setStatusMessage('Initializing...');
        setMode(currentMode);
        setTaskId(null);

        try {
            let response;
            // API Calls...
            if (currentMode === 'optimization') {
                response = await backtestService.runOptimization(payload as OptimizationRequest);
            } else if (currentMode === 'walk_forward') {
                response = await backtestService.runWalkForward(payload as WalkForwardRequest);
            } else if (currentMode === 'batch') {
                response = await backtestService.runBatchBacktest(payload);
            } else {
                response = await backtestService.runBacktest(payload as BacktestRequest);
            }

            if (response.task_id) {
                setTaskId(response.task_id);
                // Polling removed in favor of socket
            } else {
                setIsLoading(false);
                showToast('Failed to start task', 'error');
            }
        } catch (error) {
            setIsLoading(false);
            showToast('Execution Error', 'error');
            console.error(error);
        }
    }, [showToast]);

    return {
        execute,
        isLoading,
        progress,
        statusMessage, // ✅ Return Message for UI
        results,
        mode,
        taskId
    };
};
