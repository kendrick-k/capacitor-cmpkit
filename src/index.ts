import { App } from '@capacitor/app'
import { Preferences } from '@capacitor/preferences'
import {
  buildConsentRecord, type Consent, type ConsentCategory, consentStorageKey, hasConsent,
  normalizeConsent, parseConsentRecord, sameConsent,
} from './consent.ts'
import { resolveAppId } from './app-id.ts'
import { injectWidget, type WidgetOptions } from './loader.ts'
import { getWidget, waitForWidget, type Widget } from './widget.ts'

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
  /**
   * Record a choice yourself (own banner, `showBanner: false`). Missing categories keep their current value.
   * Normalized, persisted natively and in the WebView storage, then listeners and `onConsent` are called.
   * Does nothing if the choice is identical to the current one. Errors are logged, never thrown.
   *
   * When the widget is loaded, the choice is also passed to `window.CMPKit.updateConsent`, which sends the
   * proof of consent to CMPKit. Without the widget (`showBanner: false` or load failure) nothing is sent to CMPKit.
   */
  setConsent(consent: Partial<Consent>): Promise<void>
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

  let readyWidget: Widget | undefined

  // Shared by the widget callback and `setConsent`: dedupe, persist, then notify. Never throws.
  const apply = async (next: Consent, { fromUser }: { fromUser: boolean }) => {
    try {
      if (sameConsent(current, next)) return
      current = next
      // `current` is already updated, so the `onConsentChange` the widget fires synchronously
      // inside `updateConsent` is dropped by the check above: no double notification.
      let widgetSaved = false
      if (fromUser && readyWidget && typeof readyWidget.updateConsent === 'function') {
        try {
          readyWidget.updateConsent(next)
          widgetSaved = true
        } catch (error) {
          console.error(`${log} widget.updateConsent failed:`, error)
        }
      }
      const writeLocal = fromUser && !widgetSaved // the widget writes its own localStorage copy
      const record = buildConsentRecord(next)
      try {
        await storage.set(storageKey, JSON.stringify(record))
      } catch (error) {
        console.error(`${log} could not persist the choice:`, error)
      }
      if (writeLocal) {
        try { localStorage.setItem(storageKey, JSON.stringify(record)) } catch { /* private mode */ }
      }
      await emit(next)
    } catch (error) {
      console.error(`${log} could not handle the consent change:`, error)
    }
  }

  if (options.showBanner !== false) {
    const appId = await resolveAppId(options.appId, () => App.getInfo())
    let loaded = true
    try {
      await injectWidget({ ...options, appId })
    } catch (error) {
      loaded = false
      console.warn(`${log} widget failed to load: consent changes will not be persisted`, error)
    }
    if (loaded) {
      const widget = await waitForWidget(getWidget, { timeoutMs: options.widgetReadyTimeoutMs ?? 5000 })
      if (!widget) {
        console.warn(`${log} widget not ready: consent changes will not be persisted`)
      } else {
        readyWidget = widget
        widget.onConsentChange((raw) => apply(normalizeConsent(raw), { fromUser: false }))
      }
    }
  }

  return {
    getConsent: () => (current ? { ...current } : null),
    hasConsent: (category) => hasConsent(current, category),
    onChange(cb) { listeners.add(cb); return () => { listeners.delete(cb) } },
    setConsent: (consent) => apply(normalizeConsent({ ...(current ?? {}), ...consent }), { fromUser: true }),
    openSettings: async () => { await getWidget()?.openSettings() },
  }
}
