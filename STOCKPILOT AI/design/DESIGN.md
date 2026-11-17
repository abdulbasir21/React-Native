---
name: StockPilot Retail Engine
colors:
  surface: '#f9f9ff'
  surface-dim: '#d2daf0'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f1f3ff'
  surface-container: '#e9edff'
  surface-container-high: '#e0e8ff'
  surface-container-highest: '#dbe2f9'
  on-surface: '#141b2c'
  on-surface-variant: '#3e4945'
  inverse-surface: '#293041'
  inverse-on-surface: '#edf0ff'
  outline: '#6e7975'
  outline-variant: '#bec9c4'
  surface-tint: '#036b59'
  primary: '#005445'
  on-primary: '#ffffff'
  primary-container: '#0b6e5c'
  on-primary-container: '#9aedd6'
  inverse-primary: '#83d6c0'
  secondary: '#7d5700'
  on-secondary: '#ffffff'
  secondary-container: '#fdc254'
  on-secondary-container: '#725000'
  tertiary: '#135346'
  on-tertiary: '#ffffff'
  tertiary-container: '#306b5e'
  on-tertiary-container: '#ade9d8'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#9ff2db'
  primary-fixed-dim: '#83d6c0'
  on-primary-fixed: '#002019'
  on-primary-fixed-variant: '#005143'
  secondary-fixed: '#ffdeaa'
  secondary-fixed-dim: '#f7bd4f'
  on-secondary-fixed: '#271900'
  on-secondary-fixed-variant: '#5f4100'
  tertiary-fixed: '#b2efde'
  tertiary-fixed-dim: '#97d2c2'
  on-tertiary-fixed: '#00201a'
  on-tertiary-fixed-variant: '#0f5044'
  background: '#f9f9ff'
  on-background: '#141b2c'
  surface-variant: '#dbe2f9'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  currency-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
    letterSpacing: -0.02em
  currency-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '700'
    lineHeight: 24px
    letterSpacing: -0.01em
  title-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  title-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 16px
    fontWeight: '600'
    lineHeight: 22px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '500'
    lineHeight: 16px
  label-sm:
    fontFamily: Inter
    fontSize: 10px
    fontWeight: '600'
    lineHeight: 14px
    letterSpacing: 0.04em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  margin: 1rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style
The design system establishes a high-trust, swift, and resilient commercial interface tailored for point-of-sale and inventory operations under real-world retail conditions in Pakistan (such as high ambient light in shopfronts, dense catalog data, and rapid customer checkouts).

### Brand Personality & Emotional Anchor
- **Reliable & Unshakable:** Evokes the precision and safety of tier-1 institutional banking, eliminating transactional friction and inventory ambiguity.
- **Immediate & Agile:** Designed for low latency interaction, one-thumb cashier ergonomics, and instant scan-to-cart confirmation.
- **Calm Commercial Clarity:** Replaces visual chaos with structured hierarchy, giving shop owners total command over margins, stock levels, and daily bookkeeping.

### Visual Style Direction
A disciplined synthesis of modern utility and corporate fintech. The aesthetic avoids unnecessary ornamentation, relying instead on pure white surface planes, crisp hairline division, generous touch envelopes, and bold tabular numeric displays. Micro-interactions and touch targets are engineered to surpass the minimum 48px baseline to prevent mis-taps during peak store hours.

## Colors
The palette balances institutional stability with vibrant, immediate feedback tokens designed for readability under direct fluorescent or daylight store conditions.

### Palette Architecture
- **Primary Emerald-Teal (`#0B6E5C`):** Drives primary actions, POS checkout triggers, active bottom navigation, and confirmed sale indicators.
- **Primary Dark Deep Pine (`#064B3F`):** Dedicated to header navigation strips, modal action sheets, and heavy-contrast focal points.
- **Primary Soft Tint (`#E6F4F1`):** Applied to active row selections, subtle badge backgrounds, and selected category filter chips.
- **Secondary Warm Gold (`#F2B84B`):** Highlights sales incentives, AI inventory replenishment alerts, low stock nudges, and promotional triggers.
- **Canvas (`#F7F8F6`):** A soft, warm off-white foundation that eliminates eye strain while framing stark white cards.
- **Surfaces (`#FFFFFF`):** High-clarity sheet containers bordered by neutral stroke `#E6E9E4`.
- **Text Tokens:** 
  - Primary: `#101828` for titles, critical data, and currency strings.
  - Secondary: `#667085` for SKU labels, metadata, and timestamps.
  - Tertiary / Muted: `#98A2B3` for placeholders and inactive icons.

### Semantic Status Tokens
- **Success (`#12B76A`):** Payment received, in-stock confirmation, day-end register reconciliation.
- **Warning (`#F79009`):** Low inventory threshold, pending customer credit (Udhaar).
- **Error (`#D92D20`):** Out of stock, payment declined, voided receipt.
- **Info (`#2E90FA`):** Shift summaries, sync queues, system notifications.

## Typography
The system adopts **Plus Jakarta Sans** for expressive, authoritative structural headlines and transaction totals, complemented by **Inter** for dense transactional tables, forms, and micro-copy.

### Tabular Numbers & Financial Data
All monetary values (e.g., `Rs. 48,650`), barcode entries, quantity modifiers, and SKU figures must strictly enforce OpenType tabular figures (`font-variant-numeric: tabular-nums;` / `tnum`). This prevents visual jitter when numbers cycle on dynamic checkouts and keeps decimal points aligned in vertical audit rows.

### Hierarchy & Mobile Readability
- **Primary Metric Displays:** Large currency values sit at 28px–30px with heavy font weights (700–800) to ensure legibility when the terminal rests flat on a cashier counter.
- **Labels & Micro-data:** Micro tags and SKU numbers maintain an optical minimum of 10px with increased letter spacing (`0.04em`) to prevent ink-trap blur on entry-level Android LCD screens.

## Layout & Spacing
The layout adheres strictly to an **8-point grid**, tailored specifically for the native portrait mobile container (390px × 844px viewport).

### Layout Geometry
- **Outer Margins:** Fixed 16px (`1rem`) horizontal screen padding keeps critical edge taps safely away from Android bezel guards and system gestures.
- **Internal Column Grid:** Dynamic 4-column layout for product catalog cards, inventory dashboards, and modal sheets with 16px gutter spacing.
- **Vertical Rhythm:**
  - Component stacks leverage 8px (`0.5rem`) for tightly bound pairs (e.g., input field and validation text).
  - 16px (`1rem`) isolates sibling component blocks.
  - 24px (`1.5rem`) sections off operational boundaries (e.g., Cart Items vs. Payment Method selector).

### Ergonomic Envelopes
Every interactive touch target has an absolute hard floor of **48px × 48px**, extending touch targets past visual borders via invisible padding where compact visual chips (e.g., 36px) are required. Sticky footer bars (Charge / Pay action) feature a minimum vertical height of 64px with safe-area bottom insets.

## Elevation & Depth
Depth is communicated through crisp structural boundary lines matched with soft, ambient, low-contrast shadows. This ensures visual separation between cards and backgrounds without muddying screen brightness under harsh overhead shop lighting.

### Elevation Levels
- **Level 0 (Flat Canvas):** `#F7F8F6` background. No elevation or border.
- **Level 1 (Card & Product Surface):** Pure `#FFFFFF` background with a mandatory `1px solid #E6E9E4` border and an ultra-soft tinted shadow:
  `box-shadow: 0px 2px 4px rgba(16, 24, 40, 0.04), 0px 1px 2px rgba(16, 24, 40, 0.02);`
- **Level 2 (Dropdowns, Menus & Filter Drawers):** Pure `#FFFFFF` background with `1px solid #E6E9E4` and ambient spread:
  `box-shadow: 0px 8px 16px -4px rgba(16, 24, 40, 0.08), 0px 4px 6px -2px rgba(16, 24, 40, 0.03);`
- **Level 3 (POS Checkout Drawers & Persistent Sticky Trays):** Pure `#FFFFFF` anchored to viewport bottom with upper border `1px solid #E6E9E4` and deep ground separation:
  `box-shadow: 0px -4px 16px rgba(16, 24, 40, 0.06);`

## Shapes
The system utilizes a balanced, approachable corner radius rhythm that maintains professional precision while remaining tactile and inviting.

### Radius Scale Implementation
- **Cards & Primary Modules:** 16px to 20px radius. Used on all top-level operational cards, transaction receipts, and dashboard metric summaries.
- **Inputs & Category Chips:** 12px radius. Provides clear tactile affordance for data entry, barcode inputs, and catalog category selectors.
- **Status Badges & Pill Indicators:** 9999px (full pill). Used exclusively for operational states (e.g., "Paid", "Low Stock", "Returned").
- **Primary Buttons:** 12px radius, matching input field geometries for unified vertical form composition.

## Components

### Buttons
- **Primary POS Action (e.g., "Complete Sale - Rs. 4,500"):** Solid `#0B6E5C` background, white label (`#FFFFFF`), 52px height, 12px corner radius. Pressed state shifts to `#064B3F`. Includes tabular bold pricing label on trailing edge.
- **Secondary / Utility Button:** Background `#E6F4F1`, text `#0B6E5C`, border none, 48px height, 12px radius.
- **Destructive (e.g., "Void Bill"):** Background `#FFFFFF`, border `1px solid #FDA29B`, text `#D92D20`.

### Cards & Modules
- **Inventory Product Card:** Pure `#FFFFFF` background, 16px radius, `1px solid #E6E9E4`. Displays thumbnail image, bold SKU title in `#101828`, secondary pack size in `#667085`, and distinct bold price in `currency-md`. Features an integrated 48px stepper button (+ / -) to increment cart counts instantly.
- **Register Metric Card:** Contains subtle vertical status band (4px wide) on leading edge denoting cash vs. credit volume.

### Chips & Filter Tabs
- **Category Filter Chip:** Height 36px (touch target padded to 48px), 12px radius. Inactive: `#FFFFFF` with `1px solid #E6E9E4`, text `#667085`. Active: `#E6F4F1` with `1.5px solid #0B6E5C`, text `#0B6E5C` (Font weight: 600).
- **Status Pills:** Height 24px, 9999px radius, padding 2px 10px. Uses semantic soft background and high-contrast text (e.g., Paid: `#ECFDF3` with `#027A48` text; Udhaar/Credit: `#FEF0C7` with `#B54708` text).

### Form Inputs & Search
- **Barcode / Product Search Bar:** Height 48px, 12px radius, `#FFFFFF` background, `1px solid #D0D5DD`. Leading barcode scan icon button (minimum 48px target). Active focus shifts border to 2px `#0B6E5C` with zero shadow.
- **Numeric Keypad & Monetary Fields:** Right-aligned tabular text display with fixed `Rs.` prefix in `#667085`.

### List Rows & Transaction Tables
- **Cart Row Item:** 72px minimum height, border-bottom `1px solid #F2F4F7`. Displays item quantity badge, item name, unit pricing, and bold line total. Swipe actions reveal rapid quantity adjustments or deletion.
- **Customer Ledger (Khata):** Two-column transaction summary with explicit color-coded debits (`#D92D20`) and credits (`#12B76A`), maintaining strict tabular vertical alignment.