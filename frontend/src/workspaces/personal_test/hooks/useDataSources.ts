import { useState, useEffect } from 'react';
import { apiClient } from '../../../api/client';

interface DataSource {
  id: string;
  source_type: string;
  connection_string: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface DataSourceStatus {
  id: string;
  source_type: string;
  status: 'connected' | 'disconnected' | 'error';
  connection_info: string;
  last_checked: string;
  error?: string;
}

export const useDataSources = (workspaceId: string) => {
  const [dataSources, setDataSources] = useState<DataSource[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Check if using default database (simplified - no longer used in monitoring)
  const isDefaultDatabase = (sources: DataSource[]) => {
    // No data sources configured
    if (sources.length === 0) {
      return true;
    }
    
    // Check if there are any properly configured active data sources
    const hasActiveDataSource = sources.some(ds => {
      const isActive = ds.is_active;
      const isNotDefault = ds.source_type !== 'default';
      
      // Check for connection string in multiple fields depending on source type
      let connectionString = ds.connection_string;
      if (ds.source_type === 'mssql' && !connectionString) {
        // For MSSQL, check mssql_connection_string field
        connectionString = (ds as any).mssql_connection_string;
      }
      
      const hasConnectionString = !!connectionString;
      const isNotDefaultConnectionString = connectionString !== 'default' && connectionString !== '';
      const isValidType = ds.source_type === 'mssql' || ds.source_type === 'postgresql' || ds.source_type === 'api';
      
      return isActive && isNotDefault && hasConnectionString && isNotDefaultConnectionString && isValidType;
    });
    
    return !hasActiveDataSource;
  };

  useEffect(() => {
    const fetchDataSources = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await apiClient.get(
          `/v1/personal-test/process-flow/data-sources?workspace_id=${workspaceId}`
        );
        
        setDataSources(response.data);
        
      } catch (err: any) {
        console.error('Failed to fetch data sources:', err);
        setError('Failed to load data sources');
      } finally {
        setIsLoading(false);
      }
    };

    if (workspaceId) {
      fetchDataSources();
    }
  }, [workspaceId]);

  return {
    dataSources,
    isLoading,
    error,
    isDefaultDatabase: isDefaultDatabase(dataSources),
  };
};

export const useDataSourceStatus = (dataSourceId: string | null) => {
  const [status, setStatus] = useState<DataSourceStatus | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const checkStatus = async () => {
    if (!dataSourceId) return;

    try {
      setIsLoading(true);
      setError(null);
      
      const response = await apiClient.get(
        `/v1/personal-test/process-flow/data-sources/${dataSourceId}/status`
      );
      
      setStatus(response.data);
    } catch (err: any) {
      console.error('Failed to check data source status:', err);
      setError(err.response?.data?.detail || 'Failed to check connection status');
      setStatus(null);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (dataSourceId) {
      checkStatus();
    }
  }, [dataSourceId]);

  return {
    status,
    isLoading,
    error,
    checkStatus, // Allow manual refresh
  };
};