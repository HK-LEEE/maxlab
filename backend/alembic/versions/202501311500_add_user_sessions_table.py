"""add_user_sessions_table

Revision ID: 202501311500
Revises: b42177cf0425
Create Date: 2025-01-31 15:00:00.000000

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '202501311500'
down_revision = 'b42177cf0425'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Create user_sessions table
    op.create_table('user_sessions',
        sa.Column('session_id', sa.String(length=64), nullable=False),
        sa.Column('user_id', sa.String(length=255), nullable=False),
        sa.Column('user_email', sa.String(length=255), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=False),
        sa.Column('last_accessed', sa.DateTime(), nullable=False),
        sa.Column('expires_at', sa.DateTime(), nullable=False),
        sa.Column('is_active', sa.Boolean(), nullable=False),
        sa.Column('ip_address', sa.String(length=45), nullable=True),
        sa.Column('user_agent', sa.Text(), nullable=True),
        sa.Column('session_data', postgresql.JSON(astext_type=sa.Text()), nullable=True),
        sa.Column('jwt_token_id', sa.String(length=255), nullable=True),
        sa.Column('is_suspicious', sa.Boolean(), nullable=False),
        sa.Column('login_method', sa.String(length=50), nullable=True),
        sa.PrimaryKeyConstraint('session_id'),
        sa.Index('idx_user_sessions_user_active', 'user_id', 'is_active'),
        sa.Index('idx_user_sessions_expires', 'expires_at'),
        sa.Index('idx_user_sessions_jwt', 'jwt_token_id'),
        sa.Index('idx_user_sessions_last_accessed', 'last_accessed'),
    )
    
    # Create individual indexes for better query performance
    op.create_index('idx_user_sessions_session_id', 'user_sessions', ['session_id'], unique=False)
    op.create_index('idx_user_sessions_user_id', 'user_sessions', ['user_id'], unique=False)
    op.create_index('idx_user_sessions_user_email', 'user_sessions', ['user_email'], unique=False)


def downgrade() -> None:
    # Drop all indexes first
    op.drop_index('idx_user_sessions_user_email', table_name='user_sessions')
    op.drop_index('idx_user_sessions_user_id', table_name='user_sessions')
    op.drop_index('idx_user_sessions_session_id', table_name='user_sessions')
    
    # Drop the table
    op.drop_table('user_sessions')