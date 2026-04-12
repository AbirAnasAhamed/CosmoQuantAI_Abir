import React, { useState, useEffect } from 'react';
import { formatClockTime } from '@/utils/dateUtils';

interface DigitalClockProps {
    className?: string;
}

export const DigitalClock: React.FC<DigitalClockProps> = ({ className = '' }) => {
    const [time, setTime] = useState(new Date());

    useEffect(() => {
        const timer = setInterval(() => {
            setTime(new Date());
        }, 1000);

        return () => clearInterval(timer);
    }, []);

    return (
        <div className={`font-mono text-xl font-bold tracking-widest text-slate-800 dark:text-slate-100 ${className}`}>
            {formatClockTime(time)}
        </div>
    );
};
