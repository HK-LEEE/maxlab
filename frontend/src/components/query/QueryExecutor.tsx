import React, { useState } from 'react';
import { toast } from 'react-hot-toast';
import type { Query } from '../../types/query';
import { queryApi } from '../../api/queries';

interface QueryExecutorProps {
  query: Query;
  onExecute: (result: any) => void;
}

export const QueryExecutor: React.FC<QueryExecutorProps> = ({ query, onExecute }) => {
  const [params, setParams] = useState<Record<string, any>>({});
  const [isExecuting, setIsExecuting] = useState(false);

  const handleParamChange = (paramName: string, value: string) => {
    setParams((prev) => ({ ...prev, [paramName]: value }));
  };

  const handleExecute = async () => {
    setIsExecuting(true);
    try {
      const result = await queryApi.executeQuery(query.id, { params });
      onExecute(result);
      toast.success('Query executed successfully');
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to execute query');
    } finally {
      setIsExecuting(false);
    }
  };

  const renderParamInput = (paramName: string, paramInfo: any) => {
    const type = paramInfo?.type || 'string';
    const label = paramInfo?.label || paramName;

    return (
      <div key={paramName}>
        <label htmlFor={paramName} className="block text-sm font-medium mb-1">
          {label}
        </label>
        <input
          id={paramName}
          type={type === 'date' ? 'date' : type === 'integer' || type === 'float' ? 'number' : 'text'}
          className="input"
          value={params[paramName] || ''}
          onChange={(e) => handleParamChange(paramName, e.target.value)}
          placeholder={`Enter ${label.toLowerCase()}`}
        />
      </div>
    );
  };

  // Extract parameter names from SQL template
  const paramPattern = /:(\w+)/g;
  const templateParams = [...new Set(query.sql_template.match(paramPattern)?.map(p => p.slice(1)) || [])];

  return (
    <div className="space-y-4">
      {templateParams.length > 0 ? (
        <>
          <div className="space-y-3">
            {templateParams.map((paramName) =>
              renderParamInput(paramName, query.params_info?.[paramName])
            )}
          </div>
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="btn-primary"
          >
            {isExecuting ? 'Executing...' : 'Execute Query'}
          </button>
        </>
      ) : (
        <>
          <p className="text-gray-500">This query has no parameters.</p>
          <button
            onClick={handleExecute}
            disabled={isExecuting}
            className="btn-primary"
          >
            {isExecuting ? 'Executing...' : 'Execute Query'}
          </button>
        </>
      )}
    </div>
  );
};