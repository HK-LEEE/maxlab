/**
 * Node Rendering Error Boundary
 * Specialized error handling for individual node components
 */

import React, { ReactNode } from 'react';
import { AlertTriangle, Zap } from 'lucide-react';
import { ErrorBoundary } from '../../../../components/common/ErrorBoundary';

export interface NodeErrorBoundaryProps {
  children: ReactNode;
  nodeId?: string;
  nodeType?: string;
  onNodeError?: (nodeId: string, error: Error) => void;
  fallbackNode?: ReactNode;
}

export const NodeErrorBoundary: React.FC<NodeErrorBoundaryProps> = ({
  children,
  nodeId,
  nodeType,
  onNodeError,
  fallbackNode
}) => {
  const handleError = (error: Error, errorInfo: React.ErrorInfo) => {
    console.group(`🔴 Node Error [${nodeType || 'Unknown'}:${nodeId || 'Unknown'}]`);
    console.error('Node Error:', error);
    console.error('Node Type:', nodeType);
    console.error('Node ID:', nodeId);
    console.error('Error Info:', errorInfo);
    console.groupEnd();

    // Call custom node error handler
    if (onNodeError && nodeId) {
      onNodeError(nodeId, error);
    }
  };

  const renderFallback = (error: Error, errorInfo: React.ErrorInfo, retry: () => void) => {
    // If a custom fallback node is provided, use it
    if (fallbackNode) {
      return fallbackNode;
    }

    // Default fallback node
    return (
      <div className="relative">
        {/* Base node shape */}
        <div className="w-24 h-16 bg-red-100 border-2 border-red-300 rounded-lg flex items-center justify-center">
          <div className="text-center">
            <AlertTriangle className="w-6 h-6 text-red-600 mx-auto mb-1" />
            <div className="text-xs text-red-700 font-medium">Error</div>
          </div>
        </div>

        {/* Error tooltip on hover */}
        <div className="absolute top-full left-0 mt-1 hidden group-hover:block z-50">
          <div className="bg-red-900 text-white text-xs rounded p-2 whitespace-nowrap max-w-xs">
            <div className="font-medium">Node Error</div>
            <div>Type: {nodeType || 'Unknown'}</div>
            <div>ID: {nodeId || 'Unknown'}</div>
            <div className="mt-1 text-red-200">{error.message}</div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                retry();
              }}
              className="mt-1 text-xs bg-red-700 hover:bg-red-600 px-2 py-1 rounded"
            >
              Retry
            </button>
          </div>
        </div>

        {/* Connection handles for ReactFlow */}
        <div className="absolute top-1/2 -left-2 w-4 h-4 bg-red-400 border-2 border-red-600 rounded-full transform -translate-y-1/2" />
        <div className="absolute top-1/2 -right-2 w-4 h-4 bg-red-400 border-2 border-red-600 rounded-full transform -translate-y-1/2" />
      </div>
    );
  };

  return (
    <div className="group">
      <ErrorBoundary
        level="component"
        name={`Node-${nodeType}`}
        onError={handleError}
        fallback={renderFallback}
        enableRetry={true}
        showDetails={false}
      >
        {children}
      </ErrorBoundary>
    </div>
  );
};

// HOC for wrapping node components
export const withNodeErrorBoundary = <P extends { id?: string; type?: string }>(
  Component: React.ComponentType<P>
) => {
  const WrappedComponent = (props: P) => (
    <NodeErrorBoundary
      nodeId={props.id}
      nodeType={props.type}
      onNodeError={(nodeId, error) => {
        console.warn(`Node ${nodeId} encountered an error:`, error.message);
        // Could implement node removal or replacement logic here
      }}
    >
      <Component {...props} />
    </NodeErrorBoundary>
  );

  WrappedComponent.displayName = `withNodeErrorBoundary(${Component.displayName || Component.name})`;
  return WrappedComponent;
};

// Specific error boundary for equipment nodes
export const EquipmentNodeErrorBoundary: React.FC<{
  children: ReactNode;
  nodeId?: string;
  equipmentType?: string;
}> = ({ children, nodeId, equipmentType }) => {
  const fallbackNode = (
    <div className="relative">
      {/* Equipment-specific fallback */}
      <div className="w-24 h-16 bg-orange-100 border-2 border-orange-300 rounded-lg flex items-center justify-center">
        <div className="text-center">
          <Zap className="w-6 h-6 text-orange-600 mx-auto mb-1" />
          <div className="text-xs text-orange-700 font-medium">Equipment</div>
          <div className="text-xs text-orange-600">{equipmentType || 'Error'}</div>
        </div>
      </div>

      {/* Connection handles */}
      <div className="absolute top-1/2 -left-2 w-4 h-4 bg-orange-400 border-2 border-orange-600 rounded-full transform -translate-y-1/2" />
      <div className="absolute top-1/2 -right-2 w-4 h-4 bg-orange-400 border-2 border-orange-600 rounded-full transform -translate-y-1/2" />
    </div>
  );

  return (
    <NodeErrorBoundary
      nodeId={nodeId}
      nodeType={`Equipment-${equipmentType}`}
      fallbackNode={fallbackNode}
      onNodeError={(nodeId, error) => {
        console.warn(`Equipment node ${nodeId} (${equipmentType}) error:`, error.message);
        // Could implement equipment-specific error handling
      }}
    >
      {children}
    </NodeErrorBoundary>
  );
};

// Group node error boundary
export const GroupNodeErrorBoundary: React.FC<{
  children: ReactNode;
  nodeId?: string;
  groupName?: string;
}> = ({ children, nodeId, groupName }) => {
  const fallbackNode = (
    <div className="relative">
      <div className="min-w-32 min-h-24 bg-blue-100 border-2 border-blue-300 rounded-lg p-2 flex items-center justify-center">
        <div className="text-center">
          <AlertTriangle className="w-6 h-6 text-blue-600 mx-auto mb-1" />
          <div className="text-xs text-blue-700 font-medium">Group Error</div>
          <div className="text-xs text-blue-600">{groupName || 'Unknown'}</div>
        </div>
      </div>
    </div>
  );

  return (
    <NodeErrorBoundary
      nodeId={nodeId}
      nodeType="Group"
      fallbackNode={fallbackNode}
      onNodeError={(nodeId, error) => {
        console.warn(`Group node ${nodeId} (${groupName}) error:`, error.message);
      }}
    >
      {children}
    </NodeErrorBoundary>
  );
};

// Text node error boundary
export const TextNodeErrorBoundary: React.FC<{
  children: ReactNode;
  nodeId?: string;
}> = ({ children, nodeId }) => {
  const fallbackNode = (
    <div className="relative">
      <div className="bg-gray-100 border border-gray-300 rounded px-3 py-2">
        <div className="flex items-center text-gray-600">
          <AlertTriangle className="w-4 h-4 mr-1" />
          <span className="text-sm">Text Error</span>
        </div>
      </div>
    </div>
  );

  return (
    <NodeErrorBoundary
      nodeId={nodeId}
      nodeType="Text"
      fallbackNode={fallbackNode}
      onNodeError={(nodeId, error) => {
        console.warn(`Text node ${nodeId} error:`, error.message);
      }}
    >
      {children}
    </NodeErrorBoundary>
  );
};