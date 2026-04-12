"""Add win_rate to bots

Revision ID: d9a1b2c3d4e5
Revises: c5d9cc935a7a
Create Date: 2025-12-18 01:20:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision: str = 'd9a1b2c3d4e5'
down_revision: Union[str, Sequence[str], None] = 'c5d9cc935a7a'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('bots', sa.Column('win_rate', sa.Float(), nullable=True, server_default='0.0'))


def downgrade() -> None:
    op.drop_column('bots', 'win_rate')
