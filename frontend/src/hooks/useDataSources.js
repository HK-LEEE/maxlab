import { useState, useEffect, useCallback } from 'react';

/**
 * Custom hook for managing data sources in Process Flow Editor
 * Automatically selects the first defined data source instead of 'default'
 */
export function useDataSources(workspaceId = 'personaltest') {
  const [dataSources, setDataSources] = useState([]);
  const [selectedDataSource, setSelectedDataSource] = useState(null);
  const [defaultDataSource, setDefaultDataSource] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch data sources list
  const fetchDataSources = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/v1/personal-test/process-flow/data-sources?workspace_id=${workspaceId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch data sources: ${response.statusText}`);
      }

      const sources = await response.json();
      setDataSources(sources);

      // Auto-select logic: prefer defined data sources over 'default'
      if (sources && sources.length > 0) {
        // Filter active sources and prioritize by order
        const activeSources = sources.filter(ds => ds.is_active !== false);
        // Sort by priority (lower number = higher priority) or creation order
        const sortedSources = activeSources.sort((a, b) => (a.priority || 0) - (b.priority || 0));
        const defaultSource = sortedSources[0] || sources[0];
        
        setSelectedDataSource(defaultSource.id);
        setDefaultDataSource(defaultSource);
        
        console.log('Auto-selected data source:', defaultSource, `(${sources.length} sources available)`);
      } else {
        // No defined data sources, use null (workspace default)
        setSelectedDataSource(null);
        setDefaultDataSource(null);
        console.log('No data sources found, using workspace default');
      }
    } catch (err) {
      console.error('Error fetching data sources:', err);
      setError(err.message);
      // On error, fallback to null (workspace default)
      setSelectedDataSource(null);
      setDefaultDataSource(null);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  // Fetch default data source info (optional endpoint)
  const fetchDefaultDataSource = useCallback(async () => {
    try {
      const response = await fetch(
        `/v1/personal-test/process-flow/default-data-source?workspace_id=${workspaceId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (response.ok) {
        const defaultInfo = await response.json();
        if (!defaultInfo.use_workspace_default && defaultInfo.default_data_source_id) {
          // Update selection if we have a specific default
          setSelectedDataSource(defaultInfo.default_data_source_id);
        }
      }
    } catch (err) {
      // This is optional, so we don't set error state
      console.log('Default data source endpoint not available:', err);
    }
  }, [workspaceId]);

  // Initialize on mount
  useEffect(() => {
    fetchDataSources();
  }, [fetchDataSources]);

  // Optionally fetch default info after data sources are loaded
  useEffect(() => {
    if (!loading && dataSources.length === 0) {
      fetchDefaultDataSource();
    }
  }, [loading, dataSources.length, fetchDefaultDataSource]);

  // Helper function to get display name for a data source
  const getDataSourceDisplayName = useCallback((dataSourceId) => {
    if (!dataSourceId) return 'Workspace Default';
    
    const source = dataSources.find(ds => ds.id === dataSourceId);
    if (source) {
      return `${source.source_type?.toUpperCase() || 'Unknown'} - ${source.config_name || source.id}`;
    }
    return dataSourceId;
  }, [dataSources]);

  // Refresh data sources
  const refreshDataSources = useCallback(() => {
    fetchDataSources();
  }, [fetchDataSources]);

  return {
    dataSources,
    selectedDataSource,
    setSelectedDataSource,
    defaultDataSource,
    loading,
    error,
    refreshDataSources,
    getDataSourceDisplayName
  };
}