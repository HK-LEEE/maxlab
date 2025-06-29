import React, { useState } from 'react';
import { X, LayoutDashboard, BarChart3, FileText, Code } from 'lucide-react';
import { toast } from 'react-hot-toast';
import { mvpModuleApi } from '../../api/mvpModules';
import type { Workspace } from '../../types/workspace';

interface CreateModuleModalProps {
  workspace: Workspace;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

const moduleTemplates = [
  {
    type: 'dashboard',
    name: 'Dashboard',
    description: 'Dashboard with stats, charts, and activity feed',
    icon: LayoutDashboard,
    color: '#3B82F6',
  },
  {
    type: 'analytics',
    name: 'Analytics',
    description: 'Analytics with metrics, trends, and data visualization',
    icon: BarChart3,
    color: '#10B981',
  },
  {
    type: 'report',
    name: 'Report',
    description: 'Report generation and management system',
    icon: FileText,
    color: '#F59E0B',
  },
  {
    type: 'custom',
    name: 'Custom',
    description: 'Blank template for custom functionality',
    icon: Code,
    color: '#6B7280',
  },
];

export const CreateModuleModal: React.FC<CreateModuleModalProps> = ({
  workspace,
  isOpen,
  onClose,
  onSuccess,
}) => {
  const [formData, setFormData] = useState({
    module_name: '',
    display_name: '',
    description: '',
    module_type: 'custom',
    template: 'default',
  });
  const [selectedTemplate, setSelectedTemplate] = useState('custom');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleTemplateSelect = (templateType: string) => {
    setSelectedTemplate(templateType);
    setFormData({ ...formData, module_type: templateType as any });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.module_name || !formData.display_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    setIsSubmitting(true);
    try {
      const formDataObj = new FormData();
      formDataObj.append('module_name', formData.module_name);
      formDataObj.append('display_name', formData.display_name);
      formDataObj.append('description', formData.description || '');
      formDataObj.append('module_type', formData.module_type);
      formDataObj.append('template', formData.template);

      await mvpModuleApi.createModule(workspace.id, formDataObj);
      toast.success('Module created successfully');
      onSuccess();
    } catch (error: any) {
      toast.error(error.response?.data?.detail || 'Failed to create module');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModuleNameChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_');
    setFormData({ ...formData, module_name: value });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="bg-white rounded-lg w-full max-w-2xl max-h-[90vh] overflow-hidden">
        <div className="flex justify-between items-center p-6 border-b">
          <h2 className="text-xl font-semibold">Create MVP Module</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="p-6 space-y-6 overflow-y-auto max-h-[calc(90vh-180px)]">
            {/* Template Selection */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Choose a Template
              </label>
              <div className="grid grid-cols-2 gap-4">
                {moduleTemplates.map((template) => {
                  const Icon = template.icon;
                  return (
                    <div
                      key={template.type}
                      onClick={() => handleTemplateSelect(template.type)}
                      className={`p-4 border-2 rounded-lg cursor-pointer transition-all ${
                        selectedTemplate === template.type
                          ? 'border-black bg-gray-50'
                          : 'border-gray-200 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="p-2 rounded"
                          style={{ backgroundColor: `${template.color}20`, color: template.color }}
                        >
                          <Icon size={20} />
                        </div>
                        <div className="flex-1">
                          <h4 className="font-medium">{template.name}</h4>
                          <p className="text-sm text-gray-600 mt-1">{template.description}</p>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Module Details */}
            <div className="space-y-4">
              <div>
                <label htmlFor="module_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Module Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="module_name"
                  type="text"
                  value={formData.module_name}
                  onChange={handleModuleNameChange}
                  placeholder="e.g., sales_dashboard"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-black focus:border-black"
                  required
                />
                <p className="mt-1 text-xs text-gray-500">
                  Use lowercase letters, numbers, and underscores only
                </p>
              </div>

              <div>
                <label htmlFor="display_name" className="block text-sm font-medium text-gray-700 mb-1">
                  Display Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="display_name"
                  type="text"
                  value={formData.display_name}
                  onChange={(e) => setFormData({ ...formData, display_name: e.target.value })}
                  placeholder="e.g., Sales Dashboard"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-black focus:border-black"
                  required
                />
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-1">
                  Description
                </label>
                <textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Brief description of the module..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-black focus:border-black"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 p-6 border-t">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 bg-black text-white rounded hover:bg-gray-800 disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create Module'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};