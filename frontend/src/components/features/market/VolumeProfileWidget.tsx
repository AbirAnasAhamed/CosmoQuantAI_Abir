import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

export interface VPVRData {
    price: number;
    volume: number;
    buyVolume: number;
    sellVolume: number;
}

interface VolumeProfileWidgetProps {
    chart: IChartApi | null;
    series: ISeriesApi<'Candlestick'> | null;
    data: VPVRData[];
}

export const VolumeProfileWidget: React.FC<VolumeProfileWidgetProps> = ({ chart, series, data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderData, setRenderData] = useState<{ y: number; width: number; totalWidth: number; buyRatio: number; price: number }[]>([]);

    useEffect(() => {
        if (!chart || !series || data.length === 0) return;

        const updatePositions = () => {
            if (!chart || !series || !containerRef.current) return;

            const maxVol = Math.max(...data.map(d => d.volume), 1);

            const newData = data.map(d => {
                const y = series.priceToCoordinate(d.price);
                return {
                    y: y !== null ? y : -1,
                    price: d.price,
                    width: (d.volume / maxVol) * 100, // percentage max width
                    totalWidth: d.volume,
                    buyRatio: d.buyVolume / (d.volume || 1)
                };
            }).filter(d => d.y !== -1);

            setRenderData(newData);
        };

        updatePositions();

        // Subscribe to relevant chart events to update coordinates
        chart.timeScale().subscribeVisibleTimeRangeChange(updatePositions);
        chart.timeScale().subscribeVisibleLogicalRangeChange(updatePositions);
        chart.subscribeCrosshairMove(updatePositions);

        // Periodically poll to catch price scale animations
        const interval = setInterval(updatePositions, 100);

        return () => {
            chart.timeScale().unsubscribeVisibleTimeRangeChange(updatePositions);
            chart.timeScale().unsubscribeVisibleLogicalRangeChange(updatePositions);
            chart.unsubscribeCrosshairMove(updatePositions);
            clearInterval(interval);
        };
    }, [chart, series, data]);

    if (!chart || !series) return null;

    return (
        <div
            ref={containerRef}
            className="absolute top-0 left-[0px] w-[200px] h-full pointer-events-none z-10 opacity-80"
        >
            {renderData.map((d, i) => {
                // Determine dominating volume for glow effect
                const isBuyDom = d.buyRatio > 0.5;
                const glowClass = isBuyDom
                    ? "shadow-[0_0_8px_rgba(34,197,94,0.4)]"
                    : "shadow-[0_0_8px_rgba(239,68,68,0.4)]";

                return (
                    <div
                        key={i}
                        className={`absolute left-0 flex overflow-hidden rounded-r-md transition-all duration-300 ${glowClass}`}
                        style={{
                            top: `${d.y - 4}px`,
                            height: '10px',
                            width: `${Math.max(2, d.width)}%`, // Ensure the bar is at least 2% wide to be visible
                        }}
                    >
                        {/* Buy Volume Bar */}
                        <div
                            className="h-full bg-gradient-to-r from-green-600/60 to-green-400/80 border-y border-r border-green-400/40 relative"
                            style={{ width: `${d.buyRatio * 100}%` }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
                        </div>
                        {/* Sell Volume Bar */}
                        <div
                            className="h-full bg-gradient-to-r from-red-600/60 to-red-400/80 border-y border-l border-red-400/40 relative"
                            style={{ width: `${(1 - d.buyRatio) * 100}%` }}
                        >
                            <div className="absolute inset-0 bg-gradient-to-b from-white/10 to-transparent" />
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
