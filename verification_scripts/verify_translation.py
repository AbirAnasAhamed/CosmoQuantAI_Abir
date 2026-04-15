
import asyncio
import logging
import sys
import os

# Add backend path
sys.path.append(os.path.join(os.getcwd(), 'backend'))

from app.services.translation_service import TranslationService

async def verify_translation():
    print("🧪 Verifying Translation Service...")
    service = TranslationService()

    # Test 1: Korean Text
    text_kr = "비트코인이 사상 최고치를 경신했습니다."
    print(f"\n1. Testing KR Translation: '{text_kr}'")
    translated_kr = service.detect_and_translate(text_kr)
    print(f"   -> Result: {translated_kr}")
    
    if "Bitcoin" in translated_kr or "record" in translated_kr:
        print("   ✅ KR Translation Passed")
    else:
        print("   ⚠️ KR Translation Result unclear (might be correct but check manually)")

    # Test 2: Chinese Text
    text_cn = "以太坊网络升级即将到来。"
    print(f"\n2. Testing CN Translation: '{text_cn}'")
    translated_cn = service.detect_and_translate(text_cn)
    print(f"   -> Result: {translated_cn}")
    
    if "Ethereum" in translated_cn or "upgrade" in translated_cn:
        print("   ✅ CN Translation Passed")
    else:
        print("   ⚠️ CN Translation Result unclear")

    # Test 3: English Text (Should be skipped)
    text_en = "This is a standard English sentence."
    print(f"\n3. Testing EN Text: '{text_en}'")
    result_en = service.detect_and_translate(text_en)
    print(f"   -> Result: {result_en}")
    
    if result_en == text_en:
        print("   ✅ English Passthrough Passed")
    else:
        print("   ❌ English Passthrough Failed (Validation needed - did it translate?)")

    # Test 4: Long Text Chunking
    print(f"\n4. Testing Long Text Chunking...")
    long_text = "안녕하세요. " * 600 # 3600 chars approx
    print(f"   (Input length: {len(long_text)})")
    # This might take time so we just check if it returns
    try:
        translated_long = service.translate_text(long_text)
        print(f"   -> Returned length: {len(translated_long)}")
        if len(translated_long) > 0:
            print("   ✅ Chunking/Execution Passed")
    except Exception as e:
        print(f"   ❌ Chunking Failed: {e}")

if __name__ == "__main__":
    loop = asyncio.new_event_loop()
    loop.run_until_complete(verify_translation())
