import React, { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Layout } from '../components/common/Layout';
import { Card } from '../components/common/Card';
import { QueryExecutor } from '../components/query/QueryExecutor';
import { queryApi } from '../api/queries';
import { QueryStatus } from '../types/query';
import { Copy } from 'lucide-react';
import { toast } from 'react-hot-toast';

export const QueryDetail: React.FC = () => {
  const { queryId } = useParams<{ queryId: string }>();
  const [executionResult, setExecutionResult] = useState<any>(null);

  const { data: query, isLoading } = useQuery({
    queryKey: ['query', queryId],
    queryFn: () => queryApi.getQuery(Number(queryId)),
    enabled: !!queryId,
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  if (isLoading) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-gray-500">Loading query...</div>
        </div>
      </Layout>
    );
  }

  if (!query) {
    return (
      <Layout>
        <div className="max-w-7xl mx-auto px-4 py-8">
          <div className="text-gray-500">Query not found</div>
        </div>
      </Layout>
    );
  }

  const apiEndpoint = `${import.meta.env.VITE_API_BASE_URL}/v1/execute/${query.id}`;
  const curlExample = `curl -X POST "${apiEndpoint}" \\
  -H "Content-Type: application/json" \\
  -d '{"params": {"param1": "value1"}}'`;

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="space-y-6">
          <Card>
            <h1 className="text-2xl font-bold mb-4">{query.name}</h1>
            {query.description && (
              <p className="text-gray-600 mb-4">{query.description}</p>
            )}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">Status:</span>{' '}
                <span className={query.status === QueryStatus.AVAILABLE ? 'text-green-600' : 'text-gray-600'}>
                  {query.status === QueryStatus.AVAILABLE ? 'Public' : 'Private'}
                </span>
              </div>
              <div>
                <span className="text-gray-500">Created by:</span> {query.created_by}
              </div>
              <div>
                <span className="text-gray-500">Created at:</span>{' '}
                {new Date(query.created_at).toLocaleString()}
              </div>
              {query.last_executed_at && (
                <div>
                  <span className="text-gray-500">Last executed:</span>{' '}
                  {new Date(query.last_executed_at).toLocaleString()}
                </div>
              )}
            </div>
          </Card>

          {query.status === QueryStatus.AVAILABLE && (
            <Card>
              <h2 className="text-lg font-semibold mb-4">Public API Information</h2>
              <div className="space-y-4">
                <div>
                  <p className="text-sm text-gray-600 mb-2">API Endpoint:</p>
                  <div className="flex items-center space-x-2">
                    <code className="flex-1 p-2 bg-gray-100 rounded text-sm">{apiEndpoint}</code>
                    <button
                      onClick={() => copyToClipboard(apiEndpoint)}
                      className="p-2 hover:bg-gray-100 rounded"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
                <div>
                  <p className="text-sm text-gray-600 mb-2">cURL Example:</p>
                  <div className="flex items-start space-x-2">
                    <pre className="flex-1 p-3 bg-gray-100 rounded text-sm overflow-x-auto">
                      {curlExample}
                    </pre>
                    <button
                      onClick={() => copyToClipboard(curlExample)}
                      className="p-2 hover:bg-gray-100 rounded"
                    >
                      <Copy size={16} />
                    </button>
                  </div>
                </div>
              </div>
            </Card>
          )}

          <Card>
            <h2 className="text-lg font-semibold mb-4">Test Query Execution</h2>
            <QueryExecutor
              query={query}
              onExecute={setExecutionResult}
            />
          </Card>

          {executionResult && (
            <Card>
              <h2 className="text-lg font-semibold mb-4">Execution Result</h2>
              <div className="space-y-2 text-sm">
                <p>
                  <span className="text-gray-500">Rows returned:</span> {executionResult.row_count}
                </p>
                <p>
                  <span className="text-gray-500">Execution time:</span> {executionResult.execution_time_ms}ms
                </p>
              </div>
              <div className="mt-4 overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      {executionResult.data.length > 0 &&
                        Object.keys(executionResult.data[0]).map((column) => (
                          <th
                            key={column}
                            className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider"
                          >
                            {column}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {executionResult.data.map((row: any, index: number) => (
                      <tr key={index}>
                        {Object.values(row).map((value: any, cellIndex: number) => (
                          <td key={cellIndex} className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                            {String(value)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};