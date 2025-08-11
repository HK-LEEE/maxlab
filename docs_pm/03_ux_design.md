# Process Monitoring Feature - UI/UX Design Documentation
**Maxlab Chemical Workspace | Version 1.0**

## Table of Contents
1. [Design Principles & Guidelines](#design-principles--guidelines)
2. [User Journey Maps](#user-journey-maps)
3. [Information Architecture](#information-architecture)
4. [Wireframes & Layouts](#wireframes--layouts)
5. [Component Library Specifications](#component-library-specifications)
6. [Interaction Patterns](#interaction-patterns)
7. [Theme Integration](#theme-integration)
8. [Accessibility Guidelines](#accessibility-guidelines)
9. [Responsive Design Strategy](#responsive-design-strategy)
10. [Additional UX Features](#additional-ux-features)

---

## Design Principles & Guidelines

### Core Design Principles

#### 1. **Domain-First Design**
- **Chemical Process Clarity**: Visual elements should mirror real chemical processes
- **Contextual Awareness**: UI adapts to process complexity and user expertise level
- **Process Flow Logic**: Information hierarchy follows chemical process sequences

#### 2. **Safety-Critical Interface**
- **Error Prevention**: Clear visual cues prevent critical mistakes
- **Status Transparency**: Process states are immediately recognizable
- **Alert Hierarchy**: Critical alerts override all other interface elements
- **Confirmation Patterns**: Multi-step confirmation for critical actions

#### 3. **Operational Efficiency**
- **Minimal Cognitive Load**: Reduce mental overhead for complex operations
- **Quick Recognition**: Use familiar chemical engineering symbols and conventions
- **Task-Oriented Layout**: Screen organization matches workflow patterns
- **Progressive Disclosure**: Advanced features available but not overwhelming

#### 4. **Collaborative Intelligence**
- **Multi-User Awareness**: Clear indicators of team member activities
- **Knowledge Sharing**: Built-in documentation and commenting systems
- **Role-Based Interface**: Different views for engineers, operators, and managers

### Visual Design Philosophy

#### Metaphors & Mental Models
- **Process Flow Diagram**: Primary metaphor for system visualization
- **Control Panel**: Secondary metaphor for monitoring interfaces
- **Laboratory Notebook**: Tertiary metaphor for documentation and comments

#### Information Density Management
- **Contextual Density**: High density for monitoring, lower for editing
- **Adaptive Zoom**: Detail level adjusts to user focus area
- **Layered Information**: Primary, secondary, and tertiary information layers

---

## User Journey Maps

### Primary User Personas

#### 1. **Chemical Engineer (Primary Designer)**
**Role**: Creates and optimizes process flows
**Technical Level**: High
**Primary Goals**: Design efficient processes, optimize parameters, ensure safety

**User Journey - Process Design Flow**:
```
1. Access Flow Management → Browse existing processes
2. Create New Flow → Select from templates or start blank
3. Design Process → Drag/drop components, configure parameters
4. Validate Design → Run simulations, check safety constraints
5. Collaborate → Share with team, gather feedback
6. Deploy → Move to monitoring phase
```

**Pain Points**:
- Complex parameter configuration
- Difficulty visualizing process interactions
- Need for real-time validation feedback

#### 2. **Process Operator (Monitor & Control)**
**Role**: Monitors active processes and responds to alerts
**Technical Level**: Medium
**Primary Goals**: Maintain process stability, respond to alerts, document incidents

**User Journey - Process Monitoring Flow**:
```
1. Access Monitoring Dashboard → Review overall system status
2. Focus on Active Processes → Drill down to specific flows
3. Monitor Real-time Data → Track KPIs and warning indicators
4. Respond to Alerts → Acknowledge, investigate, take action
5. Document Actions → Record decisions and outcomes
6. Communicate → Update team on process status
```

**Pain Points**:
- Information overload during critical events
- Difficulty prioritizing multiple alerts
- Need for mobile access during facility rounds

#### 3. **Process Manager (Strategic Oversight)**
**Role**: Oversees multiple processes and teams
**Technical Level**: Medium
**Primary Goals**: Optimize overall efficiency, ensure compliance, manage resources

**User Journey - Strategic Management Flow**:
```
1. Access Executive Dashboard → Review high-level metrics
2. Analyze Performance Trends → Identify optimization opportunities
3. Review Team Activities → Monitor collaboration and productivity
4. Compliance Reporting → Generate and review regulatory reports
5. Resource Planning → Allocate team and equipment resources
6. Strategic Decisions → Approve process changes and investments
```

**Pain Points**:
- Need for aggregated view across multiple processes
- Difficulty tracking team productivity and collaboration
- Requirement for executive-level reporting

### Journey Mapping Insights

#### Critical Moments
1. **Process Failure Alert**: Must provide immediate, clear action guidance
2. **Parameter Modification**: Requires confirmation and impact visualization
3. **Team Handoff**: Seamless context transfer between shifts
4. **Compliance Review**: Easy access to audit trail and documentation

#### Emotional Journey
- **Confidence**: Clear visual feedback builds user confidence
- **Control**: Users need to feel in control of complex processes
- **Trust**: System reliability builds user trust over time
- **Collaboration**: Positive team interaction enhances job satisfaction

---

## Information Architecture

### Navigation Hierarchy

```
Chemical Workspace
├── Process Monitoring (Main Feature)
│   ├── Flow Management (Primary Screen)
│   │   ├── My Flows
│   │   ├── Shared Flows
│   │   ├── Templates
│   │   └── Archive
│   ├── Flow Editor (Design Screen)
│   │   ├── Component Library
│   │   ├── Properties Panel
│   │   ├── Validation Tools
│   │   └── Collaboration Panel
│   └── Monitoring Flow (Operations Screen)
│       ├── Live Dashboard
│       ├── Alert Center
│       ├── Historical Data
│       └── Reports
├── Shared Resources
│   ├── Templates Library
│   ├── Component Catalog
│   └── Documentation
└── Settings
    ├── Workspace Preferences
    ├── User Management
    └── Integration Settings
```

### Content Organization Strategy

#### Primary Content Types
1. **Process Flows**: Executable process diagrams
2. **Components**: Reusable process elements (pumps, reactors, sensors)
3. **Data Streams**: Real-time and historical process data
4. **Documentation**: Process descriptions, SOPs, comments
5. **Alerts**: System notifications and warnings

#### Information Relationships
- **Hierarchical**: Workspace → Process → Component → Parameter
- **Network**: Component connections and data flows
- **Temporal**: Historical data and trend analysis
- **Collaborative**: User activities and shared resources

### Search & Discovery Strategy

#### Search Functionality
- **Global Search**: Across all flows, components, and documentation
- **Filtered Search**: By type, author, date, status, tags
- **Smart Suggestions**: Based on user behavior and context
- **Semantic Search**: Understanding chemical engineering terminology

#### Content Tagging System
- **Process Type**: Batch, continuous, hybrid
- **Industry Category**: Petrochemical, pharmaceutical, food processing
- **Safety Level**: Low risk, hazardous, critical
- **Status**: Draft, active, archived, deprecated
- **Collaboration**: Personal, team, organization

---

## Wireframes & Layouts

### Screen 1: Flow Management Interface

#### Layout Structure
```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: Maxlab Chemical Workspace | Process Monitoring              │
├─────────────────────────────────────────────────────────────────────┤
│ Navigation: [Flow Management*] [Flow Editor] [Monitoring]           │
├─────┬───────────────────────────────────────────────────────────────┤
│Side │ Main Content Area                                             │
│bar  │ ┌─────────────────────────────────────────────────────────┐   │
│     │ │ Search & Filter Bar                                     │   │
│Fil- │ ├─────────────────────────────────────────────────────────┤   │
│ters │ │ Process Flow Cards Grid                                 │   │
│     │ │ ┌──────┐ ┌──────┐ ┌──────┐ ┌──────┐                    │   │
│     │ │ │Flow 1│ │Flow 2│ │Flow 3│ │ New  │                    │   │
│Cat- │ │ │[IMG] │ │[IMG] │ │[IMG] │ │ Flow │                    │   │
│ego- │ │ │Title │ │Title │ │Title │ │  +   │                    │   │
│ries │ │ │Stats │ │Stats │ │Stats │ │      │                    │   │
│     │ │ └──────┘ └──────┘ └──────┘ └──────┘                    │   │
│     │ │                                                         │   │
│Tag  │ │ [More flows in grid layout...]                          │   │
│Fil- │ │                                                         │   │
│ters │ └─────────────────────────────────────────────────────────┘   │
├─────┴───────────────────────────────────────────────────────────────┤
│ Footer: Status Bar | User Info | Theme Toggle                      │
└─────────────────────────────────────────────────────────────────────┘
```

#### Flow Card Design Specifications
**Dimensions**: 280px × 200px
**Components**:
- **Thumbnail**: 280px × 120px process flow preview
- **Title**: 18px font, truncated with ellipsis
- **Metadata**: Created date, author, last modified
- **Status Indicator**: Color-coded (draft/active/archived)
- **Quick Actions**: Edit, duplicate, delete (hover reveal)
- **Collaboration Indicators**: User avatars for shared flows

### Screen 2: Flow Editor Interface

#### Layout Structure
```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: Flow Name | Save Status | Collaboration Indicators           │
├─────────────────────────────────────────────────────────────────────┤
│ Toolbar: [Tools] [Zoom] [Undo/Redo] [Validate] [Share] [Save]      │
├──────┬──────────────────────────────────────────────────────┬───────┤
│Comp- │ Main Canvas Area (ReactFlow)                         │Proper-│
│onent │ ┌────────────────────────────────────────────────┐   │ties   │
│Lib-  │ │ Process Flow Diagram                           │   │Panel  │
│rary  │ │                                                │   │       │
│      │ │ [Pump]─────>[Reactor]─────>[Separator]        │   │Select-│
│      │ │    │           │              │                │   │ed:    │
│Cate- │ │    └─>[Sensor] └─>[Sensor]   └─>[Sensor]     │   │Pump#1 │
│gories│ │                                                │   │       │
│      │ │                                                │   │Param- │
│- Pro-│ │                                                │   │eters: │
│cessing│ │                                               │   │- Flow │
│- Sens-│ │                                               │   │- Pres │
│ors   │ │                                               │   │- Temp │
│- Con- │ │                                               │   │       │
│trols  │ │                                               │   │Valid- │
│      │ └────────────────────────────────────────────────┘   │ation: │
│      │                                                      │Status │
├──────┴──────────────────────────────────────────────────────┴───────┤
│ Status Bar: Validation Status | Collaboration Status | Zoom Level  │
└─────────────────────────────────────────────────────────────────────┘
```

#### Canvas Interaction Design
**Grid System**: 20px grid with snap-to-grid functionality
**Node Design**:
- **Standard Size**: 120px × 80px
- **Mini Size**: 60px × 40px (for simple components)
- **Large Size**: 200px × 120px (for complex equipment)
- **Connection Points**: 8px circles on node borders
- **Selection State**: 2px border with theme accent color

### Screen 3: Monitoring Flow Interface

#### Layout Structure
```
┌─────────────────────────────────────────────────────────────────────┐
│ Header: Process Name | Overall Status | Time Range Selector         │
├─────────────────────────────────────────────────────────────────────┤
│ Alert Bar: [🚨 2 Critical] [⚠️ 5 Warning] [ℹ️ 12 Info]              │
├─────┬───────────────────────────────────────────────────────────────┤
│Dash │ Main Monitoring Area                                          │
│board│ ┌─────────────────────────────────────────────────────────┐   │
│     │ │ Live Process Flow View                                  │   │
│KPIs │ │                                                         │   │
│     │ │ [Pump]═══>[Reactor]═══>[Separator]                     │   │
│- Up │ │   ↗95%      ↗850°C      ↗85% Eff                      │   │
│time │ │             ⚠️High       ✅Normal                       │   │
│- Eff│ │                                                         │   │
│icie │ │ Real-time data overlays on process diagram             │   │
│ncy  │ └─────────────────────────────────────────────────────────┘   │
│- Thr│ ┌─────────────────────────────────────────────────────────┐   │
│ough │ │ Time Series Charts                                      │   │
│put  │ │ [Temperature Trend] [Pressure Trend] [Flow Rate]       │   │
│     │ └─────────────────────────────────────────────────────────┘   │
│Ale- │                                                               │
│rts  │                                                               │
│     │                                                               │
│- Cr-│                                                               │
│iti- │                                                               │
│cal  │                                                               │
│- Wa-│                                                               │
│rn-  │                                                               │
│ing  │                                                               │
├─────┴───────────────────────────────────────────────────────────────┤
│ Footer: Data Freshness | Connection Status | Export Options         │
└─────────────────────────────────────────────────────────────────────┘
```

#### Real-time Data Visualization
**Data Update Strategy**: WebSocket connections with 1-second updates for critical parameters
**Visual Indicators**:
- **Normal**: Green indicators (✅)
- **Warning**: Yellow indicators (⚠️)
- **Critical**: Red indicators (🚨)
- **Unknown**: Gray indicators (❓)

---

## Component Library Specifications

### Core Component System

#### 1. **Process Flow Components**

##### Flow Node Component
```typescript
interface FlowNodeProps {
  id: string;
  type: 'pump' | 'reactor' | 'separator' | 'sensor' | 'control';
  label: string;
  status: 'normal' | 'warning' | 'critical' | 'offline';
  data: ProcessData;
  position: { x: number; y: number };
  isSelected: boolean;
  showData: boolean;
}
```

**Visual Specifications**:
- **Border Radius**: 8px for equipment, 50% for sensors
- **Shadow**: 0 2px 8px rgba(0,0,0,0.1) for elevation
- **Status Colors**: 
  - Normal: theme.success
  - Warning: theme.warning  
  - Critical: theme.danger
  - Offline: theme.neutral

##### Connection Component
```typescript
interface ConnectionProps {
  id: string;
  source: string;
  target: string;
  type: 'material' | 'energy' | 'data' | 'control';
  flowRate?: number;
  status: 'active' | 'blocked' | 'reverse';
  animated: boolean;
}
```

**Visual Specifications**:
- **Line Width**: 3px for material, 2px for data/control
- **Animation**: Dashed line animation for active flows
- **Colors**: Different colors per flow type

#### 2. **Dashboard Components**

##### KPI Card Component
```typescript
interface KPICardProps {
  title: string;
  value: number | string;
  unit?: string;
  trend: 'up' | 'down' | 'stable';
  status: 'normal' | 'warning' | 'critical';
  sparkline?: number[];
}
```

**Layout**: 200px × 120px card with trend visualization

##### Alert Component
```typescript
interface AlertProps {
  id: string;
  level: 'info' | 'warning' | 'critical';
  title: string;
  description: string;
  timestamp: Date;
  acknowledged: boolean;
  source: string;
}
```

**Hierarchy**: Critical alerts appear at top with distinct styling

#### 3. **Control Components**

##### Parameter Input Component
```typescript
interface ParameterInputProps {
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  validation: ValidationRule[];
  onChange: (value: number) => void;
}
```

**Features**: Real-time validation, unit conversion, range indicators

#### 4. **Navigation Components**

##### Breadcrumb Component
```typescript
interface BreadcrumbProps {
  items: Array<{
    label: string;
    href: string;
    icon?: IconType;
  }>;
  separator: string;
}
```

**Example**: Home > Chemical Workspace > Process Monitoring > Flow Editor

### Theme Integration Architecture

#### Color Tokens

##### Light Theme
```css
:root {
  /* Primary Colors */
  --color-primary-50: #f0f9ff;
  --color-primary-500: #0ea5e9;
  --color-primary-900: #0c4a6e;
  
  /* Semantic Colors */
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-danger: #ef4444;
  --color-info: #6366f1;
  
  /* Process Status Colors */
  --color-process-normal: #10b981;
  --color-process-warning: #f59e0b;
  --color-process-critical: #ef4444;
  --color-process-offline: #6b7280;
  
  /* Background Colors */
  --color-bg-canvas: #f8fafc;
  --color-bg-sidebar: #ffffff;
  --color-bg-card: #ffffff;
  --color-bg-overlay: rgba(0, 0, 0, 0.5);
}
```

##### Dark Theme
```css
[data-theme="dark"] {
  /* Primary Colors */
  --color-primary-50: #0f1419;
  --color-primary-500: #38bdf8;
  --color-primary-900: #e0f2fe;
  
  /* Semantic Colors */
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-danger: #f87171;
  --color-info: #818cf8;
  
  /* Process Status Colors */
  --color-process-normal: #34d399;
  --color-process-warning: #fbbf24;
  --color-process-critical: #f87171;
  --color-process-offline: #9ca3af;
  
  /* Background Colors */
  --color-bg-canvas: #0f172a;
  --color-bg-sidebar: #1e293b;
  --color-bg-card: #1e293b;
  --color-bg-overlay: rgba(0, 0, 0, 0.8);
}
```

#### Typography System

```css
/* Font Families */
--font-family-primary: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
--font-family-mono: 'JetBrains Mono', 'Fira Code', monospace;

/* Font Sizes */
--font-size-xs: 0.75rem;    /* 12px */
--font-size-sm: 0.875rem;   /* 14px */
--font-size-base: 1rem;     /* 16px */
--font-size-lg: 1.125rem;   /* 18px */
--font-size-xl: 1.25rem;    /* 20px */
--font-size-2xl: 1.5rem;    /* 24px */
--font-size-3xl: 1.875rem;  /* 30px */

/* Font Weights */
--font-weight-normal: 400;
--font-weight-medium: 500;
--font-weight-semibold: 600;
--font-weight-bold: 700;

/* Line Heights */
--line-height-tight: 1.25;
--line-height-normal: 1.5;
--line-height-relaxed: 1.625;
```

#### Spacing System

```css
/* Spacing Scale */
--space-1: 0.25rem;   /* 4px */
--space-2: 0.5rem;    /* 8px */
--space-3: 0.75rem;   /* 12px */
--space-4: 1rem;      /* 16px */
--space-5: 1.25rem;   /* 20px */
--space-6: 1.5rem;    /* 24px */
--space-8: 2rem;      /* 32px */
--space-10: 2.5rem;   /* 40px */
--space-12: 3rem;     /* 48px */
--space-16: 4rem;     /* 64px */

/* Component-Specific Spacing */
--space-canvas-padding: var(--space-4);
--space-sidebar-padding: var(--space-6);
--space-card-padding: var(--space-4);
--space-node-gap: var(--space-8);
```

---

## Interaction Patterns

### Core Interaction Principles

#### 1. **Progressive Disclosure**
**Pattern**: Start with essential information, reveal details on demand
**Implementation**:
- **Flow Cards**: Basic info → hover for details → click for full view
- **Process Nodes**: Icon + label → hover for live data → click for configuration
- **Sidebar**: Collapsed by default → expand for filters and tools

#### 2. **Contextual Actions**
**Pattern**: Actions appear based on user context and selection
**Implementation**:
- **Right-click Menus**: Context-sensitive options
- **Floating Toolbars**: Appear on selection
- **Smart Suggestions**: Based on user patterns

#### 3. **Direct Manipulation**
**Pattern**: Users directly manipulate objects rather than using controls
**Implementation**:
- **Drag & Drop**: Move components, create connections
- **Resize Handles**: Adjust component sizes
- **Inline Editing**: Click to edit labels and values

### Specific Interaction Patterns

#### Flow Editor Interactions

##### Node Manipulation
```
1. Add Node:
   - Drag from component library → canvas
   - Double-click canvas → component selector
   - Keyboard shortcut → quick add dialog

2. Connect Nodes:
   - Drag from connection point → target point
   - Select source → click target (accessibility)
   - Auto-connect similar components

3. Configure Node:
   - Single click → select (properties panel)
   - Double click → inline edit label
   - Right click → context menu
```

##### Canvas Navigation
```
1. Pan:
   - Mouse drag (middle button or space + drag)
   - Touch pan on mobile devices
   - Keyboard arrows with shift

2. Zoom:
   - Mouse wheel
   - Pinch gesture on touch devices
   - Keyboard shortcuts (+/-)
   - Zoom controls in toolbar

3. Select:
   - Single click → select one
   - Ctrl/Cmd + click → multi-select
   - Drag selection box → area select
```

#### Monitoring Interface Interactions

##### Real-time Data Exploration
```
1. Overview → Detail:
   - Dashboard view → click KPI → detailed chart
   - Process diagram → click node → historical data
   - Alert summary → click alert → full details

2. Time Navigation:
   - Time range picker for historical data
   - Real-time/pause toggle
   - Zoom into specific time periods
```

##### Alert Management
```
1. Alert Triage:
   - Sort by priority, time, or source
   - Filter by status or type
   - Bulk acknowledge similar alerts

2. Alert Investigation:
   - Click alert → related data views
   - Drill down to root cause
   - Add comments and actions taken
```

### Animation & Transition Guidelines

#### Motion Principles
1. **Purposeful**: Every animation serves a functional purpose
2. **Natural**: Motions feel physically realistic
3. **Responsive**: Fast enough to feel immediate
4. **Accessible**: Respects user motion preferences

#### Animation Specifications

##### Micro-interactions
```css
/* Hover Effects */
.interactive-element:hover {
  transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}

/* Button Presses */
.button:active {
  transition: transform 0.1s ease-out;
  transform: scale(0.98);
}

/* Loading States */
.loading-spinner {
  animation: spin 1s linear infinite;
}

/* Real-time Data Updates */
.data-update {
  animation: pulse 0.3s ease-out;
}
```

##### Page Transitions
```css
/* Screen Transitions */
.screen-transition {
  animation: slideIn 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Modal Animations */
.modal-enter {
  animation: modalSlideUp 0.3s cubic-bezier(0.4, 0, 0.2, 1);
}

/* Alert Animations */
.alert-enter {
  animation: slideInRight 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}
```

### Feedback Systems

#### Visual Feedback
1. **State Changes**: Clear visual indicators for different states
2. **Progress Indication**: Progress bars for long operations
3. **Confirmation**: Success states for completed actions
4. **Error Communication**: Clear error messages with solutions

#### Haptic Feedback (Mobile)
1. **Light Tap**: Selection and navigation
2. **Medium Tap**: Confirmation actions
3. **Heavy Tap**: Warnings and errors

#### Audio Feedback (Optional)
1. **Subtle Sounds**: Success, warning, and error sounds
2. **Alert Tones**: Critical process alerts
3. **User Control**: Enable/disable audio in preferences

---

## Theme Integration

### Design Token Architecture

The Process Monitoring feature integrates seamlessly with Maxlab's existing light/dark theme system through a comprehensive design token architecture.

#### Theme Detection & Application
```typescript
// Theme Context Integration
interface ThemeContextType {
  theme: 'light' | 'dark' | 'auto';
  colorScheme: ColorScheme;
  processColors: ProcessColorScheme;
  toggleTheme: () => void;
  setTheme: (theme: 'light' | 'dark' | 'auto') => void;
}

// Process-Specific Color Scheme
interface ProcessColorScheme {
  normal: string;
  warning: string;
  critical: string;
  offline: string;
  flow: {
    material: string;
    energy: string;
    data: string;
    control: string;
  };
}
```

#### Dynamic Theme Variables

##### Light Theme Process Colors
```css
:root {
  /* Process Status - Light Theme */
  --process-normal: #22c55e;
  --process-normal-bg: #dcfce7;
  --process-normal-border: #86efac;
  
  --process-warning: #f59e0b;
  --process-warning-bg: #fef3c7;
  --process-warning-border: #fde68a;
  
  --process-critical: #ef4444;
  --process-critical-bg: #fee2e2;
  --process-critical-border: #fca5a5;
  
  --process-offline: #6b7280;
  --process-offline-bg: #f3f4f6;
  --process-offline-border: #d1d5db;
  
  /* Flow Types - Light Theme */
  --flow-material: #3b82f6;
  --flow-energy: #f59e0b;
  --flow-data: #8b5cf6;
  --flow-control: #10b981;
  
  /* Canvas & Interface - Light Theme */
  --canvas-bg: #f8fafc;
  --canvas-grid: #e2e8f0;
  --node-bg: #ffffff;
  --node-border: #e2e8f0;
  --node-shadow: rgba(0, 0, 0, 0.1);
  
  /* Sidebar & Panels - Light Theme */
  --sidebar-bg: #ffffff;
  --panel-bg: #ffffff;
  --panel-border: #e2e8f0;
  --panel-header: #f1f5f9;
}
```

##### Dark Theme Process Colors
```css
[data-theme="dark"] {
  /* Process Status - Dark Theme */
  --process-normal: #34d399;
  --process-normal-bg: #064e3b;
  --process-normal-border: #059669;
  
  --process-warning: #fbbf24;
  --process-warning-bg: #451a03;
  --process-warning-border: #d97706;
  
  --process-critical: #f87171;
  --process-critical-bg: #450a0a;
  --process-critical-border: #dc2626;
  
  --process-offline: #9ca3af;
  --process-offline-bg: #111827;
  --process-offline-border: #4b5563;
  
  /* Flow Types - Dark Theme */
  --flow-material: #60a5fa;
  --flow-energy: #fbbf24;
  --flow-data: #a78bfa;
  --flow-control: #34d399;
  
  /* Canvas & Interface - Dark Theme */
  --canvas-bg: #0f172a;
  --canvas-grid: #1e293b;
  --node-bg: #1e293b;
  --node-border: #334155;
  --node-shadow: rgba(0, 0, 0, 0.3);
  
  /* Sidebar & Panels - Dark Theme */
  --sidebar-bg: #1e293b;
  --panel-bg: #1e293b;
  --panel-border: #334155;
  --panel-header: #0f172a;
}
```

### Component Theme Implementation

#### Themed Process Node
```tsx
// Process Node with Theme Integration
const ProcessNode: React.FC<ProcessNodeProps> = ({ 
  data, 
  status, 
  type 
}) => {
  const { theme } = useTheme();
  
  const nodeStyles = {
    backgroundColor: `var(--node-bg)`,
    borderColor: `var(--process-${status})`,
    boxShadow: `0 2px 8px var(--node-shadow)`,
    color: theme === 'dark' ? '#f1f5f9' : '#1e293b'
  };
  
  const statusStyles = {
    backgroundColor: `var(--process-${status})`,
    color: theme === 'dark' ? '#000000' : '#ffffff'
  };
  
  return (
    <div className="process-node" style={nodeStyles}>
      <div className="status-indicator" style={statusStyles} />
      <div className="node-content">
        {/* Node content */}
      </div>
    </div>
  );
};
```

#### Themed Flow Connection
```tsx
// Flow Connection with Theme Integration
const FlowConnection: React.FC<FlowConnectionProps> = ({
  type,
  status,
  animated
}) => {
  const connectionColor = `var(--flow-${type})`;
  const strokeWidth = type === 'material' ? 3 : 2;
  
  return (
    <path
      stroke={connectionColor}
      strokeWidth={strokeWidth}
      strokeDasharray={animated ? "5 5" : "none"}
      className={animated ? "animated-flow" : ""}
    />
  );
};
```

### Theme-Specific Adjustments

#### High Contrast Mode Support
```css
@media (prefers-contrast: high) {
  :root {
    --process-normal: #008000;
    --process-warning: #ff8c00;
    --process-critical: #dc143c;
    --node-border: #000000;
  }
  
  [data-theme="dark"] {
    --process-normal: #00ff00;
    --process-warning: #ffff00;
    --process-critical: #ff0000;
    --node-border: #ffffff;
  }
}
```

#### Reduced Motion Support
```css
@media (prefers-reduced-motion: reduce) {
  .animated-flow,
  .loading-spinner,
  .pulse-animation {
    animation: none;
  }
  
  .interactive-element {
    transition: none;
  }
}
```

### Theme Switching Behavior

#### Smooth Theme Transitions
```css
* {
  transition: background-color 0.3s ease, 
              border-color 0.3s ease, 
              color 0.3s ease;
}

/* Prevent transition on initial load */
.no-transition * {
  transition: none !important;
}
```

#### Theme Persistence
```typescript
// Theme Persistence Strategy
export const useProcessTheme = () => {
  const [theme, setTheme] = useState<ThemeType>(() => {
    const saved = localStorage.getItem('maxlab-theme');
    const system = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return (saved as ThemeType) || (system ? 'dark' : 'light');
  });
  
  useEffect(() => {
    localStorage.setItem('maxlab-theme', theme);
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);
  
  return { theme, setTheme };
};
```

---

## Accessibility Guidelines

### WCAG 2.1 AA Compliance

The Process Monitoring interface is designed to meet WCAG 2.1 AA standards, ensuring accessibility for users with diverse abilities.

#### 1. Perceivable

##### Color & Contrast
**Minimum Requirements**:
- **Text Contrast**: 4.5:1 ratio for normal text, 3:1 for large text
- **Non-text Elements**: 3:1 ratio for UI components and graphics
- **Process Status**: Cannot rely on color alone

**Implementation**:
```css
/* High Contrast Text */
.text-primary {
  color: var(--color-text-primary);
  /* Light: #1e293b, Dark: #f1f5f9 - Both exceed 7:1 ratio */
}

.text-secondary {
  color: var(--color-text-secondary);
  /* Light: #475569, Dark: #cbd5e1 - Both exceed 4.5:1 ratio */
}

/* Process Status Indicators */
.status-normal::before {
  content: "✓ ";
  color: var(--process-normal);
}

.status-warning::before {
  content: "⚠ ";
  color: var(--process-warning);
}

.status-critical::before {
  content: "✗ ";
  color: var(--process-critical);
}
```

##### Alternative Text & Labels
**Process Diagrams**:
```tsx
<div 
  role="img" 
  aria-label="Chemical process flow diagram with 5 components: inlet pump, main reactor, heat exchanger, separator, and outlet control valve"
>
  {/* ReactFlow diagram */}
</div>
```

**Process Nodes**:
```tsx
<div 
  role="button"
  aria-label={`${componentType} ${componentName}, status: ${status}, temperature: ${temperature}°C`}
  aria-describedby={`node-${id}-details`}
>
  <ProcessNodeComponent />
</div>
```

#### 2. Operable

##### Keyboard Navigation
**Tab Order Strategy**:
1. Header navigation
2. Main action buttons
3. Sidebar controls
4. Canvas elements (in logical order)
5. Properties panel
6. Footer elements

**Keyboard Shortcuts**:
```typescript
const keyboardShortcuts = {
  // Navigation
  'Tab': 'Next element',
  'Shift+Tab': 'Previous element',
  'Enter': 'Activate selected element',
  'Escape': 'Cancel operation or close modal',
  
  // Canvas Operations
  'Space + Drag': 'Pan canvas',
  'Ctrl + Plus': 'Zoom in',
  'Ctrl + Minus': 'Zoom out',
  'Ctrl + 0': 'Fit to screen',
  
  // Editor Operations
  'Ctrl + Z': 'Undo',
  'Ctrl + Y': 'Redo',
  'Delete': 'Delete selected',
  'Ctrl + C': 'Copy selected',
  'Ctrl + V': 'Paste',
  
  // Quick Actions
  'Ctrl + S': 'Save flow',
  'Ctrl + N': 'New flow',
  'F2': 'Rename selected',
  '?': 'Show keyboard shortcuts'
};
```

**Focus Management**:
```tsx
const ProcessCanvas: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null);
  
  // Manage focus when nodes are selected
  useEffect(() => {
    if (focusedNodeId && canvasRef.current) {
      const nodeElement = canvasRef.current.querySelector(
        `[data-node-id="${focusedNodeId}"]`
      );
      nodeElement?.focus();
    }
  }, [focusedNodeId]);
  
  return (
    <div 
      ref={canvasRef}
      role="application"
      aria-label="Process flow editor"
      onKeyDown={handleKeyDown}
    >
      {/* Canvas content */}
    </div>
  );
};
```

##### Touch & Mobile Accessibility
**Touch Targets**: Minimum 44px × 44px for all interactive elements
**Gesture Support**:
- **Single Tap**: Select/activate
- **Double Tap**: Edit mode
- **Long Press**: Context menu
- **Pinch**: Zoom
- **Pan**: Navigate canvas

#### 3. Understandable

##### Clear Instructions & Help
**Contextual Help System**:
```tsx
const HelpTooltip: React.FC<{ content: string; children: ReactNode }> = ({ 
  content, 
  children 
}) => (
  <div className="help-container">
    {children}
    <button
      aria-label="Help information"
      className="help-trigger"
      onFocus={() => setShowHelp(true)}
      onBlur={() => setShowHelp(false)}
    >
      ?
    </button>
    {showHelp && (
      <div role="tooltip" className="help-content">
        {content}
      </div>
    )}
  </div>
);
```

**Error Messages & Validation**:
```tsx
interface ValidationMessageProps {
  field: string;
  error: string;
  suggestions?: string[];
}

const ValidationMessage: React.FC<ValidationMessageProps> = ({
  field,
  error,
  suggestions
}) => (
  <div role="alert" aria-live="polite" className="validation-error">
    <strong>{field}:</strong> {error}
    {suggestions && (
      <ul aria-label="Suggestions">
        {suggestions.map((suggestion, index) => (
          <li key={index}>{suggestion}</li>
        ))}
      </ul>
    )}
  </div>
);
```

#### 4. Robust

##### Semantic HTML Structure
```html
<main role="main" aria-labelledby="main-heading">
  <header>
    <h1 id="main-heading">Process Monitoring</h1>
    <nav aria-label="Primary navigation">
      <!-- Navigation items -->
    </nav>
  </header>
  
  <aside aria-label="Component library">
    <h2>Components</h2>
    <!-- Component list -->
  </aside>
  
  <section aria-label="Process flow editor">
    <h2>Flow Editor</h2>
    <!-- Canvas and tools -->
  </section>
  
  <aside aria-label="Properties panel">
    <h2>Properties</h2>
    <!-- Properties form -->
  </aside>
</main>
```

##### Screen Reader Support
**Live Regions for Dynamic Content**:
```tsx
const ProcessMonitor: React.FC = () => {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [statusMessage, setStatusMessage] = useState('');
  
  return (
    <>
      {/* Live region for status updates */}
      <div 
        aria-live="polite" 
        aria-label="Process status updates"
        className="sr-only"
      >
        {statusMessage}
      </div>
      
      {/* Live region for critical alerts */}
      <div 
        aria-live="assertive" 
        aria-label="Critical alerts"
        className="sr-only"
      >
        {alerts.filter(a => a.level === 'critical').map(alert => 
          `Critical alert: ${alert.message}`
        ).join('. ')}
      </div>
      
      {/* Main interface */}
      <ProcessInterface />
    </>
  );
};
```

### Accessibility Testing Strategy

#### Automated Testing
```typescript
// Jest + Testing Library accessibility tests
describe('Process Node Accessibility', () => {
  test('has proper ARIA labels', () => {
    render(<ProcessNode {...mockProps} />);
    
    expect(screen.getByRole('button')).toHaveAccessibleName(
      'Reactor R-101, status: normal, temperature: 150°C'
    );
  });
  
  test('supports keyboard navigation', () => {
    render(<ProcessNode {...mockProps} />);
    
    const node = screen.getByRole('button');
    node.focus();
    fireEvent.keyDown(node, { key: 'Enter' });
    
    expect(mockProps.onSelect).toHaveBeenCalled();
  });
});
```

#### Manual Testing Checklist
- [ ] All interactive elements are keyboard accessible
- [ ] Tab order is logical and intuitive
- [ ] Focus indicators are visible and clear
- [ ] Color-only information has text alternatives
- [ ] Error messages are announced by screen readers
- [ ] Dynamic content updates are announced
- [ ] All images have appropriate alt text
- [ ] Form labels are properly associated
- [ ] Heading structure is hierarchical

---

## Responsive Design Strategy

### Breakpoint System

The Process Monitoring interface uses a mobile-first responsive design approach with four primary breakpoints.

#### Breakpoint Definitions
```css
/* Mobile First Breakpoints */
:root {
  --breakpoint-sm: 640px;   /* Small tablets */
  --breakpoint-md: 768px;   /* Tablets */
  --breakpoint-lg: 1024px;  /* Laptops */
  --breakpoint-xl: 1280px;  /* Desktops */
  --breakpoint-2xl: 1536px; /* Large desktops */
}

@custom-media --mobile (max-width: 639px);
@custom-media --tablet (min-width: 640px) and (max-width: 1023px);
@custom-media --desktop (min-width: 1024px);
@custom-media --large-desktop (min-width: 1280px);
```

#### Responsive Layout Grid
```css
.layout-grid {
  display: grid;
  gap: var(--space-4);
  
  /* Mobile: Single column */
  grid-template-columns: 1fr;
  grid-template-areas: 
    "header"
    "nav"
    "main"
    "sidebar"
    "footer";
  
  /* Tablet: Two columns */
  @media (--tablet) {
    grid-template-columns: 250px 1fr;
    grid-template-areas: 
      "header header"
      "sidebar main"
      "sidebar main"
      "footer footer";
  }
  
  /* Desktop: Three columns */
  @media (--desktop) {
    grid-template-columns: 250px 1fr 300px;
    grid-template-areas: 
      "header header header"
      "sidebar main properties"
      "sidebar main properties"
      "footer footer footer";
  }
}
```

### Screen-Specific Adaptations

#### Mobile (320px - 639px)
**Primary Focus**: Essential monitoring and basic editing

**Layout Adaptations**:
- **Single Column Layout**: All panels stack vertically
- **Bottom Sheet Navigation**: Slide-up panels for tools
- **Simplified Canvas**: Reduced node detail, larger touch targets
- **Gesture-First Interaction**: Swipe navigation, pinch zoom

**Component Modifications**:
```css
/* Mobile Process Nodes */
@media (--mobile) {
  .process-node {
    min-width: 80px;
    min-height: 60px;
    font-size: var(--font-size-sm);
  }
  
  .process-node-details {
    display: none; /* Show in modal on tap */
  }
  
  .flow-connection {
    stroke-width: 4px; /* Thicker for touch */
  }
}

/* Mobile Navigation */
.mobile-nav {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  height: 60px;
  display: flex;
  justify-content: space-around;
  background: var(--color-bg-card);
  border-top: 1px solid var(--color-border);
}
```

**Mobile-Specific Features**:
- **Quick Actions Toolbar**: Most common actions accessible via floating button
- **Gesture Shortcuts**: Swipe patterns for common operations
- **Voice Commands**: Basic voice control for hands-free monitoring
- **Offline Mode**: Local caching for essential monitoring data

#### Tablet (640px - 1023px)
**Primary Focus**: Balanced editing and monitoring experience

**Layout Adaptations**:
- **Split View**: Main canvas with collapsible sidebar
- **Tabbed Interface**: Switch between different tool panels
- **Adaptive Toolbar**: Context-sensitive tool arrangements

**Component Modifications**:
```css
/* Tablet Layout */
@media (--tablet) {
  .sidebar {
    width: 280px;
    transition: transform 0.3s ease;
  }
  
  .sidebar.collapsed {
    transform: translateX(-240px);
  }
  
  .main-content {
    margin-left: 280px;
  }
  
  .properties-panel {
    position: fixed;
    right: -320px;
    width: 300px;
    transition: right 0.3s ease;
  }
  
  .properties-panel.open {
    right: 0;
  }
}
```

#### Desktop (1024px+)
**Primary Focus**: Full-featured professional interface

**Layout Adaptations**:
- **Three-Panel Layout**: Sidebar, main canvas, properties
- **Floating Panels**: Draggable tool windows
- **Multi-Monitor Support**: Window management for extended displays

**Advanced Features**:
```css
/* Desktop Enhancements */
@media (--desktop) {
  .floating-panel {
    position: absolute;
    min-width: 300px;
    resize: both;
    overflow: auto;
  }
  
  .canvas-area {
    position: relative;
    overflow: hidden;
  }
  
  .mini-map {
    position: absolute;
    bottom: var(--space-4);
    right: var(--space-4);
    width: 200px;
    height: 150px;
    opacity: 0.8;
  }
}
```

### Adaptive Component System

#### Responsive Process Canvas
```tsx
const ResponsiveCanvas: React.FC = () => {
  const [viewportSize, setViewportSize] = useState({ width: 0, height: 0 });
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const updateViewport = () => {
      setViewportSize({
        width: window.innerWidth,
        height: window.innerHeight
      });
      setIsMobile(window.innerWidth < 640);
    };
    
    updateViewport();
    window.addEventListener('resize', updateViewport);
    return () => window.removeEventListener('resize', updateViewport);
  }, []);
  
  const nodeSize = isMobile ? 'small' : 'medium';
  const showDetails = !isMobile;
  
  return (
    <ReactFlow
      nodeTypes={getResponsiveNodeTypes(nodeSize)}
      defaultEdgeOptions={{
        style: { 
          strokeWidth: isMobile ? 4 : 2 
        }
      }}
      minZoom={isMobile ? 0.1 : 0.2}
      maxZoom={isMobile ? 2 : 4}
    >
      {/* Responsive controls */}
    </ReactFlow>
  );
};
```

#### Adaptive Sidebar
```tsx
const AdaptiveSidebar: React.FC = () => {
  const [isOpen, setIsOpen] = useState(true);
  const [isMobile] = useBreakpoint('mobile');
  const [isTablet] = useBreakpoint('tablet');
  
  // Auto-collapse on mobile
  useEffect(() => {
    if (isMobile) {
      setIsOpen(false);
    }
  }, [isMobile]);
  
  const sidebarClass = classNames('sidebar', {
    'sidebar--mobile': isMobile,
    'sidebar--tablet': isTablet,
    'sidebar--collapsed': !isOpen
  });
  
  return (
    <>
      {isMobile && (
        <MobileSidebarToggle 
          isOpen={isOpen} 
          onToggle={() => setIsOpen(!isOpen)} 
        />
      )}
      <aside className={sidebarClass}>
        <SidebarContent />
      </aside>
      {isMobile && isOpen && (
        <div 
          className="sidebar-overlay" 
          onClick={() => setIsOpen(false)} 
        />
      )}
    </>
  );
};
```

### Performance Optimization for Mobile

#### Lazy Loading Strategy
```tsx
// Component-level lazy loading
const MobileComponentLibrary = lazy(() => 
  import('./MobileComponentLibrary')
);

const DesktopComponentLibrary = lazy(() => 
  import('./DesktopComponentLibrary')
);

const ComponentLibrary: React.FC = () => {
  const [isMobile] = useBreakpoint('mobile');
  
  return (
    <Suspense fallback={<ComponentLibrarySkeleton />}>
      {isMobile ? 
        <MobileComponentLibrary /> : 
        <DesktopComponentLibrary />
      }
    </Suspense>
  );
};
```

#### Image and Asset Optimization
```css
/* Responsive images */
.process-diagram-background {
  background-image: 
    image-set(
      url('process-bg-mobile.webp') 1x,
      url('process-bg-mobile@2x.webp') 2x
    );
  
  @media (--tablet) {
    background-image: 
      image-set(
        url('process-bg-tablet.webp') 1x,
        url('process-bg-tablet@2x.webp') 2x
      );
  }
  
  @media (--desktop) {
    background-image: 
      image-set(
        url('process-bg-desktop.webp') 1x,
        url('process-bg-desktop@2x.webp') 2x
      );
  }
}
```

### Touch & Gesture Support

#### Touch-Optimized Interactions
```typescript
// Touch gesture handling
export const useTouchGestures = () => {
  const [gestureState, setGestureState] = useState({
    scale: 1,
    pan: { x: 0, y: 0 },
    rotation: 0
  });
  
  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Handle touch start for gestures
  }, []);
  
  const handleTouchMove = useCallback((e: TouchEvent) => {
    // Handle pinch, pan, and rotation
  }, []);
  
  const handleTouchEnd = useCallback((e: TouchEvent) => {
    // Finalize gesture state
  }, []);
  
  return {
    gestureState,
    touchHandlers: {
      onTouchStart: handleTouchStart,
      onTouchMove: handleTouchMove,
      onTouchEnd: handleTouchEnd
    }
  };
};
```

---

## Additional UX Features

### Real-time Collaboration System

#### Collaborative Indicators
**Multi-user Awareness**:
```tsx
interface CollaboratorIndicator {
  userId: string;
  username: string;
  avatar: string;
  color: string;
  currentAction: 'viewing' | 'editing' | 'commenting';
  focusedElement?: string;
}

const CollaborationOverlay: React.FC = () => {
  const [collaborators, setCollaborators] = useState<CollaboratorIndicator[]>([]);
  const [userCursors, setUserCursors] = useState<Map<string, CursorPosition>>(new Map());
  
  return (
    <>
      {/* User cursors */}
      {Array.from(userCursors.entries()).map(([userId, position]) => (
        <UserCursor key={userId} userId={userId} position={position} />
      ))}
      
      {/* Active users list */}
      <div className="collaboration-panel">
        {collaborators.map(user => (
          <UserIndicator key={user.userId} user={user} />
        ))}
      </div>
    </>
  );
};
```

**Real-time Conflict Resolution**:
- **Optimistic Updates**: Local changes applied immediately
- **Conflict Detection**: Server-side change detection and merging
- **Visual Conflicts**: Highlight conflicting changes with resolution options
- **Automatic Merge**: Non-conflicting changes merged automatically

#### Commenting System
**Contextual Comments**:
```tsx
interface ProcessComment {
  id: string;
  nodeId?: string;
  connectionId?: string;
  position: { x: number; y: number };
  author: User;
  content: string;
  timestamp: Date;
  resolved: boolean;
  replies: ProcessComment[];
}

const CommentThread: React.FC<{ comment: ProcessComment }> = ({ comment }) => (
  <div className="comment-thread" style={{ 
    left: comment.position.x, 
    top: comment.position.y 
  }}>
    <div className="comment-anchor" />
    <div className="comment-bubble">
      <CommentContent comment={comment} />
      <ReplyInput parentId={comment.id} />
    </div>
  </div>
);
```

**Comment Features**:
- **@Mentions**: Notify specific users
- **Rich Text**: Formatted comments with links and images
- **Thread Resolution**: Mark discussion threads as resolved
- **Comment History**: Track comment changes and deletions

### Alert & Notification System

#### Alert Hierarchy & Management
```tsx
interface ProcessAlert {
  id: string;
  level: 'info' | 'warning' | 'critical' | 'emergency';
  source: string;
  title: string;
  description: string;
  timestamp: Date;
  acknowledged: boolean;
  acknowledgedBy?: User;
  actions: AlertAction[];
  relatedData: AlertData[];
}

const AlertCenter: React.FC = () => {
  const [alerts, setAlerts] = useState<ProcessAlert[]>([]);
  const [activeAlert, setActiveAlert] = useState<ProcessAlert | null>(null);
  
  const urgentAlerts = alerts.filter(a => 
    a.level === 'critical' || a.level === 'emergency'
  ).slice(0, 5);
  
  return (
    <div className="alert-center">
      {/* Critical alerts banner */}
      {urgentAlerts.length > 0 && (
        <div className="critical-alerts-banner">
          {urgentAlerts.map(alert => (
            <CriticalAlert key={alert.id} alert={alert} />
          ))}
        </div>
      )}
      
      {/* Alert management interface */}
      <AlertManagement alerts={alerts} />
    </div>
  );
};
```

**Notification Delivery**:
- **In-App Notifications**: Toast notifications for immediate alerts
- **Email Notifications**: Configurable email alerts for critical issues
- **Mobile Push**: Mobile app notifications for field operators
- **SMS Alerts**: Text message alerts for emergency situations
- **Escalation Rules**: Automatic escalation if alerts aren't acknowledged

#### Smart Alert Filtering
```typescript
interface AlertFilter {
  severity: AlertLevel[];
  sources: string[];
  timeRange: { start: Date; end: Date };
  acknowledged: boolean | 'all';
  keywords: string[];
}

export const useSmartAlerts = () => {
  const [alerts, setAlerts] = useState<ProcessAlert[]>([]);
  const [filters, setFilters] = useState<AlertFilter>(defaultFilters);
  
  const filteredAlerts = useMemo(() => {
    return alerts.filter(alert => {
      return (
        filters.severity.includes(alert.level) &&
        filters.sources.includes(alert.source) &&
        isWithinTimeRange(alert.timestamp, filters.timeRange) &&
        (filters.acknowledged === 'all' || alert.acknowledged === filters.acknowledged)
      );
    });
  }, [alerts, filters]);
  
  return { alerts: filteredAlerts, setFilters };
};
```

### Dashboard & Metrics System

#### Executive Dashboard
```tsx
interface KPIMetric {
  id: string;
  name: string;
  value: number;
  unit: string;
  trend: 'up' | 'down' | 'stable';
  change: number;
  target?: number;
  status: 'good' | 'warning' | 'critical';
}

const ExecutiveDashboard: React.FC = () => {
  const [kpis, setKPIs] = useState<KPIMetric[]>([]);
  const [timeRange, setTimeRange] = useState<'1h' | '24h' | '7d' | '30d'>('24h');
  
  return (
    <div className="executive-dashboard">
      {/* Key metrics grid */}
      <div className="kpi-grid">
        {kpis.map(kpi => (
          <KPICard key={kpi.id} metric={kpi} />
        ))}
      </div>
      
      {/* Trend charts */}
      <div className="trend-charts">
        <ProductionTrendChart timeRange={timeRange} />
        <EfficiencyTrendChart timeRange={timeRange} />
        <AlertTrendChart timeRange={timeRange} />
      </div>
      
      {/* Process status overview */}
      <ProcessStatusOverview />
    </div>
  );
};
```

**Customizable Widgets**:
- **Drag & Drop Layout**: Customizable dashboard layout
- **Widget Library**: Pre-built and custom widgets
- **Data Source Flexibility**: Multiple data source connections
- **Export Capabilities**: PDF, Excel, and image exports

### Search & Discovery Enhancement

#### Semantic Search System
```typescript
interface SearchResult {
  type: 'flow' | 'component' | 'comment' | 'documentation';
  id: string;
  title: string;
  description: string;
  relevanceScore: number;
  context: string;
  thumbnail?: string;
}

export const useSemanticSearch = () => {
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  
  const search = useCallback(async (query: string) => {
    setIsSearching(true);
    
    try {
      // Perform semantic search across all content
      const results = await searchAPI.semanticSearch({
        query,
        types: ['flow', 'component', 'comment', 'documentation'],
        limit: 20
      });
      
      setSearchResults(results);
    } finally {
      setIsSearching(false);
    }
  }, []);
  
  return { searchResults, search, isSearching };
};
```

**Advanced Search Features**:
- **Chemical Formula Search**: Search by chemical formulas and structures
- **Process Pattern Recognition**: Find similar process patterns
- **Historical Search**: Search through archived processes and comments
- **Smart Suggestions**: AI-powered search suggestions and auto-completion

### Template & Library System

#### Process Templates
```tsx
interface ProcessTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  thumbnail: string;
  components: TemplateComponent[];
  parameters: TemplateParameter[];
  tags: string[];
  rating: number;
  downloads: number;
  author: User;
}

const TemplateLibrary: React.FC = () => {
  const [templates, setTemplates] = useState<ProcessTemplate[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  
  return (
    <div className="template-library">
      {/* Category filter */}
      <div className="category-filter">
        {categories.map(category => (
          <CategoryButton 
            key={category}
            category={category}
            active={selectedCategory === category}
            onClick={() => setSelectedCategory(category)}
          />
        ))}
      </div>
      
      {/* Template grid */}
      <div className="template-grid">
        {templates.map(template => (
          <TemplateCard key={template.id} template={template} />
        ))}
      </div>
    </div>
  );
};
```

**Template Features**:
- **Community Templates**: User-submitted and curated templates
- **Version Control**: Template versioning and change tracking
- **Customization**: Editable template parameters
- **Validation**: Template validation and compatibility checking

### Advanced Workflow Features

#### Undo/Redo System
```typescript
interface HistoryState {
  nodes: Node[];
  edges: Edge[];
  timestamp: Date;
  description: string;
}

export const useHistoryManager = () => {
  const [history, setHistory] = useState<HistoryState[]>([]);
  const [currentIndex, setCurrentIndex] = useState(-1);
  
  const saveState = useCallback((nodes: Node[], edges: Edge[], description: string) => {
    const newState: HistoryState = {
      nodes: cloneDeep(nodes),
      edges: cloneDeep(edges),
      timestamp: new Date(),
      description
    };
    
    // Remove any future history if we're not at the end
    const newHistory = history.slice(0, currentIndex + 1);
    newHistory.push(newState);
    
    // Limit history to last 50 actions
    if (newHistory.length > 50) {
      newHistory.shift();
    }
    
    setHistory(newHistory);
    setCurrentIndex(newHistory.length - 1);
  }, [history, currentIndex]);
  
  const undo = useCallback(() => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
      return history[currentIndex - 1];
    }
    return null;
  }, [history, currentIndex]);
  
  const redo = useCallback(() => {
    if (currentIndex < history.length - 1) {
      setCurrentIndex(currentIndex + 1);
      return history[currentIndex + 1];
    }
    return null;
  }, [history, currentIndex]);
  
  return { saveState, undo, redo, canUndo: currentIndex > 0, canRedo: currentIndex < history.length - 1 };
};
```

#### Auto-save Mechanism
```typescript
export const useAutoSave = (flowData: FlowData, saveFunction: (data: FlowData) => Promise<void>) => {
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  
  // Debounced auto-save
  const debouncedSave = useDebounce(async (data: FlowData) => {
    setIsSaving(true);
    try {
      await saveFunction(data);
      setLastSaved(new Date());
      setHasUnsavedChanges(false);
    } catch (error) {
      console.error('Auto-save failed:', error);
    } finally {
      setIsSaving(false);
    }
  }, 5000); // Auto-save after 5 seconds of inactivity
  
  useEffect(() => {
    setHasUnsavedChanges(true);
    debouncedSave(flowData);
  }, [flowData, debouncedSave]);
  
  return { lastSaved, isSaving, hasUnsavedChanges };
};
```

### Export & Import Capabilities

#### Multi-format Export
```typescript
interface ExportOptions {
  format: 'json' | 'xml' | 'pdf' | 'png' | 'svg' | 'excel';
  includeData: boolean;
  includeComments: boolean;
  resolution?: 'low' | 'medium' | 'high';
  pageSize?: 'A4' | 'A3' | 'Letter' | 'Tabloid';
}

export const useExportFlow = () => {
  const exportFlow = useCallback(async (
    flowData: FlowData, 
    options: ExportOptions
  ): Promise<Blob> => {
    switch (options.format) {
      case 'json':
        return new Blob([JSON.stringify(flowData, null, 2)], { 
          type: 'application/json' 
        });
        
      case 'pdf':
        return await generatePDFExport(flowData, options);
        
      case 'png':
        return await generateImageExport(flowData, 'png', options);
        
      case 'svg':
        return await generateImageExport(flowData, 'svg', options);
        
      case 'excel':
        return await generateExcelExport(flowData, options);
        
      default:
        throw new Error(`Unsupported export format: ${options.format}`);
    }
  }, []);
  
  return { exportFlow };
};
```

**Import Capabilities**:
- **Standard Formats**: JSON, XML, CSV data import
- **Industry Standards**: Import from common chemical engineering software
- **Template Import**: Bulk template import and organization
- **Data Validation**: Automatic validation and error reporting during import

This comprehensive UI/UX design documentation provides a complete foundation for implementing the Process Monitoring feature in Maxlab, with special attention to usability for chemical engineers, accessibility compliance, and seamless integration with the existing theme system.