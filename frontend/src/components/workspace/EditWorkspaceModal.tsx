import React, { useState, useEffect } from 'react';
import { X, Save, Users, UserPlus, Plus, Trash2, Search, Loader2 } from 'lucide-react';
import type { Workspace, WorkspaceUpdate } from '../../types/workspace';
import { toast } from 'react-hot-toast';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { authApi } from '../../api/auth';
import { apiClient } from '../../api/client';
import type { User, Group } from '../../api/auth';

interface EditWorkspaceModalProps {
  workspace: Workspace | null;
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (id: string, data: WorkspaceUpdate) => Promise<void>;
}

// Import from unified types
import type { WorkspaceGroup, WorkspaceUser } from '../../types/workspace';

export const EditWorkspaceModal: React.FC<EditWorkspaceModalProps> = ({
  workspace,
  isOpen,
  onClose,
  onSubmit,
}) => {
  const [formData, setFormData] = useState<WorkspaceUpdate>({
    name: '',
    description: '',
    is_active: true,
  });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'general' | 'users' | 'groups'>('general');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedPermission, setSelectedPermission] = useState<'read' | 'write' | 'admin'>('read');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
  const [isLoadingUserSearch, setIsLoadingUserSearch] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const queryClient = useQueryClient();

  // Update form when workspace changes
  useEffect(() => {
    if (workspace) {
      setFormData({
        name: workspace.name,
        description: workspace.description || '',
        is_active: workspace.is_active,
      });
      setActiveTab('general');
    }
  }, [workspace]);

  // Fetch workspace groups
  const { data: workspaceGroups, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['workspace-groups', workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const response = await apiClient.get(`/api/v1/workspaces/${workspace.id}/groups/`);
      return response.data;
    },
    enabled: !!workspace && isOpen,
  });

  // Fetch workspace users
  const { data: workspaceUsers, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['workspace-users', workspace?.id],
    queryFn: async () => {
      if (!workspace) return [];
      const response = await apiClient.get(`/api/v1/workspaces/${workspace.id}/users/`);
      return response.data;
    },
    enabled: !!workspace && isOpen,
  });

  // Fetch available groups
  const { data: availableGroups } = useQuery({
    queryKey: ['available-groups'],
    queryFn: async () => {
      const response = await apiClient.get('/api/v1/external/groups');
      console.log('Available groups from API:', response.data);
      if (response.data && response.data.length > 0) {
        console.log('First group structure:', response.data[0]);
        console.log('First group ID:', response.data[0].id);
        console.log('First group name:', response.data[0].name);
      }
      return response.data;
    },
    enabled: isOpen,
  });

  // Search users with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (userSearchTerm.length >= 2) {
        setIsLoadingUserSearch(true);
        try {
          const results = await authApi.searchUsers(userSearchTerm);
          setUserSuggestions(results);
          setShowUserDropdown(true);
        } catch (error) {
          console.error('Failed to search users:', error);
        } finally {
          setIsLoadingUserSearch(false);
        }
      } else {
        setUserSuggestions([]);
        setShowUserDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearchTerm]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.user-search-container')) {
        setShowUserDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Add user mutation
  const addUserMutation = useMutation({
    mutationFn: async (data: { user_id: string; permission_level: string }) => {
      const response = await apiClient.post(`/api/v1/workspaces/${workspace?.id}/users/`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-users', workspace?.id] });
      toast.success('User added successfully');
      setSelectedUser('');
      setUserSearchTerm('');
      setSelectedPermission('read');
    },
    onError: () => {
      toast.error('Failed to add user');
    },
  });

  // Remove user mutation
  const removeUserMutation = useMutation({
    mutationFn: async (userId: string) => {
      await apiClient.delete(`/api/v1/workspaces/${workspace?.id}/users/${userId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-users', workspace?.id] });
      toast.success('User removed successfully');
    },
    onError: () => {
      toast.error('Failed to remove user');
    },
  });

  // Add group mutation
  const addGroupMutation = useMutation({
    mutationFn: async (data: { group_id: string; permission_level: string }) => {
      const response = await apiClient.post(`/api/v1/workspaces/${workspace?.id}/groups/`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-groups', workspace?.id] });
      toast.success('Group added successfully');
      setSelectedGroup('');
      setSelectedPermission('read');
    },
    onError: () => {
      toast.error('Failed to add group');
    },
  });

  // Remove group mutation
  const removeGroupMutation = useMutation({
    mutationFn: async (groupId: string) => {
      await apiClient.delete(`/api/v1/workspaces/${workspace?.id}/groups/${groupId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-groups', workspace?.id] });
      toast.success('Group removed successfully');
    },
    onError: () => {
      toast.error('Failed to remove group');
    },
  });

  if (!isOpen || !workspace) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      await onSubmit(workspace.id, formData);
      toast.success('Workspace updated successfully');
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!isSubmitting) {
      onClose();
      // Reset form
      setFormData({
        name: '',
        description: '',
        is_active: true,
      });
      setError(null);
      setActiveTab('general');
      setUserSearchTerm('');
      setSearchTerm('');
      setSelectedUser('');
      setSelectedGroup('');
    }
  };

  const handleAddUser = () => {
    if (!selectedUser) {
      toast.error('Please select a user');
      return;
    }
    addUserMutation.mutate({
      user_id: selectedUser,
      permission_level: selectedPermission,
    });
  };

  const handleAddGroup = () => {
    if (!selectedGroup) {
      toast.error('Please select a group');
      return;
    }
    console.log('Adding group with ID:', selectedGroup);
    console.log('Selected group value type:', typeof selectedGroup);
    console.log('Selected group value length:', selectedGroup.length);
    
    addGroupMutation.mutate({
      group_id: selectedGroup,
      permission_level: selectedPermission,
    });
  };

  const handleSelectUser = (user: User) => {
    setSelectedUser(user.email || user.id);
    setUserSearchTerm(user.full_name || user.username || user.email);
    setShowUserDropdown(false);
  };

  const filteredAvailableGroups = availableGroups?.filter((group: Group) => 
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (group.display_name && group.display_name.toLowerCase().includes(searchTerm.toLowerCase()))
  ) || [];

  const assignedGroupIds = workspaceGroups?.map((g: WorkspaceGroup) => g.group_id) || [];
  console.log('Assigned group IDs:', assignedGroupIds);
  
  const unassignedGroups = filteredAvailableGroups.filter((g: Group) => 
    !assignedGroupIds.includes(g.id)
  );
  console.log('Unassigned groups:', unassignedGroups);
  console.log('Unassigned groups count:', unassignedGroups.length);
  if (unassignedGroups.length > 0) {
    console.log('First unassigned group:', unassignedGroups[0]);
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-3xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Edit Workspace</h2>
          <button
            onClick={handleClose}
            disabled={isSubmitting}
            className="text-gray-400 hover:text-gray-600 disabled:opacity-50"
          >
            <X size={20} />
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b px-6 pt-4">
          <div className="flex space-x-8">
            <button
              onClick={() => setActiveTab('general')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'general'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              General Settings
            </button>
            <button
              onClick={() => setActiveTab('users')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'users'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <UserPlus size={16} />
                User Permissions
              </div>
            </button>
            <button
              onClick={() => setActiveTab('groups')}
              className={`pb-3 px-1 border-b-2 font-medium text-sm transition-colors ${
                activeTab === 'groups'
                  ? 'border-black text-black'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <div className="flex items-center gap-2">
                <Users size={16} />
                Group Permissions
              </div>
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-6">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded text-sm mb-4">
              {error}
            </div>
          )}

          {activeTab === 'general' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Workspace Name
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  placeholder="Enter workspace name"
                  required
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-2">
                  Description
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  rows={3}
                  placeholder="Enter description"
                  disabled={isSubmitting}
                />
              </div>

              <div>
                <label className="flex items-center space-x-3">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-4 w-4 text-black border-gray-300 rounded focus:ring-black"
                    disabled={isSubmitting}
                  />
                  <span className="text-sm font-medium">Active</span>
                </label>
                <p className="text-xs text-gray-500 mt-1">
                  Inactive workspaces are hidden from users
                </p>
              </div>

              <div className="text-xs text-gray-500 pt-4">
                <div>Type: {workspace.workspace_type}</div>
                <div>Owner: {workspace.owner_id}</div>
              </div>
            </form>
          )}

          {activeTab === 'users' && (
            <>
              {/* Add User Section */}
              <div className="mb-6">
                <h3 className="text-md font-medium mb-3">Add User Permission</h3>
                <div className="flex gap-3">
                  <div className="flex-1 relative user-search-container">
                    <input
                      type="text"
                      placeholder="Search users by name or email..."
                      value={userSearchTerm}
                      onChange={(e) => setUserSearchTerm(e.target.value)}
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                    />
                    {isLoadingUserSearch && (
                      <div className="absolute right-3 top-2.5">
                        <Loader2 size={16} className="animate-spin text-gray-400" />
                      </div>
                    )}
                    
                    {/* User Dropdown */}
                    {showUserDropdown && userSuggestions.length > 0 && (
                      <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto mt-1">
                        {userSuggestions.map((user) => (
                          <button
                            key={user.id}
                            type="button"
                            onClick={() => handleSelectUser(user)}
                            className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                          >
                            <div>
                              <div className="text-sm font-medium">{user.full_name || user.username || user.email}</div>
                              <div className="text-xs text-gray-500">{user.email}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <select
                    value={selectedPermission}
                    onChange={(e) => setSelectedPermission(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleAddUser}
                    disabled={!selectedUser || addUserMutation.isPending}
                    className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </div>
              </div>

              {/* Current User Permissions */}
              <div>
                <h3 className="text-md font-medium mb-3">Current User Permissions</h3>
                {isLoadingUsers ? (
                  <div className="text-center py-4 text-gray-500">Loading user permissions...</div>
                ) : workspaceUsers?.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">No users assigned yet</div>
                ) : (
                  <div className="space-y-2">
                    {workspaceUsers?.map((user: WorkspaceUser) => (
                      <div
                        key={user.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                      >
                        <div className="flex-1">
                          <div className="font-medium">
                            {user.user_display_name || user.user_id}
                          </div>
                          <div className="text-sm text-gray-600">
                            User ID: {user.user_id}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 text-sm rounded-full ${
                            user.permission_level === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : user.permission_level === 'write'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {user.permission_level}
                          </span>
                          <button
                            onClick={() => removeUserMutation.mutate(user.id)}
                            disabled={removeUserMutation.isPending}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {activeTab === 'groups' && (
            <>
              {/* Add Group Section */}
              <div className="mb-6">
                <h3 className="text-md font-medium mb-3">Add Group Permission</h3>
                <div className="flex gap-3">
                  <div className="flex-1 relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                    <input
                      type="text"
                      placeholder="Search groups..."
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                    />
                  </div>
                  <select
                    value={selectedGroup}
                    onChange={(e) => {
                      console.log('Selected option value:', e.target.value);
                      console.log('Selected option text:', e.target.options[e.target.selectedIndex].text);
                      setSelectedGroup(e.target.value);
                    }}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  >
                    <option value="">Select a group</option>
                    {unassignedGroups.map((group: Group) => {
                      console.log(`Rendering option for group: ${group.name}, ID: ${group.id}`);
                      return (
                        <option key={group.id} value={group.id}>
                          {group.display_name || group.name}
                        </option>
                      );
                    })}
                  </select>
                  <select
                    value={selectedPermission}
                    onChange={(e) => setSelectedPermission(e.target.value as any)}
                    className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  >
                    <option value="read">Read</option>
                    <option value="write">Write</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    onClick={handleAddGroup}
                    disabled={!selectedGroup || addGroupMutation.isPending}
                    className="px-4 py-2 bg-black text-white rounded-md hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    <Plus size={16} />
                    Add
                  </button>
                </div>
              </div>

              {/* Current Permissions */}
              <div>
                <h3 className="text-md font-medium mb-3">Current Permissions</h3>
                {isLoadingGroups ? (
                  <div className="text-center py-4 text-gray-500">Loading permissions...</div>
                ) : workspaceGroups?.length === 0 ? (
                  <div className="text-center py-4 text-gray-500">No groups assigned yet</div>
                ) : (
                  <div className="space-y-2">
                    {workspaceGroups?.map((group: WorkspaceGroup) => (
                      <div
                        key={group.id}
                        className="flex items-center justify-between p-3 bg-gray-50 rounded-md"
                      >
                        <div className="flex-1">
                          <div className="font-medium">
                            {group.group_display_name || group.group_id}
                          </div>
                          <div className="text-sm text-gray-600">
                            Group ID: {group.group_id}
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          <span className={`px-3 py-1 text-sm rounded-full ${
                            group.permission_level === 'admin'
                              ? 'bg-purple-100 text-purple-800'
                              : group.permission_level === 'write'
                              ? 'bg-blue-100 text-blue-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {group.permission_level}
                          </span>
                          <button
                            onClick={() => removeGroupMutation.mutate(group.id)}
                            disabled={removeGroupMutation.isPending}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t flex justify-end space-x-3">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
            disabled={isSubmitting}
          >
            Cancel
          </button>
          {activeTab === 'general' && (
            <button
              onClick={handleSubmit}
              className="px-4 py-2 text-sm bg-black text-white hover:bg-gray-800 rounded disabled:opacity-50 flex items-center gap-2"
              disabled={isSubmitting}
            >
              <Save size={16} />
              {isSubmitting ? 'Saving...' : 'Save Changes'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};