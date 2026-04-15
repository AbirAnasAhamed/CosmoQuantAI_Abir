const ticks = [
    { price: 100.5, bidVolume: 10, askVolume: 5 }, // Top tick, Unfinished Auction expected (both > 0)
    { price: 100.0, bidVolume: 100, askVolume: 10 }, // Bid Imbalance
    { price: 99.5, bidVolume: 80, askVolume: 15 }, // Bid Imbalance
    { price: 99.0, bidVolume: 90, askVolume: 5 }, // Bid Imbalance -> Stacked Imbalance expected!
    { price: 98.5, bidVolume: 50, askVolume: 50 }, // Balanced
    { price: 98.0, bidVolume: 3000, askVolume: 100 }, // Extremely High Volume -> Absorption expected!
    { price: 97.5, bidVolume: 0, askVolume: 10 } // Bottom tick, Finished Auction expected (bid in 0)
];

// Pre-calc Imbalance
ticks.forEach(tick => {
    tick.isImbalance = Math.max(tick.bidVolume, tick.askVolume) > Math.min(tick.bidVolume, tick.askVolume) * 2;
    tick.imbalanceType = tick.isImbalance ? (tick.bidVolume > tick.askVolume ? 'bid' : 'ask') : undefined;
    tick.isStackedImbalance = false;
    tick.isUnfinishedAuction = false;
    tick.isAbsorption = false;
});

// Post-Processing Logic exactly as in useOrderFlowData.ts
let totalVol = 0;
for (let i = 0; i < ticks.length; i++) {
    totalVol += ticks[i].bidVolume + ticks[i].askVolume;
}
const avgTickVol = totalVol / ticks.length;

for (let i = 0; i < ticks.length; i++) {
    const t = ticks[i];
    
    // 1. Unfinished Auction
    if (i === 0 || i === ticks.length - 1) {
        t.isUnfinishedAuction = t.bidVolume > 0 && t.askVolume > 0;
    } else {
        t.isUnfinishedAuction = false;
    }

    // 2. Stacked Imbalance
    if (t.isImbalance && t.imbalanceType) {
        if (i < ticks.length - 2) {
            const t2 = ticks[i + 1];
            const t3 = ticks[i + 2];
            if (t2.isImbalance && t3.isImbalance && 
                t.imbalanceType === (t2.bidVolume > t2.askVolume ? 'bid' : 'ask') && 
                t.imbalanceType === (t3.bidVolume > t3.askVolume ? 'bid' : 'ask')) {
                    t.isStackedImbalance = true;
                    t2.isStackedImbalance = true;
                    t3.isStackedImbalance = true;
                    t2.imbalanceType = t.imbalanceType;
                    t3.imbalanceType = t.imbalanceType;
            }
        }
    }

    // 3. Absorption Check
    const tVol = t.bidVolume + t.askVolume;
    t.isAbsorption = tVol > (avgTickVol * 3.0) && tVol > 0;
}

console.log("=== Footprint Logic Verification Test ===");
console.log(`Average Tick Volume: ${avgTickVol.toFixed(2)}\n`);

ticks.forEach((t, i) => {
    let flags = [];
    if (t.isUnfinishedAuction) flags.push('UNFINISHED AUCTION');
    if (t.isStackedImbalance) flags.push('STACKED IMBALANCE');
    if (t.isAbsorption) flags.push('ABSORPTION GLOW');
    if (t.isImbalance && !t.isStackedImbalance) flags.push(`IMBALANCE (${t.imbalanceType})`);
    
    console.log(`Price: ${t.price} | Bid: ${t.bidVolume} | Ask: ${t.askVolume} ---> [${flags.join(', ')}]`);
});
