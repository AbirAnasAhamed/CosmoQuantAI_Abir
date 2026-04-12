const fs = require('fs');

const data = [];
let price = 0.09;
for (let i = 0; i < 500; i++) {
    price = price * (1 + (Math.random() - 0.5) * 0.01);
    data.push({
        time: 1600000000 + i * 60,
        close: price
    });
}

function calculateAdaptiveTrendFinder(data, mode, devMultiplier) {
    if (!data || data.length === 0) return null;

    const lengthEnd = mode === 'short' ? 200 : 1200;
    const startIndex = mode === 'short' ? 20 : 300;
    const lengthIterEnd = Math.min(lengthEnd, data.length);
    
    if (data.length < startIndex) return null;

    const periods = [];
    for (let l = startIndex; l <= lengthIterEnd; l++) {
        periods.push(l);
    }

    let bestPearsonR = -1;
    let bestPeriod = 0;
    let bestStdDev = 0;

    const MathLogStr = new Float64Array(data.length);
    for (let i = 0; i < data.length; i++) {
        MathLogStr[i] = Math.log(data[i].close);
    }

    let detectedSlope = 0;
    let detectedIntercept = 0;
    let actualPearsonRSigned = 0;

    for (const length of periods) {
        if (data.length < length) continue;
        
        let sumX = 0;
        let sumXX = 0;
        let sumYX = 0;
        let sumY = 0;
        
        for (let i = 1; i <= length; i++) {
            const idx = data.length - i;
            const lSrc = MathLogStr[idx];
            sumX += i;
            sumXX += i * i;
            sumYX += i * lSrc;
            sumY += lSrc;
        }

        const denominator = (length * sumXX - sumX * sumX);
        const slope = denominator === 0 ? 0 : (length * sumYX - sumX * sumY) / denominator;
        const average = sumY / length;
        const intercept = average - slope * sumX / length + slope;
        
        const period_1 = length - 1;
        const regres = intercept + slope * period_1 * 0.5;
        let sumSlp = intercept;
        
        let sumDxx = 0;
        let sumDyy = 0;
        let sumDyx = 0;
        let sumDev = 0;
        
        for (let i = 0; i <= period_1; i++) {
            const idx = data.length - 1 - i;
            let lSrc = MathLogStr[idx];
            const dxt = lSrc - average;
            const dyt = sumSlp - regres;
            
            lSrc = lSrc - sumSlp;
            sumSlp += slope;
            
            sumDxx += dxt * dxt;
            sumDyy += dyt * dyt;
            sumDyx += dxt * dyt;
            sumDev += lSrc * lSrc;
        }
        
        const unStdDev = Math.sqrt(sumDev / period_1);
        const divisor = sumDxx * sumDyy;
        const pearsonR = divisor === 0 ? 0 : sumDyx / Math.sqrt(divisor);
        
        if (Math.abs(pearsonR) > Math.abs(bestPearsonR)) {
            bestPearsonR = Math.abs(pearsonR);
            actualPearsonRSigned = pearsonR;
            bestPeriod = length;
            bestStdDev = unStdDev;
            detectedSlope = slope;
            detectedIntercept = intercept;
        }
    }

    if (bestPearsonR === -1 || bestStdDev === 0) return null;

    const points = [];
    const pointsLength = Math.min(bestPeriod, data.length);
    
    for (let i = 0; i < pointsLength; i++) {
        const idx = data.length - 1 - i;
        const midLog = detectedIntercept + detectedSlope * i;
        const midVal = Math.exp(midLog);
        
        const upperVal = midVal * Math.exp(devMultiplier * bestStdDev);
        const lowerVal = midVal / Math.exp(devMultiplier * bestStdDev);
        
        points.push({
            time: data[idx].time,
            value: midVal,
            upper: upperVal,
            lower: lowerVal
        });
    }
    
    points.reverse();

    return {
        bestPearsonR,
        pointsLength: points.length,
        firstPoint: points[0],
        lastPoint: points[points.length - 1]
    };
}

const res = calculateAdaptiveTrendFinder(data, 'short', 2);
console.log(JSON.stringify(res, null, 2));
