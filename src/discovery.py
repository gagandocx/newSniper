"""
Trending AI Tools Discovery Module

This module finds trending AI tools and topics by:
1. Scraping Product Hunt for new AI tool launches
2. Scraping Google Trends related queries
3. Pulling from curated RSS feeds of AI news
4. Combining with our affiliate programs database for monetizable content ideas
"""

import json
import os
import re
import random
from datetime import datetime, timedelta
from pathlib import Path

try:
    import requests
    from bs4 import BeautifulSoup
    import feedparser
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False
    from compat import http_get


# RSS feeds for AI tool news and launches
AI_RSS_FEEDS = [
    "https://www.producthunt.com/feed?category=artificial-intelligence",
    "https://feeds.feedburner.com/venturebeat/SZYF",
    "https://blog.google/technology/ai/rss/",
    "https://openai.com/blog/rss.xml",
    "https://www.marktechpost.com/feed/",
    "https://theresanaiforthat.com/rss/",
]

# Search queries to discover trending AI tools
DISCOVERY_QUERIES = [
    "new AI tools launched this week",
    "best AI tools {year}",
    "AI tools for productivity",
    "AI writing tools comparison",
    "AI image generator tools",
    "AI coding assistant tools",
    "AI video editing tools",
    "AI marketing automation tools",
    "AI tools for small business",
    "free AI tools alternatives",
]

# Article type templates for content generation
ARTICLE_TYPES = [
    {
        "type": "listicle",
        "template": "Best {count} {category} Tools in {year}",
        "description": "Roundup of top tools in a category"
    },
    {
        "type": "comparison",
        "template": "{tool1} vs {tool2}: Which is Better in {year}?",
        "description": "Head-to-head comparison of two tools"
    },
    {
        "type": "review",
        "template": "{tool} Review {year}: Features, Pricing & Verdict",
        "description": "In-depth review of a single tool"
    },
    {
        "type": "alternative",
        "template": "Top {count} {tool} Alternatives (Free & Paid)",
        "description": "Alternatives to a popular tool"
    },
    {
        "type": "how_to",
        "template": "How to Use {tool} for {use_case}: Complete Guide",
        "description": "Tutorial-style guide for a tool"
    },
    {
        "type": "category_guide",
        "template": "Best AI Tools for {use_case} in {year} (Tested & Ranked)",
        "description": "Category-specific buying guide"
    },
]


class TrendingDiscovery:
    """Discovers trending AI tools and generates content ideas."""

    def __init__(self, config_path=None):
        if config_path is None:
            config_path = Path(__file__).parent.parent / "config" / "settings.json"
        
        with open(config_path, "r") as f:
            self.config = json.load(f)
        
        # Load affiliate programs
        programs_path = Path(__file__).parent.parent / "config" / "affiliate_programs.json"
        with open(programs_path, "r") as f:
            self.programs = json.load(f)["programs"]
        
        self.year = datetime.now().year
        self.session = None
        if HAS_DEPS:
            self.session = requests.Session()
            self.session.headers.update({
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            })

    def discover_from_rss(self):
        """Pull trending AI tools from RSS feeds."""
        discoveries = []

        if not HAS_DEPS:
            print("  [!] feedparser not available - skipping RSS discovery")
            return discoveries
        
        for feed_url in AI_RSS_FEEDS:
            try:
                feed = feedparser.parse(feed_url)
                for entry in feed.entries[:5]:
                    title = entry.get("title", "")
                    summary = entry.get("summary", "")
                    link = entry.get("link", "")
                    published = entry.get("published", "")
                    
                    # Check if it's AI-related
                    ai_keywords = ["ai", "artificial intelligence", "machine learning", 
                                   "gpt", "llm", "chatbot", "automation", "generative"]
                    content = (title + " " + summary).lower()
                    
                    if any(kw in content for kw in ai_keywords):
                        discoveries.append({
                            "title": title,
                            "summary": summary[:200],
                            "url": link,
                            "published": published,
                            "source": feed_url,
                            "type": "rss_discovery"
                        })
            except Exception as e:
                print(f"  [!] Failed to fetch feed {feed_url}: {e}")
                continue
        
        return discoveries

    def discover_from_producthunt(self):
        """Scrape Product Hunt for trending AI products."""
        discoveries = []

        if not HAS_DEPS:
            print("  [!] beautifulsoup4 not available - skipping Product Hunt")
            return discoveries
        
        try:
            url = "https://www.producthunt.com/topics/artificial-intelligence"
            response = self.session.get(url, timeout=15)
            
            if response.status_code == 200:
                soup = BeautifulSoup(response.text, "html.parser")
                
                # Find product listings
                products = soup.find_all("div", {"data-test": re.compile("post-item")})
                
                for product in products[:10]:
                    title_elem = product.find("h3") or product.find("a")
                    if title_elem:
                        discoveries.append({
                            "title": title_elem.get_text(strip=True),
                            "source": "producthunt",
                            "type": "new_launch"
                        })
        except Exception as e:
            print(f"  [!] Product Hunt scraping failed: {e}")
        
        return discoveries

    def discover_trending_searches(self):
        """Find what people are searching for related to AI tools."""
        trending_topics = []
        
        # Use Google Suggest to find trending searches
        base_queries = [
            "best ai tool for",
            "ai alternative to",
            "is ai good for",
            "ai tools for",
            "free ai",
        ]
        
        for query in base_queries:
            try:
                url = f"http://suggestqueries.google.com/complete/search?client=firefox&q={query}"
                if HAS_DEPS:
                    response = self.session.get(url, timeout=10)
                    if response.status_code == 200:
                        data = response.json()
                        suggestions = data[1] if len(data) > 1 else []
                        for suggestion in suggestions[:5]:
                            trending_topics.append({
                                "query": suggestion,
                                "source": "google_suggest",
                                "type": "trending_search"
                            })
                else:
                    resp = http_get(url, timeout=10)
                    if resp["status_code"] == 200:
                        data = json.loads(resp["text"])
                        suggestions = data[1] if len(data) > 1 else []
                        for suggestion in suggestions[:5]:
                            trending_topics.append({
                                "query": suggestion,
                                "source": "google_suggest",
                                "type": "trending_search"
                            })
            except Exception as e:
                continue
        
        return trending_topics

    def generate_content_ideas(self, num_ideas=10):
        """
        Generate monetizable content ideas by combining:
        - Trending discoveries
        - Affiliate programs we can monetize
        - SEO keyword targets
        - Article type templates
        """
        ideas = []
        categories = list(set(p["category"] for p in self.programs))
        
        # 1. Generate listicle ideas per category
        for category in categories:
            category_tools = [p for p in self.programs if p["category"] == category]
            if len(category_tools) >= 2:
                ideas.append({
                    "title": f"Best {len(category_tools)} {category} Tools in {self.year}",
                    "type": "listicle",
                    "tools": [t["name"] for t in category_tools],
                    "category": category,
                    "keyword": f"best {category.lower()} tools {self.year}",
                    "monetization": "multiple_affiliate_links",
                    "priority": "high"
                })
        
        # 2. Generate comparison articles (high conversion)
        for category in categories:
            category_tools = [p for p in self.programs if p["category"] == category]
            if len(category_tools) >= 2:
                for i in range(len(category_tools)):
                    for j in range(i + 1, len(category_tools)):
                        tool1 = category_tools[i]
                        tool2 = category_tools[j]
                        ideas.append({
                            "title": f"{tool1['name']} vs {tool2['name']}: Which is Better in {self.year}?",
                            "type": "comparison",
                            "tools": [tool1["name"], tool2["name"]],
                            "category": category,
                            "keyword": f"{tool1['name'].lower()} vs {tool2['name'].lower()}",
                            "monetization": "comparison_affiliate_links",
                            "priority": "high"
                        })
        
        # 3. Generate individual review articles
        for program in self.programs:
            ideas.append({
                "title": f"{program['name']} Review {self.year}: Features, Pricing & Honest Verdict",
                "type": "review",
                "tools": [program["name"]],
                "category": program["category"],
                "keyword": f"{program['name'].lower()} review {self.year}",
                "monetization": "single_affiliate_link",
                "priority": "medium"
            })
        
        # 4. Generate alternatives articles (high search volume)
        popular_tools = ["ChatGPT", "Jasper AI", "Midjourney", "Canva AI", "Grammarly"]
        for tool in popular_tools:
            ideas.append({
                "title": f"Top 7 {tool} Alternatives (Free & Paid) in {self.year}",
                "type": "alternative",
                "tools": [p["name"] for p in self.programs[:5]],
                "category": "AI Tools",
                "keyword": f"{tool.lower()} alternatives",
                "monetization": "multiple_affiliate_links",
                "priority": "high"
            })
        
        # 5. Generate use-case articles
        use_cases = [
            "Content Writing", "Social Media Marketing", "Email Marketing",
            "Video Creation", "SEO Optimization", "Coding", "Design",
            "Customer Support", "Data Analysis", "Project Management"
        ]
        for use_case in use_cases:
            ideas.append({
                "title": f"Best AI Tools for {use_case} in {self.year} (Tested & Ranked)",
                "type": "category_guide",
                "tools": [p["name"] for p in random.sample(self.programs, min(5, len(self.programs)))],
                "category": use_case,
                "keyword": f"best ai tools for {use_case.lower()} {self.year}",
                "monetization": "multiple_affiliate_links",
                "priority": "medium"
            })
        
        # Shuffle and prioritize
        high_priority = [i for i in ideas if i["priority"] == "high"]
        medium_priority = [i for i in ideas if i["priority"] == "medium"]
        
        random.shuffle(high_priority)
        random.shuffle(medium_priority)
        
        # Return mix: 70% high priority, 30% medium
        num_high = int(num_ideas * 0.7)
        result = high_priority[:num_high] + medium_priority[:num_ideas - num_high]
        
        return result[:num_ideas]

    def get_content_plan(self, num_articles=3):
        """
        Main method: creates a full content plan combining
        trending discoveries + monetizable ideas.
        """
        print("[*] Starting AI Tools Discovery...")
        print(f"[*] Generating {num_articles} content ideas...")
        
        # Get trending data (with fallback if network fails)
        trending_searches = []
        rss_discoveries = []
        
        try:
            print("[*] Fetching trending searches...")
            trending_searches = self.discover_trending_searches()
            print(f"  [+] Found {len(trending_searches)} trending searches")
        except Exception as e:
            print(f"  [!] Trending search discovery failed: {e}")
        
        try:
            print("[*] Checking RSS feeds...")
            rss_discoveries = self.discover_from_rss()
            print(f"  [+] Found {len(rss_discoveries)} RSS discoveries")
        except Exception as e:
            print(f"  [!] RSS discovery failed: {e}")
        
        # Generate monetizable content ideas (always works - no network needed)
        print("[*] Generating monetizable content ideas...")
        content_ideas = self.generate_content_ideas(num_ideas=num_articles)
        print(f"  [+] Generated {len(content_ideas)} content ideas")
        
        # Build the content plan
        content_plan = {
            "generated_at": datetime.now().isoformat(),
            "num_articles": num_articles,
            "articles_to_write": content_ideas,
            "trending_context": {
                "trending_searches": trending_searches[:10],
                "rss_discoveries": rss_discoveries[:10]
            }
        }
        
        # Save the plan
        output_path = Path(__file__).parent.parent / "output" / "content_plan.json"
        with open(output_path, "w") as f:
            json.dump(content_plan, f, indent=2)
        
        print(f"\n[+] Content plan saved to {output_path}")
        print(f"[+] Articles to write:")
        for i, idea in enumerate(content_ideas, 1):
            print(f"    {i}. [{idea['type']}] {idea['title']}")
        
        return content_plan


def discover_and_plan(num_articles=3):
    """Convenience function to run discovery and return a content plan."""
    discovery = TrendingDiscovery()
    return discovery.get_content_plan(num_articles=num_articles)


if __name__ == "__main__":
    plan = discover_and_plan(num_articles=5)
    print(f"\nTotal ideas generated: {len(plan['articles_to_write'])}")
