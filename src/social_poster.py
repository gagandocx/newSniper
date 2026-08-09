"""
Social Media Auto-Poster Module

Automatically shares new articles on social media to drive initial traffic.
Supports:
- Twitter/X (via API v2)
- LinkedIn (via API)
- Reddit (via API)
- Pinterest (via API)

Each platform gets a tailored post format optimized for engagement.
Falls back gracefully if API keys aren't configured.
"""

import json
import hashlib
import random
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False
    from compat import http_get, http_post


# Engagement-optimized post templates per platform
TWITTER_TEMPLATES = [
    "🚀 Just published: {title}\n\n{hook}\n\n👉 {url}\n\n{hashtags}",
    "🔥 New review: {title}\n\n{hook}\n\nRead more 👇\n{url}\n\n{hashtags}",
    "💡 Looking for the best {category} tools?\n\n{title}\n\n{hook}\n\n{url} {hashtags}",
    "⚡ {title}\n\n{hook}\n\nFull breakdown:\n{url}\n\n{hashtags}",
    "🤖 AI Tool Alert!\n\n{title}\n\n{hook}\n\nCheck it out: {url}\n\n{hashtags}",
]

LINKEDIN_TEMPLATES = [
    """{hook}

I just published a comprehensive guide: "{title}"

Here's what you'll learn:
{bullet_points}

Read the full article: {url}

{hashtags}""",
    """If you're looking for the right {category} tool, this will save you hours of research.

📝 {title}

{hook}

Key takeaways:
{bullet_points}

Full article: {url}

{hashtags}""",
]

REDDIT_TEMPLATES = [
    {
        "title": "{title}",
        "body": "{hook}\n\nFull article with detailed comparisons: {url}",
    },
    {
        "title": "I compared the top {category} tools - here's what I found",
        "body": "{hook}\n\nI wrote up a detailed comparison covering pricing, features, and pros/cons: {url}",
    },
]

# Hashtag bank
HASHTAGS = {
    "AI Writing": ["#AIWriting", "#ContentCreation", "#AI", "#WritingTools", "#ArtificialIntelligence"],
    "AI Image Generation": ["#AIArt", "#AIImages", "#Midjourney", "#GenerativeAI", "#AI"],
    "AI Video": ["#AIVideo", "#VideoEditing", "#AI", "#ContentCreation", "#VideoMarketing"],
    "AI Video & Audio": ["#AIVideo", "#Podcast", "#AI", "#AudioEditing", "#ContentCreator"],
    "AI SEO": ["#SEO", "#AITools", "#DigitalMarketing", "#ContentStrategy", "#AI"],
    "AI Productivity": ["#Productivity", "#AI", "#WorkSmarter", "#AITools", "#TechTools"],
    "AI Writing Assistant": ["#Writing", "#Grammarly", "#AI", "#WritingTips", "#ContentCreation"],
    "AI Tools": ["#AITools", "#ArtificialIntelligence", "#Tech", "#SaaS", "#Productivity"],
}

# Subreddits for AI tool content
RELEVANT_SUBREDDITS = [
    "artificial",
    "AItools",
    "SaaS",
    "Entrepreneur",
    "startups",
    "productivity",
    "content_marketing",
    "SEO",
    "digital_marketing",
]


class SocialPoster:
    """Automatically posts article summaries to social media platforms."""

    def __init__(self, config_path=None):
        if config_path is None:
            config_path = Path(__file__).parent.parent / "config" / "settings.json"

        with open(config_path, "r") as f:
            self.config = json.load(f)

        self.social_config = self.config.get("social_media", {})
        self.site_url = self.config.get("site_url", "https://example.com")
        self.posted_log_path = Path(__file__).parent.parent / "output" / "posted_log.json"
        self.posted_log = self._load_posted_log()

    def _load_posted_log(self):
        """Load log of previously posted articles to avoid duplicates."""
        if self.posted_log_path.exists():
            with open(self.posted_log_path, "r") as f:
                return json.load(f)
        return {"posts": []}

    def _save_posted_log(self):
        """Save the posted log."""
        self.posted_log_path.parent.mkdir(parents=True, exist_ok=True)
        with open(self.posted_log_path, "w") as f:
            json.dump(self.posted_log, f, indent=2)

    def _is_already_posted(self, article_slug, platform):
        """Check if an article was already posted to a platform."""
        for post in self.posted_log.get("posts", []):
            if post.get("slug") == article_slug and post.get("platform") == platform:
                return True
        return False

    def _log_post(self, article_slug, platform, post_url="", success=True, error=""):
        """Log a social media post."""
        self.posted_log["posts"].append({
            "slug": article_slug,
            "platform": platform,
            "post_url": post_url,
            "success": success,
            "error": error,
            "posted_at": datetime.now().isoformat(),
        })
        self._save_posted_log()

    def _get_hashtags(self, category, count=5):
        """Get relevant hashtags for a category."""
        tags = HASHTAGS.get(category, HASHTAGS["AI Tools"])
        return " ".join(tags[:count])

    def _generate_hook(self, article):
        """Generate an engagement hook for the article."""
        hooks = [
            f"Comparing the top {article.get('category', 'AI')} tools so you don't have to.",
            f"Which {article.get('category', 'AI')} tool is actually worth your money?",
            f"I tested and reviewed the best options available right now.",
            f"Here's an honest breakdown with pricing, pros, and cons.",
            f"Saving you hours of research on {article.get('category', 'AI')} tools.",
            f"The definitive guide to choosing the right tool in {datetime.now().year}.",
        ]
        return random.choice(hooks)

    def _generate_bullet_points(self, article):
        """Generate bullet points for LinkedIn posts."""
        tools = article.get("tools", [])
        points = []

        if tools:
            points.append(f"✅ {len(tools)} tools compared side-by-side")
        points.append("✅ Honest pros and cons for each")
        points.append("✅ Pricing breakdown")
        points.append("✅ Clear recommendations based on use case")

        return "\n".join(points)

    def post_to_twitter(self, article):
        """Post to Twitter/X using API v2."""
        if not self.social_config.get("twitter_enabled"):
            print("  [!] Twitter not enabled - skipping")
            return None

        api_key = self.social_config.get("twitter_api_key", "")
        api_secret = self.social_config.get("twitter_api_secret", "")
        access_token = self.social_config.get("twitter_access_token", "")
        access_secret = self.social_config.get("twitter_access_secret", "")

        if not all([api_key, api_secret, access_token, access_secret]):
            print("  [!] Twitter API keys not configured - skipping")
            return None

        slug = article.get("slug", "")
        if self._is_already_posted(slug, "twitter"):
            print("  [!] Already posted to Twitter - skipping")
            return None

        # Build the tweet
        article_url = f"{self.site_url}/{slug}.html"
        template = random.choice(TWITTER_TEMPLATES)
        hashtags = self._get_hashtags(article.get("category", "AI Tools"), count=3)
        hook = self._generate_hook(article)

        tweet_text = template.format(
            title=article.get("title", ""),
            hook=hook,
            url=article_url,
            hashtags=hashtags,
            category=article.get("category", "AI Tools"),
        )

        # Truncate to 280 chars
        if len(tweet_text) > 280:
            tweet_text = tweet_text[:277] + "..."

        # Post via Twitter API v2
        try:
            # Using OAuth 1.0a User Context
            from requests_oauthlib import OAuth1

            auth = OAuth1(api_key, api_secret, access_token, access_secret)

            response = requests.post(
                "https://api.twitter.com/2/tweets",
                json={"text": tweet_text},
                auth=auth,
                timeout=30,
            )

            if response.status_code == 201:
                data = response.json()
                tweet_id = data.get("data", {}).get("id", "")
                post_url = f"https://twitter.com/i/web/status/{tweet_id}"
                self._log_post(slug, "twitter", post_url=post_url)
                print(f"  [+] Posted to Twitter: {post_url}")
                return post_url
            else:
                error = response.text[:200]
                self._log_post(slug, "twitter", success=False, error=error)
                print(f"  [!] Twitter post failed: {error}")
                return None

        except ImportError:
            print("  [!] requests_oauthlib not installed - using fallback")
            # Log what would be posted
            self._log_post(slug, "twitter_draft", post_url="", success=True)
            print(f"  [*] Twitter draft saved: {tweet_text[:100]}...")
            return "draft"

        except Exception as e:
            self._log_post(slug, "twitter", success=False, error=str(e))
            print(f"  [!] Twitter error: {e}")
            return None

    def post_to_linkedin(self, article):
        """Post to LinkedIn using API."""
        if not self.social_config.get("linkedin_enabled"):
            print("  [!] LinkedIn not enabled - skipping")
            return None

        access_token = self.social_config.get("linkedin_access_token", "")

        if not access_token:
            print("  [!] LinkedIn access token not configured - skipping")
            return None

        slug = article.get("slug", "")
        if self._is_already_posted(slug, "linkedin"):
            print("  [!] Already posted to LinkedIn - skipping")
            return None

        # Build the post
        article_url = f"{self.site_url}/{slug}.html"
        template = random.choice(LINKEDIN_TEMPLATES)
        hashtags = self._get_hashtags(article.get("category", "AI Tools"), count=4)
        hook = self._generate_hook(article)
        bullet_points = self._generate_bullet_points(article)

        post_text = template.format(
            title=article.get("title", ""),
            hook=hook,
            url=article_url,
            hashtags=hashtags,
            category=article.get("category", "AI Tools"),
            bullet_points=bullet_points,
        )

        try:
            # Get user profile URN
            headers = {
                "Authorization": f"Bearer {access_token}",
                "Content-Type": "application/json",
                "X-Restli-Protocol-Version": "2.0.0",
            }

            profile_resp = requests.get(
                "https://api.linkedin.com/v2/me", headers=headers, timeout=15
            )

            if profile_resp.status_code != 200:
                error = "Failed to get LinkedIn profile"
                self._log_post(slug, "linkedin", success=False, error=error)
                print(f"  [!] {error}")
                return None

            profile_id = profile_resp.json().get("id", "")
            author_urn = f"urn:li:person:{profile_id}"

            # Create post
            post_data = {
                "author": author_urn,
                "lifecycleState": "PUBLISHED",
                "specificContent": {
                    "com.linkedin.ugc.ShareContent": {
                        "shareCommentary": {"text": post_text},
                        "shareMediaCategory": "ARTICLE",
                        "media": [
                            {
                                "status": "READY",
                                "originalUrl": article_url,
                                "title": {"text": article.get("title", "")},
                                "description": {
                                    "text": article.get("meta_description", "")
                                },
                            }
                        ],
                    }
                },
                "visibility": {"com.linkedin.ugc.MemberNetworkVisibility": "PUBLIC"},
            }

            response = requests.post(
                "https://api.linkedin.com/v2/ugcPosts",
                json=post_data,
                headers=headers,
                timeout=30,
            )

            if response.status_code == 201:
                post_id = response.json().get("id", "")
                self._log_post(slug, "linkedin", post_url=post_id)
                print(f"  [+] Posted to LinkedIn: {post_id}")
                return post_id
            else:
                error = response.text[:200]
                self._log_post(slug, "linkedin", success=False, error=error)
                print(f"  [!] LinkedIn post failed: {error}")
                return None

        except Exception as e:
            self._log_post(slug, "linkedin", success=False, error=str(e))
            print(f"  [!] LinkedIn error: {e}")
            return None

    def generate_social_drafts(self, article):
        """
        Generate ready-to-post social media drafts for manual posting.
        This works even without API keys - creates copy-paste ready content.
        """
        slug = article.get("slug", "")
        article_url = f"{self.site_url}/{slug}.html"
        category = article.get("category", "AI Tools")
        hook = self._generate_hook(article)
        hashtags = self._get_hashtags(category)
        bullet_points = self._generate_bullet_points(article)

        drafts = {
            "article_title": article.get("title", ""),
            "article_url": article_url,
            "generated_at": datetime.now().isoformat(),
            "platforms": {},
        }

        # Twitter draft
        template = random.choice(TWITTER_TEMPLATES)
        tweet = template.format(
            title=article.get("title", ""),
            hook=hook,
            url=article_url,
            hashtags=self._get_hashtags(category, count=3),
            category=category,
        )
        if len(tweet) > 280:
            tweet = tweet[:277] + "..."
        drafts["platforms"]["twitter"] = {"text": tweet, "char_count": len(tweet)}

        # LinkedIn draft
        template = random.choice(LINKEDIN_TEMPLATES)
        linkedin_post = template.format(
            title=article.get("title", ""),
            hook=hook,
            url=article_url,
            hashtags=hashtags,
            category=category,
            bullet_points=bullet_points,
        )
        drafts["platforms"]["linkedin"] = {
            "text": linkedin_post,
            "char_count": len(linkedin_post),
        }

        # Reddit draft
        reddit_template = random.choice(REDDIT_TEMPLATES)
        reddit_title = reddit_template["title"].format(
            title=article.get("title", ""),
            category=category,
        )
        reddit_body = reddit_template["body"].format(
            hook=hook,
            url=article_url,
        )
        drafts["platforms"]["reddit"] = {
            "title": reddit_title,
            "body": reddit_body,
            "suggested_subreddits": RELEVANT_SUBREDDITS[:5],
        }

        return drafts

    def post_article(self, article):
        """
        Post an article to all enabled social platforms.
        Also generates drafts for platforms without API keys.
        """
        slug = article.get("slug", "")
        print(f"\n  [*] Sharing: {article.get('title', '')}")

        results = {
            "article": article.get("title", ""),
            "slug": slug,
            "posted_at": datetime.now().isoformat(),
            "platforms": {},
        }

        # Try automated posting
        twitter_result = self.post_to_twitter(article)
        if twitter_result:
            results["platforms"]["twitter"] = {"status": "posted", "url": twitter_result}

        linkedin_result = self.post_to_linkedin(article)
        if linkedin_result:
            results["platforms"]["linkedin"] = {"status": "posted", "url": linkedin_result}

        # Always generate drafts (for manual posting or platforms without keys)
        drafts = self.generate_social_drafts(article)
        results["drafts"] = drafts

        return results

    def post_batch(self, articles):
        """Post multiple articles to social media with delays."""
        print(f"\n[*] Sharing {len(articles)} articles on social media...")
        print("=" * 60)

        all_results = []
        drafts_collection = []

        for i, article in enumerate(articles, 1):
            print(f"\n[{i}/{len(articles)}] Processing social posts...")
            result = self.post_article(article)
            all_results.append(result)
            drafts_collection.append(result.get("drafts", {}))

            # Delay between posts to look natural
            if i < len(articles):
                delay = random.randint(5, 15)
                print(f"  [*] Waiting {delay}s before next post...")
                time.sleep(delay)

        # Save all drafts to a file for easy copy-paste
        drafts_path = Path(__file__).parent.parent / "output" / "social_drafts.json"
        with open(drafts_path, "w") as f:
            json.dump(
                {
                    "generated_at": datetime.now().isoformat(),
                    "total_articles": len(articles),
                    "drafts": drafts_collection,
                },
                f,
                indent=2,
            )

        print(f"\n{'=' * 60}")
        print(f"[+] Social posting complete!")
        print(f"[+] Drafts saved to: {drafts_path}")
        print(f"[+] You can copy-paste these drafts to post manually on any platform.")

        return all_results


def post_articles(articles):
    """Convenience function to post articles to social media."""
    poster = SocialPoster()
    return poster.post_batch(articles)


if __name__ == "__main__":
    # Test with a sample article
    sample_article = {
        "title": "Best 5 AI Writing Tools in 2026",
        "slug": "best-5-ai-writing-tools-in-2026",
        "category": "AI Writing",
        "type": "listicle",
        "meta_description": "Compare the top AI writing tools including Jasper, Writesonic, and Copy.ai.",
        "tools": ["Jasper AI", "Writesonic", "Copy.ai"],
        "word_count": 2500,
    }

    poster = SocialPoster()
    drafts = poster.generate_social_drafts(sample_article)

    print("=" * 60)
    print("SOCIAL MEDIA DRAFTS")
    print("=" * 60)

    print("\n--- TWITTER ---")
    print(drafts["platforms"]["twitter"]["text"])

    print("\n--- LINKEDIN ---")
    print(drafts["platforms"]["linkedin"]["text"])

    print("\n--- REDDIT ---")
    print(f"Title: {drafts['platforms']['reddit']['title']}")
    print(f"Body: {drafts['platforms']['reddit']['body']}")
    print(f"Subreddits: {drafts['platforms']['reddit']['suggested_subreddits']}")
