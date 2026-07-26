# CoderSnap — Amazon Warehouse Job Hunter

**Automatically scan and apply for Amazon warehouse shifts the instant they become available.**

CoderSnap monitors Amazon's hiring portal 24/7, detects new job postings within seconds of going live, and auto-applies before anyone else can. No more refreshing pages manually — just set your preferences and let it work.

---

## Features

- Scans Amazon Jobs every 2 seconds (configurable)
- Auto-applies to matching shifts instantly
- AI-powered CAPTCHA solver (via Groq — free)
- Telegram alerts when jobs are found
- Target specific cities or accept any location
- Works with hiring.amazon.ca and hiring.amazon.com
- One-click setup — no technical knowledge needed

---

## Requirements

- Google Chrome browser (version 110 or newer)
- An Amazon hiring account (hiring.amazon.ca or hiring.amazon.com)
- A valid CoderSnap license key
- A free Groq API key (for auto-CAPTCHA solving — optional but recommended)

---

## Installation

### Step 1: Download the Extension

- Extract the provided **CoderSnap.zip** file to a permanent folder on your computer
- Example: `C:\CoderSnap\` or `D:\Extensions\CoderSnap\`
- **Do not delete this folder** — Chrome needs it to run the extension

### Step 2: Install in Chrome

1. Open Chrome and go to `chrome://extensions`
2. Turn on **Developer Mode** (toggle in the top-right corner)
3. Click **"Load unpacked"**
4. Select the folder where you extracted CoderSnap
5. The extension icon appears in your toolbar — you're installed!

### Step 3: Pin the Extension

- Click the **puzzle piece icon** in Chrome's toolbar
- Find **CoderSnap** and click the **pin icon** next to it
- The CoderSnap icon is now always visible in your toolbar

---

## Activation

### Step 1: Open CoderSnap

- Click the CoderSnap icon in your toolbar
- You'll see the **License Activation** screen

### Step 2: Enter Your License

- **LICENSE KEY:** Enter the key you received (format: XXXXX-XXXXX-XXXXX-XXXXX)
- **AMAZON ACCOUNT EMAIL:** Enter the email address you use on Amazon Jobs
- Click **"Activate License"**

### Step 3: Confirmation

- You'll see a green "Activated!" message
- The main dashboard appears with your license badge showing days remaining
- Your license is valid for **1 year** from the date of activation

> **Important:** Each license key is permanently bound to one Amazon email and one device. You cannot transfer it to another account or computer.

---

## Setup & Configuration

### Region (Search Center)

Choose the **city closest to where you want to work**. Amazon uses this as the GPS center point for searching nearby warehouses.

### Radius

How far from the selected city to search. Recommended: **50–150 km** for best results.

### Shift Type

- **Any** — Apply to both full-time and part-time shifts
- **Full-Time** — Only full-time positions
- **Part-Time** — Only part-time positions

### Target Cities (Result Filter)

Controls which jobs get auto-applied to:

- **Any City** — Apply to every job found within your radius (recommended for fastest results)
- **Specific cities** — Type city names and press Enter to only apply to jobs in those cities

### Scan Interval

How often CoderSnap checks for new jobs. Default: **2 seconds** (30 checks per minute).

- Lower = faster detection, but may trigger rate limiting
- Recommended: **2 seconds** for optimal speed

---

## How to Use

### Step 1: Navigate to Amazon Jobs

- Go to [hiring.amazon.ca](https://hiring.amazon.ca) or [hiring.amazon.com](https://hiring.amazon.com)
- Sign in to your Amazon hiring account

### Step 2: Enable Pop-ups

When prompted, allow pop-ups for the Amazon hiring site:

1. Click the lock/site-info icon in the address bar
2. Click **"Site settings"**
3. Find **"Pop-ups and redirects"** → change to **Allow**
4. Reload the page

### Step 3: Activate the Hunter

- Click the CoderSnap icon in your toolbar
- Toggle **"ACTIVATE HUNTER"** to ON (the switch turns green/blue)
- The extension immediately begins scanning

### Step 4: Let It Run

- Keep the Amazon Jobs tab open
- CoderSnap scans automatically in the background
- When a matching job is found:
  - You hear an alert sound
  - A notification appears
  - The extension auto-navigates to the job and applies
  - A Telegram alert is sent (if configured)

---

## AI CAPTCHA Solver (Recommended)

Amazon sometimes shows CAPTCHAs during login. CoderSnap can solve these automatically using Groq AI (free).

### Get Your Free Groq API Key

1. Go to [console.groq.com/keys](https://console.groq.com/keys)
2. Sign up for a free account (no credit card needed)
3. Click **"+ Create API Key"**
4. Name it anything (e.g., "CoderSnap")
5. Keep expiry as **"No expiration"**
6. Click **Submit**
7. **Copy the key immediately** — Groq only shows it once!

### Paste the Key

1. Open CoderSnap popup
2. Find the **"AI CAPTCHA SOLVER"** section
3. Paste your key in the **"GROQ API KEY"** field (starts with `gsk_`)
4. It saves automatically when valid (green checkmark appears)

> **Keep your key safe!** If you click Reset, the key is cleared. You'd need to create a new one from Groq.

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| Extension not scanning | Make sure ACTIVATE HUNTER is toggled ON |
| "Rate limited" message | Normal — extension auto-retries in 3-5 seconds |
| CAPTCHA blocks login | Set up the Groq API key (see above) |
| No jobs found | Try increasing your radius or selecting "Any City" |
| Dashboard shows blank | Remove and re-add the extension in chrome://extensions |
| License says "expired" | Your 1-year license has ended — contact admin for renewal |
| "Device mismatch" error | License is locked to your original device — contact admin |

---

## Tips for Best Results

1. **Use "Any City"** as your target — this applies to everything in your radius
2. **Set radius to 150 km** — casts a wider net for more opportunities
3. **Keep scan interval at 2 seconds** — fastest detection without issues
4. **Set up the Groq key** — eliminates CAPTCHA interruptions during auto-login
5. **Keep the Amazon tab open** — the extension needs it to scan
6. **Don't close Chrome** — scanning stops when the browser is closed
7. **Check Telegram** — you'll get instant alerts even if you're away from your computer

---

## Updating the Extension

When a new version is available:

1. Download the new CoderSnap.zip
2. Extract it to the **same folder** (overwrite existing files)
3. Go to `chrome://extensions`
4. Click the **refresh icon** on CoderSnap
5. Done — your settings and license are preserved

---

## Support

For license issues, renewals, or technical support, contact your CoderSnap administrator.

---

*CoderSnap v8.7.11.1 — Amazon Warehouse Job Hunter*
