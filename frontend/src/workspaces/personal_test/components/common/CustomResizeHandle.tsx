import React, { useState, useRef, useCallback } from 'react';

interface CustomResizeHandleProps {
  nodeId: string;
  onResize: (width: number, height: number) => void;
  minWidth?: number;
  minHeight?: number;
  isVisible?: boolean;
}

export const CustomResizeHandle: React.FC<CustomResizeHandleProps> = ({
  nodeId,
  onResize,
  minWidth = 200,
  minHeight = 120,
  isVisible = true,
}) => {
  // CRITICAL: All hooks must be called before any conditional returns
  const [isResizing, setIsResizing] = useState(false);
  const startPosRef = useRef({ x: 0, y: 0 });
  const startSizeRef = useRef({ width: 0, height: 0 });
  const nodeElementRef = useRef<HTMLElement | null>(null);
  
  // Stable refs for callback functions to avoid dependency issues
  const onResizeRef = useRef(onResize);
  const minWidthRef = useRef(minWidth);
  const minHeightRef = useRef(minHeight);
  
  // Update refs when props change
  onResizeRef.current = onResize;
  minWidthRef.current = minWidth;
  minHeightRef.current = minHeight;

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    
    console.log('🔍 Resize handle clicked:', { nodeId });
    setIsResizing(true);
    
    // Enhanced DOM element selection with ReactFlow specific attributes
    let element: HTMLElement | null = null;
    
    // Method 1: Use closest() to find ReactFlow node with multiple selectors
    element = e.currentTarget.closest('.react-flow__node') as HTMLElement;
    
    // Method 2: Try ReactFlow specific data attributes
    if (!element) {
      element = e.currentTarget.closest(`[data-id="${nodeId}"]`) as HTMLElement;
    }
    
    // Method 3: Manual traversal with more specific class checks
    if (!element) {
      let current = e.currentTarget.parentElement;
      while (current && 
             !current.classList.contains('react-flow__node') && 
             !current.hasAttribute('data-id')) {
        current = current.parentElement;
      }
      element = current as HTMLElement;
    }
    
    // Method 4: Global querySelector with ReactFlow node selectors
    if (!element) {
      element = document.querySelector(`.react-flow__node[data-id="${nodeId}"]`) as HTMLElement;
    }
    
    // Method 5: Find by node type specific classes
    if (!element) {
      element = document.querySelector(`[data-id="${nodeId}"].react-flow__node`) as HTMLElement;
    }
    
    if (!element) {
      console.error('❌ Could not find ReactFlow node element for resize', { 
        nodeId,
        currentTarget: e.currentTarget,
        parentElement: e.currentTarget.parentElement 
      });
      setIsResizing(false);
      return;
    }
    
    console.log('✅ Found node element:', {
      element,
      className: element.className,
      dataId: element.getAttribute('data-id'),
      bounds: element.getBoundingClientRect()
    });
    
    nodeElementRef.current = element as HTMLElement;
    const rect = element.getBoundingClientRect();
    startPosRef.current = { x: e.clientX, y: e.clientY };
    startSizeRef.current = { width: rect.width, height: rect.height };

    const handleMouseMove = (moveEvent: MouseEvent) => {
      if (!nodeElementRef.current) return;
      
      const deltaX = moveEvent.clientX - startPosRef.current.x;
      const deltaY = moveEvent.clientY - startPosRef.current.y;
      
      let newWidth = startSizeRef.current.width;
      let newHeight = startSizeRef.current.height;
      
      // Bottom-right resize (only supported direction)
      newWidth = Math.max(minWidthRef.current, startSizeRef.current.width + deltaX);
      newHeight = Math.max(minHeightRef.current, startSizeRef.current.height + deltaY);
      
      console.log('📏 Resizing:', { 
        newWidth, 
        newHeight, 
        deltaX, 
        deltaY,
        mousePos: { x: moveEvent.clientX, y: moveEvent.clientY }
      });
      
      // 하이브리드 접근법: 즉각적인 DOM 조작 + ReactFlow 상태 업데이트
      
      // 1. 즉각적인 시각적 피드백을 위한 DOM 조작
      if (nodeElementRef.current) {
        nodeElementRef.current.style.width = `${newWidth}px`;
        nodeElementRef.current.style.height = `${newHeight}px`;
        console.log('🎨 Applied immediate DOM resize:', { newWidth, newHeight });
      }
      
      // 2. ReactFlow 상태 업데이트 (throttled)
      onResizeRef.current(newWidth, newHeight);
    };

    const handleMouseUp = () => {
      console.log('🏁 Resize operation completed for node:', nodeId);
      setIsResizing(false);
      
      // Final ReactFlow state update
      if (nodeElementRef.current) {
        const finalRect = nodeElementRef.current.getBoundingClientRect();
        console.log('📐 Final dimensions:', {
          nodeId,
          width: finalRect.width,
          height: finalRect.height
        });
        onResizeRef.current(finalRect.width, finalRect.height);
      }
      
      nodeElementRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  }, [nodeId]); // nodeId는 필수 의존성

  const handleStyle = {
    position: 'absolute' as const,
    backgroundColor: isResizing ? '#ef4444' : '#3b82f6', // 더 눈에 띄는 빨간색으로 변경
    border: '3px solid #fff',
    borderRadius: '4px',
    opacity: 1,
    zIndex: 9999, // 매우 높은 z-index
    cursor: 'se-resize',
    pointerEvents: 'auto' as const,
    boxShadow: isResizing 
      ? '0 4px 12px rgba(239, 68, 68, 0.5)' 
      : '0 3px 8px rgba(59, 130, 246, 0.6)',
    // 크기 변화 제거 - 일관된 16px 크기 유지
    width: '20px', // 더 큰 크기로 테스트
    height: '20px',
    // 명확한 이벤트 수신 보장
    userSelect: 'none' as const,
    touchAction: 'none' as const,
  };

  // Conditional rendering AFTER all hooks to prevent React Hook rule violations
  if (!isVisible) {
    return null;
  }

  return (
    <>
      {/* Enhanced resize handle with better visibility */}
      <div
        style={{
          ...handleStyle,
          bottom: '-8px',
          right: '-8px',
        }}
        onMouseDown={handleMouseDown}
        onMouseEnter={() => console.log('🖱️ Handle mouse enter')}
        onMouseLeave={() => console.log('🖱️ Handle mouse leave')}
        onClick={(e) => {
          console.log('🖱️ Handle clicked');
          e.preventDefault();
          e.stopPropagation();
        }}
        title="Drag to resize node"
        data-testid="resize-handle"
      />
    </>
  );
};