/**
 * Token Refresh Tester Component
 * 실시간 토큰 갱신 테스트 및 모니터링 컴포넌트
 */

import React, { useState, useEffect } from 'react';
import { useTokenStatus } from '../hooks/useAuthRefresh';
import { runComprehensiveTokenTest, simulateTokenExpiry } from '../utils/tokenTestUtils';
import { runOAuthServerCompatibilityTest, testActualRefreshTokenCall } from '../utils/oauthServerTest';
import { runTokenRotationTest } from '../utils/tokenRotationTest';
import { runComprehensiveEncryptionTest } from '../utils/encryptionTestUtils';
import { runComprehensiveSecurityEventTest } from '../utils/securityEventTestUtils';
import { runAllTokenFlowTests } from '../utils/tokenFlowAutomatedTest';

interface TestResult {
  timestamp: string;
  type: 'token_test' | 'oauth_test' | 'refresh_test' | 'session_test' | 'rotation_test' | 'encryption_test' | 'security_event_test' | 'automated_flow_test';
  success: boolean;
  data: any;
  error?: string;
}

export const TokenRefreshTester: React.FC = () => {
  const [isVisible, setIsVisible] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [results, setResults] = useState<TestResult[]>([]);
  const [autoTestEnabled, setAutoTestEnabled] = useState(false);
  const tokenStatus = useTokenStatus();

  // 자동 테스트 실행
  useEffect(() => {
    if (!autoTestEnabled) return;

    const interval = setInterval(async () => {
      if (!isRunning) {
        await runTokenTest();
      }
    }, 30000); // 30초마다 테스트

    return () => clearInterval(interval);
  }, [autoTestEnabled, isRunning]);

  const addResult = (type: TestResult['type'], success: boolean, data: any, error?: string) => {
    const result: TestResult = {
      timestamp: new Date().toISOString(),
      type,
      success,
      data,
      error
    };
    
    setResults(prev => [result, ...prev.slice(0, 9)]); // 최근 10개만 유지
  };

  const runTokenTest = async () => {
    setIsRunning(true);
    try {
      const result = await runComprehensiveTokenTest();
      addResult('token_test', true, result);
    } catch (error: any) {
      addResult('token_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const runOAuthTest = async () => {
    setIsRunning(true);
    try {
      const result = await runOAuthServerCompatibilityTest();
      addResult('oauth_test', result.compatibilityIssues.length === 0, result);
    } catch (error: any) {
      addResult('oauth_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const runRefreshTest = async () => {
    setIsRunning(true);
    try {
      const result = await testActualRefreshTokenCall();
      addResult('refresh_test', result.success, result);
    } catch (error: any) {
      addResult('refresh_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const runSessionTest = async () => {
    setIsRunning(true);
    try {
      const { runSessionPersistenceTest } = await import('../utils/sessionPersistenceTest');
      const result = await runSessionPersistenceTest();
      addResult('session_test', result.persistenceTests.longTermStorageTest.success, result);
    } catch (error: any) {
      addResult('session_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const runRotationTest = async (forceRefresh: boolean = false) => {
    setIsRunning(true);
    try {
      const result = await runTokenRotationTest(forceRefresh);
      const success = result.rotationResults.rotationMethod !== 'failed';
      addResult('rotation_test', success, result);
    } catch (error: any) {
      addResult('rotation_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const runEncryptionTest = async () => {
    setIsRunning(true);
    try {
      const result = await runComprehensiveEncryptionTest();
      addResult('encryption_test', result.browserSupport.overall && result.encryptionTests.basicEncryption.success, result);
    } catch (error: any) {
      addResult('encryption_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const runSecurityEventTest = async () => {
    setIsRunning(true);
    try {
      const result = await runComprehensiveSecurityEventTest();
      const allEventTestsPassed = Object.values(result.eventTests).every(test => test.success);
      addResult('security_event_test', result.loggerStatus.isEnabled && allEventTestsPassed, result);
    } catch (error: any) {
      addResult('security_event_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const runAutomatedFlowTest = async () => {
    setIsRunning(true);
    try {
      const result = await runAllTokenFlowTests();
      addResult('automated_flow_test', result.overallSuccess, result);
    } catch (error: any) {
      addResult('automated_flow_test', false, null, error.message);
    }
    setIsRunning(false);
  };

  const simulateNearExpiry = () => {
    simulateTokenExpiry(240); // 4분 후 만료로 설정
    console.log('🧪 Token expiry simulated - auto refresh should trigger soon');
  };

  const simulateImmediateExpiry = () => {
    simulateTokenExpiry(60); // 1분 후 만료로 설정
    console.log('🧪 Immediate token expiry simulated');
  };

  // Development mode에서만 표시
  if (import.meta.env.PROD) {
    return null;
  }

  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-20 right-4 bg-blue-600 text-white px-3 py-2 rounded text-xs shadow-lg"
      >
        Token Tester
      </button>
    );
  }

  return (
    <div className="fixed bottom-4 right-4 bg-white border rounded-lg shadow-xl max-w-md w-full max-h-96 overflow-hidden z-50">
      {/* Header */}
      <div className="bg-blue-600 text-white p-3 flex justify-between items-center">
        <h3 className="font-bold text-sm">Token Refresh Tester</h3>
        <button
          onClick={() => setIsVisible(false)}
          className="text-blue-200 hover:text-white"
        >
          ×
        </button>
      </div>

      {/* Current Status */}
      <div className="p-3 border-b bg-gray-50">
        <div className="text-xs space-y-1">
          <div className="flex justify-between">
            <span>Auth Status:</span>
            <span className={tokenStatus.accessTokenTimeToExpiry > 0 ? 'text-green-600' : 'text-red-600'}>
              {tokenStatus.accessTokenTimeToExpiry > 0 ? 'Active' : 'Expired'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Access Token TTL:</span>
            <span>{Math.max(0, Math.floor(tokenStatus.accessTokenTimeToExpiry))}s</span>
          </div>
          <div className="flex justify-between">
            <span>Refresh Token TTL:</span>
            <span>{Math.max(0, Math.floor(tokenStatus.refreshTokenTimeToExpiry))}s</span>
          </div>
          <div className="flex justify-between">
            <span>Needs Refresh:</span>
            <span className={tokenStatus.needsAccessTokenRefresh ? 'text-orange-600' : 'text-green-600'}>
              {tokenStatus.needsAccessTokenRefresh ? 'Yes' : 'No'}
            </span>
          </div>
          <div className="flex justify-between">
            <span>Refresh Method:</span>
            <span className="text-blue-600">{tokenStatus.refreshMethod || 'None'}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="p-3 border-b space-y-2">
        <div className="flex items-center justify-between">
          <label className="text-xs">Auto Test:</label>
          <input
            type="checkbox"
            checked={autoTestEnabled}
            onChange={(e) => setAutoTestEnabled(e.target.checked)}
            className="rounded"
          />
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={runTokenTest}
            disabled={isRunning}
            className="bg-blue-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Token Test
          </button>
          <button
            onClick={runOAuthTest}
            disabled={isRunning}
            className="bg-green-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            OAuth Test
          </button>
          <button
            onClick={runRefreshTest}
            disabled={isRunning}
            className="bg-purple-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Refresh Test
          </button>
          <button
            onClick={runSessionTest}
            disabled={isRunning}
            className="bg-indigo-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Session Test
          </button>
          <button
            onClick={() => runRotationTest(false)}
            disabled={isRunning}
            className="bg-pink-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Rotation Test
          </button>
          <button
            onClick={() => runRotationTest(true)}
            disabled={isRunning}
            className="bg-pink-600 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Force Rotation
          </button>
          <button
            onClick={runEncryptionTest}
            disabled={isRunning}
            className="bg-yellow-500 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Encryption Test
          </button>
          <button
            onClick={runSecurityEventTest}
            disabled={isRunning}
            className="bg-red-600 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            Security Event Test
          </button>
          <button
            onClick={runAutomatedFlowTest}
            disabled={isRunning}
            className="bg-gray-700 text-white px-2 py-1 rounded text-xs disabled:opacity-50"
          >
            🤖 Full Auto Test
          </button>
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <button
            onClick={simulateNearExpiry}
            className="bg-orange-500 text-white px-2 py-1 rounded text-xs"
          >
            Simulate Near Expiry
          </button>
          <button
            onClick={simulateImmediateExpiry}
            className="bg-red-500 text-white px-2 py-1 rounded text-xs"
          >
            Simulate Immediate
          </button>
        </div>
      </div>

      {/* Results */}
      <div className="p-3 max-h-48 overflow-y-auto">
        <div className="text-xs font-semibold mb-2">Recent Test Results:</div>
        {results.length === 0 ? (
          <div className="text-gray-500 text-xs">No tests run yet</div>
        ) : (
          <div className="space-y-2">
            {results.map((result, index) => (
              <div
                key={index}
                className={`p-2 rounded text-xs ${
                  result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
                }`}
              >
                <div className="flex justify-between items-center">
                  <span className={`font-medium ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                    {result.type.replace('_', ' ').toUpperCase()}
                  </span>
                  <span className="text-gray-500">
                    {new Date(result.timestamp).toLocaleTimeString()}
                  </span>
                </div>
                
                {result.success ? (
                  <div className="mt-1 text-green-600">
                    {result.type === 'token_test' && (
                      <div>
                        Auth: {result.data.currentState.isAuthenticated ? '✓' : '✗'} | 
                        Storage: {result.data.testResults.storageConsistency?.allTokensPresent ? '✓' : '✗'} |
                        Refresh: {result.data.testResults.manualRefreshTest?.success ? '✓' : '✗'}
                      </div>
                    )}
                    {result.type === 'oauth_test' && (
                      <div>
                        Issues: {result.data.compatibilityIssues.length} |
                        Refresh Support: {result.data.endpointTests.wellKnown?.supportsRefreshToken ? '✓' : '✗'}
                      </div>
                    )}
                    {result.type === 'refresh_test' && (
                      <div>
                        Method: {result.data.method} | Duration: {result.data.duration}ms
                      </div>
                    )}
                    {result.type === 'session_test' && (
                      <div>
                        30-Day: {result.data.persistenceTests.longTermStorageTest.success ? '✓' : '✗'} |
                        Recovery: {result.data.persistenceTests.sessionRecoveryTest.canRecoverAfterRestart ? '✓' : '✗'} |
                        Rotation: {result.data.persistenceTests.refreshTokenRenewalTest.rotationOccurred ? '✓' : '✗'}
                      </div>
                    )}
                    {result.type === 'rotation_test' && (
                      <div>
                        Method: {result.data.rotationResults.rotationMethod} |
                        Access: {result.data.rotationResults.accessTokenRotated ? '✓' : '✗'} |
                        Refresh: {result.data.rotationResults.refreshTokenRotated ? '✓' : '✗'} |
                        Duration: {result.data.rotationResults.duration}ms
                      </div>
                    )}
                    {result.type === 'encryption_test' && (
                      <div>
                        Support: {result.data.browserSupport.overall ? '✓' : '✗'} |
                        Encrypt: {result.data.encryptionTests.basicEncryption.success ? '✓' : '✗'} |
                        Decrypt: {result.data.encryptionTests.decryption.success ? '✓' : '✗'} |
                        Storage: {result.data.encryptionTests.storageIntegration.encrypted ? '✓' : '✗'}
                      </div>
                    )}
                    {result.type === 'security_event_test' && (
                      <div>
                        Logger: {result.data.loggerStatus.isEnabled ? '✓' : '✗'} |
                        Queue: {result.data.loggerStatus.queueLength} |
                        Events: {Object.values(result.data.eventTests).filter((t: any) => t.success).length}/4 |
                        Server: {result.data.serverIntegration.endpointReachable ? '✓' : '✗'}
                      </div>
                    )}
                    {result.type === 'automated_flow_test' && (
                      <div>
                        Basic: {result.data.basicTest.overallSuccess ? '✓' : '✗'} |
                        Advanced: {result.data.advancedTest.overallSuccess ? '✓' : '✗'} |
                        Steps: {result.data.basicTest.summary.passedSteps + result.data.advancedTest.summary.passedSteps}/{result.data.basicTest.summary.totalSteps + result.data.advancedTest.summary.totalSteps} |
                        Duration: {Math.round((result.data.basicTest.totalDuration + result.data.advancedTest.totalDuration)/1000)}s
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="mt-1 text-red-600">
                    Error: {result.error || 'Unknown error'}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {isRunning && (
        <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center">
          <div className="bg-white rounded p-4 text-center">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto mb-2"></div>
            <div className="text-sm">Running test...</div>
          </div>
        </div>
      )}
    </div>
  );
};

export default TokenRefreshTester;