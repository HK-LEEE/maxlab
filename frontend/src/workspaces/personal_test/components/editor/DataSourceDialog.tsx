import React, { useState, useEffect } from 'react';
import { X, Database, Plus, Edit2, Trash2, Check, ArrowRight, Code } from 'lucide-react';
import { apiClient } from '../../../../api/client';
import { FieldMappingDialog } from './FieldMappingDialog';
import { QueryEditor } from './QueryEditor';

interface DataSource {
  id: string;
  workspace_id: string;
  source_type: string;
  connection_string: string;
  api_key?: string;
  headers?: Record<string, string>;
  custom_queries?: Record<string, { query: string; description?: string }>;
  priority: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DataSourceDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export const DataSourceDialog: React.FC<DataSourceDialogProps> = ({
  isOpen,
  onClose,
  workspaceId,
}) => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingSource, setEditingSource] = useState<DataSource | null>(null);
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [fieldDialogSource, setFieldDialogSource] = useState<{ id: string; type: string } | null>(null);
  
  // Form state
  const [formData, setFormData] = useState({
    source_type: 'postgresql',
    connection_string: '',
    api_key: '',
    headers: '',
    custom_queries: {
      equipment_status: { query: '', description: '' },
      measurement_data: { query: '', description: '' }
    },
    is_active: true,
  });
  
  const [activeTab, setActiveTab] = useState<'config' | 'queries'>('config');
  const [queryErrors, setQueryErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (isOpen) {
      loadDataSources();
    }
  }, [isOpen, workspaceId]);

  const loadDataSources = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get(
        `/api/v1/personal-test/process-flow/data-sources?workspace_id=${workspaceId}`
      );
      setDataSources(response.data);
    } catch (error) {
      console.error('Failed to load data sources:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddNew = () => {
    setIsAddingNew(true);
    setEditingSource(null);
    setFormData({
      source_type: 'postgresql',
      connection_string: '',
      api_key: '',
      headers: '',
      custom_queries: {
        equipment_status: { query: '', description: '' },
        measurement_data: { query: '', description: '' }
      },
      is_active: true,
    });
    setActiveTab('config');
  };

  const handleEdit = (source: DataSource) => {
    setEditingSource(source);
    setIsAddingNew(false);
    // Connection string and API key are not returned from backend for security
    // User must re-enter them when editing
    setFormData({
      source_type: source.source_type,
      connection_string: '',  // Empty - user must re-enter
      api_key: '',  // Empty - user must re-enter
      headers: source.headers ? JSON.stringify(source.headers, null, 2) : '',
      custom_queries: source.custom_queries || {
        equipment_status: { query: '', description: '' },
        measurement_data: { query: '', description: '' }
      },
      is_active: source.is_active,
    });
    setActiveTab('config');
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this data source?')) {
      return;
    }

    try {
      await apiClient.delete(`/api/v1/personal-test/process-flow/data-sources/${id}`, {
        params: { workspace_id: workspaceId }
      });
      await loadDataSources();
    } catch (error: any) {
      console.error('Failed to delete data source:', error);
      console.error('Error response:', error.response?.data);
      const errorMessage = error.response?.data?.detail || error.response?.data?.message || 'Failed to delete data source';
      alert(errorMessage);
    }
  };

  const handleSave = async () => {
    try {
      const payload = {
        workspace_id: workspaceId,
        source_type: formData.source_type,
        connection_string: formData.connection_string,
        api_key: formData.api_key || undefined,
        headers: formData.headers ? JSON.parse(formData.headers) : undefined,
        custom_queries: formData.custom_queries,
        priority: 0,
        is_active: formData.is_active,
      };

      if (editingSource) {
        await apiClient.put(
          `/api/v1/personal-test/process-flow/data-sources/${editingSource.id}`,
          payload
        );
      } else {
        await apiClient.post(
          '/api/v1/personal-test/process-flow/data-sources',
          payload
        );
      }

      await loadDataSources();
      setIsAddingNew(false);
      setEditingSource(null);
    } catch (error) {
      console.error('Failed to save data source:', error);
      alert('Failed to save data source');
    }
  };

  const handleTestConnection = async (source: DataSource) => {
    try {
      const response = await apiClient.post(
        `/api/v1/personal-test/process-flow/data-sources/${source.id}/test`
      );
      alert(`Connection test ${response.data.success ? 'successful' : 'failed'}: ${response.data.message}`);
    } catch (error) {
      console.error('Connection test failed:', error);
      alert('Connection test failed');
    }
  };

  const handleExecuteQuery = async (queryType: string) => {
    if (!editingSource) return;
    
    try {
      const response = await apiClient.post(
        `/api/v1/personal-test/process-flow/data-sources/${editingSource.id}/execute-query`,
        {
          query_type: queryType,
          custom_query: formData.custom_queries[queryType]?.query,
          limit: 10
        }
      );
      
      if (response.data.error) {
        setQueryErrors({ ...queryErrors, [queryType]: response.data.error });
      } else {
        setQueryErrors({ ...queryErrors, [queryType]: '' });
        alert(`Query executed successfully!\nColumns: ${response.data.columns.join(', ')}\nRows returned: ${response.data.row_count}`);
      }
    } catch (error: any) {
      const errorMessage = error.response?.data?.detail || error.message || 'Failed to execute query';
      setQueryErrors({ ...queryErrors, [queryType]: errorMessage });
    }
  };

  const getSourceTypeIcon = (type: string) => {
    switch (type.toLowerCase()) {
      case 'postgresql':
        return '🐘';
      case 'mssql':
        return '🗄️';
      case 'api':
        return '🌐';
      default:
        return '📊';
    }
  };

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-2">
              <Database size={24} />
              <h2 className="text-xl font-semibold">Data Sources</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 rounded-lg"
            >
              <X size={20} />
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-auto p-4">
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading...</div>
            ) : (
              <div className="space-y-4">
                {/* Add New Button */}
                {!isAddingNew && !editingSource && (
                  <button
                    onClick={handleAddNew}
                    className="w-full p-4 border-2 border-dashed border-gray-300 rounded-lg hover:border-gray-400 flex items-center justify-center space-x-2 text-gray-600 hover:text-gray-800"
                  >
                    <Plus size={20} />
                    <span>Add New Data Source</span>
                  </button>
                )}

                {/* Form */}
                {(isAddingNew || editingSource) && (
                  <div className="bg-gray-50 rounded-lg">
                    {/* Tabs */}
                    <div className="flex border-b">
                      <button
                        type="button"
                        onClick={() => setActiveTab('config')}
                        className={`px-4 py-2 font-medium transition-colors ${
                          activeTab === 'config'
                            ? 'border-b-2 border-black text-black'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Configuration
                      </button>
                      {editingSource && formData.source_type !== 'api' && (
                        <button
                          type="button"
                          onClick={() => setActiveTab('queries')}
                          className={`px-4 py-2 font-medium transition-colors ${
                            activeTab === 'queries'
                              ? 'border-b-2 border-black text-black'
                              : 'text-gray-500 hover:text-gray-700'
                          }`}
                        >
                          Custom Queries
                        </button>
                      )}
                    </div>
                    
                    <div className="p-4 space-y-4">
                      {activeTab === 'config' ? (
                        <>
                          {editingSource && (
                            <div className="bg-yellow-50 border border-yellow-200 p-3 rounded-md text-sm text-yellow-800">
                              <strong>Note:</strong> For security reasons, connection strings and API keys are not displayed. 
                              Please re-enter them to update the configuration.
                            </div>
                          )}
                          <div>
                            <label className="block text-sm font-medium mb-1">Source Type</label>
                            <select
                              value={formData.source_type}
                              onChange={(e) => setFormData({ ...formData, source_type: e.target.value })}
                              className="w-full px-3 py-2 border rounded-lg"
                            >
                              <option value="postgresql">PostgreSQL</option>
                              <option value="mssql">Microsoft SQL Server</option>
                              <option value="api">REST API</option>
                            </select>
                          </div>

                    <div>
                      <label className="block text-sm font-medium mb-1">
                        {formData.source_type === 'api' ? 'Base URL' : 'Connection String'}
                      </label>
                      <input
                        type="text"
                        value={formData.connection_string}
                        onChange={(e) => setFormData({ ...formData, connection_string: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                        placeholder={
                          formData.source_type === 'postgresql'
                            ? 'postgresql://user:password@host:5432/database'
                            : formData.source_type === 'mssql'
                            ? 'Server=host;Database=db;User Id=user;Password=pass;'
                            : 'https://api.example.com/v1'
                        }
                      />
                    </div>

                    {formData.source_type === 'api' && (
                      <>
                        <div>
                          <label className="block text-sm font-medium mb-1">API Key (Optional)</label>
                          <input
                            type="text"
                            value={formData.api_key}
                            onChange={(e) => setFormData({ ...formData, api_key: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg"
                            placeholder="your-api-key"
                          />
                        </div>

                        <div>
                          <label className="block text-sm font-medium mb-1">Headers (JSON, Optional)</label>
                          <textarea
                            value={formData.headers}
                            onChange={(e) => setFormData({ ...formData, headers: e.target.value })}
                            className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                            rows={3}
                            placeholder='{"Authorization": "Bearer token"}'
                          />
                        </div>
                      </>
                    )}

                          <div className="flex items-center space-x-2">
                            <input
                              type="checkbox"
                              id="is_active"
                              checked={formData.is_active}
                              onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                              className="rounded"
                            />
                            <label htmlFor="is_active" className="text-sm">Active</label>
                          </div>
                        </>
                      ) : (
                        // Custom Queries Tab
                        <div className="space-y-6">
                          <div className="text-sm text-gray-600 mb-4">
                            Define custom SQL queries for each data type. These queries will be used instead of the default queries when fetching data.
                          </div>
                          
                          {/* Equipment Status Query */}
                          <div>
                            <h4 className="font-medium mb-2">Equipment Status Query</h4>
                            <QueryEditor
                              value={formData.custom_queries.equipment_status.query}
                              onChange={(value) => setFormData({
                                ...formData,
                                custom_queries: {
                                  ...formData.custom_queries,
                                  equipment_status: { ...formData.custom_queries.equipment_status, query: value }
                                }
                              })}
                              onExecute={() => handleExecuteQuery('equipment_status')}
                              placeholder="SELECT equipment_code, equipment_name, status FROM ..."
                              error={queryErrors.equipment_status}
                            />
                          </div>
                          
                          {/* Measurement Data Query */}
                          <div>
                            <h4 className="font-medium mb-2">Measurement Data Query</h4>
                            <QueryEditor
                              value={formData.custom_queries.measurement_data.query}
                              onChange={(value) => setFormData({
                                ...formData,
                                custom_queries: {
                                  ...formData.custom_queries,
                                  measurement_data: { ...formData.custom_queries.measurement_data, query: value }
                                }
                              })}
                              onExecute={() => handleExecuteQuery('measurement_data')}
                              placeholder="SELECT equipment_code, measurement_code, measurement_value FROM ..."
                              error={queryErrors.measurement_data}
                            />
                          </div>
                        </div>
                      )}
                      
                      <div className="flex justify-end space-x-2 pt-4 border-t">
                        <button
                          onClick={() => {
                            setIsAddingNew(false);
                            setEditingSource(null);
                          }}
                          className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSave}
                          className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
                        >
                          Save
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Data Source List */}
                {dataSources.map((source) => (
                  <div
                    key={source.id}
                    className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center space-x-2">
                          <span className="text-2xl">{getSourceTypeIcon(source.source_type)}</span>
                          <div>
                            <h3 className="font-semibold">
                              {source.source_type.toUpperCase()}
                              {source.is_active && (
                                <span className="ml-2 text-xs bg-green-100 text-green-800 px-2 py-1 rounded">
                                  Active
                                </span>
                              )}
                            </h3>
                            <p className="text-sm text-gray-600 font-mono truncate max-w-md">
                              {source.connection_string}
                            </p>
                          </div>
                        </div>
                        <div className="mt-2 text-xs text-gray-500">
                          Created: {new Date(source.created_at).toLocaleDateString()}
                        </div>
                      </div>
                      <div className="flex items-center space-x-1">
                        <button
                          onClick={() => handleTestConnection(source)}
                          className="p-2 hover:bg-gray-100 rounded"
                          title="Test Connection"
                        >
                          <Check size={16} />
                        </button>
                        <button
                          onClick={() => setFieldDialogSource({
                            id: source.id,
                            type: source.source_type.toLowerCase()
                          })}
                          className="p-2 hover:bg-gray-100 rounded"
                          title="Field Mappings"
                        >
                          <ArrowRight size={16} />
                        </button>
                        <button
                          onClick={() => handleEdit(source)}
                          className="p-2 hover:bg-gray-100 rounded"
                          title="Edit"
                        >
                          <Edit2 size={16} />
                        </button>
                        <button
                          onClick={() => handleDelete(source.id)}
                          className="p-2 hover:bg-gray-100 rounded text-red-500"
                          title="Delete"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Mapping Dialog */}

      {/* Field Mapping Dialog */}
      {fieldDialogSource && (
        <FieldMappingDialog
          isOpen={true}
          onClose={() => setFieldDialogSource(null)}
          dataSourceId={fieldDialogSource.id}
          sourceType={fieldDialogSource.type as 'postgresql' | 'mssql' | 'api'}
        />
      )}
    </>
  );
};