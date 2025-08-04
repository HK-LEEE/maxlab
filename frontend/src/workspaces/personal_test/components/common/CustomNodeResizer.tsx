import React, { useState, useRef, useCallback, useEffect } from 'react';

/**
 * CustomNodeResizer - ReactFlow NodeResizer 완전 호환 대체제
 * ResizeObserver 없이 순수 마우스 이벤트로 리사이즈 기능 구현
 */

export interface CustomNodeResizerProps {
  /** 리사이즈 핸들 색상 */
  color?: string;
  /** 선택된 노드에서만 표시 여부 */
  isVisible?: boolean;
  /** 최소 너비 */
  minWidth?: number;
  /** 최소 높이 */
  minHeight?: number;
  /** 최대 너비 */
  maxWidth?: number;
  /** 최대 높이 */
  maxHeight?: number;
  /** 핸들 스타일 커스터마이징 */
  handleStyle?: React.CSSProperties;
  /** 리사이즈 시작 콜백 */
  onResizeStart?: () => void;
  /** 리사이즈 종료 콜백 */
  onResizeEnd?: () => void;
  /** 리사이즈 진행 중 콜백 - ReactFlow NodeResizer와 동일한 형태 */
  onResize?: (event: MouseEvent, params: { 
    width: number; 
    height: number; 
    x: number; 
    y: number; 
  }) => void;
}

type ResizeDirection = 
  | 'top-left' | 'top' | 'top-right'
  | 'left' | 'right'
  | 'bottom-left' | 'bottom' | 'bottom-right';

interface ResizeState {
  isResizing: boolean;
  direction: ResizeDirection | null;
  startMousePos: { x: number; y: number };
  startNodeBounds: { x: number; y: number; width: number; height: number };
  nodeElement: HTMLElement | null;
}

export const CustomNodeResizer: React.FC<CustomNodeResizerProps> = ({
  color = '#3b82f6',
  isVisible = true,
  minWidth = 50,
  minHeight = 50,
  maxWidth,
  maxHeight,
  handleStyle = {},
  onResizeStart,
  onResizeEnd,
  onResize,
}) => {
  const [resizeState, setResizeState] = useState<ResizeState>({
    isResizing: false,
    direction: null,
    startMousePos: { x: 0, y: 0 },
    startNodeBounds: { x: 0, y: 0, width: 0, height: 0 },
    nodeElement: null,
  });

  // ReactFlow 노드 요소 찾기
  const findNodeElement = useCallback((target: HTMLElement): HTMLElement | null => {
    let element = target;
    while (element && !element.classList.contains('react-flow__node')) {
      element = element.parentElement as HTMLElement;
      if (!element) break;
    }
    return element;
  }, []);

  // 리사이즈 시작
  const handleMouseDown = useCallback((e: React.MouseEvent, direction: ResizeDirection) => {
    // Debug console log removed
    e.preventDefault();
    e.stopPropagation();

    const nodeElement = findNodeElement(e.currentTarget as HTMLElement);
    // Debug console log removed
    
    if (!nodeElement) {
      console.error('❌ Could not find ReactFlow node element');
      return;
    }

    const rect = nodeElement.getBoundingClientRect();
    console.log('📏 Node bounds:', rect);
    
    const newResizeState = {
      isResizing: true,
      direction,
      startMousePos: { x: e.clientX, y: e.clientY },
      startNodeBounds: {
        x: rect.left,
        y: rect.top,
        width: rect.width,
        height: rect.height,
      },
      nodeElement,
    };
    
    console.log('🔄 Setting resize state:', newResizeState);
    setResizeState(newResizeState);

    console.log('🚀 Calling onResizeStart');
    onResizeStart?.();
  }, [findNodeElement, onResizeStart]);

  // 마우스 이동 처리
  const handleMouseMove = useCallback((e: MouseEvent) => {
    console.log('🖱️ Mouse move event', { 
      isResizing: resizeState.isResizing,
      hasElement: !!resizeState.nodeElement,
      direction: resizeState.direction 
    });
    
    if (!resizeState.isResizing || !resizeState.nodeElement || !resizeState.direction) {
      return;
    }

    const deltaX = e.clientX - resizeState.startMousePos.x;
    const deltaY = e.clientY - resizeState.startMousePos.y;

    let newWidth = resizeState.startNodeBounds.width;
    let newHeight = resizeState.startNodeBounds.height;
    
    // ReactFlow 좌표계에서의 노드 위치 (DOM 좌표가 아닌 ReactFlow 내부 좌표)
    const currentTransform = resizeState.nodeElement.style.transform;
    const translateMatch = currentTransform.match(/translate\(([^)]+)\)/);
    let currentX = 0;
    let currentY = 0;
    
    if (translateMatch) {
      const [x, y] = translateMatch[1].split(',').map(v => parseFloat(v.trim()));
      currentX = x || 0;
      currentY = y || 0;
    }

    let newX = currentX;
    let newY = currentY;

    // 방향별 크기 및 위치 계산
    switch (resizeState.direction) {
      case 'top-left':
        newWidth = Math.max(minWidth, resizeState.startNodeBounds.width - deltaX);
        newHeight = Math.max(minHeight, resizeState.startNodeBounds.height - deltaY);
        // 크기가 줄어든 만큼 위치 조정
        newX = currentX + (resizeState.startNodeBounds.width - newWidth);
        newY = currentY + (resizeState.startNodeBounds.height - newHeight);
        break;
      case 'top':
        newHeight = Math.max(minHeight, resizeState.startNodeBounds.height - deltaY);
        newY = currentY + (resizeState.startNodeBounds.height - newHeight);
        break;
      case 'top-right':
        newWidth = Math.max(minWidth, resizeState.startNodeBounds.width + deltaX);
        newHeight = Math.max(minHeight, resizeState.startNodeBounds.height - deltaY);
        newY = currentY + (resizeState.startNodeBounds.height - newHeight);
        break;
      case 'left':
        newWidth = Math.max(minWidth, resizeState.startNodeBounds.width - deltaX);
        newX = currentX + (resizeState.startNodeBounds.width - newWidth);
        break;
      case 'right':
        newWidth = Math.max(minWidth, resizeState.startNodeBounds.width + deltaX);
        break;
      case 'bottom-left':
        newWidth = Math.max(minWidth, resizeState.startNodeBounds.width - deltaX);
        newHeight = Math.max(minHeight, resizeState.startNodeBounds.height + deltaY);
        newX = currentX + (resizeState.startNodeBounds.width - newWidth);
        break;
      case 'bottom':
        newHeight = Math.max(minHeight, resizeState.startNodeBounds.height + deltaY);
        break;
      case 'bottom-right':
        newWidth = Math.max(minWidth, resizeState.startNodeBounds.width + deltaX);
        newHeight = Math.max(minHeight, resizeState.startNodeBounds.height + deltaY);
        break;
    }

    // 최대 크기 제약 적용
    if (maxWidth) newWidth = Math.min(newWidth, maxWidth);
    if (maxHeight) newHeight = Math.min(newHeight, maxHeight);

    // 즉시 DOM 업데이트 (시각적 피드백)
    resizeState.nodeElement.style.width = `${newWidth}px`;
    resizeState.nodeElement.style.height = `${newHeight}px`;
    
    // 위치가 변경되는 경우에만 transform 업데이트
    if (newX !== currentX || newY !== currentY) {
      resizeState.nodeElement.style.transform = 
        currentTransform.replace(/translate\([^)]+\)/, `translate(${newX}px, ${newY}px)`);
    }

    // ReactFlow 호환 콜백 실행
    onResize?.(e, {
      width: newWidth,
      height: newHeight,
      x: newX,
      y: newY,
    });
  }, [resizeState, minWidth, minHeight, maxWidth, maxHeight, onResize]);

  // 마우스 업 처리
  const handleMouseUp = useCallback(() => {
    if (resizeState.isResizing) {
      setResizeState(prev => ({
        ...prev,
        isResizing: false,
        direction: null,
        nodeElement: null,
      }));
      onResizeEnd?.();
    }
  }, [resizeState.isResizing, onResizeEnd]);

  // 전역 마우스 이벤트 등록/해제
  useEffect(() => {
    console.log('🔄 useEffect for event listeners', { isResizing: resizeState.isResizing });
    
    if (resizeState.isResizing) {
      console.log('📝 Adding global mouse event listeners');
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        console.log('🗑️ Removing global mouse event listeners');
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [resizeState.isResizing, handleMouseMove, handleMouseUp]);

  // 기본 핸들 스타일
  const baseHandleStyle: React.CSSProperties = {
    position: 'absolute',
    backgroundColor: color,
    border: '2px solid #fff',
    borderRadius: '2px',
    width: '12px',
    height: '12px',
    zIndex: 9999, // 매우 높은 z-index
    pointerEvents: 'auto',
    userSelect: 'none',
    touchAction: 'none',
    ...handleStyle,
  };

  // 8방향 리사이즈 핸들들
  const handles: { direction: ResizeDirection; style: React.CSSProperties; cursor: string }[] = [
    // 모서리 핸들
    { 
      direction: 'top-left', 
      style: { ...baseHandleStyle, top: '-6px', left: '-6px' }, 
      cursor: 'nw-resize' 
    },
    { 
      direction: 'top-right', 
      style: { ...baseHandleStyle, top: '-6px', right: '-6px' }, 
      cursor: 'ne-resize' 
    },
    { 
      direction: 'bottom-left', 
      style: { ...baseHandleStyle, bottom: '-6px', left: '-6px' }, 
      cursor: 'sw-resize' 
    },
    { 
      direction: 'bottom-right', 
      style: { ...baseHandleStyle, bottom: '-6px', right: '-6px' }, 
      cursor: 'se-resize' 
    },
    // 가장자리 핸들
    { 
      direction: 'top', 
      style: { ...baseHandleStyle, top: '-6px', left: '50%', transform: 'translateX(-50%)' }, 
      cursor: 'n-resize' 
    },
    { 
      direction: 'bottom', 
      style: { ...baseHandleStyle, bottom: '-6px', left: '50%', transform: 'translateX(-50%)' }, 
      cursor: 's-resize' 
    },
    { 
      direction: 'left', 
      style: { ...baseHandleStyle, left: '-6px', top: '50%', transform: 'translateY(-50%)' }, 
      cursor: 'w-resize' 
    },
    { 
      direction: 'right', 
      style: { ...baseHandleStyle, right: '-6px', top: '50%', transform: 'translateY(-50%)' }, 
      cursor: 'e-resize' 
    },
  ];

  // 핸들 컨테이너 ref
  const handleContainerRef = useRef<HTMLDivElement>(null);
  
  // 네이티브 이벤트 리스너 설정
  useEffect(() => {
    const container = handleContainerRef.current;
    if (!container) return;
    
    console.log('🔧 Setting up native event delegation');
    
    const handleNativeMouseDown = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const direction = target.getAttribute('data-direction') as ResizeDirection;
      
      if (direction) {
        console.log('🎯 Native mousedown detected for:', direction);
        e.preventDefault();
        e.stopPropagation();
        
        // React SyntheticEvent로 변환
        const syntheticEvent = {
          ...e,
          currentTarget: target,
          preventDefault: () => e.preventDefault(),
          stopPropagation: () => e.stopPropagation(),
          clientX: e.clientX,
          clientY: e.clientY,
        } as any;
        
        handleMouseDown(syntheticEvent, direction);
      }
    };
    
    container.addEventListener('mousedown', handleNativeMouseDown, true);
    
    return () => {
      container.removeEventListener('mousedown', handleNativeMouseDown, true);
    };
  }, [handleMouseDown]);

  // 표시하지 않는 경우 렌더링 안함 - 모든 hooks 호출 후에 조건부 반환
  if (!isVisible) {
    return null;
  }

  return (
    <div 
      ref={handleContainerRef}
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        pointerEvents: 'none', // 컨테이너 자체는 이벤트 무시
      }}
    >
      {handles.map(({ direction, style, cursor }) => (
        <div
          key={direction}
          style={{ 
            ...style, 
            cursor,
            pointerEvents: 'auto', // 핸들만 이벤트 수신
          }}
          onMouseEnter={() => console.log('🖱️ Handle mouse enter:', direction)}
          onMouseLeave={() => console.log('🖱️ Handle mouse leave:', direction)}
          data-direction={direction}
        />
      ))}
    </div>
  );
};