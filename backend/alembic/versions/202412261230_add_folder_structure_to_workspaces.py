"""Add folder structure to workspaces

Revision ID: 202412261230
Revises: 202412261200
Create Date: 2024-12-26 12:30:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '202412261230'
down_revision = '202412261200'
branch_labels = None
depends_on = None


def upgrade():
    # Add columns for folder structure
    op.add_column('workspaces', sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.add_column('workspaces', sa.Column('path', sa.String(length=1000), nullable=False, server_default='/'))
    op.add_column('workspaces', sa.Column('is_folder', sa.Boolean(), nullable=False, server_default='false'))
    
    # Remove server defaults
    op.alter_column('workspaces', 'path', server_default=None)
    op.alter_column('workspaces', 'is_folder', server_default=None)
    
    # Add foreign key constraint
    op.create_foreign_key(
        'fk_workspace_parent',
        'workspaces',
        'workspaces',
        ['parent_id'],
        ['id'],
        ondelete='CASCADE'
    )
    
    # Create indexes for efficient tree queries
    op.create_index('idx_workspace_folder', 'workspaces', ['is_folder'])
    op.create_index('idx_workspace_parent', 'workspaces', ['parent_id'])
    op.create_index('idx_workspace_path', 'workspaces', ['path'])


def downgrade():
    # Drop indexes
    op.drop_index('idx_workspace_path', 'workspaces')
    op.drop_index('idx_workspace_parent', 'workspaces')
    op.drop_index('idx_workspace_folder', 'workspaces')
    
    # Drop foreign key
    op.drop_constraint('fk_workspace_parent', 'workspaces', type_='foreignkey')
    
    # Drop columns
    op.drop_column('workspaces', 'is_folder')
    op.drop_column('workspaces', 'path')
    op.drop_column('workspaces', 'parent_id')