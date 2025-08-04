/**
 * ReactFlow-specific Error Boundary
 * Specialized error handling for ReactFlow components and operations
 */

import React from 'react';
import type { ReactNode } from 'react';
import { AlertTriangle, RefreshCw, Download, Upload } from 'lucide-react';
import { ErrorBoundary } from '../../../../components/common/ErrorBoundary';
import { toast } from 'react-hot-toast';

export interface ReactFlowErrorBoundaryProps {
  children: ReactNode;
  onError?: (error: Error) => void;
  onRecovery?: () => void;
  flowData?: any; // Current flow data for recovery
  onSaveBackup?: () => void;
  onLoadBackup?: () => void;
}

export const ReactFlowErrorBoundary: React.FC<ReactFlowErrorBoundaryProps> = ({
  children,
  onError,
  onRecovery,
  flowData,
  onSaveBackup,
  onLoadBackup
}) => {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    // Log ReactFlow-specific error details
    console.group('🔴 ReactFlow Error Boundary');
    console.error('ReactFlow Error:', error);
    console.error('Error Info:', errorInfo);
    
    // Check for common ReactFlow errors
    const isNodeError = error.message.includes('node') || error.stack?.includes('node');
    const isEdgeError = error.message.includes('edge') || error.stack?.includes('edge');
    const isLayoutError = error.message.includes('layout') || error.message.includes('position');
    const isRenderError = error.message.includes('render') || error.message.includes('component');

    if (isNodeError) {
      console.warn('🔵 This appears to be a node-related error');
    } else if (isEdgeError) {
      console.warn('🔗 This appears to be an edge-related error');
    } else if (isLayoutError) {
      console.warn('📐 This appears to be a layout-related error');
    } else if (isRenderError) {
      console.warn('🎨 This appears to be a rendering-related error');
    }

    console.groupEnd();

    // Attempt to save current flow data before error
    if (flowData && onSaveBackup) {
      try {
        onSaveBackup();
        console.log('💾 Emergency backup saved before error recovery');
      } catch (backupError) {
        console.error('❌ Failed to save emergency backup:', backupError);
      }
    }

    // Call custom error handler
    if (onError) {
      onError(error);
    }

    // Show user-friendly error toast
    toast.error('Flow editor encountered an error. Your work has been saved.', {
      duration: 5000,
      id: 'reactflow-error'
    });
  };

  const renderFallback = (error: Error, errorInfo: React.ErrorInfo, retry: () => void) => {
    const isNodeError = error.message.includes('node') || error.stack?.includes('node');
    const isEdgeError = error.message.includes('edge') || error.stack?.includes('edge');
    const isLayoutError = error.message.includes('layout') || error.message.includes('position');

    let errorType = 'Flow Editor';
    let errorDescription = 'An error occurred in the process flow editor.';
    let recoveryTips: string[] = [];

    if (isNodeError) {
      errorType = 'Node Error';
      errorDescription = 'An error occurred while processing flow nodes.';
      recoveryTips = [
        'Check if any nodes have invalid configurations',
        'Try removing recently added nodes',
        'Reload from a previous backup'
      ];
    } else if (isEdgeError) {
      errorType = 'Connection Error';
      errorDescription = 'An error occurred while processing flow connections.';
      recoveryTips = [
        'Check if any connections are invalid',
        'Try removing recently added connections',
        'Verify node connection points'
      ];
    } else if (isLayoutError) {
      errorType = 'Layout Error';
      errorDescription = 'An error occurred while positioning flow elements.';
      recoveryTips = [
        'Try resetting the layout',
        'Check for overlapping elements',
        'Reload from auto-saved version'
      ];
    }

    return (
      <div className="p-6 border border-red-200 bg-red-50 rounded-lg">
        <div className="flex items-start space-x-3">
          <div className="flex-shrink-0">
            <div className="rounded-full p-2 bg-red-100">
              <AlertTriangle className="w-6 h-6 text-red-600" />
            </div>
          </div>
          
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-red-800 mb-2">
              {errorType}
            </h3>
            
            <p className="text-red-700 mb-4">
              {errorDescription} Your work has been automatically saved.
            </p>

            {recoveryTips.length > 0 && (
              <div className="mb-4">
                <h4 className="font-medium text-red-800 mb-2">Recovery Tips:</h4>
                <ul className="list-disc list-inside text-sm text-red-700 space-y-1">
                  {recoveryTips.map((tip, index) => (
                    <li key={index}>{tip}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  retry();
                  if (onRecovery) onRecovery();
                  toast.success('Flow editor reloaded');
                }}
                className="flex items-center px-3 py-1.5 bg-red-600 text-white rounded hover:bg-red-700 transition-colors text-sm"
              >
                <RefreshCw className="w-4 h-4 mr-1" />
                Retry
              </button>

              {onSaveBackup && (
                <button
                  onClick={() => {
                    try {
                      onSaveBackup();
                      toast.success('Backup saved successfully');
                    } catch (err) {
                      toast.error('Failed to save backup');
                    }
                  }}
                  className="flex items-center px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
                >
                  <Download className="w-4 h-4 mr-1" />
                  Save Backup
                </button>
              )}

              {onLoadBackup && (
                <button
                  onClick={() => {
                    try {
                      onLoadBackup();
                      retry();
                      toast.success('Backup loaded successfully');
                    } catch (err) {
                      toast.error('Failed to load backup');
                    }
                  }}
                  className="flex items-center px-3 py-1.5 bg-green-600 text-white rounded hover:bg-green-700 transition-colors text-sm"
                >
                  <Upload className="w-4 h-4 mr-1" />
                  Load Backup
                </button>
              )}
            </div>
          </div>
        </div>

        {process.env.NODE_ENV === 'development' && (
          <details className="mt-4">
            <summary className="cursor-pointer text-sm font-medium text-red-700 hover:text-red-900">
              Developer Details
            </summary>
            <div className="mt-2 p-3 bg-red-100 rounded border text-xs">
              <p><strong>Error:</strong> {error.message}</p>
              {error.stack && (
                <pre className="mt-2 overflow-auto whitespace-pre-wrap">
                  {error.stack}
                </pre>
              )}
            </div>
          </details>
        )}
      </div>
    );
  };

  return (
    <ErrorBoundary
      level="component"
      name="ReactFlow"
      onError={handleError}
      fallback={renderFallback}
      enableRetry={true}
    >
      {children}
    </ErrorBoundary>
  );
};

// HOC for wrapping ReactFlow components
export const withReactFlowErrorBoundary = <P extends object>(
  Component: React.ComponentType<P>,
  options?: Omit<ReactFlowErrorBoundaryProps, 'children'>
) => {
  const WrappedComponent = (props: P) => (
    <ReactFlowErrorBoundary {...options}>
      <Component {...props} />
    </ReactFlowErrorBoundary>
  );

  WrappedComponent.displayName = `withReactFlowErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};