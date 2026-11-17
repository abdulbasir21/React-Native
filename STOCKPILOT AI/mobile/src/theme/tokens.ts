export const colors = {
  primary: '#0B6E5C',
  primaryDark: '#064B3F',
  primaryDeep: '#005445',
  primarySoft: '#E6F4F1',
  primaryFixed: '#9FF2DB',
  secondary: '#F2B84B',
  secondaryContainer: '#FDC254',
  secondaryDark: '#7D5700',
  background: '#F7F8F6',
  surface: '#FFFFFF',
  surfaceSubtle: '#F9F9FF',
  surfaceLow: '#F1F3FF',
  surfaceContainer: '#E9EDFF',
  border: '#E6E9E4',
  borderInput: '#D0D5DD',
  divider: '#F2F4F7',
  outline: '#6E7975',
  outlineVariant: '#BEC9C4',
  textPrimary: '#101828',
  textDark: '#141B2C',
  textSecondary: '#667085',
  textMuted: '#98A2B3',
  success: '#12B76A',
  successBg: '#ECFDF3',
  successText: '#027A48',
  warning: '#F79009',
  warningBg: '#FEF0C7',
  warningText: '#B54708',
  error: '#D92D20',
  errorBg: '#FEE4E2',
  errorText: '#B42318',
  errorBorder: '#FDA29B',
  info: '#2E90FA',
  infoBg: '#EFF8FF',
  infoText: '#175CD3',
  white: '#FFFFFF',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  screenPadding: 16,
  gutter: 16,
} as const;

export const radii = {
  sm: 4,
  base: 8,
  md: 12,
  lg: 16,
  xl: 20,
  pill: 9999,
} as const;

export const typography = {
  headlineLg: { fontSize: 30, lineHeight: 38, fontWeight: '700' as const },
  headlineMd: { fontSize: 24, lineHeight: 32, fontWeight: '700' as const },
  headlineSm: { fontSize: 20, lineHeight: 28, fontWeight: '600' as const },
  currencyDisplay: {
    fontSize: 28,
    lineHeight: 34,
    fontWeight: '800' as const,
    letterSpacing: -0.56,
  },
  currencyMd: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '700' as const,
    letterSpacing: -0.18,
  },
  titleLg: { fontSize: 18, lineHeight: 24, fontWeight: '600' as const },
  titleMd: { fontSize: 16, lineHeight: 22, fontWeight: '600' as const },
  bodyLg: { fontSize: 16, lineHeight: 24, fontWeight: '400' as const },
  bodyMd: { fontSize: 14, lineHeight: 20, fontWeight: '400' as const },
  bodySm: { fontSize: 12, lineHeight: 18, fontWeight: '400' as const },
  labelLg: { fontSize: 14, lineHeight: 20, fontWeight: '600' as const },
  labelMd: { fontSize: 12, lineHeight: 16, fontWeight: '500' as const },
  labelSm: { fontSize: 10, lineHeight: 14, fontWeight: '600' as const, letterSpacing: 0.4 },
} as const;

export const layout = {
  minTouchTarget: 48,
  buttonPrimaryHeight: 52,
  buttonSecondaryHeight: 48,
  inputHeight: 48,
  chipHeight: 36,
  pillHeight: 24,
  stickyFooterMinHeight: 64,
} as const;

export const paymentStatusColors = {
  PAID: { bg: colors.successBg, text: colors.successText },
  PARTIAL: { bg: colors.warningBg, text: colors.warningText },
  UNPAID: { bg: colors.errorBg, text: colors.errorText },
  NOT_APPLICABLE: { bg: colors.divider, text: colors.textSecondary },
} as const;

export const stockStatusColors = {
  OK: { bg: colors.successBg, text: colors.successText },
  LOW: { bg: colors.warningBg, text: colors.warningText },
  OUT: { bg: colors.errorBg, text: colors.errorText },
} as const;
