# CoderSnap Extension — Session Handoff Document

## Overview
This is a Chrome extension called **CoderSnap** (rebranded from ShiftSniper). It automatically scans Amazon warehouse job listings (hiring.amazon.ca / hiring.amazon.com) and auto-applies for matching shifts. The extension was originally purchased/obtained and then:
1. Made unlimited (all paywalls/server checks removed)
2. Completely rebranded to "CoderSnap"
3. All connections to original owner's server removed
4. Telegram alerts redirected to owner's own bot
5. A license key system was added using Google Sheets + Apps Script

---

## Repository
- **Repo:** `gagandocx/newSniper`
- **Branch:** `unlimited-final` (this is the active working branch)
- **Extension files:** `/extension/` folder
- **Key generator:** `generate_keys.js` (Node.js script)
- **Google Apps Script code:** `google_apps_script.js`

---

## Current State (v8.7.9.5)

### What's Working:
- Extension fully rebranded to "CoderSnap"
- Zero connections to original owner (usvisaserver.zapto.org removed)
- Telegram alerts go to owner's bot: `8863800330` / chat: `-5532300400`
- Google Sheet license database is set up and working
- Google Apps Script API deployed and responding correctly
- License keys are in the sheet and server validates them

### Current Bug Being Fixed:
**The popup can't successfully communicate with the Google Apps Script API from within the Chrome extension.**

- The server itself works perfectly (tested via direct URL fetch — returns valid JSON)
- The problem is Chrome extension Manifest V3 popup → Google Apps Script communication
- Google Apps Script returns a 302 redirect to `script.googleusercontent.com`
- We've tried: `fetch()` with `redirect: follow`, `XMLHttpRequest`, and routing through `background.js`
- Latest attempt routes through background service worker via `chrome.runtime.sendMessage`
- Error was "Invalid response from server" — meaning background.js gets the response but it's not valid JSON (likely an HTML page or the redirect isn't being followed)
- The latest version (v8.7.9.5) adds logging so the actual response text is shown in the service worker console

### Next Steps to Fix:
1. Ask user to check the service worker console (`chrome://extensions` → CoderSnap → "Service worker" link) to see what `[bg] License response:` shows
2. If it shows HTML, the issue is that `fetch()` in the service worker also doesn't follow Google's redirect — may need to extract the redirect URL from the 302 response and fetch it manually
3. Alternative fix: Use `fetch()` with `{ redirect: 'manual' }`, read the `Location` header from the 302, then fetch that URL directly

---

## Architecture

### Files:
| File | Purpose |
|------|---------|
| `manifest.json` | Extension config, v8.7.9.5, name "CoderSnap" |
| `background.js` | Service worker — notifications, captcha debugger, Gmail OTP, Groq proxy, **license proxy** |
| `fetch.js` | Main content script — job scanning, API calls, auto-apply logic |
| `auth.js` | Handles login flow — verification type, CAPTCHA solving (Groq AI), OTP from Gmail |
| `content.js` | Popup script — settings, city tags, Groq key input |
| `license.js` | License gate UI + activation logic (calls background.js which calls Google API) |
| `index.html` | Popup HTML — has license gate (shown first) and main app (shown after activation) |
| `notif_block.js` | MAIN world script — intercepts Amazon's auth token from SPA requests |
| `Createapp.js` | Handles the application form after job is found |

### License System Flow:
```
User opens popup
  → license.js checks chrome.storage for __cs_license_key + __cs_license_email
  → If not found: show license gate UI
  → User enters key + email → clicks Activate
  → license.js sends message to background.js: { action: 'licenseRequest', url: '...' }
  → background.js fetches Google Apps Script URL
  → Google Apps Script checks key in Google Sheet
  → If valid: writes email + device + timestamps to sheet, returns { success: true }
  → license.js stores key + email in chrome.storage, shows main app
  → fetch.js checks __cs_license_valid flag on load — won't scan without it
```

### Google Sheet Structure:
- **Sheet name:** CoderSnap Licenses
- **Sheet ID:** `1r9Ab9yDh6OXz7s3vwRIW8RHOW0OZ2T0MInlhlK2iDlY`
- **Owner:** kokoaiautomation@gmail.com
- **Columns:** key | email | device_id | activated_at | last_verified | status

### Google Apps Script:
- **Deployed URL:** `https://script.google.com/macros/s/AKfycbziX_IPp8afiwz7-4Cj3QisI1dz6W0IZQAqP7vpsBrBbq0yLB-vl42HNnL4hyFYxeJEMQ/exec`
- **Deployment ID:** `AKfycbziX_IPp8afiwz7-4Cj3QisI1dz6W0IZQAqP7vpsBrBbq0yLB-vl42HNnL4hyFYxeJEMQ`
- **Apps Script project URL:** `https://script.google.com/u/1/home` (user has multiple Google accounts, /u/1/ is the correct one)
- **Admin list endpoint:** `...exec?action=list&admin=CODERSNAP2026`

### Telegram Bot:
- **Bot Token:** `8863800330:AAE48axXq3pJCf3140YoqP-VPF7yesG2zS4`
- **Chat ID:** `-5532300400`

---

## Key Decisions Made:
1. **Version format:** 8.X.Y.Z — always increment Z for every push
2. **No server costs:** Uses free Google Sheets + Apps Script as license backend
3. **One key = one email = one device:** Enforced server-side in the sheet
4. **Revocation:** Admin changes column F to "revoked" in the sheet
5. **Extension won't work without license:** fetch.js exits immediately if `__cs_license_valid` is not true
6. **Email enforcement:** If someone changes the Amazon email after activation, scanning stops + violation popup shown

---

## How to Generate More Keys:
```bash
cd /path/to/newSniper
node generate_keys.js 20     # generates 20 keys
```
Then paste the keys (without dashes) into column A of the Google Sheet and put "active" in column F.

---

## Important Notes:
- The extension's `manifest.json` has a hardcoded `key` field (for Chrome Web Store). This doesn't affect unpacked loading.
- The `update_url` in manifest points to Chrome Web Store — irrelevant for unpacked distribution
- User distributes via unpacked extension (Load unpacked from extension/ folder)
- The `.bat` file (`update_sniper.bat`) downloads latest from GitHub branch — currently points to `unlimited-final`

---

## What Still Needs Fixing:
1. **License activation from popup → Google Apps Script communication** — the 302 redirect issue
   - Server works perfectly when called directly
   - Background service worker's fetch() may not be following the redirect properly
   - Check service worker console for actual response
   - Possible fixes: manual redirect handling, or switch to a different free backend (e.g., Cloudflare Workers, Supabase edge function)

2. After license is fixed, test the full flow end-to-end:
   - Activate with key + email
   - Verify badge shows "LICENSED"
   - Go to hiring.amazon.ca → confirm scanning works
   - Check Google Sheet has the activation data
   - Test with wrong email → should block
