/**
 * Utility functions for data source management
 */

/**
 * Format data source for display
 */
export function formatDataSource(dataSource) {
  if (!dataSource) {
    return {
      label: 'Workspace Default',
      value: null,
      type: 'default',
      description: 'Using workspace default configuration'
    };
  }

  const sourceType = dataSource.source_type?.toUpperCase() || 'UNKNOWN';
  const configName = dataSource.config_name || `Data Source ${dataSource.id.slice(0, 8)}`;
  const isActive = dataSource.is_active !== false;

  return {
    label: `${sourceType} - ${configName}`,
    value: dataSource.id,
    type: dataSource.source_type,
    isActive,
    description: `${sourceType} data source${!isActive ? ' (Inactive)' : ''}`
  };
}

/**
 * Sort data sources by priority
 * Active sources first, then by creation date
 */
export function sortDataSources(dataSources) {
  return [...dataSources].sort((a, b) => {
    // Active sources first
    if (a.is_active !== b.is_active) {
      return a.is_active ? -1 : 1;
    }
    
    // Then by creation date (newest first)
    return new Date(b.created_at) - new Date(a.created_at);
  });
}

/**
 * Get the default data source from a list
 * Returns the first active source, or the first source if none are active
 */
export function getDefaultDataSource(dataSources) {
  if (!dataSources || dataSources.length === 0) {
    return null;
  }

  const sorted = sortDataSources(dataSources);
  const activeSource = sorted.find(ds => ds.is_active !== false);
  
  return activeSource || sorted[0];
}

/**
 * Validate data source selection
 * Returns true if the selection is valid
 */
export function isValidDataSourceSelection(dataSourceId, dataSources) {
  // Null is valid (workspace default)
  if (!dataSourceId) {
    return true;
  }

  // Check if the selected ID exists in the list
  return dataSources.some(ds => ds.id === dataSourceId);
}

/**
 * Get data source connection info for display (sanitized)
 */
export function getDataSourceInfo(dataSource) {
  if (!dataSource) {
    return {
      type: 'workspace_default',
      displayName: 'Workspace Default',
      connectionType: 'PostgreSQL',
      status: 'active'
    };
  }

  return {
    type: dataSource.source_type?.toLowerCase() || 'unknown',
    displayName: formatDataSource(dataSource).label,
    connectionType: dataSource.source_type?.toUpperCase() || 'Unknown',
    status: dataSource.is_active ? 'active' : 'inactive',
    createdAt: dataSource.created_at,
    updatedAt: dataSource.updated_at
  };
}

/**
 * Handle data source API errors
 */
export function handleDataSourceError(error) {
  console.error('Data source error:', error);

  if (error.response) {
    // Server responded with error
    switch (error.response.status) {
      case 401:
        return 'Authentication required. Please log in.';
      case 403:
        return 'You do not have permission to access data sources.';
      case 404:
        return 'Data source not found.';
      case 500:
        return 'Server error. Please try again later.';
      default:
        return error.response.data?.message || 'An error occurred.';
    }
  } else if (error.request) {
    // No response from server
    return 'Cannot connect to server. Please check your connection.';
  } else {
    // Other errors
    return error.message || 'An unexpected error occurred.';
  }
}