import { useState } from 'react';

export const useVolumeFilter = (initialThreshold: number = 5000000) => {
    const [volumeThreshold, setVolumeThreshold] = useState<number>(initialThreshold);
    const [volumeMode, setVolumeMode] = useState<'base' | 'quote'>('base');

    return { volumeThreshold, setVolumeThreshold, volumeMode, setVolumeMode };
};
