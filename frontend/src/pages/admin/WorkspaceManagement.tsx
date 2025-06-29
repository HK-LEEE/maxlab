import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Layout } from '../../components/common/Layout';
import { workspaceApi } from '../../api/workspaces';
import { PermissionManagementModal } from '../../components/admin/PermissionManagementModal';
import { CreateWorkspaceModal } from '../../components/workspace/CreateWorkspaceModal';
import { EditWorkspaceModal } from '../../components/workspace/EditWorkspaceModal';
import { Trash2, Edit, Users, BarChart, Search, Filter, Plus } from 'lucide-react';
import type { Workspace, WorkspaceCreate } from '../../types/workspace';
import { useAuthStore } from '../../stores/authStore';

export const WorkspaceManagement: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'personal' | 'group'>('all');
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [editingWorkspace, setEditingWorkspace] = useState<Workspace | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);

  const { data: workspaceData, isLoading } = useQuery({
    queryKey: ['workspaces', 'admin'],
    queryFn: () => workspaceApi.getWorkspaces(0, 1000),
  });

  const deleteWorkspaceMutation = useMutation({
    mutationFn: (id: string) => workspaceApi.deleteWorkspace(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace deleted successfully');
    },
    onError: () => {
      toast.error('Failed to delete workspace');
    },
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: (data: WorkspaceCreate) => workspaceApi.createWorkspace(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace created successfully');
      setIsCreateModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create workspace');
    },
  });

  const updateWorkspaceMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => 
      workspaceApi.updateWorkspace(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      toast.success('Workspace updated successfully');
      setEditingWorkspace(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to update workspace');
    },
  });

  const handleDeleteWorkspace = (workspace: Workspace) => {
    if (window.confirm(`Are you sure you want to delete "${workspace.name}"?`)) {
      deleteWorkspaceMutation.mutate(workspace.id);
    }
  };

  const filteredWorkspaces = workspaceData?.workspaces.filter(workspace => {
    const matchesSearch = workspace.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         workspace.description?.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesType = filterType === 'all' || 
                       (filterType === 'personal' && workspace.workspace_type === 'PERSONAL') ||
                       (filterType === 'group' && workspace.workspace_type === 'GROUP');
    return matchesSearch && matchesType;
  }) || [];

  const stats = {
    total: workspaceData?.total || 0,
    personal: workspaceData?.workspaces.filter(w => w.workspace_type === 'PERSONAL').length || 0,
    group: workspaceData?.workspaces.filter(w => w.workspace_type === 'GROUP').length || 0,
    folders: workspaceData?.workspaces.filter(w => w.is_folder).length || 0,
  };

  return (
    <Layout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Workspace Management</h1>
            <p className="mt-1 text-sm text-gray-600">
              Manage all workspaces, permissions, and settings
            </p>
          </div>
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-black text-white hover:bg-gray-800 rounded transition-colors"
          >
            <Plus size={16} />
            New Workspace
          </button>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Workspaces</p>
                <p className="text-2xl font-semibold">{stats.total}</p>
              </div>
              <BarChart className="h-8 w-8 text-gray-400" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Personal</p>
                <p className="text-2xl font-semibold">{stats.personal}</p>
              </div>
              <Users className="h-8 w-8 text-blue-400" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Group</p>
                <p className="text-2xl font-semibold">{stats.group}</p>
              </div>
              <Users className="h-8 w-8 text-green-400" />
            </div>
          </div>
          <div className="bg-white p-4 rounded-lg shadow">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Folders</p>
                <p className="text-2xl font-semibold">{stats.folders}</p>
              </div>
              <Filter className="h-8 w-8 text-purple-400" />
            </div>
          </div>
        </div>

        {/* Filters */}
        <div className="bg-white p-4 rounded-lg shadow mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={20} />
                <input
                  type="text"
                  placeholder="Search workspaces..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                />
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={() => setFilterType('all')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  filterType === 'all'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                All
              </button>
              <button
                onClick={() => setFilterType('personal')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  filterType === 'personal'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Personal
              </button>
              <button
                onClick={() => setFilterType('group')}
                className={`px-4 py-2 rounded-md text-sm font-medium ${
                  filterType === 'group'
                    ? 'bg-black text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Group
              </button>
            </div>
          </div>
        </div>

        {/* Workspace List */}
        <div className="bg-white shadow rounded-lg overflow-hidden">
          {isLoading ? (
            <div className="p-8 text-center text-gray-500">Loading workspaces...</div>
          ) : filteredWorkspaces.length === 0 ? (
            <div className="p-8 text-center text-gray-500">No workspaces found</div>
          ) : (
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Owner
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Created
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="relative px-6 py-3">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredWorkspaces.map((workspace) => (
                  <tr key={workspace.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div>
                        <div className="text-sm font-medium text-gray-900">
                          {workspace.is_folder && '📁 '}{workspace.name}
                        </div>
                        {workspace.description && (
                          <div className="text-sm text-gray-500">{workspace.description}</div>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex text-xs leading-5 font-semibold rounded-full px-2 py-1 ${
                        workspace.workspace_type === 'PERSONAL'
                          ? 'bg-blue-100 text-blue-800'
                          : 'bg-green-100 text-green-800'
                      }`}>
                        {workspace.workspace_type}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {workspace.owner_id}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(workspace.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex text-xs leading-5 font-semibold rounded-full px-2 py-1 ${
                        workspace.is_active
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}>
                        {workspace.is_active ? 'Active' : 'Inactive'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => setSelectedWorkspace(workspace)}
                        className="text-indigo-600 hover:text-indigo-900 mr-4"
                      >
                        <Users size={16} />
                      </button>
                      <button
                        onClick={() => setEditingWorkspace(workspace)}
                        className="text-gray-600 hover:text-gray-900 mr-4"
                      >
                        <Edit size={16} />
                      </button>
                      <button
                        onClick={() => handleDeleteWorkspace(workspace)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Permission Management Modal */}
      <PermissionManagementModal
        workspace={selectedWorkspace}
        isOpen={!!selectedWorkspace}
        onClose={() => setSelectedWorkspace(null)}
      />

      {/* Create Workspace Modal */}
      {user && (
        <CreateWorkspaceModal
          isOpen={isCreateModalOpen}
          onClose={() => setIsCreateModalOpen(false)}
          onSubmit={createWorkspaceMutation.mutate}
          currentUser={{
            user_id: user.user_id || user.id,
            groups: user.groups,
          }}
        />
      )}

      {/* Edit Workspace Modal */}
      <EditWorkspaceModal
        workspace={editingWorkspace}
        isOpen={!!editingWorkspace}
        onClose={() => setEditingWorkspace(null)}
        onSubmit={async (id, data) => {
          await updateWorkspaceMutation.mutateAsync({ id, data });
        }}
      />
    </Layout>
  );
};