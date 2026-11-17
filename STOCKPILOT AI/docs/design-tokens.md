# StockPilot AI — Design Tokens

**Location:** `docs/design-tokens.md`
**Status:** Extracted from `/design` (`design/DESIGN.md`, `design/project.json`, `design/design-system.json`, and `design/01-splash-screen.html` through `design/07-home-dashboard-v2.html`).
**Rule:** Reuse these tokens via `mobile/src/theme/tokens.ts` and `mobile/tailwind.config.js` everywhere. No hard-coded hex colors or arbitrary spacing in screens.

## 1. Source Screens in `/design`
- `01-splash-screen.html` / `.png` — Splash Screen
- `02-onboarding.html` / `.png` — Onboarding
- `03-login.html` / `.png` — Login
- `04-registration.html` / `.png` — Registration
- `05-shop-setup.html` / `.png` — Shop Setup
- `06-home-dashboard-v1.html` / `.png` — Home Dashboard (Stock Alerts & Recent Sales)
- `07-home-dashboard-v2.html` / `.png` — Home Dashboard (Hourly Sales Trend, Fast Actions, Bottom Nav & AI Copilot FAB)

### Out-of-Scope Visual Elements Found in `/design` (Not Built per `MASTER_PROMPT.md` Section 14)
- `03-login.html`: "Forgot password?" link (password reset by email is out of scope), "Quick Biometric Login for shop shift" / "Cashier Shift 1" (employee/shift roles and biometric lock are out of scope).
- `07-home-dashboard-v2.html`: "On Delivery" purchase shipping status (purchases confirm immediately in MVP).

---

## 2. Colors

| Token | Hex Value | Role / Source |
|---|---|---|
| `primary` | `#0B6E5C` | Primary emerald-teal CTAs, active nav pill, brand icon (`primary-container` in Stitch; `#0B6E5C` in `DESIGN.md` & `07-home-dashboard-v2.html`) |
| `primaryDark` | `#064B3F` | Pressed state, deep pine headers (`overrideTertiaryColor` / `DESIGN.md`) |
| `primaryDeep` | `#005445` | Deep primary text/hover (`primary` in `project.json`) |
| `primarySoft` | `#E6F4F1` | Active chips, selected row tint, icon containers (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `primaryFixed` | `#9FF2DB` | Selection highlight / fixed container (`project.json`) |
| `secondary` | `#F2B84B` | Warm gold AI highlights, replenishment nudges (`DESIGN.md`) |
| `secondaryContainer` | `#FDC254` | AI Copilot icon tint, warm accent (`project.json` & `07-home-dashboard-v2.html`) |
| `secondaryDark` | `#7D5700` | High-contrast secondary text (`project.json`) |
| `background` | `#F7F8F6` | Main canvas off-white (`DESIGN.md` & `03-login.html` / `07-home-dashboard-v2.html` `body`) |
| `surface` | `#FFFFFF` | Cards, inputs, bottom nav bar, modal sheets (`DESIGN.md` & `surface-container-lowest`) |
| `surfaceSubtle` | `#F9F9FF` | Light tinted surface (`project.json`) |
| `surfaceLow` | `#F1F3FF` | Subtle icon/row backing (`07-home-dashboard-v2.html`) |
| `surfaceContainer` | `#E9EDFF` | Container backing (`project.json`) |
| `border` | `#E6E9E4` | Card hairline borders, sticky bar top border (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `borderInput` | `#D0D5DD` | Form input borders (`DESIGN.md`) |
| `divider` | `#F2F4F7` | List row dividers (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `outline` | `#6E7975` | Subtle icons & outlines (`project.json`) |
| `outlineVariant` | `#BEC9C4` | Soft borders (`project.json`) |
| `textPrimary` | `#101828` | Titles, currency values, primary labels (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `textDark` | `#141B2C` | Stitch `on-surface` fallback (`project.json`) |
| `textSecondary` | `#667085` | Subtitles, SKU metadata, inactive tab labels (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `textMuted` | `#98A2B3` | Placeholders, disabled/inactive icons (`DESIGN.md`) |
| `success` | `#12B76A` | Payment received, in-stock, credit (`DESIGN.md`) |
| `successBg` | `#ECFDF3` | Paid / Stock OK pill background (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `successText` | `#027A48` | Paid / Stock OK pill text (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `warning` | `#F79009` | Low stock, partial payment, credit/Udhaar (`DESIGN.md`) |
| `warningBg` | `#FEF0C7` | Partial / Low stock / Credit pill background (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `warningText` | `#B54708` | Partial / Low stock / Credit pill text (`DESIGN.md` & `07-home-dashboard-v2.html`) |
| `error` | `#D92D20` | Out of stock, unpaid/cancelled, debits (`DESIGN.md`) |
| `errorBg` | `#FEE4E2` | Out of stock / Unpaid / Cancelled pill background |
| `errorText` | `#B42318` | High-contrast error pill text |
| `errorBorder` | `#FDA29B` | Destructive button border (`DESIGN.md`) |
| `info` | `#2E90FA` | Sync / shift / system status (`DESIGN.md`) |
| `infoBg` | `#EFF8FF` | Info banner background |
| `infoText` | `#175CD3` | Info banner text |

### Payment & Stock Status Mapping
- **Payment Status (`BR-PAY2`):**
  - `PAID`: bg `#ECFDF3`, text `#027A48`
  - `PARTIAL`: bg `#FEF0C7`, text `#B54708`
  - `UNPAID`: bg `#FEE4E2`, text `#B42318`
  - `NOT_APPLICABLE`: bg `#F2F4F7`, text `#667085`
- **Stock Status (`BR-P6`):**
  - `OK`: bg `#ECFDF3`, text `#027A48`
  - `LOW`: bg `#FEF0C7`, text `#B54708`
  - `OUT`: bg `#FEE4E2`, text `#B42318`

---

## 3. Typography (`DESIGN.md` & `project.json`)

- **Headings & Currency Font Family:** `Plus Jakarta Sans`
- **Body & Label Font Family:** `Inter`
- **Numeric Figures:** `tabular-nums` (`fontVariant: ['tabular-nums']`) on all currency, SKU, quantity, and receipt figures.

| Token | Font | Size | Line Height | Weight | Letter Spacing |
|---|---|---|---|---|---|
| `headlineLg` | Plus Jakarta Sans | `30` | `38` | `700` | `0` |
| `headlineMd` | Plus Jakarta Sans | `24` | `32` | `700` | `0` |
| `headlineSm` | Plus Jakarta Sans | `20` | `28` | `600` | `0` |
| `currencyDisplay` | Plus Jakarta Sans | `28` | `34` | `800` | `-0.56` |
| `currencyMd` | Plus Jakarta Sans | `18` | `24` | `700` | `-0.18` |
| `titleLg` | Plus Jakarta Sans | `18` | `24` | `600` | `0` |
| `titleMd` | Plus Jakarta Sans | `16` | `22` | `600` | `0` |
| `bodyLg` | Inter | `16` | `24` | `400` | `0` |
| `bodyMd` | Inter | `14` | `20` | `400` | `0` |
| `bodySm` | Inter | `12` | `18` | `400` | `0` |
| `labelLg` | Inter | `14` | `20` | `600` | `0` |
| `labelMd` | Inter | `12` | `16` | `500` | `0` |
| `labelSm` | Inter | `10` | `14` | `600` | `0.4` |

---

## 4. Spacing, Radii, Elevation & Touch Targets

- **Spacing Scale (8pt Grid):** `xs: 4`, `sm: 8`, `md: 16`, `lg: 24`, `xl: 32`, `screenPadding: 16`, `gutter: 16`
- **Radii:** `sm: 4`, `base: 8`, `md: 12` (buttons, inputs, filter chips), `lg: 16` (cards), `xl: 20` (sheets/summary cards), `pill: 9999`
- **Elevation:**
  - `level0`: Flat canvas (`#F7F8F6`, no shadow)
  - `level1`: Card (`#FFFFFF`, `borderWidth: 1`, `borderColor: #E6E9E4`, subtle shadow `rgba(16,24,40,0.04)`)
  - `level2`: Modal / dropdown (`#FFFFFF`, `borderWidth: 1`, `borderColor: #E6E9E4`, shadow `rgba(16,24,40,0.08)`)
  - `level3`: Sticky footer / bottom tab bar (`#FFFFFF`, `borderTopWidth: 1`, `borderTopColor: #E6E9E4`, upward shadow `rgba(16,24,40,0.06)`)
- **Touch Targets:** Minimum `48 × 48 px` (`minTouchTarget: 48`, exceeding the `44 px` requirement in `AGENTS.md`).
- **Icons:** `@expo/vector-icons` (`MaterialIcons` / `Ionicons`, matching Stitch `Material Symbols Outlined` visual metaphor, default sizes `18`, `20`, `22`, `24`).
- **Bottom Tab Bar (`07-home-dashboard-v2.html`):** 5 tabs (`Home`, `Products`, `Sales`, `Reports`, `More`). Active tab uses `#0B6E5C` pill (`borderRadius: 12`) with `#FFFFFF` icon & label; inactive tabs use `#667085`. Floating AI Copilot pill (`#0B6E5C` bg, `#FDC254` sparkle icon, white text) sits bottom-right above the tab bar on Home & Sales.
