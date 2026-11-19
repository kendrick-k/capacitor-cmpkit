import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import {
  buildConsentRecord, type Consent, type ConsentCategory, consentStorageKey, hasConsent,
  normalizeConsent, parseConsentRecord, sameConsent,
} from './consent.ts'
import { resolveAppId } from './app-id.ts'
import { injectWidget, type WidgetOptions } from './loader.ts'
import { getWidget, waitForWidget } from './widget.ts'

export type { Consent, ConsentCategory } from './consent.ts'
export { DEFAULT_CONSENT } from './consent.ts'

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
   * An error thrown here is logged and never makes `init()` fail.
   */
  onConsent?: (consent: Consent | null) => void | Promise<void>
  /** Override the native storage (tests, custom backends). */
  storage?: CmpkitStorage
  /** Load the web banner. Set to `false` to only restore the stored choice. Default `true`. */
  showBanner?: boolean
  /** How long to wait for the widget to be ready after its script loaded. Default 5000 ms. */
  widgetReadyTimeoutMs?: number
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

const log = '[capacitor-cmpkit]'

/**
 * Restore the stored choice from native storage BEFORE anything else starts, then load the banner.
 * The web localStorage copy is not trusted: iOS can purge it, so the native copy wins.
 */
export async function init(options: InitOptions): Promise<CmpkitHandle> {
  const storage = options.storage ?? nativeStorage
  const storageKey = consentStorageKey(options.apiKey)
  const listeners = new Set<(c: Consent | null) => void>()

  let record = null as ReturnType<typeof parseConsentRecord>
  try {
    record = parseConsentRecord(await storage.get(storageKey))
  } catch (error) {
    console.error(`${log} could not read the stored choice:`, error)
  }
  let current: Consent | null = record?.consent ?? null

  const emit = async (next: Consent | null) => {
    for (const cb of listeners) {
      try { cb(next) } catch (error) { console.error(`${log} change listener failed:`, error) }
    }
    try { await options.onConsent?.(next) } catch (error) { console.error(`${log} onConsent failed:`, error) }
  }

  // Seed the widget's own storage (same key and record format) so the banner does not reappear after a purge.
  if (record) {
    try {
      const existing = parseConsentRecord(localStorage.getItem(storageKey))
      if (!existing || existing.updatedAt < record.updatedAt) {
        localStorage.setItem(storageKey, JSON.stringify(record))
      }
    } catch { /* private mode */ }
  }
  await emit(current)

  if (options.showBanner !== false) {
    const appId = await resolveAppId(options.appId, () => App.getInfo())
    await injectWidget({ ...options, appId })
    const widget = await waitForWidget(getWidget, { timeoutMs: options.widgetReadyTimeoutMs ?? 5000 })
    if (!widget) {
      console.warn(`${log} widget not ready: consent changes will not be persisted`)
    } else {
      widget.onConsentChange(async (raw) => {
        try {
          const next = normalizeConsent(raw)
          if (sameConsent(current, next)) return
          current = next
          try {
            await storage.set(storageKey, JSON.stringify(buildConsentRecord(next)))
          } catch (error) {
            console.error(`${log} could not persist the choice:`, error)
          }
          await emit(next)
        } catch (error) {
          console.error(`${log} could not handle the consent change:`, error)
        }
      })
    }
  }

  return {
    getConsent: () => (current ? { ...current } : null),
    hasConsent: (category) => hasConsent(current, category),
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
    openSettings: async () => { await getWidget()?.openSettings() },
  }
}
