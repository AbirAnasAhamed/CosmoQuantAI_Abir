import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface DeltaProfileData {
    price: number;
    buy_vol: number;
    sell_vol: number;
    delta: number;
}

interface DeltaProfileRendererProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    visible: boolean;
    data?: DeltaProfileData[];
}

export const DeltaProfileRenderer: React.FC<DeltaProfileRendererProps> = ({ chart, series, visible, data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderData, setRenderData] = useState<{ y: number; price: number; buyWidth: number; sellWidth: number; isBuyDominant: boolean }[]>([]);

    useEffect(() => {
        if (!visible || !chart || !series || !data || data.length === 0) {
            setRenderData([]);
            return;
        }

        const updatePositions = () => {
            if (!chart || !series) return;

            const maxVol = Math.max(...data.map(d => Math.max(d.buy_vol, d.sell_vol, 1)));

            const newData = data.map(d => {
                const y = series.priceToCoordinate(d.price);
                return {
                    y: y !== null ? y : -1,
                    price: d.price,
                    buyWidth: (d.buy_vol / maxVol) * 100, // percentage max width
                    sellWidth: (d.sell_vol / maxVol) * 100,
                    isBuyDominant: d.buy_vol > d.sell_vol
                };
            }).filter(d => d.y !== -1);

            setRenderData(newData);
        };

        updatePositions();

        // Subscribe to relevant chart events to update coordinates
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
            className="absolute top-0 right-[60px] w-[200px] h-full pointer-events-none z-10 opacity-90"
        >
            {renderData.map((d, i) => (
                <div
                    key={i}
                    className="absolute right-0 flex overflow-hidden rounded-l-md transition-all duration-300 shadow-[0_0_5px_rgba(0,0,0,0.5)]"
                    style={{
                        top: `${d.y - 4}px`,
                        height: '10px',
                        width: '100%',
                        justifyContent: 'flex-end' // Align bars to the right side
                    }}
                >
                    {/* Sell Volume Bar (Red) */}
                    <div
                        className="h-full bg-gradient-to-l from-red-600/80 to-red-400/90 border-y border-l border-red-400/50"
                        style={{ width: `${Math.max(1, d.sellWidth)}%` }}
                    />
                    {/* Buy Volume Bar (Green) */}
                    <div
                        className="h-full bg-gradient-to-l from-green-600/80 to-green-400/90 border-y border-l border-green-400/50"
                        style={{ width: `${Math.max(1, d.buyWidth)}%` }}
                    />
                </div>
            ))}
        </div>
    );
};
