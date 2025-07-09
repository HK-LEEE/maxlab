"""add_data_source_id_to_process_flows

Revision ID: b42177cf0425
Revises: 202412261300
Create Date: 2025-07-09 14:29:25.723259

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = 'b42177cf0425'
down_revision = '202412261300'
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add data_source_id column to personal_test_process_flows table
    op.add_column('personal_test_process_flows', 
                  sa.Column('data_source_id', sa.String(length=255), nullable=True))
    
    # Add foreign key constraint (optional - depends on whether you want strict referential integrity)
    # op.create_foreign_key('fk_process_flow_data_source', 
    #                       'personal_test_process_flows', 'data_source_configs',
    #                       ['data_source_id'], ['id'])
    
    # Add data_source_id column to personal_test_process_flow_versions table for version history
    op.add_column('personal_test_process_flow_versions', 
                  sa.Column('data_source_id', sa.String(length=255), nullable=True))


def downgrade() -> None:
    # Remove data_source_id column from both tables
    op.drop_column('personal_test_process_flows', 'data_source_id')
    op.drop_column('personal_test_process_flow_versions', 'data_source_id')