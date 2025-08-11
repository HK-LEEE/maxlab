import React from 'react';
import { Activity } from 'lucide-react';

interface StatusSummaryProps {
  statusCounts: {
    ACTIVE: number;
    PAUSE: number;
    STOP: number;
  };
  instrumentCount?: number;
  isFullscreen: boolean;
}

export const StatusSummary: React.FC<StatusSummaryProps> = ({ statusCounts, instrumentCount, isFullscreen }) => {
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
        {instrumentCount !== undefined && (
          <>
            <div className="border-l border-gray-300 h-4"></div>
            <div className="flex items-center space-x-2">
              <Activity className="w-4 h-4 text-blue-500" />
              <span className="text-sm">Instruments: {instrumentCount}</span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};