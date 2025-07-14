/**
 * Rate Limit Indicator Component
 * Displays rate limit status and warnings to users
 */

import React, { useState } from 'react';
import { useRateLimit } from '../hooks/useRateLimit';

interface RateLimitIndicatorProps {
  position?: 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';
  showWhenNormal?: boolean;
  compact?: boolean;
  className?: string;
}

const RateLimitIndicator: React.FC<RateLimitIndicatorProps> = ({
  position = 'top-right',
  showWhenNormal = false,
  compact = false,
  className = ''
}) => {
  const { status, warnings, utils, actions } = useRateLimit();
  const [isExpanded, setIsExpanded] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);

  // Don't show if dismissed or if normal status and showWhenNormal is false
  if (isDismissed || (!showWhenNormal && !utils.shouldShowWarning)) {
    return null;
  }

  const getStatusColor = () => {
    if (utils.isBlacklisted) return 'bg-red-600';
    if (utils.isRateLimited) return 'bg-orange-600';
    if (utils.remainingPercentage < 20) return 'bg-yellow-600';
    if (utils.isWhitelisted) return 'bg-green-600';
    return 'bg-blue-600';
  };

  const getStatusText = () => {
    if (utils.isBlacklisted) return 'Blocked';
    if (utils.isRateLimited) return 'Rate Limited';
    if (utils.remainingPercentage < 20) return 'Near Limit';
    if (utils.isWhitelisted) return 'Whitelisted';
    return 'Normal';
  };

  const getPositionClasses = () => {
    const base = 'fixed z-50';
    switch (position) {
      case 'top-left':
        return `${base} top-4 left-4`;
      case 'top-right':
        return `${base} top-4 right-4`;
      case 'bottom-left':
        return `${base} bottom-4 left-4`;
      case 'bottom-right':
        return `${base} bottom-4 right-4`;
      default:
        return `${base} top-4 right-4`;
    }
  };

  if (compact) {
    return (
      <div className={`${getPositionClasses()} ${className}`}>
        <div
          className={`${getStatusColor()} text-white px-3 py-1 rounded-full text-sm cursor-pointer shadow-lg`}
          onClick={() => setIsExpanded(!isExpanded)}
          title={`Rate Limit: ${status?.remaining || 0}/${status?.limit || 0} remaining`}
        >
          {utils.remainingPercentage}%
          {isExpanded && (
            <div className="absolute top-full right-0 mt-2 bg-white text-gray-800 rounded-lg shadow-xl p-4 min-w-64">
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <span className="font-semibold">Rate Limit Status</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsDismissed(true);
                    }}
                    className="text-gray-400 hover:text-gray-600"
                  >
                    ✕
                  </button>
                </div>
                <div className="text-sm space-y-1">
                  <div>Status: <span className="font-medium">{getStatusText()}</span></div>
                  <div>Remaining: <span className="font-medium">{status?.remaining || 0}/{status?.limit || 0}</span></div>
                  <div>Reset: <span className="font-medium">{utils.timeUntilReset}</span></div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className={`${getPositionClasses()} ${className}`}>
      <div className={`${getStatusColor()} text-white rounded-lg shadow-lg p-4 max-w-sm`}>
        <div className="flex justify-between items-start mb-2">
          <div className="flex items-center space-x-2">
            <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
            <span className="font-semibold">Rate Limit</span>
          </div>
          <button
            onClick={() => setIsDismissed(true)}
            className="text-white hover:text-gray-200 transition-colors"
          >
            ✕
          </button>
        </div>

        <div className="space-y-2">
          <div className="flex justify-between text-sm">
            <span>Status:</span>
            <span className="font-medium">{getStatusText()}</span>
          </div>

          {status && (
            <>
              <div className="flex justify-between text-sm">
                <span>Remaining:</span>
                <span className="font-medium">{status.remaining}/{status.limit}</span>
              </div>

              <div className="w-full bg-white bg-opacity-20 rounded-full h-2">
                <div
                  className="bg-white h-2 rounded-full transition-all duration-300"
                  style={{ width: `${utils.remainingPercentage}%` }}
                ></div>
              </div>

              <div className="flex justify-between text-sm">
                <span>Reset in:</span>
                <span className="font-medium">{utils.timeUntilReset}</span>
              </div>
            </>
          )}

          {warnings.length > 0 && (
            <div className="mt-3 pt-3 border-t border-white border-opacity-20">
              <div className="text-sm font-medium mb-1">Warnings:</div>
              {warnings.slice(0, 3).map((warning, index) => (
                <div key={index} className="text-xs opacity-90 mb-1">
                  {warning.message}
                </div>
              ))}
              {warnings.length > 3 && (
                <div className="text-xs opacity-75">
                  +{warnings.length - 3} more warnings
                </div>
              )}
            </div>
          )}

          <div className="flex space-x-2 mt-3">
            <button
              onClick={actions.refreshStatus}
              className="text-xs bg-white bg-opacity-20 hover:bg-opacity-30 px-2 py-1 rounded transition-colors"
            >
              Refresh
            </button>
            {warnings.length > 0 && (
              <button
                onClick={actions.clearWarnings}
                className="text-xs bg-white bg-opacity-20 hover:bg-opacity-30 px-2 py-1 rounded transition-colors"
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default RateLimitIndicator;