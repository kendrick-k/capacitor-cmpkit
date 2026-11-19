# capacitor-cmpkit

[![npm](https://img.shields.io/npm/v/capacitor-cmpkit)](https://www.npmjs.com/package/capacitor-cmpkit)
[![CI](https://github.com/kendrick-k/capacitor-cmpkit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kendrick-k/capacitor-cmpkit/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Capacitor](https://img.shields.io/badge/Capacitor-6%2B-119EFF)](https://capacitorjs.com)

[CMPKit](https://cmpkit.com) consent management for Capacitor apps.

- Shows the CMPKit banner in the WebView.
- Stores the choice **natively** (`@capacitor/preferences`), so iOS purging WebView storage never resets it.
- Gives you the choice **before** anything else starts, so native SDKs (Firebase, AdMob, Adjust...) stay off until the user agrees.

No telemetry. The only network calls are the ones CMPKit already makes (widget script, config, consent save).

## Install

```bash
npm i capacitor-cmpkit @capacitor/preferences
npx cap sync
```

## Usage

```ts
import { init } from 'capacitor-cmpkit'

const cmp = await init({
  apiKey: 'YOUR_PUBLIC_SITE_KEY',
  onConsent: async (consent) => {
    // `null` = the user has not answered yet: keep every optional SDK off.
    const analytics = consent?.analytics === true
    // Example with Firebase Analytics:
    // await FirebaseAnalytics.setEnabled({ enabled: analytics })
  },
})

cmp.hasConsent('analytics') // false until the user agrees
cmp.openSettings()          // reopen the preferences panel (settings screen link)
```

## Blocking at the source

Disabling an SDK after it started is too late: it may already have sent data. Ship these native flags **off** and turn them on from `onConsent`:

| SDK | Disable at build time | Enable at runtime |
| --- | --- | --- |
| Firebase Analytics | `FIREBASE_ANALYTICS_COLLECTION_ENABLED=false` (`Info.plist` / `AndroidManifest`) | `setAnalyticsCollectionEnabled(true)` |
| AdMob | `GADDelayAppMeasurementInit=true` | load ads after consent |
| App Tracking Transparency | do not call the prompt at launch | call it after the banner, only if `marketing` is accepted |

The ATT system prompt is **not** a consent banner and does not replace one: Apple requires it for cross-app tracking in addition to your legal consent.

## API

| Member | Description |
| --- | --- |
| `init(options)` | Restore the stored choice, call `onConsent`, load the banner. |
| `options.apiKey` | Public site key (required). |
| `options.onConsent(consent \| null)` | Called at startup and on every change. |
| `options.showBanner` | `false` to only restore the stored choice. Default `true`. |
| `options.scriptUrl`, `locale`, `theme` | Widget overrides. |
| `options.storage` | Custom storage (tests). |
| `handle.getConsent()` | Current choice or `null`. |
| `handle.hasConsent(category)` | `necessary`, `functional`, `analytics`, `marketing`. |
| `handle.onChange(cb)` | Subscribe; returns an unsubscribe function. |
| `handle.openSettings()` | Reopen the preferences panel. |

## Known limits

- The banner is the web widget, so the app needs network access at least once to load it. The stored choice works offline afterwards.
- Native SDK wiring is yours (see the table): the plugin tells you the choice, it does not start or stop third-party SDKs.
- The key is public by design (it is also in every website `<script>` tag). Allowed app identifiers are enforced by CMPKit.

## Development

```bash
npm ci && npm run typecheck && npm test && npm run prepack
```

## License

MIT

## More from the same maker

[CMPKit](https://cmpkit.com) - cookie banner and consent management with proof of consent.
