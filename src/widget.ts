export type Widget = {
  getConsent(): unknown
  onConsentChange(cb: (c: unknown) => void): () => void
  openSettings(): unknown
}

export const getWidget = (): Widget | undefined => {
  const w = (globalThis as unknown as { window?: { CMPKit?: Partial<Widget> } }).window?.CMPKit
  return w && typeof w.onConsentChange === 'function' ? (w as Widget) : undefined
}

/** Poll until `window.CMPKit` exposes its API. Resolves `undefined` after `timeoutMs` (never throws). */
export async function waitForWidget(
  find: () => Widget | undefined = getWidget,
  { intervalMs = 50, timeoutMs = 5000 }: { intervalMs?: number, timeoutMs?: number } = {},
): Promise<Widget | undefined> {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    const found = find()
    if (found) return found
    if (Date.now() >= deadline) return undefined
    await new Promise<void>((resolve) => setTimeout(resolve, intervalMs))
  }
}
