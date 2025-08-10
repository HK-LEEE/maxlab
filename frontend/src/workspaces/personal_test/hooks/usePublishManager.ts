import { useState, useEffect, useCallback } from 'react';
import { apiClient } from '../../../api/client';
import { toast } from 'react-hot-toast';
import { useAuthStore } from '../../../stores/authStore';
import { authService } from '../../../services/authService';
import log from '../../../utils/logger';

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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Load flows from API
  const loadFlows = useCallback(async () => {
    if (!workspaceId) return;
    
    // 인증 상태 확인
    if (!isAuthenticated) {
      log.warn('User not authenticated, skipping flow load');
      setError('로그인이 필요합니다.');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      const response = await apiClient.get(
        `/v1/personal-test/process-flow/flows?workspace_id=${workspaceUuid}&_t=${Date.now()}`
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
      
      const status = err.response?.status;
      
      if (status === 401 || status === 403) {
        log.info('Authentication error, attempting token refresh');
        
        // 토큰 갱신 시도
        const refreshSuccess = await authService.refreshToken();
        
        if (refreshSuccess) {
          log.info('Token refreshed, retrying flow load');
          // 재시도
          setTimeout(() => loadFlows(), 1000);
          return;
        } else {
          log.warn('Token refresh failed, redirecting to login');
          setError('인증이 만료되었습니다. 다시 로그인해주세요.');
          toast.error('인증이 만료되었습니다. 다시 로그인해주세요.');
          // authService.logout이 이미 호출됨
          return;
        }
      }
      
      setError('플로우 목록을 불러오는데 실패했습니다.');
      toast.error('플로우 목록을 불러오는데 실패했습니다.');
    } finally {
      setIsLoading(false);
    }
  }, [workspaceId, isAuthenticated]);

  // Publish a flow
  const publishFlow = useCallback(async (flowId: string) => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다.');
      throw new Error('로그인이 필요합니다.');
    }

    try {
      // Debug: 게시하려는 플로우 확인
      const flowToPublish = flows.find(f => f.id === flowId);
      log.info('Publishing flow', {
        flowId,
        flowName: flowToPublish?.name,
        totalNodes: flowToPublish?.flow_data?.nodes?.length || 0
      });

      const response = await apiClient.put(
        `/v1/personal-test/process-flow/flows/${flowId}/publish`,
        { workspace_id: workspaceUuid }
      );
      
      log.info('Flow published successfully', { flowId });
      
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
      
      const status = err.response?.status;
      
      if (status === 401 || status === 403) {
        log.info('Authentication error during publish, attempting token refresh');
        
        const refreshSuccess = await authService.refreshToken();
        
        if (refreshSuccess) {
          log.info('Token refreshed, retrying publish');
          // 재시도
          return publishFlow(flowId);
        } else {
          const errorMessage = '인증이 만료되었습니다. 다시 로그인해주세요.';
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }
      }
      
      const errorMessage = err.response?.data?.detail || '플로우 게시에 실패했습니다.';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [isAuthenticated]);

  // Unpublish a flow
  const unpublishFlow = useCallback(async (flowId: string) => {
    if (!isAuthenticated) {
      toast.error('로그인이 필요합니다.');
      throw new Error('로그인이 필요합니다.');
    }

    try {
      await apiClient.put(
        `/v1/personal-test/process-flow/flows/${flowId}/unpublish`,
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
      
      const status = err.response?.status;
      
      if (status === 401 || status === 403) {
        log.info('Authentication error during unpublish, attempting token refresh');
        
        const refreshSuccess = await authService.refreshToken();
        
        if (refreshSuccess) {
          log.info('Token refreshed, retrying unpublish');
          // 재시도
          return unpublishFlow(flowId);
        } else {
          const errorMessage = '인증이 만료되었습니다. 다시 로그인해주세요.';
          toast.error(errorMessage);
          throw new Error(errorMessage);
        }
      }
      
      const errorMessage = err.response?.data?.detail || '플로우 게시 취소에 실패했습니다.';
      toast.error(errorMessage);
      throw new Error(errorMessage);
    }
  }, [isAuthenticated]);

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