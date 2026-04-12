import React from 'react';
import { Skeleton } from '@/components/common/Skeleton';

export const MetricsSkeleton: React.FC = () => {
    return (
        <div className="grid grid-cols-2 gap-4">
            {[...Array(4)].map((_, i) => (
                <div key={i} className="p-4 rounded-xl border border-gray-100 dark:border-gray-800 bg-white dark:bg-gray-900 space-y-3">
                    <div className="flex justify-between items-center">
                        <Skeleton width={80} height={16} />
                        <Skeleton variant="circle" width={24} height={24} />
                    </div>
                    <Skeleton width="60%" height={32} />
                    <Skeleton width="40%" height={16} />
                </div>
            ))}
        </div>
    );
};
