import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface DeltaDivergenceRendererProps {
    chart: any;
    series: any;
    visible: boolean;
    data?: any;
}

export const DeltaDivergenceRenderer: React.FC<DeltaDivergenceRendererProps> = ({ chart, series, visible, data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderData, setRenderData] = useState<{ x: number; y: number; type: string; message: string }[]>([]);

    useEffect(() => {
        if (!visible || !chart || !series || !data || data.length === 0) {
            setRenderData([]);
            return;
        }

        const updatePositions = () => {
            if (!chart || !series) return;

            const newData = data.map((d: any) => {
                const x = chart.timeScale().timeToCoordinate(d.time as any);
                const logical = chart.timeScale().coordinateToLogical(x || 0);
                let price = 0;
                
                // Try to get price from series data if possible, else just place it at bottom/top
                if (logical !== null) {
                    const dataAtLogical = series.dataByIndex(Math.floor(logical), 0);
                    if (dataAtLogical) {
                        price = d.type === 'bearish' ? (dataAtLogical as any).high : (dataAtLogical as any).low;
                    }
                }
                
                const y = series.priceToCoordinate(price);
                
                return {
                    x: x !== null ? x : -1,
                    y: y !== null ? y : -1,
                    type: d.type,
                    message: d.message
                };
            }).filter((d: any) => d.x !== -1 && d.y !== -1);

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
        <div ref={containerRef} className="absolute inset-0 pointer-events-none z-40 overflow-hidden">
            {renderData.map((d, i) => (
                <div
                    key={i}
                    className="absolute flex flex-col items-center justify-center font-bold text-[16px] drop-shadow-[0_0_5px_black]"
                    style={{
                        left: `${d.x - 10}px`,
                        top: d.type === 'bearish' ? `${d.y - 30}px` : `${d.y + 10}px`,
                        color: d.type === 'bearish' ? '#ef4444' : '#22c55e',
                    }}
                    title={d.message}
                >
                    {d.type === 'bearish' ? '▼' : '▲'}
                    <span className="text-[9px] bg-black/60 rounded px-1">{d.type === 'bearish' ? 'BEAR DIV' : 'BULL DIV'}</span>
                </div>
            ))}
        </div>
    );
};
