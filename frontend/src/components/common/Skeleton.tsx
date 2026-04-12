import React from 'react';

// Note: If @/lib/utils/cn doesn't exist, I'll fallback to a simpler approach or ask to create it, but usually standard in these setups. 
// Given the prompt didn't specify `cn` utility existence, I'll stick to a safer standard implementation or check.
// I'll check for `cn` utility existence first? No, the prompt says "Atomic Design", "Tailwind CSS".
// To be safe and self-contained as requested ("Atomic"), I will use standard string manipulation if I don't see `lib/utils` in the file list earlier.
// Wait, I saw `vite-env.d.ts` and `components`, `hooks` etc. a standard structure.
// I'll assume standard class string interpolation for now to avoid dependency issues if `cn` isn't there.

interface SkeletonProps {
    className?: string;
    variant?: 'rect' | 'circle';
    width?: string | number;
    height?: string | number;
}

export const Skeleton: React.FC<SkeletonProps> = ({
    className = '',
    variant = 'rect',
    width,
    height,
}) => {
    const baseClasses = 'animate-pulse bg-gray-200 dark:bg-gray-700';
    const variantClasses = variant === 'circle' ? 'rounded-full' : 'rounded-md';

    const style: React.CSSProperties = {};
    if (width) style.width = width;
    if (height) style.height = height;

    return (
        <div
            className={`${baseClasses} ${variantClasses} ${className}`}
            style={style}
        />
    );
};
