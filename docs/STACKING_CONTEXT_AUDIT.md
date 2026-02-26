# VoxAI Stacking Context Audit

**Version:** 2026 Unified Surface Experience
**Last Updated:** February 2026
**Status:** Implementation Complete

---

## Executive Summary

This audit documents the z-index stacking context for VoxAI's Unified Surface Experience. All interactive elements have been verified to maintain correct layering relationships with the new glassmorphism sticky header and footer.

---

## Z-Index Scale Definition

```css
:root {
  /* Stacking Context Z-Index Scale */
  --vox-z-base: 1;           /* Base content layer */
  --vox-z-messages: 5;       /* Message bubbles */
  --vox-z-action-bar: 10;    /* Message action buttons (copy, edit) */
  --vox-z-fade-overlay: 15;  /* Edge fading gradients */
  --vox-z-header: 20;        /* Glass header (sticky) */
  --vox-z-footer: 20;        /* Glass footer (sticky input) */
  --vox-z-super-button: 25;  /* Voice action button */
  --vox-z-dropdown: 30;      /* Context menus, dropdowns */
  --vox-z-sidebar: 40;       /* Sidebar (mobile drawer) */
  --vox-z-modal: 50;         /* Confirmation modals */
  --vox-z-action-sheet: 100; /* Mobile action sheet */
}
```

---

## Layer Hierarchy Visualization

```
┌─────────────────────────────────────────────────────────────┐
│ z-index: 100  │ MobileActionSheet (bottom sheet)           │
├─────────────────────────────────────────────────────────────┤
│ z-index: 50   │ ConfirmationModal (delete confirmation)    │
├─────────────────────────────────────────────────────────────┤
│ z-index: 40   │ Sidebar (mobile drawer overlay)            │
├─────────────────────────────────────────────────────────────┤
│ z-index: 30   │ Context Dropdown Menus (conversation menu) │
├─────────────────────────────────────────────────────────────┤
│ z-index: 25   │ Super-Button (voice action in footer)      │
├─────────────────────────────────────────────────────────────┤
│ z-index: 20   │ Glass Header / Glass Footer (sticky)       │
├─────────────────────────────────────────────────────────────┤
│ z-index: 15   │ Edge Fade Overlays (top/bottom gradients)  │
├─────────────────────────────────────────────────────────────┤
│ z-index: 10   │ Message Action Bar (copy, edit buttons)    │
├─────────────────────────────────────────────────────────────┤
│ z-index: 5    │ Message Bubbles                            │
├─────────────────────────────────────────────────────────────┤
│ z-index: 1    │ Base Content Layer                         │
└─────────────────────────────────────────────────────────────┘
```

---

## Component-by-Component Audit

### 1. Glass Header (`vox-glass-header`)

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-header)` = 20 | Above messages, below dropdowns |
| **position** | `sticky` | Stays at top of scroll container |
| **backdrop-filter** | `blur(12px)` | Glassmorphism effect |
| **background** | `rgba(255,255,255,0.88)` | Semi-transparent |

**Behavior:** Messages scroll behind the header and are visible through the blur. Header stays above fade overlays.

### 2. Glass Footer (`vox-glass-footer`)

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-footer)` = 20 | Same level as header |
| **position** | `sticky` | Stays at bottom of scroll container |
| **backdrop-filter** | `blur(12px)` | Glassmorphism effect |
| **background** | `rgba(255,255,255,0.88)` | Semi-transparent |

**Behavior:** Input area floats over the message list. Messages fade behind the footer.

### 3. Super-Button (Voice Action Button)

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-super-button)` = 25 | Above header/footer |
| **location** | Inside glass footer | Contained in input area |

**Behavior:** Voice button remains clickable and visible above the glass layers. Important for voice-first interaction.

### 4. Message Action Bar (Copy/Edit Buttons)

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-action-bar)` = 10 | Above messages, below glass layers |
| **visibility** | `opacity-0 group-hover:opacity-100` | Appears on hover |

**Behavior:** Action buttons appear on message hover but correctly disappear behind glass header/footer when messages scroll.

### 5. Edge Fade Overlays

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-fade-overlay)` = 15 | Above messages, below glass |
| **position** | `absolute` | Pinned to top/bottom of scroll area |
| **pointer-events** | `none` | Doesn't block interactions |

**Behavior:** Creates smooth visual transition as messages emerge from under glass layers.

### 6. Context Dropdown Menu (Conversation Actions)

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-dropdown)` = 30 | Above all glass layers |
| **render method** | React Portal to `document.body` | Escapes stacking context |

**Behavior:** Menus always appear on top, even when triggered from sidebar near glass header.

### 7. Sidebar (Mobile Drawer)

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-sidebar)` = 40 | Above chat shell entirely |
| **position** | `fixed` | Full viewport overlay |

**Behavior:** Mobile sidebar slides over everything including glass header/footer.

### 8. Confirmation Modal

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-modal)` = 50 | Above sidebar |
| **render method** | React Portal to `document.body` | Top-level overlay |

**Behavior:** Delete confirmation appears above all content including open sidebar.

### 9. Mobile Action Sheet

| Property | Value | Notes |
|----------|-------|-------|
| **z-index** | `var(--vox-z-action-sheet)` = 100 | Topmost layer |
| **render method** | React Portal to `document.body` | Highest priority |

**Behavior:** Bottom action sheet on mobile appears above everything, including modals.

---

## Interaction Matrix

| Element A | Element B | Correct Order | Status |
|-----------|-----------|---------------|--------|
| Messages | Glass Header | Header above | PASS |
| Messages | Glass Footer | Footer above | PASS |
| Action Bar | Glass Header | Header above | PASS |
| Action Bar | Glass Footer | Footer above | PASS |
| Super-Button | Glass Footer | Button above | PASS |
| Dropdown Menu | Glass Header | Dropdown above | PASS |
| Dropdown Menu | Glass Footer | Dropdown above | PASS |
| Sidebar | Glass Header | Sidebar above | PASS |
| Sidebar | Glass Footer | Sidebar above | PASS |
| Modal | Sidebar | Modal above | PASS |
| Action Sheet | Modal | Sheet above | PASS |
| Edge Fades | Messages | Fades above | PASS |
| Edge Fades | Glass Layers | Glass above | PASS |

---

## CSS Implementation Details

### Glass Header
```css
.vox-glass-header {
  position: sticky;
  top: 0;
  z-index: var(--vox-z-header); /* 20 */
  background: var(--vox-glass-bg-light);
  backdrop-filter: blur(var(--vox-glass-blur));
  box-shadow: var(--vox-shadow-header);
  border: none; /* No hard borders */
}
```

### Glass Footer
```css
.vox-glass-footer {
  position: sticky;
  bottom: 0;
  z-index: var(--vox-z-footer); /* 20 */
  background: var(--vox-glass-bg-light);
  backdrop-filter: blur(var(--vox-glass-blur));
  box-shadow: var(--vox-shadow-footer);
  border: none; /* No hard borders */
}
```

### Edge Fades
```css
.vox-fade-top {
  position: absolute;
  top: var(--vox-header-height);
  z-index: var(--vox-z-fade-overlay); /* 15 */
  background: linear-gradient(to bottom, var(--bg-primary) 0%, transparent 100%);
  pointer-events: none;
}

.vox-fade-bottom {
  position: absolute;
  bottom: var(--vox-footer-min-height);
  z-index: var(--vox-z-fade-overlay); /* 15 */
  background: linear-gradient(to top, var(--bg-primary) 0%, transparent 100%);
  pointer-events: none;
}
```

### Super-Button Container
```jsx
<div style={{ zIndex: 'var(--vox-z-super-button)' }}> /* 25 */
  <ActionBtn ... />
</div>
```

---

## Dark Mode Parity

All z-index values remain identical between light and dark modes. Only visual properties change:

| Property | Light Mode | Dark Mode |
|----------|------------|-----------|
| `--vox-glass-bg-light` | `rgba(255,255,255,0.88)` | N/A |
| `--vox-glass-bg-dark` | N/A | `rgba(9,9,11,0.9)` |
| `--vox-shadow-header` | Light shadows | Darker shadows |
| `--vox-shadow-footer` | Light shadows | Darker shadows |
| Edge fade gradient | `#ffffff → transparent` | `#09090b → transparent` |

---

## Scroll Behavior Verification

### Under-Scroll Rule
- **Requirement:** Messages must visibly disappear behind the blurred header as they scroll up
- **Implementation:** `position: sticky` on header, `overflow-y: auto` on message scroll area
- **Status:** PASS

### Padding Offsets
- **Requirement:** First and last messages not permanently obscured by sticky layers
- **Implementation:**
  ```css
  .vox-message-scroll-inner {
    padding-top: calc(var(--vox-header-height) + var(--vox-space-4));
    padding-bottom: calc(var(--vox-footer-min-height) + var(--vox-space-4));
  }
  ```
- **Status:** PASS

### Zero Layout Shift
- **Requirement:** Scrollbar appearance doesn't cause content to jump horizontally
- **Implementation:** `scrollbar-gutter: stable;` on `.vox-message-scroll`
- **Status:** PASS

---

## Test Checklist

### Desktop (1024px+)
- [x] Glass header blur visible when messages scroll
- [x] Glass footer blur visible with messages behind
- [x] Super-button clickable above footer
- [x] Message action bar appears on hover
- [x] Dropdown menus appear above glass layers
- [x] Edge fades create smooth transition
- [x] No horizontal layout shift on scroll

### Mobile (< 768px)
- [x] Glass header adapts to smaller height
- [x] Glass footer input remains functional
- [x] Mobile action sheet appears above all layers
- [x] Sidebar drawer slides over glass layers
- [x] Touch targets remain accessible
- [x] Safe area padding respected

### Accessibility
- [x] Focus states visible through glass
- [x] ARIA roles maintained
- [x] Keyboard navigation functional
- [x] Screen reader announces content correctly

---

## Files Modified

| File | Changes |
|------|---------|
| `src/index.css` | Added glassmorphism system, z-index scale, fade overlays |
| `src/components/ChatWindow.tsx` | Refactored to ChatShell pattern with sticky layers |
| `src/components/MessageBubble.tsx` | Replaced borders with soft shadows |

---

## Conclusion

The VoxAI Unified Surface Experience maintains correct stacking context for all interactive elements. The z-index scale provides clear hierarchical relationships:

1. **Content Layer** (z: 1-15): Messages, action bars, edge fades
2. **Glass Layer** (z: 20): Sticky header and footer
3. **Interactive Layer** (z: 25-30): Super-button, dropdown menus
4. **Overlay Layer** (z: 40-100): Sidebar, modals, action sheets

All components have been verified to interact correctly with the new glassmorphism design system.
