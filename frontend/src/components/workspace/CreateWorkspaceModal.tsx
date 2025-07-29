import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, UserPlus, Users, Loader2, Check } from 'lucide-react';
import { WorkspaceType, OwnerType } from '../../types/workspace';
import type { WorkspaceCreate } from '../../types/workspace';
import { authApi } from '../../api/auth';
import type { User, Group } from '../../api/auth';
import { toast } from 'react-hot-toast';

interface CreateWorkspaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: WorkspaceCreate) => void;
  currentUser: { user_id?: string; groups?: string[] };
}

export const CreateWorkspaceModal: React.FC<CreateWorkspaceModalProps> = ({
  isOpen,
  onClose,
  onSubmit,
  currentUser,
}) => {
  const [formData, setFormData] = useState<WorkspaceCreate>({
    name: '',
    workspace_type: WorkspaceType.PERSONAL,
    owner_type: OwnerType.USER,
    owner_id: currentUser.user_id || '',
    description: '',
  });
  const [permissionMode, setPermissionMode] = useState<'user' | 'group'>('user');
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedGroups, setSelectedGroups] = useState<string[]>([]);
  const [userSearch, setUserSearch] = useState('');
  const [groupSearch, setGroupSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Autocomplete states
  const [userSuggestions, setUserSuggestions] = useState<User[]>([]);
  const [groupSuggestions, setGroupSuggestions] = useState<Group[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isLoadingGroups, setIsLoadingGroups] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showGroupDropdown, setShowGroupDropdown] = useState(false);

  // Search users with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (userSearch.length >= 2) {
        setIsLoadingUsers(true);
        try {
          const results = await authApi.searchUsers(userSearch);
          setUserSuggestions(results);
          setShowUserDropdown(true);
        } catch (error) {
          // Failed to search users
        } finally {
          setIsLoadingUsers(false);
        }
      } else {
        setUserSuggestions([]);
        setShowUserDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [userSearch]);

  // Search groups with debounce
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (groupSearch.length >= 2) {
        setIsLoadingGroups(true);
        try {
          const results = await authApi.searchGroups(groupSearch);
          setGroupSuggestions(results);
          setShowGroupDropdown(true);
        } catch (error) {
          // Failed to search groups
        } finally {
          setIsLoadingGroups(false);
        }
      } else {
        setGroupSuggestions([]);
        setShowGroupDropdown(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [groupSearch]);

  const handleSelectUser = (user: User) => {
    const userId = user.email || user.id;
    if (!selectedUsers.includes(userId)) {
      setSelectedUsers([...selectedUsers, userId]);
    }
    setUserSearch('');
    setShowUserDropdown(false);
  };

  const handleSelectGroup = (group: Group) => {
    if (!selectedGroups.includes(group.name)) {
      setSelectedGroups([...selectedGroups, group.name]);
    }
    setGroupSearch('');
    setShowGroupDropdown(false);
  };

  // Close dropdowns when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.user-search-container')) {
        setShowUserDropdown(false);
      }
      if (!target.closest('.group-search-container')) {
        setShowGroupDropdown(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      // Include selected users/groups in the submission
      const submissionData = {
        ...formData,
        permission_mode: permissionMode,
        selected_users: selectedUsers,
        selected_groups: selectedGroups,
      };
      await onSubmit(submissionData as any);
      onClose();
      // Reset form
      setFormData({
        name: '',
        workspace_type: WorkspaceType.PERSONAL,
        owner_type: OwnerType.USER,
        owner_id: currentUser.user_id || '',
        description: '',
      });
      setSelectedUsers([]);
      setSelectedGroups([]);
      setPermissionMode('user');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create workspace');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleWorkspaceTypeChange = (type: WorkspaceType) => {
    setFormData({
      ...formData,
      workspace_type: type,
      owner_type: type === WorkspaceType.GROUP ? OwnerType.GROUP : OwnerType.USER,
      owner_id: type === WorkspaceType.GROUP && currentUser.groups?.[0] 
        ? currentUser.groups[0] 
        : currentUser.user_id || '',
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg w-full max-w-md">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold">Create New Workspace</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-red-50 text-red-600 rounded text-sm">
              {error}
            </div>
          )}

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
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Workspace Type
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value={WorkspaceType.PERSONAL}
                  checked={formData.workspace_type === WorkspaceType.PERSONAL}
                  onChange={() => handleWorkspaceTypeChange(WorkspaceType.PERSONAL)}
                  className="mr-2"
                />
                <span className="text-sm">Personal Workspace</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value={WorkspaceType.GROUP}
                  checked={formData.workspace_type === WorkspaceType.GROUP}
                  onChange={() => handleWorkspaceTypeChange(WorkspaceType.GROUP)}
                  className="mr-2"
                />
                <span className="text-sm">Group Workspace</span>
              </label>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-2">
              Permission Mode
            </label>
            <div className="space-y-2">
              <label className="flex items-center">
                <input
                  type="radio"
                  value="user"
                  checked={permissionMode === 'user'}
                  onChange={() => setPermissionMode('user')}
                  className="mr-2"
                />
                <span className="text-sm">User Permissions</span>
              </label>
              <label className="flex items-center">
                <input
                  type="radio"
                  value="group"
                  checked={permissionMode === 'group'}
                  onChange={() => setPermissionMode('group')}
                  className="mr-2"
                />
                <span className="text-sm">Group Permissions</span>
              </label>
            </div>
          </div>

          {formData.workspace_type === WorkspaceType.GROUP && currentUser.groups && currentUser.groups.length > 0 && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Select Group
              </label>
              <select
                value={formData.owner_id}
                onChange={(e) => setFormData({ ...formData, owner_id: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              >
                {currentUser.groups.map((group) => (
                  <option key={group} value={group}>
                    {group}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* User Permissions */}
          {permissionMode === 'user' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Add Users
              </label>
              <div className="relative user-search-container">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={userSearch}
                    onChange={(e) => setUserSearch(e.target.value)}
                    onFocus={() => userSearch.length >= 2 && setShowUserDropdown(true)}
                    placeholder="Search by name or email..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  />
                  {isLoadingUsers && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 size={16} className="animate-spin text-gray-400" />
                    </div>
                  )}
                </div>
                
                {/* User Dropdown */}
                {showUserDropdown && userSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
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
                        {selectedUsers.includes(user.email || user.id) && (
                          <Check size={16} className="text-green-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedUsers.length > 0 && (
                <div className="space-y-1 mt-2">
                  {selectedUsers.map((user) => (
                    <div key={user} className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded text-sm">
                      <span>{user}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedUsers(selectedUsers.filter(u => u !== user))}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Group Permissions */}
          {permissionMode === 'group' && (
            <div>
              <label className="block text-sm font-medium mb-2">
                Add Groups
              </label>
              <div className="relative group-search-container">
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={groupSearch}
                    onChange={(e) => setGroupSearch(e.target.value)}
                    onFocus={() => groupSearch.length >= 2 && setShowGroupDropdown(true)}
                    placeholder="Search groups..."
                    className="flex-1 px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
                  />
                  {isLoadingGroups && (
                    <div className="absolute right-3 top-2.5">
                      <Loader2 size={16} className="animate-spin text-gray-400" />
                    </div>
                  )}
                </div>
                
                {/* Group Dropdown */}
                {showGroupDropdown && groupSuggestions.length > 0 && (
                  <div className="absolute z-10 w-full bg-white border border-gray-200 rounded-md shadow-lg max-h-48 overflow-y-auto">
                    {groupSuggestions.map((group) => (
                      <button
                        key={group.id}
                        type="button"
                        onClick={() => handleSelectGroup(group)}
                        className="w-full px-3 py-2 text-left hover:bg-gray-50 flex items-center justify-between"
                      >
                        <div>
                          <div className="text-sm font-medium">{group.display_name || group.name}</div>
                          <div className="text-xs text-gray-500">{group.description}</div>
                        </div>
                        {selectedGroups.includes(group.name) && (
                          <Check size={16} className="text-green-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {selectedGroups.length > 0 && (
                <div className="space-y-1 mt-2">
                  {selectedGroups.map((group) => (
                    <div key={group} className="flex items-center justify-between px-2 py-1 bg-gray-50 rounded text-sm">
                      <span>{group}</span>
                      <button
                        type="button"
                        onClick={() => setSelectedGroups(selectedGroups.filter(g => g !== group))}
                        className="text-red-600 hover:text-red-800"
                      >
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium mb-2">
              Description (Optional)
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
              rows={3}
              placeholder="Enter description"
            />
          </div>

          <div className="flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm bg-black text-white hover:bg-gray-800 rounded disabled:opacity-50"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Creating...' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};