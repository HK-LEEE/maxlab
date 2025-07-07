import React, { useState, useEffect } from 'react';
import { AlertCircle, Loader2, Plus, Trash2, Save, X } from 'lucide-react';
import axios from 'axios';
import { useAuthStore } from '../../../../stores/authStore';

interface MeasurementSpec {
  measurement_code: string;
  upper_spec_limit?: number | null;
  lower_spec_limit?: number | null;
  target_value?: number | null;
  spec_description?: string | null;
  created_at?: string;
  updated_at?: string;
}

interface MeasurementSpecDialogProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MeasurementSpecDialog({
  isOpen,
  onClose,
}: MeasurementSpecDialogProps) {
  const { token } = useAuthStore();
  const [specs, setSpecs] = useState<MeasurementSpec[]>([]);
  const [selectedSpec, setSelectedSpec] = useState<MeasurementSpec | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    if (isOpen) {
      fetchSpecs();
    }
  }, [isOpen]);

  const fetchSpecs = async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await axios.get(
        `/api/v1/personal-test/process-flow/measurement-specs`,
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      setSpecs(response.data);
    } catch (error) {
      console.error('Failed to fetch measurement specs:', error);
      setError('Failed to load measurement specifications');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!selectedSpec) return;

    try {
      setIsSaving(true);
      setError(null);
      
      const spec = {
        measurement_code: selectedSpec.measurement_code,
        upper_spec_limit: selectedSpec.upper_spec_limit || null,
        lower_spec_limit: selectedSpec.lower_spec_limit || null,
        target_value: selectedSpec.target_value || null,
        spec_description: selectedSpec.spec_description || null,
      };

      await axios.post(
        `/api/v1/personal-test/process-flow/measurement-specs`,
        spec,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      await fetchSpecs();
      setSelectedSpec(null);
      setIsEditing(false);
    } catch (error) {
      console.error('Failed to save measurement spec:', error);
      setError('Failed to save measurement specification');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (measurementCode: string) => {
    try {
      setIsLoading(true);
      await axios.delete(
        `/api/v1/personal-test/process-flow/measurement-specs/${measurementCode}`,
        { headers: { Authorization: `Bearer ${token}` } }
      );
      await fetchSpecs();
      if (selectedSpec?.measurement_code === measurementCode) {
        setSelectedSpec(null);
        setIsEditing(false);
      }
    } catch (error) {
      console.error('Failed to delete measurement spec:', error);
      setError('Failed to delete measurement specification');
    } finally {
      setIsLoading(false);
    }
  };

  const filteredSpecs = specs.filter(spec =>
    spec.measurement_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
    spec.spec_description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formatSpecDisplay = (spec: MeasurementSpec) => {
    const parts = [];
    if (spec.lower_spec_limit !== null && spec.lower_spec_limit !== undefined) {
      parts.push(`LSL: ${spec.lower_spec_limit}`);
    }
    if (spec.target_value !== null && spec.target_value !== undefined) {
      parts.push(`Target: ${spec.target_value}`);
    }
    if (spec.upper_spec_limit !== null && spec.upper_spec_limit !== undefined) {
      parts.push(`USL: ${spec.upper_spec_limit}`);
    }
    return parts.join(' | ') || 'No limits set';
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-black bg-opacity-50" onClick={onClose} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold">Measurement Specifications</h2>
            <p className="text-sm text-gray-500 mt-1">
              Define upper and lower specification limits for measurements
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error && (
          <div className="mx-6 mt-4 p-3 bg-red-50 border border-red-500 rounded flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5" />
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-4 flex-1 overflow-hidden p-6">
          {/* Specs List */}
          <div className="w-1/2 border-r pr-4 overflow-y-auto">
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="font-semibold">Measurement Codes</h3>
                <button
                  className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center"
                  onClick={() => {
                    setSelectedSpec({
                      measurement_code: '',
                      upper_spec_limit: null,
                      lower_spec_limit: null,
                      target_value: null,
                      spec_description: null,
                    });
                    setIsEditing(true);
                  }}
                >
                  <Plus className="h-4 w-4 mr-1" />
                  Add
                </button>
              </div>

              <input
                placeholder="Search measurement codes..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />

              {isLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-6 w-6 animate-spin" />
                </div>
              ) : (
                <div className="space-y-2">
                  {filteredSpecs.map((spec) => (
                    <div
                      key={spec.measurement_code}
                      className={`p-3 border rounded cursor-pointer ${
                        selectedSpec?.measurement_code === spec.measurement_code
                          ? 'border-primary bg-primary/5'
                          : 'hover:bg-gray-50'
                      }`}
                      onClick={() => {
                        setSelectedSpec(spec);
                        setIsEditing(false);
                      }}
                    >
                      <div className="font-medium">{spec.measurement_code}</div>
                      <div className="text-sm text-gray-600 mt-1">
                        {formatSpecDisplay(spec)}
                      </div>
                      {spec.spec_description && (
                        <div className="text-xs text-gray-500 mt-1">
                          {spec.spec_description}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Configuration Form */}
          <div className="flex-1 overflow-y-auto">
            {selectedSpec ? (
              <div className="space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="font-semibold">Specification Details</h3>
                  <div className="flex gap-2">
                    {!isEditing && selectedSpec.measurement_code && (
                      <>
                        <button
                          className="px-3 py-1.5 border border-gray-300 rounded hover:bg-gray-50 text-sm"
                          onClick={() => setIsEditing(true)}
                        >
                          Edit
                        </button>
                        <button
                          className="px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 text-sm"
                          onClick={() => handleDelete(selectedSpec.measurement_code)}
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
                            setSelectedSpec(null);
                            setIsEditing(false);
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm flex items-center disabled:bg-gray-300 disabled:cursor-not-allowed"
                          onClick={handleSave}
                          disabled={isSaving || !selectedSpec.measurement_code}
                        >
                          {isSaving ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <>
                              <Save className="h-4 w-4 mr-1" />
                              Save
                            </>
                          )}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Measurement Code
                    </label>
                    <input
                      value={selectedSpec.measurement_code}
                      onChange={(e) =>
                        setSelectedSpec({
                          ...selectedSpec,
                          measurement_code: e.target.value.toUpperCase(),
                        })
                      }
                      disabled={!isEditing || (selectedSpec.created_at ? true : false)}
                      placeholder="e.g., TEMP001"
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Lower Spec Limit (LSL)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={selectedSpec.lower_spec_limit ?? ''}
                        onChange={(e) =>
                          setSelectedSpec({
                            ...selectedSpec,
                            lower_spec_limit: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        disabled={!isEditing}
                        placeholder="e.g., 0"
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Target Value
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={selectedSpec.target_value ?? ''}
                        onChange={(e) =>
                          setSelectedSpec({
                            ...selectedSpec,
                            target_value: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        disabled={!isEditing}
                        placeholder="e.g., 25"
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">
                        Upper Spec Limit (USL)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={selectedSpec.upper_spec_limit ?? ''}
                        onChange={(e) =>
                          setSelectedSpec({
                            ...selectedSpec,
                            upper_spec_limit: e.target.value ? parseFloat(e.target.value) : null,
                          })
                        }
                        disabled={!isEditing}
                        placeholder="e.g., 100"
                        className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">
                      Description
                    </label>
                    <textarea
                      value={selectedSpec.spec_description || ''}
                      onChange={(e) =>
                        setSelectedSpec({
                          ...selectedSpec,
                          spec_description: e.target.value,
                        })
                      }
                      disabled={!isEditing}
                      placeholder="Describe what this measurement represents..."
                      rows={3}
                      className="w-full p-2 border border-gray-300 rounded focus:ring-2 focus:ring-blue-500 focus:border-blue-500 disabled:bg-gray-100"
                    />
                  </div>

                  {/* Visual Spec Display */}
                  {(selectedSpec.lower_spec_limit !== null ||
                    selectedSpec.upper_spec_limit !== null ||
                    selectedSpec.target_value !== null) && (
                    <div className="p-4 bg-gray-50 rounded">
                      <h4 className="font-medium mb-2">Specification Range</h4>
                      <div className="relative h-8 bg-gray-200 rounded">
                        {selectedSpec.lower_spec_limit !== null &&
                          selectedSpec.upper_spec_limit !== null && (
                            <div
                              className="absolute h-full bg-green-300"
                              style={{
                                left: '20%',
                                width: '60%',
                              }}
                            />
                          )}
                        {selectedSpec.target_value !== null &&
                          selectedSpec.lower_spec_limit !== null &&
                          selectedSpec.upper_spec_limit !== null && (
                            <div
                              className="absolute h-full w-0.5 bg-blue-600"
                              style={{
                                left: `${
                                  20 +
                                  ((selectedSpec.target_value -
                                    selectedSpec.lower_spec_limit) /
                                    (selectedSpec.upper_spec_limit -
                                      selectedSpec.lower_spec_limit)) *
                                    60
                                }%`,
                              }}
                            />
                          )}
                      </div>
                      <div className="flex justify-between mt-2 text-sm">
                        <span>
                          {selectedSpec.lower_spec_limit !== null
                            ? `LSL: ${selectedSpec.lower_spec_limit}`
                            : ''}
                        </span>
                        <span className="text-blue-600">
                          {selectedSpec.target_value !== null
                            ? `Target: ${selectedSpec.target_value}`
                            : ''}
                        </span>
                        <span>
                          {selectedSpec.upper_spec_limit !== null
                            ? `USL: ${selectedSpec.upper_spec_limit}`
                            : ''}
                        </span>
                      </div>
                    </div>
                  )}

                  {selectedSpec.created_at && (
                    <div className="text-sm text-gray-500">
                      <div>Created: {new Date(selectedSpec.created_at).toLocaleString()}</div>
                      {selectedSpec.updated_at && (
                        <div>Updated: {new Date(selectedSpec.updated_at).toLocaleString()}</div>
                      )}
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full text-gray-500">
                Select a measurement code or add a new specification
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}