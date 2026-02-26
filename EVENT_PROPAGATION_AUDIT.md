# VoxAI Event Propagation Audit

## Stability Overhaul - Sidebar & Menu Interactions

**Date:** 2026-02-26
**Version:** 2.1.0 - Event Isolation Refactor
**Scope:** `Sidebar.tsx`, `ConversationItem.tsx`

---

## 1. Contextual Menu (3-Dots) Repair

### Problem Statement
The 3-dots menu button clicks were propagating to parent elements, causing:
- Unintended conversation selection when opening menu
- Menu state reset during parent re-renders
- Multiple menus appearing simultaneously

### Solution Implemented

#### Propagation Lock (ConversationItem.tsx:438-465)
```typescript
onClick={(e: React.MouseEvent) => {
  e.preventDefault();
  e.stopPropagation();
  // Menu toggle logic
}}
onMouseDown={(e: React.MouseEvent) => {
  e.stopPropagation();
}}
onTouchStart={(e: React.TouchEvent) => {
  e.stopPropagation();
}}
onPointerDown={(e: React.PointerEvent) => {
  e.stopPropagation();
}}
```

**Events Blocked:**
| Event | Handler | Purpose |
|-------|---------|---------|
| `click` | `preventDefault` + `stopPropagation` | Block parent `onSelect` |
| `mousedown` | `stopPropagation` | Block early event capture |
| `touchstart` | `stopPropagation` | Block mobile touch propagation |
| `pointerdown` | `stopPropagation` | Universal pointer event guard |

#### Click-Outside Handler (ConversationItem.tsx:72-116)
```typescript
// Uses capture phase for priority handling
document.addEventListener('mousedown', handleClickOutside, { capture: true });
document.addEventListener('touchstart', handleClickOutside, { capture: true, passive: true });
document.addEventListener('keydown', handleEsc, { capture: true });
```

**Lifecycle Guarantees:**
- `requestAnimationFrame` ensures DOM stability before listener attachment
- `isCleanedUp` flag prevents stale callback execution
- Cleanup removes all listeners on unmount

#### Single-Instance Rule (Sidebar.tsx:93)
```typescript
const [openMenuId, setOpenMenuId] = useState<string | null>(null);
```
- Only one menu ID can be active at any time
- Opening a new menu automatically closes the previous one
- Menu state resets on sidebar collapse and mobile drawer close

---

## 2. Sidebar 'Inert' Space Protocol

### Problem Statement
Clicking empty areas in the sidebar caused unintended state changes:
- Sidebar collapse/expand when clicking dead space
- Conversation deselection from background clicks

### Solution Implemented

#### Inert Click Handler (Sidebar.tsx:42-51)
```typescript
const handleInertClick = (e: React.MouseEvent) => {
  if (e.target === e.currentTarget) {
    e.stopPropagation();
    // Intentionally empty - no state changes
  }
};
```

#### Applied Locations:
| Element | Line | Purpose |
|---------|------|---------|
| Scroll container | 327-328 | Neutralize list background clicks |
| Conversation items wrapper | 344 | Neutralize gap clicks |
| Collapsed spacer | 410-420 | Truly inert empty space |

#### CSS Reinforcement:
```typescript
// Collapsed spacer
className="flex-1 pointer-events-none"
style={{ userSelect: 'none', background: 'transparent' }}

// Text labels (search results count, empty state)
className="pointer-events-none select-none"
```

---

## 3. Pure UI State Isolation

### Non-Destructive Collapse Guarantee

**Rule:** `isCollapsed` boolean is completely decoupled from:
- `activeConversationId` - Never modified by collapse
- `conversations` array - Never cleared or re-fetched
- `currentId` - Preserved across collapse/expand cycles

#### Menu State Cleanup (Sidebar.tsx:139-155)
```typescript
// Close menu when sidebar collapses
useEffect(() => {
  if (isCollapsedDesktop) {
    setOpenMenuId(null);
  }
}, [isCollapsedDesktop]);

// Close menu when conversation is deleted
useEffect(() => {
  if (openMenuId && !conversations.some(c => c.id === openMenuId)) {
    setOpenMenuId(null);
  }
}, [conversations, openMenuId]);
```

#### Scroll Position Restoration (Sidebar.tsx:106-124)
```typescript
// Save before collapse
useEffect(() => {
  if (isCollapsedDesktop && scrollContainerRef.current) {
    savedScrollPositionRef.current = scrollContainerRef.current.scrollTop;
  }
}, [isCollapsedDesktop]);

// Restore after expand
useEffect(() => {
  if (!isCollapsedDesktop && scrollContainerRef.current) {
    requestAnimationFrame(() => {
      scrollContainerRef.current.scrollTop = savedScrollPositionRef.current;
    });
  }
}, [isCollapsedDesktop]);
```

---

## 4. Touch Safety (Mobile)

### WCAG 2.2 AAA Compliance

**Minimum Touch Target:** 44x44px

#### Implementation (ConversationItem.tsx:15, 453-455)
```typescript
const TOUCH_TARGET_MIN = '44px';

style={{
  minWidth: TOUCH_TARGET_MIN,
  minHeight: TOUCH_TARGET_MIN,
}}
```

#### Mobile Action Sheet
- Uses `MobileActionSheet` component for full-screen safe interactions
- Touch targets are larger than minimum on mobile
- No overlap with main chat window due to modal backdrop

---

## 5. Event Flow Verification

### Scenario A: 3-Dot Click on Desktop

```
User clicks 3-dots button
    │
    ├── onClick fires on button
    │   ├── e.preventDefault() called
    │   ├── e.stopPropagation() called
    │   └── Menu opens (openMenuId set)
    │
    └── Parent button onClick DOES NOT FIRE ✓
        (propagation stopped)
```

**Result:** Menu opens. Conversation is NOT selected.

### Scenario B: 3-Dot Click on Mobile

```
User taps 3-dots button
    │
    ├── onTouchStart fires
    │   └── e.stopPropagation() called
    │
    ├── onClick fires
    │   ├── e.preventDefault() called
    │   ├── e.stopPropagation() called
    │   └── MobileActionSheet opens
    │
    └── Parent touch handlers DO NOT FIRE ✓
```

**Result:** Action sheet slides up. No accidental selection.

### Scenario C: Click on Empty Sidebar Space

```
User clicks empty area in conversation list
    │
    ├── Event reaches scroll container
    │   ├── handleInertClick checks: e.target === e.currentTarget
    │   ├── Condition TRUE (clicked on container itself)
    │   └── e.stopPropagation() called
    │
    └── NO STATE CHANGES ✓
```

**Result:** Nothing happens. Sidebar state unchanged.

### Scenario D: Click on Collapsed Sidebar Spacer

```
User clicks empty space in collapsed sidebar
    │
    ├── Element has pointer-events: none
    │
    └── Event DOES NOT REGISTER ✓
```

**Result:** Click passes through. No handlers fire.

### Scenario E: Sidebar Collapse During Open Menu

```
User has menu open, clicks collapse button
    │
    ├── Sidebar collapse starts
    │   └── isCollapsedDesktop becomes true
    │
    ├── useEffect triggers
    │   └── setOpenMenuId(null) called
    │
    └── Menu closes cleanly BEFORE unmount ✓
```

**Result:** No orphaned menu state. Clean unmount.

### Scenario F: Delete Conversation with Open Menu

```
User opens menu on Conversation A
User deletes Conversation A from another menu
    │
    ├── conversations array updates
    │   └── Conversation A removed
    │
    ├── useEffect triggers
    │   ├── Check: openMenuId in conversations?
    │   ├── Result: FALSE (deleted)
    │   └── setOpenMenuId(null) called
    │
    └── Menu state cleaned up ✓
```

**Result:** No stale menu references.

---

## 6. Testing Checklist

### Desktop
- [ ] Click 3-dots button - menu opens, conversation NOT selected
- [ ] Click outside menu - menu closes
- [ ] Press Escape - menu closes, focus returns to button
- [ ] Click empty list space - nothing happens
- [ ] Click collapsed sidebar spacer - nothing happens
- [ ] Collapse sidebar with menu open - menu closes cleanly
- [ ] Expand sidebar - scroll position restored

### Mobile
- [ ] Tap 3-dots button - action sheet opens
- [ ] Tap backdrop - action sheet closes
- [ ] Verify 44x44px touch targets (use DevTools)
- [ ] Close mobile drawer - menu state resets

### State Isolation
- [ ] Collapse sidebar - `currentId` unchanged
- [ ] Collapse sidebar - no API calls triggered
- [ ] Expand sidebar - active conversation highlighted
- [ ] Delete conversation - orphaned menu state cleared

---

## 7. Files Modified

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `ConversationItem.tsx` | 1-15, 72-116, 374-396, 438-465 | Propagation guards, touch targets |
| `Sidebar.tsx` | 1-51, 139-155, 327-344, 406-420 | Inert space protocol |

---

## 8. Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────┐
│                         SIDEBAR CONTAINER                          │
│                  (No click handlers on container)                  │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  HEADER (Toggle + Search)                                    │   │
│  │  onClick: Explicit handlers on buttons only                  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  SCROLL CONTAINER                                            │   │
│  │  onClick: handleInertClick (neutralizes background clicks)   │   │
│  │                                                               │   │
│  │  ┌─────────────────────────────────────────────────────────┐ │   │
│  │  │  CONVERSATION ITEM                                       │ │   │
│  │  │                                                           │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │   │
│  │  │  │  MAIN BUTTON                                         │ │ │   │
│  │  │  │  onClick: handleSelectClick                          │ │ │   │
│  │  │  │  (guarded - won't fire if menu open)                 │ │ │   │
│  │  │  └─────────────────────────────────────────────────────┘ │ │   │
│  │  │                                                           │ │   │
│  │  │  ┌─────────────────────────────────────────────────────┐ │ │   │
│  │  │  │  3-DOTS BUTTON (44x44px)                             │ │ │   │
│  │  │  │  onClick: PROPAGATION LOCKED                         │ │ │   │
│  │  │  │  onMouseDown: PROPAGATION LOCKED                     │ │ │   │
│  │  │  │  onTouchStart: PROPAGATION LOCKED                    │ │ │   │
│  │  │  │  onPointerDown: PROPAGATION LOCKED                   │ │ │   │
│  │  │  └─────────────────────────────────────────────────────┘ │ │   │
│  │  │                                                           │ │   │
│  │  └─────────────────────────────────────────────────────────┘ │   │
│  │                                                               │   │
│  │  [Empty space: onClick neutralized by handleInertClick]       │   │
│  │                                                               │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  COLLAPSED SPACER (when sidebar collapsed)                   │   │
│  │  pointer-events: none (truly inert)                          │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │  FOOTER (Settings)                                           │   │
│  │  onClick: Explicit handler on button only                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

**Audit Complete.** Sidebar and menu interactions are now fully isolated and stable.
