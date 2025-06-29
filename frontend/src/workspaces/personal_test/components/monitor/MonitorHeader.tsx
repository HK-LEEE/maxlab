import React from 'react';
import { Clock, RefreshCw, Maximize2, Minimize2 } from 'lucide-react';

interface MonitorHeaderProps {
  flows: any[];
  selectedFlow: any;
  lastUpdate: Date;
  refreshInterval: number;
  autoRefresh: boolean;
  autoScroll: boolean;
  isLoading: boolean;
  isFullscreen: boolean;
  onFlowChange: (flowId: string) => void;
  onRefreshIntervalChange: (interval: number) => void;
  onAutoRefreshChange: (enabled: boolean) => void;
  onAutoScrollChange: (enabled: boolean) => void;
  onRefresh: () => void;
  onToggleFullscreen: () => void;
}

export const MonitorHeader: React.FC<MonitorHeaderProps> = ({
  flows,
  selectedFlow,
  lastUpdate,
  refreshInterval,
  autoRefresh,
  autoScroll,
  isLoading,
  isFullscreen,
  onFlowChange,
  onRefreshIntervalChange,
  onAutoRefreshChange,
  onAutoScrollChange,
  onRefresh,
  onToggleFullscreen,
}) => {
  if (isFullscreen) return null;

  return (
    <div className="bg-white border-b px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-4">
          {flows.length > 0 && (
            <select
              value={selectedFlow?.id || ''}
              onChange={(e) => onFlowChange(e.target.value)}
              className="px-3 py-1 border rounded focus:outline-none focus:ring-2 focus:ring-black"
            >
              {flows.map((flow) => (
                <option key={flow.id} value={flow.id}>
                  {flow.name}
                </option>
              ))}
            </select>
          )}
          {flows.length === 0 && (
            <span className="text-gray-500 text-sm">No process flows available</span>
          )}
        </div>
        <div className="flex items-center space-x-4">
          <div className="flex items-center space-x-2 text-sm text-gray-600">
            <Clock size={16} />
            <span>Last update: {lastUpdate.toLocaleTimeString()}</span>
          </div>
          <select
            value={refreshInterval}
            onChange={(e) => onRefreshIntervalChange(Number(e.target.value))}
            className="px-2 py-1 border rounded text-sm"
          >
            <option value={30000}>30초</option>
            <option value={60000}>1분</option>
            <option value={180000}>3분</option>
            <option value={300000}>5분</option>
          </select>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => onAutoRefreshChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-refresh</span>
          </label>
          <label className="flex items-center space-x-2">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => onAutoScrollChange(e.target.checked)}
              className="rounded"
            />
            <span className="text-sm">Auto-scroll</span>
          </label>
          <button
            onClick={onRefresh}
            disabled={isLoading}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
            <span>Refresh</span>
          </button>
          <button
            onClick={onToggleFullscreen}
            className="flex items-center space-x-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50"
          >
            {isFullscreen ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>Fullscreen</span>
          </button>
        </div>
      </div>
    </div>
  );
};