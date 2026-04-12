from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, Query
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Optional
import json
import asyncio
import random
from datetime import datetime, timedelta

from app.api import deps
from app import models
from app.models.bot import Bot
from app.models.backtest import Backtest
from app.schemas.dashboard import DashboardSummary, BotSummary, BacktestSummary, PortfolioValuePoint, AllocationPoint
from app.services.websocket_manager import manager
from app.core.security import verify_token

router = APIRouter()

def generate_equity_curve(final_value: float, points: int = 6) -> List[PortfolioValuePoint]:
    data = []
    current_value = final_value * 0.7 # Start at 70%
    months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"]
    
    # Get last N months
    current_month_idx = datetime.now().month - 1
    start_idx = (current_month_idx - points + 1) % 12
    
    for i in range(points):
        month_name = months[(start_idx + i) % 12]
        # Random growth
        growth = random.uniform(0.95, 1.15)
        if i == points - 1:
            value = final_value
        else:
            value = current_value * growth
            current_value = value
            
        data.append(PortfolioValuePoint(name=month_name, value=round(value, 2)))
        
    return data

from datetime import datetime, timedelta
from app.models.portfolio import PortfolioSnapshot

@router.get("/summary", response_model=DashboardSummary)
def get_dashboard_summary(
    db: Session = Depends(deps.get_db),
    current_user: models.User = Depends(deps.get_current_user)
):
    """
    Get dynamic dashboard summary data with real portfolio tracking.
    """
    # 1. Active Bots & PnL
    active_bots_query = db.query(Bot).filter(Bot.owner_id == current_user.id, Bot.status == "active")
    active_bots = active_bots_query.all()
    active_bots_count = len(active_bots)
    
    total_bot_pnl = sum(bot.pnl for bot in active_bots) or 0.0
    total_invested = sum(bot.trade_value for bot in active_bots) or 0.0
    
    # 2. Total Equity
    # Current Equity = User Balance (Cash) + Invested (Bots) + Total PnL
    # Assuming user.balance tracks Available Cash
    user_cash = current_user.balance if current_user.balance is not None else 25000.0
    total_equity = user_cash + total_invested + total_bot_pnl
    
    # 3. Snapshot History for 24h Changes
    # Search for a snapshot roughly 24h ago
    one_day_ago = datetime.now() - timedelta(days=1)
    
    # Check if we need to SEED an initial snapshot (for fresh users/demo)
    # If no snapshots exist, create a "yesterday" snapshot so we have a reference point.
    has_snapshots = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.owner_id == current_user.id).count() > 0
    
    if not has_snapshots:
        # Create a "Start" snapshot backdated to yesterday
        initial_snap = PortfolioSnapshot(
            owner_id=current_user.id,
            timestamp=one_day_ago,
            total_equity=25000.0, # Default starting equity
            cash_balance=25000.0,
            invested_amount=0.0
        )
        db.add(initial_snap)
        db.commit()
    
    # Now record "Current" state as a snapshot if last one is too old (> 1 hr)
    last_snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.owner_id == current_user.id).order_by(PortfolioSnapshot.timestamp.desc()).first()
    
    # Simple logic: If > 1hr since last snapshot, save current state
    # Handle timezone differences (make both naive or both aware)
    now = datetime.now()
    should_snapshot = False
    
    if not last_snap:
        should_snapshot = True
    else:
        last_ts = last_snap.timestamp
        # Make naive for comparison if needed
        if last_ts.tzinfo:
            last_ts = last_ts.replace(tzinfo=None)
            
        if (now - last_ts).total_seconds() > 3600:
            should_snapshot = True
            
    if should_snapshot:
        new_snap = PortfolioSnapshot(
            owner_id=current_user.id,
            total_equity=total_equity,
            cash_balance=user_cash,
            invested_amount=total_invested + total_bot_pnl # Treating pnl as part of invested value change
        )
        db.add(new_snap)
        db.commit()
        
    # Get comparison snapshot (closest to 24h ago)
    # We look for snapshots older than 23 hours
    comparison_snap = db.query(PortfolioSnapshot)\
        .filter(PortfolioSnapshot.owner_id == current_user.id)\
        .filter(PortfolioSnapshot.timestamp <= one_day_ago + timedelta(hours=1))\
        .order_by(PortfolioSnapshot.timestamp.desc())\
        .first()
        
    # Fallback to oldest if user is new (< 24h old)
    if not comparison_snap:
         comparison_snap = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.owner_id == current_user.id).order_by(PortfolioSnapshot.timestamp.asc()).first()

    prev_equity = comparison_snap.total_equity if comparison_snap else 25000.0
    
    # Calculate Changes
    equity_change_val = total_equity - prev_equity
    equity_change_24h = (equity_change_val / prev_equity * 100) if prev_equity != 0 else 0.0
    
    # 24h Profit is essentially the equity change value (assuming no deposits/withdrawals)
    total_profit_24h = equity_change_val
    
    # Profit Change % (Comparing today's profit vs yesterday's profit is tricky without more history, 
    # so often "Profit Change" just means "Percentage increase in equity" or strictly "Last 24h PnL vs Previous 24h PnL")
    # For now, let's treat "Profit Change 24h" as simply the % Change in NAV (which is equity_change_24h) 
    # OR we can treat it as a trend indicator. The user prompt asked for "24h Profit" specifically.
    # Let's map "profit_change_24h" to the % change of the profit (which is volatile when profit is 0).
    # Simpler: Reuse equity change % for "Profit Trend" or kept simulated for 'trend' if specific PnL history is missing.
    # Let's just track the raw 24h PnL and its relative % change.
    profit_change_24h = equity_change_24h 

    # 4. Win Rate (Same as before)
    bots_with_winrate = [b.win_rate for b in active_bots if b.win_rate is not None]
    avg_win_rate = sum(bots_with_winrate) / len(bots_with_winrate) if bots_with_winrate else 0.0
    win_rate_change_24h = 0.0 
    
    # 5. Bot Summaries
    bot_summaries = [
        BotSummary(
            id=bot.id,
            name=bot.name or f"Bot #{bot.id}",
            market=bot.market or "N/A",
            strategy=bot.strategy or "N/A",
            pnl=bot.pnl,
            pnl_percent=bot.pnl_percent,
            status=bot.status
        ) for bot in active_bots
    ]
    
    # 6. Recent Backtests
    backtests = db.query(Backtest).filter(Backtest.owner_id == current_user.id).order_by(Backtest.created_at.desc()).limit(5).all()
    
    # Auto-seed if empty
    if not backtests and db.query(Backtest).count() == 0:
        dummy_bt = Backtest(
            owner_id=current_user.id,
            strategy="RSI Crossover",
            symbol="BTC/USDT",
            timeframe="1h",
            start_date=datetime.now() - timedelta(days=30),
            end_date=datetime.now(),
            profit_percent=12.5,
            max_drawdown=2.1,
            win_rate=65.0,
            sharpe_ratio=1.5,
            status="COMPLETED"
        )
        db.add(dummy_bt)
        db.commit()
        backtests = [dummy_bt]

    backtest_summaries = [
        BacktestSummary(
            id=bt.id,
            strategy=bt.strategy or "Unknown",
            market=bt.symbol or "N/A",
            timeframe=bt.timeframe or "N/A",
            date=bt.created_at.strftime("%Y-%m-%d") if bt.created_at else "",
            profit_percent=bt.profit_percent or 0.0,
            max_drawdown=bt.max_drawdown or 0.0,
            win_rate=bt.win_rate or 0.0,
            sharpe_ratio=bt.sharpe_ratio or 0.0
        ) for bt in backtests
    ]
    
    # 7. Portfolio Allocation
    allocation_map = {}
    allocated_value = 0.0
    
    for bot in active_bots:
        coin = bot.market.split('/')[0] if bot.market and '/' in bot.market else "Unknown"
        val = bot.trade_value or 0.0
        allocation_map[coin] = allocation_map.get(coin, 0.0) + val
        allocated_value += val
        
    cash_value = max(0, total_equity - allocated_value)
    allocation_map["Cash"] = cash_value
    
    portfolio_allocation = [
        AllocationPoint(name=k, value=v) for k, v in allocation_map.items() if v > 0
    ]
    
    # 8. Portfolio Value History (Real from Snapshots now?)
    # ideally we fetch 7-30 recent snapshots
    recent_snaps = db.query(PortfolioSnapshot).filter(PortfolioSnapshot.owner_id == current_user.id).order_by(PortfolioSnapshot.timestamp.asc()).limit(30).all()
    
    if recent_snaps:
        portfolio_value = [PortfolioValuePoint(name=s.timestamp.strftime("%d %b"), value=s.total_equity) for s in recent_snaps]
        # Append current state
        portfolio_value.append(PortfolioValuePoint(name="Now", value=total_equity))
    else:
        # Fallback to simulated if history is too short
        portfolio_value = generate_equity_curve(total_equity)

    return DashboardSummary(
        total_equity=total_equity,
        equity_change_24h=equity_change_24h,
        total_profit_24h=total_bot_pnl,
        profit_change_24h=profit_change_24h,
        active_bots=active_bots_count,
        avg_win_rate=avg_win_rate,
        win_rate_change_24h=win_rate_change_24h,
        bots=bot_summaries,
        portfolio_value=portfolio_value,
        portfolio_allocation=portfolio_allocation,
        recent_backtests=backtest_summaries
    )


@router.websocket("/ws")
async def websocket_dashboard_endpoint(
    websocket: WebSocket,
    token: Optional[str] = Query(None),
    db: Session = Depends(deps.get_db)
):
    """
    Real-time dashboard WebSocket. Authenticates via ?token=<access_token> query param.
    """
    # --- TOKEN-BASED AUTHENTICATION ---
    # JWT payload structure: { "sub": "email@...", "user_id": 1, "exp": ... }
    # We prefer the explicit 'user_id' integer claim. Fall back to 'sub' if numeric.
    user_id = None
    if token:
        payload = verify_token(token)
        if payload:
            # Try 'user_id' claim first (it's already an integer)
            uid = payload.get("user_id")
            if uid is not None:
                try:
                    user_id = int(uid)
                except (ValueError, TypeError):
                    user_id = None

            # Fallback: try 'sub' if it happens to be a numeric string
            if not user_id:
                sub = payload.get("sub")
                if sub:
                    try:
                        user_id = int(sub)
                    except (ValueError, TypeError):
                        pass  # sub is an email, not a number — ignore

    if not user_id:
        # Reject unauthenticated or unresolvable connections
        await websocket.close(code=4003)  # 4003 = Forbidden
        return

    await manager.connect(websocket, "dashboard")

    try:
        while True:
            await asyncio.sleep(5)

            # 1. Fetch User Balance (Fresh)
            user = db.query(models.User).filter(models.User.id == user_id).first()
            if not user:
                break

            balance = user.balance or 25000.0

            # 2. Fetch Active Bots
            active_bots = db.query(Bot).filter(Bot.owner_id == user_id, Bot.status == "active").all()
            total_bot_pnl = sum(b.pnl for b in active_bots) or 0.0
            total_invested = sum(b.trade_value for b in active_bots) or 0.0

            current_equity = balance + total_invested + total_bot_pnl

            # 3. Calculate 24h PnL
            one_day_ago = datetime.now() - timedelta(days=1)
            snap = db.query(PortfolioSnapshot).filter(
                PortfolioSnapshot.owner_id == user_id,
                PortfolioSnapshot.timestamp <= one_day_ago + timedelta(hours=1)
            ).order_by(PortfolioSnapshot.timestamp.desc()).first()

            if not snap:
                snap = db.query(PortfolioSnapshot).filter(
                    PortfolioSnapshot.owner_id == user_id
                ).order_by(PortfolioSnapshot.timestamp.asc()).first()

            prev_equity = snap.total_equity if snap else 25000.0
            profit_24h = current_equity - prev_equity

            update_payload = {
                "type": "DASHBOARD_UPDATE",
                "data": {
                    "total_equity": round(current_equity, 2),
                    "total_profit_24h": round(profit_24h, 2),
                }
            }
            await websocket.send_json(update_payload)

    except WebSocketDisconnect:
        manager.disconnect(websocket, "dashboard")
    except Exception as e:
        manager.disconnect(websocket, "dashboard")
