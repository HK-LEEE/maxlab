import React, { memo, useEffect, useRef, useState, useCallback, useContext } from 'react';
import { Handle, Position, NodeResizer, useReactFlow } from 'reactflow';
import type { NodeProps } from 'reactflow';
import { 
  Table, 
  AlertCircle, 
  CheckCircle, 
  RefreshCw,
  Database,
  Loader
} from 'lucide-react';
import log from '../../../../utils/logger';

interface TableColumn {
  field: string;
  header: string;
  type: 'id' | 'value' | 'usl' | 'lsl' | 'status' | 'text';
  width?: number;
}

interface StatusRules {
  valueField: string;
  uslField: string;
  lslField: string;
  idField: string;
}

interface CustomTableNodeData {
  label: string;
  queryConfig: {
    sql: string;
    refreshInterval: number;
    dataSourceId?: string;
  };
  tableConfig: {
    columns: TableColumn[];
    displayMode: 'table' | 'compact';
    maxRows: number;
  };
  statusRules: StatusRules;
  nodeSize?: '1' | '2' | '3';
  color?: string;
  autoScroll?: boolean;
}

interface CustomTableNodeProps extends NodeProps<CustomTableNodeData> {
  // Props removed - table nodes will handle their own data fetching
}

interface TableRow extends Record<string, any> {
  _status?: 'IN_SPEC' | 'ABOVE_SPEC' | 'BELOW_SPEC';
  _statusColor?: string;
}

const statusConfig = {
  'IN_SPEC': { 
    color: 'text-green-600', 
    bgColor: 'bg-green-50',
    icon: <CheckCircle size={12} />,
    label: 'OK'
  },
  'ABOVE_SPEC': { 
    color: 'text-red-600', 
    bgColor: 'bg-red-50',
    icon: <AlertCircle size={12} />,
    label: 'HIGH'
  },
  'BELOW_SPEC': { 
    color: 'text-orange-600', 
    bgColor: 'bg-orange-50',
    icon: <AlertCircle size={12} />,
    label: 'LOW'
  },
};

export const CustomTableNode = memo((props: CustomTableNodeProps) => {
  const { data, selected, id } = props;
  
  const { setNodes, getNode } = useReactFlow();
  const currentNode = getNode(id);
  
  // State management
  const [tableData, setTableData] = useState<TableRow[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [, setIsResizing] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  
  // Node sizing
  const nodeSize = data.nodeSize || '2';
  const nodeColor = data.color || '#3b82f6';
  
  const getNodeHeight = (size: '1' | '2' | '3') => {
    switch (size) {
      case '1': return 200;
      case '2': return 300;
      case '3': return 400;
      default: return 300;
    }
  };
  
  const getNodeWidth = () => {
    const columnCount = data.tableConfig?.columns?.length || 4;
    return Math.max(300, Math.min(600, columnCount * 80));
  };

  const defaultHeight = getNodeHeight(nodeSize);
  const defaultWidth = getNodeWidth();
  
  const actualNodeHeight = Math.max(
    typeof currentNode?.style?.height === 'number' ? currentNode.style.height : defaultHeight, 
    defaultHeight
  );
  const actualNodeWidth = Math.max(
    typeof currentNode?.style?.width === 'number' ? currentNode.style.width : defaultWidth, 
    defaultWidth
  );

  // Auto-scroll state management
  const scrollRef = useRef<HTMLDivElement>(null);
  const scrollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const scrollPositionRef = useRef<number>(0);
  const isScrollActiveRef = useRef<boolean>(false);
  
  // Global scroll state management
  const globalScrollKey = `autoScroll_table_${id}`;
  const isGlobalScrollActive = () => (window as any)[globalScrollKey] === true;
  const setGlobalScrollActive = (active: boolean) => {
    (window as any)[globalScrollKey] = active;
  };

  // Calculate status for each row
  const calculateRowStatus = useCallback((row: any): 'IN_SPEC' | 'ABOVE_SPEC' | 'BELOW_SPEC' => {
    if (!data.statusRules) return 'IN_SPEC';
    
    const { valueField, uslField, lslField } = data.statusRules;
    
    const value = parseFloat(row[valueField]);
    const usl = parseFloat(row[uslField]);
    const lsl = parseFloat(row[lslField]);
    
    if (isNaN(value) || isNaN(usl) || isNaN(lsl)) return 'IN_SPEC';
    
    if (value > usl) return 'ABOVE_SPEC';
    if (value < lsl) return 'BELOW_SPEC';
    return 'IN_SPEC';
  }, [data.statusRules]);

  // Execute individual table query
  const executeQuery = useCallback(async () => {
    if (!data.queryConfig?.sql || !data.queryConfig?.dataSourceId) {
      setIsLoading(false);
      setTableData([]);
      setError(null);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const queryRequest = {
        custom_query: data.queryConfig.sql,
        limit: data.tableConfig?.maxRows || 50,
        query_type: 'custom'
      };

      // Determine endpoint based on context (public vs private)
      const isPublicMonitoring = window.location.pathname.includes('/public/');
      
      // Debug console log removed
      
      let response;
      if (isPublicMonitoring) {
        // Extract publish token from URL
        // URL pattern: /workspaces/personal_test/monitor/public/{publishToken}
        const pathParts = window.location.pathname.split('/');
        
        // Get the last part of the URL which should be the publish token
        // URL can be either:
        // - /public/flow/{publishToken}
        // - /workspaces/personal_test/monitor/public/{publishToken}
        let publishToken = '';
        if (pathParts.length > 0) {
          publishToken = pathParts[pathParts.length - 1];
        }
        
        console.log('[CustomTableNode Public Mode]', {
          publishToken,
          pathParts,
          pathname: window.location.pathname,
          pathPartsLength: pathParts.length,
          pathPartsDetail: pathParts.map((p, i) => `[${i}]="${p}"`).join(', '),
          endpoint: `/api/v1/personal-test/process-flow/public/${publishToken}/data-sources/${data.queryConfig.dataSourceId}/execute-query`
        });
        
        if (!publishToken) {
          throw new Error('Failed to extract publish token from URL');
        }
        
        response = await fetch(`/api/v1/personal-test/process-flow/public/${publishToken}/data-sources/${data.queryConfig.dataSourceId}/execute-query`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(queryRequest)
        });
      } else {
        // Private monitoring - use authenticated endpoint
        const { apiClient } = await import('../../../../api/client');
        response = await apiClient.post(
          `/v1/personal-test/process-flow/data-sources/${data.queryConfig.dataSourceId}/execute-query`,
          queryRequest
        );
      }

      // Handle response based on monitoring type
      let result;
      if (isPublicMonitoring) {
        const fetchResponse = response as Response;
        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          console.error('[CustomTableNode Public Error]', {
            status: fetchResponse.status,
            statusText: fetchResponse.statusText,
            errorText,
            nodeId: id
          });
          throw new Error(`HTTP ${fetchResponse.status}: ${errorText || fetchResponse.statusText}`);
        }
        result = await fetchResponse.json();
      } else {
        const axiosResponse = response as any;
        result = axiosResponse.data;
      }
      
      console.log('[CustomTableNode Result]', {
        nodeId: id,
        isPublicMonitoring,
        hasError: !!result.error,
        hasSampleData: !!result.sample_data,
        sampleDataLength: result.sample_data?.length || 0,
        columns: result.columns
      });
      
      if (result.error) {
        throw new Error(result.error);
      }

      const rows = result.sample_data || [];
      
      // Calculate status for each row
      const processedRows = rows.map((row: any) => ({
        ...row,
        _status: calculateRowStatus(row),
        _statusColor: statusConfig[calculateRowStatus(row)]?.color
      }));
      
      setTableData(processedRows);
      setError(null);
      setLastRefresh(new Date());
      
      log.debug('Table data fetched individually', {
        nodeId: id,
        rowCount: processedRows.length,
        columns: result.columns
      });
      
    } catch (err: any) {
      log.error('Failed to execute table query', { error: err, nodeId: id });
      setError(err.message || 'Failed to execute query');
      setTableData([]);
    } finally {
      setIsLoading(false);
    }
  }, [data.queryConfig, data.tableConfig, calculateRowStatus, id]);

  // Execute query on mount and when query config changes
  useEffect(() => {
    executeQuery();
  }, [executeQuery]);

  // Track global auto-scroll changes
  const [globalAutoScroll, setGlobalAutoScroll] = useState((window as any).autoScrollMeasurements);
  
  useEffect(() => {
    const checkGlobalState = () => {
      const currentGlobal = (window as any).autoScrollMeasurements;
      if (currentGlobal !== globalAutoScroll) {
        setGlobalAutoScroll(currentGlobal);
      }
    };
    
    // Check for changes periodically
    const interval = setInterval(checkGlobalState, 500);
    return () => clearInterval(interval);
  }, [globalAutoScroll]);
  
  // Auto-scroll functionality for table data
  useEffect(() => {
    const timer = setTimeout(() => {
      const isMonitorPage = window.location.pathname.includes('monitor') || 
                           window.location.pathname.includes('public');
      // Use autoScroll from props if available, otherwise use global value
      const autoScrollValue = data.autoScroll !== undefined ? data.autoScroll : globalAutoScroll;
      const shouldScroll = isMonitorPage && autoScrollValue;
      
      // Debug logging for auto-scroll conditions
      // Auto-scroll debug console log removed

      // Don't auto-scroll during loading or if there's an error
      if (shouldScroll && tableData.length > 0 && scrollRef.current && !isLoading && !error) {
        // Calculate how many rows can be shown based on height
        // Header takes ~100px, each row takes ~30px
        const headerHeight = 100;
        const rowHeight = 30;
        const visibleRows = Math.floor((actualNodeHeight - headerHeight) / rowHeight);
        
        // Only scroll if we have more rows than can fit
        const needsScroll = tableData.length > visibleRows;
        
        console.log('[Table Auto-scroll Calculation]', {
          nodeId: id,
          nodeHeight: actualNodeHeight,
          visibleRows,
          actualRows: tableData.length,
          needsScroll,
          isScrollActiveRef: isScrollActiveRef.current,
          isGlobalScrollActive: isGlobalScrollActive()
        });

        if (needsScroll && !isScrollActiveRef.current && !isGlobalScrollActive()) {
          log.info('Auto-scroll started for table node', { nodeId: id });
          setIsScrolling(true);
          isScrollActiveRef.current = true;
          setGlobalScrollActive(true);
          const scrollContainer = scrollRef.current;
          
          // Preserve existing scroll position if available
          if (scrollPositionRef.current > 0 && scrollContainer) {
            scrollContainer.scrollTop = scrollPositionRef.current;
          }
          
          const scroll = () => {
            if (scrollContainer && isScrollActiveRef.current && isGlobalScrollActive()) {
              const maxScroll = scrollContainer.scrollHeight - scrollContainer.clientHeight;
              scrollPositionRef.current += 0.5; // Smooth scroll speed
              
              if (scrollPositionRef.current >= maxScroll) {
                scrollPositionRef.current = 0; // Reset to top when reaching bottom
              }
              
              scrollContainer.scrollTop = scrollPositionRef.current;
              
            } else {
              // Check if only global state is missing - try to recover
              if (scrollContainer && isScrollActiveRef.current && !isGlobalScrollActive()) {
                log.debug('Recovering global scroll state for table node', { nodeId: id });
                setGlobalScrollActive(true);
                return; // Don't log stop message, try to continue
              }
              
              log.warn('Auto-scroll stopped unexpectedly for table node', { 
                nodeId: id,
                hasContainer: !!scrollContainer,
                isActive: isScrollActiveRef.current,
                globalActive: isGlobalScrollActive()
              });
            }
          };
          
          // Clear any existing interval to prevent duplicates
          if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
          }
          
          // Start scrolling with 50ms intervals for smooth animation
          scrollIntervalRef.current = setInterval(scroll, 50);
          
        } else if (!needsScroll && isScrollActiveRef.current) {
          // Stop scrolling if no longer needed
          log.info('Auto-scroll stopped for table node - not enough data', { nodeId: id });
          if (scrollIntervalRef.current) {
            clearInterval(scrollIntervalRef.current);
            scrollIntervalRef.current = null;
          }
          isScrollActiveRef.current = false;
          setGlobalScrollActive(false);
          setIsScrolling(false);
        }
      } else if (!shouldScroll && isScrollActiveRef.current) {
        // Stop scrolling if auto-scroll is disabled
        log.info('Auto-scroll disabled for table node', { nodeId: id });
        if (scrollIntervalRef.current) {
          clearInterval(scrollIntervalRef.current);
          scrollIntervalRef.current = null;
        }
        isScrollActiveRef.current = false;
        setGlobalScrollActive(false);
        setIsScrolling(false);
      }
    }, 100); // Small delay to ensure DOM is ready

    return () => clearTimeout(timer);
  }, [tableData, actualNodeHeight, isLoading, error, id, globalAutoScroll]);

  // Cleanup scroll interval on unmount
  useEffect(() => {
    return () => {
      if (scrollIntervalRef.current) {
        clearInterval(scrollIntervalRef.current);
      }
      setGlobalScrollActive(false);
    };
  }, []);

  // Manual refresh - execute individual query
  const handleRefresh = useCallback(() => {
    log.debug('Manual refresh requested for table node', { nodeId: id });
    executeQuery();
  }, [id, executeQuery]);

  // Get columns to display
  const displayColumns = data.tableConfig?.columns || [];
  const hasOutOfSpec = tableData.some(row => row._status !== 'IN_SPEC');

  // Debug logging for monitoring issues
  useEffect(() => {
    if (window.location.pathname.includes('monitor')) {
      log.debug('CustomTableNode monitoring debug', {
        nodeId: id,
        hasQueryConfig: !!data.queryConfig,
        hasTableConfig: !!data.tableConfig,
        columnsCount: displayColumns.length,
        tableDataCount: tableData.length,
        isLoading,
        error,
        queryConfig: data.queryConfig,
        displayColumns: displayColumns.map(col => ({ field: col.field, header: col.header, type: col.type }))
      });
    }
  }, [id, data.queryConfig, data.tableConfig, displayColumns.length, tableData.length, isLoading, error]);

  return (
    <>
      <NodeResizer
        color={nodeColor}
        isVisible={selected && !window.location.pathname.includes('monitor') && !window.location.pathname.includes('public')}
        minWidth={300}
        minHeight={200}
        handleStyle={{ width: 8, height: 8 }}
        onResizeStart={() => setIsResizing(true)}
        onResizeEnd={() => setIsResizing(false)}
        onResize={(event, params) => {
          if (setNodes && id) {
            setNodes((nodes) => nodes.map((node) => {
              if (node.id === id) {
                return {
                  ...node,
                  style: {
                    ...node.style,
                    width: params.width,
                    height: params.height,
                  },
                  position: {
                    x: params.x,
                    y: params.y,
                  }
                };
              }
              return node;
            }));
          }
        }}
      />
      
      <Handle
        type="target"
        position={Position.Top}
        className="target"
        style={{
          top: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 10,
          height: 10,
          background: nodeColor,
          border: 'none',
          zIndex: 20
        }}
      />
      
      <div
        className={`
          rounded-lg border-2 bg-white shadow-sm overflow-hidden
          ${selected ? 'shadow-lg' : ''}
          flex flex-col
        `}
        style={{ 
          height: `${actualNodeHeight}px`,
          width: `${actualNodeWidth}px`,
          borderColor: hasOutOfSpec ? '#ef4444' : nodeColor,
        }}
      >
        {/* Header */}
        <div 
          className="px-3 py-2 border-b relative flex items-center justify-between"
          style={{ backgroundColor: nodeColor }}
        >
          <div className="flex items-center space-x-2">
            <Table size={16} className="text-white" />
            <span className="font-semibold text-sm text-white">
              {data.label || 'Custom Table'}
            </span>
          </div>
          
          <div className="flex items-center space-x-1">
            {hasOutOfSpec && (
              <AlertCircle className="w-4 h-4 text-red-200 animate-pulse" />
            )}
            {isScrolling && (
              <div className="w-2 h-2 bg-green-400 rounded-full animate-pulse" 
                   title="Auto-scrolling active" />
            )}
            <button
              onClick={handleRefresh}
              disabled={isLoading}
              className="p-1 hover:bg-white/20 rounded transition-colors"
              title={`Refresh Data ${isLoading ? '(Loading...)' : ''}`}
            >
              <RefreshCw 
                size={14} 
                className={`text-white ${isLoading ? 'animate-spin' : ''}`}
              />
            </button>
            {/* Debug indicator for monitoring */}
            {window.location.pathname.includes('monitor') && error && (
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" 
                   title={`Error: ${error}`} />
            )}
          </div>
        </div>

        {/* Status Bar */}
        <div className="px-2 py-1 bg-gray-50 border-b flex items-center justify-between text-xs">
          <div className="flex items-center space-x-2">
            <Database size={12} className="text-gray-500" />
            <span className="text-gray-600">
              {tableData.length} rows
            </span>
          </div>
          {lastRefresh && (
            <span className="text-gray-500">
              Updated: {lastRefresh.toLocaleTimeString()}
            </span>
          )}
        </div>

        {/* Table Content */}
        <div className="flex-1 overflow-hidden">
          {error ? (
            <div className="p-4 flex items-center justify-center text-red-600">
              <div className="text-center">
                <AlertCircle size={24} className="mx-auto mb-2" />
                <div className="text-sm">{error}</div>
              </div>
            </div>
          ) : isLoading ? (
            <div className="p-4 flex items-center justify-center text-gray-500">
              <div className="text-center">
                <Loader size={24} className="mx-auto mb-2 animate-spin" />
                <div className="text-sm">Loading data...</div>
              </div>
            </div>
          ) : tableData.length === 0 ? (
            <div className="p-4 flex items-center justify-center text-gray-400">
              <div className="text-center">
                <Table size={24} className="mx-auto mb-2 opacity-50" />
                <div className="text-sm">No data available</div>
                <div className="text-xs mt-1">
                  {!data.queryConfig?.sql ? (
                    "❌ No SQL query configured"
                  ) : !data.queryConfig?.dataSourceId ? (
                    "❌ No data source selected"  
                  ) : displayColumns.length === 0 ? (
                    "❌ No columns configured"
                  ) : (
                    "📡 Query returned no data"
                  )}
                </div>
                {/* Debug info for monitoring */}
                {window.location.pathname.includes('monitor') && (
                  <div className="text-xs mt-2 text-left bg-gray-100 p-2 rounded font-mono max-w-xs">
                    <div>🔍 Debug Info:</div>
                    <div>SQL: {data.queryConfig?.sql ? '✓' : '❌'}</div>
                    <div>DataSource: {data.queryConfig?.dataSourceId ? '✓' : '❌'}</div>
                    <div>Columns: {displayColumns.length}</div>
                    <div>Refresh: {data.queryConfig?.refreshInterval}s</div>
                    <div>Last: {lastRefresh?.toLocaleTimeString() || 'Never'}</div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div ref={scrollRef} className="h-full overflow-auto">
              <table className="w-full text-xs">
                <thead className="bg-gray-100 sticky top-0">
                  <tr>
                    {displayColumns.map((column, index) => (
                      <th
                        key={index}
                        className="px-2 py-1 text-left font-medium text-gray-700 border-r last:border-r-0"
                        style={{ width: column.width ? `${column.width}px` : 'auto' }}
                      >
                        {column.header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {tableData.map((row, rowIndex) => (
                    <tr
                      key={rowIndex}
                      className={`border-b hover:bg-gray-50 ${
                        row._status && row._status !== 'IN_SPEC' ? statusConfig[row._status]?.bgColor : ''
                      }`}
                    >
                      {displayColumns.map((column, colIndex) => (
                        <td
                          key={colIndex}
                          className="px-2 py-1 border-r last:border-r-0"
                        >
                          {column.type === 'status' ? (
                            <div className={`flex items-center space-x-1 ${row._status ? statusConfig[row._status]?.color : ''}`}>
                              {row._status ? statusConfig[row._status]?.icon : null}
                              <span className="font-medium">
                                {row._status ? statusConfig[row._status]?.label : 'N/A'}
                              </span>
                            </div>
                          ) : column.type === 'value' ? (
                            <span className={`font-semibold ${row._status !== 'IN_SPEC' ? row._statusColor || '' : ''}`}>
                              {row[column.field]?.toLocaleString?.() || row[column.field]}
                            </span>
                          ) : (
                            <span className="text-gray-800">
                              {row[column.field]?.toString() || '-'}
                            </span>
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="source"
        style={{
          bottom: -8,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 10,
          height: 10,
          background: nodeColor,
          border: 'none',
          zIndex: 20
        }}
      />
    </>
  );
});

CustomTableNode.displayName = 'CustomTableNode';