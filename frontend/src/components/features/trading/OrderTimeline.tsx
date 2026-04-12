import React from 'react';
import { CheckCircle, Clock, Circle } from 'lucide-react';

interface OrderSlice {
    order_index: number;
    scheduled_time: string;
    quantity: number;
    status: 'pending' | 'executed' | 'scheduled';
}

interface OrderTimelineProps {
    slices: OrderSlice[];
}

const OrderTimeline: React.FC<OrderTimelineProps> = ({ slices }) => {
    return (
        <div className="relative pl-4 border-l-2 border-gray-200 dark:border-white/10 space-y-6 my-4">
            {slices.map((slice, idx) => {
                const isFirst = idx === 0;
                const isLast = idx === slices.length - 1;
                const time = new Date(slice.scheduled_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                return (
                    <div key={idx} className="relative flex items-center gap-4 animate-fade-in-right" style={{ animationDelay: `${idx * 50}ms` }}>
                        {/* Dot Indicator */}
                        <div className={`absolute -left-[21px] w-3 h-3 rounded-full border-2 bg-white dark:bg-brand-darkest transition-colors duration-300
                            ${slice.status === 'executed' ? 'border-emerald-500 bg-emerald-500' :
                                slice.status === 'scheduled' ? 'border-blue-500' : 'border-gray-300 dark:border-gray-600'}`}
                        />

                        <div className="flex-1 bg-white dark:bg-white/5 rounded-lg p-3 border border-gray-100 dark:border-white/5 hover:border-brand-primary/30 transition-all shadow-sm">
                            <div className="flex justify-between items-center mb-1">
                                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
                                    <Clock size={10} /> {time}
                                </span>
                                <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded
                                    ${slice.status === 'executed' ? 'bg-emerald-500/10 text-emerald-500' :
                                        slice.status === 'scheduled' ? 'bg-blue-500/10 text-blue-500' : 'bg-gray-200 dark:bg-gray-700 text-gray-400'}`}>
                                    {slice.status}
                                </span>
                            </div>
                            <div className="flex justify-between items-end">
                                <div>
                                    <div className="text-xs text-gray-400">Order #{slice.order_index}</div>
                                    <div className="text-sm font-mono font-bold text-slate-900 dark:text-white">
                                        {slice.quantity.toFixed(4)} <span className="text-xs font-normal text-gray-500">BTC</span>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                );
            })}
            {slices.length === 0 && (
                <div className="text-center text-xs text-gray-400 py-4 italic">
                    Configure parameters and click "Analyze Impact" to preview schedule.
                </div>
            )}
        </div>
    );
};

export default OrderTimeline;
