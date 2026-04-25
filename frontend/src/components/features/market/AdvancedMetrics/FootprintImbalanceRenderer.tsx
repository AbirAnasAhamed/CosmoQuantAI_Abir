import React, { useEffect, useState, useRef } from 'react';
import { IChartApi, ISeriesApi } from 'lightweight-charts';

interface FootprintImbalanceRendererProps {
    chart: any;
    series: any;
    visible: boolean;
    data?: any;
}

export const FootprintImbalanceRenderer: React.FC<FootprintImbalanceRendererProps> = ({ chart, series, visible, data }) => {
    const containerRef = useRef<HTMLDivElement>(null);
    const [renderData, setRenderData] = useState<{ y: number; price: number; type: string; ratio: number }[]>([]);

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
                    type: d.type,
                    ratio: d.ratio
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
                    className="absolute flex items-center justify-center font-bold text-[10px] rounded"
                    style={{
                        left: '50%',
                        transform: 'translateX(-50%)',
                        top: `${d.y - 8}px`,
                        height: '16px',
                        width: '80px',
                        background: d.type === 'buy_imbalance' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)',
                        border: `1px solid ${d.type === 'buy_imbalance' ? '#22c55e' : '#ef4444'}`,
                        color: d.type === 'buy_imbalance' ? '#22c55e' : '#ef4444',
                        boxShadow: `0 0 10px ${d.type === 'buy_imbalance' ? '#22c55e' : '#ef4444'}`,
                        backdropFilter: 'blur(2px)'
                    }}
                >
                    {d.ratio >= 999 ? 'MAX IMB' : `${d.ratio.toFixed(1)}x IMB`}
                </div>
            ))}
        </div>
    );
};
