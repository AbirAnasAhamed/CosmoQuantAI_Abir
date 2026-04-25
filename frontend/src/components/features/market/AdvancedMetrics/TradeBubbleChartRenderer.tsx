import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface TradeBubble {
    time: number;
    price: number;
    volume: number;
    side: 'buy' | 'sell';
}

interface TradeBubbleChartRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    visible: boolean;
    data?: TradeBubble[];
}

export const TradeBubbleChartRenderer: React.FC<TradeBubbleChartRendererProps> = ({ chart, series, visible, data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderData, setRenderData] = useState<{ x: number; y: number; size: number; side: string; volume: number }[]>([]);

    useEffect(() => {
        if (!visible || !chart || !series || !data || data.length === 0) {
            setRenderData([]);
            return;
        }

        const updatePositions = () => {
            if (!chart || !series) return;

            const maxVol = Math.max(...data.map(d => d.volume), 1);

            const newData = data.map(d => {
                const x = chart.timeScale().timeToCoordinate(d.time as any);
                const y = series.priceToCoordinate(d.price);
                
                if (x === null || y === null) return null;

                // Map volume to a bubble size (min 10px, max 60px)
                const size = 10 + (d.volume / maxVol) * 50;

                return {
                    x,
                    y,
                    size,
                    side: d.side,
                    volume: d.volume
                };
            }).filter(d => d !== null) as { x: number; y: number; size: number; side: string; volume: number }[];

            setRenderData(newData);
        };

        updatePositions();

        chart.timeScale().subscribeVisibleTimeRangeChange(updatePositions);
        chart.timeScale().subscribeVisibleLogicalRangeChange(updatePositions);
        chart.subscribeCrosshairMove(updatePositions);

        return () => {
            chart.timeScale().unsubscribeVisibleTimeRangeChange(updatePositions);
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePositions);
            chart.unsubscribeCrosshairMove(updatePositions);
        };
    }, [chart, series, data, visible]);

    if (!visible || !chart || !series || renderData.length === 0) return null;

    return (
        <div ref={containerRef} className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
            {renderData.map((d, i) => (
                <div
                    key={i}
                    className="absolute rounded-full flex items-center justify-center transition-all duration-300"
                    style={{
                        left: `${d.x - d.size / 2}px`,
                        top: `${d.y - d.size / 2}px`,
                        width: `${d.size}px`,
                        height: `${d.size}px`,
                        backgroundColor: d.side === 'buy' ? 'rgba(34, 197, 94, 0.4)' : 'rgba(239, 68, 68, 0.4)',
                        border: `1px solid ${d.side === 'buy' ? 'rgba(34, 197, 94, 0.8)' : 'rgba(239, 68, 68, 0.8)'}`,
                        boxShadow: `0 0 10px ${d.side === 'buy' ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)'}`,
                        backdropFilter: 'blur(2px)'
                    }}
                >
                    {d.size > 30 && (
                        <span className="text-[9px] font-bold text-white drop-shadow-md">
                            {d.volume >= 1000 ? (d.volume / 1000).toFixed(1) + 'k' : d.volume.toFixed(0)}
                        </span>
                    )}
                </div>
            ))}
        </div>
    );
};
