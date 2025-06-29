import React from 'react';
import { X, FileText, Calendar, Clock } from 'lucide-react';

interface ProcessFlow {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface LoadFlowDialogProps {
  isOpen: boolean;
  flows: ProcessFlow[];
  currentFlowId?: string;
  onClose: () => void;
  onLoad: (flow: ProcessFlow) => void;
}

export const LoadFlowDialog: React.FC<LoadFlowDialogProps> = ({
  isOpen,
  flows,
  currentFlowId,
  onClose,
  onLoad,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl w-[600px] max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">Load Process Flow</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>
        
        <div className="flex-1 overflow-y-auto p-4">
          {flows.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No saved flows found</p>
          ) : (
            <div className="space-y-2">
              {flows.map((flow) => (
                <div
                  key={flow.id}
                  className={`p-4 border rounded-lg cursor-pointer hover:bg-gray-50 transition-colors ${
                    flow.id === currentFlowId ? 'border-blue-500 bg-blue-50' : 'border-gray-200'
                  }`}
                  onClick={() => onLoad(flow)}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex items-start space-x-3">
                      <FileText className="text-gray-400 mt-0.5" size={20} />
                      <div>
                        <h3 className="font-medium text-gray-900">{flow.name}</h3>
                        <div className="flex items-center space-x-4 mt-1 text-xs text-gray-500">
                          <span className="flex items-center space-x-1">
                            <Calendar size={12} />
                            <span>{new Date(flow.created_at).toLocaleDateString()}</span>
                          </span>
                          <span className="flex items-center space-x-1">
                            <Clock size={12} />
                            <span>{new Date(flow.updated_at).toLocaleTimeString()}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                    {flow.id === currentFlowId && (
                      <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded">Current</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};