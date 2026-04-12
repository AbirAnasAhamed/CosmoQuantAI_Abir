import os
import json
import requests
import re
import asyncio
try:
    from google import genai
except ImportError:
    genai = None
    print("Warning: google-genai library not found. AI functionalities may be limited.")
from dotenv import load_dotenv
from app.core.config import settings
import spacy
from spacy.pipeline import entityruler
import subprocess
import sys

load_dotenv()

# 1. Global Gemini Client Setup (Safe Init)
gemini_client = None
if settings.GEMINI_API_KEY:
    try:
        gemini_client = genai.Client(api_key=settings.GEMINI_API_KEY)
    except Exception as e:
        print(f"⚠️ Gemini Client Init Warning: {e}")

# 2. Global Spacy Model (Singleton)
_nlp_model = None

class AIService:
    """
    Unified AI Service capable of switching between Gemini, OpenAI, and DeepSeek.
    """

    def _get_provider(self, requested_provider=None):
        # যদি রিকোয়েস্টে প্রোভাইডার আসে সেটা নিবে, নাহলে এনভায়রনমেন্ট ভেরিয়েবল, নাহলে ডিফল্ট 'gemini'
        if requested_provider:
            return requested_provider.lower()
        return settings.LLM_PROVIDER.lower() if hasattr(settings, 'LLM_PROVIDER') else "gemini"

    # --- Core Generation Methods ---

    async def generate_market_sentiment_summary(self, headlines: str, asset: str, provider: str = None) -> str:
        system_prompt = f"""
        You are a crypto market analyst. 
        Analyze these headlines for {asset} and provide a concise 2-sentence summary of the current market sentiment (Bullish/Bearish/Neutral) and why.
        """
        user_content = f"Headlines: {headlines}"
        return await self._route_request(system_prompt, user_content, provider)

    async def generate_macro_overview(self, macro_data: str, provider: str = None, language: str = "en") -> str:
        lang_instruction = "Respond in English." if language == "en" else "Respond in Bengali (Bangla)."

        system_prompt = f"""
        You are a Global Macro Strategist for a hedge fund.
        Analyze the provided economic indicators (CPI, Rates, GDP, etc.) and generate a concise "Macro Overview" for traders.
        Focus on:
        1. Inflationary/Deflationary trends.
        2. Central Bank Policy outlook (Hawkish/Dovish).
        3. Overall Risk Sentiment (Risk-On/Risk-Off).
        
        Keep it professional, concise (max 3 sentences), and actionable for a crypto/stock trader.
        {lang_instruction}
        """
        user_content = f"Economic Data: {macro_data}"
        return await self._route_request(system_prompt, user_content, provider)

    async def generate_ai_strategy_templates(self, user_prompt: str = None, provider: str = None):
        system_instruction = """
        You are a professional quantitative trading architect. Generate 3 unique algorithmic trading strategies in JSON format.
        Strict Output Format (Array of Objects):
        [{"name": "...", "description": "...", "strategy_type": "...", "tags": [], "params": {}}]
        Return ONLY raw JSON. No markdown.
        """
        user_content = f"User Requirement: {user_prompt}" if user_prompt else "Generate 3 diverse strategies."
        
        response_text = await self._route_request(system_instruction, user_content, provider)
        return self._clean_and_parse_json(response_text)

    async def generate_strategy_code(self, user_prompt: str, provider: str = None) -> str:
        system_instruction = """
        You are an expert algorithmic trading developer using 'backtrader'. 
        Convert natural language ideas into a Python Backtrader Strategy.
        (Output ONLY raw Python code. No markdown.)
        """
        return await self._route_request(system_instruction, f"User Strategy Idea: {user_prompt}", provider)

    async def generate_visual_strategy(self, user_prompt: str, provider: str = None) -> dict:
        system_instruction = """
        You are an architect for a Visual Strategy Builder.
        Convert the idea into a JSON configuration of Nodes and Edges for a React Flow diagram.
        Output ONLY raw JSON.
        """
        response_text = await self._route_request(system_instruction, f"User Idea: {user_prompt}", provider)
        return self._clean_and_parse_json(response_text, default={"nodes": [], "edges": []})

    async def generate_market_narratives(self, headlines: str, provider: str = None) -> dict:
        system_instruction = """
        You are a crypto narrative hunter. Analyze the provided headlines and extract:
        1. 'word_cloud': Top 20 trending keywords/tokens (e.g., 'Solana', 'ETF', 'Hack') with a 'weight' (10-100) based on frequency/importance.
        2. 'narratives': Top 3 dominant market narratives explaining WHY these are trending (max 15 words each).
        
        Strict Output JSON Format:
        {
            "word_cloud": [{"text": "Bitcoin", "weight": 90}, {"text": "Regulation", "weight": 60}, ...],
            "narratives": [
                "AI tokens surging due to NVIDIA's record earnings report.",
                "Solana meme coins recovering after network congestion fix.",
                "Regulatory fears rising ahead of upcoming SEC decision."
            ]
        }
        Return ONLY raw JSON.
        """
        user_content = f"Analyze these headlines: {headlines}"
        response_text = await self._route_request(system_instruction, user_content, provider)
        return self._clean_and_parse_json(response_text, default={"word_cloud": [], "narratives": []})

    async def analyze_news_credibility(self, news_content: str, provider: str = None) -> dict:
        system_instruction = """
        You are an AI 'FUD Buster' and Fact Checker for Crypto News.
        Analyze the provided news content for credibility, logical fallacies, and 'FUD' (Fear, Uncertainty, Doubt).
        
        Strict Output JSON Format:
        {
            "score": 85, (0-100, where 100 is Highly Credible, 0 is Total FUD/Fake)
            "label": "Credible", ("Credible", "Potential FUD", "Clickbait", "Unverified")
            "reason": "The source cites official on-chain data and avoids emotional language." (Max 20 words)
        }
        Return ONLY raw JSON.
        """
        user_content = f"Analyze this news item: {news_content}"
        response_text = await self._route_request(system_instruction, user_content, provider)
        return self._clean_and_parse_json(response_text, default={"score": 50, "label": "Unknown", "reason": "Analysis failed."})

    async def generate_comprehensive_report(self, headlines: list, score: float, correlation: float, whale_data: dict, provider: str = None, language: str = "en") -> dict:
        lang_instruction = "Respond in English." if language == "en" else "Respond in Bengali (Bangla)."
        
        system_instruction = f"""
        You are a Chief Market Strategist for a crypto hedge fund.
        Generate a comprehensive 'Market Narrative Report' based on the provided data points.
        {lang_instruction}
        
        Analyze the following inputs:
        1. **Sentiment Score**: Float 0-100 (0=Extreme Fear, 100=Extreme Greed).
        2. **Recent Headlines**: List of news titles.
        3. **Correlation**: Float -1 to 1 (Price vs Sentiment Correlation).
        4. **Whale Activity**: Transaction stats (Net Buy/Sell).

        Strict Output JSON Format:
        {{
            "score_analysis": "Explanation of why the score is X based on market mood.",
            "news_summary": "A cohesive narrative summary weaving the headlines together.",
            "correlation_insight": "Insight on price-sentiment divergence/convergence.",
            "whale_insight": "Analysis of smart money flow based on whale data.",
            "executive_summary": "A master summary of the overall market condition (max 2 sentences)."
        }}
        Return ONLY raw JSON.
        """
        user_content = f"""
        Sentiment Score: {score}
        Correlation: {correlation}
        Whale Data: {json.dumps(whale_data)}
        Headlines: {json.dumps(headlines)}
        """
        response_text = await self._route_request(system_instruction, user_content, provider)
        default_response = {
            "score_analysis": "Data unavailable.",
            "news_summary": "Data unavailable.",
            "correlation_insight": "Data unavailable.",
            "whale_insight": "Data unavailable.",
            "executive_summary": "Analysis failed."
        }
        return self._clean_and_parse_json(response_text, default=default_response)

    def _get_nlp_model(self):
        """
        Singleton Lazy Loader for Spacy Model with Auto-Download & Custom Entity Ruler.
        """
        global _nlp_model
        if _nlp_model:
            return _nlp_model

        model_name = "en_core_web_sm"
        try:
            print(f"Generating NLP model: Loading {model_name}...")
            nlp = spacy.load(model_name)
        except OSError:
            print(f"⚠️ Model '{model_name}' not found. Downloading...")
            subprocess.check_call([sys.executable, "-m", "spacy", "download", model_name])
            nlp = spacy.load(model_name)

        # Add Custom Entity Ruler
        if "entity_ruler" not in nlp.pipe_names:
            ruler = nlp.add_pipe("entity_ruler", before="ner")
            patterns = [
                # COINS
                {"label": "COIN", "pattern": [{"LOWER": {"IN": ["bitcoin", "btc", "xbt", "sats"]}}]},
                {"label": "COIN", "pattern": [{"LOWER": {"IN": ["ethereum", "eth", "ether"]}}]},
                {"label": "COIN", "pattern": [{"LOWER": {"IN": ["solana", "sol"]}}]},
                {"label": "COIN", "pattern": [{"LOWER": {"IN": ["ripple", "xrp"]}}]},
                {"label": "COIN", "pattern": [{"LOWER": {"IN": ["cardano", "ada"]}}]},
                {"label": "COIN", "pattern": [{"LOWER": {"IN": ["dogecoin", "doge"]}}]},
                {"label": "COIN", "pattern": [{"LOWER": {"IN": ["bnb", "binance coin"]}}]},
                
                # ORGS
                {"label": "ORG", "pattern": [{"LOWER": {"IN": ["binance", "cz"]}}]},
                {"label": "ORG", "pattern": [{"LOWER": {"IN": ["coinbase", "brian armstrong"]}}]},
                {"label": "ORG", "pattern": [{"LOWER": {"IN": ["sec", "gary gensler"]}}]},
                {"label": "ORG", "pattern": [{"LOWER": {"IN": ["ftx", "sbf", "alameda"]}}]},
                {"label": "ORG", "pattern": [{"LOWER": {"IN": ["blackrock", "larry fink"]}}]},
                {"label": "ORG", "pattern": [{"LOWER": {"IN": ["microstrategy", "michael saylor"]}}]},

                # EVENTS
                {"label": "EVENT", "pattern": [{"LOWER": {"IN": ["etf", "etfs"]}}]},
                {"label": "EVENT", "pattern": [{"LOWER": {"IN": ["hack", "hacked", "exploit", "exploited"]}}]},
                {"label": "EVENT", "pattern": [{"LOWER": {"IN": ["halving", "halven"]}}]},
                {"label": "EVENT", "pattern": [{"LOWER": {"IN": ["listing", "listed", "delisting", "delisted"]}}]},
                {"label": "EVENT", "pattern": [{"LOWER": {"IN": ["cpi", "inflation", "fomc", "fed rate"]}}]},
                {"label": "EVENT", "pattern": [{"LOWER": {"IN": ["bull run", "bear market", "ath", "all time high"]}}]}
            ]
            ruler.add_patterns(patterns)
        
        _nlp_model = nlp
        return _nlp_model

    def extract_crypto_entities(self, text: str) -> dict:
        """
        Extracts Crypto Coins, Orgs, and Events from text using Custom Spacy NER.
        """
        nlp = self._get_nlp_model()
        doc = nlp(text)
        
        entities = {
            "coins": [],
            "orgs": [],
            "events": []
        }
        
        # Helper to deduplicate while preserving order
        def add_unique(category, value):
            if value not in entities[category]:
                entities[category].append(value)

        for ent in doc.ents:
            if ent.label_ == "COIN":
                add_unique("coins", ent.text)
            elif ent.label_ == "ORG":
                add_unique("orgs", ent.text)
            elif ent.label_ == "EVENT":
                add_unique("events", ent.text)
            # We can also capture standard ORG/PERSON if needed, but keeping it strict for now as per constraints
            elif ent.label_ == "ORG" and ent.text.lower() in ["sec", "fed"]: # Fallback if ruler misses but standard NER catches
                 add_unique("orgs", ent.text)

        return entities

    # --- Internal Routing & API Calls ---

    async def _route_request(self, system_prompt: str, user_content: str, provider: str = None) -> str:
        """
        Routes the request to the appropriate LLM provider.
        """
        active_provider = self._get_provider(provider)
        full_prompt = f"{system_prompt}\n\n{user_content}"

        try:
            # ✅ Syntax Error Fix: Ensure if/elif chain is clean
            if active_provider == "gemini":
                return await self._call_gemini(full_prompt)
            
            elif active_provider == "openai":
                return await self._call_openai_compatible(
                    settings.OPENAI_API_KEY, 
                    settings.OPENAI_BASE_URL, 
                    "gpt-4o", 
                    system_prompt, 
                    user_content
                )
            
            elif active_provider == "deepseek":
                return await self._call_openai_compatible(
                    settings.DEEPSEEK_API_KEY, 
                    settings.DEEPSEEK_BASE_URL, 
                    "deepseek-chat", 
                    system_prompt, 
                    user_content
                )
            
            else:
                return f"❌ Error: Unknown Provider '{active_provider}'"

        except Exception as e:
            print(f"❌ AI Error ({active_provider}): {e}")
            # Fallback: Rule-based Summary
            return self._generate_fallback_summary(user_content)

    def _generate_fallback_summary(self, content: str) -> str:
        """
        Generates a basic summary when AI is unavailable.
        """
        if "bull" in content.lower() or "surge" in content.lower() or "high" in content.lower():
            sentiment = "Bullish"
        elif "bear" in content.lower() or "crash" in content.lower() or "low" in content.lower():
            sentiment = "Bearish"
        else:
            sentiment = "Mixed/Neutral"
            
        return f"Market Sentiment appears {sentiment} based on recent headlines. (AI Unavailable, using heuristics)"

    async def _call_gemini(self, full_prompt: str) -> str:
        if not gemini_client:
            return "❌ Gemini API Key missing or client init failed."
        
        def _sync_gemini():
            try:
                # Standard stable model
                response = gemini_client.models.generate_content(
                    model="gemini-2.5-flash", 
                    contents=full_prompt
                )
                return response.text.strip()
            except Exception as e:
                # If the specific model fails, we can try one fallback or just return the error
                # print(f"Gemini Model Error: {e}")
                raise e # Let the outer try/except catch it and format the error string
            
        return await asyncio.to_thread(_sync_gemini)

    async def _call_openai_compatible(self, api_key: str, base_url: str, model: str, system_msg: str, user_msg: str) -> str:
        if not api_key:
            return "❌ API Key missing for selected provider."
        
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json"
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_msg},
                {"role": "user", "content": user_msg}
            ],
            "temperature": 0.7
        }
        
        def _sync_request():
            try:
                response = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=30)
                if response.status_code == 200:
                    return response.json()['choices'][0]['message']['content'].strip()
                else:
                    return f"API Error {response.status_code}: {response.text}"
            except Exception as e:
                return f"Connection Error: {str(e)}"

        return await asyncio.to_thread(_sync_request)

    async def generate_strategy_config(self, prompt: str) -> dict:
        """
        Generates a structured trading strategy configuration from a natural language prompt.
        Currently uses MOCK logic for demonstration.
        """
        prompt_lower = prompt.lower()
        
        # --- Mock Logic ---
        if "risky" in prompt_lower or "aggressive" in prompt_lower:
            return {
                "strategy_name": "Aggressive Alpha Hunter",
                "description": "High leverage, tight stop-loss strategy for volatile markets.",
                "leverage": 50,
                "stop_loss": 2.0,
                "take_profit": 10.0,
                "timeframe": "5m",
                "amount_per_trade": 100.0
            }
        elif "safe" in prompt_lower or "conservative" in prompt_lower:
             return {
                "strategy_name": "Conservative Wealth Preserver",
                "description": "Low leverage, swing trading strategy focusing on capital preservation.",
                "leverage": 3,
                "stop_loss": 5.0,
                "take_profit": 8.0,
                "timeframe": "4h",
                "amount_per_trade": 500.0
            }
        else:
             return {
                "strategy_name": "Balanced Trend Follower",
                "description": "Medium leverage strategy following major market trends.",
                "leverage": 10,
                "stop_loss": 3.0,
                "take_profit": 6.0,
                "timeframe": "1h",
                "amount_per_trade": 250.0
            }

        # --- Real Logic (Scaffold) ---
        # system_instruction = """
        # You are a quantitative trading expert. Convert the user's request into a JSON object with fields: 
        # `strategy_name`, `description`, `leverage` (1-125), `stop_loss` (%), `take_profit` (%), `timeframe` (e.g., '15m'), and `amount_per_trade`.
        # Ensure strict JSON output.
        # """
        # response_text = await self._route_request(system_instruction, f"User Request: {prompt}")
        # return self._clean_and_parse_json(response_text)

    def _clean_and_parse_json(self, text: str, default=None):
        if default is None: default = []
        try:
            # Clean markdown code blocks
            clean_text = text.replace("```json", "").replace("```", "").strip()
            return json.loads(clean_text)
        except json.JSONDecodeError:
            print(f"Failed to parse JSON: {text[:100]}...")
            return default

# ✅ Create Global Instance
ai_service = AIService()

# ✅ Module-Level Wrapper Functions (Backwards Compatibility for strategies.py)
# strategies.py ফাইলটি মডিউল ফাংশন এক্সপেক্ট করে, তাই আমরা ক্লাসের মেথডগুলোকে র‍্যাপ করে দিচ্ছি।

async def generate_ai_strategy_templates(user_prompt: str = None):
    return await ai_service.generate_ai_strategy_templates(user_prompt)

async def generate_strategy_code(user_prompt: str):
    return await ai_service.generate_strategy_code(user_prompt)

async def generate_visual_strategy(user_prompt: str):
    return await ai_service.generate_visual_strategy(user_prompt)

async def generate_market_sentiment_summary(headlines: str, asset: str):
    return await ai_service.generate_market_sentiment_summary(headlines, asset)

async def generate_macro_overview(macro_data: str):
    return await ai_service.generate_macro_overview(macro_data)

async def generate_market_narratives(headlines: str):
    return await ai_service.generate_market_narratives(headlines)

async def analyze_news_credibility(news_content: str):
    return await ai_service.analyze_news_credibility(news_content)

async def generate_strategy_config(prompt: str):
    return await ai_service.generate_strategy_config(prompt)

def extract_crypto_entities(text: str) -> dict:
    return ai_service.extract_crypto_entities(text)

async def generate_comprehensive_report(headlines: list, score: float, correlation: float, whale_data: dict):
    return await ai_service.generate_comprehensive_report(headlines, score, correlation, whale_data)