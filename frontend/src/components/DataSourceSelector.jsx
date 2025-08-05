import React from 'react';
import { Select, Spin, Alert, Tooltip } from 'antd';
import { DatabaseOutlined, InfoCircleOutlined } from '@ant-design/icons';

const { Option } = Select;

/**
 * Data Source Selector Component
 * Displays available data sources and allows selection
 * Automatically selects first defined data source instead of showing 'default'
 */
const DataSourceSelector = ({ 
  value, 
  onChange, 
  dataSources = [], 
  loading = false, 
  error = null,
  disabled = false,
  placeholder = "Select data source",
  style,
  className,
  size = "middle",
  allowClear = false,
  showTooltip = true
}) => {
  // Handle change event
  const handleChange = (selectedValue) => {
    // Convert empty string to null for workspace default
    onChange(selectedValue || null);
  };

  // Render loading state
  if (loading) {
    return (
      <Spin size="small">
        <Select
          style={{ width: 200, ...style }}
          className={className}
          disabled
          placeholder="Loading data sources..."
          size={size}
        />
      </Spin>
    );
  }

  // Render error state
  if (error) {
    return (
      <Alert
        message="Failed to load data sources"
        description={error}
        type="error"
        showIcon
        style={{ marginBottom: 16 }}
      />
    );
  }

  // Format data source option label
  const getOptionLabel = (source) => {
    const sourceType = source.source_type?.toUpperCase() || 'UNKNOWN';
    const isActive = source.is_active !== false;
    
    return (
      <span style={{ color: isActive ? 'inherit' : '#999' }}>
        <DatabaseOutlined style={{ marginRight: 8 }} />
        {sourceType} - {source.config_name || `Data Source ${source.id.slice(0, 8)}`}
        {!isActive && ' (Inactive)'}
      </span>
    );
  };

  // Render selector
  return (
    <div style={{ display: 'inline-block' }}>
      <Select
        value={value || ''}
        onChange={handleChange}
        style={{ minWidth: 200, ...style }}
        className={className}
        disabled={disabled}
        placeholder={placeholder}
        size={size}
        allowClear={allowClear}
        suffixIcon={
          showTooltip ? (
            <Tooltip title="Select a data source for this process flow. Leave empty to use workspace default.">
              <InfoCircleOutlined />
            </Tooltip>
          ) : (
            <DatabaseOutlined />
          )
        }
      >
        {/* Workspace default option */}
        <Option value="">
          <span style={{ fontStyle: 'italic', color: '#666' }}>
            <DatabaseOutlined style={{ marginRight: 8 }} />
            Workspace Default
          </span>
        </Option>
        
        {/* Defined data sources */}
        {dataSources.map((source) => (
          <Option 
            key={source.id} 
            value={source.id}
            disabled={source.is_active === false}
          >
            {getOptionLabel(source)}
          </Option>
        ))}
      </Select>
      
      {/* Show info if no data sources are defined */}
      {dataSources.length === 0 && !loading && (
        <div style={{ marginTop: 8, fontSize: 12, color: '#666' }}>
          <InfoCircleOutlined style={{ marginRight: 4 }} />
          No data sources defined. Using workspace default configuration.
        </div>
      )}
    </div>
  );
};

export default DataSourceSelector;