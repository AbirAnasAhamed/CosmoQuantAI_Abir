import sys
import os
import aiohttp
import asyncio
from dotenv import load_dotenv

# Load env manually
load_dotenv(".env")

API_KEY = os.getenv("ETHERSCAN_API_KEY")

async def test_etherscan_raw():
    print(f"🔑 Testing Key: {API_KEY}")
    url = f"https://api.etherscan.io/api?module=proxy&action=eth_getBlockByNumber&tag=latest&boolean=true&apikey={API_KEY}"
    
    print(f"🌐 Fetching: {url.replace(API_KEY, 'HIDDEN_KEY')}")
    
    async with aiohttp.ClientSession() as session:
        async with session.get(url) as response:
            print(f"📡 Status: {response.status}")
            try:
                data = await response.json()
                if "result" in data and data["result"]:
                    block = data["result"]
                    txs = block.get("transactions", [])
                    print(f"✅ Block Number: {int(block['number'], 16)}")
                    print(f"✅ Transactions Found: {len(txs)}")
                    if len(txs) > 0:
                        print(f"   Sample Tx Hash: {txs[0].get('hash')}")
                else:
                    print(f"❌ Error/Empty Result: {data}")
            except Exception as e:
                print(f"❌ Parse Error: {e}")
                text = await response.text()
                print(f"Raw Body: {text[:500]}")

if __name__ == "__main__":
    if sys.platform == 'win32':
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(test_etherscan_raw())
