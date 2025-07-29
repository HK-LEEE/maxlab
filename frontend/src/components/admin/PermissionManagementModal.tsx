import React, { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { X, Plus, Trash2, Search, Users, UserPlus, Loader2 } from 'lucide-react';
import { toast } from 'react-hot-toast';
import type { Workspace } from '../../types/workspace';
import { authApi } from '../../api/auth';
import { apiClient } from '../../api/client';
import type { User, Group } from '../../api/auth';

interface PermissionManagementModalProps {
  workspace: Workspace | null;
  isOpen: boolean;
  onClose: () => void;
}

interface WorkspaceGroup {
  id: string;
  group_name: string;
  group_display_name?: string;
  permission_level: 'read' | 'write' | 'admin';
  created_at: string;
  created_by: string;
}

interface WorkspaceUser {
  id: string;
  user_id: string;
  user_display_name?: string;
  permission_level: 'read' | 'write' | 'admin';
  created_at: string;
  created_by: string;
}

export const PermissionManagementModal: React.FC<PermissionManagementModalProps> = ({
  workspace,
  isOpen,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('groups');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState<string>('');
  const [selectedUser, setSelectedUser] = useState<string>('');
  const [selectedPermission, setSelectedPermission] = useState<'read' | 'write' | 'admin'>('read');
  const [userSearchTerm, setUserSearchTerm] = useState('');
  const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
  const [isLoadingUserSearch, setIsLoadingUserSearch] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const queryClient = useQueryClient();

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
          // Failed to search users
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
      const requestData = {
        workspace_id: workspace?.id,
        group_id: data.group_id,
        permission_level: data.permission_level
      };
      // Group creation request
      const response = await apiClient.post(`/api/v1/workspaces/${workspace?.id}/groups/`, requestData);
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

  const assignedGroupNames = workspaceGroups?.map((g: WorkspaceGroup) => g.group_name) || [];
  const unassignedGroups = filteredAvailableGroups.filter((g: Group) => 
    !assignedGroupNames.includes(g.name)
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-4xl max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div>
            <h2 className="text-lg font-semibold">Manage Permissions</h2>
            <p className="text-sm text-gray-600">{workspace.name}</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X size={20} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {/* Tabs */}
          <div className="border-b px-6 pt-4">
            <div className="flex space-x-8">
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

          <div className="p-6">
            {activeTab === 'users' ? (
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
            ) : (
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
                onChange={(e) => setSelectedGroup(e.target.value)}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              >
                <option value="">Select a group</option>
                {unassignedGroups.map((group: Group) => (
                  <option key={group.id} value={group.id}>
                    {group.display_name || group.name}
                  </option>
                ))}
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
                        {group.group_display_name || group.group_name}
                      </div>
                      <div className="text-sm text-gray-600">
                        Group: {group.group_name}
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
        </div>

        <div className="px-6 py-4 border-t flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};