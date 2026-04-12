import React from 'react';
import { Skeleton } from '@/components/common/Skeleton';

export const ChartSkeleton: React.FC = () => {
    return (
        <div className="p-6 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 h-[400px] flex flex-col space-y-4">
            <div className="flex justify-between items-center mb-4">
                <Skeleton width={150} height={24} />
                <div className="flex gap-2">
                    {[...Array(3)].map((_, i) => (
                        <Skeleton key={i} width={60} height={32} />
                    ))}
                </div>
            </div>
            <div className="flex-1 flex items-end gap-2">
                {[...Array(20)].map((_, i) => (
                    <Skeleton key={i} width="100%" height={`${Math.random() * 60 + 20}%`} className="rounded-t" />
                ))}
            </div>
        </div>
    );
};
