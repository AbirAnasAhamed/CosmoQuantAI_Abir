import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface TPOData {
    tick_size: number;
    tpo: { price: number; count: number }[];
}

interface TPOProfileRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    visible: boolean;
    data?: TPOData;
}

export const TPOProfileRenderer: React.FC<TPOProfileRendererProps> = ({ chart, series, visible, data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderData, setRenderData] = useState<{ y: number; price: number; width: number; count: number }[]>([]);

    useEffect(() => {
        if (!visible || !chart || !series || !data || !data.tpo || data.tpo.length === 0) {
            setRenderData([]);
            return;
        }

        const updatePositions = () => {
            if (!chart || !series) return;

            const maxCount = Math.max(...data.tpo.map(d => d.count), 1);

            const newData = data.tpo.map(d => {
                const y = series.priceToCoordinate(d.price);
                return {
                    y: y !== null ? y : -1,
                    price: d.price,
                    count: d.count,
                    width: (d.count / maxCount) * 100 // max width of the container
                };
            }).filter(d => d.y !== -1);

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
        <div
            ref={containerRef}
            className="absolute top-0 left-0 w-[250px] h-full pointer-events-none z-10 opacity-70 mix-blend-screen"
        >
            {renderData.map((d, i) => (
                <div
                    key={i}
                    className="absolute left-0 flex items-center transition-all duration-300"
                    style={{
                        top: `${d.y - 3}px`,
                        height: '6px',
                        width: `${Math.max(2, d.width)}%`,
                    }}
                >
                    <div className="h-full w-full bg-blue-500/40 border border-blue-400/50 rounded-r-sm" />
                </div>
            ))}
        </div>
    );
};
