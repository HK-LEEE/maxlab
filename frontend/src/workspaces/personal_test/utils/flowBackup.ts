import type { Node, Edge } from 'reactflow';

export interface FlowBackupData {
  nodes: Node[];
  edges: Edge[];
  flowName: string;
  dataSourceId?: string;
  nodeSize?: '1' | '2' | '3';
  timestamp: number;
  workspaceId: string;
  flowId?: string;
}

const BACKUP_KEY_PREFIX = 'flow_backup_';
const BACKUP_EXPIRY_HOURS = 24; // 24시간 후 자동 삭제

/**
 * 플로우 데이터를 로컬 스토리지에 백업
 */
export const saveFlowBackup = (
  workspaceId: string,
  flowId: string | null,
  data: {
    nodes: Node[];
    edges: Edge[];
    flowName: string;
    dataSourceId?: string;
    nodeSize?: '1' | '2' | '3';
  }
): void => {
  try {
    const backupKey = getBackupKey(workspaceId, flowId);
    const backupData: FlowBackupData = {
      ...data,
      timestamp: Date.now(),
      workspaceId,
      flowId: flowId || undefined,
    };

    localStorage.setItem(backupKey, JSON.stringify(backupData));
    console.log('🔄 Flow backup saved:', backupKey);
  } catch (error) {
    console.error('Failed to save flow backup:', error);
  }
};

/**
 * 로컬 스토리지에서 플로우 백업 데이터 로드
 */
export const loadFlowBackup = (
  workspaceId: string,
  flowId: string | null
): FlowBackupData | null => {
  try {
    const backupKey = getBackupKey(workspaceId, flowId);
    const backupDataStr = localStorage.getItem(backupKey);
    
    if (!backupDataStr) {
      return null;
    }

    const backupData: FlowBackupData = JSON.parse(backupDataStr);
    
    // 만료된 백업 확인
    const hoursAgo = (Date.now() - backupData.timestamp) / (1000 * 60 * 60);
    if (hoursAgo > BACKUP_EXPIRY_HOURS) {
      deleteFlowBackup(workspaceId, flowId);
      return null;
    }

    console.log('📁 Flow backup loaded:', backupKey);
    return backupData;
  } catch (error) {
    console.error('Failed to load flow backup:', error);
    return null;
  }
};

/**
 * 플로우 백업 데이터 삭제
 */
export const deleteFlowBackup = (
  workspaceId: string,
  flowId: string | null
): void => {
  try {
    const backupKey = getBackupKey(workspaceId, flowId);
    localStorage.removeItem(backupKey);
    console.log('🗑️ Flow backup deleted:', backupKey);
  } catch (error) {
    console.error('Failed to delete flow backup:', error);
  }
};

/**
 * 워크스페이스의 모든 백업 데이터 조회
 */
export const getAllWorkspaceBackups = (workspaceId: string): FlowBackupData[] => {
  try {
    const backups: FlowBackupData[] = [];
    const prefix = `${BACKUP_KEY_PREFIX}${workspaceId}_`;
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(prefix)) {
        const backupDataStr = localStorage.getItem(key);
        if (backupDataStr) {
          try {
            const backupData: FlowBackupData = JSON.parse(backupDataStr);
            
            // 만료된 백업 제거
            const hoursAgo = (Date.now() - backupData.timestamp) / (1000 * 60 * 60);
            if (hoursAgo > BACKUP_EXPIRY_HOURS) {
              localStorage.removeItem(key);
              continue;
            }
            
            backups.push(backupData);
          } catch (parseError) {
            console.error('Failed to parse backup data:', parseError);
            localStorage.removeItem(key);
          }
        }
      }
    }
    
    return backups.sort((a, b) => b.timestamp - a.timestamp);
  } catch (error) {
    console.error('Failed to get workspace backups:', error);
    return [];
  }
};

/**
 * 만료된 모든 백업 데이터 정리
 */
export const cleanupExpiredBackups = (): void => {
  try {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(BACKUP_KEY_PREFIX)) {
        const backupDataStr = localStorage.getItem(key);
        if (backupDataStr) {
          try {
            const backupData: FlowBackupData = JSON.parse(backupDataStr);
            const hoursAgo = (Date.now() - backupData.timestamp) / (1000 * 60 * 60);
            
            if (hoursAgo > BACKUP_EXPIRY_HOURS) {
              keysToRemove.push(key);
            }
          } catch (parseError) {
            keysToRemove.push(key);
          }
        }
      }
    }
    
    keysToRemove.forEach(key => {
      localStorage.removeItem(key);
      console.log('🧹 Cleaned up expired backup:', key);
    });
    
    if (keysToRemove.length > 0) {
      console.log(`🧹 Cleaned up ${keysToRemove.length} expired backups`);
    }
  } catch (error) {
    console.error('Failed to cleanup expired backups:', error);
  }
};

/**
 * 백업 키 생성
 */
const getBackupKey = (workspaceId: string, flowId: string | null): string => {
  return `${BACKUP_KEY_PREFIX}${workspaceId}_${flowId || 'new'}`;
};

/**
 * 백업이 존재하는지 확인
 */
export const hasFlowBackup = (
  workspaceId: string,
  flowId: string | null
): boolean => {
  const backupKey = getBackupKey(workspaceId, flowId);
  return localStorage.getItem(backupKey) !== null;
};

/**
 * 백업 데이터의 마지막 수정 시간 조회
 */
export const getBackupTimestamp = (
  workspaceId: string,
  flowId: string | null
): number | null => {
  const backup = loadFlowBackup(workspaceId, flowId);
  return backup ? backup.timestamp : null;
};

/**
 * 현재 상태와 백업 데이터가 실질적으로 다른지 비교
 */
export const hasSignificantChanges = (
  current: {
    nodes: Node[];
    edges: Edge[];
    flowName: string;
    dataSourceId?: string | null;
  },
  backup: FlowBackupData
): boolean => {
  // 1. 플로우 이름 비교
  if (current.flowName !== backup.flowName) {
    console.log('🔍 Flow name differs:', current.flowName, 'vs', backup.flowName);
    return true;
  }

  // 2. 데이터소스 ID 비교
  const currentDataSourceId = current.dataSourceId || undefined;
  const backupDataSourceId = backup.dataSourceId || undefined;
  if (currentDataSourceId !== backupDataSourceId) {
    console.log('🔍 Data source differs:', currentDataSourceId, 'vs', backupDataSourceId);
    return true;
  }

  // 3. 노드 개수 비교
  if (current.nodes.length !== backup.nodes.length) {
    console.log('🔍 Node count differs:', current.nodes.length, 'vs', backup.nodes.length);
    return true;
  }

  // 4. 엣지 개수 비교
  if (current.edges.length !== backup.edges.length) {
    console.log('🔍 Edge count differs:', current.edges.length, 'vs', backup.edges.length);
    return true;
  }

  // 5. 노드 세부 비교 (ID, type, position, data)
  for (let i = 0; i < current.nodes.length; i++) {
    const currentNode = current.nodes[i];
    const backupNode = backup.nodes.find(n => n.id === currentNode.id);
    
    if (!backupNode) {
      console.log('🔍 Node missing in backup:', currentNode.id);
      return true;
    }

    // 노드 위치 비교 (소수점 1자리까지만 비교)
    const currentX = Math.round(currentNode.position.x * 10) / 10;
    const currentY = Math.round(currentNode.position.y * 10) / 10;
    const backupX = Math.round(backupNode.position.x * 10) / 10;
    const backupY = Math.round(backupNode.position.y * 10) / 10;
    
    if (currentX !== backupX || currentY !== backupY) {
      console.log('🔍 Node position differs:', currentNode.id, 
                  `(${currentX},${currentY})`, 'vs', `(${backupX},${backupY})`);
      return true;
    }

    // 노드 타입 비교
    if (currentNode.type !== backupNode.type) {
      console.log('🔍 Node type differs:', currentNode.id, currentNode.type, 'vs', backupNode.type);
      return true;
    }

    // 노드 데이터 비교 (JSON 문자열로 변환해서 비교)
    const currentDataStr = JSON.stringify(currentNode.data || {});
    const backupDataStr = JSON.stringify(backupNode.data || {});
    if (currentDataStr !== backupDataStr) {
      console.log('🔍 Node data differs:', currentNode.id);
      return true;
    }
  }

  // 6. 엣지 세부 비교 (ID, source, target, type)
  for (let i = 0; i < current.edges.length; i++) {
    const currentEdge = current.edges[i];
    const backupEdge = backup.edges.find(e => e.id === currentEdge.id);
    
    if (!backupEdge) {
      console.log('🔍 Edge missing in backup:', currentEdge.id);
      return true;
    }

    // 엣지 연결 비교
    if (currentEdge.source !== backupEdge.source || 
        currentEdge.target !== backupEdge.target ||
        currentEdge.sourceHandle !== backupEdge.sourceHandle ||
        currentEdge.targetHandle !== backupEdge.targetHandle) {
      console.log('🔍 Edge connection differs:', currentEdge.id);
      return true;
    }

    // 엣지 타입 비교
    if (currentEdge.type !== backupEdge.type) {
      console.log('🔍 Edge type differs:', currentEdge.id, currentEdge.type, 'vs', backupEdge.type);
      return true;
    }
  }

  console.log('✅ No significant changes found between current and backup');
  return false;
};