import React, { useState, useRef, useEffect } from 'react';
import { Play, Copy, Check, AlertCircle } from 'lucide-react';

interface QueryEditorProps {
  value: string;
  onChange: (value: string) => void;
  onExecute?: () => void;
  placeholder?: string;
  readOnly?: boolean;
  error?: string;
  height?: string;
}

export const QueryEditor: React.FC<QueryEditorProps> = ({
  value,
  onChange,
  onExecute,
  placeholder = 'Enter SQL query...',
  readOnly = false,
  error,
  height = '200px'
}) => {
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Basic SQL syntax highlighting (for display purposes)
  const sqlKeywords = [
    'SELECT', 'FROM', 'WHERE', 'JOIN', 'LEFT', 'RIGHT', 'INNER', 'OUTER',
    'ON', 'AS', 'ORDER', 'BY', 'GROUP', 'HAVING', 'LIMIT', 'OFFSET',
    'AND', 'OR', 'NOT', 'IN', 'EXISTS', 'BETWEEN', 'LIKE', 'ILIKE',
    'INSERT', 'UPDATE', 'DELETE', 'CREATE', 'ALTER', 'DROP', 'TABLE',
    'INTO', 'VALUES', 'SET', 'CASCADE', 'CASE', 'WHEN', 'THEN', 'ELSE', 'END'
  ];

  const handleKeyDown = (e: React.KeyboardEvent) => {
    // Execute on Ctrl/Cmd + Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && onExecute) {
      e.preventDefault();
      onExecute();
    }
  };

  const handleCopy = () => {
    if (textareaRef.current) {
      textareaRef.current.select();
      document.execCommand('copy');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const formatSQL = (sql: string) => {
    // Basic SQL formatting for readability
    return sql
      .replace(/\s+/g, ' ') // Normalize whitespace
      .replace(/\s*,\s*/g, ', ') // Format commas
      .replace(/\s*\(\s*/g, ' (') // Format parentheses
      .replace(/\s*\)\s*/g, ') ')
      .trim();
  };

  return (
    <div className="space-y-2">
      <div className="relative">
        <div className="absolute right-2 top-2 flex items-center space-x-2 z-10">
          <button
            type="button"
            onClick={handleCopy}
            className="p-1.5 text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded"
            title="Copy query"
          >
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
          {onExecute && !readOnly && (
            <button
              type="button"
              onClick={onExecute}
              className="px-3 py-1.5 bg-black text-white rounded text-sm hover:bg-gray-800 flex items-center space-x-1"
              title="Execute query (Ctrl/Cmd + Enter)"
            >
              <Play size={14} />
              <span>Run</span>
            </button>
          )}
        </div>
        
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          readOnly={readOnly}
          className={`
            w-full px-3 py-2 pr-24 border rounded-lg font-mono text-sm
            ${readOnly ? 'bg-gray-50' : 'bg-white'}
            ${error ? 'border-red-300' : 'border-gray-300'}
            focus:outline-none focus:ring-1 focus:ring-black focus:border-black
          `}
          style={{ 
            height,
            minHeight: '100px',
            resize: 'vertical'
          }}
          spellCheck={false}
        />
        
        {/* Line numbers (optional enhancement) */}
        <div className="absolute left-0 top-0 bottom-0 w-8 bg-gray-50 border-r pointer-events-none">
          <div className="text-xs text-gray-400 p-2 font-mono">
            {value.split('\n').map((_, i) => (
              <div key={i}>{i + 1}</div>
            ))}
          </div>
        </div>
      </div>
      
      {error && (
        <div className="flex items-start space-x-1 text-sm text-red-600">
          <AlertCircle size={16} className="mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}
      
      {onExecute && !readOnly && (
        <div className="text-xs text-gray-500">
          Press <kbd className="px-1 py-0.5 bg-gray-100 border rounded text-xs">Ctrl</kbd> + 
          <kbd className="px-1 py-0.5 bg-gray-100 border rounded text-xs ml-1">Enter</kbd> to execute
        </div>
      )}
    </div>
  );
};