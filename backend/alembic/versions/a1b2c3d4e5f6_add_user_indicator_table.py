"""add user indicator table

Revision ID: a1b2c3d4e5f6
Revises: 763b5b82f4f1
Create Date: 2025-12-18 10:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = 'a1b2c3d4e5f6'
down_revision = '763b5b82f4f1'
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        'user_indicators',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('user_id', sa.Integer(), nullable=False),
        sa.Column('name', sa.String(), nullable=False),
        sa.Column('code', sa.Text(), nullable=False),
        sa.Column('base_type', sa.String(), nullable=True),
        sa.Column('parameters', sa.JSON(), nullable=True),
        sa.Column('is_public', sa.Boolean(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_user_indicators_id'), 'user_indicators', ['id'], unique=False)
    op.create_index(op.f('ix_user_indicators_name'), 'user_indicators', ['name'], unique=False)


def downgrade():
    op.drop_index(op.f('ix_user_indicators_name'), table_name='user_indicators')
    op.drop_index(op.f('ix_user_indicators_id'), table_name='user_indicators')
    op.drop_table('user_indicators')
