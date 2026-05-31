import ccxt
import asyncio

async def test():
    e = ccxt.binance()
    t = await e.fetch_tickers()
    valid_pairs = [tick for sym, tick in t.items() if '/USDT' in sym and 'UP/' not in sym and 'DOWN/' not in sym]
    valid_pairs.sort(key=lambda x: float(x.get('quoteVolume', 0) or 0), reverse=True)
    top = valid_pairs[:60]
    
    bullish = 0
    bearish = 0
    for asset in top:
        sym = asset['symbol']
        real_change = float(asset.get('percentage', 0) or 0)
        vwap = float(asset.get('vwap') or asset.get('average') or 0)
        last = float(asset.get('last') or 0)
        
        vwap_trend = 0
        if vwap > 0 and last > 0:
            vwap_trend = ((last - vwap) / vwap) * 150 # AMPlified
            
        bid_vol = float(asset.get('bidVolume') or 0)
        ask_vol = float(asset.get('askVolume') or 0)
        
        obi = 0
        if (bid_vol + ask_vol) > 0:
            obi = (bid_vol - ask_vol) / (bid_vol + ask_vol)
            obi = obi * 2.0 # Amplify
        
        sentiment = (obi * 0.8) + (vwap_trend * 0.2)
        sentiment = max(-0.95, min(0.95, sentiment))
        
        if real_change < -2.0 and sentiment > 0.5:
            bullish += 1
            print(f"BULL DIV: {sym} | Change: {real_change} | Sent: {sentiment:.2f} | OBI: {obi/2:.2f}")
        elif real_change > 2.0 and sentiment < -0.2:
            bearish += 1
            print(f"BEAR DIV: {sym} | Change: {real_change} | Sent: {sentiment:.2f} | OBI: {obi/2:.2f}")
            
    print(f"Total Bullish: {bullish}, Total Bearish: {bearish}")
    await e.close()

asyncio.run(test())
