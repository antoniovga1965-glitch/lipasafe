// Shared design tokens for the Diaspora Escrow vertical.
// Import these instead of hardcoding colors/spacing in each screen,
// so every screen stays visually consistent and only needs updating in one place.

export const COLORS = {
  primary: '#059669',      // brand green — matches LipaSafe's core palette
  primaryDark: '#047857',
  primaryLight: '#D1FAE5',
  background: '#F8FAFC',
  card: '#FFFFFF',
  border: '#E2E8F0',
  textPrimary: '#0F172A',
  textSecondary: '#64748B',
  disabled: '#CBD5E1',
};

export const SPACING = {
  screenPadding: 20,
  cardPadding: 16,
  gap: 12,
};

export const RADIUS = {
  card: 16,
  hero: 20,
  button: 14,
  pill: 24,
};

// Reusable style objects for the most common containers,
// so screens don't redefine "container" and "footer" slightly differently each time.
export const SHARED_STYLES = {
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  scroll: {
    paddingHorizontal: SPACING.screenPadding,
    paddingBottom: 24,
  },
  card: {
    backgroundColor: COLORS.card,
    borderRadius: RADIUS.card,
    borderWidth: 1,
    borderColor: COLORS.border,
    padding: SPACING.cardPadding,
    marginBottom: SPACING.gap,
  },
  footer: {
    paddingHorizontal: SPACING.screenPadding,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderTopColor: COLORS.border,
    backgroundColor: COLORS.card,
  },
  ctaButton: {
    backgroundColor: COLORS.primary,
    borderRadius: RADIUS.button,
    paddingVertical: 16,
    alignItems: 'center',
  },
  ctaButtonDisabled: {
    backgroundColor: COLORS.disabled,
  },
  ctaButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '700',
  },
};
