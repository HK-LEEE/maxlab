#!/usr/bin/env python3
"""
Seed Total Monitoring workspace features
Creates the Public workspace and populates it with Total Monitoring features
"""
import asyncio
import uuid
from sqlalchemy import text
from app.core.database import AsyncSessionLocal

async def seed_total_monitoring_features():
    """Create Public workspace and seed Total Monitoring features"""
    
    async with AsyncSessionLocal() as db:
        try:
            # Create Public workspace
            public_workspace_id = str(uuid.uuid4())
            
            workspace_query = text("""
                INSERT INTO workspaces (
                    id, name, slug, description, workspace_type, owner_type, owner_id,
                    is_active, created_by, created_at
                ) VALUES (
                    :id, :name, :slug, :description, :workspace_type, :owner_type, :owner_id,
                    :is_active, :created_by, CURRENT_TIMESTAMP
                ) ON CONFLICT (slug) DO UPDATE SET
                    updated_at = CURRENT_TIMESTAMP
                RETURNING id
            """)
            
            result = await db.execute(workspace_query, {
                'id': public_workspace_id,
                'name': 'Public workspace',
                'slug': 'public_workspace',
                'description': 'Public workspace for Total Monitoring system',
                'workspace_type': 'PUBLIC',
                'owner_type': 'USER',
                'owner_id': 'system',
                'is_active': True,
                'created_by': 'system'
            })
            
            workspace_row = result.fetchone()
            if workspace_row:
                workspace_id = str(workspace_row[0])
            else:
                # Get existing workspace ID
                existing_query = text("SELECT id FROM workspaces WHERE slug = 'public_workspace'")
                existing_result = await db.execute(existing_query)
                workspace_id = str(existing_result.fetchone()[0])
            
            print(f"✅ Public workspace created/updated: {workspace_id}")
            
            # Define Total Monitoring features
            features = [
                {
                    'feature_name': 'Database Setup',
                    'feature_slug': 'database_setup',
                    'display_name': 'Database Setup',
                    'description': 'Configure and manage database connections with encryption',
                    'icon': 'database',
                    'color': '#3B82F6',
                    'route_path': '/database-setup',
                    'component_path': 'workspaces/public_workspace/components/DatabaseSetup',
                    'is_implemented': False,  # Will be implemented
                    'sort_order': 1
                },
                {
                    'feature_name': 'Process Flow Editor',
                    'feature_slug': 'process_flow_editor',
                    'display_name': 'Process Flow Editor',
                    'description': 'Design process flows with auto-save and data mapping',
                    'icon': 'workflow',
                    'color': '#10B981',
                    'route_path': '/process-flow-editor',
                    'component_path': 'workspaces/public_workspace/components/ProcessFlowEditor',
                    'is_implemented': False,  # Will be implemented
                    'sort_order': 2
                },
                {
                    'feature_name': 'Process Flow Monitoring',
                    'feature_slug': 'process_flow_monitoring',
                    'display_name': 'Process Flow Monitoring',
                    'description': 'Monitor process flows with real-time data',
                    'icon': 'monitor',
                    'color': '#F59E0B',
                    'route_path': '/process-flow-monitoring',
                    'component_path': 'workspaces/public_workspace/components/ProcessFlowMonitoring',
                    'is_implemented': False,  # Will be implemented
                    'sort_order': 3
                },
                {
                    'feature_name': 'Process Flow Publish',
                    'feature_slug': 'process_flow_publish',
                    'display_name': 'Process Flow Publish',
                    'description': 'Publish flows for public access without authentication',
                    'icon': 'share',
                    'color': '#8B5CF6',
                    'route_path': '/process-flow-publish',
                    'component_path': 'workspaces/public_workspace/components/ProcessFlowPublish',
                    'is_implemented': False,  # Will be implemented
                    'sort_order': 4
                }
            ]
            
            # Insert features
            feature_query = text("""
                INSERT INTO total_monitoring_workspace_features (
                    id, workspace_id, feature_name, feature_slug, display_name, description,
                    icon, color, route_path, component_path, is_implemented, is_active,
                    sort_order, permissions, created_by, created_at
                ) VALUES (
                    gen_random_uuid(), :workspace_id, :feature_name, :feature_slug, :display_name, :description,
                    :icon, :color, :route_path, :component_path, :is_implemented, :is_active,
                    :sort_order, :permissions, :created_by, CURRENT_TIMESTAMP
                ) ON CONFLICT (workspace_id, feature_slug) DO UPDATE SET
                    display_name = EXCLUDED.display_name,
                    description = EXCLUDED.description,
                    icon = EXCLUDED.icon,
                    color = EXCLUDED.color,
                    route_path = EXCLUDED.route_path,
                    component_path = EXCLUDED.component_path,
                    sort_order = EXCLUDED.sort_order,
                    updated_at = CURRENT_TIMESTAMP
            """)
            
            for feature in features:
                await db.execute(feature_query, {
                    'workspace_id': workspace_id,
                    'feature_name': feature['feature_name'],
                    'feature_slug': feature['feature_slug'],
                    'display_name': feature['display_name'],
                    'description': feature['description'],
                    'icon': feature['icon'],
                    'color': feature['color'],
                    'route_path': feature['route_path'],
                    'component_path': feature['component_path'],
                    'is_implemented': feature['is_implemented'],
                    'is_active': True,
                    'sort_order': feature['sort_order'],
                    'permissions': '{"read": ["user"], "write": ["user"], "admin": ["admin"]}',
                    'created_by': 'system'
                })
                
                print(f"✅ Feature created/updated: {feature['display_name']}")
            
            await db.commit()
            print(f"\n🎉 Successfully seeded Total Monitoring features for workspace: {workspace_id}")
            
        except Exception as e:
            await db.rollback()
            print(f"❌ Error seeding features: {e}")
            raise

if __name__ == "__main__":
    asyncio.run(seed_total_monitoring_features())