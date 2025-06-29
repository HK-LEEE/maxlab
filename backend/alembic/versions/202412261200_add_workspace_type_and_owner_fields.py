"""Add workspace type and owner fields

Revision ID: 202412261200
Revises: 018155c10a35
Create Date: 2024-12-26 12:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '202412261200'
down_revision = '018155c10a35'
branch_labels = None
depends_on = None


def upgrade():
    # Create enum types
    workspace_type_enum = postgresql.ENUM('PERSONAL', 'GROUP', name='workspacetype')
    owner_type_enum = postgresql.ENUM('USER', 'GROUP', name='ownertype')
    
    workspace_type_enum.create(op.get_bind())
    owner_type_enum.create(op.get_bind())
    
    # Add columns to workspaces table
    op.add_column('workspaces', sa.Column('workspace_type', sa.Enum('PERSONAL', 'GROUP', name='workspacetype'), nullable=False, server_default='PERSONAL'))
    op.add_column('workspaces', sa.Column('owner_type', sa.Enum('USER', 'GROUP', name='ownertype'), nullable=False, server_default='USER'))
    op.add_column('workspaces', sa.Column('owner_id', sa.String(length=255), nullable=False, server_default=''))
    
    # Remove server defaults
    op.alter_column('workspaces', 'workspace_type', server_default=None)
    op.alter_column('workspaces', 'owner_type', server_default=None)
    op.alter_column('workspaces', 'owner_id', server_default=None)
    
    # Create indexes
    op.create_index('idx_workspace_owner', 'workspaces', ['owner_type', 'owner_id'])
    op.create_index('idx_workspace_type', 'workspaces', ['workspace_type'])


def downgrade():
    # Drop indexes
    op.drop_index('idx_workspace_type', 'workspaces')
    op.drop_index('idx_workspace_owner', 'workspaces')
    
    # Drop columns
    op.drop_column('workspaces', 'owner_id')
    op.drop_column('workspaces', 'owner_type')
    op.drop_column('workspaces', 'workspace_type')
    
    # Drop enum types
    op.execute('DROP TYPE IF EXISTS workspacetype')
    op.execute('DROP TYPE IF EXISTS ownertype')