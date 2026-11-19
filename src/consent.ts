export type ConsentCategory = 'necessary' | 'functional' | 'analytics' | 'marketing'
export type Consent = Record<ConsentCategory, boolean>

/** Nothing optional is allowed until the user answers. */
export const DEFAULT_CONSENT: Consent = {
  necessary: true,
  functional: false,
  analytics: false,
  marketing: false,
}

/** Parse a stored or widget-provided value; anything invalid falls back to "all refused". */
export function normalizeConsent(value: unknown): Consent {
  if (!value || typeof value !== 'object') return { ...DEFAULT_CONSENT }
  const v = value as Record<string, unknown>
  return {
    necessary: true,
    functional: v.functional === true,
    analytics: v.analytics === true,
    marketing: v.marketing === true,
  }
}

export function parseStoredConsent(raw: string | null | undefined): Consent | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? normalizeConsent(parsed) : null
  } catch {
    return null
  }
}

export function hasConsent(consent: Consent | null, category: ConsentCategory): boolean {
  return category === 'necessary' ? true : consent?.[category] === true
}

export function sameConsent(a: Consent | null, b: Consent | null): boolean {
  if (!a || !b) return a === b
  return a.functional === b.functional && a.analytics === b.analytics && a.marketing === b.marketing
}
