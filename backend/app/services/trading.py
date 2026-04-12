import asyncio
import random
import logging

logger = logging.getLogger(__name__)

async def execute_large_order(exchange, symbol: str, amount: float, side: str, chunks: int = 5):
    """
    Splits a large order into smaller chunks to minimize slippage.
    
    :param exchange: CCXT exchange instance (async)
    :param symbol: Trading pair (e.g., 'BTC/USDT')
    :param amount: Total amount to trade (in Base Currency for Buy, or Quote for Sell? 
                   Standard CCXT create_market_order takes 'amount' in Base Currency usually)
    :param side: 'buy' or 'sell'
    :param chunks: Number of chunks to split the order into
    :return: List of executed order objects
    """
    
    chunk_size = amount / chunks
    executed_orders = []
    
    logger.info(f"🚀 SOR: Starting {side.upper()} order for {amount} {symbol} in {chunks} chunks of {chunk_size}...")

    for i in range(chunks):
        try:
            # Random delay 2-5 seconds (except for the first chunk if needed, but requirements said between chunks)
            if i > 0:
                delay = random.uniform(2, 5)
                logger.info(f"⏳ SOR: Waiting {delay:.2f}s before chunk {i+1}...")
                await asyncio.sleep(delay)

            logger.info(f"🔄 SOR: Executing Chunk {i+1}/{chunks} ({chunk_size} {symbol})...")
            
            if side == 'buy':
                order = await exchange.create_market_buy_order(symbol, chunk_size)
            elif side == 'sell':
                order = await exchange.create_market_sell_order(symbol, chunk_size)
            else:
                raise ValueError("Invalid side. Must be 'buy' or 'sell'.")
            
            executed_orders.append(order)
            logger.info(f"✅ SOR: Chunk {i+1} Success. Order ID: {order.get('id')}")
            
        except Exception as e:
            logger.error(f"❌ SOR Error on Chunk {i+1}: {str(e)}")
            # Decision: Stop or Continue? Usually stop to avoid partial fills becoming messy without tracking.
            # For this basic implementation, we might want to raise or return what we have.
            raise e

    return executed_orders
