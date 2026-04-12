from app.db.session import SessionLocal
from app.models import Bot

db = SessionLocal()
bot = db.query(Bot).filter(Bot.id==30).first()
if bot:
    config = bot.config
    print('STRATEGY_MODE:', config.get('strategy_mode', 'NOT_FOUND'))
    print('LIQ_TARGET_SIDE:', config.get('liq_target_side', 'NOT_FOUND'))
else:
    print('Bot not found')
