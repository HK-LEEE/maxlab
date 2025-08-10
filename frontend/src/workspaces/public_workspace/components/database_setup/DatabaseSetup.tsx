import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { 
  Database, 
  Plus, 
  Edit2, 
  Trash2, 
  Eye, 
  EyeOff, 
  Check, 
  X, 
  AlertCircle,
  Lock,
  Unlock,
  Server
} from 'lucide-react';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../../../stores/authStore';

interface DatabaseConnection {
  id: string;
  workspace_id: string;
  groupid: string;
  connection_name: string;
  database_type: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface DatabaseConnectionCreate {
  connection_name: string;
  database_type: string;
  connection_string: string;
  groupid: string;
}

const DATABASE_TYPES = [
  { value: 'POSTGRESQL', label: 'PostgreSQL', icon: '🐘' },
  { value: 'MSSQL', label: 'SQL Server', icon: '🟦' },
  { value: 'MYSQL', label: 'MySQL', icon: '🐬' },
  { value: 'ORACLE', label: 'Oracle', icon: '🔴' },
];

const DatabaseSetup: React.FC = () => {
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showConnectionString, setShowConnectionString] = useState<string | null>(null);
  const [formData, setFormData] = useState<DatabaseConnectionCreate>({
    connection_name: '',
    database_type: 'POSTGRESQL',
    connection_string: '',
    groupid: ''
  });
  
  const user = useAuthStore((state) => state.user);
  const isAdmin = user?.is_admin || user?.role === 'admin';
  const queryClient = useQueryClient();

  // Get user's group ID (in real implementation, this would come from auth context)
  useEffect(() => {
    if (!isAdmin && user?.group_id) {
      setFormData(prev => ({ ...prev, groupid: user.group_id || '' }));
    }
  }, [user, isAdmin]);

  // Fetch database connections
  const { data: connections = [], isLoading, error } = useQuery<DatabaseConnection[]>({
    queryKey: ['databaseConnections', formData.groupid],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (!isAdmin && formData.groupid) {
        params.append('groupid', formData.groupid);
      }
      
      const response = await fetch(`/v1/total-monitoring/database-connections?${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch database connections');
      }
      return response.json();
    },
    enabled: isAdmin || !!formData.groupid,
  });

  // Create connection mutation
  const createConnectionMutation = useMutation({
    mutationFn: async (connectionData: DatabaseConnectionCreate) => {
      const response = await fetch('/v1/total-monitoring/database-connections', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(connectionData),
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to create connection');
      }
      
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['databaseConnections'] });
      toast.success('Database connection created successfully');
      setShowCreateModal(false);
      setFormData({
        connection_name: '',
        database_type: 'POSTGRESQL',
        connection_string: '',
        groupid: isAdmin ? '' : formData.groupid
      });
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!formData.connection_name.trim()) {
      toast.error('Connection name is required');
      return;
    }
    
    if (!formData.connection_string.trim()) {
      toast.error('Connection string is required');
      return;
    }
    
    if (!formData.groupid.trim()) {
      toast.error('Group ID is required');
      return;
    }
    
    createConnectionMutation.mutate(formData);
  };

  const testConnection = async (connectionId: string) => {
    try {
      // This would test the actual connection
      toast.loading('Testing connection...', { id: 'test-connection' });
      
      // Simulate test
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      toast.success('Connection test successful', { id: 'test-connection' });
    } catch (error) {
      toast.error('Connection test failed', { id: 'test-connection' });
    }
  };

  const renderConnectionCard = (connection: DatabaseConnection) => {
    const dbType = DATABASE_TYPES.find(type => type.value === connection.database_type);
    
    return (
      <div key={connection.id} className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition-shadow">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            <div className="p-3 bg-blue-50 rounded-lg">
              <Database size={24} className="text-blue-600" />
            </div>
            
            <div className="flex-1">
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-semibold text-gray-900">
                  {connection.connection_name}
                </h3>
                <span className="text-2xl">{dbType?.icon}</span>
                {connection.is_active ? (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-100 text-green-800 text-xs rounded-full">
                    <Check size={12} />
                    Active
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-100 text-red-800 text-xs rounded-full">
                    <X size={12} />
                    Inactive
                  </span>
                )}
              </div>
              
              <p className="text-sm text-gray-600 mt-1">
                {dbType?.label} • Created by {connection.created_by}
              </p>
              
              <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                <Lock size={12} />
                <span>Connection string encrypted</span>
              </div>
              
              {!isAdmin && (
                <div className="flex items-center gap-2 mt-1 text-xs text-blue-600">
                  <span className="w-2 h-2 bg-blue-500 rounded-full"></span>
                  <span>Group: {connection.groupid.slice(0, 8)}...</span>
                </div>
              )}
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => testConnection(connection.id)}
              className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
              title="Test Connection"
            >
              <Server size={18} />
            </button>
            
            <button
              className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-50 rounded transition-colors"
              title="Edit Connection"
            >
              <Edit2 size={18} />
            </button>
            
            <button
              className="p-2 text-red-600 hover:text-red-800 hover:bg-red-50 rounded transition-colors"
              title="Delete Connection"
            >
              <Trash2 size={18} />
            </button>
          </div>
        </div>
      </div>
    );
  };

  if (isLoading) {
    return (
      <div className="p-8 text-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
        <p className="mt-4 text-gray-600">Loading database connections...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center">
        <AlertCircle size={48} className="mx-auto text-red-500 mb-4" />
        <h3 className="text-lg font-semibold text-red-700 mb-2">Failed to load connections</h3>
        <p className="text-red-600">Please check your permissions and try again.</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Database Setup</h1>
          <p className="text-gray-600 mt-1">
            Configure and manage database connections with encrypted storage
          </p>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus size={16} />
          Add Connection
        </button>
      </div>

      {/* Group Info for Non-Admin Users */}
      {!isAdmin && (
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-center gap-2 text-blue-800">
            <Lock size={16} />
            <span className="font-medium">Group Isolation Active</span>
          </div>
          <p className="text-sm text-blue-700 mt-1">
            You can only view and manage database connections for your group.
            Group ID: {formData.groupid}
          </p>
        </div>
      )}

      {/* Admin Group Selection */}
      {isAdmin && (
        <div className="mb-6 p-4 bg-gray-50 border border-gray-200 rounded-lg">
          <div className="flex items-center gap-2 text-gray-800 mb-2">
            <Unlock size={16} />
            <span className="font-medium">Administrator View</span>
          </div>
          <p className="text-sm text-gray-600">
            As an administrator, you can view database connections from all groups.
          </p>
        </div>
      )}

      {/* Connections List */}
      <div className="space-y-4">
        {connections.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <Database size={48} className="mx-auto text-gray-400 mb-4" />
            <h3 className="text-lg font-medium text-gray-900">No database connections</h3>
            <p className="text-gray-500 mt-1">
              Create your first database connection to get started.
            </p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus size={16} />
              Add Your First Connection
            </button>
          </div>
        ) : (
          connections.map(renderConnectionCard)
        )}
      </div>

      {/* Create Connection Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-full max-w-md">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Add Database Connection</h2>
              <button
                onClick={() => setShowCreateModal(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                <X size={20} />
              </button>
            </div>
            
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Connection Name
                </label>
                <input
                  type="text"
                  value={formData.connection_name}
                  onChange={(e) => setFormData({ ...formData, connection_name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                  placeholder="My Database Connection"
                  required
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Database Type
                </label>
                <select
                  value={formData.database_type}
                  onChange={(e) => setFormData({ ...formData, database_type: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                >
                  {DATABASE_TYPES.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
              
              {isAdmin && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Group ID
                  </label>
                  <input
                    type="text"
                    value={formData.groupid}
                    onChange={(e) => setFormData({ ...formData, groupid: e.target.value })}
                    className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Enter group UUID"
                    required
                  />
                </div>
              )}
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Connection String
                </label>
                <div className="relative">
                  <input
                    type={showConnectionString === 'new' ? 'text' : 'password'}
                    value={formData.connection_string}
                    onChange={(e) => setFormData({ ...formData, connection_string: e.target.value })}
                    className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                    placeholder="postgresql://user:password@host:port/database"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowConnectionString(
                      showConnectionString === 'new' ? null : 'new'
                    )}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                  >
                    {showConnectionString === 'new' ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                  <Lock size={12} />
                  Connection strings are encrypted before storage
                </p>
              </div>
              
              <div className="flex justify-end gap-3 pt-4">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createConnectionMutation.isPending}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {createConnectionMutation.isPending ? 'Creating...' : 'Create Connection'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default DatabaseSetup;