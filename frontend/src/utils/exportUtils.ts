export const convertArrayToCSV = (arr: any[]): string => {
    if (!arr || arr.length === 0) {
        return '';
    }
    const keys = Object.keys(arr[0]);
    const header = keys.join(',');
    const rows = arr.map(obj => {
        return keys.map(key => {
            let val = obj[key];
            if (val === null || val === undefined) {
                return '';
            }
            // Escape quotes and wrap in quotes if contains comma
            val = String(val).replace(/"/g, '""');
            if (val.search(/("|,|\n)/g) >= 0) {
                val = `"${val}"`;
            }
            return val;
        }).join(',');
    });
    return [header, ...rows].join('\n');
};

export const downloadCSV = (data: any[], filename: string) => {
    const csvData = convertArrayToCSV(data);
    const blob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
};
