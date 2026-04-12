import inspect
import math
import backtrader as bt
import pandas as pd
import quantstats as qs
import json
import numpy as np
from sqlalchemy.orm import Session
from app.services.market_service import MarketService
from app.strategies import STRATEGY_MAP
import random
import itertools
import os
import os
from app.models.indicator import UserIndicator # ✅ NEW
from app.strategies.dynamic_indicator import DynamicIndicatorStrategy
from weasyprint import HTML
import importlib
import importlib.util
import sys
import asyncio
import time
from asgiref.sync import async_to_sync

import warnings

# QuantStats setup
qs.extend_pandas()

# Suppress QuantStats RuntimeWarnings (e.g. invalid value in scalar power)
warnings.filterwarnings("ignore", category=RuntimeWarning, module="quantstats")

market_service = MarketService()

import logging

# ✅ SAFE LOGGING CONFIGURATION
logging.getLogger('matplotlib').setLevel(logging.WARNING)
logging.getLogger('backtrader').setLevel(logging.WARNING)

# ✅ 1. Progress Observer (Backtrader internal for 'run' method)
# এটি সরাসরি টার্মিনালে প্রিন্ট না করে কলব্যাক ফাংশন ব্যবহার করবে
class ProgressObserver(bt.Observer):
    lines = ('progress',)
    params = (
        ('total_len', 0),
        ('callback', None),
    )

    def next(self):
        current_idx = len(self)
        total = self.params.total_len

        if total > 0 and self.params.callback:
            # কম্প্রেশন বা রিস্যাম্পলিং থাকলে ইনডেক্স এডজাস্ট করা হতে পারে
            # আমরা সহজভাবে পার্সেন্টেজ পাঠাচ্ছি
            percent = int((current_idx / total) * 100)
            if percent > 100: percent = 100
            
            # প্রতি ১% পর পর আপডেট পাঠাবে
            if percent % 1 == 0: 
                # Call callback with percentage
                self.params.callback(percent)

# ✅ NEW: Custom Analyzer for accurate Equity Curve (TradingView Style)
class EquityAnalyzer(bt.Analyzer):
    def __init__(self):
        self.equity_data = []

    def start(self):
        self.equity_data = []

    def next(self):
        # Save correct time and cash value after each candle process
        # self.datas[0] is primary data feed
        try:
            current_time = self.datas[0].datetime.datetime(0)
            current_equity = self.strategy.broker.getvalue()
            
            self.equity_data.append({
                "time": int(current_time.timestamp()), # Unix Timestamp for Frontend
                "value": round(current_equity, 2)
            })
        except Exception:
            pass

    def get_analysis(self):
        return self.equity_data

class FractionalPercentSizer(bt.Sizer):
    params = (
        ('percents', 90),
    )
    def _getsizing(self, comminfo, cash, data, isbuy):
        position = self.broker.getposition(data)
        if position.size == 0:
            size = self.broker.get_value() * (self.params.percents / 100) / data.close[0]
            return size
        return position.size

class BacktestEngine:
    
    def run(self, db: Session, symbol: str, timeframe: str, strategy_name: str, initial_cash: float, params: dict, 
            start_date: str = None, end_date: str = None, custom_data_file: str = None, progress_callback=None, 
            commission: float = 0.001, slippage: float = 0.0, leverage: float = 1.0,  # 👈 leverage added
            secondary_timeframe: str = None,  # ✅ Secondary Timeframe (Trend)
            stop_loss: float = 0.0, take_profit: float = 0.0, trailing_stop: float = 0.0,
            indicator_id: int = None, # ✅ NEW: Custom Indicator ID
            df_data: pd.DataFrame = None): # ✅ NEW ARGUMENT
        
        resample_compression = 1
        base_timeframe = timeframe
        df = None
        strategy_class = None

        # ✅ 1. Load Data Logic Update
        # যদি df_data বাইরে থেকে দেওয়া হয়, তবে সেটিই ব্যবহার হবে (DB কল বা CSV রিড স্কিপ করবে)
        if df_data is not None:
            df = df_data.copy()

        # 1. Load Data (CSV or DB)
        elif custom_data_file:
            file_path = f"app/data_feeds/{custom_data_file}"
            if os.path.exists(file_path):
                try:
                    df = pd.read_csv(file_path)
                    df.columns = [c.lower().strip() for c in df.columns]
                    
                    if 'datetime' in df.columns:
                        df['datetime'] = pd.to_datetime(df['datetime'], errors='coerce') 
                        if df['datetime'].isnull().all():
                            return {"error": "CSV Date format invalid. Use YYYY-MM-DD HH:MM:SS format."}
                        df.dropna(subset=['datetime'], inplace=True)
                        df.set_index('datetime', inplace=True)
                    elif 'date' in df.columns:
                        df['datetime'] = pd.to_datetime(df['date'], errors='coerce')
                        if df['datetime'].isnull().all():
                            return {"error": "CSV Date format invalid."}
                        df.dropna(subset=['datetime'], inplace=True)
                        df.set_index('datetime', inplace=True)
                        
                    required_cols = ['open', 'high', 'low', 'close', 'volume']
                    if not all(col in df.columns for col in required_cols):
                         return {"error": f"CSV file must contain columns: {required_cols}"}
                    
                    df = df[required_cols]
                except Exception as e:
                    return {"error": f"Error reading CSV file: {str(e)}"}
            else:
                return {"error": "Custom data file not found on server."}

        if df is None:
            candles = market_service.get_candles_from_db(db, symbol, timeframe, start_date, end_date)

            if not candles or len(candles) < 20:
                print(f"📉 Data missing for {symbol} {timeframe}. Auto-syncing from Exchange...")
                if progress_callback: progress_callback(5)
                try:
                    async_to_sync(market_service.fetch_and_store_candles)(
                        db=db, symbol=symbol, timeframe=timeframe, start_date=start_date, end_date=end_date, limit=1000
                    )
                    candles = market_service.get_candles_from_db(db, symbol, timeframe, start_date, end_date)
                except Exception as e:
                    print(f"❌ Auto-sync failed: {e}")
            
            if not candles or len(candles) < 20:
                if timeframe == '45m':
                    base_timeframe = '15m'
                    resample_compression = 3
                    candles = market_service.get_candles_from_db(db, symbol, '15m', start_date, end_date)
                elif timeframe == '2h':
                    base_timeframe = '1h'
                    resample_compression = 2
                    candles = market_service.get_candles_from_db(db, symbol, '1h', start_date, end_date)

            if not candles or len(candles) < 20:
                 return {"error": "Insufficient Data in Database."}

            df = pd.DataFrame(candles, columns=['datetime', 'open', 'high', 'low', 'close', 'volume'])
            df.set_index('datetime', inplace=True)



        # ✅ NEW: Calculate total candles
        total_candles = len(df) if df is not None else 0

        clean_params = {}
        for k, v in params.items():
            try: clean_params[k] = int(v)
            except:
                try: clean_params[k] = float(v)
                except: clean_params[k] = v

        # ✅ FIX: Risk Management Params Injection (Handle NoneType Error)
        # এখানে আমরা নিশ্চিত করছি যে ভ্যালুগুলো None হলে যেন 0.0 হয়ে যায়।
        stop_loss = float(stop_loss) if stop_loss is not None else 0.0
        take_profit = float(take_profit) if take_profit is not None else 0.0
        trailing_stop = float(trailing_stop) if trailing_stop is not None else 0.0

        if stop_loss > 0: clean_params['stop_loss'] = stop_loss
        if take_profit > 0: clean_params['take_profit'] = take_profit
        if trailing_stop > 0: clean_params['trailing_stop'] = trailing_stop

        cerebro = bt.Cerebro()
        data_feed = bt.feeds.PandasData(dataname=df)
        
        # Add Primary Data
        if resample_compression > 1:
            tf_mapping = {
                'm': bt.TimeFrame.Minutes,
                'h': bt.TimeFrame.Hours,
                'd': bt.TimeFrame.Days
            }
            unit_char = base_timeframe[-1] 
            bt_timeframe = tf_mapping.get(unit_char, bt.TimeFrame.Minutes)
            cerebro.resampledata(data_feed, timeframe=bt_timeframe, compression=resample_compression)
        else:
            cerebro.adddata(data_feed)

        # ✅ Secondary Timeframe Logic
        if secondary_timeframe:
            tf_map = {
                "1m": (bt.TimeFrame.Minutes, 1), "5m": (bt.TimeFrame.Minutes, 5),
                "15m": (bt.TimeFrame.Minutes, 15), "30m": (bt.TimeFrame.Minutes, 30),
                "1h": (bt.TimeFrame.Minutes, 60), "4h": (bt.TimeFrame.Minutes, 240),
                "1d": (bt.TimeFrame.Days, 1), "1w": (bt.TimeFrame.Weeks, 1)
            }
            if secondary_timeframe in tf_map:
                bt_tf, compression = tf_map[secondary_timeframe]
                cerebro.resampledata(data_feed, timeframe=bt_tf, compression=compression, name=f"TF_{secondary_timeframe}")
            else:
                print(f"⚠️ Warning: Unsupported secondary timeframe {secondary_timeframe}")

        if progress_callback:
            total_candles = len(df)
            if resample_compression > 1:
                total_candles = total_candles // resample_compression
            cerebro.addobserver(ProgressObserver, total_len=total_candles, callback=progress_callback)

        if indicator_id:
            # ✅ Custom Indicator Strategy Logic
            print(f"🛠️ Using Custom Indicator ID: {indicator_id}")
            indicator = db.query(UserIndicator).filter(UserIndicator.id == indicator_id).first()
            if not indicator:
                return {"error": f"Custom Indicator {indicator_id} not found."}
            
            strategy_class = DynamicIndicatorStrategy
            
            # Inject Params for Dynamic Strategy
            clean_params['indicator_type'] = indicator.base_type
            clean_params['params'] = indicator.parameters
            
        else:
            strategy_class = self._load_strategy_class(strategy_name)
            if not strategy_class:
                return {"error": f"Strategy '{strategy_name}' not found via Map or File."}
        
        valid_params = self._smart_filter_params(strategy_class, clean_params)
        
        # Risk Management Params (SL/TP) যদি ফিল্টারে বাদ পড়ে যায়, তবুও জোর করে অ্যাড করা
        # কারণ BaseStrategy তে এগুলো থাকে, কিন্তু মাঝে মাঝে ডিটেক্ট হয় না।
        if 'stop_loss' in clean_params: valid_params['stop_loss'] = clean_params['stop_loss']
        if 'take_profit' in clean_params: valid_params['take_profit'] = clean_params['take_profit']
        if 'trailing_stop' in clean_params: valid_params['trailing_stop'] = clean_params['trailing_stop']

        try:
            cerebro.addstrategy(strategy_class, **valid_params)
        except Exception as e:
            return {"error": f"Failed to initialize strategy parameters: {str(e)}"}

        cerebro.broker.setcash(initial_cash)
        
        # Leveage / Futures Logic
        is_futures = leverage > 1.0
        
        cerebro.broker.setcommission(
            commission=commission, 
            commtype=bt.CommInfoBase.COMM_PERC, 
            leverage=leverage, 
            stocklike=not is_futures
        )

        if slippage > 0:
            cerebro.broker.set_slippage_perc(perc=slippage)
        
        cerebro.addsizer(FractionalPercentSizer, percents=90)
        
        cerebro.addanalyzer(bt.analyzers.PyFolio, _name='pyfolio')
        cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")
        cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
        cerebro.addanalyzer(bt.analyzers.Transactions, _name="transactions")
        
        # ✅ NEW: Adding Custom Equity Analyzer
        cerebro.addanalyzer(EquityAnalyzer, _name='equity_curve')

        start_value = cerebro.broker.getvalue()
        try:
            results = cerebro.run() 
            first_strat = results[0]
        except IndexError as e:
            # ✅ বিশেষ লজিক: ইনডেক্স এরর ধরলে ইউজারকে গাইড করা
            error_msg = str(e)
            print(f"❌ Backtest Critical Error: {error_msg}")
            return {
                "status": "error",
                "message": "Critical Error: 'Array Index Out of Range'. This usually happens if you define Indicators (like SMA, RSI) inside the next() method. Please move them to __init__()."
            }
        except Exception as e:
            # ✅ সাধারণ এরর হ্যান্ডলিং
            import traceback
            trace_str = traceback.format_exc()
            print(f"❌ Backtest Runtime Error: {e}\n{trace_str}")
            
            # যদি এরর মেসেজে ইনডেক্স এরর থাকে
            if "array index out of range" in str(e).lower() or "list index out of range" in str(e).lower():
                 return {
                    "status": "error",
                    "message": "Critical Error: 'Index Out of Range'. You likely instantiated an Indicator inside the next() method. Please move it to __init__()."
                }

            return {"status": "error", "message": f"Backtest execution failed: {str(e)}"}

        end_value = cerebro.broker.getvalue()

        # ✅ FIX: ভেরিয়েবলগুলো প্রিন্ট করার আগেই ডিফাইন করা হলো
        total_candles = len(df) if df is not None else 0
        profit_value = end_value - start_value
        profit_percent = round((profit_value / start_value) * 100, 2)

        qs_metrics = self._calculate_metrics(first_strat, start_value, end_value)
        detailed_trade_analysis = self._format_trade_analysis(first_strat)
        
        executed_trades = getattr(first_strat, 'trade_history', [])
        
        if not executed_trades:
            trans_anal = first_strat.analyzers.transactions.get_analysis()
            for dt, trans_list in trans_anal.items():
                for trans in trans_list:
                    size = trans[0]
                    price = trans[1]
                    executed_trades.append({
                        "type": "buy" if size > 0 else "sell",
                        "price": price,
                        "size": abs(size),
                        "time": int(dt.timestamp())
                    })
            executed_trades.sort(key=lambda x: x['time'])
        
        df['time'] = df.index.astype('int64') // 10**9 
        # Format: [time, open, high, low, close, volume]
        chart_candles = df[['time', 'open', 'high', 'low', 'close', 'volume']].values.tolist()
        
        # Extract Equity Curve
        # ---------------------------------------------------------
        # 👇 2. Equity Curve Extraction: Using Custom Analyzer
        # ---------------------------------------------------------
        equity_curve = []
        try:
            # Get data directly from custom Analyzer
            equity_curve = first_strat.analyzers.equity_curve.get_analysis()
            
            # Safety check: if data empty, add initial cash
            if not equity_curve:
                equity_curve = [{"time": int(df.index[0].timestamp()), "value": initial_cash}]
                
        except Exception as e:
            print(f"⚠️ Error extracting equity curve: {e}")
            equity_curve = []

        # ✅ NEW: Run Monte Carlo Simulation
        monte_carlo_results = self.perform_monte_carlo(first_strat, initial_cash)
        
        # ✅ PRINT: Monte Carlo Summary
        if monte_carlo_results:
            print(f"🎲 Monte Carlo (1000 Runs): Risk of Ruin: {monte_carlo_results['risk_of_ruin_percent']}% | Median Profit: {monte_carlo_results['median_profit']}")

        # ---------------------------------------------------------
        # 👇 3. QuantStats Report Generation (PDF/HTML)
        # ---------------------------------------------------------
        report_file = None
        try:
            # Portfolio stats extraction
            portfolio_stats = first_strat.analyzers.getbyname('pyfolio')
            returns, _, _, _ = portfolio_stats.get_pf_items()
            
            # Timezone fix
            returns.index = returns.index.tz_localize(None)

            # Ensure reports directory exists
            reports_dir = "app/reports"
            os.makedirs(reports_dir, exist_ok=True)
            
            # Unique filename (FIX: Replace '/' with '-' to avoid directory errors)
            safe_symbol = symbol.replace('/', '-')  # ✅ স্ল্যাশ রিমুভ করা হলো
            filename = f"report_{safe_symbol}_{timeframe}_{int(time.time())}"
            
            html_path = os.path.join(reports_dir, f"{filename}.html")
            pdf_path = os.path.join(reports_dir, f"{filename}.pdf")

            # 1. Generate HTML (QuantStats Default)
            qs.reports.html(returns, output=html_path, title=f"CosmoQuantAI Report - {symbol}", download_filename=html_path)

            # 2. Convert to PDF
            try:
                # pdfkit.from_file(html_path, pdf_path) # Removed
                HTML(filename=html_path).write_pdf(pdf_path) # ✅ WeasyPrint replacement
                report_file = filename + ".pdf"
            except Exception as e:
                print(f"⚠️ PDF Conversion Failed (WeasyPrint error?): {e}")
                report_file = filename + ".html" # Fallback to HTML

        except Exception as e:
            print(f"❌ Report Generation Error: {e}")

        # ✅ PRINT: with Leverage Info
        print(f"\n📊 Backtest Result for {symbol} ({timeframe}) | Lev: {leverage}x")
        print(f"------------------------------------------------")
        print(f"🕯️  Total Candles : {total_candles}")
        print(f"💰 Final Value   : {round(end_value, 2)}")
        print(f"📈 Profit        : {profit_percent}%")
        print(f"📉 Max Drawdown  : {qs_metrics['metrics'].get('max_drawdown', 0)}%")
        print(f"------------------------------------------------\n")

        return {
            "status": "success",
            "symbol": symbol,
            "strategy": strategy_name,
            "initial_cash": initial_cash,
            "leverage": leverage,
            "final_value": round(end_value, 2),
            "profit_percent": profit_percent,
            "total_candles": total_candles,
            "total_trades": detailed_trade_analysis.get('total_closed', 0),
            "advanced_metrics": qs_metrics["metrics"],
            "heatmap_data": qs_metrics["heatmap"],
            "underwater_data": qs_metrics["underwater"],
            "histogram_data": qs_metrics["histogram"],
            "histogram_data": qs_metrics["histogram"],
            "report_file": report_file, # 👈 Added report file
            "trades_log": executed_trades, 
            "candle_data": chart_candles,
            "trade_analysis": detailed_trade_analysis,
            "equity_curve": equity_curve,
            "daily_returns": returns.to_json(date_format='iso') if 'returns' in locals() else None,
            "monte_carlo": monte_carlo_results
        }

    def _format_trade_analysis(self, strategy):
        try:
            analysis = strategy.analyzers.trades.get_analysis()
            def get(d, keys, default=0):
                for k in keys:
                    if isinstance(d, dict): d = d.get(k, default)
                    else: return default
                return d

            total = analysis.get('total', {})
            won = analysis.get('won', {})
            lost = analysis.get('lost', {})
            pnl = analysis.get('pnl', {})
            long_t = analysis.get('long', {})
            short_t = analysis.get('short', {})

            total_closed = total.get('closed', 0)
            total_open = total.get('open', 0)
            total_won = won.get('total', 0)
            total_lost = lost.get('total', 0)
            win_rate = (total_won / total_closed * 100) if total_closed > 0 else 0
            
            gross_pnl = get(pnl, ['gross', 'total'])
            net_pnl = get(pnl, ['net', 'total'])
            avg_pnl = get(pnl, ['net', 'average'])
            avg_win_trade = get(won, ['pnl', 'average'])
            avg_loss_trade = get(lost, ['pnl', 'average'])
            ratio_avg_win_loss = abs(avg_win_trade / avg_loss_trade) if avg_loss_trade != 0 else 0
            largest_win_value = get(won, ['pnl', 'max'])
            largest_loss_value = get(lost, ['pnl', 'max'])

            largest_win_percent = 0
            largest_loss_percent = 0
            if hasattr(strategy, '_trades'):
                all_trades = []
                for feed in strategy._trades:
                    all_trades.extend(strategy._trades[feed][0]) 
                for t in all_trades:
                    investment = t.price * t.size
                    if investment != 0:
                        roi = (t.pnl / abs(investment)) * 100
                        if roi > largest_win_percent: largest_win_percent = roi
                        if roi < largest_loss_percent: largest_loss_percent = roi

            return {
                "total_closed": total_closed,
                "total_open": total_open,
                "total_won": total_won,
                "total_lost": total_lost,
                "win_rate": round(win_rate, 2),
                "long_trades_total": long_t.get('total', 0),
                "long_trades_won": get(long_t, ['won', 'total']),
                "short_trades_total": short_t.get('total', 0),
                "short_trades_won": get(short_t, ['won', 'total']),
                "gross_profit": round(gross_pnl, 2),
                "net_profit": round(net_pnl, 2),
                "avg_pnl": round(avg_pnl, 2),
                "avg_win": round(avg_win_trade, 2),
                "avg_loss": round(avg_loss_trade, 2),
                "ratio_avg_win_loss": round(ratio_avg_win_loss, 2),
                "largest_win_value": round(largest_win_value, 2),
                "largest_loss_value": round(largest_loss_value, 2),
                "largest_win_percent": round(largest_win_percent, 2),
                "largest_loss_percent": round(largest_loss_percent, 2),
            }
        except Exception as e:
            return {}

    # ✅ NEW: Monte Carlo Simulation Implementation
    def perform_monte_carlo(self, strategy, initial_cash, simulations=1000, confidence_level=0.95):
        """
        ট্রেডগুলোকে এলোমেলো (Shuffle) করে ১০০০ বার সিমুলেশন চালায়
        Risk of Ruin এবং সম্ভাব্য ড্রডাউন বের করার জন্য।
        """
        trades_pnl = []
        
        # ১. সমস্ত ক্লোজড ট্রেডের PnL বের করা
        if hasattr(strategy, '_trades'):
            for feed in strategy._trades:
                # strategy._trades[feed] একটি লিস্ট, যার [0] ইনডেক্সে ক্লোজড ট্রেড থাকে
                for t in strategy._trades[feed][0]:
                    trades_pnl.append(t.pnl) # নেট PnL
        
        if not trades_pnl or len(trades_pnl) < 10:
            return None # পর্যাপ্ত ট্রেড না থাকলে মন্টে কার্লো করা যাবে না

        trades_pnl = np.array(trades_pnl)
        final_equities = []
        max_drawdowns = []
        ruin_count = 0
        
        # ২. সিমুলেশন লুপ
        for _ in range(simulations):
            # ট্রেডগুলোকে এলোমেলো করা (Sequence Risk টেস্ট করার জন্য)
            shuffled_pnl = np.random.permutation(trades_pnl)
            
            # ইকুইটি কার্ভ তৈরি করা (Cumulative Sum)
            equity_curve = np.cumsum(np.insert(shuffled_pnl, 0, initial_cash))
            
            final_equity = equity_curve[-1]
            final_equities.append(final_equity)
            
            # Bankruptcy Check (যদি ইকুইটি ২০% এর নিচে চলে যায় বা ০ হয়)
            if np.min(equity_curve) < (initial_cash * 0.2): # ধরা যাক ২০% ক্যাশ বাকি থাকলে দেউলিয়া
                ruin_count += 1
                
            # Max Drawdown Calculation for this simulation
            peak = np.maximum.accumulate(equity_curve)
            drawdown = (equity_curve - peak) / peak
            max_drawdowns.append(np.min(drawdown) * 100)

        # ৩. স্ট্যাটিস্টিক্স ক্যালকুলেশন
        final_equities = np.sort(final_equities)
        max_drawdowns = np.sort(max_drawdowns)

        median_return = np.median(final_equities) - initial_cash
        worst_case_return = np.percentile(final_equities, 5) - initial_cash # ৯৫% কনফিডেন্স
        best_case_return = np.percentile(final_equities, 95) - initial_cash
        
        avg_drawdown = np.mean(max_drawdowns)
        worst_drawdown = np.percentile(max_drawdowns, 5) # মনে রাখবেন ড্রডাউন নেগেটিভ ভ্যালু
        
        risk_of_ruin = (ruin_count / simulations) * 100

        return {
            "simulations": simulations,
            "median_equity": round(float(np.median(final_equities)), 2),
            "median_profit": round(float(median_return), 2),
            "worst_case_equity_95": round(float(np.percentile(final_equities, 5)), 2), # VaR (Value at Risk)
            "best_case_equity_95": round(float(np.percentile(final_equities, 95)), 2),
            "risk_of_ruin_percent": round(risk_of_ruin, 2),
            "expected_max_drawdown": round(float(avg_drawdown), 2),
            "worst_case_drawdown_95": round(float(worst_drawdown), 2)
        }

    def optimize(self, db: Session, symbol: str, timeframe: str, strategy_name: str, initial_cash: float, params: dict, 
                 start_date: str = None, end_date: str = None, custom_data_file: str = None, 
                 method="grid", population_size=50, generations=10, progress_callback=None, abort_callback=None,
                 commission: float = 0.001, slippage: float = 0.0, leverage: float = 1.0,
                 df_data: pd.DataFrame = None, # 👈 NEW: Allow passing dataframe directly
                 opt_target: str = "profit", # ✅ New
                 min_trades: int = 5):       # ✅ New
        
        df = None

        # ✅ Data Handling: Use passed dataframe if available
        if df_data is not None:
            df = df_data.copy()
        
        elif custom_data_file:
            file_path = f"app/data_feeds/{custom_data_file}"
            if os.path.exists(file_path):
                try:
                    df = pd.read_csv(file_path)
                    df.columns = [c.lower().strip() for c in df.columns]
                    
                    if 'datetime' in df.columns:
                        df['datetime'] = pd.to_datetime(df['datetime'], errors='coerce') 
                        df.dropna(subset=['datetime'], inplace=True)
                        df.set_index('datetime', inplace=True)
                    elif 'date' in df.columns:
                        df['datetime'] = pd.to_datetime(df['date'], errors='coerce')
                        df.dropna(subset=['datetime'], inplace=True)
                        df.set_index('datetime', inplace=True)
                        
                    required_cols = ['open', 'high', 'low', 'close', 'volume']
                    if not all(col in df.columns for col in required_cols):
                         return {"error": f"CSV file must contain columns: {required_cols}"}
                    
                    df = df[required_cols]
                except Exception as e:
                    return {"error": f"Error reading CSV file: {str(e)}"}
            else:
                return {"error": "Custom data file not found on server."}

        # If CSV not used or failed, try DB
        if df is None:
            candles = market_service.get_candles_from_db(db, symbol, timeframe, start_date, end_date)
            if not candles or len(candles) < 20:
                print(f"Data missing for {symbol} {timeframe}. Auto-syncing...")
                if progress_callback: progress_callback(0, meta={"status": "Syncing Data..."})
                try:
                    async_to_sync(market_service.fetch_and_store_candles)(
                        db=db, symbol=symbol, timeframe=timeframe, start_date=start_date, end_date=end_date, limit=1000
                    )
                    candles = market_service.get_candles_from_db(db, symbol, timeframe, start_date, end_date)
                except Exception as e:
                    print(f"Auto-sync failed: {e}")

            if not candles or len(candles) < 20:
                return {"error": f"Insufficient Data for {symbol}."}

            df = pd.DataFrame(candles, columns=['datetime', 'open', 'high', 'low', 'close', 'volume'])
            df.set_index('datetime', inplace=True)
        
        # ✅ 2. OPTIMIZATION: Load Strategy Class ONCE before the loop
        # This prevents disk I/O (file check/import) in every iteration
        strategy_class = self._load_strategy_class(strategy_name)
        if not strategy_class:
            return {"error": f"Strategy '{strategy_name}' not found."}

        # Parameter processing logic...
        param_ranges = {} 
        fixed_params = {}
        for k, v in params.items():
            if isinstance(v, dict) and 'start' in v and 'end' in v:
                start, end = float(v['start']), float(v['end'])
                step = float(v.get('step', 1)) if float(v.get('step', 1)) != 0 else 1
                vals = []
                curr = start
                while curr <= end + (step/1000): 
                    vals.append(curr)
                    curr += step
                vals = [int(x) if int(start)==start and int(step)==step else round(x, 4) for x in vals]
                param_ranges[k] = vals
            else:
                fixed_params[k] = v

        results = []
        best_profit_so_far = -float('inf')

        # Grid Search
        if method == "grid":
            param_names = list(param_ranges.keys())
            param_values = list(param_ranges.values())
            combinations = list(itertools.product(*param_values))
            total = len(combinations)
            
            for i, combo in enumerate(combinations):
                if abort_callback and abort_callback(): 
                    break
                instance_params = dict(zip(param_names, combo))
                
                # ✅ Pass the pre-loaded 'strategy_class' instead of 'strategy_name'
                metrics = self._run_single_backtest(df, strategy_class, initial_cash, instance_params, fixed_params, commission, slippage, leverage)
                
                # ✅ Filter by Min Trades
                if metrics['total_trades'] < min_trades:
                    continue # ট্রেড কম হলে রেজাল্ট বাদ

                metrics['params'] = instance_params
                results.append(metrics)
                
                if metrics['profitPercent'] > best_profit_so_far:
                    best_profit_so_far = metrics['profitPercent']

                if progress_callback:
                    percent = int(((i + 1) / total) * 100)
                    progress_callback(
                        percent, 
                        meta={
                            "current": i + 1,
                            "total": total,
                            "best_profit": round(best_profit_so_far, 2),
                            "last_profit": metrics['profitPercent']
                        }
                    )

        # Genetic Algorithm
        elif method == "genetic" or method == "geneticAlgorithm":
            # Pass strategy_class to GA method as well
            results = self._run_genetic_algorithm(
                df, strategy_class, initial_cash, param_ranges, fixed_params, 
                pop_size=population_size, generations=generations, 
                progress_callback=progress_callback, abort_callback=abort_callback,
                commission=commission, slippage=slippage, leverage=leverage,
                opt_target=opt_target, min_trades=min_trades # ✅ Pass args
            )

        # ✅ Dynamic Sorting Logic Helper
        def get_sort_key(res):
            if opt_target == 'sharpe': return res.get('sharpeRatio', -99)
            if opt_target == 'win_rate': return res.get('winRate', 0)
            if opt_target == 'drawdown': return -res.get('maxDrawdown', 99) # নেগেটিভ ভ্যালু বড় মানে ড্রডাউন কম (e.g. -5 > -20)
            return res.get('profitPercent', -float('inf'))

        # ✅ Sort Results
        results.sort(key=get_sort_key, reverse=True)
        return results
    def walk_forward(self, db: Session, symbol: str, timeframe: str, strategy_name: str, initial_cash: float, 
                     params: dict, start_date: str, end_date: str, 
                     train_window_days: int = 90, test_window_days: int = 30, 
                     method="grid", population_size=20, generations=5, 
                     commission: float = 0.001, slippage: float = 0.0, leverage: float = 1.0,
                     opt_target="profit", min_trades=5, # ✅ New
                     progress_callback=None):
        
        print(f"🚀 Starting Walk-Forward Analysis for {symbol}...")
        
        candles = market_service.get_candles_from_db(db, symbol, timeframe, start_date, end_date)
        if not candles or len(candles) < (train_window_days + test_window_days):
            return {"error": "Insufficient data for Walk-Forward Analysis."}

        full_df = pd.DataFrame(candles, columns=['datetime', 'open', 'high', 'low', 'close', 'volume'])
        full_df['datetime'] = pd.to_datetime(full_df['datetime'])
        full_df.set_index('datetime', inplace=True)
        full_df.sort_index(inplace=True)

        full_start_date = full_df.index[0]
        full_end_date = full_df.index[-1]
        
        current_start = full_start_date
        wfa_results = []
        cumulative_equity = initial_cash
        
        total_duration = (full_end_date - full_start_date).days
        step = 0
        
        while True:
            train_end = current_start + pd.Timedelta(days=train_window_days)
            test_end = train_end + pd.Timedelta(days=test_window_days)

            if train_end >= full_end_date:
                break
            if test_end > full_end_date:
                test_end = full_end_date

            # ✅ Progress Update
            if progress_callback:
                elapsed_days = (test_end - full_start_date).days
                percent = int((elapsed_days / total_duration) * 100)
                if percent > 99: percent = 99
                progress_callback(percent, meta={
                    "status": f"WFA Step {step+1}: Testing {train_end.date()} -> {test_end.date()}",
                    "current_equity": round(cumulative_equity, 2)
                })

            print(f"🔄 Step {step+1}: Training [{current_start.date()} - {train_end.date()}] | Testing [{train_end.date()} - {test_end.date()}]")

            # ✅ A. TRAINING PHASE (Dynamic Optimization)
            train_slice_df = full_df.loc[current_start:train_end]
            
            if len(train_slice_df) < 10:
                print("⚠️ Skipping step: Not enough training data.")
                current_start += pd.Timedelta(days=test_window_days)
                continue

            # Optimize using the sliced data
            opt_results = self.optimize(
                db=db, symbol=symbol, timeframe=timeframe, strategy_name=strategy_name,
                initial_cash=cumulative_equity, 
                params=params, 
                method=method, 
                population_size=population_size, generations=generations,
                commission=commission, slippage=slippage, leverage=leverage,
                df_data=train_slice_df, # 👈 Sliced Training Data
                opt_target=opt_target, # ✅ Pass
                min_trades=min_trades  # ✅ Pass
            )

            # সেরা প্যারামিটার নির্বাচন
            if not opt_results or isinstance(opt_results, dict) and "error" in opt_results:
                print("⚠️ Optimization failed, using default params.")
                best_params = {k: v['start'] if isinstance(v, dict) else v for k, v in params.items()}
            else:
                best_params = opt_results[0]['params']
                # print(f"✨ Best Params for Step {step+1}: {best_params}")

            # ✅ B. TESTING PHASE (Validation)
            test_slice_df = full_df.loc[train_end:test_end]
            
            if len(test_slice_df) < 1: break

            test_result = self.run(
                db=db, symbol=symbol, timeframe=timeframe, strategy_name=strategy_name,
                initial_cash=cumulative_equity,
                params=best_params, # সেরা প্যারামিটার ব্যবহার
                commission=commission, slippage=slippage, leverage=leverage,
                df_data=test_slice_df # 👈 Sliced Testing Data
            )

            if test_result.get('status') == 'success':
                profit = test_result['final_value'] - cumulative_equity
                profit_pct = (profit / cumulative_equity) * 100
                
                wfa_results.append({
                    "step": step + 1,
                    "test_period": f"{train_end.date()} to {test_end.date()}",
                    "start_equity": round(cumulative_equity, 2),
                    "end_equity": round(test_result['final_value'], 2),
                    "profit": round(profit, 2),
                    "profit_percent": round(profit_pct, 2),
                    "drawdown": test_result['advanced_metrics'].get('max_drawdown', 0),
                    "best_params": best_params # রেজাল্টে প্যারামিটার সেভ রাখা
                })
                
                cumulative_equity = test_result['final_value']
            
            current_start += pd.Timedelta(days=test_window_days)
            step += 1

        total_profit = cumulative_equity - initial_cash
        total_profit_pct = (total_profit / initial_cash) * 100
        avg_dd = np.mean([r['drawdown'] for r in wfa_results]) if wfa_results else 0

        return {
            "status": "success",
            "strategy": strategy_name,
            "total_steps": len(wfa_results),
            "initial_cash": initial_cash,
            "final_equity": round(cumulative_equity, 2),
            "total_profit": round(total_profit, 2),
            "total_profit_percent": round(total_profit_pct, 2),
            "average_drawdown": round(avg_dd, 2),
            "steps_detail": wfa_results
        }
    # ২. Genetic Algorithm আপডেট
    def _run_genetic_algorithm(self, df, strategy_class, initial_cash, param_ranges, fixed_params, pop_size=50, generations=10, 
                               progress_callback=None, abort_callback=None, commission=0.001, slippage=0.0, leverage=1.0,
                               opt_target="profit", min_trades=5): # ✅ Args added
        
        param_keys = list(param_ranges.keys())
        population = []
        for _ in range(pop_size):
            population.append({k: random.choice(v) for k, v in param_ranges.items()})

        best_results = []
        history_cache = {} 
        total_steps = generations * pop_size
        best_profit_so_far = -float('inf')

        for gen in range(generations):
            if abort_callback and abort_callback(): 
                break
            
            evaluated_pop = []
            
            for i, individual in enumerate(population):
                param_signature = json.dumps(individual, sort_keys=True)
                
                if param_signature in history_cache:
                    metrics = history_cache[param_signature]
                else:
                    # ✅ Pass pre-loaded strategy_class
                    metrics = self._run_single_backtest(df, strategy_class, initial_cash, individual, fixed_params, commission, slippage, leverage)
                    metrics['params'] = individual
                    history_cache[param_signature] = metrics
                
                # Genetic Algorithm এ খারাপ রেজাল্ট একদম বাদ দিলে পপুলেশন কমে যাবে, 
                # তাই আমরা পেনাল্টি স্কোর দেব (Score -9999)
                if metrics['total_trades'] < min_trades:
                    metrics['fitness_score'] = -9999
                else:
                    # টার্গেট অনুযায়ী স্কোর সেট করা
                    if opt_target == 'sharpe': metrics['fitness_score'] = metrics['sharpeRatio']
                    elif opt_target == 'drawdown': metrics['fitness_score'] = -metrics['maxDrawdown']
                    elif opt_target == 'win_rate': metrics['fitness_score'] = metrics['winRate']
                    else: metrics['fitness_score'] = metrics['profitPercent']

                evaluated_pop.append(metrics)
                
                if metrics['profitPercent'] > best_profit_so_far:
                    best_profit_so_far = metrics['profitPercent']

                current_step = (gen * pop_size) + (i + 1)
                
                if progress_callback:
                    percent = int((current_step / total_steps) * 100)
                    progress_callback(
                        percent,
                        meta={
                            "current": current_step,
                            "total": total_steps,
                            "generation": gen + 1,
                            "best_profit": round(best_profit_so_far, 2)
                        }
                    )
            
            # ✅ Sort by Fitness Score
            evaluated_pop.sort(key=lambda x: x.get('fitness_score', -9999), reverse=True)
            best_results.extend(evaluated_pop[:5]) 
            
            elite_count = int(pop_size * 0.2)
            next_generation = [item['params'] for item in evaluated_pop[:elite_count]]
            
            while len(next_generation) < pop_size:
                parent1 = random.choice(evaluated_pop[:int(pop_size/2)])['params']
                parent2 = random.choice(evaluated_pop[:int(pop_size/2)])['params']
                child = parent1.copy()
                for k in param_keys:
                    if random.random() > 0.5: child[k] = parent2[k]
                if random.random() < 0.2: 
                    mutate_key = random.choice(param_keys)
                    child[mutate_key] = random.choice(param_ranges[mutate_key])
                next_generation.append(child)
            
            population = next_generation

        unique_results = {json.dumps(r['params'], sort_keys=True): r for r in best_results}
        return list(unique_results.values())

    # ✅ UPDATED: Accepts strategy_class object instead of name string
    def _run_single_backtest(self, df, strategy_class, initial_cash, variable_params, fixed_params, commission=0.001, slippage=0.0, leverage=1.0):
        full_params = {**fixed_params, **variable_params}
        clean_params = {}
        for k, v in full_params.items():
            try: clean_params[k] = int(v)
            except: 
                try: clean_params[k] = float(v)
                except: clean_params[k] = v

        cerebro = bt.Cerebro(stdstats=False) 
        
        # ✅ Data is already loaded in memory (df), so this is fast
        data_feed = bt.feeds.PandasData(dataname=df)
        cerebro.adddata(data_feed)
        
        # ✅ Removed _load_strategy_class call from here to avoid repetitive Disk I/O
        
        valid_params = self._smart_filter_params(strategy_class, clean_params)
        
        if 'stop_loss' in clean_params: valid_params['stop_loss'] = clean_params['stop_loss']
        if 'take_profit' in clean_params: valid_params['take_profit'] = clean_params['take_profit']

        cerebro.addstrategy(strategy_class, **valid_params)
        
        cerebro.broker.setcash(initial_cash)
        cerebro.broker.setcommission(commission=commission, commtype=bt.CommInfoBase.COMM_PERC, margin=None, mult=1.0, stocklike=True)
        
        # ✅ Leveage / Futures Logic
        is_futures = leverage > 1.0
        cerebro.broker.setcommission(
            commission=commission, 
            commtype=bt.CommInfoBase.COMM_PERC, 
            leverage=leverage, 
            stocklike=not is_futures
        )

        if slippage > 0: cerebro.broker.set_slippage_perc(perc=slippage)
            
        cerebro.addsizer(bt.sizers.PercentSizer, percents=90)
        cerebro.addanalyzer(bt.analyzers.TradeAnalyzer, _name="trades")
        cerebro.addanalyzer(bt.analyzers.DrawDown, _name="drawdown")
        cerebro.addanalyzer(bt.analyzers.SharpeRatio, _name="sharpe", riskfreerate=0.0)
        
        try:
            results = cerebro.run()
            strat = results[0]
            end_value = cerebro.broker.getvalue()
            profit_percent = ((end_value - initial_cash) / initial_cash) * 100
            
            dd = strat.analyzers.drawdown.get_analysis()
            max_drawdown = dd.get('max', {}).get('drawdown', 0)
            
            sharpe = strat.analyzers.sharpe.get_analysis()
            sharpe_ratio = sharpe.get('sharperatio', 0) or 0

            trade_analysis = strat.analyzers.trades.get_analysis()
            total_closed = trade_analysis.get('total', {}).get('closed', 0)
            won_trades = trade_analysis.get('won', {}).get('total', 0)
            win_rate = (won_trades / total_closed * 100) if total_closed > 0 else 0
            
            return {
                "profitPercent": round(profit_percent, 2),
                "maxDrawdown": round(max_drawdown, 2),
                "sharpeRatio": round(sharpe_ratio, 2),
                "total_trades": total_closed,
                "winRate": round(win_rate, 2),
                "final_value": round(end_value, 2),
                "initial_cash": initial_cash,
                "total_candles": len(df)
            }
        except Exception:
            return {
                "profitPercent": 0, 
                "maxDrawdown": 0, 
                "sharpeRatio": 0, 
                "total_trades": 0, 
                "winRate": 0, 
                "final_value": initial_cash, 
                "initial_cash": initial_cash,
                "total_candles": len(df) if df is not None else 0
            }

    # ... (বাকি মেথডগুলো অপরিবর্তিত রাখুন) ...
    def _load_strategy_class(self, strategy_name):
        # ১. ম্যাপ থেকে চেক করা (স্ট্যান্ডার্ড স্ট্র্যাটেজি)
        strategy_class = STRATEGY_MAP.get(strategy_name)
        
        # ২. ফাইল থেকে লোড করা (কাস্টম স্ট্র্যাটেজি)
        if not strategy_class:
            try:
                current_file_dir = os.path.dirname(os.path.abspath(__file__))
                custom_strategies_dir = os.path.join(current_file_dir, '..', 'strategies', 'custom')
                custom_strategies_dir = os.path.normpath(custom_strategies_dir)
                
                file_name = f"{strategy_name}.py" if not strategy_name.endswith(".py") else strategy_name
                file_path = os.path.join(custom_strategies_dir, file_name)
                
                if os.path.exists(file_path):
                    module_name = file_name.replace('.py', '')
                    
                    # পুরোনো মডিউল ক্যাশ থেকে সরানো (রিলোড নিশ্চিত করতে)
                    if module_name in sys.modules: 
                        del sys.modules[module_name]
                        
                    spec = importlib.util.spec_from_file_location(module_name, file_path)
                    if spec and spec.loader:
                        module = importlib.util.module_from_spec(spec)
                        sys.modules[module_name] = module
                        spec.loader.exec_module(module)
                    else: 
                        return None
                    
                    # ✅ ফিক্স: শুধু এই মডিউলে ডিফাইন করা ক্লাসটিই রিটার্ন করবে
                    # এটি ইম্পোর্ট করা অন্য ক্লাস (যেমন BaseStrategy) ইগনোর করবে
                    for name, obj in inspect.getmembers(module):
                        if inspect.isclass(obj) and issubclass(obj, bt.Strategy) and obj is not bt.Strategy:
                            # 🔴 গুরুত্বপূর্ণ চেক: ক্লাসটি কি এই ফাইলেই ডিফাইন করা হয়েছে?
                            if obj.__module__ == module_name:
                                return obj
                                
            except Exception as e: 
                print(f"❌ Exception loading custom strategy '{strategy_name}': {e}")
                
        return strategy_class

    # ✅ অপটিমাইজড প্যারামিটার ফিল্টার (Smart Matcher)
    def _smart_filter_params(self, strategy_class, params):
        valid_params = {}
        
        # ১. স্ট্র্যাটেজির নিজস্ব প্যারামিটার লিস্ট বের করা
        if hasattr(strategy_class, 'params'):
            # Backtrader এর params dict বা tuple হতে পারে
            if hasattr(strategy_class.params, '_getkeys'):
                allowed_keys = strategy_class.params._getkeys()
            elif isinstance(strategy_class.params, dict):
                allowed_keys = strategy_class.params.keys()
            else:
                # Fallback for tuple based params
                allowed_keys = dict(strategy_class.params).keys()

            # ২. নরমাল এবং লোয়ারকেস ম্যাপ তৈরি (Case Insensitive Matching)
            # এটি fast_period, fastPeriod, FastPeriod সব কিছুকে একই ধরবে
            key_map = {k.lower().replace('_', ''): k for k in allowed_keys}
            
            # ৩. ইউজার ইনপুট চেক করা
            for k, v in params.items():
                # সরাসরি ম্যাচ করলে
                if k in allowed_keys:
                    valid_params[k] = v
                else:
                    # যদি নাম হুবহু না মিলে, তবে লোয়ারকেস চেক করা
                    clean_k = k.lower().replace('_', '')
                    if clean_k in key_map:
                        real_key = key_map[clean_k]
                        valid_params[real_key] = v
                        # print(f"🔧 Param Fixed: '{k}' -> '{real_key}'") # Debugging log
                    else:
                        # যদি তাও না মিলে, ইগনোর করবে (Risk params বাদে)
                        pass 

        return valid_params

    def _calculate_metrics(self, first_strat, start_value, end_value):
        qs_metrics = {
            "sharpe": 0, "sortino": 0, "max_drawdown": 0, "win_rate": 0, 
            "profit_factor": 0, "cagr": 0, "volatility": 0, "calmar": 0, 
            "recovery_factor": 0, "expected_return": 0
        }
        heatmap_data = []
        underwater_data = []
        histogram_data = []
        
        try:
            portfolio_stats = first_strat.analyzers.getbyname('pyfolio')
            returns, positions, transactions, gross_lev = portfolio_stats.get_pf_items()
            returns.index = returns.index.tz_localize(None)
            
            sharpe_val = 0
            if not returns.empty and len(returns) > 5:
                try: sharpe_val = qs.stats.sharpe(returns)
                except: sharpe_val = 0
            
            # --- মেট্রিক্স ক্যালকুলেশন ---
            qs_metrics = {
                "sharpe": sharpe_val,
                "sortino": qs.stats.sortino(returns) if not returns.empty else 0,
                "max_drawdown": qs.stats.max_drawdown(returns) * 100 if not returns.empty else 0,
                "win_rate": qs.stats.win_rate(returns) * 100 if not returns.empty else 0,
                "profit_factor": qs.stats.profit_factor(returns) if not returns.empty else 0,
                "cagr": qs.stats.cagr(returns) * 100 if not returns.empty else 0,
                "volatility": qs.stats.volatility(returns) * 100 if not returns.empty else 0,
                "calmar": qs.stats.calmar(returns) if not returns.empty else 0,
                "recovery_factor": qs.stats.recovery_factor(returns) if not returns.empty else 0,
                "expected_return": qs.stats.expected_return(returns) * 100 if not returns.empty else 0
            }

            # --- Heatmap Data ---
            if not returns.empty:
                monthly_ret_series = returns.resample('ME').apply(lambda x: (1 + x).prod() - 1)
                for timestamp, value in monthly_ret_series.items():
                    val = value * 100
                    # NaN বা Inf চেক
                    if isinstance(val, (int, float)) and not (math.isnan(val) or math.isinf(val)):
                        heatmap_data.append({"year": timestamp.year, "month": timestamp.month, "value": round(val, 2)})
            
            # --- Underwater Data ---
            drawdown_series = qs.stats.to_drawdown_series(returns)
            for t, v in drawdown_series.items():
                val = v * 100
                if isinstance(val, (int, float)) and not (math.isnan(val) or math.isinf(val)):
                    underwater_data.append({"time": int(t.timestamp()), "value": round(val, 2)})
            
            # --- Histogram Data ---
            clean_returns = returns.dropna()
            if not clean_returns.empty:
                hist_values, bin_edges = np.histogram(clean_returns * 100, bins=20)
                for i in range(len(hist_values)):
                    if hist_values[i] > 0: 
                        histogram_data.append({"range": f"{round(bin_edges[i], 1)}% to {round(bin_edges[i+1], 1)}%", "frequency": int(hist_values[i])})
                        
        except Exception as e: 
            print(f"⚠️ Metrics Calculation Error: {e}")
            pass

        # ✅ ফাইনাল স্যানিটাইজেশন (NaN/Inf কে 0 তে কনভার্ট করা)
        sanitized_metrics = {}
        for k, v in qs_metrics.items():
            if isinstance(v, (int, float)):
                if math.isnan(v) or math.isinf(v):
                    sanitized_metrics[k] = 0.0
                else:
                    sanitized_metrics[k] = round(v, 2)
            else:
                sanitized_metrics[k] = 0.0

        return {
            "metrics": sanitized_metrics, 
            "heatmap": heatmap_data, 
            "underwater": underwater_data, 
            "histogram": histogram_data
        }

    # Helper method already added in previous step
    def _format_trade_analysis(self, strategy):
        # ... (keep this method as provided in previous response) ...
        try:
            analysis = strategy.analyzers.trades.get_analysis()
            def get(d, keys, default=0):
                for k in keys:
                    if isinstance(d, dict): d = d.get(k, default)
                    else: return default
                return d
            total = analysis.get('total', {})
            won = analysis.get('won', {})
            lost = analysis.get('lost', {})
            pnl = analysis.get('pnl', {})
            long_t = analysis.get('long', {})
            short_t = analysis.get('short', {})
            total_closed = total.get('closed', 0)
            total_open = total.get('open', 0)
            total_won = won.get('total', 0)
            total_lost = lost.get('total', 0)
            win_rate = (total_won / total_closed * 100) if total_closed > 0 else 0
            gross_pnl = get(pnl, ['gross', 'total'])
            net_pnl = get(pnl, ['net', 'total'])
            avg_pnl = get(pnl, ['net', 'average'])
            avg_win_trade = get(won, ['pnl', 'average'])
            avg_loss_trade = get(lost, ['pnl', 'average'])
            ratio_avg_win_loss = abs(avg_win_trade / avg_loss_trade) if avg_loss_trade != 0 else 0
            largest_win_value = get(won, ['pnl', 'max'])
            largest_loss_value = get(lost, ['pnl', 'max'])
            largest_win_percent = 0
            largest_loss_percent = 0
            if hasattr(strategy, '_trades'):
                all_trades = []
                for feed in strategy._trades:
                    all_trades.extend(strategy._trades[feed][0]) 
                for t in all_trades:
                    investment = t.price * t.size
                    if investment != 0:
                        roi = (t.pnl / abs(investment)) * 100
                        if roi > largest_win_percent: largest_win_percent = roi
                        if roi < largest_loss_percent: largest_loss_percent = roi
            return {
                "total_closed": total_closed,
                "total_open": total_open,
                "total_won": total_won,
                "total_lost": total_lost,
                "win_rate": round(win_rate, 2),
                "long_trades_total": long_t.get('total', 0),
                "long_trades_won": get(long_t, ['won', 'total']),
                "short_trades_total": short_t.get('total', 0),
                "short_trades_won": get(short_t, ['won', 'total']),
                "gross_profit": round(gross_pnl, 2),
                "net_profit": round(net_pnl, 2),
                "avg_pnl": round(avg_pnl, 2),
                "avg_win": round(avg_win_trade, 2),
                "avg_loss": round(avg_loss_trade, 2),
                "ratio_avg_win_loss": round(ratio_avg_win_loss, 2),
                "largest_win_value": round(largest_win_value, 2),
                "largest_loss_value": round(largest_loss_value, 2),
                "largest_win_percent": round(largest_win_percent, 2),
                "largest_loss_percent": round(largest_loss_percent, 2),
            }
        except Exception as e:
            return {}

    # ✅ NEW: Helper to build dynamic strategy class
    def _build_custom_strategy(self, db: Session, indicator_id: int, base_strategy_name: str):
        """
        Retrieves a custom indicator from DB and creates a Strategy Class that uses it.
        We assume 'base_strategy_name' (e.g., 'SMA Crossover') defines the logic structure,
        and we override its indicator parameters with the custom ones.
        """
        indicator = db.query(UserIndicator).filter(UserIndicator.id == indicator_id).first()
        if not indicator:
            return None

        # 1. Load the Base Strategy Class
        # For simplicity, we assume we wrap a standard strategy or use a Generic one.
        # If user selected "SMA Crossover" in UI but passed a custom "RSI" indicator, 
        # it might not make sense unless the strategy is "Generic Indicator Strategy".
        
        # For this version, let's assume we use a Generic Strategy called 'CustomIndicatorStrategy'
        # OR we override params of the selected strategy if compatible.
        
        # Let's try to load the 'GenericStrategy' or fallback to the requested name.
        base_class = self._load_strategy_class(base_strategy_name) 
        if not base_class:
            return None

        # 2. Map Indicator Params to Strategy Params
        # This is tricky because param names must match.
        # We'll create a subclass with default params override.
        
        # Dynamic Subclassing
        class DynamicCustomStrategy(base_class):
            params = (
                ('custom_indicator_params', indicator.parameters), # Pass all useful params
            )
            
            def __init__(self):
                # Apply custom params overrides if variables match
                # e.g. if saved indicator has 'period': 14 and strategy has 'period' param.
                
                # Check backend stored params
                saved_params = indicator.parameters or {}
                
                # We try to inject them into the strategy instance params
                for key, val in saved_params.items():
                    if hasattr(self.params, key):
                        setattr(self.params, key, val)
                    
                    # Also handle some common mappings if names differ
                    # e.g. saved 'length' -> strategy 'period'
                    if key == 'length' and hasattr(self.params, 'period'):
                        self.params.period = val
                    if key == 'period' and hasattr(self.params, 'length'):
                        self.params.length = val
                        
                super().__init__()
                
        # Optional: Log what happened
        print(f"✨ Created Dynamic Strategy using Indicator: {indicator.name} ({indicator.base_type})")
        
        return DynamicCustomStrategy