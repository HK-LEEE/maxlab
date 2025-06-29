"""Add file management tables

Revision ID: 202412261300
Revises: 202412261230
Create Date: 2024-12-26 13:00:00

"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

# revision identifiers, used by Alembic.
revision = '202412261300'
down_revision = '202412261230'
branch_labels = None
depends_on = None


def upgrade():
    # Create workspace_files table
    op.create_table('workspace_files',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('workspace_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('parent_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('name', sa.String(length=255), nullable=False),
        sa.Column('original_name', sa.String(length=255), nullable=False),
        sa.Column('file_path', sa.String(length=1000), nullable=False),
        sa.Column('file_size', sa.BigInteger(), nullable=False),
        sa.Column('mime_type', sa.String(length=255), nullable=False),
        sa.Column('file_hash', sa.String(length=64), nullable=True),
        sa.Column('is_directory', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('file_extension', sa.String(length=50), nullable=True),
        sa.Column('metadata', sa.JSON(), nullable=True, server_default='{}'),
        sa.Column('description', sa.Text(), nullable=True),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('is_public', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('version', sa.Integer(), nullable=True, server_default='1'),
        sa.Column('version_of', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('uploaded_by', sa.String(length=255), nullable=False),
        sa.Column('uploaded_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('modified_by', sa.String(length=255), nullable=True),
        sa.Column('modified_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['workspace_id'], ['workspaces.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['parent_id'], ['workspace_files.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['version_of'], ['workspace_files.id']),
        sa.UniqueConstraint('id')
    )
    
    # Create indexes for workspace_files
    op.create_index('idx_workspace_file_workspace', 'workspace_files', ['workspace_id'])
    op.create_index('idx_workspace_file_parent', 'workspace_files', ['parent_id'])
    op.create_index('idx_workspace_file_name', 'workspace_files', ['name'])
    op.create_index('idx_workspace_file_mime_type', 'workspace_files', ['mime_type'])
    op.create_index('idx_workspace_file_uploaded_at', 'workspace_files', ['uploaded_at'])
    op.create_index('idx_workspace_file_is_deleted', 'workspace_files', ['is_deleted'])
    op.create_index('idx_workspace_file_version_of', 'workspace_files', ['version_of'])
    
    # Create file_shares table
    op.create_table('file_shares',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('file_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('share_token', sa.String(length=255), nullable=False),
        sa.Column('share_type', sa.String(length=50), nullable=True, server_default='view'),
        sa.Column('password', sa.String(length=255), nullable=True),
        sa.Column('expires_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('max_downloads', sa.Integer(), nullable=True),
        sa.Column('download_count', sa.Integer(), nullable=True, server_default='0'),
        sa.Column('created_by', sa.String(length=255), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
        sa.Column('last_accessed_at', sa.DateTime(timezone=True), nullable=True),
        sa.PrimaryKeyConstraint('id'),
        sa.ForeignKeyConstraint(['file_id'], ['workspace_files.id'], ondelete='CASCADE'),
        sa.UniqueConstraint('share_token')
    )
    
    # Create indexes for file_shares
    op.create_index('idx_file_share_token', 'file_shares', ['share_token'])
    op.create_index('idx_file_share_file', 'file_shares', ['file_id'])
    op.create_index('idx_file_share_expires', 'file_shares', ['expires_at'])


def downgrade():
    # Drop indexes
    op.drop_index('idx_file_share_expires', 'file_shares')
    op.drop_index('idx_file_share_file', 'file_shares')
    op.drop_index('idx_file_share_token', 'file_shares')
    
    op.drop_index('idx_workspace_file_version_of', 'workspace_files')
    op.drop_index('idx_workspace_file_is_deleted', 'workspace_files')
    op.drop_index('idx_workspace_file_uploaded_at', 'workspace_files')
    op.drop_index('idx_workspace_file_mime_type', 'workspace_files')
    op.drop_index('idx_workspace_file_name', 'workspace_files')
    op.drop_index('idx_workspace_file_parent', 'workspace_files')
    op.drop_index('idx_workspace_file_workspace', 'workspace_files')
    
    # Drop tables
    op.drop_table('file_shares')
    op.drop_table('workspace_files')