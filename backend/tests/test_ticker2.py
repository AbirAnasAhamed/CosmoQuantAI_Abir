import ccxt
import json
e = ccxt.binance()
t = e.fetch_tickers(['BTC/USDT'])
with open("test_ticker3.json", "w") as f:
    json.dump(t['BTC/USDT'], f, indent=2)
