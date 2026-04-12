from sqlalchemy.orm import Session
from app.models.trade import Trade
from app.schemas.analytics import PerformanceMetrics
from datetime import datetime, timedelta
from sqlalchemy import desc
import statistics

class AnalyticsService:
    @staticmethod
    def calculate_performance_metrics(
        db: Session,
        owner_id: int = None,
        start_date: datetime = None,
        end_date: datetime = None
    ) -> PerformanceMetrics:

        query = db.query(Trade).filter(Trade.status == "CLOSED")

        # Filter by owner if provided (prevents cross-user data leak)
        if owner_id is not None:
            query = query.filter(Trade.bot.has(owner_id=owner_id))

        if start_date:
            query = query.filter(Trade.closed_at >= start_date)
        if end_date:
            query = query.filter(Trade.closed_at <= end_date)

        # Order by closed_at asc for drawdown calculation
        trades = query.order_by(Trade.closed_at.asc()).all()

        if not trades:
            return PerformanceMetrics(
                sharpe_ratio=0.0,
                max_drawdown=0.0,
                win_rate=0.0,
                total_trades=0,
                total_pnl=0.0,
                start_date=start_date,
                end_date=end_date
            )

            
        # 1. Win Rate
        winning_trades = [t for t in trades if t.pnl > 0]
        win_rate = (len(winning_trades) / len(trades)) * 100
        
        # 2. Total PnL
        total_pnl = sum([t.pnl for t in trades])
        
        # 3. Max Drawdown
        # Simulate equity curve starting at 100
        equity_curve = [100.0]
        current_equity = 100.0
        
        for trade in trades:
            # Assuming pnl_percent is in percentage (e.g., 5.0 for 5%)
            # return is pnl_percent / 100
            ret = trade.pnl_percent / 100.0
            current_equity = current_equity * (1 + ret)
            equity_curve.append(current_equity)
            
        max_drawdown = 0.0
        peak = equity_curve[0]
        
        for value in equity_curve:
            if value > peak:
                peak = value
            drawdown = (value - peak) / peak
            if drawdown < max_drawdown:
                max_drawdown = drawdown
                
        # Convert to positive percentage for display (e.g., 15.5%)
        # Drawdown is usually negative, so we take absolute if we want "Max Drawdown: 15%"
        # But usually kept as negative or positive magnitude. Let's return positive magnitude.
        max_drawdown_percent = abs(max_drawdown) * 100
        
        # 4. Sharpe Ratio
        # Simplified: Mean Return / Std Dev of Returns
        # Note: This is a "Trade-based Sharpe", not Time-based (Annualized).
        returns = [t.pnl_percent for t in trades]
        
        if len(returns) > 1:
            mean_return = statistics.mean(returns)
            std_dev = statistics.stdev(returns)
            
            if std_dev != 0:
                sharpe_ratio = mean_return / std_dev
            else:
                sharpe_ratio = 0.0
        else:
            sharpe_ratio = 0.0
            
        return PerformanceMetrics(
            sharpe_ratio=round(sharpe_ratio, 2),
            max_drawdown=round(max_drawdown_percent, 2),
            win_rate=round(win_rate, 2),
            total_trades=len(trades),
            total_pnl=round(total_pnl, 2),
            start_date=start_date,
            end_date=end_date
        )

analytics_service = AnalyticsService()
