/**
 * Resolve the identifier of the running app (iOS bundle ID / Android applicationId).
 * An explicit value wins; otherwise the native app info is read. On the web there is no app id: returns ''.
 * The value is declared by the client: CMPKit uses it as a configuration guard, not as a security proof.
 */
export async function resolveAppId(
  explicit: string | undefined,
  getInfo: () => Promise<{ id?: string }>,
): Promise<string> {
  const given = explicit?.trim()
  if (given) return given
  try {
    return (await getInfo()).id?.trim() ?? ''
  } catch {
    return ''
  }
}
