import React, { useState } from 'react';
import { PopupDiagnostic } from '../components/debug/PopupDiagnostic';

export const DiagnosticTest: React.FC = () => {
  const [showDiagnostic, setShowDiagnostic] = useState(false);

  return (
    <div style={{ padding: '20px', maxWidth: '800px', margin: '0 auto' }}>
      <h1>🔍 OAuth Popup Diagnostic Test Page</h1>
      
      <div style={{
        backgroundColor: '#f3f4f6',
        padding: '20px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h2>Purpose</h2>
        <p>
          This page provides access to the comprehensive OAuth popup diagnostic tool 
          that will help identify exactly where the communication breakdown occurs 
          during the "다른 사용자로 로그인" (different user login) flow.
        </p>
      </div>

      <div style={{
        backgroundColor: '#fef3c7',
        border: '2px solid #f59e0b',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3>🎯 What the Diagnostic Will Test</h3>
        <ul>
          <li>OAuth flow state creation and storage</li>
          <li>Popup window opening and detection</li>
          <li>OAuth callback page loading in popup</li>
          <li>PostMessage communication between popup and parent</li>
          <li>BroadcastChannel communication</li>
          <li>SessionStorage communication fallback</li>
          <li>Popup closing behavior</li>
        </ul>
      </div>

      <div style={{
        backgroundColor: '#dcfce7',
        border: '2px solid #22c55e',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3>✅ Expected Results</h3>
        <p>
          If OAuth communication is working correctly, you should see:
        </p>
        <ul>
          <li>✅ Popup Opened</li>
          <li>✅ Callback Loaded (POPUP_LOADED message received)</li>
          <li>✅ Communication (OAuth success message received)</li>
          <li>✅ Popup Closed (automatically after success)</li>
        </ul>
      </div>

      <div style={{
        backgroundColor: '#fef2f2',
        border: '2px solid #ef4444',
        padding: '15px',
        borderRadius: '8px',
        marginBottom: '20px'
      }}>
        <h3>❌ Current Issue</h3>
        <p>
          Based on previous tests, we expect to see:
        </p>
        <ul>
          <li>✅ Popup Opened - This should work</li>
          <li>❓ Callback Loaded - May or may not receive POPUP_LOADED message</li>
          <li>❌ Communication - No OAuth success message received</li>
          <li>❌ Popup Closed - Popup stays open because no success acknowledgment</li>
        </ul>
      </div>

      <button
        onClick={() => setShowDiagnostic(true)}
        style={{
          backgroundColor: '#3b82f6',
          color: 'white',
          border: 'none',
          padding: '15px 30px',
          borderRadius: '8px',
          fontSize: '18px',
          cursor: 'pointer',
          fontWeight: 'bold'
        }}
      >
        🚀 Launch OAuth Popup Diagnostic
      </button>

      {showDiagnostic && (
        <PopupDiagnostic onClose={() => setShowDiagnostic(false)} />
      )}

      <div style={{
        marginTop: '30px',
        padding: '15px',
        backgroundColor: '#f1f5f9',
        borderRadius: '8px'
      }}>
        <h3>📋 Instructions</h3>
        <ol>
          <li>Click "Launch OAuth Popup Diagnostic" above</li>
          <li>Click "Start Popup Test" in the diagnostic modal</li>
          <li>Watch the test progress indicators</li>
          <li>Review the diagnostic logs for detailed information</li>
          <li>If popup opens for authentication, complete the login process</li>
          <li>Monitor logs to see exactly what messages are received</li>
          <li>Review the final summary for recommendations</li>
        </ol>
      </div>

      <div style={{
        marginTop: '20px',
        padding: '15px',
        backgroundColor: '#eff6ff',
        borderRadius: '8px'
      }}>
        <h3>🔧 Alternative Test Methods</h3>
        <p>If the React component doesn't work, you can also use:</p>
        <ul>
          <li>
            <strong>Standalone HTML:</strong> 
            <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>
              /oauth-popup-diagnostic.html
            </code>
          </li>
          <li>
            <strong>Simple Test:</strong> 
            <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>
              /test-different-user-login.html
            </code>
          </li>
          <li>
            <strong>Callback Debug:</strong> 
            <code style={{ backgroundColor: '#e5e7eb', padding: '2px 6px', borderRadius: '4px' }}>
              /oauth-callback-debug.html
            </code>
          </li>
        </ul>
      </div>
    </div>
  );
};