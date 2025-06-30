# Test Plan for Drag and Drop Fix

## Test Scenarios

### 1. Basic Drag and Drop
- [ ] Drag an equipment node from the sidebar and drop it on the canvas
- [ ] Verify the node appears exactly at the drop position (not in the center)
- [ ] Test with different equipment types

### 2. Zoom Level Tests
- [ ] Zoom out to 50% and test drag and drop
- [ ] Zoom in to 150% and test drag and drop
- [ ] Verify nodes appear at the correct position regardless of zoom level

### 3. Pan Position Tests
- [ ] Pan the canvas to the right and test drag and drop
- [ ] Pan the canvas down and test drag and drop
- [ ] Verify nodes appear at the drop position, not offset by the pan amount

### 4. Different Node Types
- [ ] Test dragging equipment nodes
- [ ] Test dragging text nodes
- [ ] Test dragging group nodes
- [ ] Test dragging template nodes

### 5. Edge Cases
- [ ] Drop at the very edge of the canvas
- [ ] Drop while the canvas is animating (during pan/zoom)
- [ ] Drop multiple nodes in quick succession

## Expected Behavior
- Nodes should appear exactly where the mouse cursor is when dropped
- The position should be accurate regardless of zoom level or pan position
- No nodes should appear in the center unless explicitly dropped there

## How to Run Tests
1. Start the frontend development server
2. Navigate to the Process Flow Editor
3. Follow each test scenario above
4. Check off items as they pass