import asyncio
import sys
import os

sys.path.append(os.path.dirname(os.path.abspath(__file__)))
from app.db.session import SessionLocal
from app.models.notification import NotificationSettings
from app.services.notification import NotificationService

async def run():
    db = SessionLocal()
    try:
        users = db.query(NotificationSettings).filter(NotificationSettings.is_enabled == True).all()
        if not users:
            print("No users with notifications enabled.")
            return

        for user in users:
            if user.telegram_bot_token and user.telegram_chat_id:
                from app.services.telegram_ai_agent import telegram_ai_agent
                import html
                
                print(f"Generating AI insights for user {user.user_id}...")
                
                title = "Ethereum Foundation transfers $100M of ETH to Kraken amid regulatory scrutiny"
                url = "https://example.com/ethereum-news"
                safe_title = html.escape(title)
                
                ai_data = await telegram_ai_agent.get_ai_insights(title, url)
                raw_summary = ai_data.get("bengali_summary", "• এআই সামারি জেনারেট করা সম্ভব হয়নি।")
                if isinstance(raw_summary, list):
                    raw_summary = "\n".join([str(x) for x in raw_summary])
                summary = str(raw_summary)
                
                verdict = ai_data.get("trading_verdict", "অনিশ্চিত")
                raw_hashtags = ai_data.get("hashtags", "#Ethereum")
                if isinstance(raw_hashtags, list):
                    raw_hashtags = " ".join([str(x) for x in raw_hashtags])
                hashtags = str(raw_hashtags)
                
                score = 88
                score_icon = "🔴" if score >= 80 else "🟠" if score >= 60 else "🟡"

                msg = (
                    f"╔━━━━━━━━━━━━━━━━━━━━━━╗\n"
                    f"🚨 <b>ব্রেকিং ক্রিপ্টো নিউজ</b>\n"
                    f"╚━━━━━━━━━━━━━━━━━━━━━━╝\n"
                    f"📌 <a href='{url}'><b>{safe_title}</b></a>\n\n"
                    f"📝 <b>বিশ্লেষণ:</b>\n{summary}\n\n"
                    f"💡 <b>সিগন্যাল:</b> {verdict}\n\n"
                    f"{score_icon} স্কোর: <b>{score}/100</b>  •  🏷 {hashtags}\n"
                    f"━━━━━━━━━━━━━━━━━━━━━━━━"
                )
                
                print(f"Generating Voice Note...")
                voice_path = await telegram_ai_agent.generate_voice_note(summary)
                
                print(f"Sending test to user {user.user_id}...")
                if voice_path:
                    await NotificationService.send_voice(db, user.user_id, voice_path, caption=msg, parse_mode="HTML")
                else:
                    await NotificationService.send_message(db, user.user_id, msg, parse_mode="HTML")
                    
                print(f"✅ Sent AI test news to {user.user_id}!")
    finally:
        db.close()

if __name__ == '__main__':
    asyncio.run(run())
