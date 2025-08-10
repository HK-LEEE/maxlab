import React, { useState, useEffect } from 'react';
import { X, FileText, Calendar, Clock, Globe, RotateCcw, Check, ChevronRight, User, Upload, Download, FolderOpen, History } from 'lucide-react';
import { apiClient } from '../../../../api/client';
import { toast } from 'react-hot-toast';
import { FlowScopeBadge } from '../common/FlowScopeIndicator';

// 로컬 타입 정의 (import 이슈 해결용)  
type ScopeType = 'WORKSPACE' | 'USER';
type VisibilityScope = 'WORKSPACE' | 'PRIVATE';

interface ProcessFlow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  is_published?: boolean;
  published_at?: string;
  publish_token?: string;
  current_version?: number;
  created_by?: string;
  scope_type?: ScopeType;
  visibility_scope?: VisibilityScope;
  shared_with_workspace?: boolean;
  workspace_id?: string;
  flow_data?: any;
  _isImported?: boolean;
}

interface FlowVersion {
  id: string;
  flow_id: string;
  version_number: number;
  name: string;
  description?: string;
  flow_data: any;
  created_by: string;
  created_at: string;
  is_published: boolean;
  published_at?: string;
  publish_token?: string;
}

interface LoadFlowDialogProps {
  isOpen: boolean;
  flows: ProcessFlow[];
  currentFlowId?: string;
  onClose: () => void;
  onLoad: (flow: ProcessFlow, version?: FlowVersion) => void;
  onPublish?: (flowId: string, versionId: string) => void;
  onDelete?: (flowId: string) => void;
}

type TabType = 'saved' | 'versions' | 'import';

export const LoadFlowDialog: React.FC<LoadFlowDialogProps> = ({
  isOpen,
  flows,
  currentFlowId,
  onClose,
  onLoad,
  onPublish,
  onDelete,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('saved');
  const [selectedFlow, setSelectedFlow] = useState<ProcessFlow | null>(null);
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<any>(null);
  const [importFlowName, setImportFlowName] = useState<string>('');

  useEffect(() => {
    if (selectedFlow && activeTab === 'versions') {
      loadVersions(selectedFlow.id);
    }
  }, [selectedFlow, activeTab]);

  // Reload flows when dialog opens
  useEffect(() => {
    if (isOpen && flows.length > 0) {
      // If a flow is selected, refresh its version list
      if (selectedFlow && activeTab === 'versions') {
        loadVersions(selectedFlow.id);
      }
    }
  }, [isOpen]);

  const loadVersions = async (flowId: string) => {
    setLoadingVersions(true);
    try {
      const response = await apiClient.get(`/v1/personal-test/process-flow/flows/${flowId}/versions`);
      setVersions(response.data.versions);
      setCurrentVersion(response.data.current_version);
    } catch (error: any) {
      console.error('Failed to load versions:', error);
      // If version table doesn't exist yet, create a fake version 1
      if (error.response?.status === 500 || error.response?.status === 503) {
        const flow = flows.find(f => f.id === flowId);
        if (flow) {
          setVersions([{
            id: flowId,
            flow_id: flowId,
            version_number: 1,
            name: flow.name + ' - Version 1',
            description: 'Initial version (Version management not available)',
            flow_data: {},
            created_by: flow.created_by || 'unknown',
            created_at: flow.created_at,
            is_published: flow.is_published || false,
            published_at: flow.published_at,
            publish_token: flow.publish_token,
          }]);
          setCurrentVersion(1);
        }
      } else {
        setVersions([]);
      }
    }
    setLoadingVersions(false);
  };

  const handleFlowSelect = (flow: ProcessFlow) => {
    setSelectedFlow(flow);
    if (activeTab === 'saved') {
      // For saved flows tab, load immediately
      onLoad(flow);
      onClose();
    }
  };

  const handleVersionRestore = async (version: FlowVersion) => {
    try {
      const response = await apiClient.put(`/v1/personal-test/process-flow/flows/${version.flow_id}/versions/${version.id}/restore`);
      // Load the flow with the restored data from server
      onLoad(response.data, version);
      onClose();
    } catch (error) {
      console.error('Failed to restore version:', error);
      toast.error('Failed to restore version');
    }
  };

  const handleVersionPublish = async (version: FlowVersion) => {
    if (onPublish) {
      try {
        await apiClient.put(`/v1/personal-test/process-flow/flows/${version.flow_id}/versions/${version.id}/publish`);
        onPublish(version.flow_id, version.id);
        // Reload versions to update publish status
        loadVersions(version.flow_id);
      } catch (error) {
        console.error('Failed to publish version:', error);
        toast.error('Failed to publish version');
      }
    }
  };

  const handleDelete = (flowId: string) => {
    if (onDelete) {
      onDelete(flowId);
      setConfirmDelete(null);
      if (selectedFlow?.id === flowId) {
        setSelectedFlow(null);
        setVersions([]);
      }
    }
  };

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setImportFile(file);
      // Read and preview the file
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const content = JSON.parse(e.target?.result as string);
          setImportPreview(content);
          // Set default flow name from the imported content or file name
          const defaultName = content.name || file.name.replace('.json', '') || 'Imported Flow';
          setImportFlowName(defaultName);
        } catch (error) {
          toast.error('Invalid JSON file');
          setImportFile(null);
          setImportPreview(null);
          setImportFlowName('');
        }
      };
      reader.readAsText(file);
    }
  };

  const handleImport = () => {
    if (!importPreview) {
      toast.error('No file selected');
      return;
    }
    
    // Generate a proper UUID for the imported flow
    const importId = crypto.randomUUID();
    
    // Use original flow name or file name as default (will be changeable when saving)
    const defaultName = importPreview.name || importFile?.name?.replace('.json', '') || 'Imported Flow';
    
    // Create a temporary flow object for import
    const tempFlow: ProcessFlow = {
      id: importId,
      workspace_id: '', // Will be set by saveFlow logic
      name: defaultName, // Use default name, user can change when saving
      flow_data: { nodes: [], edges: [] }, // Placeholder, actual data in version
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      // Default scope settings for imported flows
      scope_type: 'USER',
      visibility_scope: 'PRIVATE',
      shared_with_workspace: false,
      // Mark as imported flow so saveFlow logic can handle it correctly
      _isImported: true,
    };
    onLoad(tempFlow, {
      id: importId,
      flow_id: importId,
      version_number: 1,
      name: tempFlow.name,
      flow_data: importPreview.flow_data || importPreview,
      created_by: 'import',
      created_at: tempFlow.created_at,
      is_published: false,
    });
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[900px] max-h-[80vh] flex flex-col">
        {/* Header with tabs */}
        <div className="border-b">
          <div className="flex items-center justify-between p-4">
            <h2 className="text-lg font-semibold">Load Flow</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>
          <div className="flex px-4">
            <button
              onClick={() => setActiveTab('saved')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'saved'
                  ? 'text-black border-black'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <div className="flex items-center space-x-2">
                <FolderOpen size={16} />
                <span>Saved Flows</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('versions')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'versions'
                  ? 'text-black border-black'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <div className="flex items-center space-x-2">
                <History size={16} />
                <span>Versions</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('import')}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === 'import'
                  ? 'text-black border-black'
                  : 'text-gray-500 border-transparent hover:text-gray-700'
              }`}
            >
              <div className="flex items-center space-x-2">
                <Upload size={16} />
                <span>Import File</span>
              </div>
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {activeTab === 'saved' && (
            <div className="p-4 overflow-y-auto h-full">
              <div className="mb-4">
                <h3 className="font-medium text-sm text-gray-600">Select a flow to load</h3>
              </div>
              {flows.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No saved flows found</p>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  {flows.map((flow) => (
                    <div
                      key={flow.id}
                      className={`p-4 border rounded-lg cursor-pointer transition-all ${
                        flow.id === currentFlowId
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-gray-300 hover:shadow-sm'
                      }`}
                      onClick={() => handleFlowSelect(flow)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center space-x-2">
                            <FileText size={16} className="text-gray-400 flex-shrink-0" />
                            <h4 className="font-medium text-sm truncate">{flow.name}</h4>
                          </div>
                          <div className="flex items-center space-x-3 mt-2 text-xs text-gray-500">
                            <span className="flex items-center space-x-1">
                              <Calendar size={12} />
                              <span>{new Date(flow.created_at).toLocaleDateString()}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Clock size={12} />
                              <span>{new Date(flow.updated_at).toLocaleTimeString()}</span>
                            </span>
                          </div>
                          <div className="flex items-center space-x-2 mt-2">
                            <FlowScopeBadge
                              scopeType={flow.scope_type || 'USER'}
                              visibilityScope={flow.visibility_scope}
                              sharedWithWorkspace={flow.shared_with_workspace}
                            />
                            {flow.is_published && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center space-x-1">
                                <Globe size={12} />
                                <span>Published</span>
                              </span>
                            )}
                            {flow.current_version && flow.current_version > 1 && (
                              <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded">
                                v{flow.current_version}
                              </span>
                            )}
                          </div>
                        </div>
                        {flow.id === currentFlowId && (
                          <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded ml-2 flex-shrink-0">
                            Current
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {activeTab === 'versions' && (
            <div className="flex h-full">
              {/* Flow List */}
              <div className="w-1/3 border-r overflow-y-auto">
                <div className="p-4">
                  <h3 className="font-medium text-sm text-gray-600">Select a flow</h3>
                </div>
                <div className="px-2 pb-2">
                  {flows.length === 0 ? (
                    <p className="text-gray-500 text-center py-8 text-sm">No saved flows found</p>
                  ) : (
                    <div className="space-y-1">
                      {flows.map((flow) => (
                        <div
                          key={flow.id}
                          className={`p-3 rounded cursor-pointer transition-colors ${
                            selectedFlow?.id === flow.id
                              ? 'bg-blue-50 border border-blue-200'
                              : 'hover:bg-gray-50'
                          } ${flow.id === currentFlowId ? 'border-l-4 border-l-blue-500' : ''}`}
                          onClick={() => setSelectedFlow(flow)}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1 min-w-0">
                              <h4 className="font-medium text-sm truncate">{flow.name}</h4>
                              <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                                <span>v{flow.current_version || 1}</span>
                                {flow.is_published && (
                                  <Globe size={12} className="text-green-600" />
                                )}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Version List */}
              <div className="flex-1 overflow-y-auto p-4">
                {selectedFlow ? (
                  <>
                    <div className="mb-4">
                      <h3 className="font-medium">{selectedFlow.name}</h3>
                      <p className="text-sm text-gray-500">Current version: {currentVersion}</p>
                    </div>

                    {loadingVersions ? (
                      <div className="text-center py-8">
                        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                      </div>
                    ) : versions.length === 0 ? (
                      <p className="text-gray-500 text-center py-8">No versions found</p>
                    ) : (
                      <div className="space-y-2">
                        {versions.map((version) => (
                          <div
                            key={version.id}
                            className={`p-4 border rounded-lg ${
                              version.version_number === currentVersion
                                ? 'border-blue-500 bg-blue-50'
                                : 'border-gray-200 hover:bg-gray-50'
                            }`}
                          >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center space-x-3">
                            <span className="font-medium">Version {version.version_number}</span>
                            {version.version_number === currentVersion && (
                              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">
                                Current
                              </span>
                            )}
                            {version.is_published && (
                              <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded flex items-center space-x-1">
                                <Globe size={12} />
                                <span>Published</span>
                              </span>
                            )}
                          </div>
                          <p className="text-sm font-medium mt-1">{version.name}</p>
                          {version.description && (
                            <p className="text-sm text-gray-600 mt-1">{version.description}</p>
                          )}
                          <div className="flex items-center space-x-4 mt-2 text-xs text-gray-500">
                            <span className="flex items-center space-x-1">
                              <User size={12} />
                              <span>{version.created_by}</span>
                            </span>
                            <span className="flex items-center space-x-1">
                              <Clock size={12} />
                              <span>{new Date(version.created_at).toLocaleString()}</span>
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center space-x-2 ml-4">
                          {version.version_number !== currentVersion && (
                            <button
                              onClick={() => handleVersionRestore(version)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                              title="Restore this version"
                            >
                              <RotateCcw size={16} />
                            </button>
                          )}
                          {!version.is_published && onPublish && (
                            <button
                              onClick={() => handleVersionPublish(version)}
                              className="p-2 text-gray-600 hover:bg-gray-100 rounded"
                              title="Publish this version"
                            >
                              <Globe size={16} />
                            </button>
                          )}
                          {version.version_number === currentVersion && (
                            <button
                              onClick={() => {
                                onLoad(selectedFlow, version);
                                onClose();
                              }}
                              className="px-3 py-1.5 bg-black text-white rounded hover:bg-gray-800 text-sm flex items-center space-x-1"
                            >
                              <span>Load</span>
                              <ChevronRight size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                      </div>
                    )}

                    {/* Delete Flow Button */}
                    {onDelete && selectedFlow.id !== currentFlowId && (
                      <div className="mt-6 pt-6 border-t">
                        {confirmDelete === selectedFlow.id ? (
                          <div className="flex items-center justify-between bg-red-50 p-3 rounded">
                            <span className="text-red-600 font-medium">Delete this flow and all its versions?</span>
                            <div className="flex space-x-2">
                              <button
                                onClick={() => handleDelete(selectedFlow.id)}
                                className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700"
                              >
                                Delete
                              </button>
                              <button
                                onClick={() => setConfirmDelete(null)}
                                className="px-3 py-1 text-sm bg-gray-200 text-gray-700 rounded hover:bg-gray-300"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <button
                            onClick={() => setConfirmDelete(selectedFlow.id)}
                            className="text-red-600 hover:text-red-700 text-sm"
                          >
                            Delete Flow
                          </button>
                        )}
                      </div>
                    )}
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>Select a flow to view its versions</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === 'import' && (
            <div className="p-6">
              <div className="max-w-md mx-auto">
                <div className="text-center mb-6">
                  <Upload size={48} className="mx-auto text-gray-400 mb-4" />
                  <h3 className="text-lg font-medium mb-2">Import Process Flow</h3>
                  <p className="text-sm text-gray-600">
                    Select a JSON file containing a process flow configuration
                  </p>
                </div>

                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6">
                  <input
                    type="file"
                    accept=".json"
                    onChange={handleFileSelect}
                    className="hidden"
                    id="file-input"
                  />
                  <label
                    htmlFor="file-input"
                    className="flex flex-col items-center cursor-pointer"
                  >
                    <div className="mb-3">
                      <Upload size={32} className="text-gray-400" />
                    </div>
                    <span className="text-sm text-gray-600">
                      Click to select file or drag and drop
                    </span>
                    <span className="text-xs text-gray-500 mt-1">
                      JSON files only
                    </span>
                  </label>
                </div>

                {importFile && (
                  <div className="mt-4 space-y-4">
                    <div className="p-4 bg-gray-50 rounded-lg">
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center space-x-2">
                          <FileText size={20} className="text-gray-600" />
                          <span className="text-sm font-medium">{importFile.name}</span>
                        </div>
                        <button
                          onClick={() => {
                            setImportFile(null);
                            setImportPreview(null);
                            setImportFlowName('');
                          }}
                          className="text-gray-400 hover:text-gray-600"
                        >
                          <X size={16} />
                        </button>
                      </div>
                      {importPreview && (
                        <div className="text-sm text-gray-600">
                          <p>Original name: {importPreview.name || 'Unnamed'}</p>
                          <p>Nodes: {importPreview.flow_data?.nodes?.length || importPreview.nodes?.length || 0}</p>
                          <p>Edges: {importPreview.flow_data?.edges?.length || importPreview.edges?.length || 0}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="mt-6 flex justify-center">
                  <button
                    onClick={handleImport}
                    disabled={!importPreview}
                    className="px-6 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Import Flow
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};