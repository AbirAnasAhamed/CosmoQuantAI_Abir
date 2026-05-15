"""
ml_backtest_runner.py
─────────────────────────────────────────────────────────────
Post-Training Backtesting Module.

After a model is registered in the ML Registry, this module:
  1. Takes the test-set portion of training data (last 20%)
  2. Generates ML signals using the trained model
  3. Runs Backtrader with MLSignalStrategy
  4. Returns backtest results for storage in ModelVersion.explainability

Supports all data source types:
  - ohlcv (full OHLCV columns available)
  - l2_orderbook / historical_trades / hybrid — uses close price proxy
─────────────────────────────────────────────────────────────
"""

import numpy as np
import pandas as pd
import backtrader as bt
import traceback
from typing import Callable, Optional


def run_post_training_backtest(
    model,
    algorithm: str,
    X_test: np.ndarray,
    df: pd.DataFrame,
    features: list,
    prediction_target: str,
    initial_balance: float,
    commission: float,
    stop_loss: float,
    take_profit: float,
    add_log: Callable
) -> Optional[dict]:
    """
    Run automated post-training backtest using ML signals.
    
    Args:
        model           : Trained model object (sklearn / torch)
        algorithm       : Algorithm name string (e.g. "Random Forest")
        X_test          : Scaled test features (numpy array)
        df              : Full training dataframe (used to extract OHLCV)
        features        : Feature column names list
        prediction_target: 'classification' or 'regression'
        initial_balance : Starting capital (configurable by user)
        commission      : Commission fraction (e.g. 0.001 = 0.1%)
        stop_loss       : Stop loss percent (e.g. 2.0)
        take_profit     : Take profit percent (e.g. 4.0)
        add_log         : Logging callback

    Returns:
        dict with backtest results, or None on failure
    """
    try:
        add_log(f"[Post-Backtest] Generating ML signals on test set ({len(X_test)} rows)...")

        # ── Step 1: Generate signals ───────────────────────────────────────
        signals = _generate_signals(model, algorithm, X_test, prediction_target, add_log)

        if signals is None or len(signals) == 0:
            add_log("[Post-Backtest] ⚠️ Could not generate signals. Backtest skipped.")
            return None

        # ── Step 2: Build OHLCV DataFrame for the test portion ─────────────
        test_df = _build_ohlcv_slice(df, len(signals), add_log)

        if test_df is None or len(test_df) < 10:
            add_log("[Post-Backtest] ⚠️ Not enough OHLCV data for backtest. Skipped.")
            return None

        # Align signals length to df length (take last N)
        n = min(len(signals), len(test_df))
        signals = signals[-n:]
        test_df = test_df.iloc[-n:]

        # ── Step 3: Run Backtrader ─────────────────────────────────────────
        result = _run_backtrader(test_df, signals, initial_balance, commission, stop_loss, take_profit, add_log)
        return result

    except Exception as e:
        add_log(f"[Post-Backtest] ❌ Error: {e}")
        add_log(traceback.format_exc())
        return None


# ─── Internal Helpers ────────────────────────────────────────────────────────

def _generate_signals(model, algorithm: str, X_test: np.ndarray, prediction_target: str, add_log: Callable):
    """Generate binary signals (0/1) from the trained model."""
    DEEP_LEARNING_ALGOS = {"LSTM", "GRU", "1D-CNN", "DeepLOB", "Transformer", "TCN", "TabNet", "Auto-Encoder"}

    try:
        import pandas as pd
        # We need feature names for sklearn models — use generic column names
        # (X_test is already scaled numpy, columns are ordered correctly)

        if algorithm in DEEP_LEARNING_ALGOS:
            if algorithm == "Auto-Encoder":
                import torch
                model.eval()
                with torch.no_grad():
                    X_t = torch.FloatTensor(X_test)
                    reconstructed = model(X_t)
                    mse = torch.mean((reconstructed - X_t) ** 2, dim=1).numpy()
                
                # Use the top 20% highest MSE values as anomalies
                threshold = np.percentile(mse, 80)
                signals = (mse > threshold).astype(int).tolist()
                add_log(f"[Post-Backtest] Auto-Encoder Anomaly Threshold (80th percentile) set to: {threshold:.6f}")
                
            else:
                import torch
                model.eval()
                with torch.no_grad():
                    if algorithm in ["LSTM", "GRU", "TCN"]:
                        X_t = torch.FloatTensor(X_test).unsqueeze(1)
                    else:
                        X_t = torch.FloatTensor(X_test)
                    out = model(X_t).numpy().flatten()

                if prediction_target == "classification":
                    signals = (1 / (1 + np.exp(-out)) > 0.5).astype(int).tolist()
                else:
                    # For regression: signal=1 if predicted value is positive momentum
                    signals = (out > np.median(out)).astype(int).tolist()

        elif algorithm == "PPO-RL":
            add_log("[Post-Backtest] PPO-RL backtest via signal replay not supported. Skipped.")
            return None

        else:
            # sklearn-compatible: RF, XGBoost, LightGBM, CatBoost
            # ✅ Wrap in DataFrame to preserve feature names (avoids sklearn UserWarning)
            X_pred = X_test
            if hasattr(model, 'feature_names_in_') and model.feature_names_in_ is not None:
                try:
                    X_pred = pd.DataFrame(X_test, columns=model.feature_names_in_)
                except Exception:
                    pass  # fallback to numpy if column count mismatch

            if prediction_target == "classification":
                raw_preds = model.predict(X_pred)
                signals = raw_preds.astype(int).tolist()
            else:
                raw_preds = model.predict(X_pred)
                signals = (raw_preds > np.median(raw_preds)).astype(int).tolist()

        add_log(f"[Post-Backtest] Generated {len(signals)} signals. BUY signals: {sum(signals)} ({sum(signals)/max(1,len(signals))*100:.1f}%)")
        return signals

    except Exception as e:
        add_log(f"[Post-Backtest] Signal generation failed: {e}")
        return None


def _build_ohlcv_slice(df: pd.DataFrame, n_signals: int, add_log: Callable) -> Optional[pd.DataFrame]:
    """
    Build a Backtrader-compatible OHLCV DataFrame from the training df.
    Falls back to a close-price-only proxy if OHLCV columns are missing.
    """
    # Lowercase column lookup
    col_map = {c.lower(): c for c in df.columns}

    has_ohlcv = all(k in col_map for k in ['open', 'high', 'low', 'close', 'volume'])

    if has_ohlcv:
        ohlcv = df[[col_map['open'], col_map['high'], col_map['low'],
                    col_map['close'], col_map['volume']]].copy()
        ohlcv.columns = ['open', 'high', 'low', 'close', 'volume']
    else:
        # Proxy: use 'Close' or 'close' or 'microprice' as the price series
        price_col = col_map.get('close') or col_map.get('microprice')
        if not price_col:
            add_log("[Post-Backtest] No price column found for backtest DataFrame.")
            return None

        prices = df[price_col].values
        ohlcv = pd.DataFrame({
            'open':   prices,
            'high':   prices * 1.001,
            'low':    prices * 0.999,
            'close':  prices,
            'volume': np.ones(len(prices)) * 1000.0
        }, index=df.index)

    # Take last n_signals rows (test portion)
    ohlcv = ohlcv.tail(n_signals).copy()
    
    # Ensure datetime index
    if not isinstance(ohlcv.index, pd.DatetimeIndex):
        try:
            ohlcv.index = pd.to_datetime(ohlcv.index)
        except Exception:
            # Generate synthetic timestamps
            ohlcv.index = pd.date_range(start='2024-01-01', periods=len(ohlcv), freq='1h')

    ohlcv = ohlcv.dropna()
    add_log(f"[Post-Backtest] OHLCV slice prepared: {len(ohlcv)} rows.")
    return ohlcv


def _run_backtrader(test_df: pd.DataFrame, signals: list, initial_balance: float,
                    commission: float, stop_loss: float, take_profit: float,
                    add_log: Callable) -> Optional[dict]:
    """Run Backtrader with MLSignalStrategy and return summarised results."""
    try:
        from app.strategies.ml_signal_strategy import MLSignalStrategy
        from app.services.backtest_engine import FractionalPercentSizer

        cerebro = bt.Cerebro()
        data_feed = bt.feeds.PandasData(dataname=test_df)
        cerebro.adddata(data_feed)

        cerebro.addstrategy(
            MLSignalStrategy,
            signals=signals,
            stop_loss=stop_loss,
            take_profit=take_profit
        )

        cerebro.broker.setcash(initial_balance)
        cerebro.broker.setcommission(
            commission=commission,
            commtype=bt.CommInfoBase.COMM_PERC,
            stocklike=True
        )
        cerebro.addsizer(FractionalPercentSizer, percents=90)
        cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")
        cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")

        start_value = cerebro.broker.getvalue()
        results = cerebro.run()
        end_value = cerebro.broker.getvalue()

        strat = results[0]
        trade_analysis = strat.analyzers.trades.get_analysis()
        dd_analysis    = strat.analyzers.drawdown.get_analysis()

        profit_pct = round((end_value - start_value) / start_value * 100, 2)

        total_closed = trade_analysis.get('total', {}).get('closed', 0)
        won          = trade_analysis.get('won', {}).get('total', 0)
        win_rate     = round(won / total_closed * 100, 2) if total_closed > 0 else 0.0
        max_dd       = round(dd_analysis.get('max', {}).get('drawdown', 0), 2)

        add_log(f"[Post-Backtest] ✅ Profit: {profit_pct:+.2f}% | Win Rate: {win_rate:.1f}% | Max Drawdown: {max_dd:.2f}% | Trades: {total_closed}")

        return {
            "initial_balance": initial_balance,
            "final_value":     round(end_value, 2),
            "profit_pct":      profit_pct,
            "win_rate":        win_rate,
            "max_drawdown":    max_dd,
            "total_trades":    total_closed,
            "commission":      commission,
            "stop_loss":       stop_loss,
            "take_profit":     take_profit
        }

    except Exception as e:
        add_log(f"[Post-Backtest] Backtrader run failed: {e}")
        add_log(traceback.format_exc())
        return None
