import asyncio
from app.services.event_driven.engine import EventDrivenEngine
from app.services.event_driven.events import OrderEvent, EventType

async def verify_fees():
    with open("verify_output.txt", "w", encoding="utf-8") as f:
        f.write("--- Starting Fee Verification ---\n")
        engine = EventDrivenEngine("BTC/USDT")
        
        # 1. Set specific fees
        maker_fee = 0.001 # 0.1%
        taker_fee = 0.005 # 0.5%
        
        engine.maker_fee = maker_fee
        engine.taker_fee = taker_fee
        f.write(f"Configured Fees -> Maker: {maker_fee*100}%, Taker: {taker_fee*100}%\n")

        # 2. Test Market Order (Taker)
        quantity = 1.0
        
        f.write("\n[Test 1] Executing MARKET Order (Expect Taker Fee)\n")
        mkt_order = OrderEvent("BTC/USDT", "MKT", quantity, "BUY")
        
        # Directly call execute_order to bypass queue/loop for unit testing
        await engine._execute_order(mkt_order)
        
        # Check the last event in queue (should be FillEvent)
        try:
            fill_event = await asyncio.wait_for(engine.events.get(), timeout=1.0)
            
            if fill_event.type == EventType.FILL:
                expected_commission = fill_event.fill_cost * quantity * taker_fee
                f.write(f"Fill Cost: {fill_event.fill_cost}\n")
                f.write(f"Commission Charged: {fill_event.commission}\n")
                f.write(f"Expected Taker Commission: {expected_commission}\n")
                
                # Allow small float diff due to slippage noise in fill_cost
                if abs(fill_event.commission - expected_commission) < 0.0001:
                     f.write("✅ MARKET Order Fee Verified (Taker)\n")
                else:
                     f.write(f"❌ MARKET Order Fee Mismatch. Diff: {abs(fill_event.commission - expected_commission)}\n")
        except asyncio.TimeoutError:
            f.write("❌ Timeout waiting for FillEvent (Market Order)\n")
        
        # 3. Test Limit Order (Maker)
        f.write("\n[Test 2] Executing LIMIT Order (Expect Maker Fee)\n")
        lmt_order = OrderEvent("BTC/USDT", "LMT", quantity, "BUY")
        
        await engine._execute_order(lmt_order)
        
        try:
            fill_event = await asyncio.wait_for(engine.events.get(), timeout=1.0)
            
            if fill_event.type == EventType.FILL:
                expected_commission = fill_event.fill_cost * quantity * maker_fee
                f.write(f"Fill Cost: {fill_event.fill_cost}\n")
                f.write(f"Commission Charged: {fill_event.commission}\n")
                f.write(f"Expected Maker Commission: {expected_commission}\n")
                
                if abs(fill_event.commission - expected_commission) < 0.0001:
                     f.write("✅ LIMIT Order Fee Verified (Maker)\n")
                else:
                     f.write(f"❌ LIMIT Order Fee Mismatch. Diff: {abs(fill_event.commission - expected_commission)}\n")
        except asyncio.TimeoutError:
             f.write("❌ Timeout waiting for FillEvent (Limit Order)\n")

        f.write("\n--- Verification Complete ---\n")

if __name__ == "__main__":
    asyncio.run(verify_fees())
