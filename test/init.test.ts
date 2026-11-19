import { test, beforeEach } from 'node:test'
import assert from 'node:assert/strict'
import { buildConsentRecord, consentStorageKey, normalizeConsent } from '../src/consent.ts'
import { init } from '../src/index.ts'

const KEY = consentStorageKey('test-key')
const accepted = normalizeConsent({ analytics: true })

type Fake = { events: string[], local: Map<string, string>, widget: { cb?: (c: unknown) => void } | null }

function setup({ withWidget = true, scriptFails = false }: { withWidget?: boolean, scriptFails?: boolean } = {}): Fake {
  const events: string[] = []
  const local = new Map<string, string>()
  const widget: { cb?: (c: unknown) => void } = {}
  const g = globalThis as any
  g.localStorage = {
    getItem: (k: string) => local.get(k) ?? null,
    setItem: (k: string, v: string) => { local.set(k, v) },
  }
  g.window = withWidget ? { CMPKit: { onConsentChange: (cb: any) => { widget.cb = cb; return () => {} }, openSettings() {}, getConsent() {} } } : {}
  g.document = {
    querySelector: () => null,
    createElement: () => ({ setAttribute() {} }),
    head: { appendChild: (el: any) => { events.push('inject'); queueMicrotask(() => (scriptFails ? el.onerror() : el.onload())) } },
  }
  return { events, local, widget: withWidget ? widget : null }
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return { data, get: async (k: string) => data.get(k) ?? null, set: async (k: string, v: string) => { data.set(k, v) } }
}

const base = { apiKey: 'test-key', appId: 'com.example.app', widgetReadyTimeoutMs: 200 }
beforeEach(() => { delete (globalThis as any).window })

test('the stored choice is restored before the widget loads, and seeded in the widget storage', async () => {
  const fake = setup()
  const storage = memoryStorage({ [KEY]: JSON.stringify(buildConsentRecord(accepted)) })
  const handle = await init({ ...base, storage, onConsent: (c) => { fake.events.push(`consent:${c?.analytics}`) } })
  assert.deepEqual(fake.events, ['consent:true', 'inject'])
  assert.equal(handle.hasConsent('analytics'), true)
  assert.ok(fake.local.get(KEY), 'widget localStorage seeded with the widget record format')
})

test('onConsent(null) is called when nothing is stored', async () => {
  const fake = setup()
  const seen: unknown[] = []
  const handle = await init({ ...base, storage: memoryStorage(), onConsent: (c) => { seen.push(c) } })
  assert.deepEqual(seen, [null])
  assert.equal(handle.getConsent(), null)
  assert.equal(handle.hasConsent('analytics'), false)
  assert.equal(fake.local.size, 0)
})

test('a consent change from the widget is persisted and emitted', async () => {
  const fake = setup()
  const storage = memoryStorage()
  const seen: unknown[] = []
  const handle = await init({ ...base, storage, onConsent: (c) => { seen.push(c?.analytics ?? null) } })
  const changes: unknown[] = []
  handle.onChange((c) => changes.push(c?.analytics))
  await (fake.widget!.cb as any)({ analytics: true })
  assert.deepEqual(seen, [null, true])
  assert.deepEqual(changes, [true])
  const stored = JSON.parse(storage.data.get(KEY)!)
  assert.equal(stored.version, 1)
  assert.equal(stored.consent.analytics, true)
  assert.ok(stored.updatedAt > 0)
  assert.equal(handle.hasConsent('analytics'), true)
})

test('a missing widget warns and init still resolves', async () => {
  setup({ withWidget: false })
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(args.join(' ')) }
  try {
    const handle = await init({ ...base, storage: memoryStorage() })
    assert.equal(handle.getConsent(), null)
  } finally {
    console.warn = original
  }
  assert.equal(warnings.length, 1)
  assert.match(warnings[0], /widget not ready: consent changes will not be persisted/)
})

test('errors in onConsent, listeners and storage never make init() or the widget callback fail', async () => {
  const fake = setup()
  const errors: unknown[] = []
  const original = console.error
  console.error = (...args: unknown[]) => { errors.push(args) }
  try {
    const storage = { get: async () => null, set: async () => { throw new Error('disk full') } }
    const handle = await init({ ...base, storage, onConsent: () => { throw new Error('user bug') } })
    handle.onChange(() => { throw new Error('listener bug') })
    await (fake.widget!.cb as any)({ analytics: true })
    assert.equal(handle.hasConsent('analytics'), true)
  } finally {
    console.error = original
  }
  assert.ok(errors.length >= 3)
})

test('a script that fails to load warns, skips the widget wait, and init still restores the choice', async () => {
  const fake = setup({ scriptFails: true })
  const storage = memoryStorage({ [KEY]: JSON.stringify(buildConsentRecord(accepted)) })
  const seen: unknown[] = []
  const warnings: string[] = []
  const original = console.warn
  console.warn = (...args: unknown[]) => { warnings.push(String(args[0])) }
  const started = Date.now()
  try {
    const handle = await init({ ...base, widgetReadyTimeoutMs: 5000, storage, onConsent: (c) => { seen.push(c?.analytics) } })
    assert.equal(handle.hasConsent('analytics'), true)
  } finally {
    console.warn = original
  }
  assert.ok(Date.now() - started < 1000, 'did not wait for the widget')
  assert.deepEqual(seen, [true])
  assert.deepEqual(warnings, ['[capacitor-cmpkit] widget failed to load: consent changes will not be persisted'])
  assert.ok(fake.events.includes('inject'))
})

test('setConsent normalizes, persists natively and in localStorage, then notifies', async () => {
  const fake = setup()
  const storage = memoryStorage()
  const seen: unknown[] = []
  const handle = await init({ ...base, showBanner: false, storage, onConsent: (c) => { seen.push(c?.analytics ?? null) } })
  const changes: unknown[] = []
  handle.onChange((c) => changes.push(c?.marketing))
  await handle.setConsent({ analytics: true, necessary: false } as any)
  assert.deepEqual(handle.getConsent(), { necessary: true, functional: false, analytics: true, marketing: false })
  for (const raw of [storage.data.get(KEY), fake.local.get(KEY)]) {
    const stored = JSON.parse(raw!)
    assert.equal(stored.version, 1)
    assert.equal(stored.consent.analytics, true)
    assert.ok(stored.updatedAt > 0)
  }
  assert.deepEqual(seen, [null, true])
  assert.deepEqual(changes, [false])
  // missing categories keep their value
  await handle.setConsent({ marketing: true })
  assert.deepEqual(handle.getConsent(), { necessary: true, functional: false, analytics: true, marketing: true })
})

test('setConsent with an identical choice does nothing', async () => {
  setup()
  const storage = memoryStorage({ [KEY]: JSON.stringify(buildConsentRecord(accepted)) })
  let calls = 0
  let writes = 0
  const counting = { get: storage.get, set: async (k: string, v: string) => { writes++; await storage.set(k, v) } }
  const handle = await init({ ...base, showBanner: false, storage: counting, onConsent: () => { calls++ } })
  assert.equal(calls, 1) // startup call only
  let listenerCalls = 0
  handle.onChange(() => { listenerCalls++ })
  await handle.setConsent({ analytics: true })
  assert.equal(calls, 1)
  assert.equal(listenerCalls, 0)
  assert.equal(writes, 0)
})

test('setConsent logs errors from storage and callbacks and never throws', async () => {
  setup()
  const errors: unknown[] = []
  const original = console.error
  console.error = (...args: unknown[]) => { errors.push(args) }
  try {
    const storage = { get: async () => null, set: async () => { throw new Error('disk full') } }
    const handle = await init({ ...base, showBanner: false, storage, onConsent: () => { throw new Error('user bug') } })
    handle.onChange(() => { throw new Error('listener bug') })
    await handle.setConsent({ analytics: true })
    assert.equal(handle.hasConsent('analytics'), true)
  } finally {
    console.error = original
  }
  assert.ok(errors.length >= 3)
})
