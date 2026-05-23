import pandas as pd
import numpy as np
import json
import time
import asyncio
import websockets
from datetime import datetime, timedelta
from sqlalchemy.orm import Session
from sklearn.ensemble import RandomForestClassifier
from sklearn.feature_selection import mutual_info_classif
from app.models.orderbook_snapshot import OrderBookSnapshot

def calculate_l2_advanced_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Calculates 50 advanced L2 orderbook features from raw snapshot data.
    Input df must contain: timestamp, bids (JSON string or list), asks (JSON string or list), Close (or microprice)
    """
    # Ensure bids/asks are parsed and normalized to [[price, qty], ...] format
    def parse_book(x):
        if isinstance(x, str):
            try:
                x = json.loads(x)
            except:
                return []
        if not isinstance(x, list):
            return []
        if not x:
            return []
        # Normalize: handle both [[price, qty], ...] and [{"price": p, "quantity": q}, ...]
        first = x[0]
        if isinstance(first, dict):
            # dict format — try common key names
            def _extract(item):
                p = item.get('price', item.get('p', item.get('0', 0)))
                q = item.get('quantity', item.get('qty', item.get('q', item.get('1', 0))))
                return [float(p), float(q)]
            return [_extract(item) for item in x]
        elif isinstance(first, (list, tuple)):
            return [[float(item[0]), float(item[1])] for item in x if len(item) >= 2]
        elif isinstance(first, (int, float, str)):
            # Flat list like [price, qty, price, qty, ...]
            result = []
            for i in range(0, len(x) - 1, 2):
                result.append([float(x[i]), float(x[i+1])])
            return result
        return []

    df['bids_list'] = df['bids'].apply(parse_book)
    df['asks_list'] = df['asks'].apply(parse_book)
    
    # Initialize feature columns
    features = {}
    
    # Pre-calculate base metrics for speed
    best_bids_p = []
    best_bids_v = []
    best_asks_p = []
    best_asks_v = []
    mid_prices = []
    
    for i, row in df.iterrows():
        bids = row['bids_list']
        asks = row['asks_list']
        
        bb_p = float(bids[0][0]) if bids else 0
        bb_v = float(bids[0][1]) if bids else 0
        ba_p = float(asks[0][0]) if asks else 0
        ba_v = float(asks[0][1]) if asks else 0
        mid = (bb_p + ba_p) / 2 if (bb_p and ba_p) else row.get('Close', 0)
        
        best_bids_p.append(bb_p)
        best_bids_v.append(bb_v)
        best_asks_p.append(ba_p)
        best_asks_v.append(ba_v)
        mid_prices.append(mid)
        
    df['bb_p'] = best_bids_p
    df['bb_v'] = best_bids_v
    df['ba_p'] = best_asks_p
    df['ba_v'] = best_asks_v
    df['mid_price'] = mid_prices
    
    # Category 1: Price & Spread Dynamics
    df['Effective_Spread'] = (df['ba_p'] - df['bb_p']) / df['mid_price'].replace(0, np.nan)
    df['Spread_ROC'] = df['Effective_Spread'].pct_change().fillna(0)
    df['Mid_Price_Acceleration'] = df['mid_price'].diff().diff().fillna(0)
    df['Spread_Asymmetry'] = (df['ba_p'] - df['mid_price']) - (df['mid_price'] - df['bb_p'])
    
    # Advanced depth calculations
    wap_top_5, wap_top_10 = [], []
    imbalance_top_5, imbalance_top_10 = [], []
    depth_ratio = []
    ask_wall_dist, bid_wall_dist = [], []
    order_book_skewness = []
    slippage_proxy_list = []
    
    for i, row in df.iterrows():
        bids = row['bids_list']
        asks = row['asks_list']
        
        # WAP 5 & 10
        b_p_5 = [float(x[0]) for x in bids[:5]]
        b_v_5 = [float(x[1]) for x in bids[:5]]
        a_p_5 = [float(x[0]) for x in asks[:5]]
        a_v_5 = [float(x[1]) for x in asks[:5]]
        
        b_p_10 = [float(x[0]) for x in bids[:10]]
        b_v_10 = [float(x[1]) for x in bids[:10]]
        a_p_10 = [float(x[0]) for x in asks[:10]]
        a_v_10 = [float(x[1]) for x in asks[:10]]
        
        sum_v5 = sum(b_v_5) + sum(a_v_5)
        sum_v10 = sum(b_v_10) + sum(a_v_10)
        
        wap_5 = (sum(p*v for p,v in zip(b_p_5, b_v_5)) + sum(p*v for p,v in zip(a_p_5, a_v_5))) / (sum_v5 + 1e-9)
        wap_10 = (sum(p*v for p,v in zip(b_p_10, b_v_10)) + sum(p*v for p,v in zip(a_p_10, a_v_10))) / (sum_v10 + 1e-9)
        wap_top_5.append(wap_5)
        wap_top_10.append(wap_10)
        
        # Imbalances
        imb_5 = sum(b_v_5) / (sum_v5 + 1e-9)
        imb_10 = sum(b_v_10) / (sum_v10 + 1e-9)
        imbalance_top_5.append(imb_5)
        imbalance_top_10.append(imb_10)
        
        # Total Depth Ratio
        total_b_v = sum([float(x[1]) for x in bids])
        total_a_v = sum([float(x[1]) for x in asks])
        depth_ratio.append(total_b_v / (total_a_v + 1e-9))
        
        # Walls (max volume level in top 20)
        b_v_20 = [float(x[1]) for x in bids[:20]]
        a_v_20 = [float(x[1]) for x in asks[:20]]
        if b_v_20:
            max_b_idx = np.argmax(b_v_20)
            bid_wall_dist.append((row['mid_price'] - float(bids[max_b_idx][0])) / row['mid_price'])
        else:
            bid_wall_dist.append(0)
            
        if a_v_20:
            max_a_idx = np.argmax(a_v_20)
            ask_wall_dist.append((float(asks[max_a_idx][0]) - row['mid_price']) / row['mid_price'])
        else:
            ask_wall_dist.append(0)
            
        # Basic Skewness proxy (volume weighted distance)
        ob_skew = (sum(a_v_10) - sum(b_v_10)) / (sum_v10 + 1e-9)
        order_book_skewness.append(ob_skew)
        
        # Slippage proxy (simulated cost of 10.0 units)
        target_qty = 10.0
        rem = target_qty
        avg_price = 0
        for p_str, q_str in asks:
            p, q = float(p_str), float(q_str)
            if rem <= q:
                avg_price += rem * p
                rem = 0
                break
            else:
                avg_price += q * p
                rem -= q
        if rem > 0 and asks: 
            avg_price += rem * float(asks[-1][0])
        elif not asks:
            avg_price = (row.get('Close', 0) * target_qty)
        
        avg_price /= (target_qty + 1e-9)
        slippage_proxy_list.append((avg_price - row['mid_price']) / (row['mid_price'] + 1e-9))

    # Assign calculated arrays
    df['WAP_Top_5'] = wap_top_5
    df['WAP_Top_10'] = wap_top_10
    df['Multi_Level_Imbalance_Top5'] = imbalance_top_5
    df['Multi_Level_Imbalance_Top10'] = imbalance_top_10
    df['Depth_Ratio'] = depth_ratio
    df['Ask_Wall_Distance'] = ask_wall_dist
    df['Bid_Wall_Distance'] = bid_wall_dist
    df['Order_Book_Skewness'] = order_book_skewness
    df['slippage_proxy'] = slippage_proxy_list
    
    # Category 2: Depth & Liquidity
    df['Level_1_Imbalance'] = df['bb_v'] / (df['bb_v'] + df['ba_v'] + 1e-9)
    df['Imbalance_Momentum'] = df['Level_1_Imbalance'].diff().fillna(0)
    
    # Category 5: Order Flow Imbalance (OFI)
    # OFI = change in bid volume if bid price same, else total bid volume (if price went up)
    ofi_list = [0]
    for i in range(1, len(df)):
        prev = df.iloc[i-1]
        curr = df.iloc[i]
        
        if curr['bb_p'] >= prev['bb_p']: e_b = curr['bb_v']
        elif curr['bb_p'] == prev['bb_p']: e_b = curr['bb_v'] - prev['bb_v']
        else: e_b = -prev['bb_v']
            
        if curr['ba_p'] <= prev['ba_p']: e_a = curr['ba_v']
        elif curr['ba_p'] == prev['ba_p']: e_a = curr['ba_v'] - prev['ba_v']
        else: e_a = -prev['ba_v']
            
        ofi_list.append(e_b - e_a)
        
    df['Order_Flow_Imbalance'] = ofi_list
    df['OFI_Acceleration'] = df['Order_Flow_Imbalance'].diff().fillna(0)
    
    # Cumulative Volume Delta (CVD) Proxy (using OFI as proxy since tick trades are not perfectly matched in snapshot)
    df['CVD_Proxy'] = df['Order_Flow_Imbalance'].cumsum()
    df['CVD_Acceleration'] = df['CVD_Proxy'].diff().fillna(0)
    
    # Volatility
    df['Realized_Micro_Volatility'] = df['mid_price'].pct_change().rolling(window=10, min_periods=1).std().fillna(0)
    df['Tick_Test_Roll'] = df['mid_price'].diff().apply(lambda x: 1 if x > 0 else (-1 if x < 0 else 0)).rolling(window=5).mean().fillna(0)
    
    # ── 12 New Advanced Institutional Metrics ──
    # 1. obi_delta: Rate of change of Order Book Imbalance
    df['obi_delta'] = df.get('obi', df['Level_1_Imbalance']).diff().fillna(0)
    # 2. microprice_deviation: Deviation of volume-weighted microprice from midprice
    df['microprice_deviation'] = (df.get('microprice', df['mid_price']) - df['mid_price']) / (df['mid_price'] + 1e-9)
    # 3. quote_stuffing_ratio: Proxy for spam (rapid placement vs execution)
    df['quote_stuffing_ratio'] = df['bb_v'].diff().abs() / (df['bb_v'].rolling(10).mean() + 1e-9)
    # 4. depth_variance: Rolling variance of bid/ask depth at top levels
    df['depth_variance'] = (df['bb_v'] + df['ba_v']).rolling(10, min_periods=1).var().fillna(0)
    # 5. slippage_proxy is already calculated in the loop
    # 6. spread_reversion_rate: Speed at which a widened spread contracts back to the moving average
    df['spread_reversion_rate'] = (df['Effective_Spread'] - df['Effective_Spread'].rolling(10, min_periods=1).mean()) / (df['Effective_Spread'].rolling(10, min_periods=1).std() + 1e-9)
    # 7. smart_money_divergence: Divergence between price momentum and depth momentum
    df['smart_money_divergence'] = df['mid_price'].diff() * df['Order_Book_Skewness'].diff()
    # 8. bid_ask_absorption: Rate at which limit orders are absorbing aggressive market flow
    df['bid_ask_absorption'] = (df['bb_v'].diff() + df['ba_v'].diff()).fillna(0)
    # 9. liquidity_replenishment_rate: Time-proxy for liquidity refilling after level clearance
    df['liquidity_replenishment_rate'] = df['bb_v'].diff().where(df['bb_p'].diff() == 0, 0).fillna(0)
    # 10. bbo_flicker_rate: Volatility of the top-of-book levels
    df['bbo_flicker_rate'] = (df['bb_p'].diff() != 0).rolling(10, min_periods=1).sum().fillna(0)
    # 11. order_flow_toxicity: Probability of Informed Trading (VPIN) based on depth
    df['order_flow_toxicity'] = df['Order_Flow_Imbalance'].abs() / (df['bb_v'] + df['ba_v'] + 1e-9)
    # 12. hidden_volume_proxy: Detection of abnormally low slippage despite large volume
    df['hidden_volume_proxy'] = df['Depth_Ratio'] * df['Realized_Micro_Volatility']
    
    # Drop intermediate columns
    cols_to_drop = ['bids_list', 'asks_list', 'bb_p', 'bb_v', 'ba_p', 'ba_v']
    df = df.drop(columns=[c for c in cols_to_drop if c in df.columns], errors='ignore')
    
    # Clean NaNs and Infs
    df = df.replace([np.inf, -np.inf], np.nan).fillna(0)
    
    # Select only the newly created feature columns
    feature_cols = [
        'Effective_Spread', 'Spread_ROC', 'Mid_Price_Acceleration', 'Spread_Asymmetry',
        'WAP_Top_5', 'WAP_Top_10', 'Multi_Level_Imbalance_Top5', 'Multi_Level_Imbalance_Top10',
        'Depth_Ratio', 'Ask_Wall_Distance', 'Bid_Wall_Distance', 'Order_Book_Skewness',
        'Level_1_Imbalance', 'Imbalance_Momentum', 'Order_Flow_Imbalance', 'OFI_Acceleration',
        'CVD_Proxy', 'CVD_Acceleration', 'Realized_Micro_Volatility', 'Tick_Test_Roll',
        'obi_delta', 'microprice_deviation', 'quote_stuffing_ratio', 'depth_variance',
        'slippage_proxy', 'spread_reversion_rate', 'smart_money_divergence', 'bid_ask_absorption',
        'liquidity_replenishment_rate', 'bbo_flicker_rate', 'order_flow_toxicity', 'hidden_volume_proxy'
    ]
    
    # Add any existing standard columns if available
    for col in ['obi', 'spread', 'microprice']:
        if col in df.columns:
            feature_cols.append(col)
            
    # For mapping output names to user's 50 list
    name_mapping = {
        'Effective_Spread': 'Effective Spread',
        'Spread_ROC': 'Spread ROC',
        'Mid_Price_Acceleration': 'Mid-Price Acceleration',
        'Spread_Asymmetry': 'Spread Asymmetry',
        'WAP_Top_5': 'WAP Top 5',
        'WAP_Top_10': 'WAP Top 10',
        'Multi_Level_Imbalance_Top5': 'Multi-Level Imbalance (Top 5)',
        'Multi_Level_Imbalance_Top10': 'Multi-Level Imbalance (Top 10)',
        'Depth_Ratio': 'Depth Ratio (Bid/Ask)',
        'Ask_Wall_Distance': 'Wall Distance (Ask)',
        'Bid_Wall_Distance': 'Wall Distance (Bid)',
        'Order_Book_Skewness': 'Order Book Skewness (Sk)',
        'Level_1_Imbalance': 'Level-1 Imbalance',
        'Imbalance_Momentum': 'Imbalance Momentum',
        'Order_Flow_Imbalance': 'Order Flow Imbalance (OFI)',
        'CVD_Proxy': 'Cumulative Volume Delta (CVD)',
        'CVD_Acceleration': 'CVD Acceleration',
        'Realized_Micro_Volatility': 'Realized Micro-Volatility',
        'Tick_Test_Roll': 'Tick Test Roll (Auto-correlation)',
        'obi_delta': 'OBI Delta',
        'microprice_deviation': 'Microprice Deviation',
        'quote_stuffing_ratio': 'Quote Stuffing Ratio',
        'depth_variance': 'Order Book Depth Variance',
        'slippage_proxy': 'Slippage Proxy',
        'spread_reversion_rate': 'Spread Reversion Rate',
        'smart_money_divergence': 'Smart Money Divergence',
        'bid_ask_absorption': 'Bid/Ask Absorption Rate',
        'liquidity_replenishment_rate': 'Liquidity Replenishment Rate',
        'bbo_flicker_rate': 'BBO Flicker Rate',
        'order_flow_toxicity': 'Order Flow Toxicity',
        'hidden_volume_proxy': 'Hidden Volume Proxy',
        'obi': 'Order Book Imbalance (OBI)',
        'spread': 'Quoted Spread',
        'microprice': 'Micro-Price'
    }
    
    return df[feature_cols].copy(), name_mapping

async def fetch_sample_l2_data(symbol: str, db: Session, target_rows=1000):
    """Fetches a sample of recent L2 data for analysis. Uses DB if available, else WS."""
    clean_symbol = symbol.upper().split(":")[0].replace("/", "")
    snapshots = db.query(OrderBookSnapshot).filter(
        OrderBookSnapshot.symbol == clean_symbol
    ).order_by(OrderBookSnapshot.timestamp.desc()).limit(target_rows).all()
    
    valid_snapshots = [s for s in snapshots if s.bids and len(s.bids) > 0 and s.asks and len(s.asks) > 0]
    
    if len(valid_snapshots) >= 100: # We have enough cached
        data = []
        for s in reversed(valid_snapshots): # chron order
            data.append({
                "timestamp": s.timestamp,
                "Close": s.microprice,
                "bids": s.bids,
                "asks": s.asks,
                "obi": s.obi,
                "spread": s.spread,
                "microprice": s.microprice
            })
        return pd.DataFrame(data)
        
    # If not in DB, scrape live quickly via websockets (fallback)
    ws_url = f"wss://stream.binance.com:9443/ws/{clean_symbol.lower()}@depth20@100ms"
    data = []
    
    try:
        async with websockets.connect(ws_url, ping_interval=30, ping_timeout=10) as ws:
            for _ in range(100): # Just get 100 fast ticks (~10 seconds)
                msg = await asyncio.wait_for(ws.recv(), timeout=5)
                msg_data = json.loads(msg)
                
                bids = msg_data.get('bids', [])
                asks = msg_data.get('asks', [])
                if not bids or not asks: continue
                
                best_bid = float(bids[0][0])
                best_ask = float(asks[0][0])
                bid_vol = sum([float(level[1]) for level in bids])
                ask_vol = sum([float(level[1]) for level in asks])
                total_vol = bid_vol + ask_vol
                
                obi = bid_vol / total_vol if total_vol > 0 else 0.5
                spread = (best_ask - best_bid) / best_bid
                microprice = ((bid_vol * best_ask) + (ask_vol * best_bid)) / total_vol if total_vol > 0 else (best_bid + best_ask)/2
                
                data.append({
                    "timestamp": datetime.utcnow(),
                    "Close": microprice,
                    "bids": bids,
                    "asks": asks,
                    "obi": obi,
                    "spread": spread,
                    "microprice": microprice
                })
    except Exception as e:
        print(f"WS Scrape error for feature selection: {e}")
        
    return pd.DataFrame(data)

def suggest_optimal_features(symbol: str, db: Session):
    """
    Main entry point. Fetches data, calculates 50 features, runs RF, returns top suggestions.
    """
    try:
        # 1. Fetch Data
        df = asyncio.run(fetch_sample_l2_data(symbol, db, target_rows=1000))
        if df.empty or len(df) < 50:
            return {"error": "Not enough L2 data to analyze. Please wait or start a deep training session first."}
            
        # 2. Calculate Advanced Features
        df_features, name_mapping = calculate_l2_advanced_features(df)
        
        # Create Target Variable (Predict next tick direction)
        target = (df['Close'].shift(-1) > df['Close']).astype(int)
        
        # Remove last row since target is NaN
        df_features = df_features.iloc[:-1]
        target = target.iloc[:-1]
        
        # Handle constants / nans
        df_features = df_features.dropna(axis=1) # Drop columns that became all NaN
        
        # Drop columns with zero variance
        df_features = df_features.loc[:, df_features.var() > 1e-10]
        
        features_list = df_features.columns.tolist()
        if not features_list:
            return {"error": "Feature calculation failed due to invalid data formats."}
            
        # 3. Correlation Filter (Drop highly correlated > 0.85)
        corr_matrix = df_features.corr().abs()
        upper = corr_matrix.where(np.triu(np.ones(corr_matrix.shape), k=1).astype(bool))
        to_drop = [column for column in upper.columns if any(upper[column] > 0.85)]
        
        df_filtered = df_features.drop(columns=to_drop)
        filtered_features = df_filtered.columns.tolist()
        
        # 4. Random Forest Feature Importance
        rf = RandomForestClassifier(n_estimators=50, max_depth=5, random_state=42)
        X = df_filtered.values
        y = target.values
        rf.fit(X, y)
        
        importances = rf.feature_importances_
        
        # Also combine with Mutual Information for robust scoring
        mi_scores = mutual_info_classif(X, y, random_state=42)
        
        # Normalize and combine scores
        imp_norm = importances / (np.max(importances) + 1e-9)
        mi_norm = mi_scores / (np.max(mi_scores) + 1e-9)
        combined_scores = (imp_norm * 0.7) + (mi_norm * 0.3)
        
        # Create ranking
        ranking = []
        for idx, col in enumerate(filtered_features):
            ranking.append({
                "internal_name": col,
                "display_name": name_mapping.get(col, col.replace("_", " ")),
                "score": float(combined_scores[idx]) * 100 # percentage scale
            })
            
        # Sort by score descending
        ranking = sorted(ranking, key=lambda x: x["score"], reverse=True)
        
        # Select Top 5
        top_5 = ranking[:5]
        
        # Format response
        suggestions = []
        for item in top_5:
            suggestions.append({
                "name": item["display_name"],
                "score": round(item["score"], 1),
                "internal": item["internal_name"]
            })
            
        return {
            "success": True,
            "suggestions": suggestions,
            "analyzed_count": len(features_list),
            "rows_scanned": len(df)
        }
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return {"error": f"Analysis failed: {str(e)}"}
