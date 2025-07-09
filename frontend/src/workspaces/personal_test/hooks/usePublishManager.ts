import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../api/client';
import { toast } from 'react-hot-toast';

export interface ProcessFlow {
  id: string;
  name: string;
  workspace_id: string;
  flow_data: any;
  created_at: string;
  updated_at: string;
  is_published: boolean;
  publish_token?: string;
  published_at?: string;
  created_by?: string;
}

export interface PublishStats {
  totalFlows: number;
  publishedFlows: number;
  privateFlows: number;
  totalViews: number;
}

export const usePublishManager = (workspaceId: string) => {
  const [flows, setFlows] = useState<ProcessFlow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<PublishStats>({
    totalFlows: 0,
    publishedFlows: 0,
    privateFlows: 0,
    totalViews: 0
  });

  const workspaceUuid = '21ee03db-90c4-4592-b00f-c44801e0b164';

  // Load flows from API
  const loadFlows = useCallback(async () => {
    if (!workspaceId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get(
        `/api/v1/personal-test/process-flow/flows?workspace_id=${workspaceUuid}&_t=${Date.now()}`
      );
      
      const flowsData = response.data;
      setFlows(flowsData);
      
      // Calculate stats
      const totalFlows = flowsData.length;
      const publishedFlows = flowsData.filter((flow: ProcessFlow) => flow.is_published).length;
      const privateFlows = totalFlows - publishedFlows;
      
      setStats({
        totalFlows,
        publishedFlows,
        privateFlows,
        totalViews: 0 // TODO: Implement view tracking
      });
      
    } catch (err: any) {
      console.error('Failed to load flows:', err);
      setError('플로우 목록을 불러오는데 실패했습니다.');
      toast.error('플로우 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId]);

  // Publish a flow
  const publishFlow = useCallback(async (flowId: string) => {
    try {
      const response = await apiClient.put(
        `/api/v1/personal-test/process-flow/flows/${flowId}/publish`,
        { workspace_id: workspaceUuid }
      );
      
      // Update the flow in state
      setFlows(prev => prev.map(flow => 
        flow.id === flowId 
          ? { 
              ...flow, 
              is_published: true, 
              publish_token: response.data.publish_token,
              published_at: new Date().toISOString()
            }
          : flow
      ));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        publishedFlows: prev.publishedFlows + 1,
        privateFlows: prev.privateFlows - 1
      }));
      
      toast.success('플로우가 성공적으로 게시되었습니다.');
      return response.data;
      
    } catch (err: any) {
      console.error('Failed to publish flow:', err);
      const errorMessage = err.response?.data?.detail || '플로우 게시에 실패했습니다.';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Unpublish a flow
  const unpublishFlow = useCallback(async (flowId: string) => {
    try {
      await apiClient.put(
        `/api/v1/personal-test/process-flow/flows/${flowId}/unpublish`,
        { workspace_id: workspaceUuid }
      );
      
      // Update the flow in state
      setFlows(prev => prev.map(flow => 
        flow.id === flowId 
          ? { 
              ...flow, 
              is_published: false, 
              publish_token: undefined,
              published_at: undefined
            }
          : flow
      ));
      
      // Update stats
      setStats(prev => ({
        ...prev,
        publishedFlows: prev.publishedFlows - 1,
        privateFlows: prev.privateFlows + 1
      }));
      
      toast.success('플로우 게시가 취소되었습니다.');
      
    } catch (err: any) {
      console.error('Failed to unpublish flow:', err);
      const errorMessage = err.response?.data?.detail || '플로우 게시 취소에 실패했습니다.';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, []);

  // Generate public URL for a published flow
  const getPublicUrl = useCallback((publishToken: string) => {
    return `${window.location.origin}/public/flow/${publishToken}`;
  }, []);

  // Copy URL to clipboard
  const copyPublicUrl = useCallback(async (publishToken: string) => {
    const url = getPublicUrl(publishToken);
    try {
      await navigator.clipboard.writeText(url);
      toast.success('공개 링크가 클립보드에 복사되었습니다.');
    } catch (err) {
      console.error('Failed to copy URL:', err);
      toast.error('링크 복사에 실패했습니다.');
    }
  }, [getPublicUrl]);

  // Initial load
  useEffect(() => {
    loadFlows();
  }, [loadFlows]);

  return {
    flows,
    isLoading,
    error,
    stats,
    publishFlow,
    unpublishFlow,
    getPublicUrl,
    copyPublicUrl,
    refreshFlows: loadFlows,
  };
};