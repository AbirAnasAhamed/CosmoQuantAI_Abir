import json
import logging

# Mock the logger
logger = logging.getLogger("test_logger")

def _clean_and_parse_json(text: str, default=None):
    if default is None: default = []
    try:
        import re
        # Extract anything between the first { and last } or first [ and last ]
        match = re.search(r'(\{.*\}|\[.*\])', text, re.DOTALL)
        if match:
            clean_text = match.group(1)
        else:
            clean_text = text.replace("```json", "").replace("```", "").strip()
        
        # strict=False allows literal control characters (like newlines) in strings
        return json.loads(clean_text, strict=False)
    except json.JSONDecodeError as e:
        logger.warning(f"AI JSON Parse issue: {text[:60]}... Details: {e}")
        return default

# Test 1: JSON with literal newlines inside a string
bad_json = """
{
    "bengali_summary": "• This is a list item.\n• This is another item with a literal 
newline here.",
    "trading_verdict": "Bullish",
    "hashtags": "#BTC"
}
"""

print("Testing Test 1 (Literal newline)...")
result = _clean_and_parse_json(bad_json)
print(f"Result: {result}")
assert "bengali_summary" in result
print("Test 1 Passed!")

# Test 2: JSON with a tab character inside a string
tab_json = '{"text": "Some text with a	tab"}'
print("\nTesting Test 2 (Literal tab)...")
result = _clean_and_parse_json(tab_json)
print(f"Result: {result}")
assert result["text"] == "Some text with a\ttab"
print("Test 2 Passed!")

# Test 3: Valid JSON
valid_json = '{"a": 1}'
print("\nTesting Test 3 (Valid JSON)...")
result = _clean_and_parse_json(valid_json)
print(f"Result: {result}")
assert result["a"] == 1
print("Test 3 Passed!")
