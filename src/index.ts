import { Preferences } from '@capacitor/preferences'
import {
  type Consent, type ConsentCategory, DEFAULT_CONSENT, hasConsent, normalizeConsent,
  parseStoredConsent, sameConsent,
} from './consent.ts'
import { injectWidget, type WidgetOptions } from './loader.ts'

export type { Consent, ConsentCategory } from './consent.ts'
export { DEFAULT_CONSENT } from './consent.ts'

const STORAGE_KEY = 'cmpkit_consent'

export interface CmpkitStorage {
  get(key: string): Promise<string | null>
  set(key: string, value: string): Promise<void>
}

const nativeStorage: CmpkitStorage = {
  get: async (key) => (await Preferences.get({ key })).value,
  set: async (key, value) => { await Preferences.set({ key, value }) },
}

export interface InitOptions extends WidgetOptions {
  /**
   * Called once at startup with the stored choice (or `null` if the user has not answered)
   * and again on every change. Start or stop native SDKs here: keep them off while `consent` is `null`.
   */
  onConsent?: (consent: Consent | null) => void | Promise<void>
  /** Override the native storage (tests, custom backends). */
  storage?: CmpkitStorage
  /** Load the web banner. Set to `false` to only restore the stored choice. Default `true`. */
  showBanner?: boolean
}

export interface CmpkitHandle {
  /** Current choice, or `null` until the user answers. */
  getConsent(): Consent | null
  hasConsent(category: ConsentCategory): boolean
  /** Subscribe to changes; returns an unsubscribe function. */
  onChange(callback: (consent: Consent | null) => void): () => void
  /** Reopen the preferences panel. */
  openSettings(): Promise<void>
}

type Widget = {
  getConsent(): Consent
  onConsentChange(cb: (c: Consent) => void): () => void
  openSettings(): unknown
}

const widget = (): Widget | undefined => (window as unknown as { CMPKit?: Widget }).CMPKit

/**
 * Restore the stored choice from native storage BEFORE anything else starts, then load the banner.
 * The web localStorage copy is not trusted: iOS can purge it, so the native copy wins.
 */
export async function init(options: InitOptions): Promise<CmpkitHandle> {
  const storage = options.storage ?? nativeStorage
  let current = parseStoredConsent(await storage.get(STORAGE_KEY))
  const listeners = new Set<(c: Consent | null) => void>()

  const emit = async (next: Consent | null) => {
    for (const cb of listeners) cb(next)
    await options.onConsent?.(next)
  }

  // Seed the widget's own storage so the banner does not reappear after a purge.
  if (current) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(current)) } catch { /* private mode */ }
  }
  await emit(current)

  if (options.showBanner !== false) {
    await injectWidget(options)
    const w = widget()
    w?.onConsentChange(async (raw) => {
      const next = normalizeConsent(raw)
      if (sameConsent(current, next)) return
      current = next
      await storage.set(STORAGE_KEY, JSON.stringify(next))
      await emit(next)
    })
  }

  return {
    getConsent: () => (current ? { ...current } : null),
    hasConsent: (category) => hasConsent(current, category),
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
    openSettings: async () => { await widget()?.openSettings() },
  }
}

