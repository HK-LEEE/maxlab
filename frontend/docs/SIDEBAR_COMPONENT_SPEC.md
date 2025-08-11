# MaxLab 사이드바 컴포넌트 명세서

## 📦 컴포넌트 구조

### 1. EnhancedSidebar (메인 컨테이너)

```typescript
// components/workspace/EnhancedSidebar.tsx
interface EnhancedSidebarProps {
  // Data
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  
  // Actions
  onSelectWorkspace: (workspace: Workspace) => void;
  onCreateWorkspace?: () => void;
  
  // State
  isAdmin?: boolean;
  defaultCollapsed?: boolean;
  
  // Customization
  className?: string;
  width?: number; // default: 280
  collapsedWidth?: number; // default: 60
}

const EnhancedSidebar: React.FC<EnhancedSidebarProps> = ({...}) => {
  const [isCollapsed, setIsCollapsed] = useState(defaultCollapsed ?? false);
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [hoveredItem, setHoveredItem] = useState<Workspace | null>(null);
  
  // Keyboard navigation state
  const [focusedIndex, setFocusedIndex] = useState<number>(-1);
  
  return (
    <aside
      className={cn(
        'h-full bg-white border-r border-gray-200 flex flex-col transition-all duration-200',
        isCollapsed ? 'w-[60px]' : 'w-[280px]',
        className
      )}
      role="navigation"
      aria-label="Workspace navigation"
    >
      {/* Components */}
    </aside>
  );
};
```

---

### 2. SidebarHeader (브랜드 영역)

```typescript
// components/workspace/sidebar/SidebarHeader.tsx
interface SidebarHeaderProps {
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

const SidebarHeader: React.FC<SidebarHeaderProps> = ({
  isCollapsed,
  onToggleCollapse
}) => {
  return (
    <div className="h-14 px-4 flex items-center justify-between border-b border-gray-200">
      <button
        onClick={onToggleCollapse}
        className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
        aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        title={isCollapsed ? "Expand sidebar (⌘B)" : "Collapse sidebar (⌘B)"}
      >
        <Menu size={20} className="text-gray-700" />
      </button>
      
      {!isCollapsed && (
        <span className="font-semibold text-lg">MAX Lab</span>
      )}
    </div>
  );
};
```

---

### 3. SidebarSearch (검색 필터)

```typescript
// components/workspace/sidebar/SidebarSearch.tsx
interface SidebarSearchProps {
  value: string;
  onChange: (value: string) => void;
  isCollapsed: boolean;
  onFocus?: () => void;
  onBlur?: () => void;
}

const SidebarSearch: React.FC<SidebarSearchProps> = ({
  value,
  onChange,
  isCollapsed,
  onFocus,
  onBlur
}) => {
  const inputRef = useRef<HTMLInputElement>(null);
  
  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);
  
  if (isCollapsed) {
    return (
      <div className="px-3 py-2 border-b border-gray-200">
        <button
          onClick={() => inputRef.current?.focus()}
          className="p-2 hover:bg-gray-100 rounded-md"
          aria-label="Search workspaces"
        >
          <Search size={18} className="text-gray-500" />
        </button>
      </div>
    );
  }
  
  return (
    <div className="px-3 py-2 border-b border-gray-200">
      <div className="relative">
        <Search 
          size={16} 
          className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" 
        />
        <input
          ref={inputRef}
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onFocus={onFocus}
          onBlur={onBlur}
          placeholder="Search (⌘K)"
          className="w-full pl-9 pr-3 py-1.5 text-sm border border-gray-300 rounded-md
                     focus:outline-none focus:ring-1 focus:ring-black focus:border-black"
          aria-label="Search workspaces"
        />
      </div>
    </div>
  );
};
```

---

### 4. WorkspaceList (워크스페이스 목록)

```typescript
// components/workspace/sidebar/WorkspaceList.tsx
interface WorkspaceListProps {
  workspaces: Workspace[];
  selectedWorkspace: Workspace | null;
  expandedFolders: Set<string>;
  searchTerm: string;
  isCollapsed: boolean;
  focusedIndex: number;
  
  onSelectWorkspace: (workspace: Workspace) => void;
  onToggleFolder: (folderId: string) => void;
  onHoverItem: (workspace: Workspace | null) => void;
  onFocusItem: (index: number) => void;
}

const WorkspaceList: React.FC<WorkspaceListProps> = ({...}) => {
  const flattenedItems = useMemo(() => 
    flattenWorkspaces(workspaces, expandedFolders, searchTerm),
    [workspaces, expandedFolders, searchTerm]
  );
  
  // Keyboard navigation
  useKeyboardNavigation({
    itemCount: flattenedItems.length,
    focusedIndex,
    onFocusChange: onFocusItem,
    onItemSelect: (index) => {
      const item = flattenedItems[index];
      if (item.is_folder) {
        onToggleFolder(item.id);
      } else {
        onSelectWorkspace(item);
      }
    }
  });
  
  return (
    <div className="flex-1 overflow-y-auto px-2 py-2">
      {!isCollapsed && (
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wider px-2 mb-2">
          Workspaces
        </div>
      )}
      
      {flattenedItems.map((item, index) => (
        <WorkspaceItem
          key={item.id}
          workspace={item}
          isSelected={selectedWorkspace?.id === item.id}
          isExpanded={expandedFolders.has(item.id)}
          isFocused={focusedIndex === index}
          isCollapsed={isCollapsed}
          level={item.level || 0}
          onSelect={() => onSelectWorkspace(item)}
          onToggleExpand={() => onToggleFolder(item.id)}
          onHover={() => onHoverItem(item)}
          onHoverEnd={() => onHoverItem(null)}
        />
      ))}
    </div>
  );
};
```

---

### 5. WorkspaceItem (개별 워크스페이스 항목)

```typescript
// components/workspace/sidebar/WorkspaceItem.tsx
interface WorkspaceItemProps {
  workspace: Workspace;
  isSelected: boolean;
  isExpanded: boolean;
  isFocused: boolean;
  isCollapsed: boolean;
  level: number;
  
  onSelect: () => void;
  onToggleExpand: () => void;
  onHover: () => void;
  onHoverEnd: () => void;
}

const WorkspaceItem: React.FC<WorkspaceItemProps> = ({...}) => {
  const [showTooltip, setShowTooltip] = useState(false);
  const itemRef = useRef<HTMLDivElement>(null);
  
  const handleMouseEnter = () => {
    onHover();
    // Show tooltip after 500ms
    const timer = setTimeout(() => setShowTooltip(true), 500);
    return () => clearTimeout(timer);
  };
  
  const handleMouseLeave = () => {
    onHoverEnd();
    setShowTooltip(false);
  };
  
  return (
    <div
      ref={itemRef}
      className={cn(
        'group relative flex items-center px-2 py-1.5 rounded-md cursor-pointer transition-all',
        'hover:bg-gray-50 active:scale-[0.98]',
        isSelected && 'bg-gray-100 border-l-3 border-black',
        isFocused && 'ring-1 ring-black ring-opacity-50',
        isCollapsed && 'justify-center'
      )}
      style={{ paddingLeft: isCollapsed ? 8 : level * 16 + 8 }}
      onClick={onSelect}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      role="treeitem"
      aria-selected={isSelected}
      aria-expanded={workspace.is_folder ? isExpanded : undefined}
      tabIndex={isFocused ? 0 : -1}
    >
      {/* Expand/Collapse button for folders */}
      {workspace.is_folder && !isCollapsed && (
        <button
          className="mr-1 p-0.5 hover:bg-gray-200 rounded"
          onClick={(e) => {
            e.stopPropagation();
            onToggleExpand();
          }}
          aria-label={isExpanded ? "Collapse folder" : "Expand folder"}
        >
          {isExpanded ? (
            <ChevronDown size={14} className="text-gray-500" />
          ) : (
            <ChevronRight size={14} className="text-gray-500" />
          )}
        </button>
      )}
      
      {/* Icon */}
      <WorkspaceIcon 
        type={workspace.workspace_type} 
        isFolder={workspace.is_folder}
        isExpanded={isExpanded}
        className="flex-shrink-0"
      />
      
      {/* Name */}
      {!isCollapsed && (
        <span className={cn(
          'ml-2 text-sm truncate',
          isSelected ? 'font-medium text-gray-900' : 'text-gray-700',
          workspace.is_folder && 'font-medium'
        )}>
          {workspace.name}
        </span>
      )}
      
      {/* Tooltip */}
      {(showTooltip || isCollapsed) && (
        <WorkspaceTooltip
          workspace={workspace}
          targetRef={itemRef}
        />
      )}
    </div>
  );
};
```

---

### 6. WorkspaceTooltip (호버 툴팁)

```typescript
// components/workspace/sidebar/WorkspaceTooltip.tsx
interface WorkspaceTooltipProps {
  workspace: Workspace;
  targetRef: React.RefObject<HTMLElement>;
}

const WorkspaceTooltip: React.FC<WorkspaceTooltipProps> = ({
  workspace,
  targetRef
}) => {
  const [position, setPosition] = useState({ top: 0, left: 0 });
  
  useEffect(() => {
    if (!targetRef.current) return;
    
    const rect = targetRef.current.getBoundingClientRect();
    setPosition({
      top: rect.top,
      left: rect.right + 8
    });
  }, [targetRef]);
  
  return createPortal(
    <div
      className="fixed z-50 bg-gray-900 text-white p-3 rounded-lg shadow-lg 
                 max-w-xs pointer-events-none animate-fadeIn"
      style={{
        top: position.top,
        left: position.left
      }}
    >
      <div className="font-medium text-sm mb-1">{workspace.name}</div>
      
      {workspace.description && (
        <div className="text-xs text-gray-300 mb-2">{workspace.description}</div>
      )}
      
      <div className="text-xs text-gray-400 space-y-1">
        {workspace.workspace_type && (
          <div>Type: {workspace.workspace_type}</div>
        )}
        {workspace.updated_at && (
          <div>Updated: {formatRelativeTime(workspace.updated_at)}</div>
        )}
        {workspace.owner && (
          <div>Owner: {workspace.owner}</div>
        )}
      </div>
    </div>,
    document.body
  );
};
```

---

### 7. SidebarFooter (하단 액션 버튼)

```typescript
// components/workspace/sidebar/SidebarFooter.tsx
interface SidebarFooterProps {
  isAdmin: boolean;
  isCollapsed: boolean;
  workspaceCount: number;
  onSettingsClick: () => void;
  onAdminClick: () => void;
}

const SidebarFooter: React.FC<SidebarFooterProps> = ({
  isAdmin,
  isCollapsed,
  workspaceCount,
  onSettingsClick,
  onAdminClick
}) => {
  return (
    <div className="border-t border-gray-200 p-3">
      {!isCollapsed && (
        <div className="text-xs text-gray-500 mb-3">
          {workspaceCount} workspace{workspaceCount !== 1 ? 's' : ''}
        </div>
      )}
      
      <div className={cn(
        'flex gap-2',
        isCollapsed && 'flex-col'
      )}>
        <button
          onClick={onSettingsClick}
          className={cn(
            'flex items-center justify-center p-2 text-sm rounded-md',
            'bg-gray-100 hover:bg-gray-200 transition-colors',
            !isCollapsed && 'flex-1 space-x-2'
          )}
          aria-label="Settings"
          title="Settings"
        >
          <Settings size={18} />
          {!isCollapsed && <span>Settings</span>}
        </button>
        
        {isAdmin && (
          <button
            onClick={onAdminClick}
            className={cn(
              'flex items-center justify-center p-2 text-sm rounded-md',
              'bg-gray-100 hover:bg-gray-200 transition-colors',
              !isCollapsed && 'flex-1 space-x-2'
            )}
            aria-label="Admin"
            title="Admin"
          >
            <Shield size={18} />
            {!isCollapsed && <span>Admin</span>}
          </button>
        )}
      </div>
    </div>
  );
};
```

---

## 🎮 상호작용 명세

### 키보드 네비게이션

```typescript
// hooks/useKeyboardNavigation.ts
interface UseKeyboardNavigationProps {
  itemCount: number;
  focusedIndex: number;
  onFocusChange: (index: number) => void;
  onItemSelect: (index: number) => void;
}

const useKeyboardNavigation = ({
  itemCount,
  focusedIndex,
  onFocusChange,
  onItemSelect
}: UseKeyboardNavigationProps) => {
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'ArrowUp':
          e.preventDefault();
          onFocusChange(Math.max(0, focusedIndex - 1));
          break;
          
        case 'ArrowDown':
          e.preventDefault();
          onFocusChange(Math.min(itemCount - 1, focusedIndex + 1));
          break;
          
        case 'Enter':
        case ' ':
          e.preventDefault();
          if (focusedIndex >= 0) {
            onItemSelect(focusedIndex);
          }
          break;
          
        case 'ArrowRight':
          // Expand folder
          break;
          
        case 'ArrowLeft':
          // Collapse folder
          break;
          
        case 'Home':
          e.preventDefault();
          onFocusChange(0);
          break;
          
        case 'End':
          e.preventDefault();
          onFocusChange(itemCount - 1);
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, itemCount, onFocusChange, onItemSelect]);
};
```

### 마우스 상호작용

```typescript
// Mouse interaction specifications
const mouseInteractions = {
  hover: {
    delay: 500, // Show tooltip after 500ms
    effects: [
      'Show tooltip with full information',
      'Highlight item with gray-50 background',
      'Show expand/collapse button for folders'
    ]
  },
  
  click: {
    singleClick: {
      folder: 'Toggle expand/collapse',
      workspace: 'Select and navigate to workspace'
    },
    doubleClick: {
      folder: 'Expand and select first child',
      workspace: 'Open in new tab (optional)'
    }
  },
  
  drag: {
    enabled: false, // Future enhancement
    description: 'Drag to reorder workspaces'
  }
};
```

### 검색 동작

```typescript
// Search behavior
const searchBehavior = {
  debounce: 300, // Debounce search input
  
  filter: (workspaces: Workspace[], term: string) => {
    // Recursive filtering
    return filterWorkspacesRecursively(workspaces, term.toLowerCase());
  },
  
  highlight: true, // Highlight matching text
  
  emptyState: {
    message: 'No workspaces found',
    showCreateButton: true
  },
  
  shortcuts: {
    focus: 'Cmd/Ctrl + K',
    clear: 'Escape',
    navigate: 'Arrow keys'
  }
};
```

### 애니메이션 명세

```scss
// animations.scss
@keyframes fadeIn {
  from { opacity: 0; transform: translateX(-4px); }
  to { opacity: 1; transform: translateX(0); }
}

@keyframes slideIn {
  from { transform: translateX(-100%); }
  to { transform: translateX(0); }
}

.sidebar-transition {
  transition: width 200ms cubic-bezier(0.4, 0, 0.2, 1),
              transform 200ms cubic-bezier(0.4, 0, 0.2, 1);
}

.item-transition {
  transition: background-color 150ms ease,
              transform 150ms ease,
              box-shadow 150ms ease;
}

.tooltip-animation {
  animation: fadeIn 200ms ease-out;
}
```

---

## 🔌 상태 관리

### Zustand Store

```typescript
// stores/sidebarStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SidebarState {
  // UI State
  isCollapsed: boolean;
  searchTerm: string;
  expandedFolders: Set<string>;
  focusedIndex: number;
  
  // Actions
  toggleCollapse: () => void;
  setSearchTerm: (term: string) => void;
  toggleFolder: (folderId: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  setFocusedIndex: (index: number) => void;
}

export const useSidebarStore = create<SidebarState>()(
  persist(
    (set) => ({
      isCollapsed: false,
      searchTerm: '',
      expandedFolders: new Set<string>(),
      focusedIndex: -1,
      
      toggleCollapse: () => set((state) => ({ 
        isCollapsed: !state.isCollapsed 
      })),
      
      setSearchTerm: (term) => set({ searchTerm: term }),
      
      toggleFolder: (folderId) => set((state) => {
        const newExpanded = new Set(state.expandedFolders);
        if (newExpanded.has(folderId)) {
          newExpanded.delete(folderId);
        } else {
          newExpanded.add(folderId);
        }
        return { expandedFolders: newExpanded };
      }),
      
      expandAll: () => set((state) => ({
        expandedFolders: new Set(
          getAllFolderIds(state.workspaces)
        )
      })),
      
      collapseAll: () => set({ 
        expandedFolders: new Set<string>() 
      }),
      
      setFocusedIndex: (index) => set({ focusedIndex: index })
    }),
    {
      name: 'sidebar-storage',
      partialize: (state) => ({
        isCollapsed: state.isCollapsed,
        expandedFolders: Array.from(state.expandedFolders)
      })
    }
  )
);
```

---

## 📱 반응형 동작

### 브레이크포인트

```typescript
// constants/breakpoints.ts
export const BREAKPOINTS = {
  mobile: 640,   // < 640px
  tablet: 1024,  // 640px - 1024px
  desktop: 1280, // > 1024px
};

// hooks/useResponsiveSidebar.ts
const useResponsiveSidebar = () => {
  const [screenSize, setScreenSize] = useState<'mobile' | 'tablet' | 'desktop'>('desktop');
  
  useEffect(() => {
    const handleResize = () => {
      const width = window.innerWidth;
      if (width < BREAKPOINTS.mobile) {
        setScreenSize('mobile');
      } else if (width < BREAKPOINTS.tablet) {
        setScreenSize('tablet');
      } else {
        setScreenSize('desktop');
      }
    };
    
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  return {
    screenSize,
    isMobile: screenSize === 'mobile',
    isTablet: screenSize === 'tablet',
    isDesktop: screenSize === 'desktop',
    
    sidebarConfig: {
      mobile: {
        behavior: 'overlay',
        defaultCollapsed: true,
        swipeToClose: true,
        width: '80%'
      },
      tablet: {
        behavior: 'push',
        defaultCollapsed: true,
        width: 240
      },
      desktop: {
        behavior: 'fixed',
        defaultCollapsed: false,
        width: 280
      }
    }[screenSize]
  };
};
```

---

## 🧪 테스트 시나리오

### 단위 테스트

```typescript
// __tests__/WorkspaceItem.test.tsx
describe('WorkspaceItem', () => {
  it('should display workspace name', () => {
    const workspace = { id: '1', name: 'Test Workspace' };
    render(<WorkspaceItem workspace={workspace} />);
    expect(screen.getByText('Test Workspace')).toBeInTheDocument();
  });
  
  it('should show tooltip on hover', async () => {
    const workspace = { 
      id: '1', 
      name: 'Test Workspace',
      description: 'Test description' 
    };
    render(<WorkspaceItem workspace={workspace} />);
    
    fireEvent.mouseEnter(screen.getByText('Test Workspace'));
    await waitFor(() => {
      expect(screen.getByText('Test description')).toBeInTheDocument();
    });
  });
  
  it('should handle keyboard navigation', () => {
    const onSelect = jest.fn();
    render(<WorkspaceItem workspace={workspace} onSelect={onSelect} />);
    
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onSelect).toHaveBeenCalled();
  });
});
```

### E2E 테스트

```typescript
// e2e/sidebar.spec.ts
test('sidebar navigation flow', async ({ page }) => {
  await page.goto('/dashboard');
  
  // Search for workspace
  await page.keyboard.press('Meta+K');
  await page.fill('[aria-label="Search workspaces"]', 'Project Alpha');
  
  // Select workspace
  await page.click('text=Project Alpha');
  await expect(page).toHaveURL(/.*workspace=project-alpha/);
  
  // Collapse sidebar
  await page.click('[aria-label="Collapse sidebar"]');
  await expect(page.locator('aside')).toHaveClass(/w-\[60px\]/);
  
  // Test tooltip on collapsed sidebar
  await page.hover('[aria-label="Project Alpha"]');
  await expect(page.locator('.tooltip')).toBeVisible();
});
```

---

## 🎯 성능 최적화

### 가상화

```typescript
// components/workspace/sidebar/VirtualizedWorkspaceList.tsx
import { VariableSizeList } from 'react-window';

const VirtualizedWorkspaceList: React.FC<Props> = ({ workspaces }) => {
  const getItemSize = (index: number) => {
    // Calculate item height based on level and content
    return 32; // Base height
  };
  
  return (
    <VariableSizeList
      height={600}
      itemCount={workspaces.length}
      itemSize={getItemSize}
      width="100%"
    >
      {({ index, style }) => (
        <div style={style}>
          <WorkspaceItem workspace={workspaces[index]} />
        </div>
      )}
    </VariableSizeList>
  );
};
```

### 메모이제이션

```typescript
// Memoized components
const MemoizedWorkspaceItem = React.memo(WorkspaceItem, (prev, next) => {
  return (
    prev.workspace.id === next.workspace.id &&
    prev.isSelected === next.isSelected &&
    prev.isExpanded === next.isExpanded &&
    prev.isFocused === next.isFocused
  );
});

// Memoized calculations
const filteredWorkspaces = useMemo(
  () => filterWorkspaces(workspaces, searchTerm),
  [workspaces, searchTerm]
);
```

---

## 📝 사용 예제

```tsx
// pages/Dashboard.tsx
import { EnhancedSidebar } from '@/components/workspace/EnhancedSidebar';

export const Dashboard: React.FC = () => {
  const [selectedWorkspace, setSelectedWorkspace] = useState<Workspace | null>(null);
  const { data: workspaces } = useWorkspaces();
  const { user } = useAuth();
  
  return (
    <div className="flex h-screen">
      <EnhancedSidebar
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspace}
        onSelectWorkspace={setSelectedWorkspace}
        isAdmin={user?.isAdmin}
        defaultCollapsed={false}
      />
      
      <main className="flex-1">
        {selectedWorkspace ? (
          <WorkspaceContent workspace={selectedWorkspace} />
        ) : (
          <EmptyState />
        )}
      </main>
    </div>
  );
};
```

---

*작성일: 2024년 1월*
*작성자: MAX Lab Frontend Team*
*버전: 1.0.0*