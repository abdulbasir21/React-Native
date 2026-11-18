---
name: Utilitarian Trust
colors:
  surface: '#f9f9f8'
  surface-dim: '#dadad9'
  surface-bright: '#f9f9f8'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f3f4f3'
  surface-container: '#eeeeed'
  surface-container-high: '#e8e8e7'
  surface-container-highest: '#e2e2e2'
  on-surface: '#1a1c1c'
  on-surface-variant: '#3f4948'
  inverse-surface: '#2f3130'
  inverse-on-surface: '#f1f1f0'
  outline: '#6f7978'
  outline-variant: '#bec9c7'
  surface-tint: '#216866'
  primary: '#004341'
  on-primary: '#ffffff'
  primary-container: '#0d5c5a'
  on-primary-container: '#8fd2cf'
  inverse-primary: '#8fd2cf'
  secondary: '#904d00'
  on-secondary: '#ffffff'
  secondary-container: '#fe932c'
  on-secondary-container: '#663500'
  tertiary: '#323d3d'
  on-tertiary: '#ffffff'
  tertiary-container: '#495454'
  on-tertiary-container: '#bcc8c7'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#abefeb'
  primary-fixed-dim: '#8fd2cf'
  on-primary-fixed: '#00201f'
  on-primary-fixed-variant: '#00504e'
  secondary-fixed: '#ffdcc3'
  secondary-fixed-dim: '#ffb77d'
  on-secondary-fixed: '#2f1500'
  on-secondary-fixed-variant: '#6e3900'
  tertiary-fixed: '#d9e5e4'
  tertiary-fixed-dim: '#bdc9c8'
  on-tertiary-fixed: '#131d1d'
  on-tertiary-fixed-variant: '#3e4948'
  background: '#f9f9f8'
  on-background: '#1a1c1c'
  surface-variant: '#e2e2e2'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 36px
    fontWeight: '700'
    lineHeight: 44px
    letterSpacing: -0.02em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 28px
    fontWeight: '700'
    lineHeight: 36px
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 30px
    fontWeight: '600'
    lineHeight: 38px
    letterSpacing: -0.015em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 24px
    fontWeight: '600'
    lineHeight: 32px
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
    letterSpacing: -0.01em
  headline-sm:
    fontFamily: Inter
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 26px
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
    fontSize: 13px
    fontWeight: '400'
    lineHeight: 18px
  label-lg:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '600'
    lineHeight: 20px
    letterSpacing: 0.01em
  label-md:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '600'
    lineHeight: 16px
    letterSpacing: 0.02em
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '500'
    lineHeight: 14px
    letterSpacing: 0.03em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-desktop: 1.5rem
  margin: 1rem
  margin-desktop: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
---

## Brand & Style

The design system establishes a dignified, utilitarian, and dependable marketplace environment specifically tailored for local trade and artisanal service dispatch across District Buner. Its personality is grounded, understated, and transparent—avoiding superficial startup gloss or tech-centric novelty in favor of absolute clarity, civic dignity, and direct utility.

Key characteristics:
- **Tone:** Respectful, sober, highly structured, and institutional yet approachable.
- **Design Philosophy:** Utilitarian Functionalism. Every interaction reinforces trust, reliability, and local context without friction or performative decoration.
- **Aesthetic Tenets:** Zero gradients, zero decorative cartoon illustrations, strict light mode execution, structured geometry, and high-visibility affordances calibrated for reliable performance in bright outdoor conditions and varied ambient lighting.

## Colors

The palette operates under a strict daylight-first discipline, centered around deep mineral teal, warm amber accents, and clean, legible neutral surfaces.

- **Primary (`#0D5C5A`):** The cornerstone brand color, representing stability, institutional permanence, and calm assurance. Used for primary interactive triggers, active navigation markers, and verified service provider badges. Deep variant `#0A4846` is reserved for pressed states and emphasized high-contrast badges.
- **Secondary (`#D97706`):** Warm Amber. Deliberately restricted to verified trust signals, star ratings, alert states, and selective high-priority action tags. Brighter amber (`#F59E0B`) serves exclusively as the active fill for star rating meters and counter accents.
- **Tertiary (`#E6F2F1`):** Muted Teal Mist. Utilized as a resting container tint, selected filter chip backdrop, and system message pill surface.
- **Neutral Canvas (`#F7F7F6` to `#F3F4F3`):** Neutral warm-grey foundation ensuring soft visual separation from white card modules without harsh brightness.
- **Surfaces (`#FFFFFF`):** Pure white container surfaces bounded by crisp, uniform hairline dividers (`#E5E7EB`).
- **Typography Colors:** Primary content reads in Deep Charcoal (`#111827`) achieving WCAG AAA compliance. Supporting metadata and secondary labels use Muted Slate (`#4B5563`), while disabled values, hints, and placeholder text use Soft Grey (`#9CA3AF`).

## Typography

The typographic system relies entirely on Inter, prized for its mechanical neutrality, legibility on sub-pixel mobile screens, and solid tabular figure support essential for local currency (`Rs.`) and metric listings.

- **Numerics & Rates:** All price indicators and wage listings must render with tabular numbers (`tnum`) in semi-bold weight (e.g., `Rs. 1,200 / day`).
- **Hierarchy:** Strict two-weight discipline (Regular `400` and Semi-bold `600`) governs general screens; Bold `700` is reserved exclusively for top-level regional titles and categorical section anchors.
- **Localization & Tone:** Titles preserve clarity for local regional terms (e.g., *Daggar Bazar*, *Totalai Tehsil*, *Pir Baba Shrine Area*, *Swari Mor*). All headers prioritize readability over decorative flourish.

## Layout & Spacing

The layout is anchored strictly to an 8-point base grid (with a 4-point micro-increment for fine-tuning text-to-icon balance and pill paddings). 

- **Grid Disciplines:** 
  - **Mobile (<640px):** Single-column stack layout with 16px (`1rem`) outer canvas margins and 12px to 16px component gaps.
  - **Tablet (640px - 1024px):** 6-column fluid grid, 16px gutters, 24px margins.
  - **Desktop (>1024px):** 12-column fixed grid with a max-width of 1120px, 24px gutters, and auto-centered layout margins.
- **Rhythm & Safe Areas:** Vertical spacing between distinct functional groups defaults to 24px (`space-lg`), while tightly-coupled metadata pairs use 4px (`space-xs`) or 8px (`space-sm`). Touch surfaces adhere strictly to a 44px minimum vertical clearing parameter.

## Elevation & Depth

This design system deliberately minimizes deep drop shadows to prevent visual noise and preserve crisp screen rendering. Depth is expressed primarily through structural surface contrast and hairline boundary strokes.

- **Low-Contrast Hairlines:** The predominant structural separator is a 1px solid border using `#E5E7EB`. Surfaces contrast naturally against the neutral `#F7F7F6` floor without requiring shadow projection.
- **Base Level (Resting Surface):** Pure `#FFFFFF` resting directly on the `#F7F7F6` canvas, framed with a 1px `#E5E7EB` stroke.
- **Interactive Elevation (Cards, Floating Search Bars):** An ultra-subtle, warm ambient shadow: `box-shadow: 0 1px 3px 0 rgba(17, 24, 39, 0.05), 0 1px 2px -1px rgba(17, 24, 39, 0.05)`.
- **Modals, Bottom Sheets & Popovers:** Elevated overlay layer framed with a 1px `#E5E7EB` stroke and a soft ambient spread: `box-shadow: 0 10px 15px -3px rgba(17, 24, 39, 0.08), 0 4px 6px -4px rgba(17, 24, 39, 0.04)`.
- **Strict Prohibition:** Blur filters, heavy multi-layered ambient casts, and saturated colored drop shadows are prohibited across all viewports.

## Shapes

The design system enforces a uniform corner radius of 12px (`0.75rem`) for all primary UI components to project a modern, welcoming, yet orderly and practical appearance.

- **Containers, Cards & Inputs:** Fixed at 12px. No irregular nesting or hyper-rounded circular treatments on standard card bodies.
- **Buttons & Action Triggers:** Standardized at 12px to maintain continuity with text fields.
- **Pills & Status Badges:** Small badges, rating tags, and inline filter chips utilize a full-pill curvature (`9999px`) to distinguish categorical metadata from actionable input fields.
- **Avatar Elements:** Provider profile thumbnails use 12px rounded corners for personal tradespeople, while service craft icons use a 12px rounded bounding box.

## Components

### Buttons & Action Bars
- **Primary Button:** Deep Teal fill (`#0D5C5A`), pure white text, 12px radius, min-height 48px, horizontal padding 20px. Focused or pressed: `#0A4846`.
- **Secondary / Outlined Button:** Transparent fill, 1px border (`#0D5C5A`), Deep Teal text, 12px radius, min-height 48px.
- **Chat Initiation Action:** Dedicated primary action styling labeled `"Message Worker"` or `"Discuss Task"`. Directly initiates the encrypted in-app messaging thread; no phone call dialer or external web redirects are integrated.
- **Transactional Confirmation:** Cash On Completion/Delivery indicator pill permanently affixed below final agreement buttons: `"Payment: Direct Cash on Completion (Rs.)"`.

### Inputs & Selectors
- **Text & Area Fields:** Surface white (`#FFFFFF`), 12px radius, min-height 48px. Resting border: 1px `#E5E7EB`. Active focus state: 1.5px `#0D5C5A` border with no glow effect. Placeholder text: `#9CA3AF`.
- **Tehsil / Union Council Dropdown:** Standard selector clearly grouping Buner sub-regions (Daggar, Swari, Gadezai, Totalai, Pir Baba, Chinglai, Chamla, Shalbandi).

### Cards & Service Tiles
- **Worker Profile Card:** White background, 12px border radius, 1px `#E5E7EB` border. Contains provider photo (12px radius), verified trade badge (Teal Mist pill with `#0D5C5A` label), localized base district tag (`Daggar`), active star rating (Amber `#D97706`), transparent daily/job rate in tabular figures (`Rs. 1,500`), and a direct `"Chat"` trigger.
- **Service Request Card:** Shows job scope, location tag, status indicator (e.g., `Pending Review`, `In Progress`, `Completed`), and direct thread access.

### Chips & Filter Badges
- **Filter Chips:** 36px height, full-pill geometry (`roundedness: 3` pill mode). Inactive: White surface with 1px `#E5E7EB` border, Slate text (`#4B5563`). Active: Muted Teal Mist (`#E6F2F1`) background with `#0D5C5A` border and text.

### In-App Chat Interface
- **Message Bubbles:** Client messages utilize Deep Teal fill (`#0D5C5A`) with white text and 12px radius. Worker messages use Muted Teal Mist (`#E6F2F1`) with Deep Charcoal text (`#111827`) and 1px `#D1E5E3` border.
- **Agreed Quotation Card (In-Chat):** System card embedded in conversation stream, detailing agreed service summary, agreed price in `Rs. [Amount]`, and a prominent flag: `"Pay with Cash upon satisfactory completion"`.

### Checkboxes & Radios
- **Control Targets:** 20px box with 4px border radius for checkboxes; circular 20px for radios. Active state fills with Deep Teal (`#0D5C5A`) displaying a white check/dot. Touch boundaries expand to 44px minimum.