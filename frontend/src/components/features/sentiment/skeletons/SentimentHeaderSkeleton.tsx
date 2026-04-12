import React from 'react';
import { Skeleton } from '@/components/common/Skeleton';

export const SentimentHeaderSkeleton: React.FC = () => {
    return (
        <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
            <div className="flex items-center gap-4">
                <Skeleton variant="circle" width={48} height={48} />
                <div className="space-y-2">
                    <Skeleton width={120} height={24} />
                    <Skeleton width={80} height={16} />
                </div>
            </div>
            <div className="flex items-center gap-3">
                <Skeleton width={100} height={40} />
                <Skeleton width={100} height={40} />
                <Skeleton width={40} height={40} />
            </div>
        </div>
    );
};
