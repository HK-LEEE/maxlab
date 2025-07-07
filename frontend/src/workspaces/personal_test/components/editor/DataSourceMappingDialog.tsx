import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Save, Upload, Download } from 'lucide-react';
import { apiClient } from '../../../../api/client';

interface DataSourceMapping {
  id?: string;
  mapping_type: 'equipment' | 'measurement';
  source_code: string;
  source_name?: string;
  source_type?: string;
  target_code: string;
  target_name?: string;
  target_type?: string;
  transform_rules?: {
    scale?: number;
    offset?: number;
    unit_conversion?: string;
    decimals?: number;
  };
}

interface DataSourceMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataSourceId: string;
  dataSourceName: string;
}

export const DataSourceMappingDialog: React.FC<DataSourceMappingDialogProps> = ({
  isOpen,
  onClose,
  dataSourceId,
  dataSourceName,
}) => {
  const [mappings, setMappings] = useState<DataSourceMapping[]>([]);
  const [activeTab, setActiveTab] = useState<'equipment' | 'measurement'>('equipment');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editingMapping, setEditingMapping] = useState<DataSourceMapping | null>(null);

  useEffect(() => {
    if (isOpen) {
      loadMappings();
    }
  }, [isOpen, dataSourceId]);

  const loadMappings = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get(
        `/api/v1/personal-test/process-flow/data-sources/${dataSourceId}/mappings`
      );
      setMappings(response.data);
    } catch (error) {
      console.error('Failed to load mappings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddMapping = () => {
    setEditingMapping({
      mapping_type: activeTab,
      source_code: '',
      target_code: '',
    });
  };

  const handleSaveMapping = async () => {
    if (!editingMapping || !editingMapping.source_code || !editingMapping.target_code) {
      return;
    }

    setIsSaving(true);
    try {
      if (editingMapping.id) {
        // Update existing mapping
        // Since we don't have an update endpoint, we'll delete and recreate
        await apiClient.delete(
          `/api/v1/personal-test/process-flow/data-sources/${dataSourceId}/mappings/${editingMapping.mapping_type}/${editingMapping.source_code}`
        );
      }

      await apiClient.post(
        `/api/v1/personal-test/process-flow/data-sources/${dataSourceId}/mappings`,
        editingMapping
      );

      await loadMappings();
      setEditingMapping(null);
    } catch (error) {
      console.error('Failed to save mapping:', error);
      alert('Failed to save mapping');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteMapping = async (mapping: DataSourceMapping) => {
    if (!confirm('Are you sure you want to delete this mapping?')) {
      return;
    }

    try {
      await apiClient.delete(
        `/api/v1/personal-test/process-flow/data-sources/${dataSourceId}/mappings/${mapping.mapping_type}/${mapping.source_code}`
      );
      await loadMappings();
    } catch (error) {
      console.error('Failed to delete mapping:', error);
      alert('Failed to delete mapping');
    }
  };

  const handleExportMappings = () => {
    const exportData = mappings.filter(m => m.mapping_type === activeTab);
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataSourceName}_${activeTab}_mappings.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportMappings = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const importedMappings = JSON.parse(text);
      
      if (!Array.isArray(importedMappings)) {
        throw new Error('Invalid file format');
      }

      // Validate and filter mappings
      const validMappings = importedMappings.filter(m => 
        m.source_code && m.target_code && m.mapping_type === activeTab
      );

      if (validMappings.length === 0) {
        alert('No valid mappings found in the file');
        return;
      }

      setIsSaving(true);
      const response = await apiClient.post(
        `/api/v1/personal-test/process-flow/data-sources/${dataSourceId}/mappings/bulk`,
        validMappings
      );

      alert(`Successfully imported ${response.data.created_count} mappings`);
      await loadMappings();
    } catch (error) {
      console.error('Failed to import mappings:', error);
      alert('Failed to import mappings. Please check the file format.');
    } finally {
      setIsSaving(false);
    }
  };

  const filteredMappings = mappings.filter(m => m.mapping_type === activeTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-4xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-xl font-semibold">
            Data Source Mappings - {dataSourceName}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          <button
            onClick={() => setActiveTab('equipment')}
            className={`px-6 py-3 font-medium ${
              activeTab === 'equipment'
                ? 'border-b-2 border-black text-black'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Equipment Mappings
          </button>
          <button
            onClick={() => setActiveTab('measurement')}
            className={`px-6 py-3 font-medium ${
              activeTab === 'measurement'
                ? 'border-b-2 border-black text-black'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Measurement Mappings
          </button>
        </div>

        {/* Toolbar */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-2">
            <button
              onClick={handleAddMapping}
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 flex items-center space-x-2"
            >
              <Plus size={16} />
              <span>Add Mapping</span>
            </button>
            <button
              onClick={handleExportMappings}
              className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 flex items-center space-x-2"
            >
              <Download size={16} />
              <span>Export</span>
            </button>
            <label className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 flex items-center space-x-2 cursor-pointer">
              <Upload size={16} />
              <span>Import</span>
              <input
                type="file"
                accept=".json"
                onChange={handleImportMappings}
                className="hidden"
              />
            </label>
          </div>
          <div className="text-sm text-gray-500">
            {filteredMappings.length} mappings
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-4">Source Code</th>
                  <th className="text-left py-2 px-4">Source Name</th>
                  <th className="text-left py-2 px-4">→</th>
                  <th className="text-left py-2 px-4">Target Code</th>
                  <th className="text-left py-2 px-4">Target Name</th>
                  <th className="text-left py-2 px-4">Transform</th>
                  <th className="text-left py-2 px-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredMappings.map((mapping) => (
                  <tr key={mapping.id} className="border-b hover:bg-gray-50">
                    <td className="py-2 px-4 font-mono text-sm">{mapping.source_code}</td>
                    <td className="py-2 px-4 text-sm">{mapping.source_name || '-'}</td>
                    <td className="py-2 px-4 text-gray-400">→</td>
                    <td className="py-2 px-4 font-mono text-sm">{mapping.target_code}</td>
                    <td className="py-2 px-4 text-sm">{mapping.target_name || '-'}</td>
                    <td className="py-2 px-4 text-sm">
                      {mapping.transform_rules ? (
                        <span className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {Object.keys(mapping.transform_rules).join(', ')}
                        </span>
                      ) : (
                        '-'
                      )}
                    </td>
                    <td className="py-2 px-4">
                      <button
                        onClick={() => handleDeleteMapping(mapping)}
                        className="text-red-500 hover:text-red-700"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* Edit Modal */}
        {editingMapping && (
          <div className="absolute inset-0 bg-black bg-opacity-25 flex items-center justify-center">
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md">
              <h3 className="text-lg font-semibold mb-4">
                {editingMapping.id ? 'Edit' : 'Add'} {activeTab} Mapping
              </h3>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Source Code</label>
                  <input
                    type="text"
                    value={editingMapping.source_code}
                    onChange={(e) => setEditingMapping({
                      ...editingMapping,
                      source_code: e.target.value
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., MACH001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Source Name (Optional)</label>
                  <input
                    type="text"
                    value={editingMapping.source_name || ''}
                    onChange={(e) => setEditingMapping({
                      ...editingMapping,
                      source_name: e.target.value
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Machine 001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Target Code</label>
                  <input
                    type="text"
                    value={editingMapping.target_code}
                    onChange={(e) => setEditingMapping({
                      ...editingMapping,
                      target_code: e.target.value
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., EQ001"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">Target Name (Optional)</label>
                  <input
                    type="text"
                    value={editingMapping.target_name || ''}
                    onChange={(e) => setEditingMapping({
                      ...editingMapping,
                      target_name: e.target.value
                    })}
                    className="w-full px-3 py-2 border rounded-lg"
                    placeholder="e.g., Equipment 001"
                  />
                </div>
                
                {activeTab === 'measurement' && (
                  <div>
                    <label className="block text-sm font-medium mb-1">Transform Rules (Optional)</label>
                    <div className="space-y-2">
                      <input
                        type="number"
                        step="any"
                        placeholder="Scale factor"
                        value={editingMapping.transform_rules?.scale || ''}
                        onChange={(e) => setEditingMapping({
                          ...editingMapping,
                          transform_rules: {
                            ...editingMapping.transform_rules,
                            scale: e.target.value ? parseFloat(e.target.value) : undefined
                          }
                        })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                      <input
                        type="number"
                        step="any"
                        placeholder="Offset"
                        value={editingMapping.transform_rules?.offset || ''}
                        onChange={(e) => setEditingMapping({
                          ...editingMapping,
                          transform_rules: {
                            ...editingMapping.transform_rules,
                            offset: e.target.value ? parseFloat(e.target.value) : undefined
                          }
                        })}
                        className="w-full px-3 py-2 border rounded-lg"
                      />
                    </div>
                  </div>
                )}
              </div>
              
              <div className="flex justify-end space-x-2 mt-6">
                <button
                  onClick={() => setEditingMapping(null)}
                  className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveMapping}
                  disabled={isSaving || !editingMapping.source_code || !editingMapping.target_code}
                  className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50 flex items-center space-x-2"
                >
                  <Save size={16} />
                  <span>{isSaving ? 'Saving...' : 'Save'}</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};