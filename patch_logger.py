import re

filepath = "e:/CosmoQuantAI/backend/app/strategies/wall_hunter_bot.py"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

logger_class = """
class WallHunterLogger:
    def __init__(self, bot_id: int):
        self.bot_id = bot_id
        import logging
        self._logger = logging.getLogger("WallHunter" + str(bot_id))

    def _push_redis(self, log_type: str, message: str):
        try:
            import datetime, json, redis
            from app.core.config import settings
            r = redis.from_url(settings.REDIS_URL, decode_responses=True)
            timestamp = datetime.datetime.now().strftime("%H:%M:%S")
            log_entry = {"time": timestamp, "type": log_type, "message": str(message)}
            stream_payload = {"channel": f"logs_{self.bot_id}", "data": log_entry}
            r.publish("bot_logs", json.dumps(stream_payload))
            r.publish(f"bot_logs:{self.bot_id}", json.dumps(log_entry))
            list_key = f"bot_logs_list:{self.bot_id}"
            r.rpush(list_key, json.dumps(log_entry))
            r.ltrim(list_key, -50, -1)
        except Exception:
            pass

    def info(self, msg, *args, **kwargs):
        self._logger.info(msg, *args, **kwargs)
        self._push_redis("INFO", (str(msg) % args) if args else str(msg))

    def warning(self, msg, *args, **kwargs):
        self._logger.warning(msg, *args, **kwargs)
        self._push_redis("WARNING", (str(msg) % args) if args else str(msg))

    def error(self, msg, *args, **kwargs):
        self._logger.error(msg, *args, **kwargs)
        self._push_redis("ERROR", (str(msg) % args) if args else str(msg))
        
    def debug(self, msg, *args, **kwargs):
        self._logger.debug(msg, *args, **kwargs)

"""

# Inject class right before "logger = "
idx = content.find("logger = logging.getLogger")
content = content[:idx] + logger_class + "\n" + content[idx:]

# Inject inside __init__
content = content.replace("        self.is_paper_trading = config.get(\"is_paper_trading\", True)\n", 
                          "        self.is_paper_trading = config.get(\"is_paper_trading\", True)\n        self.logger = WallHunterLogger(self.bot_id)\n")

# ONLY replace `logger.xxx` with `self.logger.xxx` inside class methods.
# The easiest regex is: any whitespace followed by logger.
content = re.sub(r'(\s+)logger\.', r'\1self.logger.', content)

# But wait, `logger = logging.getLogger(__name__)` at the top level shouldn't be touched.
# At the top level there are no leading spaces before `logger.`.
# So `(\s+)` will match spaces/tabs correctly! Wait, it will also match newlines!
# E.g. \nlogger.
# The top level is: \nlogger = logging.getLogger(...)
# If someone does `logger.info` at top level without indentation, it would match if preceded by newline.
# But there are none.

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)
print("Safe patch applied!")
