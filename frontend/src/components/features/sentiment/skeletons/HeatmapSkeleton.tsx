import React from 'react';
import { Skeleton } from '@/components/common/Skeleton';

export const HeatmapSkeleton: React.FC = () => {
    return (
        <div className="p-6 rounded-2xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900">
            <div className="flex justify-between items-center mb-6">
                <Skeleton width={200} height={28} />
                <Skeleton width={120} height={36} />
            </div>
            <div className="grid grid-cols-4 md:grid-cols-8 gap-1">
                {[...Array(32)].map((_, i) => (
                    <Skeleton key={i} className="aspect-square rounded-sm" />
                ))}
            </div>
        </div>
    );
};
