import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import { WorkspaceTree } from '../WorkspaceTree';
import { WorkspaceType, OwnerType } from '../../../types/workspace';

describe('WorkspaceTree', () => {
  const mockWorkspaces = [
    {
      id: '1',
      name: 'Personal Workspace',
      slug: 'personal-workspace',
      workspace_type: WorkspaceType.PERSONAL,
      owner_type: OwnerType.USER,
      owner_id: 'user123',
      path: '/',
      is_folder: false,
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      children: [],
    },
    {
      id: '2',
      name: 'Projects',
      slug: 'projects',
      workspace_type: WorkspaceType.PERSONAL,
      owner_type: OwnerType.USER,
      owner_id: 'user123',
      path: '/',
      is_folder: true,
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      children: [
        {
          id: '3',
          name: 'Project A',
          slug: 'project-a',
          workspace_type: WorkspaceType.GROUP,
          owner_type: OwnerType.GROUP,
          owner_id: 'group123',
          path: '/Projects/',
          is_folder: false,
          is_active: true,
          created_at: '2024-01-01T00:00:00Z',
          children: [],
        },
      ],
    },
  ];

  const mockOnSelectWorkspace = jest.fn();

  beforeEach(() => {
    mockOnSelectWorkspace.mockClear();
  });

  it('renders workspace tree correctly', () => {
    render(
      <WorkspaceTree
        workspaces={mockWorkspaces}
        selectedWorkspace={null}
        onSelectWorkspace={mockOnSelectWorkspace}
      />
    );

    expect(screen.getByText('Personal Workspace')).toBeInTheDocument();
    expect(screen.getByText('Projects')).toBeInTheDocument();
  });

  it('expands folder on click', () => {
    render(
      <WorkspaceTree
        workspaces={mockWorkspaces}
        selectedWorkspace={null}
        onSelectWorkspace={mockOnSelectWorkspace}
      />
    );

    // Initially, child workspace should not be visible
    expect(screen.queryByText('Project A')).not.toBeInTheDocument();

    // Click on folder
    fireEvent.click(screen.getByText('Projects'));

    // Child workspace should now be visible
    expect(screen.getByText('Project A')).toBeInTheDocument();
  });

  it('selects workspace on click', () => {
    render(
      <WorkspaceTree
        workspaces={mockWorkspaces}
        selectedWorkspace={null}
        onSelectWorkspace={mockOnSelectWorkspace}
      />
    );

    fireEvent.click(screen.getByText('Personal Workspace'));

    expect(mockOnSelectWorkspace).toHaveBeenCalledWith(mockWorkspaces[0]);
  });

  it('highlights selected workspace', () => {
    const { container } = render(
      <WorkspaceTree
        workspaces={mockWorkspaces}
        selectedWorkspace={mockWorkspaces[0]}
        onSelectWorkspace={mockOnSelectWorkspace}
      />
    );

    const selectedElement = container.querySelector('.bg-gray-100');
    expect(selectedElement).toBeInTheDocument();
    expect(selectedElement).toHaveTextContent('Personal Workspace');
  });

  it('renders different icons for folders and workspaces', () => {
    render(
      <WorkspaceTree
        workspaces={mockWorkspaces}
        selectedWorkspace={null}
        onSelectWorkspace={mockOnSelectWorkspace}
      />
    );

    // Expand folder to see all items
    fireEvent.click(screen.getByText('Projects'));

    const folderIcons = screen.getAllByTestId('folder-icon');
    const workspaceIcons = screen.getAllByTestId('workspace-icon');

    expect(folderIcons).toHaveLength(1); // Projects folder
    expect(workspaceIcons).toHaveLength(2); // Personal Workspace and Project A
  });
});