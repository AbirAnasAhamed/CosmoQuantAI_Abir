import pandas as pd
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import datetime, timedelta, timezone
from app.models.education import EducationResource
from app.models import MarketData
from app.models.analysis import AnalysisSignal
from app.db.session import SessionLocal

class SocialVolumeAnalyzer:
    
    def __init__(self, db: Session = None):
        self.db = db if db else SessionLocal()

    def get_social_volume(self, symbol: str, hours: int = 24):
        """
        Aggregates social volume (news count) for the given symbol over the last N hours.
        Returns a DataFrame with hourly counts.
        """
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        query = self.db.query(
            EducationResource.published_at,
            EducationResource.id
        ).filter(
            EducationResource.published_at >= since
        )
        
        if symbol.lower() == "btc":
            term = "Bitcoin"
        elif symbol.lower() == "eth":
            term = "Ethereum"
        else:
            term = symbol
            
        query = query.filter(
            (EducationResource.category == term) | 
            (EducationResource.title.ilike(f"%{term}%"))
        )
        
        results = query.all()
        
        if not results:
            return pd.DataFrame()
            
        df = pd.DataFrame(results, columns=['timestamp', 'id'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
        df.set_index('timestamp', inplace=True)
        
        # Strict hourly resampling
        volume_df = df.resample('1h').count().rename(columns={'id': 'count'})
        return volume_df

    def get_price_data(self, symbol: str, hours: int = 24):
        """
        Fetches OHLCV data for the last N hours.
        """
        since = datetime.now(timezone.utc) - timedelta(hours=hours)
        
        query = self.db.query(
            MarketData.timestamp,
            MarketData.close
        ).filter(
            MarketData.symbol == f"{symbol}/USDT", 
            MarketData.timeframe == '1h',
            MarketData.timestamp >= since
        )
        
        results = query.all()
        
        if not results:
            return pd.DataFrame()
            
        df = pd.DataFrame(results, columns=['timestamp', 'close'])
        df['timestamp'] = pd.to_datetime(df['timestamp'], utc=True)
        df.set_index('timestamp', inplace=True)
        
        return df

    def detect_divergence(self, symbol: str):
        """
        Detects Bullish Divergence: Volume UP, Price FLAT/DOWN.
        """
        vol_df = self.get_social_volume(symbol, hours=48)
        price_df = self.get_price_data(symbol, hours=48)
        
        if vol_df.empty or price_df.empty:
            return None
            
        now = datetime.now(timezone.utc)
        split_time = now - timedelta(hours=24)
        
        current_vol = vol_df[vol_df.index >= split_time]['count'].sum()
        prev_vol = vol_df[vol_df.index < split_time]['count'].sum()
        
        if prev_vol == 0:
             if current_vol > 5: 
                 vol_change = 100.0
             else:
                 vol_change = 0.0
        else:
            vol_change = ((current_vol - prev_vol) / prev_vol) * 100
            
        try:
            current_price = price_df[price_df.index >= split_time]['close'].iloc[-1]
            start_price = price_df[price_df.index >= split_time]['close'].iloc[0]
            
            price_change = ((current_price - start_price) / start_price) * 100
        except IndexError:
            return None

        VOL_THRESHOLD = 20.0
        PRICE_MIN = -2.0
        PRICE_MAX = 2.0
        
        is_bullish_divergence = (vol_change > VOL_THRESHOLD) and (PRICE_MIN <= price_change <= PRICE_MAX)
        
        if is_bullish_divergence:
            print(f"🚀 Bullish Divergence Detected for {symbol}!")
            
            signal = AnalysisSignal(
                symbol=symbol,
                pattern_name="Bullish Divergence",
                signal_strength=vol_change,
                volume_change_pct=vol_change,
                price_change_pct=price_change,
                meta_data={
                    "current_volume": int(current_vol),
                    "prev_volume": int(prev_vol),
                    "current_price": float(current_price),
                    "period": "24h"
                }
            )
            self.db.add(signal)
            self.db.commit()
            return signal
            
        return None

    def close(self):
        self.db.close()
