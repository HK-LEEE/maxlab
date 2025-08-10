import React, { useState, useEffect } from 'react';
import { X, Eye, AlertCircle, ArrowRight, RefreshCw } from 'lucide-react';
import { apiClient } from '../../../../api/client';

interface DataPreviewDialogProps {
  isOpen: boolean;
  onClose: () => void;
  dataSourceId: string;
  dataType: 'equipment_status' | 'measurement_data';
}

export const DataPreviewDialog: React.FC<DataPreviewDialogProps> = ({
  isOpen,
  onClose,
  dataSourceId,
  dataType,
}) => {
  const [originalData, setOriginalData] = useState<any[]>([]);
  const [mappedData, setMappedData] = useState<any[]>([]);
  const [mappingErrors, setMappingErrors] = useState<string[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [limit, setLimit] = useState(5);

  useEffect(() => {
    if (isOpen) {
      loadPreview();
    }
  }, [isOpen, dataSourceId, dataType, limit]);

  const loadPreview = async () => {
    setIsLoading(true);
    try {
      const response = await apiClient.post(
        `/v1/personal-test/process-flow/data-sources/${dataSourceId}/preview-mapping`,
        {
          data_type: dataType,
          limit: limit
        }
      );
      
      setOriginalData(response.data.original_data || []);
      setMappedData(response.data.mapped_data || []);
      setMappingErrors(response.data.mapping_errors || []);
    } catch (error) {
      console.error('Failed to load data preview:', error);
      setMappingErrors(['Failed to load preview data']);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isOpen) return null;

  // Get all unique keys from data
  const originalKeys = Array.from(new Set(originalData.flatMap(row => Object.keys(row))));
  const mappedKeys = Array.from(new Set(mappedData.flatMap(row => Object.keys(row))));

  const formatValue = (value: any) => {
    if (value === null || value === undefined) return <span className="text-gray-400">null</span>;
    if (typeof value === 'boolean') return value ? 'true' : 'false';
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl w-full max-w-7xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center space-x-2">
            <Eye size={24} />
            <h2 className="text-xl font-semibold">
              Data Preview - {dataType === 'equipment_status' ? 'Equipment Status' : 'Measurement Data'}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X size={20} />
          </button>
        </div>

        {/* Controls */}
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <label className="text-sm font-medium">Rows:</label>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="px-2 py-1 border rounded text-sm"
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
              </select>
            </div>
            <button
              onClick={loadPreview}
              disabled={isLoading}
              className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 flex items-center space-x-1"
            >
              <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
              <span>Refresh</span>
            </button>
          </div>
          
          {mappingErrors.length > 0 && (
            <div className="flex items-center space-x-2 text-red-600">
              <AlertCircle size={16} />
              <span className="text-sm">{mappingErrors.length} errors</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {isLoading ? (
            <div className="text-center py-8 text-gray-500">Loading preview...</div>
          ) : (
            <div className="space-y-6">
              {/* Errors */}
              {mappingErrors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                  <h4 className="font-medium text-red-800 mb-2">Mapping Errors:</h4>
                  <ul className="list-disc list-inside space-y-1">
                    {mappingErrors.map((error, idx) => (
                      <li key={idx} className="text-sm text-red-700">{error}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Data comparison */}
              <div className="grid grid-cols-2 gap-6">
                {/* Original Data */}
                <div>
                  <h3 className="font-medium mb-3 flex items-center space-x-2">
                    <span>Original Data (Source)</span>
                    <span className="text-sm text-gray-500">
                      {originalData.length} rows, {originalKeys.length} columns
                    </span>
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">#</th>
                            {originalKeys.map(key => (
                              <th key={key} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {originalData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 border-b text-gray-500">{idx + 1}</td>
                              {originalKeys.map(key => (
                                <td key={key} className="px-3 py-2 border-b font-mono text-xs">
                                  {formatValue(row[key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>

                {/* Mapped Data */}
                <div>
                  <h3 className="font-medium mb-3 flex items-center space-x-2">
                    <span>Mapped Data (Target)</span>
                    <span className="text-sm text-gray-500">
                      {mappedData.length} rows, {mappedKeys.length} columns
                    </span>
                  </h3>
                  <div className="border rounded-lg overflow-hidden">
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-3 py-2 text-left font-medium text-gray-700 border-b">#</th>
                            {mappedKeys.map(key => (
                              <th key={key} className="px-3 py-2 text-left font-medium text-gray-700 border-b">
                                {key}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {mappedData.map((row, idx) => (
                            <tr key={idx} className="hover:bg-gray-50">
                              <td className="px-3 py-2 border-b text-gray-500">{idx + 1}</td>
                              {mappedKeys.map(key => (
                                <td key={key} className="px-3 py-2 border-b font-mono text-xs">
                                  {formatValue(row[key])}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mapping visualization */}
              <div className="mt-6 p-4 bg-gray-50 rounded-lg">
                <h4 className="font-medium mb-3">Field Mapping Flow</h4>
                <div className="flex items-center justify-center space-x-8 text-sm">
                  <div className="text-center">
                    <div className="font-medium mb-2">Source Fields</div>
                    <div className="space-y-1">
                      {originalKeys.slice(0, 5).map(key => (
                        <div key={key} className="px-3 py-1 bg-white border rounded">{key}</div>
                      ))}
                      {originalKeys.length > 5 && (
                        <div className="text-gray-500">...and {originalKeys.length - 5} more</div>
                      )}
                    </div>
                  </div>
                  <ArrowRight size={24} className="text-gray-400" />
                  <div className="text-center">
                    <div className="font-medium mb-2">Target Fields</div>
                    <div className="space-y-1">
                      {mappedKeys.slice(0, 5).map(key => (
                        <div key={key} className="px-3 py-1 bg-white border rounded">{key}</div>
                      ))}
                      {mappedKeys.length > 5 && (
                        <div className="text-gray-500">...and {mappedKeys.length - 5} more</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};