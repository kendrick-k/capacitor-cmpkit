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

/** Same scope the CMPKit widget uses: the API key, lowercased and reduced to `[a-z0-9_-]`. */
export function consentStorageKey(apiKey: string): string {
  const scope = String(apiKey || 'default')
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64) || 'default'
  return `cmpkit_consent_${scope}`
}

/** Shape written by the widget under `cmpkit_consent_<scope>`. */
export interface ConsentRecord {
  consent: Consent
  version: 1
  updatedAt: number
}

/** A stored choice older than this is not trusted: the visitor is asked again (same rule as the widget). */
export const CONSENT_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 180

export function buildConsentRecord(consent: Consent, now: number = Date.now()): ConsentRecord {
  return { consent: normalizeConsent(consent), version: 1, updatedAt: now }
}

/**
 * Parse a stored record with the widget's own rules. A choice without a date, from the future,
 * older than 180 days or from another record version cannot be relied on, except an undated
 * "refuse everything" which grants nothing.
 */
export function parseConsentRecord(raw: string | null | undefined, now: number = Date.now()): ConsentRecord | null {
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return null
    const consent = normalizeConsent(parsed.consent && typeof parsed.consent === 'object' ? parsed.consent : parsed)
    const updatedAt = Number(parsed.updatedAt || parsed.savedAt || 0)
    const grantsNothing = !consent.functional && !consent.analytics && !consent.marketing
    const undated = !Number.isFinite(updatedAt) || updatedAt <= 0
    if (undated ? !grantsNothing : (updatedAt > now || now - updatedAt > CONSENT_MAX_AGE_MS)) return null
    if (parsed.version !== undefined && parsed.version !== 1) return null
    return { consent, version: 1, updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0 }
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
