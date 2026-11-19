import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hasConsent, normalizeConsent, parseStoredConsent, sameConsent } from '../src/consent.ts'
import { buildScriptAttributes } from '../src/loader.ts'

test('invalid or empty input refuses everything optional', () => {
  assert.deepEqual(normalizeConsent(null), { necessary: true, functional: false, analytics: false, marketing: false })
  assert.equal(parseStoredConsent('not json'), null)
  assert.equal(parseStoredConsent(''), null)
})

test('only strict true grants a category', () => {
  const c = normalizeConsent({ analytics: 'true', marketing: 1, functional: true })
  assert.deepEqual(c, { necessary: true, functional: true, analytics: false, marketing: false })
})

test('necessary is always allowed, unanswered refuses optional', () => {
  assert.equal(hasConsent(null, 'necessary'), true)
  assert.equal(hasConsent(null, 'analytics'), false)
  assert.equal(hasConsent(normalizeConsent({ analytics: true }), 'analytics'), true)
})

test('sameConsent compares optional categories', () => {
  assert.equal(sameConsent(null, null), true)
  assert.equal(sameConsent(null, normalizeConsent({})), false)
  assert.equal(sameConsent(normalizeConsent({ analytics: true }), normalizeConsent({ analytics: true })), true)
})

test('script attributes need a key and default to cmpkit.com', () => {
  assert.equal(buildScriptAttributes({ apiKey: '  ' }), null)
  const a = buildScriptAttributes({ apiKey: ' k ', locale: 'fr' })!
  assert.equal(a['data-api-key'], 'k')
  assert.equal(a.src, 'https://cmpkit.com/widget.js')
  assert.equal(a['data-locale'], 'fr')
})

test('script attributes carry the app id when present', () => {
  assert.equal(buildScriptAttributes({ apiKey: 'k' })!['data-app-id'], undefined)
  assert.equal(buildScriptAttributes({ apiKey: 'k', appId: ' com.example.app ' })!['data-app-id'], 'com.example.app')
  assert.equal(buildScriptAttributes({ apiKey: 'k', appId: '  ' })!['data-app-id'], undefined)
})
