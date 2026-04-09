# Google Calendar Integration Configuration

This document describes the exact Google Calendar OAuth flow used by Memora, including:

- which Google OAuth clients are required
- which redirect URIs are valid in each environment
- how Expo development builds differ from Expo web
- how the app sends the authorization code to Convex
- how Convex stores and later uses the refresh token

## 1. Overview

Memora uses `expo-auth-session` on the client and Convex actions on the backend.

The flow is split by platform:

- Native Android build: uses an Android OAuth client
- Native iOS build: uses an iOS OAuth client
- Expo web: uses a Web OAuth client

Important constraints:

- A single Google OAuth client should not be used for all platforms.
- Native mobile OAuth and browser OAuth are different client types in Google Cloud.
- Expo Go is not the target runtime for this integration.
- Native testing should be done in a development build or an official build.

## 2. Why Multiple Clients Are Required

Google treats these as distinct app types:

- `Android`
- `iOS`
- `Web application`

Each type has different trust and redirect requirements.

### Web client

The web client is used when the OAuth flow happens in a browser and returns to an HTTP or HTTPS URL.

Examples:

- `http://localhost:8081/oauthredirect`
- `https://yourdomain.com/oauthredirect`

### Android client

The Android client is tied to:

- package name
- signing certificate fingerprint

This is for installed-app OAuth, not browser-origin OAuth.

### iOS client

The iOS client is tied to:

- Apple bundle identifier

This is also an installed-app OAuth flow.

## 3. Project Values Used By Memora

These are the app identifiers currently used by the project:

- Android package: `com.alokdebnath.memora`
- iOS bundle ID: `com.alokdebnath.memora`
- Expo app scheme in `app.json`: `memora`
- Android-only OAuth callback scheme in `app.json`: `com.alokdebnath.memora`
- Native Android OAuth redirect used by the integration: `com.alokdebnath.memora:/profile`
- Native iOS OAuth redirect used by the integration: `memora://profile`

Important:

- Better Auth and normal in-app links use `memora://...`
- Google Android OAuth uses `com.alokdebnath.memora:/profile`
- Google iOS OAuth uses `memora://profile`

## 4. Google Cloud Setup

### 4.1 Create or Select a Google Cloud Project

1. Open [Google Cloud Console](https://console.cloud.google.com/).
2. Create or select a project for Memora.

### 4.2 Enable the Calendar API

1. Open `APIs & Services`.
2. Go to `Library`.
3. Enable `Google Calendar API`.

### 4.3 Configure OAuth Consent Screen

1. Open `APIs & Services > OAuth consent screen`.
2. Set user type to `External` unless this is strictly internal to a Workspace org.
3. Fill the required app information.
4. Add this scope:

`https://www.googleapis.com/auth/calendar.events`

5. If the app is still in testing mode, add your Google account under `Test users`.

If you do not add your account as a test user while the app is in testing mode, Google will block the sign-in.

## 5. Create the OAuth Clients

You typically need exactly these three clients.

### 5.1 Android OAuth Client

Create an `Android` OAuth client with:

- package name: `com.alokdebnath.memora`
- SHA certificate fingerprints for the Android app you are running

Notes:

- For a development build, use the certificate that signs that build.
- For official release builds, add the release signing fingerprint too.
- If the signing cert changes, the Android OAuth client must be updated.

### 5.2 iOS OAuth Client

Create an `iOS` OAuth client with:

- bundle ID: `com.alokdebnath.memora`

### 5.3 Web OAuth Client

Create a `Web application` OAuth client.

Authorized redirect URIs should include:

- `http://localhost:8081/oauthredirect` for local Expo web development
- `https://<your-web-domain>/oauthredirect` for hosted web production, if you ship web

Notes:

- Redirect URIs must match exactly.
- Path, protocol, port, and hostname must all match exactly.
- If you use a different local port, update the Google client redirect URI accordingly.

## 6. Redirect URIs By Environment

### Native development build

Use:

`com.alokdebnath.memora:/profile`

This applies to Android when running a custom Expo development build.

### Native official build

Use:

`memora://profile`

This applies to iOS builds. If the package name or bundle ID changes in a different build flavor, the client setup must change too.

### Expo web local development

Use:

`http://localhost:8081/oauthredirect`

### Web production

Use:

`https://<your-web-domain>/oauthredirect`

## 7. What Not To Use

Do not use these for this integration:

- `https://auth.expo.io/...`
- a single web client for native Android and iOS

Why:

- `memora://oauthredirect` and `com.alokdebnath.memora://oauthredirect` caused Google's `Error 400: invalid_request`
- the old Expo proxy flow is not the intended setup here
- native installed-app OAuth should use the native client types

## 8. Required Environment Variables

### 8.1 Expo Client Environment

These are read by the React Native app UI.

Set in `.env.local`:

- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_ANDROID`
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_IOS`
- `EXPO_PUBLIC_GOOGLE_CLIENT_ID_WEB`

These values are used by `Google.useAuthRequest(...)` on the profile screen.

### 8.2 Convex Backend Environment

These are read by the Convex action that exchanges the auth code for tokens.

Set in the Convex deployment environment:

- `GOOGLE_CLIENT_ID_ANDROID`
- `GOOGLE_CLIENT_ID_IOS`
- `GOOGLE_CLIENT_ID_WEB`
- `GOOGLE_CLIENT_SECRET_WEB`

## 9. Exact Client-Side Flow

The client implementation is in the profile screen.

Relevant file:

- [profile.tsx](/home/alok/Documents/PersonalProjects/memora/app/(protected)/profile.tsx)

### Step 1

The app determines the current platform:

- `android`
- `ios`
- `web`

### Step 2

It builds a redirect URI with Expo AuthSession:

- native android: `com.alokdebnath.memora:/profile`
- native ios: `memora://profile`
- web: current origin + `/oauthredirect`

### Step 3

It starts `Google.useAuthRequest(...)` with:

- the platform-specific client ID
- scope `https://www.googleapis.com/auth/calendar.events`
- `responseType: "code"`
- `shouldAutoExchangeCode: false`
- `access_type: "offline"`
- `prompt: "consent"`

Why those matter:

- `responseType: "code"` requests an authorization code
- `shouldAutoExchangeCode: false` prevents Expo from exchanging the code locally before Convex receives it
- `access_type: "offline"` is needed for a refresh token
- `prompt: "consent"` increases the chance Google returns a refresh token again

### Step 4

After Google redirects back, the app reads:

- `code`
- `request.codeVerifier`
- `request.redirectUri`
- current platform

### Step 5

The app calls the Convex action `api.integrations.connectGoogle` with:

- auth token
- authorization code
- code verifier
- redirect URI
- platform

## 10. Exact Backend Flow

The backend implementation is here:

- [integrations.ts](/home/alok/Documents/PersonalProjects/memora/convex/integrations.ts)

### Step 1

Convex receives:

- `code`
- `codeVerifier`
- `redirectUri`
- `platform`

### Step 2

Convex chooses the correct Google OAuth credentials for that platform:

- `android` -> `GOOGLE_CLIENT_ID_ANDROID`
- `ios` -> `GOOGLE_CLIENT_ID_IOS`
- `web` -> `GOOGLE_CLIENT_ID_WEB` + `GOOGLE_CLIENT_SECRET_WEB`

### Step 3

Convex posts to Google's token endpoint:

`https://oauth2.googleapis.com/token`

The request contains:

- `code`
- `client_id`
- `client_secret` when required
- `code_verifier`
- `redirect_uri`
- `grant_type=authorization_code`

### Step 4

If Google returns a `refresh_token`, Convex stores it in `userIntegrations`.

Stored fields include:

- `refreshToken`
- `clientId`
- `platform`
- timestamps

### Step 5

When reminders sync later, Convex uses the stored refresh token to get a fresh access token and then calls the Google Calendar API.

## 11. Reminder Sync Flow

Once connected:

1. User creates or edits a reminder memory.
2. Memora schedules the internal sync action.
3. Convex exchanges the stored refresh token for an access token.
4. Convex creates or updates an event in the user's primary Google Calendar.
5. The returned Google event ID is stored on the memory as `googleEventId`.

When a synced reminder is deleted:

1. Convex loads the stored integration.
2. Convex refreshes the access token.
3. Convex deletes the corresponding calendar event by `googleEventId`.

## 12. Common Failure Cases

### `Error 400: invalid_request`

Common causes:

- redirect URI does not match the client type
- trying to use the rejected `oauthredirect` URI variants
- trying to use a web client for a native installed-app flow

### `redirect_uri_mismatch`

Common causes:

- the redirect URI in Google Cloud does not exactly match what Expo generated
- wrong port on local web
- wrong path
- wrong protocol

### No refresh token returned

Common causes:

- the user already granted the app and Google did not return a new refresh token
- `prompt=consent` was not included
- the existing integration should be disconnected and reconnected

### App blocked because it does not comply with Google's OAuth policy

Common causes:

- OAuth consent screen not configured correctly
- user is not added as a test user while app is in testing mode
- wrong client type being used for the platform

## 13. Minimum Recommended Setup

For this project, the minimum practical setup is:

- 1 Android OAuth client
- 1 iOS OAuth client
- 1 Web OAuth client

That single Android client can serve:

- Android development builds
- Android official builds

as long as the package name and accepted signing fingerprints are correct.

That single iOS client can serve:

- iOS development builds
- iOS official builds

as long as the bundle ID stays `com.alokdebnath.memora`.

## 14. References

- Expo authentication guide: https://docs.expo.dev/guides/authentication/
- Expo AuthSession docs: https://docs.expo.dev/versions/latest/sdk/auth-session/
