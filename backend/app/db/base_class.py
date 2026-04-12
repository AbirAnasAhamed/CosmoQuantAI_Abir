from sqlalchemy.ext.declarative import declarative_base

Base = declarative_base()

# Import all models here for Alembic autogenerate support
from app.models.token_unlock import TokenUnlockEvent
from app.models.orderbook_snapshot import OrderBookSnapshot
