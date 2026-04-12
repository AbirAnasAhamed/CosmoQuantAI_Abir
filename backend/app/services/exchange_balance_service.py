"""
Exchange Balance Service
========================
User-এর saved API keys ব্যবহার করে exchange থেকে real balance fetch করে।
সব exchange-এর total USDT value calculate করে User.balance update করে।
"""

import ccxt
import ccxt.async_support as ccxt_async
import asyncio
from sqlalchemy.orm import Session
from typing import List, Dict, Optional
from app import models
from app.core.security import decrypt_key


# Supported exchanges এবং তাদের CCXT class name
EXCHANGE_CLASS_MAP = {
    "binance": "binance",
    "binanceusdm": "binanceusdm",
    "okx": "okx",
    "kucoin": "kucoin",
    "bybit": "bybit",
    "gate": "gate",
    "huobi": "huobi",
    "mexc": "mexc",
    "bitget": "bitget",
    "kraken": "kraken",
    "coinbase": "coinbase",
    "bitmex": "bitmex",
}

# quote currencies যেগুলোকে USDT মানে ধরা হবে
STABLE_COINS = {"USDT", "USDC", "BUSD", "DAI", "TUSD", "FDUSD"}


async def _fetch_single_exchange_balance(
    exchange_id: str,
    api_key: str,
    secret_key: str,
    passphrase: Optional[str] = None,
) -> Dict[str, float]:
    """
    একটি exchange থেকে balance fetch করে।
    Returns: { 'USDT': 1000.0, 'BTC': 0.05, ... }
    """
    class_name = EXCHANGE_CLASS_MAP.get(exchange_id.lower())
    if not class_name:
        return {}

    config = {
        "apiKey": api_key,
        "secret": secret_key,
        "enableRateLimit": True,
        "options": {
            # ✅ FIX: Exchange server time এর সাথে auto-sync করে
            # MEXC, Binance সহ সব exchange এ timestamp mismatch ঠেকায়
            "adjustForTimeDifference": True,
            # recvWindow বাড়িয়ে দিলে slow network-এও কাজ করে
            "recvWindow": 60000,
        }
    }

    if passphrase:
        config["password"] = passphrase

    try:
        ExchangeClass = getattr(ccxt_async, class_name)
        exchange = ExchangeClass(config)

        try:
            # Load time difference from server before fetching balance
            # This syncs the clock explicitly for exchanges that need it
            try:
                await exchange.load_time_difference()
            except Exception:
                pass  # Some exchanges don't support this — that's ok

            balance = await exchange.fetch_balance()
            # Only return non-zero totals
            result = {}
            totals = balance.get("total", {})
            for currency, amount in totals.items():
                if isinstance(amount, (int, float)) and amount > 0:
                    result[currency] = float(amount)
            return result
        finally:
            await exchange.close()

    except ccxt.AuthenticationError as e:
        error_str = str(e)
        # Log the FULL Binance error message so we can diagnose
        print(f"[BalanceService] Auth error for {exchange_id}: {error_str}")

        # Binance error -2015: Invalid API-key, IP, or permissions
        # This means the key is valid but IP is not whitelisted
        if "-2015" in error_str or "IP" in error_str:
            return {"__error__": "ip_restricted"}
        # Binance error -2014: API-key format invalid
        if "-2014" in error_str:
            return {"__error__": "invalid_key_format"}
        return {"__error__": "authentication_failed"}

    except ccxt.PermissionDenied as e:
        print(f"[BalanceService] Permission denied for {exchange_id}: {e}")
        return {"__error__": "permission_denied"}
    except ccxt.NetworkError as e:
        error_str = str(e)
        # Timestamp errors are clock sync issues, not real network errors
        if "700003" in error_str or "recvWindow" in error_str or "Timestamp" in error_str:
            print(f"[BalanceService] Clock sync error for {exchange_id} — timestamp mismatch")
            return {"__error__": "clock_sync_error"}
        print(f"[BalanceService] Network error for {exchange_id}: {e}")
        return {"__error__": "network_error"}
    except Exception as e:
        print(f"[BalanceService] Unexpected error for {exchange_id}: {type(e).__name__}: {e}")
        return {"__error__": str(e)}


async def fetch_all_exchange_balances(
    db: Session, user_id: int
) -> List[Dict]:
    """
    User-এর সব saved API keys-এর exchange balance fetch করে।
    Returns list of dicts with exchange, balances, total_usdt, error.
    """
    api_keys = db.query(models.ApiKey).filter(
        models.ApiKey.user_id == user_id,
        models.ApiKey.is_enabled == True
    ).all()

    results = []

    for key in api_keys:
        # Decrypt stored encrypted keys
        try:
            decrypted_api_key = decrypt_key(key.api_key).strip()
            decrypted_secret = decrypt_key(key.secret_key).strip()
            decrypted_passphrase = decrypt_key(key.passphrase).strip() if key.passphrase else None

            # Debug: log key lengths (not the actual keys) to verify decryption
            print(f"[BalanceService] Decrypted {key.exchange} key: len={len(decrypted_api_key)}, secret_len={len(decrypted_secret)}")

        except Exception as e:
            print(f"[BalanceService] Decryption FAILED for {key.exchange} (id={key.id}): {e}")
            results.append({
                "id": key.id,
                "name": key.name,
                "exchange": key.exchange,
                "balances": {},
                "total_usdt": 0.0,
                "error": f"decryption_failed"
            })
            continue

        raw_balances = await _fetch_single_exchange_balance(
            exchange_id=key.exchange,
            api_key=decrypted_api_key,
            secret_key=decrypted_secret,
            passphrase=decrypted_passphrase,
        )

        # Check for errors
        error_msg = raw_balances.pop("__error__", None)

        # Calculate total USDT value (stablecoins counted 1:1)
        # Non-stablecoins would need price lookup — for now we show raw USDT only
        total_usdt = 0.0
        for currency, amount in raw_balances.items():
            if currency in STABLE_COINS:
                total_usdt += amount

        results.append({
            "id": key.id,
            "name": key.name,
            "exchange": key.exchange,
            "balances": raw_balances,
            "total_usdt": round(total_usdt, 2),
            "error": error_msg
        })

    return results


async def sync_user_balance(db: Session, user_id: int) -> float:
    """
    সব exchange-এর total balance sum করে user.balance DB-তে update করে।
    Returns: new total balance
    """
    all_balances = await fetch_all_exchange_balances(db, user_id)

    # Sum up all USDT across exchanges (excluding errored ones)
    total_usdt = sum(
        b["total_usdt"] for b in all_balances
        if not b.get("error")
    )

    # Only update if we got at least some data
    if total_usdt > 0:
        user = db.query(models.User).filter(models.User.id == user_id).first()
        if user:
            user.balance = round(total_usdt, 2)
            db.commit()
            db.refresh(user)

    return round(total_usdt, 2)
