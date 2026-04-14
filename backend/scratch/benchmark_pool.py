"""
Exchange Pool Latency Benchmark
================================
Cold start vs Cached latency পরিমাপ করার জন্য।
শুধু exchange init + balance fetch টাইম মাপা হবে।
Real order place করা হবে না।
"""

import asyncio
import time
import sys
import os

sys.path.insert(0, '/app')
os.environ.setdefault('DATABASE_URL', 'postgresql://cosmouser:secure_password_here@cosmoquant_db:5432/cosmoquant_db')

from app.services.exchange_pool import get_or_create_exchange, _pool
from app.core.config import settings

# ---- কনফিগ ----
# এখানে আপনার টেস্ট ক্রেডেনশিয়াল দেওয়া হবে DB থেকে
EXCHANGE_NAME = "mexc"
IS_FUTURES = False
SYMBOL = "DOGE/USDC"

# DB থেকে decrypted key আনা
from app.db.session import SessionLocal
from app import models
from app.core.security import decrypt_key

def get_first_key():
    db = SessionLocal()
    try:
        key = db.query(models.ApiKey).filter(
            models.ApiKey.exchange == EXCHANGE_NAME,
            models.ApiKey.is_enabled == True
        ).first()
        if not key:
            print(f"❌ No active {EXCHANGE_NAME} API Key found in DB!")
            sys.exit(1)
        return (
            key.id,
            decrypt_key(key.api_key),
            decrypt_key(key.secret_key),
            decrypt_key(key.passphrase) if key.passphrase else None
        )
    finally:
        db.close()


async def benchmark():
    print("\n" + "="*55)
    print("   ⚡ Exchange Pool Latency Benchmark")
    print("="*55)
    
    key_id, api_key, secret, passphrase = get_first_key()
    print(f"📋 Exchange : {EXCHANGE_NAME.upper()}")
    print(f"📋 API Key  : {api_key[:6]}...{api_key[-4:]}")
    print(f"📋 Symbol   : {SYMBOL}")
    print("="*55)

    # ── ROUND 1: Cold Start (Cache খালি) ──
    print("\n🔵 ROUND 1 — Cold Start (Cache খালি)")
    t0 = time.perf_counter()
    exchange = await get_or_create_exchange(
        api_key_id=key_id,
        exchange_name=EXCHANGE_NAME,
        decrypted_api_key=api_key,
        decrypted_secret=secret,
        is_futures=IS_FUTURES,
        passphrase=passphrase,
    )
    t1 = time.perf_counter()
    cold_init_ms = (t1 - t0) * 1000

    # Balance fetch করা
    t2 = time.perf_counter()
    balance = await exchange.fetch_balance()
    t3 = time.perf_counter()
    cold_balance_ms = (t3 - t2) * 1000

    parts = SYMBOL.split('/')
    quote = parts[1] if len(parts) > 1 else "USDT"
    quote_free = balance.get(quote, {}).get('free', 0.0) or 0.0

    print(f"   Init + Market Load : {cold_init_ms:>8.1f} ms")
    print(f"   Balance Fetch      : {cold_balance_ms:>8.1f} ms")
    print(f"   Balance ({quote})     : {quote_free:.4f}")
    print(f"   ⏱  Total (Cold)    : {cold_init_ms + cold_balance_ms:>8.1f} ms")

    # ── ROUND 2: Warm (Cache থেকে) ──
    print("\n🟢 ROUND 2 — Warm (Cache Hit)")
    t4 = time.perf_counter()
    exchange2 = await get_or_create_exchange(
        api_key_id=key_id,
        exchange_name=EXCHANGE_NAME,
        decrypted_api_key=api_key,
        decrypted_secret=secret,
        is_futures=IS_FUTURES,
        passphrase=passphrase,
    )
    t5 = time.perf_counter()
    warm_init_ms = (t5 - t4) * 1000

    t6 = time.perf_counter()
    balance2 = await exchange2.fetch_balance()
    t7 = time.perf_counter()
    warm_balance_ms = (t7 - t6) * 1000

    print(f"   Pool Lookup        : {warm_init_ms:>8.2f} ms  ← (should be ~0ms)")
    print(f"   Balance Fetch      : {warm_balance_ms:>8.1f} ms")
    print(f"   ⏱  Total (Warm)    : {warm_init_ms + warm_balance_ms:>8.1f} ms")

    # ── ROUND 3: একটি Dummy Order শুধু তৈরি (dry run, create_order call timer) ──
    print("\n🟡 ROUND 3 — Order Execution Time (Warm cache)")
    print("   (Timing only — not actually sending an order)")
    t8 = time.perf_counter()
    exchange3 = await get_or_create_exchange(
        api_key_id=key_id,
        exchange_name=EXCHANGE_NAME,
        decrypted_api_key=api_key,
        decrypted_secret=secret,
        is_futures=IS_FUTURES,
        passphrase=passphrase,
    )
    pool_lookup_ms = (time.perf_counter() - t8) * 1000
    print(f"   Pool Lookup        : {pool_lookup_ms:.2f} ms")
    print(f"   (Actual order API call would add ~100-300ms depending on exchange latency)")

    # ── Summary ──
    speedup = (cold_init_ms + cold_balance_ms) / max((warm_init_ms + warm_balance_ms), 0.001)
    print("\n" + "="*55)
    print(f"   📊 Cold  Total: {cold_init_ms + cold_balance_ms:.1f} ms")
    print(f"   📊 Warm  Total: {warm_init_ms + warm_balance_ms:.1f} ms")
    print(f"   🚀 Speed Gain : {speedup:.1f}x faster after first call!")
    print("="*55 + "\n")


if __name__ == "__main__":
    asyncio.run(benchmark())
