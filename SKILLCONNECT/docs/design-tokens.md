# design-tokens.md

Extracted from `/design` ("Utilitarian Trust" theme) for reuse across `mobile` (NativeWind) and `admin` (Tailwind CSS).

## Source

- Design source: Google Stitch export in `design/` (`DESIGN.md`, `design-theme.json`, `design/screens/*`)
- Date extracted: 2026-11-15
- Screens covered: Home Discovery, Technician Profile, Chat & Service Offer, Bookings Management
- Screens NOT in the design (designed in the same style): Login, Register, Location Picker, Search Results, Booking Detail, Onboarding / Provider Area, Account & Notifications, Admin web screens

## Colors

| Token | Value | Use |
|---|---|---|
| `primary` | `#0D5C5A` | Primary interactive triggers, active nav markers, verified badges, client chat bubbles |
| `primary-dark` | `#0A4846` | Pressed / focused primary button state |
| `primary-deep` | `#004341` | High-contrast primary headings/accents |
| `primary-contrast` | `#FFFFFF` | Text/icons on primary fill |
| `primary-tint` | `#E6F2F1` | Selected filter chip backdrop, provider chat bubble, system/verified pill |
| `primary-tint-border` | `#D1E5E3` | Border on provider chat bubble / teal mist pills |
| `secondary` | `#D97706` | Star ratings, trust signals, warning/pending accents |
| `secondary-bright` | `#F59E0B` | Active fill for star rating meters |
| `background` | `#F7F7F6` | Neutral canvas / screen background (`#F3F4F3` low surface) |
| `surface` | `#FFFFFF` | Pure white card / input surfaces |
| `surface-muted` | `#EEEEED` | Subtle recessed container |
| `text` | `#111827` | Primary content (Deep Charcoal) |
| `text-muted` | `#4B5563` | Supporting metadata and secondary labels (Muted Slate) |
| `text-placeholder` | `#9CA3AF` | Hints, placeholders, disabled values (Soft Grey) |
| `border` | `#E5E7EB` | Uniform 1px hairline dividers and card/input borders |
| `success` | `#0D5C5A` | Completed / approved states (with `#E6F2F1` surface) |
| `warning` | `#D97706` | Pending / awaiting response states (with `#FFDCC3` / amber tint) |
| `error` | `#BA1A1A` | Destructive / error states (`#FFDAD6` container, `#93000A` on-error-container) |

## Typography

Font family: `Inter` (system sans fallback on native where custom font not bundled; tabular numerals `tabular-nums` for PKR `Rs.` prices and metrics).

| Token | Font, size, weight, line height |
|---|---|
| `headline-xl-mobile` | Inter, 28px, 700, 36px, tracking -0.02em |
| `headline-lg-mobile` | Inter, 24px, 600, 32px, tracking -0.015em |
| `headline-md` | Inter, 20px, 600, 28px, tracking -0.01em |
| `headline-sm` | Inter, 18px, 600, 26px |
| `body-lg` | Inter, 16px, 400, 24px |
| `body-md` | Inter, 14px, 400, 20px |
| `body-sm` | Inter, 13px, 400, 18px |
| `label-lg` | Inter, 14px, 600, 20px, tracking 0.01em |
| `label-md` | Inter, 12px, 600, 16px, tracking 0.02em |
| `label-sm` | Inter, 11px, 500, 14px, tracking 0.03em |

## Spacing, radius, elevation

- Spacing scale (8pt grid, 4pt micro-increment): `space-xs` 4px, `space-sm` 8px, `space-md` 16px, `space-lg` 24px, `space-xl` 32px. Mobile outer margin: 16px. Touch target minimum: 44x44pt; primary buttons/inputs min-height: 48px.
- Corner radius: `sm` 4px, `DEFAULT` 8px, `md` 12px (cards, inputs, buttons, thumbnails), `lg` 16px, `full` 9999px (filter chips, status badges, rating pills).
- Shadows / Elevation: Flat hairline-first (`1px solid #E5E7EB`). Interactive cards: subtle ambient shadow only (`0 1px 3px rgba(17,24,39,0.05)`). No blur filters, no gradients, no colored drop shadows.

## Components (from the design)

- **Primary Button**: `#0D5C5A` fill (`#0A4846` pressed), `#FFFFFF` text, `12px` radius, min-height `48px`, horizontal padding `20px`.
- **Secondary / Outlined Button**: Transparent fill, `1px` `#0D5C5A` border, `#0D5C5A` text, `12px` radius, min-height `48px`.
- **Input**: `#FFFFFF` surface, `12px` radius, min-height `48px`, `1px` `#E5E7EB` border (`1.5px` `#0D5C5A` focused), `#9CA3AF` placeholder.
- **Card**: `#FFFFFF` surface, `12px` radius, `1px` `#E5E7EB` border.
- **Filter Chip**: `36px` height, `full` pill radius; inactive `#FFFFFF` + `#E5E7EB` border + `#4B5563` text; active `#E6F2F1` + `#0D5C5A` border/text.
- **Status Badge / Pill**: `full` pill radius, `label-md` / `label-sm`.
- **Chat Bubble**: Customer `#0D5C5A` fill + `#FFFFFF` text; Provider `#E6F2F1` fill + `#111827` text + `1px` `#D1E5E3` border (`12px` radius).

## Mapping to NativeWind / admin styles

- **Mobile (`mobile/tailwind.config.js`)**: `theme.extend.colors` defines `brand` (`#0D5C5A`, `dark: #0A4846`, `deep: #004341`, `tint: #E6F2F1`, `tint-border: #D1E5E3`), `canvas: #F7F7F6`, `surface: #FFFFFF`, `ink: #111827`, `muted: #4B5563`, `placeholder: #9CA3AF`, `hairline: #E5E7EB`, `amber-trust: #D97706`, `danger: #BA1A1A`.
- **Admin (`admin/src/index.css`)**: CSS variables / Tailwind v4 `@theme` tokens matching the same hex values (`--color-primary: #0D5C5A`, etc.).
