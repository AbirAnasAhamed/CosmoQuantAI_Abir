import httpx
import logging
import pandas as pd
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
    """
    
    def __init__(self):
        self.http_client = httpx.AsyncClient(timeout=10.0)

    async def close(self):
        await self.http_client.aclose()

    async def fetch_fear_and_greed(self, limit: int = 30) -> pd.DataFrame:
        """
        Fetch historical Crypto Fear & Greed Index.
        Returns a DataFrame with ['timestamp', 'fng_value', 'fng_classification']
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
                    # 'fng_classification': item["value_classification"]
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
            
            # Count commits per day
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
            logger.error(f"Error fetching Google Trends for {keyword}: {e}")
            return pd.DataFrame()

    async def build_alternative_features(self, df_index: pd.DatetimeIndex, symbol: str) -> pd.DataFrame:
        """
        Fetch all alternative data and align it to the main DataFrame index.
        """
        logger.info(f"Fetching alternative data for {symbol}...")
        
        # 1. Fetch F&G
        min_date = df_index.min()
        if min_date.tz is not None:
            min_date = min_date.tz_localize(None)
        days_needed = (pd.Timestamp.utcnow().tz_localize(None) - min_date).days + 2
        fng_df = await self.fetch_fear_and_greed(limit=days_needed)
        
        # 2. Fetch GitHub (assuming BTC for symbol BTC/USDT)
        repo = "bitcoin/bitcoin" if "BTC" in symbol else "ethereum/go-ethereum"
        gh_df = await self.fetch_github_activity(repo=repo, days=days_needed)
        
        # 3. Fetch Google Trends (Run in executor since it's sync)
        keyword = "Bitcoin" if "BTC" in symbol else ("Ethereum" if "ETH" in symbol else "Crypto")
        try:
            loop = asyncio.get_event_loop()
            if loop.is_closed():
                raise RuntimeError
        except RuntimeError:
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            
        gt_df = await loop.run_in_executor(None, self.fetch_google_trends, keyword, "today 3-m")

        # Combine into a single daily DataFrame
        start_date = df_index.min()
        end_date = df_index.max()
        if start_date.tz is not None:
            start_date = start_date.tz_localize(None)
            end_date = end_date.tz_localize(None)
            
        alt_df = pd.DataFrame(index=pd.date_range(start=start_date, end=end_date, freq='D'))
        
        if not fng_df.empty:
            if fng_df.index.tz is not None:
                fng_df.index = fng_df.index.tz_localize(None)
            alt_df = alt_df.join(fng_df, how='left')
        if not gh_df.empty:
            if gh_df.index.tz is not None:
                gh_df.index = gh_df.index.tz_localize(None)
            alt_df = alt_df.join(gh_df, how='left')
        if not gt_df.empty:
            # Resample gt_df to daily if needed (pytrends returns daily for 3-m)
            if gt_df.index.tz is not None:
                gt_df.index = gt_df.index.tz_localize(None)
            alt_df = alt_df.join(gt_df, how='left')
            
        # Forward fill daily alternative data to match potentially higher frequency df_index
        alt_df.ffill(inplace=True)
        # Backfill any remaining NaNs at the start
        alt_df.bfill(inplace=True)
        # Fill remaining with 0 or neutral values
        alt_df['fng_value'] = alt_df.get('fng_value', pd.Series(50, index=alt_df.index)).fillna(50)
        alt_df['commit_count'] = alt_df.get('commit_count', pd.Series(0, index=alt_df.index)).fillna(0)
        alt_df['search_interest'] = alt_df.get('search_interest', pd.Series(50, index=alt_df.index)).fillna(50)

        # Localize back to original timezone if needed
        if df_index.tz is not None:
            alt_df.index = alt_df.index.tz_localize(df_index.tz)

        # Finally, reindex to the exact timestamps of the main dataframe using forward fill
        final_df = alt_df.reindex(df_index, method='ffill')
        return final_df
