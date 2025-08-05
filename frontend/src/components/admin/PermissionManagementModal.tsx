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
  id: string; // Workspace-Group relationship ID
  group_name: string; // Group UUID (stored as string for legacy compatibility)
  group_display_name?: string; // Human-readable group name
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
  const [quickAddPermission, setQuickAddPermission] = useState<'read' | 'write' | 'admin'>('read');
  const [quickAddUserPermission, setQuickAddUserPermission] = useState<'read' | 'write' | 'admin'>('read');
  const [userSearchTerm, setUserSearchTerm] = useState('');
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

  // Fetch all groups once when modal opens - no search parameter
  const { data: adminGroupsData, isLoading: isLoadingAdminGroups } = useQuery({
    queryKey: ['admin-groups'],
    queryFn: async () => {
      return await authApi.getAdminGroups(0, 100); // Get all groups without search
    },
    enabled: isOpen, // Fetch once when modal opens
  });

  // Fetch all users once when modal opens - no search parameter
  const { data: adminUsersData, isLoading: isLoadingAdminUsers } = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      return await authApi.getAdminUsers(0, 100); // Get all users without search
    },
    enabled: isOpen, // Fetch once when modal opens
  });


  // Add user mutation
  const addUserMutation = useMutation({
    mutationFn: async (data: { user_id: string; permission_level: string }) => {
      console.log('Adding user:', data);
      try {
        const response = await apiClient.post(`/api/v1/workspaces/${workspace?.id}/users/`, data);
        console.log('User add response:', response);
        return response.data;
      } catch (error) {
        console.error('User add error in mutationFn:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('User add success:', data);
      queryClient.invalidateQueries({ queryKey: ['workspace-users', workspace?.id] });
      toast.success('User added successfully');
      setUserSearchTerm('');
    },
    onError: (error: any) => {
      console.error('User add error in onError:', error);
      if (error.response?.data?.detail) {
        toast.error(`Failed to add user: ${error.response.data.detail}`);
      } else {
        toast.error('Failed to add user');
      }
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
      console.log('Adding group:', requestData);
      try {
        const response = await apiClient.post(`/api/v1/workspaces/${workspace?.id}/groups/`, requestData);
        console.log('Group add response:', response);
        return response.data;
      } catch (error) {
        console.error('Group add error in mutationFn:', error);
        throw error;
      }
    },
    onSuccess: (data) => {
      console.log('Group add success:', data);
      queryClient.invalidateQueries({ queryKey: ['workspace-groups', workspace?.id] });
      toast.success('Group added successfully');
      setSelectedGroup('');
    },
    onError: (error: any) => {
      console.error('Group add error in onError:', error);
      if (error.response?.data?.detail) {
        toast.error(`Failed to add group: ${error.response.data.detail}`);
      } else {
        toast.error('Failed to add group');
      }
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

  // Update group permission mutation
  const updateGroupPermissionMutation = useMutation({
    mutationFn: async ({ groupId, permissionLevel }: { groupId: string; permissionLevel: string }) => {
      const response = await apiClient.patch(`/api/v1/workspaces/${workspace?.id}/groups/${groupId}`, {
        permission_level: permissionLevel,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspace-groups', workspace?.id] });
      toast.success('Permission updated successfully');
    },
    onError: () => {
      toast.error('Failed to update permission');
    },
  });

  if (!isOpen || !workspace) return null;

  const allGroups = adminGroupsData || [];
  
  // Filter groups based on search term (client-side filtering)
  const availableGroups = searchTerm
    ? allGroups.filter((group: Group) => 
        (group.name && group.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (group.display_name && group.display_name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (group.id && group.id.toLowerCase().includes(searchTerm.toLowerCase()))
      )
    : allGroups;
    
  const assignedGroupIds = workspaceGroups?.map((g: WorkspaceGroup) => g.id) || [];
  
  // Helper function to handle group assignment
  const handleAssignGroup = (group: Group, permissionLevel: 'read' | 'write' | 'admin' = 'read') => {
    addGroupMutation.mutate({
      group_id: group.id,
      permission_level: permissionLevel,
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-6xl max-h-[80vh] flex flex-col">
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
              <div className="flex gap-4 h-[500px]">
                {/* Left Sidebar - Available Users */}
                <div className="w-1/2 flex flex-col border-r pr-4">
                  <div className="mb-4">
                    <h3 className="text-md font-medium mb-3">Available Users</h3>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search by name, email or ID..."
                        value={userSearchTerm}
                        onChange={(e) => setUserSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      />
                    </div>
                    
                    {/* Quick Permission Selector */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-600">Default permission:</span>
                      <div className="flex gap-1">
                        {(['read', 'write', 'admin'] as const).map((level) => (
                          <button
                            key={level}
                            onClick={() => setQuickAddUserPermission(level)}
                            className={`px-2 py-1 rounded capitalize ${
                              quickAddUserPermission === level
                                ? 'bg-black text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Users List */}
                  <div className="flex-1 overflow-y-auto">
                    {isLoadingAdminUsers ? (
                      <div className="text-center py-4 text-gray-500">
                        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                        Loading users...
                      </div>
                    ) : (() => {
                      const allUsers = adminUsersData || [];
                      
                      // Filter users based on search term (client-side filtering)
                      const availableUsers = userSearchTerm
                        ? allUsers.filter((user: User) => 
                            (user.email && user.email.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
                            (user.full_name && user.full_name.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
                            (user.username && user.username.toLowerCase().includes(userSearchTerm.toLowerCase())) ||
                            (user.id && user.id.toLowerCase().includes(userSearchTerm.toLowerCase()))
                          )
                        : allUsers;
                      
                      const assignedUserIds = workspaceUsers?.map((u: WorkspaceUser) => u.user_id) || [];
                      
                      // Helper function to handle user assignment
                      const handleAssignUser = (user: User, permissionLevel: 'read' | 'write' | 'admin' = 'read') => {
                        addUserMutation.mutate({
                          user_id: user.email || user.id,
                          permission_level: permissionLevel,
                        });
                      };
                      
                      return availableUsers.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">
                          {userSearchTerm ? 'No users found matching your search' : 'No users available'}
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {availableUsers.map((user: User) => {
                            const isAssigned = assignedUserIds.includes(user.email || user.id);
                            
                            return (
                              <div
                                key={user.id}
                                className={`p-3 rounded-md border transition-all cursor-pointer ${
                                  isAssigned 
                                    ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed' 
                                    : 'bg-white border-gray-200 hover:border-gray-400 hover:shadow-sm'
                                }`}
                                onClick={() => !isAssigned}
                              >
                                <div className="flex items-center justify-between">
                                  <div className="flex-1">
                                    <div className="font-medium text-sm">
                                      {user.real_name || user.full_name || user.username || user.email} {user.groups && user.groups.length > 0 ? `(${user.groups.join(', ')})` : ''}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      {user.email}
                                    </div>
                                    <div className="text-xs text-gray-500 mt-1">
                                      <span className="text-gray-400">UUID:</span> <span className="font-mono">{user.id}</span>
                                    </div>
                                  </div>
                                  {!isAssigned && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleAssignUser(user, quickAddUserPermission);
                                      }}
                                      disabled={addUserMutation.isPending}
                                      className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                    >
                                      {addUserMutation.isPending ? '...' : 'Add →'}
                                    </button>
                                  )}
                                  {isAssigned && (
                                    <span className="text-xs text-gray-500">Already assigned</span>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                {/* Right Panel - Assigned Users */}
                <div className="w-1/2 flex flex-col pl-4">
                  <div className="mb-4">
                    <h3 className="text-md font-medium mb-3">Assigned Users</h3>
                    <p className="text-sm text-gray-600">Users with access to this workspace</p>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {isLoadingUsers ? (
                      <div className="text-center py-4 text-gray-500">
                        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                        Loading permissions...
                      </div>
                    ) : workspaceUsers?.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        <UserPlus size={40} className="mx-auto mb-2 text-gray-300" />
                        <p>No users assigned yet</p>
                        <p className="text-xs mt-1">Add users from the left panel</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {workspaceUsers?.map((user: WorkspaceUser) => (
                          <div
                            key={user.id}
                            className="p-3 bg-gray-50 rounded-md border border-gray-200"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {user.user_display_name || 'User'}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  <span className="text-gray-400">ID:</span> <span className="font-mono">{user.user_id}</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  Added on {new Date(user.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={user.permission_level}
                                  onChange={(e) => {
                                    // TODO: Add update user permission mutation
                                    console.log('Permission update not implemented yet');
                                  }}
                                  disabled={true} // TODO: Enable when update mutation is implemented
                                  className={`px-2 py-1 text-xs rounded border ${
                                    user.permission_level === 'admin'
                                      ? 'bg-purple-100 text-purple-800 border-purple-200'
                                      : user.permission_level === 'write'
                                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                                      : 'bg-gray-100 text-gray-800 border-gray-200'
                                  } disabled:opacity-50`}
                                >
                                  <option value="read">Read</option>
                                  <option value="write">Write</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button
                                  onClick={() => removeUserMutation.mutate(user.id)}
                                  disabled={removeUserMutation.isPending}
                                  className="text-red-600 hover:text-red-800 disabled:opacity-50 p-1"
                                  title="Remove user"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex gap-4 h-[500px]">
                {/* Left Sidebar - Available Groups */}
                <div className="w-1/2 flex flex-col border-r pr-4">
                  <div className="mb-4">
                    <h3 className="text-md font-medium mb-3">Available Groups</h3>
                    <div className="relative mb-3">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={16} />
                      <input
                        type="text"
                        placeholder="Search by name or UUID..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                      />
                    </div>
                    
                    {/* Quick Permission Selector */}
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-gray-600">Default permission:</span>
                      <div className="flex gap-1">
                        {(['read', 'write', 'admin'] as const).map((level) => (
                          <button
                            key={level}
                            onClick={() => setQuickAddPermission(level)}
                            className={`px-2 py-1 rounded capitalize ${
                              quickAddPermission === level
                                ? 'bg-black text-white'
                                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                            }`}
                          >
                            {level}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Groups List */}
                  <div className="flex-1 overflow-y-auto">
                    {isLoadingAdminGroups ? (
                      <div className="text-center py-4 text-gray-500">
                        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                        Loading groups...
                      </div>
                    ) : availableGroups.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        {searchTerm ? 'No groups found matching your search' : 'No groups available'}
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {availableGroups.map((group: Group) => {
                          const isAssigned = workspaceGroups?.some((wg: WorkspaceGroup) => 
                            wg.group_name === group.id // group_name stores the UUID
                          );
                          
                          return (
                            <div
                              key={group.id}
                              className={`p-3 rounded-md border transition-all cursor-pointer ${
                                isAssigned 
                                  ? 'bg-gray-100 border-gray-300 opacity-50 cursor-not-allowed' 
                                  : 'bg-white border-gray-200 hover:border-gray-400 hover:shadow-sm'
                              }`}
                              onClick={() => !isAssigned && setSelectedGroup(group.id)}
                            >
                              <div className="flex items-center justify-between">
                                <div className="flex-1">
                                  <div className="font-medium text-sm">
                                    {group.display_name || group.name}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-1">
                                    <span className="text-gray-400">UUID:</span> <span className="font-mono">{group.id}</span>
                                  </div>
                                  {group.description && (
                                    <div className="text-xs text-gray-500 mt-1">
                                      {group.description}
                                    </div>
                                  )}
                                  {(group.members_count !== undefined || group.users_count !== undefined) && (
                                    <div className="text-xs text-gray-400 mt-1">
                                      {group.members_count || group.users_count} members
                                    </div>
                                  )}
                                </div>
                                {!isAssigned && (
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      handleAssignGroup(group, quickAddPermission);
                                    }}
                                    disabled={addGroupMutation.isPending}
                                    className="px-3 py-1 text-xs bg-black text-white rounded hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                  >
                                    {addGroupMutation.isPending ? '...' : 'Add →'}
                                  </button>
                                )}
                                {isAssigned && (
                                  <span className="text-xs text-gray-500">Already assigned</span>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel - Assigned Groups */}
                <div className="w-1/2 flex flex-col pl-4">
                  <div className="mb-4">
                    <h3 className="text-md font-medium mb-3">Assigned Groups</h3>
                    <p className="text-sm text-gray-600">Groups with access to this workspace</p>
                  </div>

                  <div className="flex-1 overflow-y-auto">
                    {isLoadingGroups ? (
                      <div className="text-center py-4 text-gray-500">
                        <Loader2 size={20} className="animate-spin mx-auto mb-2" />
                        Loading permissions...
                      </div>
                    ) : workspaceGroups?.length === 0 ? (
                      <div className="text-center py-4 text-gray-500">
                        <Users size={40} className="mx-auto mb-2 text-gray-300" />
                        <p>No groups assigned yet</p>
                        <p className="text-xs mt-1">Add groups from the left panel</p>
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {workspaceGroups?.map((group: WorkspaceGroup) => (
                          <div
                            key={group.id}
                            className="p-3 bg-gray-50 rounded-md border border-gray-200"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex-1">
                                <div className="font-medium text-sm">
                                  {group.group_display_name || 'Group'}
                                </div>
                                <div className="text-xs text-gray-500 mt-1">
                                  <span className="text-gray-400">UUID:</span> <span className="font-mono">{group.group_name}</span>
                                </div>
                                <div className="text-xs text-gray-400 mt-1">
                                  Added on {new Date(group.created_at).toLocaleDateString()}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <select
                                  value={group.permission_level}
                                  onChange={(e) => {
                                    updateGroupPermissionMutation.mutate({
                                      groupId: group.id,
                                      permissionLevel: e.target.value,
                                    });
                                  }}
                                  disabled={updateGroupPermissionMutation.isPending}
                                  className={`px-2 py-1 text-xs rounded border ${
                                    group.permission_level === 'admin'
                                      ? 'bg-purple-100 text-purple-800 border-purple-200'
                                      : group.permission_level === 'write'
                                      ? 'bg-blue-100 text-blue-800 border-blue-200'
                                      : 'bg-gray-100 text-gray-800 border-gray-200'
                                  } disabled:opacity-50`}
                                >
                                  <option value="read">Read</option>
                                  <option value="write">Write</option>
                                  <option value="admin">Admin</option>
                                </select>
                                <button
                                  onClick={() => removeGroupMutation.mutate(group.id)}
                                  disabled={removeGroupMutation.isPending}
                                  className="text-red-600 hover:text-red-800 disabled:opacity-50 p-1"
                                  title="Remove group"
                                >
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
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