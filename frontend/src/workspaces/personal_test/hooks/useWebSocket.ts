import { useEffect, useRef, useState, useCallback } from 'react';

interface WebSocketOptions {
  workspace_id: string;
  token?: string;
  onMessage?: (data: any) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  reconnectDelay?: number;
  maxReconnectAttempts?: number;
}

export const useWebSocket = (options: WebSocketOptions) => {
  const {
    workspace_id,
    token = 'default-ws-token',
    onMessage,
    onConnect,
    onDisconnect,
    onError,
    reconnectDelay = 5000,
    maxReconnectAttempts = 5,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const connect = () => {
    // Check if WebSocket is enabled via environment variable
    if (import.meta.env.VITE_ENABLE_WEBSOCKET !== 'true') {
      return;
    }

    try {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = import.meta.env.VITE_API_URL || window.location.host;
      const wsUrl = `${protocol}//${host}/api/v1/personal-test/process-flow/ws/${workspace_id}?token=${token}`;
      
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
        setReconnectAttempts(0);
        onConnect?.();
        
        // Start ping interval to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send('ping');
          }
        }, 30000); // Ping every 30 seconds
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          
          // Handle different message types
          switch (data.type) {
            case 'connection':
              console.log('Connection confirmed:', data);
              break;
              
            case 'equipment_update':
              // Handle equipment status updates
              onMessage?.(data);
              break;
              
            case 'measurement_update':
              // Handle measurement data updates
              onMessage?.(data);
              break;
              
            case 'spec_alarm':
              // Handle spec violation alarms
              // Trigger custom event for AlarmNotification component
              const alarmEvent = new CustomEvent('specAlarm', {
                detail: data.alarm
              });
              window.dispatchEvent(alarmEvent);
              onMessage?.(data);
              break;
              
            default:
              onMessage?.(data);
          }
        } catch (error) {
          console.error('Error parsing WebSocket message:', error);
        }
      };

      ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        onError?.(error);
      };

      ws.onclose = (event) => {
        console.log('WebSocket disconnected:', event.code, event.reason);
        setIsConnected(false);
        onDisconnect?.();
        
        // Clear ping interval
        if (pingIntervalRef.current) {
          clearInterval(pingIntervalRef.current);
          pingIntervalRef.current = null;
        }
        
        // Attempt to reconnect if not a policy violation
        if (event.code !== 1008 && reconnectAttempts < maxReconnectAttempts) {
          reconnectTimeoutRef.current = setTimeout(() => {
            console.log(`Attempting to reconnect (${reconnectAttempts + 1}/${maxReconnectAttempts})...`);
            setReconnectAttempts(prev => prev + 1);
            connect();
          }, reconnectDelay);
        }
      };

    } catch (error) {
      console.error('Error creating WebSocket:', error);
      onError?.(error as Event);
    }
  };

  const disconnect = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
    
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    setIsConnected(false);
    setReconnectAttempts(0);
  }, []);

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(typeof message === 'string' ? message : JSON.stringify(message));
    } else {
      console.warn('WebSocket is not connected');
    }
  }, []);

  // Connect on mount and disconnect on unmount
  useEffect(() => {
    // Check if WebSocket is enabled via environment variable
    if (import.meta.env.VITE_ENABLE_WEBSOCKET !== 'true') {
      console.log('WebSocket is disabled'); // Log only once on mount
      return;
    }

    // Only connect if we haven't already
    if (!wsRef.current) {
      connect();
    }

    return () => {
      // Clean up on unmount
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
      
      if (pingIntervalRef.current) {
        clearInterval(pingIntervalRef.current);
        pingIntervalRef.current = null;
      }
      
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, []); // Empty dependency array - only run once on mount

  return {
    isConnected,
    sendMessage,
    reconnect: connect,
    disconnect,
  };
};