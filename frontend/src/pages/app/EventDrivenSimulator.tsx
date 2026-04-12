import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Activity, Play, Square, TrendingUp, DollarSign, FastForward, Wifi, AlertTriangle, BarChart2 } from 'lucide-react';
import Button from '@/components/common/Button';
import Card from '@/components/common/Card';
import SimulationChart, { SimulationChartHandle } from '@/components/features/simulation/SimulationChart';
import EquityCurve from '@/components/features/simulation/EquityCurve';
import OrderBookWidget from '@/components/features/simulation/OrderBookWidget';
import LogConsole, { LogMessage } from '@/components/features/simulation/LogConsole';
import { CandlestickData, Time, SeriesMarker } from 'lightweight-charts';
import { useMarketStore } from '@/store/marketStore';

const EventDrivenSimulator: React.FC = () => {
    const [isRunning, setIsRunning] = useState(false);
    const { globalSymbol: symbol, setGlobalSymbol: setSymbol } = useMarketStore();
    const [logs, setLogs] = useState<LogMessage[]>([]);
    const [marketData, setMarketData] = useState<CandlestickData[]>([]);
    const [equityData, setEquityData] = useState<{ time: string; value: number; timestamp: number }[]>([]);
    const [markers, setMarkers] = useState<SeriesMarker<Time>[]>([]);
    const [pnl, setPnl] = useState(0);
    const [holdings, setHoldings] = useState(0);
    const [price, setPrice] = useState(0);
    const [bids, setBids] = useState<number[][]>([]);
    const [asks, setAsks] = useState<number[][]>([]);
    const [playbackSpeed, setPlaybackSpeed] = useState<number>(0); // 0 = Max
    const [isPaused, setIsPaused] = useState(false);
    const [latency, setLatency] = useState<number>(0); // Network Latency in ms
    const [slippage, setSlippage] = useState<number>(0); // Slippage in %
    const [makerFee, setMakerFee] = useState<number>(0.001); // Maker Fee (0.1%)
    const [takerFee, setTakerFee] = useState<number>(0.002); // Taker Fee (0.2%)
    const [volumeParticipation, setVolumeParticipation] = useState<number>(100); // 100% (Full Fill)

    // Strategy Parameters State
    const [strategyParams, setStrategyParams] = useState({
        stop_loss: 0.01,
        take_profit: 0.02,
        buy_probability: 0.2
    });

    const chartRef = useRef<SimulationChartHandle>(null);
    const socketRef = useRef<WebSocket | null>(null);

    // WebSocket Connection Logic
    const connect = useCallback(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) return;

        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsParams = isRunning ? `?symbol=${symbol}` : "";
        const ws = new WebSocket(`${protocol}//${window.location.host}/api/v1/simulation/ws/simulation${wsParams}`);

        ws.onopen = () => {
            addLog("System: Connected to Simulation Server", 'INFO');
            if (isRunning) {
                ws.send(JSON.stringify({ action: "START", symbol }));
                // Send initial speed
                ws.send(JSON.stringify({ type: "UPDATE_SPEED", speed: playbackSpeed }));
                // Send initial params
                ws.send(JSON.stringify({ type: "UPDATE_PARAMS", params: strategyParams }));
                // Send initial latency
                ws.send(JSON.stringify({ type: "UPDATE_LATENCY", latency: latency }));
                // Send initial slippage
                ws.send(JSON.stringify({ type: "UPDATE_SLIPPAGE", slippage: slippage }));
                // Send initial fees
                ws.send(JSON.stringify({ type: "UPDATE_FEES", maker: makerFee, taker: takerFee }));
                // Send initial participation
                ws.send(JSON.stringify({ type: "UPDATE_PARTICIPATION", rate: volumeParticipation / 100.0 }));
            }
        };

        ws.onmessage = (event) => {
            const data = JSON.parse(event.data);

            if (data.type === "MARKET") {
                const time = (new Date(data.time).getTime() / 1000) as Time;
                const candle: CandlestickData = {
                    time: time,
                    open: data.open,
                    high: data.high,
                    low: data.low,
                    close: data.close,
                };

                setPrice(data.close);

                // Update React State for persistence (keep last 100 candles)
                setMarketData(prev => {
                    const lastCandle = prev[prev.length - 1];
                    // If same time, update last candle. If new time, push new.
                    if (lastCandle && (lastCandle.time === time)) {
                        const updated = [...prev];
                        updated[updated.length - 1] = candle;
                        return updated;
                    } else {
                        const newData = [...prev, candle];
                        if (newData.length > 200) return newData.slice(newData.length - 200);
                        return newData;
                    }
                });

                // Update chart directly for performance
                if (chartRef.current) {
                    chartRef.current.updateCandle(candle);
                }
            } else if (data.type === "ORDER_BOOK") {
                setBids(data.bids);
                setAsks(data.asks);
            } else if (data.type === "system_log") {
                // New Structured Logging
                setLogs(prev => [...prev, {
                    timestamp: data.timestamp,
                    level: data.level,
                    message: data.message,
                    metadata: data.metadata
                }]);
            } else if (data.type === "LOG") {
                // FALLBACK for old logs
                addLog(data.message, 'INFO');
            } else if (data.type === "FILL") {
                // Note: The engine now sends a system_log for FILLs too, but we keep this for markers/Pnl

                // Add Marker
                const time = (new Date(data.time).getTime() / 1000) as Time;
                const newMarker: SeriesMarker<Time> = {
                    time: time,
                    position: data.direction === 'BUY' ? 'belowBar' : 'aboveBar',
                    color: data.direction === 'BUY' ? '#2196F3' : '#E91E63',
                    shape: data.direction === 'BUY' ? 'arrowUp' : 'arrowDown',
                    text: `${data.direction} @ ${data.price}`
                };

                setMarkers(prev => {
                    const updated = [...prev, newMarker];
                    if (chartRef.current) {
                        chartRef.current.setMarkers(updated);
                    }
                    return updated;
                });

                // Simple PnL/Holdings Simulation update (Logic normally on backend, but visualization here)
                if (data.direction === 'BUY') {
                    setHoldings(h => h + data.quantity);
                    setPnl(p => p - data.commission); // Commission cost
                } else {
                    setHoldings(h => h - data.quantity);
                    setPnl(p => p - data.commission);
                }
            } else if (data.type === "EQUITY_UPDATE") {
                setEquityData(prev => {
                    const newPoint = {
                        time: data.time,
                        value: data.value,
                        timestamp: new Date(data.time).getTime()
                    };
                    // Keep last 100 points
                    const updated = [...prev, newPoint];
                    if (updated.length > 100) return updated.slice(updated.length - 100);
                    return updated;
                });
            } else if (data.type === "SYSTEM") {
                addLog(data.message, 'INFO');
            } else if (data.type === "PAUSED_STATE") {
                setIsPaused(data.value);
            }
        };

        ws.onclose = () => {
            addLog("System: Disconnected", 'INFO');
            setIsRunning(false);
            setIsPaused(false);
        };

        socketRef.current = ws;
    }, [isRunning, symbol]);

    // Handle Speed Change properly
    useEffect(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "UPDATE_SPEED", speed: playbackSpeed }));
        }
    }, [playbackSpeed]);

    // Handle Latency Change
    useEffect(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "UPDATE_LATENCY", latency: latency }));
        }
    }, [latency]);

    // Handle Slippage Change
    useEffect(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "UPDATE_SLIPPAGE", slippage: slippage }));
        }
    }, [slippage]);

    // Handle Fee Change
    useEffect(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "UPDATE_FEES", maker: makerFee, taker: takerFee }));
        }
    }, [makerFee, takerFee]);

    // Handle Volume Participation Change
    useEffect(() => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "UPDATE_PARTICIPATION", rate: volumeParticipation / 100.0 }));
        }
    }, [volumeParticipation]);

    useEffect(() => {
        return () => {
            if (socketRef.current) {
                socketRef.current.close();
            }
        };
    }, []);

    const addLog = (message: string, level: 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR') => {
        setLogs(prev => [...prev, {
            timestamp: new Date().toISOString(),
            level: level,
            message: message
        }]);
    };

    const handleStart = () => {
        setIsRunning(true);
        setLogs([]);
        setMarketData([]);
        setEquityData([]);
        setMarkers([]);
        // Reset chart
        if (chartRef.current) {
            chartRef.current.reset();
        }
        setPnl(0);
        setHoldings(0);
        setIsPaused(false);

        if (!socketRef.current || socketRef.current.readyState !== WebSocket.OPEN) {
            connect();
            setTimeout(() => {
                if (socketRef.current?.readyState === WebSocket.OPEN) {
                    socketRef.current.send(JSON.stringify({ action: "START", symbol }));
                    socketRef.current.send(JSON.stringify({ type: "UPDATE_SPEED", speed: playbackSpeed }));
                    socketRef.current.send(JSON.stringify({ type: "UPDATE_PARAMS", params: strategyParams }));
                    socketRef.current.send(JSON.stringify({ type: "UPDATE_LATENCY", latency: latency }));
                    socketRef.current.send(JSON.stringify({ type: "UPDATE_SLIPPAGE", slippage: slippage }));
                    socketRef.current.send(JSON.stringify({ type: "UPDATE_PARTICIPATION", rate: volumeParticipation / 100.0 }));
                }
            }, 100);
        } else {
            socketRef.current.send(JSON.stringify({ action: "START", symbol }));
            socketRef.current.send(JSON.stringify({ type: "UPDATE_SPEED", speed: playbackSpeed }));
            socketRef.current.send(JSON.stringify({ type: "UPDATE_PARAMS", params: strategyParams }));
            socketRef.current.send(JSON.stringify({ type: "UPDATE_LATENCY", latency: latency }));
            socketRef.current.send(JSON.stringify({ type: "UPDATE_SLIPPAGE", slippage: slippage }));
            socketRef.current.send(JSON.stringify({ type: "UPDATE_PARTICIPATION", rate: volumeParticipation / 100.0 }));
        }
    };

    const handleStop = () => {
        if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ action: "STOP" }));
        }
        setIsRunning(false);
        setIsPaused(false);
    };

    const handlePause = () => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "PAUSE" }));
        }
    };

    const handleResume = () => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "RESUME" }));
        }
    };

    const handleStep = () => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "STEP" }));
        }
    };

    const handleUpdateParams = () => {
        if (socketRef.current?.readyState === WebSocket.OPEN) {
            socketRef.current.send(JSON.stringify({ type: "UPDATE_PARAMS", params: strategyParams }));
        }
    };

    const speedOptions = [
        { label: '1x', value: 1.0 },
        { label: '10x', value: 10.0 },
        { label: '100x', value: 100.0 },
        { label: 'MAX', value: 0 },
    ];

    return (
        <div className="flex h-[calc(100vh-8rem)] gap-6 p-2">
            {/* Left Configuration Panel */}
            <div className="w-1/3 flex flex-col gap-6">
                <Card className="p-6 bg-white dark:bg-[#1e293b] border-slate-200 dark:border-slate-700 shadow-xl overflow-y-auto max-h-[70vh]">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white mb-6 flex items-center gap-2">
                        <Activity className="text-brand-primary" />
                        Simulation Config
                    </h2>

                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Asset Symbol</label>
                            <input
                                type="text"
                                value={symbol}
                                onChange={(e) => setSymbol(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none transaction-all"
                            />
                        </div>

                        {/* Strategy Parameters - NEW */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                <TrendingUp size={16} /> Strategy Parameters
                            </h3>
                            <div className="grid grid-cols-2 gap-3 mb-3">
                                <div>
                                    <label className="text-xs text-slate-500">Stop Loss %</label>
                                    <input
                                        type="number" step="0.01"
                                        value={strategyParams.stop_loss}
                                        onChange={(e) => setStrategyParams({ ...strategyParams, stop_loss: parseFloat(e.target.value) })}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Take Profit %</label>
                                    <input
                                        type="number" step="0.01"
                                        value={strategyParams.take_profit}
                                        onChange={(e) => setStrategyParams({ ...strategyParams, take_profit: parseFloat(e.target.value) })}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                                <div className="col-span-2">
                                    <label className="text-xs text-slate-500">Buy Prob (0.0 - 1.0)</label>
                                    <input
                                        type="number" step="0.1" min="0" max="1"
                                        value={strategyParams.buy_probability}
                                        onChange={(e) => setStrategyParams({ ...strategyParams, buy_probability: parseFloat(e.target.value) })}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                            </div>
                            <Button
                                onClick={handleUpdateParams}
                                className="w-full bg-indigo-500 hover:bg-indigo-600 text-white text-xs py-2 rounded font-bold shadow-md flex items-center justify-center gap-2"
                                disabled={!isRunning}
                            >
                                ⚡ APPLY LIVE
                            </Button>
                        </div>

                        {/* Latency Control - NEW */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-2">
                                <Wifi size={16} />
                                Network Latency: {latency} ms
                            </label>
                            <input
                                type="range"
                                min="0"
                                max="2000"
                                step="50"
                                value={latency}
                                onChange={(e) => setLatency(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>0ms (Instant)</span>
                                <span>2000ms (Very Slow)</span>
                            </div>
                        </div>

                        {/* Slippage Control - NEW */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-2">
                                <AlertTriangle size={16} />
                                Slippage: {slippage}%
                            </label>
                            <input
                                type="number"
                                min="0"
                                max="20"
                                step="0.1"
                                value={slippage}
                                onChange={(e) => setSlippage(parseFloat(e.target.value))}
                                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none"
                            />
                            <p className="text-xs text-slate-500 mt-1">Simulates execution volatility (Price drift + Noise)</p>
                        </div>

                        {/* Commission Config - NEW */}
                        <div className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">
                            <h3 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-3 flex items-center gap-2">
                                <DollarSign size={16} /> Commission Config
                            </h3>
                            <div className="grid grid-cols-2 gap-3">
                                <div>
                                    <label className="text-xs text-slate-500">Maker Fee (%)</label>
                                    <input
                                        type="number" step="0.01"
                                        value={makerFee}
                                        onChange={(e) => setMakerFee(parseFloat(e.target.value))}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                                <div>
                                    <label className="text-xs text-slate-500">Taker Fee (%)</label>
                                    <input
                                        type="number" step="0.01"
                                        value={takerFee}
                                        onChange={(e) => setTakerFee(parseFloat(e.target.value))}
                                        className="w-full bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-600 rounded px-2 py-1 text-sm"
                                    />
                                </div>
                            </div>
                        </div>

                        {/* Volume Participation - NEW */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-2">
                                <BarChart2 size={16} />
                                Volume Participation: {volumeParticipation}%
                            </label>
                            <input
                                type="range"
                                min="1"
                                max="100"
                                step="1"
                                value={volumeParticipation}
                                onChange={(e) => setVolumeParticipation(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-200 dark:bg-slate-700 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                            />
                            <div className="flex justify-between text-xs text-slate-500 mt-1">
                                <span>1% (Drip Feed)</span>
                                <span>100% (Full Fill)</span>
                            </div>
                        </div>

                        {/* Speed Control */}
                        <div>
                            <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-2 flex items-center gap-2">
                                <FastForward size={16} />
                                Playback Speed
                            </label>
                            <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-lg">
                                {speedOptions.map((opt) => (
                                    <button
                                        key={opt.label}
                                        onClick={() => setPlaybackSpeed(opt.value)}
                                        className={`flex-1 py-1.5 text-sm font-medium rounded-md transition-all ${playbackSpeed === opt.value
                                            ? 'bg-white dark:bg-slate-700 text-brand-primary shadow-sm'
                                            : 'text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200'
                                            }`}
                                    >
                                        {opt.label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Timeframe</label>
                                <select className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none">
                                    <option>1m</option>
                                    <option>5m</option>
                                    <option>1h</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 dark:text-slate-400 mb-1">Initial Cash</label>
                                <input
                                    type="number"
                                    defaultValue={10000}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-4 py-2 text-slate-900 dark:text-white focus:ring-2 focus:ring-brand-primary outline-none"
                                />
                            </div>
                        </div>

                        {/* Main Controls */}
                        {!isRunning ? (
                            <Button
                                onClick={handleStart}
                                className="w-full mt-4 bg-brand-primary hover:bg-brand-secondary text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-brand-primary/20 flex items-center justify-center gap-2"
                            >
                                <Play size={20} fill="currentColor" />
                                START SIMULATION
                            </Button>
                        ) : (
                            <div className="flex flex-col gap-2 mt-4">
                                <div className="flex gap-2">
                                    {!isPaused ? (
                                        <Button
                                            onClick={handlePause}
                                            className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-yellow-500/20 flex items-center justify-center gap-2"
                                        >
                                            <span className="font-mono">||</span>
                                            PAUSE
                                        </Button>
                                    ) : (
                                        <div className="flex flex-1 gap-2">
                                            <Button
                                                onClick={handleResume}
                                                className="flex-1 bg-green-500 hover:bg-green-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-green-500/20 flex items-center justify-center gap-2"
                                            >
                                                <Play size={20} fill="currentColor" />
                                                RESUME
                                            </Button>
                                            <Button
                                                onClick={handleStep}
                                                className="flex-1 bg-blue-500 hover:bg-blue-600 text-white py-3 rounded-xl font-bold text-lg shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                                            >
                                                <FastForward size={20} />
                                                STEP
                                            </Button>
                                        </div>
                                    )}
                                </div>

                                <Button
                                    onClick={handleStop}
                                    className="w-full bg-red-500 hover:bg-red-600 text-white py-2 rounded-xl font-bold text-md shadow-lg shadow-red-500/20 flex items-center justify-center gap-2"
                                >
                                    <Square size={16} fill="currentColor" />
                                    STOP
                                </Button>
                            </div>
                        )}
                    </div>
                </Card>

                {/* Real-time Stats */}
                <div className="grid grid-cols-2 gap-4">
                    <Card className="p-4 bg-white dark:bg-[#1e293b] border-l-4 border-emerald-500">
                        <p className="text-sm text-slate-500">Net PnL</p>
                        <p className={`text-2xl font-bold ${pnl >= 0 ? 'text-emerald-500' : 'text-red-500'}`}>
                            ${pnl.toFixed(2)}
                        </p>
                    </Card>
                    <Card className="p-4 bg-white dark:bg-[#1e293b] border-l-4 border-blue-500">
                        <p className="text-sm text-slate-500">Holdings</p>
                        <p className="text-2xl font-bold text-slate-800 dark:text-white">
                            {holdings}
                        </p>
                    </Card>
                </div>
            </div>

            {/* Right Monitor Panel */}
            <div className="flex-1 flex flex-col gap-6">
                {/* Live Chart */}
                <Card className="h-1/3 bg-white dark:bg-[#1e293b] p-4 relative overflow-hidden flex flex-col">
                    <div className="absolute top-4 left-4 z-10 flex gap-2">
                        <div className="bg-white/10 backdrop-blur-md px-3 py-1 rounded-full border border-white/10">
                            <span className="text-xs font-mono text-white flex items-center gap-2">
                                <span className={`w-2 h-2 rounded-full ${isPaused ? 'bg-yellow-400' : 'bg-red-500 animate-pulse'}`}></span>
                                {isPaused ? 'PAUSED' : 'LIVE FEED'} {playbackSpeed === 0 ? '(MAX)' : `(${playbackSpeed}x)`}
                            </span>
                        </div>
                    </div>
                    <div className="flex-1 w-full h-full">
                        <SimulationChart
                            ref={chartRef}
                            data={marketData}
                            colors={{
                                backgroundColor: '#1e293b',
                                textColor: '#CBD5E1'
                            }}
                        />
                    </div>
                </Card>

                {/* Order Book - NEW */}
                <Card className="h-1/4 bg-white dark:bg-[#1e293b] p-0 relative overflow-hidden flex flex-col">
                    <div className="absolute top-2 left-2 z-10 bg-slate-900/80 px-2 py-1 rounded text-xs text-white border border-slate-700">
                        Order Book (Simulated)
                    </div>
                    <OrderBookWidget
                        bids={bids}
                        asks={asks}
                        currentPrice={price}
                        symbol={symbol}
                    />
                </Card>

                {/* Equity Curve */}
                <Card className="h-1/6 bg-white dark:bg-[#1e293b] p-4 relative overflow-hidden flex flex-col">
                    <EquityCurve data={equityData} />
                </Card>

                {/* System Terminal - REPLACED */}
                <LogConsole
                    logs={logs}
                    onClear={() => setLogs([])}
                    className="flex-1"
                />
            </div>
        </div>
    );
};

export default EventDrivenSimulator;
