"""add sentiment history table

Revision ID: 9999_add_sentiment_history
Revises: f389f6bb9761, optimize_market_data, 5d8e9f0a1b2c
Create Date: 2026-01-28 16:38:40.000000

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '9999_add_sentiment_history'
down_revision = ('f389f6bb9761', 'optimize_market_data', '5d8e9f0a1b2c')
branch_labels = None
depends_on = None


def upgrade():
    # Drop existing table to ensure schema matches exact requirements
    # This acts as a hard reset for this table to resolve previous schema drift
    op.execute('DROP TABLE IF EXISTS sentiment_history CASCADE')

    op.create_table(
        'sentiment_history',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('symbol', sa.String(), nullable=False),
        sa.Column('timeframe', sa.String(), nullable=True),
        sa.Column('retail_score', sa.Float(), nullable=True),
        sa.Column('smart_money_score', sa.Float(), nullable=True),
        sa.Column('news_sentiment', sa.Float(), nullable=True),
        sa.Column('price', sa.Float(), nullable=True),
        sa.Column('timestamp', sa.DateTime(), nullable=True),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_sentiment_history_symbol'), 'sentiment_history', ['symbol'], unique=False)
    op.create_index(op.f('ix_sentiment_history_timestamp'), 'sentiment_history', ['timestamp'], unique=False)


def downgrade():
    op.drop_table('sentiment_history')
