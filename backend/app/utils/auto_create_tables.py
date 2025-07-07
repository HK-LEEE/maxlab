"""
Auto-create missing tables for data source management
"""
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import text
import logging

logger = logging.getLogger(__name__)

async def ensure_tables_exist(db: AsyncSession):
    """Ensure all required tables exist"""
    
    # Check and create field mappings table
    try:
        check_field_table = """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'data_source_field_mappings'
            )
        """
        result = await db.execute(text(check_field_table))
        if not result.scalar():
            logger.info("Creating data_source_field_mappings table...")
            create_field_table = """
                CREATE TABLE IF NOT EXISTS data_source_field_mappings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    data_source_id UUID NOT NULL,
                    data_type VARCHAR(50) NOT NULL,
                    source_field VARCHAR(255) NOT NULL,
                    target_field VARCHAR(255) NOT NULL,
                    data_type_conversion VARCHAR(50),
                    transform_function TEXT,
                    default_value TEXT,
                    is_required BOOLEAN DEFAULT false,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_field_mapping UNIQUE (data_source_id, data_type, target_field)
                )
            """
            await db.execute(text(create_field_table))
            await db.commit()
            logger.info("Created data_source_field_mappings table")
    except Exception as e:
        logger.error(f"Error creating field mappings table: {e}")
    
    # Check and create data source mappings table
    try:
        check_mappings_table = """
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_name = 'data_source_mappings'
            )
        """
        result = await db.execute(text(check_mappings_table))
        if not result.scalar():
            logger.info("Creating data_source_mappings table...")
            create_mappings_table = """
                CREATE TABLE IF NOT EXISTS data_source_mappings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    workspace_id UUID NOT NULL,
                    data_source_id UUID NOT NULL,
                    mapping_type VARCHAR(50) NOT NULL,
                    source_code VARCHAR(255) NOT NULL,
                    source_name VARCHAR(255),
                    source_type VARCHAR(100),
                    target_code VARCHAR(255) NOT NULL,
                    target_name VARCHAR(255),
                    target_type VARCHAR(100),
                    transform_rules JSONB,
                    is_active BOOLEAN DEFAULT true,
                    created_by VARCHAR(255),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    CONSTRAINT unique_mapping UNIQUE (workspace_id, data_source_id, mapping_type, source_code)
                )
            """
            await db.execute(text(create_mappings_table))
            await db.commit()
            logger.info("Created data_source_mappings table")
    except Exception as e:
        logger.error(f"Error creating data source mappings table: {e}")
    
    # Check and add columns to measurement_data table
    try:
        check_columns = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'personal_test_measurement_data' 
            AND column_name IN ('usl', 'lsl', 'spec_status')
        """
        result = await db.execute(text(check_columns))
        existing_columns = [row.column_name for row in result]
        
        if 'usl' not in existing_columns:
            await db.execute(text("ALTER TABLE personal_test_measurement_data ADD COLUMN IF NOT EXISTS usl FLOAT"))
        if 'lsl' not in existing_columns:
            await db.execute(text("ALTER TABLE personal_test_measurement_data ADD COLUMN IF NOT EXISTS lsl FLOAT"))
        if 'spec_status' not in existing_columns:
            await db.execute(text("ALTER TABLE personal_test_measurement_data ADD COLUMN IF NOT EXISTS spec_status INTEGER DEFAULT 0"))
        
        if len(existing_columns) < 3:
            await db.commit()
            logger.info("Added missing columns to personal_test_measurement_data table")
    except Exception as e:
        logger.error(f"Error adding columns to measurement_data table: {e}")
    
    # Add connection_string column to data_source_configs if it doesn't exist
    try:
        check_connection_string = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'data_source_configs' 
            AND column_name = 'connection_string'
        """
        result = await db.execute(text(check_connection_string))
        if not result.scalar():
            logger.info("Adding connection_string column to data_source_configs...")
            await db.execute(text("""
                ALTER TABLE data_source_configs 
                ADD COLUMN connection_string VARCHAR(500)
            """))
            # Migrate existing data
            await db.execute(text("""
                UPDATE data_source_configs 
                SET connection_string = COALESCE(api_url, mssql_connection_string)
                WHERE connection_string IS NULL
            """))
            await db.commit()
            logger.info("Added connection_string column to data_source_configs")
    except Exception as e:
        logger.error(f"Error adding connection_string column: {e}")
    
    # Add custom_queries column to data_source_configs if it doesn't exist
    try:
        check_custom_queries = """
            SELECT column_name 
            FROM information_schema.columns 
            WHERE table_name = 'data_source_configs' 
            AND column_name = 'custom_queries'
        """
        result = await db.execute(text(check_custom_queries))
        if not result.scalar():
            logger.info("Adding custom_queries column to data_source_configs...")
            await db.execute(text("""
                ALTER TABLE data_source_configs 
                ADD COLUMN custom_queries JSONB
            """))
            await db.execute(text("""
                COMMENT ON COLUMN data_source_configs.custom_queries IS 
                'Custom SQL queries for each data type. Structure: {"equipment_status": {"query": "SELECT ...", "description": "..."}, ...}'
            """))
            await db.commit()
            logger.info("Added custom_queries column to data_source_configs")
    except Exception as e:
        logger.error(f"Error adding custom_queries column: {e}")
    
    # Check and change workspace_id from UUID to VARCHAR if needed
    try:
        check_workspace_id_type = """
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'data_source_configs' 
            AND column_name = 'workspace_id'
        """
        result = await db.execute(text(check_workspace_id_type))
        row = result.fetchone()
        
        if row and row.data_type == 'uuid':
            logger.info("Changing workspace_id from UUID to VARCHAR in data_source_configs...")
            await db.execute(text("""
                ALTER TABLE data_source_configs 
                ALTER COLUMN workspace_id TYPE VARCHAR(255) USING workspace_id::text
            """))
            await db.commit()
            logger.info("Changed workspace_id to VARCHAR in data_source_configs")
    except Exception as e:
        logger.error(f"Error changing workspace_id type: {e}")
    
    # Also fix workspace_id in data_source_mappings table
    try:
        check_mappings_workspace_type = """
            SELECT data_type 
            FROM information_schema.columns 
            WHERE table_name = 'data_source_mappings' 
            AND column_name = 'workspace_id'
        """
        result = await db.execute(text(check_mappings_workspace_type))
        row = result.fetchone()
        
        if row and row.data_type == 'uuid':
            logger.info("Changing workspace_id from UUID to VARCHAR in data_source_mappings...")
            await db.execute(text("""
                ALTER TABLE data_source_mappings 
                ALTER COLUMN workspace_id TYPE VARCHAR(255) USING workspace_id::text
            """))
            await db.commit()
            logger.info("Changed workspace_id to VARCHAR in data_source_mappings")
    except Exception as e:
        logger.error(f"Error changing workspace_id type in mappings table: {e}")