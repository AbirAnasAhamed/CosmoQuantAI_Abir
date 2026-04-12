import React, { useEffect, useRef, useState } from 'react';
import { createChart, IChartApi, ISeriesApi, CandlestickSeries } from 'lightweight-charts';

interface TradingChartProps {
    symbol?: string;
}

const TradingChartComponent: React.FC<TradingChartProps> = ({ symbol = 'BTC/USDT' }) => {
    const chartContainerRef = useRef<HTMLDivElement>(null);
    const [chart, setChart] = useState<IChartApi | null>(null);
    const [series, setSeries] = useState<ISeriesApi<'Candlestick'> | null>(null);

    useEffect(() => {
        if (!chartContainerRef.current) return;

        // Create chart instance
        const newChart = createChart(chartContainerRef.current, {
            width: chartContainerRef.current.clientWidth,
            height: 400,
            layout: {
                background: { color: '#1E222D' },
                textColor: '#D9D9D9',
            },
            grid: {
                vertLines: { color: '#2B2B43' },
                horzLines: { color: '#2B2B43' },
            },
            crosshair: {
                mode: 1, // Normal mode
            },
            timeScale: {
                borderColor: '#2B2B43',
            },
        });

        // Add candlestick series
        const newSeries = newChart.addSeries(CandlestickSeries, {
            upColor: '#26a69a',
            downColor: '#ef5350',
            borderVisible: false,
            wickUpColor: '#26a69a',
            wickDownColor: '#ef5350',
        });

        // Generate mock data
        const mockData = generateMockData();
        newSeries.setData(mockData);

        // Mock algorithmic signals are displayed in the dashboard below instead of using chart markers (which requires custom plugins in v5)

        setChart(newChart);
        setSeries(newSeries);

        // Handle resize
        const handleResize = () => {
            if (chartContainerRef.current) {
                newChart.applyOptions({ width: chartContainerRef.current.clientWidth });
            }
        };
        window.addEventListener('resize', handleResize);

        return () => {
            window.removeEventListener('resize', handleResize);
            newChart.remove();
        };
    }, []);

    return (
        <div className="w-full bg-[#1E222D] p-4 rounded-xl shadow-lg border border-gray-800">
            <div className="flex justify-between items-center mb-4">
                <h2 className="text-xl font-bold text-white font-sans">{symbol} Algorithmic Analysis</h2>
                <div className="flex space-x-2">
                    <span className="px-3 py-1 bg-green-500/20 text-green-400 rounded-full text-sm font-medium border border-green-500/30">
                        Algo Active
                    </span>
                    <span className="px-3 py-1 bg-blue-500/20 text-blue-400 rounded-full text-sm font-medium border border-blue-500/30">
                        Live Data
                    </span>
                </div>
            </div>
            <div
                ref={chartContainerRef}
                className="w-full h-[400px]"
                data-testid="trading-chart-container"
            />
            <div className="mt-4 grid grid-cols-4 gap-4 text-sm">
                <div className="bg-[#2B2B43] p-3 rounded-lg text-center">
                    <div className="text-gray-400">24h Vol</div>
                    <div className="text-white font-semibold">12,450 BTC</div>
                </div>
                <div className="bg-[#2B2B43] p-3 rounded-lg text-center">
                    <div className="text-gray-400">Current Pattern</div>
                    <div className="text-green-400 font-semibold">Bull Flag</div>
                </div>
                <div className="bg-[#2B2B43] p-3 rounded-lg text-center">
                    <div className="text-gray-400">Buy Confidence</div>
                    <div className="text-white font-semibold flex items-center justify-center">
                        <div className="w-full bg-gray-700 rounded-full h-2.5 mx-2">
                            <div className="bg-green-500 h-2.5 rounded-full" style={{ width: '75%' }}></div>
                        </div>
                        75%
                    </div>
                </div>
                <div className="bg-[#2B2B43] p-3 rounded-lg text-center">
                    <div className="text-gray-400">Next Target</div>
                    <div className="text-blue-400 font-semibold">$68,500</div>
                </div>
            </div>
        </div>
    );
};

// Helper function to generate some mock candlestick data
function generateMockData() {
    const data = [];
    const start = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
    let currentPrice = 64000;

    for (let i = 0; i < 60; i++) {
        const time = Math.floor(start.getTime() / 1000) + i * 24 * 60 * 60;
        const open = currentPrice;
        const close = currentPrice + (Math.random() - 0.5) * 1000;
        const high = Math.max(open, close) + Math.random() * 500;
        const low = Math.min(open, close) - Math.random() * 500;
        currentPrice = close;

        data.push({ time, open, high, low, close });
    }
    return data;
}

export default TradingChartComponent;
