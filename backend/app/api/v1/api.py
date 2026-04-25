from fastapi import APIRouter
# ১. sentiment ইম্পোর্ট করো
from app.api.v1.endpoints import auth, users, market_data, strategies, backtest, bots, dashboard, trading, indicators, sentiment, education, arbitrage, system, notifications, grid_bot, analytics, on_chain, fng, market_discovery, block_trades

api_router = APIRouter()
from app.api.v1.endpoints import insider
api_router.include_router(insider.router, prefix="/insider", tags=["insider-trading"])
api_router.include_router(auth.router, prefix="/auth", tags=["auth"])
api_router.include_router(users.router, prefix="/users", tags=["users"])
api_router.include_router(market_data.router, prefix="/market-data", tags=["market-data"])
api_router.include_router(strategies.router, prefix="/strategies", tags=["strategies"])
api_router.include_router(backtest.router, prefix="/backtest", tags=["backtest"])
api_router.include_router(bots.router, prefix="/bots", tags=["bots"])
api_router.include_router(dashboard.router, prefix="/dashboard", tags=["dashboard"])
api_router.include_router(trading.router, prefix="/trading", tags=["trading"])
api_router.include_router(indicators.router, prefix="/indicators", tags=["indicators"])

from app.api.v1.endpoints import portfolio
api_router.include_router(portfolio.router, prefix="/portfolio", tags=["portfolio"])

# ২. রাউটারটি রেজিস্টার করো
api_router.include_router(sentiment.router, prefix="/sentiment", tags=["sentiment"])
api_router.include_router(fng.router, prefix="/fng", tags=["fng"])
api_router.include_router(education.router, prefix="/education", tags=["education"])
api_router.include_router(arbitrage.router, prefix="/arbitrage", tags=["arbitrage-engine"])
api_router.include_router(system.router, prefix="/system", tags=["system"])
api_router.include_router(notifications.router, prefix="/notifications", tags=["notifications"])
api_router.include_router(grid_bot.router, prefix="/grid-bot", tags=["grid-bot"])
from app.api.v1.endpoints import lead_lag
api_router.include_router(lead_lag.router, prefix="/lead-lag-bot", tags=["lead-lag-bot"])
api_router.include_router(analytics.router, prefix="/analytics", tags=["analytics"])
from app.api.v1.endpoints import market_regime
api_router.include_router(market_regime.router, prefix="/analytics", tags=["analytics"])
from app.api.v1.endpoints import whale_alerts, liquidation
api_router.include_router(whale_alerts.router, prefix="/whale-alerts", tags=["whale-alerts"])
api_router.include_router(liquidation.router, prefix="/liquidation", tags=["liquidation"])
api_router.include_router(on_chain.router, prefix="/on-chain", tags=["on-chain"])
api_router.include_router(market_discovery.router, prefix="/market", tags=["market-discovery"])

from app.api.v1.endpoints import event_driven
api_router.include_router(event_driven.router, prefix="/simulation", tags=["event-driven"])

from app.api.v1.endpoints import market_depth
api_router.include_router(market_depth.router, prefix="/market-depth", tags=["market-depth"])
api_router.include_router(block_trades.router, prefix="/block-trades", tags=["block-trades"])

from app.api.v1.endpoints import order_block_bot
api_router.include_router(order_block_bot.router, prefix="/order-block-bot", tags=["order-block-bot"])

from app.api.v1.endpoints import options
api_router.include_router(options.router, prefix="/options", tags=["options"])

from app.api.v1.endpoints import token_unlocks
api_router.include_router(token_unlocks.router, prefix="/token-unlocks", tags=["token-unlocks"])

from app.api.v1.endpoints import institutional
api_router.include_router(institutional.router, prefix="/institutional", tags=["institutional"])

from app.api.v1.endpoints import analyst
api_router.include_router(analyst.router, prefix="/analyst", tags=["analyst"])

from app.api.v1.endpoints import advanced_liquidation
api_router.include_router(advanced_liquidation.router, prefix="/advanced_liquidation", tags=["advanced-liquidation"])

from app.api.v1.endpoints import advanced_metrics
api_router.include_router(advanced_metrics.router, prefix="/advanced-metrics", tags=["advanced-metrics"])
