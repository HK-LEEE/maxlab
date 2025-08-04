import React, { useEffect, useState, useRef } from 'react';

interface DiagnosticLog {
  timestamp: number;
  level: 'info' | 'warn' | 'error' | 'success' | 'debug';
  message: string;
  data?: any;
}

interface PopupDiagnosticProps {
  onClose?: () => void;
}

export const PopupDiagnostic: React.FC<PopupDiagnosticProps> = ({ onClose }) => {
  const [logs, setLogs] = useState<DiagnosticLog[]>([]);
  const [isTestingPopup, setIsTestingPopup] = useState(false);
  const [popupWindow, setPopupWindow] = useState<Window | null>(null);
  const [testResults, setTestResults] = useState<{
    popupOpened: boolean;
    callbackPageLoaded: boolean;
    communicationReceived: boolean;
    popupClosed: boolean;
  }>({
    popupOpened: false,
    callbackPageLoaded: false,
    communicationReceived: false,
    popupClosed: false
  });

  const logRef = useRef<HTMLDivElement>(null);
  const messageListenerRef = useRef<((event: MessageEvent) => void) | null>(null);
  const broadcastListenerRef = useRef<BroadcastChannel | null>(null);

  const addLog = (level: DiagnosticLog['level'], message: string, data?: any) => {
    const newLog: DiagnosticLog = {
      timestamp: Date.now(),
      level,
      message,
      data
    };
    
    setLogs(prev => [...prev, newLog]);
    console.log(`[PopupDiagnostic ${level.toUpperCase()}]`, message, data || '');
    
    // Auto-scroll to bottom
    setTimeout(() => {
      if (logRef.current) {
        logRef.current.scrollTop = logRef.current.scrollHeight;
      }
    }, 100);
  };

  // Setup communication listeners
  useEffect(() => {
    addLog('info', '🔧 Setting up popup diagnostic listeners...');

    // PostMessage listener
    const messageListener = (event: MessageEvent) => {
      addLog('info', `📨 PostMessage received from: ${event.origin}`, {
        type: event.data?.type,
        data: event.data
      });

      if (event.data?.type === 'OAUTH_SUCCESS') {
        setTestResults(prev => ({ ...prev, communicationReceived: true }));
        addLog('success', '✅ OAuth success message received!', event.data);
      } else if (event.data?.type === 'OAUTH_ERROR') {
        setTestResults(prev => ({ ...prev, communicationReceived: true }));
        addLog('error', '❌ OAuth error message received!', event.data);
      } else if (event.data?.type === 'POPUP_LOADED') {
        setTestResults(prev => ({ ...prev, callbackPageLoaded: true }));
        addLog('success', '✅ Popup callback page loaded!', event.data);
      }
    };

    window.addEventListener('message', messageListener);
    messageListenerRef.current = messageListener;

    // BroadcastChannel listener
    try {
      const channel = new BroadcastChannel('oauth_channel');
      channel.onmessage = (event) => {
        addLog('info', '📡 BroadcastChannel message received', {
          type: event.data?.type,
          data: event.data
        });

        if (event.data?.type === 'OAUTH_SUCCESS') {
          setTestResults(prev => ({ ...prev, communicationReceived: true }));
          addLog('success', '✅ OAuth success via BroadcastChannel!', event.data);
        }
      };
      broadcastListenerRef.current = channel;
      addLog('success', '✅ BroadcastChannel listener active');
    } catch (e) {
      addLog('warn', '⚠️ BroadcastChannel not supported', e);
    }

    // SessionStorage polling
    let pollCount = 0;
    const maxPolls = 600; // 30 seconds
    const pollInterval = setInterval(() => {
      pollCount++;

      const keys = ['oauth_result', 'oauth_success', 'oauth_token_data', 'oauth_error', 'oauth_access_token'];
      for (const key of keys) {
        const value = sessionStorage.getItem(key);
        if (value) {
          addLog('success', `💾 SessionStorage result found in ${key}`, value);
          setTestResults(prev => ({ ...prev, communicationReceived: true }));
          sessionStorage.removeItem(key); // Clean up
          clearInterval(pollInterval);
          return;
        }
      }

      if (pollCount >= maxPolls) {
        clearInterval(pollInterval);
        addLog('warn', '⏰ SessionStorage polling timeout (30s)');
      }
    }, 50);

    addLog('success', '✅ All diagnostic listeners setup complete');

    return () => {
      window.removeEventListener('message', messageListener);
      if (broadcastListenerRef.current) {
        broadcastListenerRef.current.close();
      }
      clearInterval(pollInterval);
    };
  }, []);

  // Monitor popup window
  useEffect(() => {
    if (!popupWindow) return;

    const checkInterval = setInterval(() => {
      if (popupWindow.closed) {
        addLog('info', '🚪 Popup window closed');
        setTestResults(prev => ({ ...prev, popupClosed: true }));
        setIsTestingPopup(false);
        setPopupWindow(null);
        clearInterval(checkInterval);
      }
    }, 1000);

    return () => clearInterval(checkInterval);
  }, [popupWindow]);

  const startPopupTest = () => {
    addLog('info', '🚀 Starting comprehensive popup communication test...');
    setIsTestingPopup(true);
    setTestResults({
      popupOpened: false,
      callbackPageLoaded: false,
      communicationReceived: false,
      popupClosed: false
    });

    // Clear any existing OAuth state
    addLog('debug', '🧹 Clearing existing OAuth state...');
    const oauthKeys = Object.keys(sessionStorage).filter(key => 
      key.includes('oauth') || key.includes('_force_') || key.includes('state_')
    );
    oauthKeys.forEach(key => sessionStorage.removeItem(key));

    // Generate OAuth parameters
    const state = generateCodeVerifier();
    const codeVerifier = generateCodeVerifier();
    const nonce = generateCodeVerifier();
    const forceState = state + '_force_' + Date.now();

    addLog('debug', '🔐 Generated OAuth parameters', {
      originalState: state.substring(0, 8) + '...',
      forceState: forceState,
      codeVerifier: codeVerifier.substring(0, 8) + '...'
    });

    // Setup OAuth flow state in React app format
    const flowId = 'diagnostic_flow_' + Date.now();
    const flowState = {
      state: state, // Original state for lookup
      codeVerifier: codeVerifier,
      nonce: nonce,
      flowId: flowId,
      flowType: 'popup',
      clientId: 'maxlab',
      redirectUri: `${window.location.origin}/oauth/callback`,
      createdAt: Date.now(),
      expiresAt: Date.now() + (15 * 60 * 1000),
      parentOrigin: window.location.origin,
      forceAccountSelection: true,
      status: 'in_progress',
      lastUpdated: Date.now()
    };

    // Store OAuth flow state
    sessionStorage.setItem(`oauth_flow_${flowId}`, JSON.stringify(flowState));
    
    // Legacy format for backward compatibility
    sessionStorage.setItem('oauth_state', forceState);
    sessionStorage.setItem('oauth_code_verifier', codeVerifier);
    sessionStorage.setItem('oauth_nonce', nonce);
    sessionStorage.setItem('oauth_popup_mode', 'true');
    sessionStorage.setItem('oauth_force_account_selection', 'true');
    sessionStorage.setItem('oauth_parent_origin', window.location.origin);

    addLog('success', '📋 OAuth flow state created', {
      flowId,
      stateKey: `oauth_flow_${flowId}`
    });

    // Build OAuth URL with diagnostic parameters
    const params = new URLSearchParams({
      response_type: 'code',
      client_id: 'maxlab',
      redirect_uri: `${window.location.origin}/oauth/callback`,
      scope: 'openid profile email offline_access read:profile read:groups manage:workflows',
      state: forceState,
      code_challenge: 'dummy_challenge', // We're not doing real auth
      code_challenge_method: 'S256',
      nonce: nonce,
      prompt: 'login',
      // Add diagnostic flag
      diagnostic: 'true'
    });

    const authUrl = `http://localhost:8000/api/oauth/authorize?${params}`;
    addLog('debug', '🔗 Opening popup with URL', authUrl);

    // Open popup
    try {
      const popup = window.open(
        authUrl,
        'oauth-diagnostic-popup',
        'width=500,height=600,scrollbars=yes,resizable=yes,location=yes'
      );

      if (!popup) {
        addLog('error', '❌ Popup blocked by browser');
        setIsTestingPopup(false);
        return;
      }

      setPopupWindow(popup);
      setTestResults(prev => ({ ...prev, popupOpened: true }));
      addLog('success', '✅ Popup opened successfully');

      // Send initial message to popup after a delay
      setTimeout(() => {
        if (popup && !popup.closed) {
          try {
            popup.postMessage({ 
              type: 'PARENT_READY', 
              timestamp: Date.now(),
              parentOrigin: window.location.origin
            }, '*');
            addLog('debug', '📤 Sent PARENT_READY message to popup');
          } catch (e) {
            addLog('warn', `⚠️ Failed to send PARENT_READY: ${e instanceof Error ? e.message : String(e)}`);
          }
        }
      }, 2000);

    } catch (error) {
      addLog('error', `❌ Failed to open popup: ${error instanceof Error ? error.message : String(error)}`);
      setIsTestingPopup(false);
    }
  };

  const generateCodeVerifier = () => {
    const array = new Uint8Array(32);
    crypto.getRandomValues(array);
    return btoa(String.fromCharCode(...array))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  };

  const clearLogs = () => {
    setLogs([]);
    addLog('info', '🧹 Diagnostic logs cleared');
  };

  const getLevelColor = (level: DiagnosticLog['level']) => {
    const colors = {
      info: '#00ff00',
      warn: '#ffff00',
      error: '#ff0000',
      success: '#00ff88',
      debug: '#88ff88'
    };
    return colors[level] || '#00ff00';
  };

  const formatTimestamp = (timestamp: number) => {
    return new Date(timestamp).toISOString().split('.')[0].replace('T', ' ');
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,  
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.8)',
      zIndex: 9999,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center'
    }}>
      <div style={{
        backgroundColor: 'white',
        borderRadius: '8px',
        padding: '20px',
        maxWidth: '90vw',
        maxHeight: '90vh',
        overflow: 'auto',
        minWidth: '800px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
          <h2>🔍 OAuth Popup Communication Diagnostic</h2>
          {onClose && (
            <button onClick={onClose} style={{
              background: '#dc2626',
              color: 'white',
              border: 'none',
              padding: '8px 16px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}>
              Close
            </button>
          )}
        </div>

        {/* Test Status */}
        <div style={{
          backgroundColor: '#f3f4f6',
          padding: '15px',
          borderRadius: '6px',
          marginBottom: '20px'
        }}>
          <h3>Test Progress</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '10px' }}>
            <div style={{
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: testResults.popupOpened ? '#dcfce7' : '#f3f4f6',
              color: testResults.popupOpened ? '#16a34a' : '#6b7280'
            }}>
              {testResults.popupOpened ? '✅' : '⏳'} Popup Opened
            </div>
            <div style={{
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: testResults.callbackPageLoaded ? '#dcfce7' : '#f3f4f6',
              color: testResults.callbackPageLoaded ? '#16a34a' : '#6b7280'
            }}>
              {testResults.callbackPageLoaded ? '✅' : '⏳'} Callback Loaded
            </div>
            <div style={{
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: testResults.communicationReceived ? '#dcfce7' : '#f3f4f6',
              color: testResults.communicationReceived ? '#16a34a' : '#6b7280'
            }}>
              {testResults.communicationReceived ? '✅' : '⏳'} Communication
            </div>
            <div style={{
              padding: '10px',
              borderRadius: '4px',
              backgroundColor: testResults.popupClosed ? '#dcfce7' : '#f3f4f6',
              color: testResults.popupClosed ? '#16a34a' : '#6b7280'
            }}>
              {testResults.popupClosed ? '✅' : '⏳'} Popup Closed
            </div>
          </div>
        </div>

        {/* Controls */}
        <div style={{ marginBottom: '20px' }}>
          <button
            onClick={startPopupTest}
            disabled={isTestingPopup}
            style={{
              background: isTestingPopup ? '#9ca3af' : '#3b82f6',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '4px',
              cursor: isTestingPopup ? 'not-allowed' : 'pointer',
              marginRight: '10px'
            }}
          >
            {isTestingPopup ? '🔄 Testing...' : '🚀 Start Popup Test'}
          </button>
          <button
            onClick={clearLogs}
            style={{
              background: '#6b7280',
              color: 'white',
              border: 'none',
              padding: '12px 24px',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Clear Logs
          </button>
        </div>

        {/* Diagnostic Logs */}
        <div>
          <h3>Diagnostic Logs</h3>
          <div
            ref={logRef}
            style={{
              backgroundColor: '#1a1a1a',
              color: '#00ff00',
              padding: '15px',
              borderRadius: '4px',
              fontFamily: 'Courier New, monospace',
              fontSize: '11px',
              height: '400px',
              overflowY: 'auto',
              whiteSpace: 'pre-wrap'
            }}
          >
            {logs.map((log, index) => (
              <div key={index} style={{ color: getLevelColor(log.level) }}>
                [{formatTimestamp(log.timestamp)}] {log.message}
                {log.data && (
                  <div style={{ marginLeft: '20px', fontSize: '10px', opacity: 0.8 }}>
                    {typeof log.data === 'string' ? log.data : JSON.stringify(log.data, null, 2)}
                  </div>
                )}
              </div>
            ))}
            {logs.length === 0 && (
              <div style={{ color: '#6b7280' }}>
                No logs yet. Click "Start Popup Test" to begin diagnostic.
              </div>
            )}
          </div>
        </div>

        <div style={{ 
          marginTop: '15px', 
          fontSize: '12px', 
          color: '#6b7280',
          backgroundColor: '#f9fafb',
          padding: '10px',
          borderRadius: '4px'
        }}>
          <strong>Instructions:</strong> This diagnostic tool will open an OAuth popup and monitor all communication channels. 
          It will show exactly what happens when the popup tries to communicate back to the parent window.
          Complete any authentication in the popup and watch the logs to see what communication is received.
        </div>
      </div>
    </div>
  );
};