import { test } from 'node:test'
import assert from 'node:assert/strict'
import { resolveAppId } from '../src/app-id.ts'

test('an explicit app id wins and the native info is not read', async () => {
  let called = false
  const id = await resolveAppId(' com.example.app ', async () => { called = true; return { id: 'com.other' } })
  assert.equal(id, 'com.example.app')
  assert.equal(called, false)
})

test('the native app info is used when no explicit id is given', async () => {
  assert.equal(await resolveAppId(undefined, async () => ({ id: 'com.example.app' })), 'com.example.app')
})

test('web (getInfo throws) or an empty id resolves to an empty string', async () => {
  assert.equal(await resolveAppId(undefined, async () => { throw new Error('not implemented on web') }), '')
  assert.equal(await resolveAppId(undefined, async () => ({})), '')
})
