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

  useEffect(() => {
    const fetchDataSources = async () => {
      try {
        setIsLoading(true);
        setError(null);
        
        const response = await apiClient.get(
          `/api/v1/personal-test/process-flow/data-sources?workspace_id=${workspaceId}`
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
        `/api/v1/personal-test/process-flow/data-sources/${dataSourceId}/status`
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