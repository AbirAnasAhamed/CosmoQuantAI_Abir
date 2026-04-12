class OnChainService:
    def calculate_pressure(self, inflow: float, outflow: float) -> str:
        """
        Determines the market pressure based on inflow vs outflow.
        """
        if inflow > outflow:
            return "High Sell Pressure"  # Negative Sentiment
        elif outflow > inflow:
            return "Strong Buying Pressure"  # Positive Sentiment
        return "Neutral"

    async def get_latest_metrics(self, symbol: str):
        """
        Returns real-time exchange liquidity proxy data by calculating 
        the total capital resting in the orderbook (Bids vs Asks).
        """
        import ccxt.async_support as ccxt
        from datetime import datetime
        
        # Standardize symbol for ccxt
        ccxt_symbol = symbol
        if "/" not in symbol:
            ccxt_symbol = f"{symbol}/USDT"
            
        exchange = None
        try:
            exchange = ccxt.binance()
            # Fetch limited orderbook to measure immediate liquidity
            orderbook = await exchange.fetch_order_book(ccxt_symbol, limit=100)
            
            # Sum up total liquidity in base asset (approximated inflow/outflow liquidity)
            # This represents resting money waiting to buy (inflow) vs sell (outflow)
            total_bids_base = sum(amount for price, amount in orderbook['bids'])
            total_asks_base = sum(amount for price, amount in orderbook['asks'])
            
            # Multiply by best price to get approximate USD value (In millions)
            best_bid = orderbook['bids'][0][0] if orderbook['bids'] else 0
            
            # Dividing by 1_000_000 so the UI numbers are readable
            inflow = (total_bids_base * best_bid) / 1_000_000
            outflow = (total_asks_base * best_bid) / 1_000_000
            
            status = self.calculate_pressure(inflow, outflow)
            
            return {
                "symbol": ccxt_symbol.split("/")[0],
                "exchange_inflow_volume": round(inflow, 2),  # In Millions USD
                "exchange_outflow_volume": round(outflow, 2), # In Millions USD
                "net_flow_status": status,
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
            
        except Exception as e:
            print(f"Error fetching real liquidity orderbook: {e}")
            # Fallback if specific exchange/symbol fails
            return {
                "symbol": symbol,
                "exchange_inflow_volume": 0.0,
                "exchange_outflow_volume": 0.0,
                "net_flow_status": "Neutral",
                "timestamp": datetime.utcnow().isoformat() + "Z"
            }
        finally:
            if exchange:
                await exchange.close()
on_chain_service = OnChainService()
