import sys
import os
import asyncio
from dotenv import load_dotenv

# Load env manually
load_dotenv('../.env')

from app.services.ai_service import ai_service

async def main():
    print("--- 1. Testing Groq Native Call ---")
    groq_key = os.getenv("GROQ_API_KEY")
    if not groq_key:
        print("FAIL: GROQ_API_KEY not found in .env")
        return

    try:
        res = await ai_service._call_openai_compatible(
            groq_key,
            "https://api.groq.com/openai/v1",
            "llama-3.3-70b-versatile",
            "You are an expert.",
            "Reply with 'Groq is working' if you hear me. Do not append any other text."
        )
        print("\nGroq direct response:", res)
    except Exception as e:
        print("Error direct:", e)

    print("\n--- 2. Testing App Routing functionality ---")
    try:
        res2 = await ai_service.generate_market_sentiment_summary("Global stocks crash, Bitcoin slumps", "BTC", provider="groq")
        print("\nAI Route Response (Groq):", res2)
    except Exception as e:
        print("Error route:", e)

if __name__ == "__main__":
    asyncio.run(main())
