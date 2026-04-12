export function formatFootprintVolume(volume: number | undefined | null): string {
    if (volume === 0 || !volume) return "0";

    // If it's a whole number, return as is
    if (Number.isInteger(volume)) {
        return volume.toString();
    }

    // For large numbers, format with k or M suffix
    if (volume >= 1000000) {
        return (volume / 1000000).toFixed(volume >= 10000000 ? 1 : 2) + 'M';
    }
    if (volume >= 1000) {
        return (volume / 1000).toFixed(volume >= 10000 ? 0 : 1) + 'k';
    }

    if (volume < 1) {
        return parseFloat(volume.toFixed(4)).toString();
    }
    return Math.floor(volume).toString();
}
