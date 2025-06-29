import React, { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, Users, User, Loader2 } from 'lucide-react';
import { Layout } from '../../components/common/Layout';
import { authApi } from '../../api/auth';
import { toast } from 'react-hot-toast';

interface ExternalUser {
  id: string;
  username: string;
  email: string;
  name: string;
  groups: string[];
  is_active: boolean;
  last_login?: string;
}

interface ExternalGroup {
  id: string;
  name: string;
  description?: string;
  members_count?: number;
}

export const UserManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'users' | 'groups'>('users');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');

  // Debounce search term
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchTerm]);

  // Fetch users
  const { data: usersData, isLoading: isLoadingUsers } = useQuery({
    queryKey: ['external-users', debouncedSearchTerm],
    queryFn: async () => {
      if (debouncedSearchTerm.length >= 2) {
        return await authApi.searchUsers(debouncedSearchTerm);
      }
      return [];
    },
    enabled: activeTab === 'users',
  });

  // Fetch groups
  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['external-groups'],
    queryFn: async () => {
      return await authApi.getGroups();
    },
    enabled: activeTab === 'groups',
  });

  const users = usersData || [];
  const groups = groupsData || [];

  // Filter groups based on search term
  const filteredGroups = groups.filter((group: ExternalGroup) =>
    group.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (group.description && group.description.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const renderUserCard = (user: ExternalUser) => (
    <div key={user.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-gray-200 rounded-full flex items-center justify-center">
            <User size={20} className="text-gray-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{user.name || user.username}</h3>
            <p className="text-sm text-gray-500">{user.email}</p>
            <p className="text-xs text-gray-400 mt-1">ID: {user.id}</p>
          </div>
        </div>
        <span className={`px-2 py-1 text-xs rounded-full ${
          user.is_active ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-600'
        }`}>
          {user.is_active ? 'Active' : 'Inactive'}
        </span>
      </div>
      
      {user.groups && user.groups.length > 0 && (
        <div className="mt-3 pt-3 border-t border-gray-100">
          <p className="text-xs text-gray-500 mb-1">Groups:</p>
          <div className="flex flex-wrap gap-1">
            {user.groups.map((group) => (
              <span key={group} className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded">
                {group}
              </span>
            ))}
          </div>
        </div>
      )}
      
      {user.last_login && (
        <p className="text-xs text-gray-400 mt-2">
          Last login: {new Date(user.last_login).toLocaleDateString()}
        </p>
      )}
    </div>
  );

  const renderGroupCard = (group: ExternalGroup) => (
    <div key={group.id} className="bg-white p-4 rounded-lg border border-gray-200 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
            <Users size={20} className="text-blue-600" />
          </div>
          <div>
            <h3 className="font-medium text-gray-900">{group.name}</h3>
            {group.description && (
              <p className="text-sm text-gray-500 mt-1">{group.description}</p>
            )}
            <p className="text-xs text-gray-400 mt-1">ID: {group.id}</p>
          </div>
        </div>
        {group.members_count !== undefined && (
          <span className="px-2 py-1 text-xs bg-gray-100 text-gray-600 rounded-full">
            {group.members_count} members
          </span>
        )}
      </div>
    </div>
  );

  return (
    <Layout title="User Management">
      <div className="max-w-7xl mx-auto p-6">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900">User & Group Management</h1>
          <p className="text-gray-600 mt-1">Search and view users and groups from the external authentication system</p>
        </div>

        {/* Tabs */}
        <div className="flex space-x-1 mb-6 bg-gray-100 p-1 rounded-lg w-fit">
          <button
            onClick={() => setActiveTab('users')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'users'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              <User size={16} />
              <span>Users</span>
            </div>
          </button>
          <button
            onClick={() => setActiveTab('groups')}
            className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
              activeTab === 'groups'
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <div className="flex items-center space-x-2">
              <Users size={16} />
              <span>Groups</span>
            </div>
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative max-w-md">
            <Search size={20} className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder={activeTab === 'users' ? 'Search users (min 2 characters)...' : 'Search groups...'}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
          </div>
          {activeTab === 'users' && searchTerm.length > 0 && searchTerm.length < 2 && (
            <p className="text-sm text-amber-600 mt-1">Please enter at least 2 characters to search users</p>
          )}
        </div>

        {/* Results */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {activeTab === 'users' ? (
            isLoadingUsers ? (
              <div className="col-span-full flex items-center justify-center py-12">
                <Loader2 className="animate-spin mr-2" size={20} />
                <span>Loading users...</span>
              </div>
            ) : users.length > 0 ? (
              users.map(renderUserCard)
            ) : searchTerm.length >= 2 ? (
              <div className="col-span-full text-center py-12 text-gray-500">
                No users found matching "{searchTerm}"
              </div>
            ) : (
              <div className="col-span-full text-center py-12 text-gray-500">
                Enter a search term to find users
              </div>
            )
          ) : (
            isLoadingGroups ? (
              <div className="col-span-full flex items-center justify-center py-12">
                <Loader2 className="animate-spin mr-2" size={20} />
                <span>Loading groups...</span>
              </div>
            ) : filteredGroups.length > 0 ? (
              filteredGroups.map(renderGroupCard)
            ) : searchTerm ? (
              <div className="col-span-full text-center py-12 text-gray-500">
                No groups found matching "{searchTerm}"
              </div>
            ) : (
              <div className="col-span-full text-center py-12 text-gray-500">
                No groups available
              </div>
            )
          )}
        </div>
      </div>
    </Layout>
  );
};