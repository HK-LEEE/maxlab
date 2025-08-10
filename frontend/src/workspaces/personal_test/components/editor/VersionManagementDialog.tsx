import React, { useState, useEffect } from 'react';
import { X, FileText, Calendar, Clock, Globe, RotateCcw, Check, ChevronRight, User } from 'lucide-react';
import { apiClient } from '../../../../api/client';

interface ProcessFlow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  is_published?: boolean;
  published_at?: string;
  publish_token?: string;
  current_version?: number;
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

interface VersionManagementDialogProps {
  isOpen: boolean;
  flows: ProcessFlow[];
  currentFlowId?: string;
  onClose: () => void;
  onLoad: (flow: ProcessFlow, version?: FlowVersion) => void;
  onPublish?: (flowId: string, versionId: string) => void;
  onDelete?: (flowId: string) => void;
}

export const VersionManagementDialog: React.FC<VersionManagementDialogProps> = ({
  isOpen,
  flows,
  currentFlowId,
  onClose,
  onLoad,
  onPublish,
  onDelete,
}) => {
  const [selectedFlow, setSelectedFlow] = useState<ProcessFlow | null>(null);
  const [versions, setVersions] = useState<FlowVersion[]>([]);
  const [currentVersion, setCurrentVersion] = useState<number>(1);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  useEffect(() => {
    if (selectedFlow) {
      loadVersions(selectedFlow.id);
    }
  }, [selectedFlow]);

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
            created_by: 'unknown',
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
  };

  const handleVersionRestore = async (version: FlowVersion) => {
    try {
      await apiClient.put(`/v1/personal-test/process-flow/flows/${version.flow_id}/versions/${version.id}/restore`);
      // Load the flow with restored version
      const flow = flows.find(f => f.id === version.flow_id);
      if (flow) {
        onLoad(flow, version);
      }
      onClose();
    } catch (error) {
      console.error('Failed to restore version:', error);
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

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[900px] max-h-[80vh] flex">
        {/* Flow List */}
        <div className="w-1/3 border-r overflow-y-auto">
          <div className="p-4 border-b">
            <h3 className="font-semibold">Process Flows</h3>
          </div>
          <div className="p-2">
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
                    onClick={() => handleFlowSelect(flow)}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center space-x-2">
                          <FileText size={16} className="text-gray-400 flex-shrink-0" />
                          <h4 className="font-medium text-sm truncate">{flow.name}</h4>
                        </div>
                        <div className="flex items-center space-x-3 mt-1 text-xs text-gray-500">
                          <span className="flex items-center space-x-1">
                            <Calendar size={12} />
                            <span>{new Date(flow.created_at).toLocaleDateString()}</span>
                          </span>
                          {flow.is_published && (
                            <Globe size={12} className="text-green-600" />
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
        </div>

        {/* Version List */}
        <div className="flex-1 flex flex-col">
          <div className="flex items-center justify-between p-4 border-b">
            <h2 className="text-lg font-semibold">Version Management</h2>
            <button
              onClick={onClose}
              className="text-gray-400 hover:text-gray-600"
            >
              <X size={20} />
            </button>
          </div>

          {selectedFlow ? (
            <div className="flex-1 overflow-y-auto p-4">
              <div className="mb-4">
                <h3 className="font-medium text-lg">{selectedFlow.name}</h3>
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
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-gray-500">
              <p>Select a flow to view its versions</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};