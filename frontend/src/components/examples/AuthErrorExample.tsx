/**
 * Authentication Error UI Components Example
 * 
 * Demonstrates how to use the new authentication error handling components
 * This component shows various error scenarios and how they're handled
 */

import React, { useState } from 'react';
import { AuthErrorHandler } from '../common/AuthErrorHandler';
import { AuthErrorModal } from '../common/AuthErrorModal';
import type { AuthErrorData } from '../../types/errors';
import { AuthErrorToast } from '../common/AuthErrorToast';
import { useAuthErrorHandling } from '../../hooks/useAuthErrorHandling';
import { apiClient } from '../../api/client';

const AuthErrorExample: React.FC = () => {
  const { handleApiError, handleLoginRequired, handlePermissionDenied } = useAuthErrorHandling();
  const [showModalExample, setShowModalExample] = useState(false);
  const [showToastExample, setShowToastExample] = useState(false);
  const [currentErrorData, setCurrentErrorData] = useState<AuthErrorData | null>(null);

  // Example error data for testing
  const createSampleError = (errorCode: string): AuthErrorData => {
    const errorMap = {
      'AUTH_001': {
        error_code: 'AUTH_001',
        error_title: 'Authentication Required',
        user_message: 'Your session appears to be invalid. Please log in again.',
        user_action: 'login_required',
        severity: 'medium',
        category: 'AUTH',
        request_id: 'req_' + Date.now()
      },
      'AUTH_002': {
        error_code: 'AUTH_002',
        error_title: 'Session Expired',
        user_message: 'Your session has expired. Please log in to continue.',
        user_action: 'login_required',
        severity: 'medium',
        category: 'AUTH',
        request_id: 'req_' + Date.now()
      },
      'PERM_001': {
        error_code: 'PERM_001',
        error_title: 'Permission Denied',
        user_message: 'You don\'t have permission to perform this action.',
        user_action: 'contact_support',
        severity: 'medium',
        category: 'PERM',
        request_id: 'req_' + Date.now()
      },
      'PERM_003': {
        error_code: 'PERM_003',
        error_title: 'Workspace Access Denied',
        user_message: 'You don\'t have access to this workspace.',
        user_action: 'contact_support',
        severity: 'medium',
        category: 'PERM',
        request_id: 'req_' + Date.now()
      },
      'CONN_001': {
        error_code: 'CONN_001',
        error_title: 'Connection Error',
        user_message: 'We\'re having trouble connecting to our authentication service. Please try again in a moment.',
        user_action: 'retry_allowed',
        severity: 'medium',
        category: 'CONN',
        request_id: 'req_' + Date.now()
      },
      'SYS_001': {
        error_code: 'SYS_001',
        error_title: 'System Error',
        user_message: 'Something went wrong on our end. Please try again later.',
        user_action: 'retry_allowed',
        severity: 'high',
        category: 'SYS',
        request_id: 'req_' + Date.now()
      }
    };

    return errorMap[errorCode as keyof typeof errorMap] as AuthErrorData;
  };

  // Test functions
  const testAuthError = () => {
    const error = { 
      response: { 
        status: 401, 
        data: { 
          error_code: 'AUTH_001',
          error_title: 'Authentication Required',
          user_message: 'Your session appears to be invalid. Please log in again.',
          user_action: 'login_required',
          severity: 'medium',
          category: 'AUTH'
        }
      }
    };
    handleApiError(error, { context: 'Example Test' });
  };

  const testPermissionError = () => {
    const error = { 
      response: { 
        status: 403, 
        data: { 
          error_code: 'PERM_001',
          error_title: 'Permission Denied',
          user_message: 'You don\'t have permission to perform this action.',
          user_action: 'contact_support',
          severity: 'medium',
          category: 'PERM'
        }
      }
    };
    handleApiError(error, { context: 'Example Test' });
  };

  const testConnectionError = () => {
    const error = { 
      code: 'NETWORK_ERROR',
      message: 'Network Error'
    };
    handleApiError(error, { context: 'Example Test' });
  };

  const testApiCall = async () => {
    try {
      // This will trigger the error interceptor
      await apiClient.get('/api/test/auth-error');
    } catch (error) {
      console.log('API call error handled by interceptor:', error);
    }
  };

  const showModalTest = (errorCode: string) => {
    const errorData = createSampleError(errorCode);
    setCurrentErrorData(errorData);
    setShowModalExample(true);
  };

  const showToastTest = (errorCode: string) => {
    const errorData = createSampleError(errorCode);
    setCurrentErrorData(errorData);
    setShowToastExample(true);
    // Auto-hide toast after 5 seconds
    setTimeout(() => setShowToastExample(false), 5000);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Authentication Error UI Components</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Error Handler Tests */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">🔧 Error Handler Tests</h2>
          <div className="space-y-3">
            <button
              onClick={testAuthError}
              className="w-full bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Test Auth Error (401)
            </button>
            <button
              onClick={testPermissionError}
              className="w-full bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
            >
              Test Permission Error (403)
            </button>
            <button
              onClick={testConnectionError}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Test Connection Error
            </button>
            <button
              onClick={testApiCall}
              className="w-full bg-purple-500 text-white px-4 py-2 rounded hover:bg-purple-600"
            >
              Test API Call with Interceptor
            </button>
          </div>
        </div>

        {/* Manual Action Tests */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">🚀 Manual Actions</h2>
          <div className="space-y-3">
            <button
              onClick={() => handleLoginRequired('Please log in to continue')}
              className="w-full bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
            >
              Trigger Login Required
            </button>
            <button
              onClick={() => handlePermissionDenied('You need admin access')}
              className="w-full bg-yellow-500 text-white px-4 py-2 rounded hover:bg-yellow-600"
            >
              Trigger Permission Denied
            </button>
          </div>
        </div>

        {/* Modal Tests */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">🔲 Modal Tests</h2>
          <div className="space-y-3">
            <button
              onClick={() => showModalTest('AUTH_001')}
              className="w-full bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Show Auth Error Modal
            </button>
            <button
              onClick={() => showModalTest('PERM_003')}
              className="w-full bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
            >
              Show Permission Modal
            </button>
            <button
              onClick={() => showModalTest('SYS_001')}
              className="w-full bg-gray-500 text-white px-4 py-2 rounded hover:bg-gray-600"
            >
              Show System Error Modal
            </button>
          </div>
        </div>

        {/* Toast Tests */}
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h2 className="text-xl font-semibold mb-4">🍞 Toast Tests</h2>
          <div className="space-y-3">
            <button
              onClick={() => showToastTest('AUTH_002')}
              className="w-full bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
            >
              Show Auth Toast
            </button>
            <button
              onClick={() => showToastTest('CONN_001')}
              className="w-full bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
            >
              Show Connection Toast
            </button>
            <button
              onClick={() => showToastTest('PERM_001')}
              className="w-full bg-orange-500 text-white px-4 py-2 rounded hover:bg-orange-600"
            >
              Show Permission Toast
            </button>
          </div>
        </div>
      </div>

      {/* Usage Instructions */}
      <div className="mt-8 bg-gray-50 p-6 rounded-lg">
        <h2 className="text-xl font-semibold mb-4">📚 Usage Instructions</h2>
        <div className="space-y-4">
          <div>
            <h3 className="font-semibold text-lg">1. Wrap your App with AuthErrorHandler</h3>
            <pre className="bg-gray-100 p-3 rounded mt-2 overflow-x-auto">
{`<AuthErrorHandler>
  <YourApp />
</AuthErrorHandler>`}
            </pre>
          </div>
          
          <div>
            <h3 className="font-semibold text-lg">2. Use the hook in components</h3>
            <pre className="bg-gray-100 p-3 rounded mt-2 overflow-x-auto">
{`const { handleApiError, handleLoginRequired } = useAuthErrorHandling();

// Handle API errors
try {
  await apiClient.get('/api/data');
} catch (error) {
  handleApiError(error);
}`}
            </pre>
          </div>
          
          <div>
            <h3 className="font-semibold text-lg">3. Errors are automatically handled</h3>
            <p className="text-gray-600">
              The axios interceptor automatically catches and handles authentication errors.
              Modal or toast notifications are shown based on error severity.
            </p>
          </div>
        </div>
      </div>

      {/* Manual Modal Test */}
      <AuthErrorModal
        isOpen={showModalExample}
        onClose={() => setShowModalExample(false)}
        error={currentErrorData}
        onRetry={() => {
          console.log('Retry clicked');
          setShowModalExample(false);
        }}
        onLogin={() => {
          console.log('Login clicked');
          setShowModalExample(false);
        }}
        onContactSupport={() => {
          console.log('Contact support clicked');
          setShowModalExample(false);
        }}
      />

      {/* Manual Toast Test */}
      {currentErrorData && (
        <AuthErrorToast
          isVisible={showToastExample}
          onClose={() => setShowToastExample(false)}
          error={currentErrorData}
          duration={5000}
        />
      )}
    </div>
  );
};

export default AuthErrorExample;