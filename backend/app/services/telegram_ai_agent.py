import os
import json
import asyncio
import tempfile
import urllib.parse
from bs4 import BeautifulSoup
import httpx
import uuid

from app.core.config import settings
from app.services.ai_service import ai_service
import logging

logger = logging.getLogger(__name__)

class TelegramAIAgent:
    """
    Dedicated AI Agent for processing High Impact Telegram News Alerts.
    Features: Article Scraping, Gemini Generative Summaries, Smart Tagging, Audio Generation.
    """

    async def fetch_article_text(self, url: str) -> str:
        """Lightweight scrape to get article body or fallback to snippet"""
        try:
            async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
                res = await client.get(url)
                if res.status_code == 200:
                    soup = BeautifulSoup(res.text, 'lxml')
                    # Just grab paragraphs to pass to LLM
                    paragraphs = []
                    for p in soup.find_all('p', limit=10):
                        text = p.get_text(strip=True)
                        if len(text) > 40:
                            paragraphs.append(text)
                    return " ".join(paragraphs)
        except Exception as e:
            logger.error(f"Failed to scrape {url}: {e}")
        return ""

    async def get_ai_insights(self, title: str, url: str) -> dict:
        """
        Uses Gemini to generate Bengali Summary, Trading Verdict, and Hashtags.
        """
        article_text = await self.fetch_article_text(url)
        content_to_analyze = f"Headline: {title}\nArticle Snippet: {article_text[:1500]}"
        
        system_prompt = """
        You are an elite Crypto AI Assistant. 
        Analyze the provided news headline and snippet.
        Provide your response strictly in the following JSON format ONLY:
        {
            "bengali_summary": "2 bullet points in Bengali summarizing the core event, strictly start each with '• '",
            "trading_verdict": "A 1-sentence tip in Bengali about its market impact (e.g., Bullish, Bearish, or Neutral warning)",
            "hashtags": "List of 2-4 exact ticker/coin hashtags related to this news (e.g., #BTC #SOL)"
        }
        Return ONLY valid JSON.
        """
        
        try:
            # Re-using the private _route_request method from ai_service safely
            raw_response = await ai_service._route_request(system_prompt, content_to_analyze, provider="gemini")
            parsed = ai_service._clean_and_parse_json(raw_response)
            
            # Basic validation
            if "bengali_summary" in parsed and "trading_verdict" in parsed:
                return parsed
                
        except Exception as e:
            logger.error(f"Gemini Insight Generation failed: {e}")
            
        return {
            "bengali_summary": f"• {title}",
            "trading_verdict": "মার্কেট ইমপ্যাক্ট বিশ্লেষণ করা সম্ভব হয়নি।",
            "hashtags": "#CryptoNews"
        }

    async def generate_voice_note(self, text: str) -> str:
        """
        Converts text to speech using Microsoft Edge Neural TTS for ultra-realistic Bengali voice.
        Returns the path to the temporary mp3 file.
        """
        try:
            import edge_tts
            if isinstance(text, list):
                text = " ".join([str(t) for t in text])
            elif not isinstance(text, str):
                text = str(text)
                
            filename = os.path.join(tempfile.gettempdir(), f"{uuid.uuid4()}_news.mp3")
            # Using Bengali Neural voice from edge-tts (female voice: bd-Nabanita, male: bd-Pradeep)
            # bn-BD-NabanitaNeural is high quality.
            voice = "bn-BD-NabanitaNeural" 
            communicate = edge_tts.Communicate(text, voice)
            await communicate.save(filename)
            return filename
        except Exception as e:
            logger.error(f"Neural Audio Generation failed: {e}")
            return None

telegram_ai_agent = TelegramAIAgent()
