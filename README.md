# capacitor-cmpkit

[![npm](https://img.shields.io/npm/v/capacitor-cmpkit)](https://www.npmjs.com/package/capacitor-cmpkit)
[![CI](https://github.com/kendrick-k/capacitor-cmpkit/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/kendrick-k/capacitor-cmpkit/actions/workflows/ci.yml)
[![license](https://img.shields.io/badge/license-MIT-green)](LICENSE)
[![Capacitor](https://img.shields.io/badge/Capacitor-8%2B-119EFF)](https://capacitorjs.com)

[CMPKit](https://cmpkit.com) consent management for Capacitor apps.

- Shows the CMPKit banner in the WebView.
- Stores the choice **natively** (`@capacitor/preferences`), so iOS purging WebView storage never resets it. It is saved under `cmpkit_consent_<scope>` (`<scope>` is your API key, lowercased and reduced to `a-z0-9_-`), in the same record format as the widget: `{"consent":{...},"version":1,"updatedAt":<ms>}`. At startup the plugin copies it back into the WebView `localStorage` under the same key. As in the widget, a choice older than 180 days, dated in the future, or without a date (unless it refuses everything) is ignored and the banner is shown again.
- Gives you the choice **before** anything else starts, so native SDKs (Firebase, AdMob, Adjust...) stay off until the user agrees.

No telemetry. The only network calls are the ones CMPKit already makes (widget script, config, consent save).

## Install

```bash
npm i capacitor-cmpkit @capacitor/preferences @capacitor/app
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
| `options.widgetReadyTimeoutMs` | Wait for the widget after its script loads. Default `5000`. |
| `options.showBanner` | `false` to only restore the stored choice. Default `true`. |
| `options.appId` | Override the detected app identifier. |
| `options.scriptUrl`, `locale`, `theme` | Widget overrides. |
| `options.storage` | Custom storage (tests). |
| `handle.getConsent()` | Current choice or `null`. |
| `handle.hasConsent(category)` | `necessary`, `functional`, `analytics`, `marketing`. |
| `handle.onChange(cb)` | Subscribe; returns an unsubscribe function. |
| `handle.setConsent(partial)` | Record a choice yourself (own banner). Missing categories keep their value; persisted, listeners and `onConsent` notified; no-op if unchanged. If the widget is loaded it is also passed to `window.CMPKit.updateConsent`, which sends the proof of consent to CMPKit. |
| `handle.openSettings()` | Reopen the preferences panel. |

## App identifier

The plugin reads the running app's identifier (iOS bundle ID / Android `applicationId`, via `@capacitor/app` `getInfo().id`) and sends it to CMPKit with the widget config and consent requests (`X-CMPKit-App-Id` header). Pass `appId` to `init()` to override it.

In the CMPKit project settings, a project can list its allowed app identifiers:

- **List configured**: requests from a Capacitor WebView origin (`capacitor://localhost`, `ionic://localhost`, `https://localhost`) are accepted only if the identifier is in the list. A missing or unlisted identifier is refused with `403`.
- **No list configured**: previous behavior, any app is accepted (CMPKit logs a warning). Existing projects keep working.

> **This is not a strong security guarantee.** The identifier is declared by the client and can be copied or forged by anyone who can send HTTP requests. It prevents accidental use of your key in another app and keeps your project tidy; it does not stop a determined attacker. Do not rely on it to protect anything sensitive.

The allow-list needs a **CMPKit server version that supports it**. An older server ignores the identifier and keeps accepting any app. The widget is loaded from `cmpkit.com`, so it is always current, but the server side is deployed separately: check with CMPKit that your account runs a version with app identifiers before relying on it.

## Security: a remote widget in the WebView

The banner is a script downloaded from `cmpkit.com` at every start and executed inside your app's WebView. It runs with the same privileges as your own web code, including access to every Capacitor plugin your app exposes to JavaScript. In practice:

- Treat `cmpkit.com` (and any custom `scriptUrl`) as a trusted third party. If you do not want that, set `showBanner: false` and build your own banner: call `handle.setConsent({ analytics: true, ... })` when the user chooses. The plugin still restores and persists the choice natively.
- Only load it over HTTPS and restrict your CSP, for example `script-src 'self' https://cmpkit.com` and `connect-src 'self' https://cmpkit.com`.
- Do not keep secrets or tokens in the WebView (`localStorage`, globals), and do not expose sensitive native plugins to pages that load the widget.
- Subresource Integrity cannot be pinned because the widget file changes between releases.
- Keep `server.allowNavigation` in `capacitor.config` as narrow as possible.

## Proof of consent

CMPKit stores its server-side proof of consent when the **widget** saves a choice (`POST /api/consent/save`). `setConsent()` forwards the choice to the widget when it is loaded, so the proof is recorded. **Without the widget** (`showBanner: false`, or the script failed to load) the choice is stored only on the device: nothing is sent to CMPKit and there is no server-side proof of consent. If you need that proof, keep the widget loaded.

When the account is in safe mode (free plan over its visitor quota), the widget ignores new choices: the plugin still keeps the choice on the device, but no proof is recorded.

## Known limits

- The banner is the web widget, so the app needs network access to load it. The stored choice is restored offline. If the widget does not become ready within `widgetReadyTimeoutMs` (default 5 s), the plugin logs `widget not ready: consent changes will not be persisted` and carries on.
- If the widget script cannot load (offline, blocked), the plugin logs `widget failed to load: consent changes will not be persisted` and `init()` still resolves with the stored choice. Use `setConsent()` with your own UI if you need a fallback.
- Errors thrown by your `onConsent` callback or `onChange` listeners are logged with `console.error` and never make `init()` fail.
- Native SDK wiring is yours (see the table): the plugin tells you the choice, it does not start or stop third-party SDKs.
- The key is public by design (it is also in every website `<script>` tag). See "App identifier" for what the allow-list does and does not guarantee.

## Development

```bash
npm ci && npm run typecheck && npm test && npm run prepack   # prepack also checks that dist/*.d.ts have no `.ts` imports
```

## License

MIT

## More from the same maker

[CMPKit](https://cmpkit.com) - cookie banner and consent management with proof of consent.
