
from sqlalchemy import create_engine, text
from app.core.config import settings

def fix_schema():
    print("Starting schema fix...")
    engine = create_engine(settings.DATABASE_URL)
    with engine.connect() as conn:
        # Check if 'symbol' column exists
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='sentiment_poll' AND column_name='symbol';"
        ))
        if not result.fetchone():
            print("Adding 'symbol' column...")
            conn.execute(text("ALTER TABLE sentiment_poll ADD COLUMN symbol VARCHAR;"))
            conn.execute(text("CREATE INDEX ix_sentiment_poll_symbol ON sentiment_poll (symbol);"))
            # Set default value for existing rows
            conn.execute(text("UPDATE sentiment_poll SET symbol = 'BTC/USDT' WHERE symbol IS NULL;"))
            conn.commit()
            print("'symbol' column added.")
        else:
            print("'symbol' column already exists.")

        # Check if 'ip_address' column exists
        result = conn.execute(text(
            "SELECT column_name FROM information_schema.columns WHERE table_name='sentiment_poll' AND column_name='ip_address';"
        ))
        if not result.fetchone():
            print("Adding 'ip_address' column...")
            conn.execute(text("ALTER TABLE sentiment_poll ADD COLUMN ip_address VARCHAR;"))
            conn.execute(text("CREATE INDEX ix_sentiment_poll_ip_address ON sentiment_poll (ip_address);"))
            # Make user_id nullable if needed (it was changed to nullable=True in model)
            conn.execute(text("ALTER TABLE sentiment_poll ALTER COLUMN user_id DROP NOT NULL;"))
            conn.commit()
            print("'ip_address' column added.")
        else:
            print("'ip_address' column already exists.")
            
    print("Schema fix complete.")

if __name__ == "__main__":
    fix_schema()
