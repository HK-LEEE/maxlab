import React from 'react';
import { Result, Button } from 'antd';
import { ReloadOutlined } from '@ant-design/icons';

/**
 * Error Boundary for Process Flow Editor
 * Catches and displays errors gracefully
 */
class ProcessFlowErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Process Flow Editor error:', error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <Result
          status="error"
          title="Something went wrong"
          subTitle={this.state.error?.message || "An error occurred while loading the process flow editor"}
          extra={[
            <Button 
              type="primary" 
              key="retry"
              icon={<ReloadOutlined />}
              onClick={this.handleReset}
            >
              Try Again
            </Button>,
            <Button key="back" onClick={() => window.history.back()}>
              Go Back
            </Button>
          ]}
        />
      );
    }

    return this.props.children;
  }
}

/**
 * Enhanced Process Flow Editor with Error Boundary and Loading States
 */
const ProcessFlowEditorWithErrorBoundary = (props) => {
  return (
    <ProcessFlowErrorBoundary>
      {/* Dynamic import for better code splitting */}
      <React.Suspense 
        fallback={
          <div style={{ 
            display: 'flex', 
            justifyContent: 'center', 
            alignItems: 'center', 
            height: '400px' 
          }}>
            <Spin size="large" tip="Loading Process Flow Editor..." />
          </div>
        }
      >
        <ProcessFlowEditor {...props} />
      </React.Suspense>
    </ProcessFlowErrorBoundary>
  );
};

// Also export a hook for programmatic data source management
export { useDataSources } from '../hooks/useDataSources';
export { default as DataSourceSelector } from './DataSourceSelector';
export { default as ProcessFlowEditor } from './ProcessFlowEditor';

export default ProcessFlowEditorWithErrorBoundary;