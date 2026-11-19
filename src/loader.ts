export interface WidgetOptions {
  /** Public site key from the CMPKit dashboard. */
  apiKey: string
  /** Widget script URL. */
  scriptUrl?: string
  /** Force the banner language (for example `fr`). */
  locale?: string
  /** Force the widget theme. */
  theme?: string
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
