import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface SpoofingDetectionRendererProps {
    chart: any;
    series: any;
    visible: boolean;
    data?: any;
}

export const SpoofingDetectionRenderer: React.FC<SpoofingDetectionRendererProps> = ({ chart, series, visible, data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderData, setRenderData] = useState<{ y: number; price: number; size: number; side: string }[]>([]);

    useEffect(() => {
        if (!visible || !chart || !series || !data || data.length === 0) {
            setRenderData([]);
            return;
        }

        const updatePositions = () => {
            if (!chart || !series) return;

            const newData = data.map((d: any) => {
                const y = series.priceToCoordinate(d.price);
                return {
                    y: y !== null ? y : -1,
                    price: d.price,
                    size: d.size,
                    side: d.side
                };
            }).filter((d: any) => d.y !== -1);

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
        <div ref={containerRef} className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
            {renderData.map((d, i) => (
                <div
                    key={i}
                    className="absolute right-0 flex items-center justify-end pr-2 font-bold text-xs"
                    style={{
                        top: `${d.y - 10}px`,
                        height: '20px',
                        width: '100%',
                        background: `linear-gradient(to left, ${d.side === 'buy' ? 'rgba(34,197,94,0.4)' : 'rgba(239,68,68,0.4)'}, transparent)`,
                        borderRight: `4px solid ${d.side === 'buy' ? '#22c55e' : '#ef4444'}`,
                        color: d.side === 'buy' ? '#22c55e' : '#ef4444',
                        textShadow: '0px 0px 4px black'
                    }}
                >
                    SPOOF WALL: {d.size.toFixed(2)}
                </div>
            ))}
        </div>
    );
};
