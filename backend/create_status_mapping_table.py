#!/usr/bin/env python3
"""
Create status mapping table for flexible status handling
"""
import asyncio
import sys
from pathlib import Path

# Add the project root to the Python path
project_root = Path(__file__).parent
sys.path.insert(0, str(project_root))

from sqlalchemy.ext.asyncio import create_async_engine, AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text
from app.core.config import settings

async def create_status_mapping_table():
    """Create status mapping table"""
    
    # Create async engine
    engine = create_async_engine(
        settings.DATABASE_URL,
        echo=False
    )
    
    # Create async session
    async_session = sessionmaker(
        engine, class_=AsyncSession, expire_on_commit=False
    )
    
    try:
        async with async_session() as session:
            print("🔧 Creating status mapping table...")
            
            # Create status_mappings table
            create_table_query = text("""
                CREATE TABLE IF NOT EXISTS status_mappings (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    workspace_id UUID NOT NULL,
                    source_status VARCHAR(50) NOT NULL,
                    target_status VARCHAR(20) NOT NULL CHECK (target_status IN ('ACTIVE', 'PAUSE', 'STOP')),
                    data_source_type VARCHAR(20), -- 'mssql', 'postgresql', 'api'
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT NOW(),
                    updated_at TIMESTAMP DEFAULT NOW()
                )
            """)
            
            await session.execute(create_table_query)
            
            # Create unique constraint
            create_constraint_query = text("""
                DO $$ BEGIN
                    IF NOT EXISTS (
                        SELECT 1 FROM information_schema.table_constraints 
                        WHERE constraint_name = 'unique_workspace_source_datasource' 
                        AND table_name = 'status_mappings'
                    ) THEN
                        ALTER TABLE status_mappings 
                        ADD CONSTRAINT unique_workspace_source_datasource 
                        UNIQUE(workspace_id, source_status, data_source_type);
                    END IF;
                END $$;
            """)
            
            await session.execute(create_constraint_query)
            
            # Create indexes for performance
            create_index_query = text("""
                CREATE INDEX IF NOT EXISTS idx_status_mappings_workspace_active 
                ON status_mappings(workspace_id, is_active);
            """)
            
            await session.execute(create_index_query)
            
            await session.commit()
            print("✅ Status mapping table created successfully")
            
            # Add some sample mappings for testing
            print("🔧 Adding sample status mappings...")
            
            # Get workspace ID
            workspace_query = text("""
                SELECT id FROM workspaces WHERE slug = 'personaltest' OR name = 'personaltest' LIMIT 1
            """)
            
            ws_result = await session.execute(workspace_query)
            ws_row = ws_result.fetchone()
            
            if ws_row:
                workspace_id = str(ws_row.id)
                
                # Sample mappings
                sample_mappings = [
                    ("Running", "ACTIVE", "mssql"),
                    ("Run", "ACTIVE", "mssql"),
                    ("Stopped", "STOP", "mssql"),
                    ("Idle", "PAUSE", "mssql"),
                    ("Operational", "ACTIVE", "mssql"),
                    ("Maintenance", "STOP", "mssql"),
                    ("Shutdown", "STOP", "mssql"),
                    ("Standby", "PAUSE", "mssql"),
                ]
                
                for source, target, datasource in sample_mappings:
                    insert_query = text("""
                        INSERT INTO status_mappings
                        (workspace_id, source_status, target_status, data_source_type, is_active, created_at)
                        VALUES (:workspace_id, :source_status, :target_status, :data_source_type, true, NOW())
                        ON CONFLICT (workspace_id, source_status, data_source_type)
                        DO UPDATE SET
                            target_status = EXCLUDED.target_status,
                            is_active = EXCLUDED.is_active,
                            updated_at = NOW()
                    """)
                    
                    await session.execute(insert_query, {
                        "workspace_id": workspace_id,
                        "source_status": source,
                        "target_status": target,
                        "data_source_type": datasource
                    })
                
                await session.commit()
                print(f"✅ Added {len(sample_mappings)} sample status mappings")
            else:
                print("⚠️  No workspace found for sample mappings")
                
    except Exception as e:
        print(f"❌ Error creating status mapping table: {e}")
        raise
    finally:
        await engine.dispose()

if __name__ == "__main__":
    asyncio.run(create_status_mapping_table())