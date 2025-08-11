# MaxLab 사이드바 구현 가이드

## 🚀 Quick Start

### 설치 필요 패키지
```bash
# 필수 패키지
npm install lucide-react       # 아이콘
npm install clsx               # 클래스 유틸리티
npm install zustand            # 상태 관리
npm install @floating-ui/react # 툴팁 포지셔닝

# 선택 패키지 (성능 최적화)
npm install react-window       # 가상 스크롤
npm install react-intersection-observer # 지연 로딩
```

---

## 📂 파일 구조

```
src/
├── components/
│   └── workspace/
│       ├── EnhancedSidebar/
│       │   ├── index.tsx              # 메인 컨테이너
│       │   ├── SidebarHeader.tsx      # 헤더 컴포넌트
│       │   ├── SidebarSearch.tsx      # 검색 컴포넌트
│       │   ├── WorkspaceList.tsx      # 리스트 컨테이너
│       │   ├── WorkspaceItem.tsx      # 개별 항목
│       │   ├── WorkspaceTooltip.tsx   # 툴팁
│       │   ├── SidebarFooter.tsx      # 푸터
│       │   └── styles.module.css      # 컴포넌트 스타일
│       └── hooks/
│           ├── useKeyboardNavigation.ts
│           ├── useWorkspaceFilter.ts
│           └── useResponsiveSidebar.ts
├── stores/
│   └── sidebarStore.ts               # Zustand 스토어
└── utils/
    └── sidebar/
        ├── helpers.ts                 # 유틸리티 함수
        └── constants.ts               # 상수 정의
```

---

## 💻 단계별 구현

### Step 1: 기본 구조 설정

```typescript
// components/workspace/EnhancedSidebar/index.tsx
import React, { useState, useEffect } from 'react';
import { cn } from '@/utils/cn';
import { SidebarHeader } from './SidebarHeader';
import { SidebarSearch } from './SidebarSearch';
import { WorkspaceList } from './WorkspaceList';
import { SidebarFooter } from './SidebarFooter';
import { useSidebarStore } from '@/stores/sidebarStore';
import type { Workspace } from '@/types/workspace';

export const EnhancedSidebar: React.FC<Props> = (props) => {
  const {
    workspaces,
    selectedWorkspace,
    onSelectWorkspace,
    isAdmin = false,
    className
  } = props;

  // Global state
  const {
    isCollapsed,
    toggleCollapse,
    searchTerm,
    setSearchTerm
  } = useSidebarStore();

  return (
    <aside
      className={cn(
        'h-full bg-white border-r border-gray-200',
        'flex flex-col transition-all duration-200',
        isCollapsed ? 'w-[60px]' : 'w-[280px]',
        className
      )}
    >
      <SidebarHeader 
        isCollapsed={isCollapsed}
        onToggleCollapse={toggleCollapse}
      />
      
      <SidebarSearch
        value={searchTerm}
        onChange={setSearchTerm}
        isCollapsed={isCollapsed}
      />
      
      <WorkspaceList
        workspaces={workspaces}
        selectedWorkspace={selectedWorkspace}
        onSelectWorkspace={onSelectWorkspace}
        searchTerm={searchTerm}
        isCollapsed={isCollapsed}
      />
      
      <SidebarFooter
        isAdmin={isAdmin}
        isCollapsed={isCollapsed}
        workspaceCount={workspaces.length}
      />
    </aside>
  );
};
```

### Step 2: 검색 기능 구현

```typescript
// hooks/useWorkspaceFilter.ts
export const useWorkspaceFilter = (
  workspaces: Workspace[],
  searchTerm: string
) => {
  return useMemo(() => {
    if (!searchTerm) return workspaces;
    
    const term = searchTerm.toLowerCase();
    
    const filterRecursive = (items: Workspace[]): Workspace[] => {
      return items.reduce((acc, item) => {
        const nameMatch = item.name.toLowerCase().includes(term);
        const descMatch = item.description?.toLowerCase().includes(term);
        
        const filteredChildren = item.children 
          ? filterRecursive(item.children)
          : [];
        
        if (nameMatch || descMatch || filteredChildren.length > 0) {
          acc.push({
            ...item,
            children: filteredChildren,
            // Mark if this item matches directly
            _highlighted: nameMatch || descMatch
          });
        }
        
        return acc;
      }, [] as Workspace[]);
    };
    
    return filterRecursive(workspaces);
  }, [workspaces, searchTerm]);
};
```

### Step 3: 키보드 네비게이션

```typescript
// hooks/useKeyboardNavigation.ts
export const useKeyboardNavigation = (options: NavigationOptions) => {
  const { items, onSelect, onExpand } = options;
  const [focusedIndex, setFocusedIndex] = useState(-1);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default browser behavior
      if (['ArrowUp', 'ArrowDown', 'Enter', ' '].includes(e.key)) {
        e.preventDefault();
      }
      
      switch (e.key) {
        case 'ArrowUp':
          setFocusedIndex(prev => 
            prev > 0 ? prev - 1 : items.length - 1
          );
          break;
          
        case 'ArrowDown':
          setFocusedIndex(prev => 
            prev < items.length - 1 ? prev + 1 : 0
          );
          break;
          
        case 'Enter':
        case ' ':
          if (focusedIndex >= 0) {
            const item = items[focusedIndex];
            if (item.is_folder) {
              onExpand?.(item.id);
            } else {
              onSelect(item);
            }
          }
          break;
          
        case 'ArrowRight':
          if (focusedIndex >= 0) {
            const item = items[focusedIndex];
            if (item.is_folder && !item._expanded) {
              onExpand?.(item.id);
            }
          }
          break;
          
        case 'ArrowLeft':
          if (focusedIndex >= 0) {
            const item = items[focusedIndex];
            if (item.is_folder && item._expanded) {
              onExpand?.(item.id);
            }
          }
          break;
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [focusedIndex, items, onSelect, onExpand]);
  
  return { focusedIndex, setFocusedIndex };
};
```

### Step 4: 툴팁 구현

```typescript
// components/workspace/EnhancedSidebar/WorkspaceTooltip.tsx
import { useFloating, autoUpdate, offset, flip, shift } from '@floating-ui/react';
import { createPortal } from 'react-dom';

export const WorkspaceTooltip: React.FC<TooltipProps> = ({
  workspace,
  targetRef,
  isVisible
}) => {
  const { refs, floatingStyles } = useFloating({
    placement: 'right',
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 8 })
    ],
    whileElementsMounted: autoUpdate
  });
  
  useEffect(() => {
    if (targetRef.current) {
      refs.setReference(targetRef.current);
    }
  }, [targetRef, refs]);
  
  if (!isVisible) return null;
  
  return createPortal(
    <div
      ref={refs.setFloating}
      style={floatingStyles}
      className="z-50 bg-gray-900 text-white p-3 rounded-lg shadow-lg
                 max-w-xs pointer-events-none"
      role="tooltip"
    >
      <div className="font-medium text-sm mb-1">
        {workspace.name}
      </div>
      
      {workspace.description && (
        <div className="text-xs text-gray-300 mb-2">
          {workspace.description}
        </div>
      )}
      
      <div className="text-xs text-gray-400 space-y-0.5">
        <div>Type: {workspace.workspace_type || 'Workspace'}</div>
        <div>Items: {workspace.children?.length || 0}</div>
        {workspace.updated_at && (
          <div>Updated: {formatRelativeTime(workspace.updated_at)}</div>
        )}
      </div>
    </div>,
    document.body
  );
};

// 시간 포맷팅 유틸리티
const formatRelativeTime = (date: string | Date): string => {
  const now = Date.now();
  const then = new Date(date).getTime();
  const diff = now - then;
  
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};
```

### Step 5: 반응형 처리

```typescript
// hooks/useResponsiveSidebar.ts
export const useResponsiveSidebar = () => {
  const [isMobile, setIsMobile] = useState(false);
  const [isTablet, setIsTablet] = useState(false);
  
  useEffect(() => {
    const checkScreen = () => {
      setIsMobile(window.innerWidth < 640);
      setIsTablet(window.innerWidth >= 640 && window.innerWidth < 1024);
    };
    
    checkScreen();
    window.addEventListener('resize', checkScreen);
    return () => window.removeEventListener('resize', checkScreen);
  }, []);
  
  // Mobile: Overlay mode
  if (isMobile) {
    return {
      mode: 'overlay' as const,
      defaultCollapsed: true,
      width: '80vw',
      backdrop: true
    };
  }
  
  // Tablet: Collapsible
  if (isTablet) {
    return {
      mode: 'push' as const,
      defaultCollapsed: true,
      width: 240,
      backdrop: false
    };
  }
  
  // Desktop: Fixed
  return {
    mode: 'fixed' as const,
    defaultCollapsed: false,
    width: 280,
    backdrop: false
  };
};
```

### Step 6: 애니메이션 추가

```css
/* styles.module.css */
.sidebar-enter {
  transform: translateX(-100%);
  opacity: 0;
}

.sidebar-enter-active {
  transform: translateX(0);
  opacity: 1;
  transition: transform 200ms ease-out, opacity 200ms ease-out;
}

.sidebar-exit {
  transform: translateX(0);
  opacity: 1;
}

.sidebar-exit-active {
  transform: translateX(-100%);
  opacity: 0;
  transition: transform 200ms ease-in, opacity 200ms ease-in;
}

.item-hover {
  transition: background-color 150ms ease,
              transform 150ms ease;
}

.item-hover:hover {
  background-color: var(--gray-50);
}

.item-hover:active {
  transform: scale(0.98);
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(2px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.tooltip-fade {
  animation: fadeIn 200ms ease-out;
}
```

---

## 🔧 유틸리티 함수

```typescript
// utils/sidebar/helpers.ts

// 워크스페이스 트리를 평면 배열로 변환
export const flattenWorkspaces = (
  workspaces: Workspace[],
  expandedIds: Set<string>,
  level = 0
): FlatWorkspace[] => {
  const result: FlatWorkspace[] = [];
  
  workspaces.forEach(workspace => {
    result.push({
      ...workspace,
      level,
      _expanded: expandedIds.has(workspace.id)
    });
    
    if (workspace.children && expandedIds.has(workspace.id)) {
      result.push(
        ...flattenWorkspaces(workspace.children, expandedIds, level + 1)
      );
    }
  });
  
  return result;
};

// 모든 폴더 ID 추출
export const getAllFolderIds = (workspaces: Workspace[]): string[] => {
  const ids: string[] = [];
  
  const traverse = (items: Workspace[]) => {
    items.forEach(item => {
      if (item.is_folder) {
        ids.push(item.id);
      }
      if (item.children) {
        traverse(item.children);
      }
    });
  };
  
  traverse(workspaces);
  return ids;
};

// 검색어 하이라이트
export const highlightText = (
  text: string,
  searchTerm: string
): React.ReactNode => {
  if (!searchTerm) return text;
  
  const regex = new RegExp(`(${searchTerm})`, 'gi');
  const parts = text.split(regex);
  
  return parts.map((part, i) => 
    regex.test(part) ? (
      <mark key={i} className="bg-yellow-200 text-gray-900">
        {part}
      </mark>
    ) : (
      part
    )
  );
};
```

---

## 🎨 스타일링 가이드

### Tailwind 설정

```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      animation: {
        'slide-in': 'slideIn 200ms ease-out',
        'fade-in': 'fadeIn 200ms ease-out',
      },
      keyframes: {
        slideIn: {
          '0%': { transform: 'translateX(-100%)' },
          '100%': { transform: 'translateX(0)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
};
```

### CSS 변수

```css
/* globals.css */
:root {
  /* Sidebar dimensions */
  --sidebar-width-expanded: 280px;
  --sidebar-width-collapsed: 60px;
  --sidebar-transition: 200ms;
  
  /* Z-index layers */
  --z-sidebar: 10;
  --z-sidebar-backdrop: 9;
  --z-tooltip: 50;
  
  /* Spacing */
  --sidebar-padding: 12px;
  --item-padding: 8px;
  --item-indent: 16px;
}

/* Dark mode support */
@media (prefers-color-scheme: dark) {
  :root {
    --sidebar-bg: #1a1a1a;
    --sidebar-border: #333;
    --item-hover: #2a2a2a;
  }
}
```

---

## 🧪 테스트

### 유닛 테스트 예제

```typescript
// __tests__/EnhancedSidebar.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EnhancedSidebar } from '@/components/workspace/EnhancedSidebar';

describe('EnhancedSidebar', () => {
  const mockWorkspaces = [
    {
      id: '1',
      name: 'Project Alpha',
      is_folder: true,
      children: [
        { id: '1-1', name: 'Dashboard' },
        { id: '1-2', name: 'Analytics' }
      ]
    }
  ];
  
  it('renders workspaces correctly', () => {
    render(
      <EnhancedSidebar 
        workspaces={mockWorkspaces}
        selectedWorkspace={null}
        onSelectWorkspace={jest.fn()}
      />
    );
    
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
  });
  
  it('filters workspaces on search', async () => {
    render(
      <EnhancedSidebar 
        workspaces={mockWorkspaces}
        selectedWorkspace={null}
        onSelectWorkspace={jest.fn()}
      />
    );
    
    const searchInput = screen.getByPlaceholderText('Search (⌘K)');
    await userEvent.type(searchInput, 'Dashboard');
    
    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.queryByText('Analytics')).not.toBeInTheDocument();
  });
  
  it('handles keyboard navigation', async () => {
    const onSelect = jest.fn();
    render(
      <EnhancedSidebar 
        workspaces={mockWorkspaces}
        selectedWorkspace={null}
        onSelectWorkspace={onSelect}
      />
    );
    
    // Focus first item
    fireEvent.keyDown(document, { key: 'ArrowDown' });
    
    // Select with Enter
    fireEvent.keyDown(document, { key: 'Enter' });
    
    expect(onSelect).toHaveBeenCalledWith(mockWorkspaces[0]);
  });
});
```

---

## 📈 성능 최적화

### 1. 가상 스크롤 (많은 워크스페이스)

```typescript
import { VariableSizeList } from 'react-window';

const VirtualWorkspaceList = ({ workspaces, height }) => {
  const getItemSize = (index: number) => {
    // Calculate based on item depth and children
    return 32; // Base height
  };
  
  return (
    <VariableSizeList
      height={height}
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

### 2. 검색 디바운싱

```typescript
import { useDebouncedValue } from '@/hooks/useDebouncedValue';

const SidebarSearch = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebouncedValue(searchTerm, 300);
  
  // Use debouncedSearch for filtering
  const filtered = useWorkspaceFilter(workspaces, debouncedSearch);
};
```

### 3. 메모이제이션

```typescript
// Memoize expensive computations
const memoizedFilter = useMemo(
  () => filterWorkspaces(workspaces, searchTerm),
  [workspaces, searchTerm]
);

// Memoize components
const MemoizedItem = React.memo(WorkspaceItem, (prev, next) => {
  return (
    prev.workspace.id === next.workspace.id &&
    prev.isSelected === next.isSelected
  );
});
```

---

## 🚨 일반적인 문제 해결

### 문제: 툴팁이 잘못된 위치에 표시됨
```typescript
// Solution: Use Floating UI for proper positioning
import { useFloating, autoUpdate } from '@floating-ui/react';

const { refs, floatingStyles } = useFloating({
  whileElementsMounted: autoUpdate,
  // ... middleware
});
```

### 문제: 키보드 네비게이션이 스크롤되지 않음
```typescript
// Solution: Scroll focused item into view
useEffect(() => {
  const element = document.querySelector(`[data-index="${focusedIndex}"]`);
  element?.scrollIntoView({ 
    block: 'nearest',
    behavior: 'smooth' 
  });
}, [focusedIndex]);
```

### 문제: 모바일에서 스와이프 제스처가 작동하지 않음
```typescript
// Solution: Add touch event handlers
const handleTouchStart = (e: TouchEvent) => {
  startX = e.touches[0].clientX;
};

const handleTouchEnd = (e: TouchEvent) => {
  const endX = e.changedTouches[0].clientX;
  if (startX - endX > 50) {
    // Swipe left - close sidebar
    toggleCollapse();
  }
};
```

---

## 📚 추가 리소스

- [React Aria Components](https://react-spectrum.adobe.com/react-aria/)
- [Floating UI Documentation](https://floating-ui.com/)
- [React Window Documentation](https://react-window.now.sh/)
- [Zustand Documentation](https://github.com/pmndrs/zustand)
- [Tailwind CSS Documentation](https://tailwindcss.com/)

---

*작성일: 2024년 1월*
*작성자: MAX Lab Frontend Team*
*버전: 1.0.0*