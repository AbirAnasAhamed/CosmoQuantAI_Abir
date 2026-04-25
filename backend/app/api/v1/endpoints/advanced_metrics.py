from fastapi import APIRouter, Depends, HTTPException, Query
from typing import List, Dict, Any, Optional
from app.services.advanced_metrics_service import advanced_metrics_service
import logging

router = APIRouter()
logger = logging.getLogger(__name__)

@router.get("/tpo", response_model=Dict[str, Any])
async def get_tpo_profile(
    symbol: str,
    exchange: str = "binance",
    interval: str = "5m",
    limit: int = 200
):
    """Get TPO Market Profile for a given symbol and interval using real CCXT Klines."""
    try:
        tpo_data = await advanced_metrics_service.calculate_tpo_profile(symbol, exchange, interval, limit)
        return {"status": "success", "data": tpo_data}
    except Exception as e:
        logger.error(f"Failed to calculate TPO for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/delta-profile", response_model=Dict[str, Any])
async def get_delta_profile(
    symbol: str,
    exchange: str = "binance",
    limit: int = 1000
):
    """Get Delta Profile (Bid-Ask volume per price level) using real CCXT trades."""
    try:
        profile_data = await advanced_metrics_service.calculate_delta_profile(symbol, exchange, limit)
        return {"status": "success", "data": profile_data}
    except Exception as e:
        logger.error(f"Failed to calculate Delta Profile for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/trade-bubbles", response_model=Dict[str, Any])
async def get_trade_bubbles(
    symbol: str,
    exchange: str = "binance",
    limit: int = 1000
):
    """Get Block Trades represented as Bubbles using real CCXT trades."""
    try:
        bubble_data = await advanced_metrics_service.calculate_trade_bubbles(symbol, exchange, limit)
        return {"status": "success", "data": bubble_data}
    except Exception as e:
        logger.error(f"Failed to calculate Trade Bubbles for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/oib-oscillator", response_model=Dict[str, Any])
async def get_oib_oscillator(
    symbol: str,
    exchange: str = "binance"
):
    """Get Order Book Imbalance (OIB) ratio using real CCXT Orderbook."""
    try:
        oib_data = await advanced_metrics_service.calculate_oib_oscillator(symbol, exchange)
        return {"status": "success", "data": oib_data}
    except Exception as e:
        logger.error(f"Failed to calculate OIB for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
@router.get("/spoofing", response_model=Dict[str, Any])
async def get_spoofing(
    symbol: str,
    exchange: str = "binance"
):
    try:
        spoofing_data = await advanced_metrics_service.detect_spoofing(symbol, exchange)
        return {"status": "success", "data": spoofing_data}
    except Exception as e:
        logger.error(f"Failed to detect spoofing for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/anchored-vwap", response_model=Dict[str, Any])
async def get_anchored_vwap(
    symbol: str,
    exchange: str = "binance",
    limit: int = 200
):
    try:
        vwap_data = await advanced_metrics_service.calculate_anchored_vwap(symbol, exchange, limit=limit)
        return {"status": "success", "data": vwap_data}
    except Exception as e:
        logger.error(f"Failed to calculate VWAP for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/footprint-imbalances", response_model=Dict[str, Any])
async def get_footprint_imbalances(
    symbol: str,
    exchange: str = "binance",
    limit: int = 1000
):
    try:
        imbalances = await advanced_metrics_service.detect_footprint_imbalances(symbol, exchange, limit)
        return {"status": "success", "data": imbalances}
    except Exception as e:
        logger.error(f"Failed to calculate footprint imbalances for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/delta-divergence", response_model=Dict[str, Any])
async def get_delta_divergence(
    symbol: str,
    exchange: str = "binance"
):
    try:
        divergence = await advanced_metrics_service.detect_delta_divergence(symbol, exchange)
        return {"status": "success", "data": divergence}
    except Exception as e:
        logger.error(f"Failed to detect delta divergence for {symbol}: {e}")
        raise HTTPException(status_code=500, detail=str(e))
