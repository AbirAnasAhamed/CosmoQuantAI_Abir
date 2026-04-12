/**
 * Formats a UTC date string or number to a local time string (e.g., "10:30 PM").
 * @param utcDate - The UTC date string or timestamp.
 * @returns The formatted local time string.
 */
export const formatToLocalTime = (utcDate: string | number): string => {
    if (!utcDate) return '';
    try {
        const date = new Date(utcDate);
        return new Intl.DateTimeFormat(undefined, {
            hour: 'numeric',
            minute: 'numeric',
            hour12: true,
        }).format(date);
    } catch (e) {
        console.error("Invalid date for formatToLocalTime:", utcDate);
        return String(utcDate);
    }
};

/**
 * Formats a UTC date string or number to a local date string (e.g., "Oct 25").
 * @param utcDate - The UTC date string or timestamp.
 * @returns The formatted local date string.
 */
export const formatToLocalDate = (utcDate: string | number): string => {
    if (!utcDate) return '';
    try {
        const date = new Date(utcDate);
        return new Intl.DateTimeFormat(undefined, {
            month: 'short',
            day: 'numeric',
        }).format(date);
    } catch (e) {
        console.error("Invalid date for formatToLocalDate:", utcDate);
        return String(utcDate);
    }
};

/**
 * Formats a UTC date string or number to a relative time string (e.g., "5 mins ago") or local time/date if older.
 * @param utcDate - The UTC date string or timestamp.
 * @returns The formatted relative time string.
 */
export const formatRelativeTime = (utcDate: string | number): string => {
    if (!utcDate) return '';
    try {
        const date = new Date(utcDate);
        const now = new Date();
        const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

        if (diffInSeconds < 60) {
            return 'Just now';
        }

        const diffInMinutes = Math.floor(diffInSeconds / 60);
        if (diffInMinutes < 60) {
            return `${diffInMinutes} mins ago`;
        }

        const diffInHours = Math.floor(diffInMinutes / 60);
        if (diffInHours < 24) {
            return `${diffInHours} hours ago`;
        }

        // If older than 24 hours, return the date
        return formatToLocalDate(utcDate);

    } catch (e) {
        console.error("Invalid date for formatRelativeTime:", utcDate);
        return String(utcDate);
    }
};

/**
 * Formats a Date object or timestamp to a 12-hour clock string with seconds (e.g., "10:30:45 PM").
 * @param date - The Date object or timestamp.
 * @returns The formatted clock string.
 */
export const formatClockTime = (date: Date | string | number): string => {
    try {
        const d = new Date(date);
        return new Intl.DateTimeFormat(undefined, {
            hour: '2-digit',
            minute: '2-digit',
            second: '2-digit',
            hour12: true,
        }).format(d);
    } catch (e) {
        console.error("Invalid date for formatClockTime:", date);
        return "";
    }
};
