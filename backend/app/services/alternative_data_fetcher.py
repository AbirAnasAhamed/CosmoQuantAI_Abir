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
    Fetches alternative data sources for ML model feature engineering:
    1. Crypto Fear & Greed Index
    2. GitHub Commit Frequency (Developer Activity)
    3. Google Trends (Search Interest)
    4. Exchange Net Flow (On-Chain Sentiment)
    5. On-Chain Liquidity Ratio
    6. Macro Intelligence: CPI Surprise, NFP Surprise, Rate Sentiment
    """
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=15.0)

    async def close(self):
        await self.http_client.aclose()

    async def fetch_fear_and_greed(self, limit: int = 30) -> pd.DataFrame:
        """
        Fetch historical Crypto Fear & Greed Index.
        Returns a DataFrame with ['timestamp', 'fng_value']
        """
        try:
            url = f"https://api.alternative.me/fng/?limit={limit}"
            response = await self.http_client.get(url)
            response.raise_for_status()
            data = response.json()
            
            if data.get("metadata", {}).get("error"):
                logger.error(f"F&G API Error: {data['metadata']['error']}")
                return pd.DataFrame()

            records = []
            for item in data.get("data", []):
                records.append({
                    "timestamp": pd.to_datetime(int(item["timestamp"]), unit='s'),
                    "fng_value": int(item["value"]),
                })
            
            df = pd.DataFrame(records)
            if not df.empty:
                df.set_index('timestamp', inplace=True)
                df.sort_index(inplace=True)
            return df
        except Exception as e:
            logger.error(f"Error fetching Fear & Greed index: {e}")
            return pd.DataFrame()

    async def fetch_github_activity(self, repo: str = "bitcoin/bitcoin", days: int = 30) -> pd.DataFrame:
        """
        Fetch commit frequency for a given GitHub repository.
        Returns a DataFrame with ['timestamp', 'commit_count']
        """
        try:
            since_date = (datetime.utcnow() - timedelta(days=days)).isoformat() + "Z"
            url = f"https://api.github.com/repos/{repo}/commits?since={since_date}&per_page=100"
            
            headers = {"Accept": "application/vnd.github.v3+json"}
            response = await self.http_client.get(url, headers=headers)
            response.raise_for_status()
            commits = response.json()
            
            commit_dates = [c["commit"]["author"]["date"][:10] for c in commits]
            if not commit_dates:
                return pd.DataFrame()
                
            df = pd.DataFrame(commit_dates, columns=["date"])
            df["commit_count"] = 1
            df = df.groupby("date").count()
            df.index = pd.to_datetime(df.index)
            return df
        except Exception as e:
            logger.error(f"Error fetching GitHub activity for {repo}: {e}")
            return pd.DataFrame()

    def fetch_google_trends(self, keyword: str = "Bitcoin", timeframe: str = "today 1-m") -> pd.DataFrame:
        """
        Synchronous fetch of Google Trends data using pytrends.
        """
        try:
            from pytrends.request import TrendReq
            from requests.exceptions import HTTPError
            pytrend = TrendReq(hl='en-US', tz=360)
            pytrend.build_payload(kw_list=[keyword], timeframe=timeframe)
            df = pytrend.interest_over_time()
            
            if not df.empty and 'isPartial' in df.columns:
                df = df.drop(columns=['isPartial'])
                df.rename(columns={keyword: 'search_interest'}, inplace=True)
            return df
        except ImportError:
            logger.error("pytrends is not installed. Run `pip install pytrends`.")
            return pd.DataFrame()
        except Exception as e:
            if "429" in str(e):
                logger.warning(f"Google Trends rate limit exceeded (429) for {keyword}. Using neutral fallback.")
            else:
                logger.error(f"Error fetching Google Trends for {keyword}: {e}")
            return pd.DataFrame()

    async def fetch_exchange_flow(self) -> pd.DataFrame:
        """
        Fetch Exchange Net Flow from internal on-chain API.
        Returns a single-row DataFrame with 'exchange_net_flow' (ETH net flow value).
        We forward-fill this scalar as a daily feature column.
        """
        try:
            response = await self.http_client.get("/api/v1/on-chain/exchange-flow")
            if response.status_code == 200:
                data = response.json()
                net_flow = float(data.get("net_flow", 0.0))
                return pd.DataFrame({"exchange_net_flow": [net_flow]})
        except Exception as e:
            logger.warning(f"Exchange flow fetch failed: {e}")
        return pd.DataFrame()

    async def fetch_onchain_liquidity(self) -> pd.DataFrame:
        """
        Fetch on-chain liquidity ratio from internal API.
        Returns a single-row DataFrame with 'onchain_liquidity'.
        """
        try:
            response = await self.http_client.get("/api/v1/on-chain/liquidity")
            if response.status_code == 200:
                data = response.json()
                liquidity = float(data.get("liquidity_ratio", data.get("ratio", 1.0)))
                return pd.DataFrame({"onchain_liquidity": [liquidity]})
        except Exception as e:
            logger.warning(f"On-chain liquidity fetch failed: {e}")
        return pd.DataFrame()

    async def fetch_macro_intelligence(self, days: int = 30) -> pd.DataFrame:
        """
        Fetch macro economic events and compute:
        - macro_cpi_surprise: (actual - forecast) / |forecast|
        - macro_nfp_surprise: same formula for non-farm payroll
        - macro_rate_sentiment: -1 (hike), 0 (hold), +1 (cut)
        Returns a daily DataFrame with these 3 columns.
        """
        try:
            response = await self.http_client.get("/api/v1/sentiment/macro-economics")
            if response.status_code != 200:
                return pd.DataFrame()
            events = response.json()

            cpi_surprise = 0.0
            nfp_surprise = 0.0
            rate_sentiment = 0.0

            def parse_num(val: str) -> float | None:
                if not val or val == '--':
                    return None
                try:
                    return float(str(val).replace('%', '').replace('K', '000').replace('M', '000000').strip())
                except Exception:
                    return None

            for ev in events:
                name = ev.get("event", "").upper()
                actual = parse_num(ev.get("actual"))
                forecast = parse_num(ev.get("forecast"))
                if actual is None or forecast is None:
                    continue
                denom = abs(forecast) if abs(forecast) > 0 else 1.0

                if "CPI" in name:
                    cpi_surprise = (actual - forecast) / denom
                elif "NON-FARM" in name or "NFP" in name or "PAYROLL" in name:
                    nfp_surprise = (actual - forecast) / denom
                elif "INTEREST RATE" in name or "FED RATE" in name or "FOMC" in name:
                    delta = actual - forecast
                    rate_sentiment = -1.0 if delta > 0.1 else (1.0 if delta < -0.1 else 0.0)

            return pd.DataFrame({
                "macro_cpi_surprise": [round(cpi_surprise, 6)],
                "macro_nfp_surprise": [round(nfp_surprise, 6)],
                "macro_rate_sentiment": [rate_sentiment],
            })
        except Exception as e:
            logger.warning(f"Macro intelligence fetch failed: {e}")
            return pd.DataFrame()

    async def build_alternative_features(self, df_index: pd.DatetimeIndex, symbol: str) -> pd.DataFrame:
        """
        Fetch all alternative data and align it to the main DataFrame index.
        Runs all fetches concurrently for performance.
        """
        logger.info(f"Fetching alternative & sentiment features for {symbol}...")
        
        min_date = df_index.min()
        if min_date.tz is not None:
            min_date = min_date.tz_localize(None)
        days_needed = (pd.Timestamp.utcnow().tz_localize(None) - min_date).days + 2

        # ── Run all async fetches concurrently ──
        repo = "bitcoin/bitcoin" if "BTC" in symbol else "ethereum/go-ethereum"
        keyword = "Bitcoin" if "BTC" in symbol else ("Ethereum" if "ETH" in symbol else "Crypto")

        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)

        (fng_df, gh_df, exchange_flow_df, liquidity_df, macro_df) = await asyncio.gather(
            self.fetch_fear_and_greed(limit=days_needed),
            self.fetch_github_activity(repo=repo, days=days_needed),
            self.fetch_exchange_flow(),
            self.fetch_onchain_liquidity(),
            self.fetch_macro_intelligence(days=days_needed),
            return_exceptions=False,
        )

        # Google Trends is sync — run in executor
        gt_df = await loop.run_in_executor(None, self.fetch_google_trends, keyword, "today 3-m")

        # ── Build daily DataFrame skeleton ──
        start_date = df_index.min()
        end_date = df_index.max()
        if start_date.tz is not None:
            start_date = start_date.tz_localize(None)
            end_date = end_date.tz_localize(None)
            
        alt_df = pd.DataFrame(index=pd.date_range(start=start_date, end=end_date, freq='D'))

        # Join time-series features (F&G, GitHub, Trends)
        for part_df in [fng_df, gh_df, gt_df]:
            if not isinstance(part_df, Exception) and not part_df.empty:
                if part_df.index.tz is not None:
                    part_df.index = part_df.index.tz_localize(None)
                alt_df = alt_df.join(part_df, how='left')

        # ── Scalar features: broadcast single latest value to entire period ──
        # exchange_net_flow
        if not isinstance(exchange_flow_df, Exception) and not exchange_flow_df.empty:
            alt_df["exchange_net_flow"] = exchange_flow_df["exchange_net_flow"].iloc[0]
        else:
            alt_df["exchange_net_flow"] = 0.0

        # onchain_liquidity
        if not isinstance(liquidity_df, Exception) and not liquidity_df.empty:
            alt_df["onchain_liquidity"] = liquidity_df["onchain_liquidity"].iloc[0]
        else:
            alt_df["onchain_liquidity"] = 1.0

        # macro features
        if not isinstance(macro_df, Exception) and not macro_df.empty:
            alt_df["macro_cpi_surprise"] = macro_df["macro_cpi_surprise"].iloc[0]
            alt_df["macro_nfp_surprise"] = macro_df["macro_nfp_surprise"].iloc[0]
            alt_df["macro_rate_sentiment"] = macro_df["macro_rate_sentiment"].iloc[0]
        else:
            alt_df["macro_cpi_surprise"] = 0.0
            alt_df["macro_nfp_surprise"] = 0.0
            alt_df["macro_rate_sentiment"] = 0.0
            
        # ── Forward-fill + back-fill ──
        alt_df.ffill(inplace=True)
        alt_df.bfill(inplace=True)

        # ── Neutral defaults for any remaining NaNs ──
        neutral_defaults = {
            "fng_value": 50,
            "commit_count": 0,
            "search_interest": 50,
            "exchange_net_flow": 0.0,
            "onchain_liquidity": 1.0,
            "macro_cpi_surprise": 0.0,
            "macro_nfp_surprise": 0.0,
            "macro_rate_sentiment": 0.0,
        }
        for col, default in neutral_defaults.items():
            if col not in alt_df.columns:
                alt_df[col] = default
            alt_df[col] = alt_df[col].fillna(default)

        # Localize timezone back if needed
        if df_index.tz is not None:
            alt_df.index = alt_df.index.tz_localize(df_index.tz)

        # Reindex to exact timestamps of main dataframe using forward fill
        final_df = alt_df.reindex(df_index, method='ffill')
        
        logger.info(f"Alternative features built: {list(final_df.columns)}")
        return final_df
