import React, { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import {
  File,
  Folder,
  Upload,
  FolderPlus,
  Download,
  Trash2,
  MoreVertical,
  ChevronRight,
  Home,
} from 'lucide-react';
import { fileApi } from '../../api/files';
import { formatFileSize, formatDate } from '../../utils/format';
import type { WorkspaceFile } from '../../types/file';

interface FileBrowserProps {
  workspaceId: string;
}

export const FileBrowser: React.FC<FileBrowserProps> = ({ workspaceId }) => {
  const [currentPath, setCurrentPath] = useState<string[]>([]);
  const [currentParentId, setCurrentParentId] = useState<string | undefined>();
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showCreateFolderModal, setShowCreateFolderModal] = useState(false);
  const queryClient = useQueryClient();

  const { data: fileData, isLoading } = useQuery({
    queryKey: ['files', workspaceId, currentParentId],
    queryFn: () => fileApi.listFiles(workspaceId, currentParentId),
  });

  const { data: storageStats } = useQuery({
    queryKey: ['storage-stats', workspaceId],
    queryFn: () => fileApi.getStorageStats(workspaceId),
  });

  const uploadMutation = useMutation({
    mutationFn: (file: File) => 
      fileApi.uploadFile(workspaceId, file, currentParentId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['storage-stats', workspaceId] });
      toast.success('File uploaded successfully');
      setShowUploadModal(false);
    },
    onError: () => {
      toast.error('Failed to upload file');
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: (name: string) =>
      fileApi.createDirectory(workspaceId, { name, parent_id: currentParentId }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', workspaceId] });
      toast.success('Folder created successfully');
      setShowCreateFolderModal(false);
    },
    onError: () => {
      toast.error('Failed to create folder');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (fileId: string) => fileApi.deleteFile(fileId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files', workspaceId] });
      queryClient.invalidateQueries({ queryKey: ['storage-stats', workspaceId] });
      toast.success('File deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete file');
    },
  });

  const handleFileUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      Array.from(files).forEach(file => {
        uploadMutation.mutate(file);
      });
    }
  }, [uploadMutation]);

  const handleFolderClick = (folder: WorkspaceFile) => {
    setCurrentPath([...currentPath, folder.name]);
    setCurrentParentId(folder.id);
  };

  const handleBreadcrumbClick = (index: number) => {
    if (index === -1) {
      setCurrentPath([]);
      setCurrentParentId(undefined);
    } else {
      const newPath = currentPath.slice(0, index + 1);
      setCurrentPath(newPath);
      // TODO: Get parent ID from breadcrumb
    }
  };

  const handleDownload = async (file: WorkspaceFile) => {
    try {
      await fileApi.downloadFile(file.id);
    } catch (error) {
      toast.error('Failed to download file');
    }
  };

  const getFileIcon = (file: WorkspaceFile) => {
    if (file.is_directory) {
      return <Folder className="h-5 w-5 text-blue-600" />;
    }
    return <File className="h-5 w-5 text-gray-600" />;
  };

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="border-b border-gray-200 p-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Files</h3>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCreateFolderModal(true)}
              className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded"
            >
              <FolderPlus size={16} />
              New Folder
            </button>
            <label className="flex items-center gap-2 px-3 py-1.5 text-sm bg-black text-white hover:bg-gray-800 rounded cursor-pointer">
              <Upload size={16} />
              Upload
              <input
                type="file"
                multiple
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>
        </div>

        {/* Breadcrumb */}
        <div className="flex items-center gap-2 text-sm">
          <button
            onClick={() => handleBreadcrumbClick(-1)}
            className="flex items-center gap-1 text-gray-600 hover:text-black"
          >
            <Home size={14} />
            Home
          </button>
          {currentPath.map((path, index) => (
            <React.Fragment key={index}>
              <ChevronRight size={14} className="text-gray-400" />
              <button
                onClick={() => handleBreadcrumbClick(index)}
                className="text-gray-600 hover:text-black"
              >
                {path}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Storage Stats */}
        {storageStats && (
          <div className="mt-4 text-sm text-gray-600">
            {formatFileSize(storageStats.total_size)} used • 
            {storageStats.file_count} files • 
            {storageStats.directory_count} folders
          </div>
        )}
      </div>

      {/* File List */}
      <div className="p-4">
        {isLoading ? (
          <div className="text-center py-8 text-gray-500">Loading files...</div>
        ) : fileData?.files.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            No files yet. Upload some files to get started.
          </div>
        ) : (
          <table className="w-full">
            <thead className="text-xs text-gray-500 uppercase border-b">
              <tr>
                <th className="text-left pb-2">Name</th>
                <th className="text-left pb-2">Size</th>
                <th className="text-left pb-2">Modified</th>
                <th className="text-right pb-2">Actions</th>
              </tr>
            </thead>
            <tbody>
              {fileData?.files.map((file) => (
                <tr
                  key={file.id}
                  className="border-b hover:bg-gray-50 cursor-pointer"
                  onClick={() => file.is_directory && handleFolderClick(file)}
                >
                  <td className="py-3">
                    <div className="flex items-center gap-3">
                      {getFileIcon(file)}
                      <span className="text-sm">{file.name}</span>
                    </div>
                  </td>
                  <td className="py-3 text-sm text-gray-600">
                    {file.is_directory ? '-' : formatFileSize(file.file_size)}
                  </td>
                  <td className="py-3 text-sm text-gray-600">
                    {formatDate(file.modified_at || file.uploaded_at)}
                  </td>
                  <td className="py-3 text-right">
                    <div className="flex items-center justify-end gap-2">
                      {!file.is_directory && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(file);
                          }}
                          className="p-1 hover:bg-gray-100 rounded"
                        >
                          <Download size={16} className="text-gray-600" />
                        </button>
                      )}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete "${file.name}"?`)) {
                            deleteMutation.mutate(file.id);
                          }
                        }}
                        className="p-1 hover:bg-gray-100 rounded"
                      >
                        <Trash2 size={16} className="text-red-600" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Create Folder Modal */}
      {showCreateFolderModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 w-96">
            <h3 className="text-lg font-semibold mb-4">Create New Folder</h3>
            <input
              type="text"
              placeholder="Folder name"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black mb-4"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && e.currentTarget.value) {
                  createFolderMutation.mutate(e.currentTarget.value);
                }
              }}
            />
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowCreateFolderModal(false)}
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  const input = document.querySelector('input[type="text"]') as HTMLInputElement;
                  if (input?.value) {
                    createFolderMutation.mutate(input.value);
                  }
                }}
                className="px-4 py-2 text-sm bg-black text-white hover:bg-gray-800 rounded"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};