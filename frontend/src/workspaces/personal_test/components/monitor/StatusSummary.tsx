import React from 'react';

interface StatusSummaryProps {
  statusCounts: {
    ACTIVE: number;
    PAUSE: number;
    STOP: number;
  };
  isFullscreen: boolean;
}

export const StatusSummary: React.FC<StatusSummaryProps> = ({ statusCounts, isFullscreen }) => {
  if (isFullscreen) return null;

  return (
    <div className="bg-white border-b px-6 py-3">
      <div className="flex items-center space-x-6">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-green-500 rounded-full"></div>
          <span className="text-sm">Active: {statusCounts.ACTIVE}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-yellow-500 rounded-full"></div>
          <span className="text-sm">Paused: {statusCounts.PAUSE}</span>
        </div>
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 bg-red-500 rounded-full"></div>
          <span className="text-sm">Stopped: {statusCounts.STOP}</span>
        </div>
      </div>
    </div>
  );
};