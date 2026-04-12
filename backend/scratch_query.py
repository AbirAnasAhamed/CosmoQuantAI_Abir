import sys
sys.path.append('E:\\CosmoQuantAI\\backend')
from app.db.session import SessionLocal
from app.models.bot import Bot

db = SessionLocal()
bot = db.query(Bot).filter(Bot.id == 31).first()
if bot:
    print(f"Bot 31 config: {bot.config}")
else:
    print("Bot 31 not found")
