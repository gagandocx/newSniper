# AI Affiliate Automation

Fully automated passive income system that discovers trending AI tools, generates SEO-optimized affiliate articles, publishes them to a static blog, and shares on social media — all on autopilot.

## How It Works

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐     ┌──────────┐
│  Discover   │────▶│  Generate    │────▶│  Publish    │────▶│  Share on    │────▶│  Deploy  │
│  Trending   │     │  SEO Article │     │  Static     │     │  Social      │     │  GitHub  │
│  AI Tools   │     │  via AI API  │     │  HTML Site  │     │  Media       │     │  Pages   │
└─────────────┘     └──────────────┘     └─────────────┘     └──────────────┘     └──────────┘
                         Runs daily via GitHub Actions — completely hands-free
```

## Features

- **Auto-Discovery**: Finds trending AI tools via RSS feeds, Google Suggest, and Product Hunt
- **AI Article Generation**: Creates 5 article types (listicles, comparisons, reviews, alternatives, guides)
- **SEO Optimized**: Meta tags, Open Graph, JSON-LD structured data, sitemap, robots.txt
- **Affiliate Links**: Automatically inserts monetizable affiliate links into articles
- **Static Site**: Beautiful responsive blog with zero hosting cost
- **Social Sharing**: Auto-posts to Twitter/X, LinkedIn, with Reddit drafts
- **GitHub Actions**: Runs daily on autopilot with free CI/CD
- **$0 Running Cost**: Uses free Gemini API + free GitHub Pages hosting

---

## Quick Start (5 Minutes)

### 1. Get a Free Gemini API Key

1. Go to [aistudio.google.com](https://aistudio.google.com)
2. Sign in with Google
3. Click **"Get API Key"** → **"Create API key"**
4. Copy the key

### 2. Clone & Configure

```bash
git clone https://github.com/YOUR_USERNAME/ai-affiliate-automation.git
cd ai-affiliate-automation

# Install dependencies
pip install -r requirements.txt
```

### 3. Add Your API Key

Edit `config/settings.json`:
```json
{
  "api_key": "YOUR_GEMINI_API_KEY_HERE",
  "api_provider": "gemini"
}
```

### 4. Run It

```bash
python run.py
```

That's it! Articles will be generated, site will be built, and social drafts created.

---

## Configuration

### `config/settings.json`

| Field | Description | Default |
|-------|-------------|---------|
| `api_key` | Your Gemini or OpenAI API key | Required |
| `api_provider` | `"gemini"` (free) or `"openai"` (paid) | `"gemini"` |
| `site_name` | Your blog name | `"AI Tools Hub"` |
| `site_description` | Blog tagline for SEO | Set in config |
| `site_url` | Your deployed site URL | GitHub Pages URL |
| `niche` | Content niche | `"AI Tools & Software"` |
| `target_keywords` | SEO keywords to target | Pre-configured |
| `affiliate_links` | Your affiliate link mappings | Replace with yours |
| `schedule.articles_per_run` | Articles generated per run | `3` |
| `social_media.*` | Social API keys (optional) | Disabled by default |

### `config/affiliate_programs.json`

Contains detailed info about each affiliate program (name, commission, pricing, pros/cons, ratings). The article generator uses this to write accurate, detailed reviews.

**To add your own affiliate links**: Replace the `affiliate_link` field in each program entry with your actual referral URL.

---

## Deployment (Free — GitHub Pages)

### Option A: Automated via GitHub Actions (Recommended)

1. **Create a GitHub repository** and push this project:
   ```bash
   git init
   git add .
   git commit -m "Initial commit"
   git remote add origin https://github.com/YOUR_USERNAME/ai-tools-hub.git
   git push -u origin main
   ```

2. **Add your API key as a secret**:
   - Go to your repo → Settings → Secrets → Actions
   - Add: `GEMINI_API_KEY` = your key

3. **Enable GitHub Pages**:
   - Go to Settings → Pages
   - Source: Deploy from a branch
   - Branch: `gh-pages` / `/ (root)`

4. **Done!** GitHub Actions will run daily at 8am UTC, generating new articles and deploying automatically.

### Option B: Manual Deployment

```bash
# Generate content and build site
python run.py --skip-deploy

# Your site is in output/site/
# Upload that folder to any static host:
# - Netlify (drag & drop)
# - Vercel
# - Cloudflare Pages
# - Any web server
```

### Custom Domain (Optional)

1. Buy a domain (Namecheap, Cloudflare, etc.)
2. Update `site_url` in `config/settings.json`
3. Add a CNAME record pointing to `YOUR_USERNAME.github.io`
4. GitHub Pages will auto-configure HTTPS

---

## CLI Options

```bash
python run.py                      # Full pipeline (3 articles)
python run.py --articles 5         # Generate 5 articles
python run.py --skip-social        # Skip social media posting
python run.py --skip-deploy        # Skip GitHub Pages deployment
python run.py --discover-only      # Only discover trends
python run.py --build-only         # Rebuild site from existing articles
```

---

## Setting Up Affiliate Accounts (How You Earn)

1. **Amazon Associates** — [affiliate-program.amazon.com](https://affiliate-program.amazon.com)
2. **Jasper AI** — [jasper.ai/partners](https://jasper.ai/partners) (30% recurring)
3. **Writesonic** — [writesonic.com/affiliate](https://writesonic.com/affiliate) (30% lifetime)
4. **Semrush** — [semrush.com/partner](https://semrush.com/partner) ($200/sale)
5. **Notion** — [notion.so/affiliates](https://notion.so/affiliates) (50% for 12 months)
6. **Surfer SEO** — [surferseo.com/affiliate](https://surferseo.com/affiliate) (25% recurring)

After signing up, replace the placeholder links in `config/affiliate_programs.json` with your actual referral URLs.

---

## Social Media Setup (Optional)

Social posting works in two modes:
- **Without API keys**: Generates copy-paste drafts in `output/social_drafts.json`
- **With API keys**: Auto-posts directly to platforms

### Twitter/X API
1. Apply at [developer.twitter.com](https://developer.twitter.com)
2. Create a project/app with read+write permissions
3. Add keys to `config/settings.json` under `social_media`

### LinkedIn API
1. Create an app at [linkedin.com/developers](https://linkedin.com/developers)
2. Request `w_member_social` permission
3. Add access token to config

---

## Project Structure

```
ai-affiliate-automation/
├── run.py                          # Main entry point - runs everything
├── requirements.txt                # Python dependencies
├── config/
│   ├── settings.json               # API keys, site config, schedule
│   └── affiliate_programs.json     # Affiliate program database
├── src/
│   ├── discovery.py                # Finds trending tools & generates content ideas
│   ├── article_generator.py        # AI-powered SEO article writer
│   ├── publisher.py                # Markdown → static HTML site builder
│   └── social_poster.py            # Social media auto-poster
├── templates/                      # Jinja2 HTML templates (auto-generated)
├── output/
│   ├── articles/                   # Generated markdown articles
│   ├── site/                       # Built HTML site (deploy this folder)
│   ├── content_plan.json           # Latest content plan
│   ├── social_drafts.json          # Social media post drafts
│   ├── last_run.json               # Last pipeline run results
│   └── run_history.json            # History of all runs
└── .github/
    └── workflows/
        └── daily.yml               # GitHub Actions daily automation
```

---

## Income Timeline

| Period | What Happens | Expected Revenue |
|--------|-------------|-----------------|
| Week 1 | Setup + first 20 articles generated | $0 |
| Month 1 | 60-90 articles live, Google starts indexing | $0-$50 |
| Month 2-3 | Articles start ranking for long-tail keywords | $50-$200 |
| Month 3-6 | Consistent traffic growth, affiliate conversions | $200-$1,000 |
| Month 6-12 | Compound effect: 300+ articles, authority | $1,000-$3,000+ |

**Key**: The more articles you have, the more keywords you rank for, the more traffic and commissions you earn. This system compounds over time.

---

## Tips for Maximizing Revenue

1. **Run daily** — More content = more keywords = more traffic
2. **Update affiliate links** — Sign up for all programs and use real links
3. **Custom domain** — Looks more professional, better for SEO
4. **Add your own tools** — Know a great AI tool? Add it to `affiliate_programs.json`
5. **Monitor analytics** — Add Google Analytics to track what's working
6. **Diversify niches** — Clone this for fitness, finance, or other niches
7. **Build an email list** — Add a newsletter signup to capture repeat visitors

---

## Troubleshooting

| Issue | Solution |
|-------|----------|
| API key error | Verify your key at [aistudio.google.com](https://aistudio.google.com) |
| No articles generated | Check `output/last_run.json` for error details |
| Site not building | Run `python run.py --build-only` to debug |
| GitHub Pages not working | Check Settings → Pages → ensure `gh-pages` branch exists |
| Rate limited | Reduce `articles_per_run` in config or add delays |

---

## License

MIT — Use freely for personal and commercial purposes.

---

## Disclaimer

This tool generates content for affiliate marketing purposes. Always ensure:
- Your content provides genuine value to readers
- You comply with FTC disclosure requirements (auto-included in articles)
- You follow each affiliate program's terms of service
- You don't make false claims about products

Income results vary and depend on niche competition, content quality, and market conditions.
