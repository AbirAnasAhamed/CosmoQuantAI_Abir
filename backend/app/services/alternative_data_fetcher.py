import httpx
import logging
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import asyncio
from typing import Dict, Any, List

logger = logging.getLogger(__name__)


class AlternativeDataFetcher:
    """
    Fetches alternative data sources for ML model feature engineering.

    KEY DESIGN:
    - Internal API calls (exchange flow, liquidity, macro) use direct Python
      service imports instead of HTTP — avoids 'missing http:// protocol' error
      in Celery workers.
    - build_alternative_features() works correctly for BOTH daily OHLCV AND
      intraday L2/HybridDeep data (where start_date == end_date).
    """

    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=15.0)

    async def close(self):
        await self.http_client.aclose()

    # ─────────────────────────────────────────────────────────────────────────
    # 1. Fear & Greed Index  (external — alternative.me)
    # ─────────────────────────────────────────────────────────────────────────
    async def fetch_fear_and_greed(self, limit: int = 30) -> pd.DataFrame:
        try:
            url = f"https://api.alternative.me/fng/?limit={limit}"
            response = await self.http_client.get(url)
            response.raise_for_status()
            data = response.json()

            if data.get("metadata", {}).get("error"):
                return pd.DataFrame()

            records = [
                {
                    "timestamp": pd.to_datetime(int(item["timestamp"]), unit='s'),
                    "fng_value": int(item["value"]),
                }
                for item in data.get("data", [])
            ]
            df = pd.DataFrame(records)
            if not df.empty:
                df.set_index("timestamp", inplace=True)
                df.sort_index(inplace=True)
            return df
        except Exception as e:
            logger.error(f"Fear & Greed fetch failed: {e}")
            return pd.DataFrame()

    # ─────────────────────────────────────────────────────────────────────────
    # 2. GitHub Commit Activity  (external — github.com, authenticated)
    # ─────────────────────────────────────────────────────────────────────────
    async def fetch_github_activity(self, repo: str = "bitcoin/bitcoin", days: int = 30) -> pd.DataFrame:
        try:
            from app.core.config import settings
            since_date = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
            url = f"https://api.github.com/repos/{repo}/commits?since={since_date}&per_page=100"

            headers = {"Accept": "application/vnd.github.v3+json"}
            if settings.GITHUB_TOKEN:
                headers["Authorization"] = f"Bearer {settings.GITHUB_TOKEN}"
                logger.info("GitHub API: using authenticated token (5000 req/hr)")
            else:
                logger.warning("GitHub API: no token — anonymous (60 req/hr)")

            response = await self.http_client.get(url, headers=headers)

            if response.status_code in (403, 429):
                logger.warning(f"GitHub rate-limit ({response.status_code}) for {repo}. Fallback to 0.")
                return pd.DataFrame()
            if response.status_code == 404:
                logger.warning(f"GitHub repo {repo} not found.")
                return pd.DataFrame()

            response.raise_for_status()
            commits = response.json()
            if not commits:
                return pd.DataFrame()

            commit_dates = [
                c["commit"]["author"]["date"][:10]
                for c in commits
                if isinstance(c, dict)
            ]
            if not commit_dates:
                return pd.DataFrame()

            df = pd.DataFrame(commit_dates, columns=["date"])
            df["commit_count"] = 1
            df = df.groupby("date").count()
            df.index = pd.to_datetime(df.index)
            return df
        except Exception as e:
            logger.error(f"GitHub activity fetch failed: {e}")
            return pd.DataFrame()

    # ─────────────────────────────────────────────────────────────────────────
    # 3. Google Trends  (external — pytrends, sync)
    # ─────────────────────────────────────────────────────────────────────────
    def fetch_google_trends(self, keyword: str = "Bitcoin", timeframe: str = "today 1-m") -> pd.DataFrame:
        try:
            from pytrends.request import TrendReq
            pytrend = TrendReq(hl="en-US", tz=360)
            pytrend.build_payload(kw_list=[keyword], timeframe=timeframe)
            df = pytrend.interest_over_time()
            if not df.empty and "isPartial" in df.columns:
                df = df.drop(columns=["isPartial"])
                df.rename(columns={keyword: "search_interest"}, inplace=True)
            return df
        except ImportError:
            logger.error("pytrends not installed.")
            return pd.DataFrame()
        except Exception as e:
            if "429" in str(e):
                logger.warning(f"Google Trends rate-limit for {keyword}. Fallback to neutral.")
            else:
                logger.error(f"Google Trends fetch failed: {e}")
            return pd.DataFrame()

    # ─────────────────────────────────────────────────────────────────────────
    # 4. Exchange Net Flow  (DIRECT SERVICE IMPORT — no HTTP)
    # ─────────────────────────────────────────────────────────────────────────
    async def fetch_exchange_flow(self) -> pd.DataFrame:
        try:
            from app.services.exchange_flow_service import ExchangeFlowService
            data = await ExchangeFlowService.calculate_netflow()
            net_flow = float(data.get("net_flow", 0.0))
            logger.info(f"Exchange Net Flow: {net_flow:.4f} ETH")
            return pd.DataFrame({"exchange_net_flow": [net_flow]})
        except Exception as e:
            logger.warning(f"Exchange flow fetch failed: {e}. Fallback 0.0.")
            return pd.DataFrame({"exchange_net_flow": [0.0]})

    # ─────────────────────────────────────────────────────────────────────────
    # 5. On-Chain Liquidity Ratio  (DIRECT SERVICE IMPORT — no HTTP)
    # ─────────────────────────────────────────────────────────────────────────
    async def fetch_onchain_liquidity(self, symbol: str = "BTC/USDT") -> pd.DataFrame:
        try:
            from app.services.on_chain_service import on_chain_service
            data = await on_chain_service.get_latest_metrics(symbol)
            inflow  = float(data.get("exchange_inflow_volume",  0.0))
            outflow = float(data.get("exchange_outflow_volume", 0.0))
            total   = inflow + outflow
            ratio   = round((outflow - inflow) / total, 6) if total > 0 else 0.0
            logger.info(f"On-chain liquidity ratio: {ratio:.4f}")
            return pd.DataFrame({"onchain_liquidity": [ratio]})
        except Exception as e:
            logger.warning(f"On-chain liquidity fetch failed: {e}. Fallback 0.0.")
            return pd.DataFrame({"onchain_liquidity": [0.0]})

    # ─────────────────────────────────────────────────────────────────────────
    # 6. Macro Intelligence  (DIRECT SERVICE IMPORT — no HTTP)
    # ─────────────────────────────────────────────────────────────────────────
    async def fetch_macro_intelligence(self) -> pd.DataFrame:
        try:
            from app.services.economic_service import economic_service
            events = economic_service.get_latest_indicators()

            cpi_surprise    = 0.0
            nfp_surprise    = 0.0
            rate_sentiment  = 0.0

            def parse_num(val):
                if not val or val == "--":
                    return None
                try:
                    return float(str(val).replace("%", "").replace("K", "000").replace("M", "000000").strip())
                except Exception:
                    return None

            for ev in events:
                name     = (ev.get("event") or "").upper()
                actual   = parse_num(ev.get("actual"))
                forecast = parse_num(ev.get("forecast"))
                if actual is None or forecast is None:
                    continue
                denom = abs(forecast) if abs(forecast) > 0.0001 else 1.0

                if "CPI" in name or "CONSUMER PRICE" in name:
                    cpi_surprise = round((actual - forecast) / denom, 6)
                    logger.info(f"CPI Surprise: {cpi_surprise:+.4f}")
                elif "NON-FARM" in name or "NFP" in name or "PAYROLL" in name or "NONFARM" in name:
                    nfp_surprise = round((actual - forecast) / denom, 6)
                    logger.info(f"NFP Surprise: {nfp_surprise:+.4f}")
                elif "INTEREST RATE" in name or "FOMC" in name or "FEDERAL FUNDS" in name:
                    delta = actual - forecast
                    rate_sentiment = -1.0 if delta > 0.1 else (1.0 if delta < -0.1 else 0.0)
                    logger.info(f"Rate Sentiment: {rate_sentiment}")

            return pd.DataFrame({
                "macro_cpi_surprise":   [cpi_surprise],
                "macro_nfp_surprise":   [nfp_surprise],
                "macro_rate_sentiment": [rate_sentiment],
            })
        except Exception as e:
            logger.warning(f"Macro intelligence fetch failed: {e}. Fallback 0.0.")
            return pd.DataFrame({
                "macro_cpi_surprise":   [0.0],
                "macro_nfp_surprise":   [0.0],
                "macro_rate_sentiment": [0.0],
            })

    # ─────────────────────────────────────────────────────────────────────────
    # Master builder — concurrent fetch + robust alignment
    # ─────────────────────────────────────────────────────────────────────────
    async def build_alternative_features(self, df_index: pd.DatetimeIndex, symbol: str, selected_features: List[str] = None) -> pd.DataFrame:
        """
        Fetch all alternative data and align it to the main DataFrame index.

        ROOT-CAUSE FIX for L2/HybridDeep (intraday) data:
        - When training on L2 tick data, df_index is ALL from ONE day
          (start_date == end_date). Old approach built a daily range with 1 row
          then tried reindex() → timezone mismatch → all NaN → neutral fallback.
        - NEW: Build a 30-day daily lookup table, then resolve each df_index
          timestamp via its DATE, and broadcast the result. Works for both
          daily OHLCV and millisecond-level L2 data.
        """
        logger.info(f"Building alternative & sentiment features for {symbol}...")

        # ── Normalize to tz-naive for safe arithmetic ─────────────
        original_tz = df_index.tz
        df_index_naive = df_index.tz_localize(None) if original_tz else df_index

        min_date = df_index_naive.min()
        max_date = df_index_naive.max()
        # At least 30 days so F&G lookup always finds a matching date
        days_needed = max(30, (pd.Timestamp.utcnow().tz_localize(None) - min_date).days + 2)

        repo    = "bitcoin/bitcoin" if "BTC" in symbol else "ethereum/go-ethereum"
        keyword = "Bitcoin"         if "BTC" in symbol else ("Ethereum" if "ETH" in symbol else "Crypto")

        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        # ── Filter tasks based on selected_features ───────────────
        if selected_features is None:
            selected_features = ["fng_value", "commit_count", "search_interest", "exchange_net_flow", "onchain_liquidity", "macro_cpi_surprise", "macro_nfp_surprise", "macro_rate_sentiment"]

        async def _empty_async(): return None
        
        tasks = []
        tasks.append(self.fetch_fear_and_greed(limit=days_needed) if "fng_value" in selected_features else _empty_async())
        tasks.append(self.fetch_github_activity(repo=repo, days=days_needed) if "commit_count" in selected_features else _empty_async())
        tasks.append(self.fetch_exchange_flow() if "exchange_net_flow" in selected_features else _empty_async())
        tasks.append(self.fetch_onchain_liquidity(symbol=symbol) if "onchain_liquidity" in selected_features else _empty_async())
        
        has_macro = any(f in selected_features for f in ["macro_cpi_surprise", "macro_nfp_surprise", "macro_rate_sentiment"])
        tasks.append(self.fetch_macro_intelligence() if has_macro else _empty_async())

        # ── Run all async fetches concurrently ────────────────────
        results = await asyncio.gather(*tasks, return_exceptions=True)
        fng_df, gh_df, exchange_flow_df, liquidity_df, macro_df = results

        def safe_df(result, fallback: dict) -> pd.DataFrame:
            return pd.DataFrame(fallback) if isinstance(result, Exception) or result is None or (isinstance(result, pd.DataFrame) and result.empty and fallback) else result

        fng_df           = safe_df(fng_df,           {})
        gh_df            = safe_df(gh_df,             {})
        exchange_flow_df = safe_df(exchange_flow_df,  {"exchange_net_flow": [0.0]})
        liquidity_df     = safe_df(liquidity_df,      {"onchain_liquidity": [0.0]})
        macro_df         = safe_df(macro_df,          {"macro_cpi_surprise": [0.0],
                                                        "macro_nfp_surprise": [0.0],
                                                        "macro_rate_sentiment": [0.0]})

        # Google Trends is sync
        if "search_interest" in selected_features:
            try:
                gt_df = await loop.run_in_executor(None, self.fetch_google_trends, keyword, "today 3-m")
            except Exception:
                gt_df = pd.DataFrame()
        else:
            gt_df = pd.DataFrame()

        # ── Build 30-day daily lookup table (tz-naive, date-normalized) ──
        extended_start = min_date - pd.Timedelta(days=30)
        lookup = pd.DataFrame(index=pd.date_range(start=extended_start, end=max_date, freq='D'))

        for part_df in [fng_df, gh_df, gt_df]:
            if isinstance(part_df, pd.DataFrame) and not part_df.empty:
                part = part_df.copy()
                if part.index.tz is not None:
                    part.index = part.index.tz_localize(None)
                part.index = part.index.normalize()   # strip HH:MM:SS → date only
                try:
                    lookup = lookup.join(part, how='left')
                except Exception as je:
                    logger.warning(f"Lookup join error: {je}")

        lookup.ffill(inplace=True)
        lookup.bfill(inplace=True)

        # ── Extract scalar values (one-shot per training run) ─────
        def scalar(df: pd.DataFrame, col: str, default: float) -> float:
            if isinstance(df, pd.DataFrame) and not df.empty and col in df.columns:
                try:
                    return float(df[col].iloc[0])
                except Exception:
                    pass
            return default

        exchange_net_flow_val    = scalar(exchange_flow_df, "exchange_net_flow",    0.0)
        onchain_liquidity_val    = scalar(liquidity_df,     "onchain_liquidity",    0.0)
        macro_cpi_surprise_val   = scalar(macro_df,         "macro_cpi_surprise",   0.0)
        macro_nfp_surprise_val   = scalar(macro_df,         "macro_nfp_surprise",   0.0)
        macro_rate_sentiment_val = scalar(macro_df,         "macro_rate_sentiment", 0.0)

        logger.info(
            f"Scalars → exchange_net_flow={exchange_net_flow_val:.4f}, "
            f"onchain_liquidity={onchain_liquidity_val:.4f}, "
            f"cpi_surprise={macro_cpi_surprise_val:.4f}, "
            f"nfp_surprise={macro_nfp_surprise_val:.4f}, "
            f"rate_sentiment={macro_rate_sentiment_val}"
        )

        # ── Build final_df aligned to df_index ───────────────────
        # For each timestamp in df_index, look up by normalized date.
        # This works for BOTH daily OHLCV and intraday L2 millisecond data.
        final_df = pd.DataFrame(index=df_index)

        # Normalize df_index to date-only for lookup key
        lookup_keys = df_index_naive.normalize()  # e.g., 2026-05-18 00:00:00

        # Time-series features: look up by date
        for col, neutral in [("fng_value", 50), ("commit_count", 0), ("search_interest", 50)]:
            if col in lookup.columns:
                values = lookup[col].reindex(lookup_keys, method='ffill').values
                s = pd.Series(values, index=df_index).ffill().bfill().fillna(neutral)
                final_df[col] = s.values
            else:
                final_df[col] = neutral

        # Scalar features: same value for every row (correct for intraday too)
        final_df["exchange_net_flow"]    = exchange_net_flow_val
        final_df["onchain_liquidity"]    = onchain_liquidity_val
        final_df["macro_cpi_surprise"]   = macro_cpi_surprise_val
        final_df["macro_nfp_surprise"]   = macro_nfp_surprise_val
        final_df["macro_rate_sentiment"] = macro_rate_sentiment_val

        # ── Diagnostic log ────────────────────────────────────────
        neutral_map = {"fng_value": 50, "commit_count": 0, "search_interest": 50}
        live_cols, flat_cols = [], []
        for col in final_df.columns:
            val     = final_df[col].iloc[0] if not final_df.empty else None
            neutral = neutral_map.get(col, 0.0)
            tag     = f"{col}={val:.4f}" if isinstance(val, float) else f"{col}={val}"
            (live_cols if val != neutral else flat_cols).append(tag)

        if live_cols:
            logger.info(f"Alt features with REAL values: {live_cols}")
        if flat_cols:
            logger.warning(f"Alt features at neutral defaults: {flat_cols}")

        return final_df
