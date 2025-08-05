import React, { useState, useEffect, useCallback } from 'react';
import { Card, Button, Input, Form, Space, message, Spin } from 'antd';
import { SaveOutlined, ShareAltOutlined, HistoryOutlined } from '@ant-design/icons';
import DataSourceSelector from './DataSourceSelector';
import { useDataSources } from '../hooks/useDataSources';
// Import other necessary components like flow diagram editor

/**
 * Process Flow Editor Component
 * Now automatically selects defined data sources instead of defaulting to 'default'
 */
const ProcessFlowEditor = ({ 
  workspaceId = 'personaltest',
  flowId = null,
  onSave,
  onPublish
}) => {
  const [form] = Form.useForm();
  const [flowData, setFlowData] = useState({});
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);

  // Use the custom hook for data source management
  const {
    dataSources,
    selectedDataSource,
    setSelectedDataSource,
    loading: dataSourcesLoading,
    error: dataSourcesError,
    getDataSourceDisplayName
  } = useDataSources(workspaceId);

  // Load existing flow if flowId is provided
  useEffect(() => {
    if (flowId) {
      loadFlow();
    }
  }, [flowId]);

  // Load existing flow data
  const loadFlow = async () => {
    try {
      const response = await fetch(
        `/api/v1/personal-test/process-flow/flows/${flowId}`,
        {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to load flow');
      }

      const flow = await response.json();
      
      // Set form values
      form.setFieldsValue({
        name: flow.name,
        data_source_id: flow.data_source_id
      });
      
      // Update selected data source
      setSelectedDataSource(flow.data_source_id);
      
      // Set flow diagram data
      setFlowData(flow.flow_data || {});
    } catch (error) {
      message.error('Failed to load process flow: ' + error.message);
    }
  };

  // Save flow
  const handleSave = async (values) => {
    try {
      setSaving(true);

      const payload = {
        workspace_id: workspaceId,
        name: values.name,
        flow_data: flowData,
        data_source_id: selectedDataSource, // This will be null if no data source is selected
        scope_type: "USER",
        visibility_scope: "PRIVATE"
      };

      const url = flowId 
        ? `/api/v1/personal-test/process-flow/flows/${flowId}`
        : '/api/v1/personal-test/process-flow/flows';
      
      const method = flowId ? 'PUT' : 'POST';

      const response = await fetch(url, {
        method,
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('authToken')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Failed to save flow');
      }

      const savedFlow = await response.json();
      message.success('Process flow saved successfully');
      
      // Call parent callback if provided
      if (onSave) {
        onSave(savedFlow);
      }
    } catch (error) {
      message.error('Failed to save process flow: ' + error.message);
    } finally {
      setSaving(false);
    }
  };

  // Publish flow
  const handlePublish = async () => {
    if (!flowId) {
      message.warning('Please save the flow before publishing');
      return;
    }

    try {
      setPublishing(true);

      const response = await fetch(
        `/api/v1/personal-test/process-flow/flows/${flowId}/publish`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authToken')}`
          }
        }
      );

      if (!response.ok) {
        throw new Error('Failed to publish flow');
      }

      const result = await response.json();
      message.success('Process flow published successfully');
      
      // Show publish URL
      message.info(`Published URL: ${result.publish_url}`);
      
      // Call parent callback if provided
      if (onPublish) {
        onPublish(result);
      }
    } catch (error) {
      message.error('Failed to publish process flow: ' + error.message);
    } finally {
      setPublishing(false);
    }
  };

  // Update flow diagram data
  const handleFlowDataChange = useCallback((newFlowData) => {
    setFlowData(newFlowData);
  }, []);

  return (
    <Card 
      title={flowId ? "Edit Process Flow" : "Create Process Flow"}
      extra={
        <Space>
          <Button
            icon={<HistoryOutlined />}
            disabled={!flowId}
          >
            Versions
          </Button>
          <Button
            type="primary"
            icon={<ShareAltOutlined />}
            onClick={handlePublish}
            loading={publishing}
            disabled={!flowId}
          >
            Publish
          </Button>
        </Space>
      }
    >
      <Form
        form={form}
        layout="vertical"
        onFinish={handleSave}
        initialValues={{
          name: '',
          data_source_id: selectedDataSource
        }}
      >
        <Form.Item
          label="Flow Name"
          name="name"
          rules={[{ required: true, message: 'Please enter a flow name' }]}
        >
          <Input placeholder="Enter process flow name" />
        </Form.Item>

        <Form.Item
          label="Data Source"
          name="data_source_id"
          help={
            selectedDataSource 
              ? `Using: ${getDataSourceDisplayName(selectedDataSource)}`
              : "Using workspace default data source"
          }
        >
          <DataSourceSelector
            value={selectedDataSource}
            onChange={setSelectedDataSource}
            dataSources={dataSources}
            loading={dataSourcesLoading}
            error={dataSourcesError}
            placeholder="Select data source (optional)"
            allowClear
            showTooltip
          />
        </Form.Item>

        {/* Flow diagram editor would go here */}
        <Form.Item label="Flow Diagram">
          <div style={{ 
            border: '1px solid #d9d9d9', 
            borderRadius: 4, 
            padding: 16, 
            minHeight: 400,
            background: '#fafafa'
          }}>
            {/* Your flow diagram component */}
            <p>Flow diagram editor component goes here</p>
            <p>Current data source: {getDataSourceDisplayName(selectedDataSource)}</p>
          </div>
        </Form.Item>

        <Form.Item>
          <Space>
            <Button
              type="primary"
              htmlType="submit"
              icon={<SaveOutlined />}
              loading={saving}
            >
              Save Flow
            </Button>
            <Button onClick={() => window.history.back()}>
              Cancel
            </Button>
          </Space>
        </Form.Item>
      </Form>
    </Card>
  );
};

export default ProcessFlowEditor;