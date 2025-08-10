import React, { useState, useEffect } from 'react';
import { AlertCircle, CheckCircle2, Loader2, Plus, Trash2, Database, X } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '../../../../stores/authStore';

interface DataSourceConfig {
  id?: string;
  workspace_id: string;
  source_type: 'postgresql' | 'mssql' | 'api';
  connection_string: string;
  api_key?: string;
  headers?: Record<string, string>;
  priority: number;
  is_active: boolean;
  created_at?: string;
  updated_at?: string;
}

interface DataSourceConfigDialogProps {
  isOpen: boolean;
  onClose: () => void;
  workspaceId: string;
}

export function DataSourceConfigDialog({
  isOpen,
  onClose,
  workspaceId,
}: DataSourceConfigDialogProps) {
  const token = localStorage.getItem('accessToken');
  const [dataSources, setDataSources] = useState<DataSourceConfig[]>([]);
  const [selectedSource, setSelectedSource] = useState<DataSourceConfig | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<{
    success: boolean;
    message: string;
  } | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [headerKey, setHeaderKey] = useState('');
  const [headerValue, setHeaderValue] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchDataSources();
    }
  }, [isOpen, workspaceId]);

  const fetchDataSources = async () => {
    try {
      setIsLoading(true);
      const response = await axios.get(
        `/v1/personal-test/process-flow/data-sources`,
        {
          params: { workspace_id: workspaceId },
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setDataSources(response.data);
    } catch (error) {
      console.error('Failed to fetch data sources:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedSource) return;

    try {
      setIsLoading(true);
      
      // Enhanced validation to prevent default/empty data sources
      const connectionString = selectedSource.connection_string?.trim();
      
      // Check for invalid connection strings
      if (!connectionString || 
          connectionString === 'default' || 
          connectionString === '' ||
          connectionString.length < 10) {
        alert('❌ 기본 데이터베이스 설정으로는 저장할 수 없습니다.\n\n올바른 데이터베이스 연결 문자열을 입력해주세요.\n예: Server=yourserver;Database=yourdb;User=username;Password=password;');
        return;
      }
      
      // Check for valid source type
      if (!selectedSource.source_type) {
        alert('❌ 올바른 데이터 소스 타입을 선택해주세요.\n\n지원되는 타입: MSSQL, PostgreSQL, API');
        return;
      }
      
      // Additional validation for MSSQL
      if (selectedSource.source_type === 'mssql') {
        if (!connectionString.toLowerCase().includes('server=') && 
            !connectionString.toLowerCase().includes('data source=')) {
          alert('❌ MSSQL 연결 문자열이 올바르지 않습니다.\n\n올바른 형식:\nServer=서버주소;Database=데이터베이스명;User=사용자명;Password=비밀번호;');
          return;
        }
      }
      
      // Additional validation for PostgreSQL
      if (selectedSource.source_type === 'postgresql') {
        if (!connectionString.toLowerCase().includes('host=') && 
            !connectionString.toLowerCase().includes('postgresql://')) {
          alert('❌ PostgreSQL 연결 문자열이 올바르지 않습니다.\n\n올바른 형식:\nHost=호스트;Database=데이터베이스명;Username=사용자명;Password=비밀번호;\n또는\npostgresql://username:password@host:port/database');
          return;
        }
      }
      
      // Additional validation for API
      if (selectedSource.source_type === 'api') {
        if (!connectionString.toLowerCase().startsWith('http://') && 
            !connectionString.toLowerCase().startsWith('https://')) {
          alert('❌ API 연결 문자열이 올바르지 않습니다.\n\n올바른 형식:\nhttps://api.example.com/endpoint');
          return;
        }
      }
      
      const config = {
        ...selectedSource,
        workspace_id: workspaceId,
        connection_string: connectionString,
      };

      if (selectedSource.id) {
        await axios.put(
          `/v1/personal-test/process-flow/data-sources/${selectedSource.id}`,
          config,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      } else {
        await axios.post(
          `/v1/personal-test/process-flow/data-sources`,
          config,
          { headers: { Authorization: `Bearer ${token}` } }
        );
      }

      await fetchDataSources();
      setSelectedSource(null);
      setIsEditing(false);
      
      // Success message
      alert('✅ 데이터 소스가 성공적으로 저장되었습니다!');
      
    } catch (error) {
      console.error('Failed to save data source:', error);
      alert('❌ 데이터 소스 저장에 실패했습니다.\n\n연결 문자열과 설정을 다시 확인해주세요.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      setIsLoading(true);
      await axios.delete(
        `/v1/personal-test/process-flow/data-sources/${id}`,
        {
          params: { workspace_id: workspaceId },
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      await fetchDataSources();
      if (selectedSource?.id === id) {
        setSelectedSource(null);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to delete data source:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleTest = async () => {
    if (!selectedSource?.id) return;

    try {
      setIsTesting(true);
      setTestResult(null);
      
      const response = await axios.post(
        `/v1/personal-test/process-flow/data-sources/${selectedSource.id}/test`,
        {},
        { headers: { Authorization: `Bearer ${token}` } }
      );
      
      setTestResult(response.data);
    } catch (error) {
      setTestResult({
        success: false,
        message: 'Connection test failed',
      });
    } finally {
      setIsTesting(false);
    }
  };

  const handleAddHeader = () => {
    if (!headerKey || !headerValue || !selectedSource) return;
    
    setSelectedSource({
      ...selectedSource,
      headers: {
        ...selectedSource.headers,
        [headerKey]: headerValue,
      },
    });
    setHeaderKey('');
    setHeaderValue('');
  };

  const handleRemoveHeader = (key: string) => {
    if (!selectedSource?.headers) return;
    
    const newHeaders = { ...selectedSource.headers };
    delete newHeaders[key];
    
    setSelectedSource({
      ...selectedSource,
      headers: newHeaders,
    });
  };

  const getConnectionStringPlaceholder = (sourceType: string) => {
    switch (sourceType) {
      case 'postgresql':
        return 'postgresql://user:password@host:port/database';
      case 'mssql':
        return 'DRIVER={ODBC Driver 17 for SQL Server};SERVER=host;DATABASE=db;UID=user;PWD=password';
      case 'api':
        return 'https://api.example.com';
      default:
        return '';
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Data Source Configuration</h2>
            <p className="text-sm text-gray-500 mt-1">
              Configure data sources for equipment and measurement data
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-4 flex-1 overflow-hidden p-6">
          {/* Data Sources List */}
          <div className="w-1/3 border-r pr-4 overflow-y-auto">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-semibold">Data Sources</h3>
              <button
                className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center"
                onClick={() => {
                  setSelectedSource({
                    workspace_id: workspaceId,
                    source_type: 'postgresql',
                    connection_string: '',
                    priority: 0,
                    is_active: true,
                  });
                  setIsEditing(true);
                }}
              >
                <Plus className="h-4 w-4 mr-1" />
                Add
              </button>
            </div>

            {isLoading ? (
              <div className="flex justify-center py-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : (
              <div className="space-y-2">
                {dataSources.map((source) => (
                  <div
                    key={source.id}
                    className={`p-3 border rounded cursor-pointer ${
                      selectedSource?.id === source.id
                        ? 'border-primary bg-primary/5'
                        : 'hover:bg-gray-50'
                    }`}
                    onClick={() => {
                      setSelectedSource(source);
                      setIsEditing(false);
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span className="font-medium">{source.source_type}</span>
                      {source.is_active && (
                        <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                          Active
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-500 mt-1">
                      Priority: {source.priority}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Configuration Form */}
          <div className="flex-1 overflow-y-auto">
            {selectedSource ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Configuration</h3>
                  <div className="flex gap-2">
                    {!isEditing && selectedSource.id && (
                      <>
                        <button
                          className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                          onClick={() => setIsEditing(true)}
                        >
                          Edit
                        </button>
                        <button
                          className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-sm flex items-center"
                          onClick={handleTest}
                          disabled={isTesting}
                        >
                          {isTesting ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Test Connection'
                          )}
                        </button>
                        <button
                          className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          onClick={() => handleDelete(selectedSource.id!)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </>
                    )}
                    {isEditing && (
                      <>
                        <button
                          className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                          onClick={() => {
                            setSelectedSource(null);
                            setIsEditing(false);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm"
                          onClick={handleSave}
                        >
                          Save
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {testResult && (
                  <div
                    className={`p-3 rounded flex items-start gap-2 ${
                      testResult.success
                        ? 'bg-green-50 border border-green-500'
                        : 'bg-red-50 border border-red-500'
                    }`}
                  >
                    {testResult.success ? (
                      <CheckCircle2 className="h-4 w-4 text-green-500 mt-0.5" />
                    ) : (
                      <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
                    )}
                    <p className="text-sm">{testResult.message}</p>
                  </div>
                )}

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Source Type
                    </label>
                    <select
                      value={selectedSource.source_type}
                      onChange={(e) =>
                        setSelectedSource({
                          ...selectedSource,
                          source_type: e.target.value as any,
                        })
                      }
                      disabled={!isEditing}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    >
                      <option value="postgresql">PostgreSQL</option>
                      <option value="mssql">MS SQL Server</option>
                      <option value="api">REST API</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      {selectedSource.source_type === 'api'
                        ? 'Base URL'
                        : 'Connection String'}
                    </label>
                    <textarea
                      value={selectedSource.connection_string}
                      onChange={(e) =>
                        setSelectedSource({
                          ...selectedSource,
                          connection_string: e.target.value,
                        })
                      }
                      placeholder={getConnectionStringPlaceholder(
                        selectedSource.source_type
                      )}
                      disabled={!isEditing}
                      rows={3}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>

                  {selectedSource.source_type === 'api' && (
                    <>
                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          API Key (Optional)
                        </label>
                        <input
                          type="password"
                          value={selectedSource.api_key || ''}
                          onChange={(e) =>
                            setSelectedSource({
                              ...selectedSource,
                              api_key: e.target.value,
                            })
                          }
                          disabled={!isEditing}
                          className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-gray-700 mb-1">
                          Headers (Optional)
                        </label>
                        {isEditing && (
                          <div className="flex gap-2 mt-2">
                            <input
                              placeholder="Header name"
                              value={headerKey}
                              onChange={(e) => setHeaderKey(e.target.value)}
                              className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <input
                              placeholder="Header value"
                              value={headerValue}
                              onChange={(e) => setHeaderValue(e.target.value)}
                              className="flex-1 p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            />
                            <button
                              onClick={handleAddHeader}
                              disabled={!headerKey || !headerValue}
                              className="px-3 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
                            >
                              Add
                            </button>
                          </div>
                        )}
                        {selectedSource.headers &&
                          Object.entries(selectedSource.headers).length > 0 && (
                            <div className="mt-2 space-y-1">
                              {Object.entries(selectedSource.headers).map(
                                ([key, value]) => (
                                  <div
                                    key={key}
                                    className="flex items-center justify-between p-2 bg-gray-50 rounded"
                                  >
                                    <span className="text-sm">
                                      <strong>{key}:</strong> {value}
                                    </span>
                                    {isEditing && (
                                      <button
                                        onClick={() => handleRemoveHeader(key)}
                                        className="p-1 hover:bg-gray-200 rounded"
                                      >
                                        <Trash2 className="h-3 w-3 text-gray-500" />
                                      </button>
                                    )}
                                  </div>
                                )
                              )}
                            </div>
                          )}
                      </div>
                    </>
                  )}

                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Priority
                      </label>
                      <input
                        type="number"
                        value={selectedSource.priority}
                        onChange={(e) =>
                          setSelectedSource({
                            ...selectedSource,
                            priority: parseInt(e.target.value) || 0,
                          })
                        }
                        disabled={!isEditing}
                        min="0"
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center cursor-pointer">
                        <input
                          type="checkbox"
                          checked={selectedSource.is_active}
                          onChange={(e) =>
                            setSelectedSource({
                              ...selectedSource,
                              is_active: e.target.checked,
                            })
                          }
                          disabled={!isEditing}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 disabled:cursor-not-allowed"
                        />
                        <span className="ml-2 text-sm font-medium text-gray-700">
                          Active
                        </span>
                      </label>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a data source or add a new one
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}