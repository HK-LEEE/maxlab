import React, { useState, useEffect } from 'react';
import { X, ArrowRight, Plus, Save, Trash2, AlertCircle, Eye } from 'lucide-react';
import { apiClient } from '../../../../api/client';
import { DataPreviewDialog } from './DataPreviewDialog';

interface FieldMapping {
  id?: string;
  data_source_id: string;
  data_type: string;
  source_field: string;
  target_field: string;
  data_type_conversion?: string;
  transform_function?: string;
  default_value?: string;
  is_required: boolean;
  is_active?: boolean;
}

interface FieldMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataSourceId: string;
  sourceType: 'postgresql' | 'mssql' | 'api';
}

const DATA_TYPES = [
  { value: 'equipment_status', label: 'Equipment Status' },
  { value: 'measurement_data', label: 'Measurement Data' },
];

const TARGET_FIELDS = {
  equipment_status: [
    { field: 'equipment_type', required: true, type: 'string' },
    { field: 'equipment_code', required: true, type: 'string' },
    { field: 'equipment_name', required: true, type: 'string' },
    { field: 'status', required: true, type: 'string' },
    { field: 'last_run_time', required: false, type: 'datetime' },
  ],
  measurement_data: [
    { field: 'equipment_type', required: true, type: 'string' },
    { field: 'equipment_code', required: true, type: 'string' },
    { field: 'measurement_code', required: true, type: 'string' },
    { field: 'measurement_desc', required: true, type: 'string' },
    { field: 'measurement_value', required: true, type: 'float' },
    { field: 'timestamp', required: true, type: 'datetime' },
    { field: 'usl', required: false, type: 'float' },
    { field: 'lsl', required: false, type: 'float' },
    { field: 'spec_status', required: false, type: 'int' },
  ],
};

const DATA_TYPE_CONVERSIONS = [
  { value: 'string', label: 'String' },
  { value: 'int', label: 'Integer' },
  { value: 'float', label: 'Float' },
  { value: 'datetime', label: 'DateTime' },
  { value: 'boolean', label: 'Boolean' },
];

export const FieldMappingDialog: React.FC<FieldMappingDialogProps> = ({
  isOpen,
  onClose,
  dataSourceId,
  sourceType,
}) => {
  const [mappings, setMappings] = useState<FieldMapping[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('equipment_status');
  const [showAddForm, setShowAddForm] = useState(false);
  const [newMapping, setNewMapping] = useState<Partial<FieldMapping>>({
    source_field: '',
    target_field: '',
    is_required: false,
  });
  const [sourceColumns, setSourceColumns] = useState<string[]>([]);
  const [isLoadingColumns, setIsLoadingColumns] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (isOpen) {
      loadMappings();
      loadSourceColumns();
    }
  }, [isOpen, dataSourceId, activeTab]);

  const loadMappings = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.get(
        `/v1/personal-test/process-flow/data-sources/${dataSourceId}/field-mappings`
      );
      setMappings(response.data);
    } catch (error) {
      console.error('Failed to load field mappings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSourceColumns = async () => {
    setIsLoadingColumns(true);
    try {
      const response = await apiClient.post(
        `/v1/personal-test/process-flow/data-sources/${dataSourceId}/execute-query`,
        {
          query_type: activeTab,
          limit: 1
        }
      );
      
      if (response.data.columns) {
        setSourceColumns(response.data.columns);
      }
    } catch (error) {
      console.error('Failed to load source columns:', error);
      setSourceColumns([]);
    } finally {
      setIsLoadingColumns(false);
    }
  };

  const handleSave = async (mapping: FieldMapping) => {
    setIsSaving(true);
    try {
      await apiClient.post(
        `/v1/personal-test/process-flow/data-sources/${dataSourceId}/field-mappings`,
        mapping
      );
      await loadMappings();
      setShowAddForm(false);
      setNewMapping({ source_field: '', target_field: '', is_required: false });
    } catch (error) {
      console.error('Failed to save field mapping:', error);
      alert('Failed to save field mapping');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (mappingId: string) => {
    if (!confirm('Are you sure you want to delete this field mapping?')) {
      return;
    }

    try {
      await apiClient.delete(
        `/v1/personal-test/process-flow/data-sources/${dataSourceId}/field-mappings/${mappingId}`
      );
      await loadMappings();
    } catch (error) {
      console.error('Failed to delete field mapping:', error);
      alert('Failed to delete field mapping');
    }
  };

  const handleAddMapping = () => {
    const mapping: FieldMapping = {
      data_source_id: dataSourceId,
      data_type: activeTab,
      source_field: newMapping.source_field || '',
      target_field: newMapping.target_field || '',
      data_type_conversion: newMapping.data_type_conversion,
      transform_function: newMapping.transform_function,
      default_value: newMapping.default_value,
      is_required: newMapping.is_required || false,
    };
    handleSave(mapping);
  };

  const generateDefaultMappings = async () => {
    const targetFields = TARGET_FIELDS[activeTab as keyof typeof TARGET_FIELDS];
    const defaultMappings = targetFields.map(({ field, required, type }) => ({
      data_source_id: dataSourceId,
      data_type: activeTab,
      source_field: field,
      target_field: field,
      data_type_conversion: type,
      is_required: required,
    }));

    setIsSaving(true);
    try {
      for (const mapping of defaultMappings) {
        await apiClient.post(
          `/v1/personal-test/process-flow/data-sources/${dataSourceId}/field-mappings`,
          mapping
        );
      }
      await loadMappings();
      alert('Default mappings generated successfully');
    } catch (error) {
      console.error('Failed to generate default mappings:', error);
      alert('Failed to generate default mappings');
    } finally {
      setIsSaving(false);
    }
  };

  if (!isOpen) return null;

  const currentMappings = mappings.filter(m => m.data_type === activeTab);
  const targetFields = TARGET_FIELDS[activeTab as keyof typeof TARGET_FIELDS];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-2">
            <ArrowRight size={24} />
            <h2 className="text-xl font-semibold">Field Mappings</h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b">
          {DATA_TYPES.map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setActiveTab(value)}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === value
                  ? 'border-b-2 border-black text-black'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Action buttons */}
              <div className="mb-4 flex justify-between">
                <div className="flex space-x-2">
                  <button
                    onClick={() => setShowAddForm(!showAddForm)}
                    className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 flex items-center space-x-2"
                  >
                    <Plus size={16} />
                    <span>Add Field Mapping</span>
                  </button>
                  <button
                    onClick={() => setShowPreview(true)}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 flex items-center space-x-2"
                  >
                    <Eye size={16} />
                    <span>Preview Data</span>
                  </button>
                </div>
                {currentMappings.length === 0 && (
                  <button
                    onClick={generateDefaultMappings}
                    disabled={isSaving}
                    className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                  >
                    Generate Default Mappings
                  </button>
                )}
              </div>

              {/* Add new mapping form */}
              {showAddForm && (
                <div className="mb-4 p-4 border rounded-lg bg-gray-50">
                  <h4 className="font-medium mb-3">Add New Field Mapping</h4>
                  <div className="mb-4 flex justify-end">
                    <button
                      onClick={loadSourceColumns}
                      disabled={isLoadingColumns}
                      className="px-3 py-1 text-sm border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
                    >
                      {isLoadingColumns ? 'Loading...' : 'Refresh Source Columns'}
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium mb-1">Source Field (From Query)</label>
                      <select
                        value={newMapping.source_field || ''}
                        onChange={(e) => setNewMapping({ ...newMapping, source_field: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">Select source field</option>
                        {sourceColumns.map((column) => (
                          <option key={column} value={column}>{column}</option>
                        ))}
                      </select>
                      {sourceColumns.length === 0 && !isLoadingColumns && (
                        <p className="text-xs text-gray-500 mt-1">
                          Execute query to load available columns
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Target Field (System Required)</label>
                      <select
                        value={newMapping.target_field || ''}
                        onChange={(e) => {
                          const field = targetFields.find(f => f.field === e.target.value);
                          setNewMapping({ 
                            ...newMapping, 
                            target_field: e.target.value,
                            is_required: field?.required || false,
                            data_type_conversion: field?.type
                          });
                        }}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">Select target field</option>
                        {targetFields.map(({ field, required }) => (
                          <option key={field} value={field}>
                            {field} {required && '*'}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Data Type Conversion</label>
                      <select
                        value={newMapping.data_type_conversion || ''}
                        onChange={(e) => setNewMapping({ ...newMapping, data_type_conversion: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                      >
                        <option value="">None</option>
                        {DATA_TYPE_CONVERSIONS.map(({ value, label }) => (
                          <option key={value} value={value}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium mb-1">Default Value</label>
                      <input
                        type="text"
                        value={newMapping.default_value || ''}
                        onChange={(e) => setNewMapping({ ...newMapping, default_value: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg"
                        placeholder="Default if null"
                      />
                    </div>
                    <div className="col-span-2">
                      <label className="block text-sm font-medium mb-1">Transform Function (Optional)</label>
                      <textarea
                        value={newMapping.transform_function || ''}
                        onChange={(e) => setNewMapping({ ...newMapping, transform_function: e.target.value })}
                        className="w-full px-3 py-2 border rounded-lg font-mono text-sm"
                        rows={2}
                        placeholder="UPPER(value) or value * 1000"
                      />
                    </div>
                    <div className="col-span-2 flex items-center space-x-4">
                      <label className="flex items-center space-x-2">
                        <input
                          type="checkbox"
                          checked={newMapping.is_required || false}
                          onChange={(e) => setNewMapping({ ...newMapping, is_required: e.target.checked })}
                          className="rounded"
                        />
                        <span className="text-sm">Required Field</span>
                      </label>
                      <div className="flex-1" />
                      <button
                        onClick={() => setShowAddForm(false)}
                        className="px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleAddMapping}
                        disabled={!newMapping.source_field || !newMapping.target_field || isSaving}
                        className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
                      >
                        Add Mapping
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {/* Required fields notice */}
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                <div className="flex items-start space-x-2">
                  <AlertCircle className="w-5 h-5 text-yellow-600 mt-0.5" />
                  <div className="text-sm">
                    <p className="font-medium text-yellow-800">Required Target Fields:</p>
                    <p className="text-yellow-700">
                      {targetFields.filter(f => f.required).map(f => f.field).join(', ')}
                    </p>
                  </div>
                </div>
              </div>

              {/* Mappings table */}
              <div className="border rounded-lg overflow-hidden">
                <table className="w-full">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-sm font-medium">Source Field</th>
                      <th className="px-2 py-2"></th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Target Field</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Type</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Transform</th>
                      <th className="px-4 py-2 text-left text-sm font-medium">Default</th>
                      <th className="px-4 py-2 text-center text-sm font-medium">Required</th>
                      <th className="px-4 py-2"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {currentMappings.map((mapping) => (
                      <tr key={mapping.id} className="border-t hover:bg-gray-50">
                        <td className="px-4 py-2 font-mono text-sm">{mapping.source_field}</td>
                        <td className="px-2 py-2 text-gray-400">
                          <ArrowRight size={16} />
                        </td>
                        <td className="px-4 py-2 font-mono text-sm font-medium">{mapping.target_field}</td>
                        <td className="px-4 py-2 text-sm">{mapping.data_type_conversion || '-'}</td>
                        <td className="px-4 py-2 text-sm font-mono text-xs">
                          {mapping.transform_function ? (
                            <span className="truncate block max-w-xs" title={mapping.transform_function}>
                              {mapping.transform_function}
                            </span>
                          ) : '-'}
                        </td>
                        <td className="px-4 py-2 text-sm">{mapping.default_value || '-'}</td>
                        <td className="px-4 py-2 text-center">
                          {mapping.is_required && (
                            <span className="inline-block w-2 h-2 bg-green-500 rounded-full" />
                          )}
                        </td>
                        <td className="px-4 py-2">
                          <button
                            onClick={() => handleDelete(mapping.id!)}
                            className="text-red-500 hover:text-red-700"
                          >
                            <Trash2 size={16} />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {currentMappings.length === 0 && (
                      <tr>
                        <td colSpan={8} className="px-4 py-8 text-center text-gray-500">
                          No field mappings configured. Click "Generate Default Mappings" to start.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      
      {/* Data Preview Dialog */}
      {showPreview && (
        <DataPreviewDialog
          isOpen={showPreview}
          onClose={() => setShowPreview(false)}
          dataSourceId={dataSourceId}
          dataType={activeTab as 'equipment_status' | 'measurement_data'}
        />
      )}
    </div>
  );
};