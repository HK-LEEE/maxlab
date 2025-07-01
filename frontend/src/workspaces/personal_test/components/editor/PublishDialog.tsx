import React, { useState } from 'react';
import { X, Copy, Globe, AlertTriangle } from 'lucide-react';

interface PublishDialogProps {
  isOpen: boolean;
  onClose: () => void;
  flow: {
    id: string;
    name: string;
    is_published?: boolean;
    publish_token?: string;
  } | null;
  onPublish: () => Promise<any>;
  onUnpublish: () => Promise<void>;
  onDelete: (flowId: string) => Promise<void>;
}

export const PublishDialog: React.FC<PublishDialogProps> = ({
  isOpen,
  onClose,
  flow,
  onPublish,
  onUnpublish,
  onDelete,
}) => {
  const [isPublishing, setIsPublishing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [publicUrl, setPublicUrl] = useState('');

  if (!isOpen || !flow) return null;

  const handlePublish = async () => {
    setIsPublishing(true);
    try {
      const result = await onPublish();
      const fullUrl = `${window.location.origin}${result.publish_url}`;
      setPublicUrl(fullUrl);
    } catch (error) {
      console.error('Publish error:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleUnpublish = async () => {
    setIsPublishing(true);
    try {
      await onUnpublish();
      setPublicUrl('');
    } catch (error) {
      console.error('Unpublish error:', error);
    } finally {
      setIsPublishing(false);
    }
  };

  const handleDelete = async () => {
    try {
      await onDelete(flow.id);
      onClose();
    } catch (error) {
      console.error('Delete error:', error);
    }
  };

  const copyToClipboard = () => {
    const url = publicUrl || `${window.location.origin}/public/monitor/${flow.publish_token}`;
    navigator.clipboard.writeText(url);
    // You can add a toast notification here
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Publish Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          <div>
            <h3 className="font-medium text-gray-900">{flow.name}</h3>
            <p className="text-sm text-gray-500 mt-1">
              {flow.is_published 
                ? 'This flow is currently published and accessible to anyone with the link.'
                : 'Publish this flow to make it publicly accessible for monitoring.'}
            </p>
          </div>

          {flow.is_published && flow.publish_token && (
            <div className="bg-gray-50 p-4 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-gray-700">Public URL</span>
                <button
                  onClick={copyToClipboard}
                  className="text-sm text-blue-600 hover:text-blue-700 flex items-center space-x-1"
                >
                  <Copy size={14} />
                  <span>Copy</span>
                </button>
              </div>
              <div className="text-xs text-gray-600 break-all">
                {publicUrl || `${window.location.origin}/public/monitor/${flow.publish_token}`}
              </div>
            </div>
          )}

          <div className="flex flex-col space-y-3">
            {!flow.is_published ? (
              <button
                onClick={handlePublish}
                disabled={isPublishing}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
              >
                <Globe size={16} />
                <span>{isPublishing ? 'Publishing...' : 'Publish Flow'}</span>
              </button>
            ) : (
              <button
                onClick={handleUnpublish}
                disabled={isPublishing}
                className="flex items-center justify-center space-x-2 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50"
              >
                <Globe size={16} />
                <span>{isPublishing ? 'Unpublishing...' : 'Unpublish Flow'}</span>
              </button>
            )}

            <div className="border-t pt-3">
              {!showDeleteConfirm ? (
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="flex items-center justify-center space-x-2 px-4 py-2 bg-red-100 text-red-700 rounded hover:bg-red-200 w-full"
                >
                  <AlertTriangle size={16} />
                  <span>Delete Flow</span>
                </button>
              ) : (
                <div className="space-y-2">
                  <p className="text-sm text-red-600 text-center">
                    Are you sure? This action cannot be undone.
                  </p>
                  <div className="flex space-x-2">
                    <button
                      onClick={() => setShowDeleteConfirm(false)}
                      className="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded hover:bg-gray-200"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleDelete}
                      className="flex-1 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};