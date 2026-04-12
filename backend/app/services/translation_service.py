import time
import logging
from deep_translator import GoogleTranslator
from requests.exceptions import RequestException

logger = logging.getLogger(__name__)

class TranslationService:
    def __init__(self):
        self.translator = GoogleTranslator(source='auto', target='en')
        self.chunk_size = 4500  # Google Translate limit is usually around 5000

    def translate_text(self, text: str, source_lang='auto') -> str:
        """
        Translates text to English with retry logic and chunking for long texts.
        """
        if not text:
            return ""

        # If text is short enough, translate directly
        if len(text) <= self.chunk_size:
            return self._translate_chunk_with_retry(text)

        # Split into chunks if too long
        chunks = [text[i:i + self.chunk_size] for i in range(0, len(text), self.chunk_size)]
        translated_chunks = []
        
        for chunk in chunks:
            translated = self._translate_chunk_with_retry(chunk)
            translated_chunks.append(translated)
            
        return " ".join(translated_chunks)

    def _translate_chunk_with_retry(self, text: str, retries=3) -> str:
        """
        Internal method to translate a single chunk with retries.
        """
        attempt = 0
        while attempt < retries:
            try:
                return self.translator.translate(text)
            except Exception as e:
                attempt += 1
                logger.warning(f"Translation failed (Attempt {attempt}/{retries}): {e}")
                if attempt == retries:
                    logger.error(f"Translation permanently failed for text: {text[:50]}...")
                    return text  # Fallback to original text
                time.sleep(1 * attempt)  # Exponential backoff
        return text

    def detect_and_translate(self, text: str) -> str:
        """
        Detects if text contains CJK characters (Chinese, Japanese, Korean) 
        and translates if necessary. 
        For simplicity, we assume we want to translate everything not strictly English-like
        if it comes from our specific Asian market sources, or we can just run translate 
        on everything and rely on 'auto' detection which returns original if it's already English.
        
        However, to save API calls, we can check for non-ASCII characters or specific ranges.
        """
        if self._is_cjk(text):
             return self.translate_text(text)
        return text

    def _is_cjk(self, text: str) -> bool:
        """
        Checks if text contains Chinese, Japanese, or Korean characters.
        """
        for char in text:
            # CJK Unified Ideographs block
            if '\u4e00' <= char <= '\u9fff': return True
            # Hangul (Korean)
            if '\uac00' <= char <= '\ud7af': return True
            # Hiragana/Katakana (Japanese)
            if '\u3040' <= char <= '\u30ff': return True
        return False

# Global instance
translation_service = TranslationService()
