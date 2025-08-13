import React from 'react';
import { Database, Info, Loader2, AlertCircle } from 'lucide-react';

/**
 * Data Source Selector Component
 * Displays available data sources and allows selection
 * Automatically selects first defined data source instead of showing 'default'
 * Can conditionally hide default option when user-defined sources exist
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
  showTooltip = true,
  hideDefaultWhenUserSourcesExist = false
}) => {
  // Handle change event
  const handleChange = (event) => {
    const selectedValue = event.target.value;
    // Convert empty string to null for workspace default
    onChange(selectedValue || null);
  };

  // Render loading state
  if (loading) {
    return (
      <div className="flex items-center space-x-2" style={style}>
        <Loader2 size={16} className="animate-spin text-gray-500" />
        <select
          className={`border border-gray-300 rounded px-2 py-1 text-sm ${className || ''}`}
          disabled
        >
          <option>Loading data sources...</option>
        </select>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="flex items-center space-x-2 text-red-600 text-sm">
        <AlertCircle size={16} />
        <span>Failed to load data sources: {error}</span>
      </div>
    );
  }

  // Format data source option label
  const getOptionLabel = (source) => {
    const sourceType = source.source_type?.toUpperCase() || 'UNKNOWN';
    const isActive = source.is_active !== false;
    const configName = source.config_name || `Data Source ${source.id.slice(0, 8)}`;
    
    return `${sourceType} - ${configName}${!isActive ? ' (Inactive)' : ''}`;
  };

  // Determine if default option should be shown
  const shouldShowDefault = !hideDefaultWhenUserSourcesExist || dataSources.length === 0;

  // Render selector
  return (
    <div className="flex items-center space-x-2" style={style}>
      <select
        value={value || ''}
        onChange={handleChange}
        className={`border border-gray-300 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black focus:border-black ${className || ''}`}
        disabled={disabled}
        style={{ minWidth: 200 }}
      >
        {/* Workspace default option - conditionally rendered */}
        {shouldShowDefault && (
          <option value="" style={{ fontStyle: 'italic' }}>
            Workspace Default
          </option>
        )}
        
        {/* Defined data sources */}
        {dataSources.map((source) => (
          <option 
            key={source.id} 
            value={source.id}
            disabled={source.is_active === false}
            style={{ color: source.is_active === false ? '#999' : 'inherit' }}
          >
            {getOptionLabel(source)}
          </option>
        ))}
      </select>
      
      {showTooltip && (
        <div title="Select a data source for this process flow. Leave empty to use workspace default.">
          <Info size={16} className="text-gray-400 hover:text-gray-600 cursor-help" />
        </div>
      )}
      
      {/* Show info if no data sources are defined */}
      {dataSources.length === 0 && !loading && (
        <div className="flex items-center text-xs text-gray-500 mt-1">
          <Info size={12} className="mr-1" />
          No data sources defined. Using workspace default configuration.
        </div>
      )}
    </div>
  );
};

export default DataSourceSelector;