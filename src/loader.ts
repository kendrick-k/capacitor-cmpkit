export interface WidgetOptions {
  /** Public site key from the CMPKit dashboard. */
  apiKey: string
  /** Widget script URL. */
  scriptUrl?: string
  /** Force the banner language (for example `fr`). */
  locale?: string
  /** Force the widget theme. */
  theme?: string
  /** App identifier (iOS bundle ID / Android applicationId), sent to CMPKit as `data-app-id`. */
  appId?: string
  /**
   * Let the widget manage the page `dataLayer` (consent events, Google Consent Mode). Default `true`,
   * the same value the CMPKit dashboard snippet uses.
   */
  dataLayer?: boolean
  /**
   * Let the widget inject the vendors configured on the project (Google Tag Manager and the managed vendors)
   * once the visitor consents. Default `true`, like the dashboard snippet. Needs `dataLayer`.
   */
  autoInjectVendors?: boolean
  /** Forward every `dataLayer` push to CMPKit. Default `false`. */
  dataLayerForwardAll?: boolean
}

export const DEFAULT_SCRIPT_URL = 'https://cmpkit.com/widget.js'

/** Attributes of the widget `<script>` tag, or `null` without a key. */
export function buildScriptAttributes(options: WidgetOptions): Record<string, string> | null {
  const apiKey = options.apiKey?.trim()
  if (!apiKey) return null
  const attrs: Record<string, string> = {
    src: options.scriptUrl?.trim() || DEFAULT_SCRIPT_URL,
    'data-api-key': apiKey,
    'data-load-strategy': 'auto',
  }
  if (options.locale?.trim()) attrs['data-locale'] = options.locale.trim()
  if (options.theme?.trim()) attrs['data-theme'] = options.theme.trim()
  if (options.appId?.trim()) attrs['data-app-id'] = options.appId.trim()
  // Same attributes as the dashboard install snippet: without them the widget does not inject GTM or vendors.
  attrs['data-datalayer'] = String(options.dataLayer ?? true)
  attrs['data-datalayer-forward-all'] = String(options.dataLayerForwardAll ?? false)
  attrs['data-auto-inject-vendors'] = String(options.autoInjectVendors ?? true)
  return attrs
}

/** Inject the widget script once. Resolves when it has loaded. */
export function injectWidget(options: WidgetOptions): Promise<void> {
  const attrs = buildScriptAttributes(options)
  if (!attrs) return Promise.reject(new Error('[capacitor-cmpkit] apiKey is required'))
  if (document.querySelector('script[data-api-key]')) return Promise.resolve()
  return new Promise((resolve, reject) => {
    const script = document.createElement('script')
    for (const [k, v] of Object.entries(attrs)) script.setAttribute(k, v)
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('[capacitor-cmpkit] widget failed to load'))
    document.head.appendChild(script)
  })
}
