import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'react-hot-toast';
import { Layout } from '../components/common/Layout';
import { WorkspaceSidebar } from '../components/workspace/WorkspaceSidebar';
import { CreateWorkspaceModal } from '../components/workspace/CreateWorkspaceModal';
import { MVPModulesView } from '../components/mvp/MVPModulesView';
import { workspaceApi } from '../api/workspaces';
import { useAuthStore } from '../stores/authStore';
import type { Workspace, WorkspaceCreate } from '../types/workspace';

export const Dashboard: React.FC = () => {
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const queryClient = useQueryClient();

  const { data: workspaceTree, isLoading } = useQuery({
    queryKey: ['workspaceTree'],
    queryFn: () => workspaceApi.getWorkspaceTree(),
  });

  const createWorkspaceMutation = useMutation({
    mutationFn: (data: WorkspaceCreate) => workspaceApi.createWorkspace(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaceTree'] });
      toast.success('Workspace created successfully');
      setIsCreateModalOpen(false);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.detail || 'Failed to create workspace');
    },
  });

  const handleCreateWorkspace = () => {
    // Workspace creation is now only available in admin panel
    window.location.href = '/admin/workspaces';
  };

  const isAdmin = user?.is_admin || user?.role === 'admin';

  return (
    <Layout>
      <div className="flex h-full">
        {/* Sidebar */}
        <WorkspaceSidebar
          workspaces={workspaceTree?.workspaces || []}
          selectedWorkspace={selectedWorkspace}
          onSelectWorkspace={setSelectedWorkspace}
          onCreateWorkspace={handleCreateWorkspace}
          isAdmin={isAdmin}
        />

        {/* Main Content */}
        <div className="flex-1 p-8">
          {isLoading ? (
            <div className="text-gray-500">Loading workspaces...</div>
          ) : selectedWorkspace ? (
            <>
              <div className="mb-6">
                <h1 className="text-2xl font-bold">{selectedWorkspace.name}</h1>
                {selectedWorkspace.description && (
                  <p className="text-gray-600 mt-1">{selectedWorkspace.description}</p>
                )}
              </div>
              
              {/* MVP Modules View */}
              <MVPModulesView workspace={selectedWorkspace} isAdmin={isAdmin} />
            </>
          ) : (
            <div className="text-gray-500 text-center py-12">
              <div className="mb-4">
                <svg
                  className="mx-auto h-12 w-12 text-gray-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"
                  />
                </svg>
              </div>
              <h3 className="text-lg font-medium">No workspace selected</h3>
              <p className="mt-1">Select a workspace from the sidebar to view its MVP modules</p>
            </div>
          )}
        </div>
      </div>

      {/* Create Modal */}
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
    </Layout>
  );
};