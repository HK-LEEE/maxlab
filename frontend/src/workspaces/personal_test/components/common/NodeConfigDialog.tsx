import React, { useState, useEffect, useMemo } from 'react';
import type { Node } from 'reactflow';
import { X, ChevronDown, ChevronUp, GripVertical, Info, Plus, Trash2, Play } from 'lucide-react';
import { apiClient } from '../../../../api/client';
import { QueryEditor } from '../editor/QueryEditor';

interface NodeConfigDialogProps {
  node: Node;
  onClose: () => void;
  onSave: (nodeId: string, data: any) => void;
  isInstrumentNode?: boolean;
  isTableNode?: boolean;
}

export const NodeConfigDialog: React.FC<NodeConfigDialogProps> = ({
  node,
  onClose,
  onSave,
  isInstrumentNode = false,
  isTableNode = false,
}) => {
  const [formData, setFormData] = useState({
    label: node.data.label || '',
    equipmentType: node.data.equipmentType || '',
    equipmentCode: node.data.equipmentCode || '',
    equipmentName: node.data.equipmentName || '',
    displayMeasurements: node.data.displayMeasurements || [],
    // Instrument node specific
    instrumentType: node.data.instrumentType || 'instrument',
    instrumentName: node.data.instrumentName || '계측기',
    instrumentColor: node.data.color || '#6b7280', // Gray default for instruments
    // Group node specific properties
    color: node.data.color || '#3b82f6',
    backgroundColor: node.data.backgroundColor || node.data.color || '#3b82f6',
    backgroundOpacity: node.data.backgroundOpacity || 10,
    titleSize: node.data.titleSize || 14,
    titleColor: node.data.titleColor || '#000000',
    titlePosition: node.data.titlePosition || 'top',
    zIndex: node.data.zIndex || -1,
    borderStyle: node.data.borderStyle || 'solid',
    // Table node specific properties
    queryConfig: node.data.queryConfig || {
      sql: '',
      refreshInterval: 30,
      dataSourceId: ''
    },
    tableConfig: node.data.tableConfig || {
      columns: [
        { field: 'id', header: 'ID', type: 'id', width: 60 },
        { field: 'value', header: 'Value', type: 'value', width: 80 },
        { field: 'usl', header: 'USL', type: 'usl', width: 60 },
        { field: 'lsl', header: 'LSL', type: 'lsl', width: 60 },
        { field: 'status', header: 'Status', type: 'status', width: 80 }
      ],
      displayMode: 'table',
      maxRows: 50
    },
    statusRules: node.data.statusRules || {
      valueField: 'value',
      uslField: 'usl',
      lslField: 'lsl',
      idField: 'id'
    },
    tableColor: node.data.color || '#3b82f6',
  });

  const [availableEquipment, setAvailableEquipment] = useState<any[]>([]);
  const [availableMeasurements, setAvailableMeasurements] = useState<any[]>([]);
  const [measurementDetails, setMeasurementDetails] = useState<Record<string, any>>({});
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [expandedMeasurements, setExpandedMeasurements] = useState<Set<string>>(new Set());
  const [availableMeasurementsSearchTerm, setAvailableMeasurementsSearchTerm] = useState('');
  
  // Table node specific states
  const [availableDataSources, setAvailableDataSources] = useState<any[]>([]);
  const [queryError, setQueryError] = useState<string>('');
  const [isTestingQuery, setIsTestingQuery] = useState(false);
  const [queryResults, setQueryResults] = useState<any>(null);

  // Check if this is a common equipment node
  const isCommonEquipment = node.id === 'common-equipment';

  // Load available equipment
  useEffect(() => {
    apiClient.get('/v1/personal-test/process-flow/equipment/status?workspace_id=personal_test&limit=100')
      .then((response) => {
        const equipmentList = response.data.items || response.data;
        setAvailableEquipment(equipmentList);
      })
      .catch((err) => console.error('Failed to load equipment:', err));
  }, []);

  // Load all available measurements (equipment code independent)
  useEffect(() => {
    // Load all measurements from the workspace
    apiClient.get(`/v1/personal-test/process-flow/measurements?workspace_id=personal_test&limit=1000`)
      .then((response) => {
        const measurements = response.data || [];
        setAvailableMeasurements(measurements);
        
        // Create a map of measurement details for preview
        const details: Record<string, any> = {};
        measurements.forEach((m: any) => {
          details[m.measurement_code] = {
            desc: m.measurement_desc,
            value: m.measurement_value,
            unit: m.unit,
            timestamp: m.timestamp,
            spec_status: m.spec_status,
            usl: m.upper_spec_limit,
            lsl: m.lower_spec_limit,
            target: m.target_value,
          };
        });
        setMeasurementDetails(details);
      })
      .catch((err) => console.error('Failed to load measurements:', err));
  }, []); // No dependencies - load all measurements once

  // Load available data sources for table node
  useEffect(() => {
    if (isTableNode) {
      apiClient.get('/v1/personal-test/process-flow/data-sources?workspace_id=personal_test')
        .then((response) => {
          setAvailableDataSources(response.data);
        })
        .catch((err) => console.error('Failed to load data sources:', err));
    }
  }, [isTableNode]);

  // Auto-sync status rules when table node is loaded or columns change
  useEffect(() => {
    if (isTableNode && formData.tableConfig.columns.length > 0) {
      updateStatusRulesFromColumns(formData.tableConfig.columns);
    }
  }, [isTableNode, formData.tableConfig.columns.length]);


  const filteredEquipment = availableEquipment.filter(
    (eq) => eq.equipment_type === formData.equipmentType
  );

  // Get unique measurements for the selected equipment
  const availableMeasurementsForEquipment = Array.from(
    new Map(
      availableMeasurements.map((m) => [m.measurement_code, m])
    ).values()
  );


  // Generate dynamic equipment types from available equipment
  const dynamicEquipmentTypes = useMemo(() => {
    const typeMap = new Map();
    availableEquipment.forEach(eq => {
      if (!typeMap.has(eq.equipment_type)) {
        typeMap.set(eq.equipment_type, {
          code: eq.equipment_type,
          name: `${eq.equipment_type} 설비`
        });
      }
    });
    return Array.from(typeMap.values()).sort((a, b) => a.code.localeCompare(b.code));
  }, [availableEquipment]);

  // Table node specific handlers
  const handleTestQuery = async () => {
    if (!formData.queryConfig.sql || !formData.queryConfig.dataSourceId) {
      setQueryError('Please select a data source and enter a query');
      return;
    }

    setIsTestingQuery(true);
    setQueryError('');
    
    try {
      const response = await apiClient.post(
        `/v1/personal-test/process-flow/data-sources/${formData.queryConfig.dataSourceId}/execute-query`,
        {
          query_type: 'custom',
          custom_query: formData.queryConfig.sql,
          limit: 5
        }
      );

      if (response.data.error) {
        setQueryError(String(response.data.error));
        setQueryResults(null);
      } else {
        setQueryResults(response.data);
        setQueryError('');
      }
    } catch (error: any) {
      let errorMessage = 'Failed to execute query';
      
      if (typeof error === 'string') {
        errorMessage = error;
      } else if (error.response?.status === 422) {
        errorMessage = 'Invalid query format. Please check your SQL syntax and ensure all required fields are provided.';
      } else if (error.response?.status === 405) {
        errorMessage = 'Method not allowed. The API endpoint configuration may be incorrect.';
      } else if (error.response?.status === 404) {
        errorMessage = 'Data source not found. Please verify the selected data source exists and is accessible.';
      } else if (error.response?.data?.detail) {
        errorMessage = error.response.data.detail;
      } else if (error.message) {
        errorMessage = error.message;
      }
      
      setQueryError(String(errorMessage));
      setQueryResults(null);
    } finally {
      setIsTestingQuery(false);
    }
  };

  const addTableColumn = () => {
    const existingTypes = formData.tableConfig.columns.map((col: any) => col.type);
    const columnCount = formData.tableConfig.columns.length;
    
    // Suggest appropriate default based on what's missing
    let suggestedType = 'text';
    let suggestedField = `field_${columnCount + 1}`;
    let suggestedHeader = `Column ${columnCount + 1}`;
    let suggestedWidth = 80;
    
    if (!existingTypes.includes('id')) {
      suggestedType = 'id';
      suggestedField = 'id';
      suggestedHeader = 'ID';
      suggestedWidth = 60;
    } else if (!existingTypes.includes('value')) {
      suggestedType = 'value';
      suggestedField = 'measurement_value';
      suggestedHeader = 'Value';
      suggestedWidth = 80;
    } else if (!existingTypes.includes('usl')) {
      suggestedType = 'usl';
      suggestedField = 'upper_spec_limit';
      suggestedHeader = 'USL';
      suggestedWidth = 60;
    } else if (!existingTypes.includes('lsl')) {
      suggestedType = 'lsl';
      suggestedField = 'lower_spec_limit';
      suggestedHeader = 'LSL';
      suggestedWidth = 60;
    } else if (!existingTypes.includes('status')) {
      suggestedType = 'status';
      suggestedField = 'status';
      suggestedHeader = 'Status';
      suggestedWidth = 80;
    }
    
    const newColumn = {
      field: suggestedField,
      header: suggestedHeader,
      type: suggestedType as 'text' | 'number' | 'status' | 'action' | 'temperature' | 'pressure' | 'datetime',
      width: suggestedWidth
    };
    
    const updatedColumns = [...formData.tableConfig.columns, newColumn];
    setFormData({
      ...formData,
      tableConfig: {
        ...formData.tableConfig,
        columns: updatedColumns
      }
    });
    
    // Auto-update status rules after adding column
    setTimeout(() => {
      updateStatusRulesFromColumns(updatedColumns);
    }, 0);
  };

  const removeTableColumn = (index: number) => {
    const updatedColumns = formData.tableConfig.columns.filter((_: any, i: number) => i !== index);
    setFormData({
      ...formData,
      tableConfig: {
        ...formData.tableConfig,
        columns: updatedColumns
      }
    });
    
    // Auto-update status rules after removing column
    setTimeout(() => {
      updateStatusRulesFromColumns(updatedColumns);
    }, 0);
  };

  const updateTableColumn = (index: number, field: string, value: any) => {
    const updatedColumns = [...formData.tableConfig.columns];
    updatedColumns[index] = { ...updatedColumns[index], [field]: value };
    setFormData({
      ...formData,
      tableConfig: {
        ...formData.tableConfig,
        columns: updatedColumns
      }
    });
  };

  // Auto-update status rules based on column configuration
  const updateStatusRulesFromColumns = (columns: any[], changedIndex?: number, changedField?: string, changedValue?: any) => {
    // Create a copy of columns with the updated value if provided
    let workingColumns = [...columns];
    if (changedIndex !== undefined && changedField && changedValue !== undefined) {
      workingColumns[changedIndex] = { ...workingColumns[changedIndex], [changedField]: changedValue };
    }
    
    // Find columns by type and extract their field names
    const valueColumn = workingColumns.find((col: any) => col.type === 'value');
    const uslColumn = workingColumns.find((col: any) => col.type === 'usl');
    const lslColumn = workingColumns.find((col: any) => col.type === 'lsl');
    const idColumn = workingColumns.find((col: any) => col.type === 'id');
    
    // Update status rules automatically
    setFormData(prev => ({
      ...prev,
      statusRules: {
        valueField: valueColumn?.field || prev.statusRules.valueField,
        uslField: uslColumn?.field || prev.statusRules.uslField,
        lslField: lslColumn?.field || prev.statusRules.lslField,
        idField: idColumn?.field || prev.statusRules.idField,
      }
    }));
  };

  const handleSave = () => {
    if (isCommonEquipment && !formData.equipmentType) {
      alert('공통설비는 설비 타입을 반드시 선택해야 합니다.');
      return;
    }

    if (node.type === 'group') {
      onSave(node.id, {
        ...node.data,
        label: formData.label,
        color: formData.color,
        backgroundColor: formData.backgroundColor,
        backgroundOpacity: formData.backgroundOpacity,
        titleSize: formData.titleSize,
        titleColor: formData.titleColor,
        titlePosition: formData.titlePosition,
        zIndex: formData.zIndex,
        borderStyle: formData.borderStyle,
      });
    } else if (isTableNode) {
      // Validate table configuration
      if (!formData.queryConfig.sql) {
        alert('❌ Please enter a SQL query for the table');
        return;
      }
      if (!formData.queryConfig.dataSourceId) {
        alert('❌ Please select a data source');
        return;
      }
      if (formData.tableConfig.columns.length === 0) {
        alert('❌ Please add at least one column to the table');
        return;
      }
      
      // Validate required column types for status calculation
      const hasValueColumn = formData.tableConfig.columns.some((col: any) => col.type === 'value');
      const hasUslColumn = formData.tableConfig.columns.some((col: any) => col.type === 'usl');
      const hasLslColumn = formData.tableConfig.columns.some((col: any) => col.type === 'lsl');
      const hasIdColumn = formData.tableConfig.columns.some((col: any) => col.type === 'id');
      
      if (!hasValueColumn && !hasUslColumn && !hasLslColumn && !hasIdColumn) {
        // At least some column types should be configured for meaningful table
        const hasStatusColumn = formData.tableConfig.columns.some((col: any) => col.type === 'status');
        if (hasStatusColumn) {
          alert('⚠️ Status column requires Value, USL, and LSL columns to function properly.\n\nPlease add columns with appropriate types for status calculation.');
          return;
        }
      }
      
      // Validate field names are not empty
      const emptyFields = formData.tableConfig.columns.filter((col: any) => !col.field || !col.header);
      if (emptyFields.length > 0) {
        alert('❌ Please fill in both Field Name and Display Header for all columns');
        return;
      }

      onSave(node.id, {
        ...node.data,
        label: formData.label,
        queryConfig: formData.queryConfig,
        tableConfig: formData.tableConfig,
        statusRules: formData.statusRules,
        color: formData.tableColor,
      });
    } else if (isInstrumentNode) {
      // For instrument nodes
      onSave(node.id, {
        ...node.data,
        label: formData.label,
        instrumentType: formData.instrumentType,
        instrumentName: formData.instrumentName,
        color: formData.instrumentColor,
        displayMeasurements: formData.displayMeasurements,
      });
    } else {
      // For common equipment without code, ensure we have equipment type
      if (isCommonEquipment && !formData.equipmentCode) {
        onSave(node.id, {
          ...node.data,
          equipmentType: formData.equipmentType,
          equipmentName: formData.equipmentName || `공통설비 (${formData.equipmentType})`,
          label: formData.equipmentName || `공통설비 (${formData.equipmentType})`,
          displayMeasurements: formData.displayMeasurements,
        });
        onClose();
        return;
      }

      const selectedEquipment = availableEquipment.find(
        (eq) => eq.equipment_code === formData.equipmentCode
      );

      onSave(node.id, {
        ...node.data,
        equipmentType: formData.equipmentType,
        equipmentCode: formData.equipmentCode,
        equipmentName: formData.equipmentName,
        label: formData.equipmentName,
        displayMeasurements: formData.displayMeasurements,
      });
    }
    onClose();
  };

  // Drag and drop handlers
  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;

    const newDisplayMeasurements = [...formData.displayMeasurements];
    const [removed] = newDisplayMeasurements.splice(draggedIndex, 1);
    newDisplayMeasurements.splice(dropIndex, 0, removed);

    setFormData({ ...formData, displayMeasurements: newDisplayMeasurements });
    setDraggedIndex(null);
  };

  const toggleMeasurementExpanded = (code: string) => {
    const newExpanded = new Set(expandedMeasurements);
    if (newExpanded.has(code)) {
      newExpanded.delete(code);
    } else {
      newExpanded.add(code);
    }
    setExpandedMeasurements(newExpanded);
  };

  const getSpecStatusColor = (status: string) => {
    switch (status) {
      case 'ABOVE_SPEC':
        return 'text-red-600';
      case 'BELOW_SPEC':
        return 'text-orange-600';
      default:
        return 'text-green-600';
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className={`bg-white rounded-lg shadow-lg w-full ${isTableNode ? 'max-w-4xl' : 'max-w-2xl'} max-h-[95vh] flex flex-col`}>
        <div className="flex items-center justify-between px-6 py-4 border-b flex-shrink-0">
          <h2 className="text-lg font-semibold">
            {node.type === 'group' ? 'Configure Group' : 
             isTableNode ? 'Configure Table Node' :
             isInstrumentNode ? 'Configure Instrument Node' : 'Configure Equipment Node'}
          </h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <form className="p-6 space-y-4 overflow-y-auto flex-1">
          {node.type === 'group' ? (
            <>
              {/* Group configuration fields remain the same */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Group Label
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>

              {/* Other group fields... */}
            </>
          ) : isTableNode ? (
            <>
              {/* Table Node Configuration */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Table Label
                </label>
                <input
                  type="text"
                  value={formData.label}
                  onChange={(e) => setFormData({ ...formData, label: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  placeholder="Enter table name"
                />
              </div>

              {/* Data Source Selection */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Data Source <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.queryConfig.dataSourceId}
                  onChange={(e) => setFormData({
                    ...formData,
                    queryConfig: { ...formData.queryConfig, dataSourceId: e.target.value }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                >
                  <option value="">Select data source</option>
                  {availableDataSources.map((ds) => (
                    <option key={ds.id} value={ds.id}>
                      {ds.source_type.toUpperCase()} - {ds.id.slice(0, 8)}...
                    </option>
                  ))}
                </select>
              </div>

              {/* SQL Query */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    SQL Query <span className="text-red-500">*</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleTestQuery}
                    disabled={isTestingQuery || !formData.queryConfig.sql || !formData.queryConfig.dataSourceId}
                    className="flex items-center space-x-1 px-3 py-1 bg-black text-white rounded text-sm hover:bg-gray-800 disabled:opacity-50"
                  >
                    <Play size={12} />
                    <span>{isTestingQuery ? 'Testing...' : 'Test Query'}</span>
                  </button>
                </div>
                <QueryEditor
                  value={formData.queryConfig.sql}
                  onChange={(value) => setFormData({
                    ...formData,
                    queryConfig: { ...formData.queryConfig, sql: value }
                  })}
                  placeholder="SELECT id, value, usl, lsl FROM measurements WHERE ..."
                  error={queryError}
                  height="200px"
                />
                {queryResults && (
                  <div className="mt-2 p-3 bg-green-50 border border-green-200 rounded">
                    <div className="text-green-800 font-medium mb-2">✅ Query Results Preview:</div>
                    <div className="text-green-700 text-sm mb-3">
                      {queryResults.columns?.length || 0} columns, {queryResults.row_count || 0} rows returned
                    </div>
                    
                    {/* Data Preview Table */}
                    {queryResults.data && Array.isArray(queryResults.data) && queryResults.data.length > 0 && (
                      <div className="bg-white border rounded overflow-hidden">
                        <div className="text-xs font-medium text-gray-700 bg-gray-100 px-2 py-1 border-b">
                          📊 Data Preview (First {Math.min(queryResults.data.length, 5)} rows with column mapping)
                        </div>
                        <div className="overflow-x-auto max-h-64">
                          <table className="w-full text-xs">
                            <thead className="bg-gray-50 sticky top-0">
                              <tr>
                                {queryResults.columns?.map((dbColumn: string, index: number) => {
                                  // Find matching configured column
                                  const configuredColumn = formData.tableConfig.columns.find((col: any) => col.field === dbColumn);
                                  const columnType = configuredColumn?.type || 'unmapped';
                                  const columnHeader = configuredColumn?.header || dbColumn;
                                  
                                  return (
                                    <th
                                      key={index}
                                      className={`px-2 py-2 text-left font-medium border-r last:border-r-0 ${
                                        configuredColumn 
                                          ? 'text-green-700 bg-green-50' 
                                          : 'text-orange-700 bg-orange-50'
                                      }`}
                                      title={configuredColumn 
                                        ? `✓ Mapped as: ${columnType} → "${columnHeader}"` 
                                        : `⚠️ Not mapped in column configuration`
                                      }
                                    >
                                      <div className="flex flex-col">
                                        <span className="font-medium">{columnHeader}</span>
                                        <span className="text-[10px] text-gray-500">
                                          {dbColumn} {configuredColumn && `(${columnType})`}
                                        </span>
                                        {configuredColumn ? (
                                          <span className="text-[10px] text-green-600">✓ Mapped</span>
                                        ) : (
                                          <span className="text-[10px] text-orange-600">⚠️ Unmapped</span>
                                        )}
                                      </div>
                                    </th>
                                  );
                                })}
                              </tr>
                            </thead>
                            <tbody>
                              {queryResults.data.slice(0, 5).map((row: any, rowIndex: number) => (
                                <tr key={rowIndex} className="border-b hover:bg-gray-50">
                                  {queryResults.columns?.map((dbColumn: string, colIndex: number) => {
                                    const configuredColumn = formData.tableConfig.columns.find((col: any) => col.field === dbColumn);
                                    const cellValue = row[dbColumn];
                                    const columnType = configuredColumn?.type || 'text';
                                    
                                    return (
                                      <td
                                        key={colIndex}
                                        className={`px-2 py-2 border-r last:border-r-0 ${
                                          configuredColumn ? 'bg-white' : 'bg-orange-50'
                                        }`}
                                      >
                                        {columnType === 'status' ? (
                                          <div className="flex items-center space-x-1">
                                            <div className="w-2 h-2 rounded-full bg-green-500"></div>
                                            <span className="text-green-600 font-medium text-[10px]">Status calc</span>
                                          </div>
                                        ) : columnType === 'value' ? (
                                          <span className="font-semibold text-blue-600">
                                            {typeof cellValue === 'number' ? cellValue.toLocaleString() : String(cellValue || '-')}
                                          </span>
                                        ) : columnType === 'usl' || columnType === 'lsl' ? (
                                          <span className="font-medium text-red-600">
                                            {typeof cellValue === 'number' ? cellValue.toLocaleString() : String(cellValue || '-')}
                                          </span>
                                        ) : (
                                          <span className="text-gray-800">
                                            {String(cellValue || '-')}
                                          </span>
                                        )}
                                      </td>
                                    );
                                  })}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        
                        {/* Column Mapping Summary */}
                        <div className="bg-gray-50 px-2 py-2 border-t text-xs">
                          <div className="flex items-center justify-between">
                            <div className="text-gray-600">
                              <span className="font-medium">Mapping Status:</span>
                              <span className="ml-2 text-green-600">
                                ✓ {formData.tableConfig.columns.filter((col: any) => 
                                  queryResults.columns?.includes(col.field)
                                ).length} mapped
                              </span>
                              <span className="ml-2 text-orange-600">
                                ⚠️ {(queryResults.columns?.length || 0) - 
                                    formData.tableConfig.columns.filter((col: any) => 
                                      queryResults.columns?.includes(col.field)
                                    ).length} unmapped
                              </span>
                            </div>
                            <div className="text-gray-500">
                              Status calculation: {
                                formData.statusRules.valueField && 
                                formData.statusRules.uslField && 
                                formData.statusRules.lslField && 
                                formData.statusRules.idField
                                  ? '✅ Ready' 
                                  : '⚠️ Incomplete'
                              }
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                    
                    {/* Available columns for mapping */}
                    {queryResults.columns && Array.isArray(queryResults.columns) && (
                      <div className="mt-3 p-2 bg-white border rounded">
                        <div className="text-xs font-medium text-gray-700 mb-2">
                          📋 Available Database Columns:
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {queryResults.columns.map((column: string) => {
                            const isMapped = formData.tableConfig.columns.some((col: any) => col.field === column);
                            return (
                              <span
                                key={column}
                                className={`px-2 py-1 rounded text-xs font-mono ${
                                  isMapped 
                                    ? 'bg-green-100 text-green-800 border border-green-200' 
                                    : 'bg-orange-100 text-orange-800 border border-orange-200'
                                }`}
                                title={isMapped ? 'Column is mapped' : 'Column not mapped - add to table configuration'}
                              >
                                {column} {isMapped ? '✓' : '⚠️'}
                              </span>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Refresh Interval */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Refresh Interval (seconds)
                </label>
                <input
                  type="number"
                  min="5"
                  max="3600"
                  value={formData.queryConfig.refreshInterval}
                  onChange={(e) => setFormData({
                    ...formData,
                    queryConfig: { ...formData.queryConfig, refreshInterval: parseInt(e.target.value) || 30 }
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>

              {/* Table Columns Configuration */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    Table Columns Configuration
                  </label>
                  <button
                    type="button"
                    onClick={addTableColumn}
                    className="flex items-center space-x-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-sm hover:bg-gray-200"
                  >
                    <Plus size={12} />
                    <span>Add Column</span>
                  </button>
                </div>
                
                {/* Column Type Legend */}
                <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded text-sm">
                  <div className="font-medium text-blue-800 mb-2">Column Types Guide:</div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="font-medium text-blue-700">📋 ID:</span> Unique identifier</div>
                    <div><span className="font-medium text-green-700">📊 Value:</span> Measured value (for status calc)</div>
                    <div><span className="font-medium text-red-700">📈 USL:</span> Upper Spec Limit</div>
                    <div><span className="font-medium text-orange-700">📉 LSL:</span> Lower Spec Limit</div>
                    <div><span className="font-medium text-purple-700">🎯 Status:</span> Auto-calculated status</div>
                    <div><span className="font-medium text-gray-700">📝 Text:</span> General text data</div>
                  </div>
                </div>
                
                <div className="space-y-3 border rounded p-3 bg-gray-50">
                  {formData.tableConfig.columns.map((column: any, index: number) => (
                    <div key={index} className="bg-white p-3 rounded border">
                      {/* Column Header */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="font-medium text-sm">Column {index + 1}</span>
                        <button
                          type="button"
                          onClick={() => removeTableColumn(index)}
                          className="p-1 text-red-500 hover:text-red-700"
                          title="Remove column"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      
                      {/* Column Configuration */}
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Database Field Name *</label>
                          <input
                            type="text"
                            value={column.field}
                            onChange={(e) => {
                              updateTableColumn(index, 'field', e.target.value);
                              // Auto-update status rules when field names change
                              updateStatusRulesFromColumns(formData.tableConfig.columns, index, 'field', e.target.value);
                            }}
                            placeholder="e.g., measurement_value"
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Display Header *</label>
                          <input
                            type="text"
                            value={column.header}
                            onChange={(e) => updateTableColumn(index, 'header', e.target.value)}
                            placeholder="e.g., Measurement Value"
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                        
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Data Type *</label>
                          <select
                            value={column.type}
                            onChange={(e) => {
                              updateTableColumn(index, 'type', e.target.value);
                              // Auto-update status rules when type changes
                              updateStatusRulesFromColumns(formData.tableConfig.columns, index, 'type', e.target.value);
                            }}
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          >
                            <option value="text">📝 Text - General text data</option>
                            <option value="id">📋 ID - Unique identifier</option>
                            <option value="value">📊 Value - Measured value (for status)</option>
                            <option value="usl">📈 USL - Upper Spec Limit</option>
                            <option value="lsl">📉 LSL - Lower Spec Limit</option>
                            <option value="status">🎯 Status - Auto-calculated result</option>
                          </select>
                        </div>
                        
                        <div>
                          <label className="block text-xs text-gray-600 mb-1">Column Width (px)</label>
                          <input
                            type="number"
                            value={column.width}
                            onChange={(e) => updateTableColumn(index, 'width', parseInt(e.target.value) || 80)}
                            placeholder="80"
                            min="50"
                            max="300"
                            className="w-full px-2 py-1 text-sm border rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                          />
                        </div>
                      </div>
                      
                      {/* Column Type Description */}
                      {column.type && (
                        <div className="mt-2 p-2 bg-gray-50 rounded text-xs">
                          {column.type === 'value' && (
                            <span className="text-green-700">💡 This column will be compared against USL/LSL for status calculation</span>
                          )}
                          {column.type === 'usl' && (
                            <span className="text-red-700">💡 Upper specification limit - values above this will show as HIGH status</span>
                          )}
                          {column.type === 'lsl' && (
                            <span className="text-orange-700">💡 Lower specification limit - values below this will show as LOW status</span>
                          )}
                          {column.type === 'status' && (
                            <span className="text-purple-700">💡 Auto-calculated status based on Value vs USL/LSL comparison</span>
                          )}
                          {column.type === 'id' && (
                            <span className="text-blue-700">💡 Unique identifier for each row (e.g., equipment_id, measurement_id)</span>
                          )}
                          {column.type === 'text' && (
                            <span className="text-gray-700">💡 General text data that will be displayed as-is</span>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                  {formData.tableConfig.columns.length === 0 && (
                    <div className="text-center text-gray-500 py-8 border-2 border-dashed border-gray-300 rounded">
                      <div className="mb-2">📊 No columns configured</div>
                      <div className="text-xs">Click "Add Column" to start configuring your table columns</div>
                    </div>
                  )}
                </div>
              </div>

              {/* Status Calculation Rules - Auto-configured */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-sm font-medium">
                    Status Calculation Rules
                  </label>
                  <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">
                    Auto-configured from columns
                  </span>
                </div>
                
                {/* Status Calculation Logic Explanation */}
                <div className="mb-3 p-3 bg-purple-50 border border-purple-200 rounded text-sm">
                  <div className="font-medium text-purple-800 mb-2">🎯 Status Calculation Logic:</div>
                  <div className="text-xs text-purple-700 space-y-1">
                    <div>• <strong>IN_SPEC (OK):</strong> LSL ≤ Value ≤ USL</div>
                    <div>• <strong>ABOVE_SPEC (HIGH):</strong> Value &gt; USL</div>
                    <div>• <strong>BELOW_SPEC (LOW):</strong> Value &lt; LSL</div>
                  </div>
                </div>
                
                {/* Auto-configured Field Mappings */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">📊 Value Field (for comparison)</label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={formData.statusRules.valueField || 'Not configured'}
                        readOnly
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-700"
                        placeholder="Select a 'Value' type column"
                      />
                      {formData.statusRules.valueField && (
                        <span className="ml-2 text-green-600">✓</span>
                      )}
                    </div>
                    {!formData.statusRules.valueField && (
                      <div className="text-xs text-orange-600 mt-1">⚠️ Add a column with 'Value' type</div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">📋 ID Field (identifier)</label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={formData.statusRules.idField || 'Not configured'}
                        readOnly
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-700"
                        placeholder="Select an 'ID' type column"
                      />
                      {formData.statusRules.idField && (
                        <span className="ml-2 text-green-600">✓</span>
                      )}
                    </div>
                    {!formData.statusRules.idField && (
                      <div className="text-xs text-orange-600 mt-1">⚠️ Add a column with 'ID' type</div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">📈 USL Field (upper limit)</label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={formData.statusRules.uslField || 'Not configured'}
                        readOnly
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-700"
                        placeholder="Select a 'USL' type column"
                      />
                      {formData.statusRules.uslField && (
                        <span className="ml-2 text-green-600">✓</span>
                      )}
                    </div>
                    {!formData.statusRules.uslField && (
                      <div className="text-xs text-orange-600 mt-1">⚠️ Add a column with 'USL' type</div>
                    )}
                  </div>
                  
                  <div>
                    <label className="block text-xs text-gray-600 mb-1">📉 LSL Field (lower limit)</label>
                    <div className="flex items-center">
                      <input
                        type="text"
                        value={formData.statusRules.lslField || 'Not configured'}
                        readOnly
                        className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded bg-gray-50 text-gray-700"
                        placeholder="Select a 'LSL' type column"
                      />
                      {formData.statusRules.lslField && (
                        <span className="ml-2 text-green-600">✓</span>
                      )}
                    </div>
                    {!formData.statusRules.lslField && (
                      <div className="text-xs text-orange-600 mt-1">⚠️ Add a column with 'LSL' type</div>
                    )}
                  </div>
                </div>
                
                {/* Configuration Status Summary */}
                <div className="mt-3 p-2 bg-gray-50 border rounded">
                  <div className="text-xs text-gray-700">
                    <strong>Configuration Status:</strong>
                    {formData.statusRules.valueField && formData.statusRules.uslField && formData.statusRules.lslField && formData.statusRules.idField ? (
                      <span className="text-green-600 ml-1">✅ All fields configured - Status calculation ready!</span>
                    ) : (
                      <span className="text-orange-600 ml-1">⚠️ Configure column types above to enable status calculation</span>
                    )}
                  </div>
                </div>
              </div>

              {/* Table Color */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Table Color
                </label>
                <div className="flex items-center space-x-3">
                  <input
                    type="color"
                    value={formData.tableColor}
                    onChange={(e) => setFormData({ ...formData, tableColor: e.target.value })}
                    className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                  />
                  <input
                    type="text"
                    value={formData.tableColor}
                    onChange={(e) => setFormData({ ...formData, tableColor: e.target.value })}
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black text-sm font-mono"
                    placeholder="#3b82f6"
                  />
                </div>
              </div>
            </>
          ) : (
            <>
              {/* Equipment Type - Hide for instrument nodes */}
              {!isInstrumentNode && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Equipment Type {isCommonEquipment && <span className="text-red-500">*</span>}
                  </label>
                  {isCommonEquipment && (
                    <p className="text-xs text-gray-500 mb-2">
                      공통설비는 설비 타입을 반드시 선택해야 합니다.
                    </p>
                  )}
                  <select
                    value={formData.equipmentType}
                    onChange={(e) => {
                      setFormData({
                        ...formData,
                        equipmentType: e.target.value,
                        equipmentCode: '',
                        displayMeasurements: [],
                      });
                    }}
                    className={`w-full px-3 py-2 border rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black ${
                      isCommonEquipment && !formData.equipmentType ? 'border-red-300' : 'border-gray-300'
                    }`}
                  >
                    <option value="">Select equipment type</option>
                    {dynamicEquipmentTypes.map((type) => (
                      <option key={type.code} value={type.code}>
                        {type.name} ({type.code})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* Equipment Code - Hide for instrument nodes */}
              {!isInstrumentNode && formData.equipmentType && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Equipment Code
                  </label>
                  <select
                    value={formData.equipmentCode}
                    onChange={(e) => {
                      const equipment = availableEquipment.find(
                        (eq) => eq.equipment_code === e.target.value
                      );
                      
                      setFormData({
                        ...formData,
                        equipmentCode: e.target.value,
                        equipmentName: equipment?.equipment_name || '',
                        displayMeasurements: [],
                      });
                    }}
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  >
                    <option value="">Select equipment</option>
                    {filteredEquipment.map((equipment) => (
                      <option key={equipment.equipment_code} value={equipment.equipment_code}>
                        {equipment.equipment_code} - {equipment.equipment_name}
                      </option>
                    ))}
                  </select>
                </div>
              )}


              {/* Display Name */}
              <div>
                <label className="block text-sm font-medium mb-2">
                  Display Name
                </label>
                <input
                  type="text"
                  value={isInstrumentNode ? formData.label : formData.equipmentName}
                  onChange={(e) =>
                    setFormData({ 
                      ...formData, 
                      ...(isInstrumentNode ? { label: e.target.value } : { equipmentName: e.target.value })
                    })
                  }
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  placeholder="Enter display name"
                />
              </div>

              {/* Instrument Node Color - Show only for instrument nodes */}
              {isInstrumentNode && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Node Color
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="color"
                      value={formData.instrumentColor}
                      onChange={(e) => setFormData({ ...formData, instrumentColor: e.target.value })}
                      className="w-12 h-10 border border-gray-300 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={formData.instrumentColor}
                      onChange={(e) => setFormData({ ...formData, instrumentColor: e.target.value })}
                      className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black text-sm font-mono"
                      placeholder="#6b7280"
                    />
                  </div>
                </div>
              )}


              {/* Available Measurements Section with Search */}
              {availableMeasurements.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Available Measurements (All Measurements)
                  </label>
                  <p className="text-xs text-gray-600 mb-2">
                    All measurements from the workspace - equipment code independent
                  </p>
                  
                  {/* Search input */}
                  <input
                    type="text"
                    value={availableMeasurementsSearchTerm}
                    onChange={(e) => setAvailableMeasurementsSearchTerm(e.target.value)}
                    placeholder="Search measurements by code..."
                    className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black mb-3"
                  />
                  
                  {/* Available measurements list */}
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2">
                    {Array.from(new Map(availableMeasurements.map(m => [m.measurement_code, m])).values())
                      .filter(measurement => 
                        measurement.measurement_code.toLowerCase().includes(availableMeasurementsSearchTerm.toLowerCase()) ||
                        measurement.measurement_desc.toLowerCase().includes(availableMeasurementsSearchTerm.toLowerCase())
                      )
                      .map((measurement, index) => {
                        const isSelected = formData.displayMeasurements.includes(measurement.measurement_code);
                        const details = measurementDetails[measurement.measurement_code];
                        
                        return (
                          <label
                            key={`${measurement.measurement_code}-${index}`}
                            className={`flex items-start space-x-3 p-2 rounded cursor-pointer hover:bg-gray-100 ${
                              isSelected ? 'bg-blue-50 border border-blue-200' : 'bg-white border border-gray-200'
                            }`}
                          >
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={(e) => {
                                if (e.target.checked) {
                                  setFormData({
                                    ...formData,
                                    displayMeasurements: [...formData.displayMeasurements, measurement.measurement_code]
                                  });
                                } else {
                                  setFormData({
                                    ...formData,
                                    displayMeasurements: formData.displayMeasurements.filter((code: string) => code !== measurement.measurement_code)
                                  });
                                }
                              }}
                              className="mt-1 rounded border-gray-300 text-black focus:ring-black"
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between">
                                <div className="font-medium text-sm">
                                  {measurement.measurement_desc}
                                </div>
                                <div className="flex items-center space-x-1">
                                  {details && details.value !== undefined && (
                                    <span className={`text-xs font-medium ${getSpecStatusColor(details.spec_status || 'IN_SPEC')}`}>
                                      {typeof details.value === 'number' ? details.value.toLocaleString() : String(details.value)} {details.unit || ''}
                                    </span>
                                  )}
                                  {(details?.usl !== undefined || details?.lsl !== undefined) && (
                                    <Info size={12} className="text-gray-400" />
                                  )}
                                </div>
                              </div>
                              <div className="text-xs text-gray-500">Code: {measurement.measurement_code}</div>
                            </div>
                          </label>
                        );
                      })}
                  </div>
                </div>
              )}

              {/* Selected Measurements Display Section */}
              {formData.displayMeasurements.length > 0 && (
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Selected Measurements
                  </label>
                  <p className="text-xs text-gray-600 mb-2">Drag to reorder selected measurements:</p>
                  <div className="space-y-2 max-h-60 overflow-y-auto border rounded p-2 bg-gray-50">
                    {formData.displayMeasurements.map((code: string, index: number) => {
                      const measurement = measurementDetails[code] || 
                        availableMeasurements.find(m => m.measurement_code === code);
                      if (!measurement) return null;
                      
                      return (
                        <div
                          key={code}
                          draggable
                          onDragStart={(e) => handleDragStart(e, index)}
                          onDragOver={handleDragOver}
                          onDrop={(e) => handleDrop(e, index)}
                          className="bg-white rounded border p-2 cursor-move hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex items-center space-x-2">
                              <GripVertical size={16} className="text-gray-400" />
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {measurement.measurement_desc || measurement.desc}
                                </div>
                                <div className="text-xs text-gray-500">Code: {code}</div>
                              </div>
                            </div>
                            <div className="flex items-center space-x-2">
                              <button
                                type="button"
                                onClick={() => toggleMeasurementExpanded(code)}
                                className="text-gray-400 hover:text-gray-600"
                              >
                                {expandedMeasurements.has(code) ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setFormData({
                                    ...formData,
                                    displayMeasurements: formData.displayMeasurements.filter((m: string) => m !== code)
                                  });
                                }}
                                className="text-red-400 hover:text-red-600"
                              >
                                <X size={16} />
                              </button>
                            </div>
                          </div>
                          
                          {expandedMeasurements.has(code) && measurement.value !== undefined && (
                            <div className="mt-2 pt-2 border-t text-xs space-y-1">
                              <div className="flex justify-between">
                                <span className="text-gray-500">Latest Value:</span>
                                <span className={`font-medium ${getSpecStatusColor(measurement.spec_status || 'IN_SPEC')}`}>
                                  {typeof measurement.value === 'number' ? measurement.value.toLocaleString() : String(measurement.value || '')} {measurement.unit || ''}
                                </span>
                              </div>
                              {measurement.usl !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Upper Spec Limit:</span>
                                  <span>{String(measurement.usl)}</span>
                                </div>
                              )}
                              {measurement.lsl !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Lower Spec Limit:</span>
                                  <span>{String(measurement.lsl)}</span>
                                </div>
                              )}
                              {measurement.target !== undefined && (
                                <div className="flex justify-between">
                                  <span className="text-gray-500">Target:</span>
                                  <span>{String(measurement.target)}</span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

            </>
          )}
        </form>
        
        <div className="flex justify-between px-6 py-4 border-t flex-shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800"
          >
            Save Configuration
          </button>
        </div>
      </div>
    </div>
  );
};