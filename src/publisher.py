"""
Static Site Publisher Module

Converts generated Markdown articles into a complete static HTML blog site.
Features:
- Responsive, modern design (no framework dependencies)
- SEO-optimized HTML with meta tags, Open Graph, structured data
- Category pages, article pages, homepage with latest posts
- RSS feed generation
- Ready to deploy on GitHub Pages, Netlify, or Vercel (free)
"""

import json
import os
import re
import shutil
from datetime import datetime
from pathlib import Path

try:
    import markdown
    from jinja2 import Environment, FileSystemLoader
    from slugify import slugify
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False
    from compat import markdown_to_html, render_template, slugify


class SitePublisher:
    """Builds a static HTML blog from markdown articles."""

    def __init__(self, config_path=None):
        if config_path is None:
            config_path = Path(__file__).parent.parent / "config" / "settings.json"

        with open(config_path, "r") as f:
            self.config = json.load(f)

        self.site_name = self.config.get("site_name", "AI Tools Hub")
        self.site_description = self.config.get("site_description", "")
        self.site_url = self.config.get("site_url", "https://example.com")

        self.articles_dir = Path(__file__).parent.parent / "output" / "articles"
        self.site_dir = Path(__file__).parent.parent / "output" / "site"
        self.templates_dir = Path(__file__).parent.parent / "templates"

        # Ensure directories exist
        self.site_dir.mkdir(parents=True, exist_ok=True)
        self.templates_dir.mkdir(parents=True, exist_ok=True)

        # Create templates if they don't exist
        self._ensure_templates()

        # Setup Jinja2 or fallback
        if HAS_DEPS:
            self.env = Environment(loader=FileSystemLoader(str(self.templates_dir)))
        else:
            self.env = None

    def _ensure_templates(self):
        """Create HTML templates if they don't exist."""
        templates = {
            "base.html": self._get_base_template(),
            "index.html": self._get_index_template(),
            "article.html": self._get_article_template(),
            "category.html": self._get_category_template(),
        }

        for name, content in templates.items():
            path = self.templates_dir / name
            if not path.exists():
                with open(path, "w") as f:
                    f.write(content)

    def _get_base_template(self):
        return '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{% block title %}{{ site_name }}{% endblock %}</title>
    <meta name="description" content="{% block meta_description %}{{ site_description }}{% endblock %}">
    
    <!-- Open Graph -->
    <meta property="og:title" content="{% block og_title %}{{ site_name }}{% endblock %}">
    <meta property="og:description" content="{% block og_description %}{{ site_description }}{% endblock %}">
    <meta property="og:type" content="{% block og_type %}website{% endblock %}">
    <meta property="og:url" content="{% block og_url %}{{ site_url }}{% endblock %}">
    
    <!-- SEO -->
    <link rel="canonical" href="{% block canonical %}{{ site_url }}{% endblock %}">
    <meta name="robots" content="index, follow">
    
    <!-- RSS Feed -->
    <link rel="alternate" type="application/rss+xml" title="{{ site_name }}" href="{{ site_url }}/feed.xml">
    
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        
        :root {
            --primary: #2563eb;
            --primary-dark: #1d4ed8;
            --text: #1f2937;
            --text-light: #6b7280;
            --bg: #ffffff;
            --bg-alt: #f9fafb;
            --border: #e5e7eb;
            --success: #10b981;
            --warning: #f59e0b;
            --max-width: 1200px;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', sans-serif;
            line-height: 1.7;
            color: var(--text);
            background: var(--bg);
        }
        
        /* Header */
        header {
            background: var(--bg);
            border-bottom: 1px solid var(--border);
            padding: 1rem 2rem;
            position: sticky;
            top: 0;
            z-index: 100;
        }
        
        .header-inner {
            max-width: var(--max-width);
            margin: 0 auto;
            display: flex;
            justify-content: space-between;
            align-items: center;
        }
        
        .logo {
            font-size: 1.5rem;
            font-weight: 700;
            color: var(--primary);
            text-decoration: none;
        }
        
        nav a {
            margin-left: 2rem;
            text-decoration: none;
            color: var(--text-light);
            font-weight: 500;
            transition: color 0.2s;
        }
        
        nav a:hover { color: var(--primary); }
        
        /* Main Content */
        main {
            max-width: var(--max-width);
            margin: 0 auto;
            padding: 2rem;
        }
        
        /* Article Cards */
        .article-grid {
            display: grid;
            grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
            gap: 2rem;
            margin-top: 2rem;
        }
        
        .article-card {
            border: 1px solid var(--border);
            border-radius: 12px;
            padding: 1.5rem;
            transition: transform 0.2s, box-shadow 0.2s;
            background: var(--bg);
        }
        
        .article-card:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 25px rgba(0,0,0,0.1);
        }
        
        .article-card .category {
            display: inline-block;
            background: var(--primary);
            color: white;
            padding: 0.25rem 0.75rem;
            border-radius: 20px;
            font-size: 0.75rem;
            font-weight: 600;
            text-transform: uppercase;
            margin-bottom: 0.75rem;
        }
        
        .article-card h2 {
            font-size: 1.25rem;
            margin-bottom: 0.5rem;
            line-height: 1.4;
        }
        
        .article-card h2 a {
            text-decoration: none;
            color: var(--text);
        }
        
        .article-card h2 a:hover { color: var(--primary); }
        
        .article-card .meta {
            color: var(--text-light);
            font-size: 0.85rem;
            margin-bottom: 0.75rem;
        }
        
        .article-card .excerpt {
            color: var(--text-light);
            font-size: 0.95rem;
        }
        
        /* Article Page */
        .article-content {
            max-width: 800px;
            margin: 0 auto;
        }
        
        .article-content h1 {
            font-size: 2.25rem;
            line-height: 1.3;
            margin-bottom: 1rem;
        }
        
        .article-content .article-meta {
            color: var(--text-light);
            margin-bottom: 2rem;
            padding-bottom: 1rem;
            border-bottom: 1px solid var(--border);
        }
        
        .article-content h2 {
            font-size: 1.5rem;
            margin: 2rem 0 1rem;
            padding-top: 1rem;
        }
        
        .article-content h3 {
            font-size: 1.25rem;
            margin: 1.5rem 0 0.75rem;
        }
        
        .article-content p {
            margin-bottom: 1rem;
        }
        
        .article-content ul, .article-content ol {
            margin: 1rem 0;
            padding-left: 2rem;
        }
        
        .article-content li {
            margin-bottom: 0.5rem;
        }
        
        .article-content table {
            width: 100%;
            border-collapse: collapse;
            margin: 1.5rem 0;
            font-size: 0.9rem;
        }
        
        .article-content th, .article-content td {
            padding: 0.75rem 1rem;
            border: 1px solid var(--border);
            text-align: left;
        }
        
        .article-content th {
            background: var(--bg-alt);
            font-weight: 600;
        }
        
        .article-content blockquote {
            border-left: 4px solid var(--primary);
            padding: 1rem 1.5rem;
            margin: 1.5rem 0;
            background: var(--bg-alt);
            border-radius: 0 8px 8px 0;
        }
        
        .article-content a {
            color: var(--primary);
            text-decoration: underline;
        }
        
        .article-content code {
            background: var(--bg-alt);
            padding: 0.2rem 0.4rem;
            border-radius: 4px;
            font-size: 0.9em;
        }
        
        .article-content img {
            max-width: 100%;
            border-radius: 8px;
            margin: 1rem 0;
        }
        
        /* Hero */
        .hero {
            text-align: center;
            padding: 3rem 1rem;
            background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%);
            border-radius: 16px;
            margin-bottom: 2rem;
        }
        
        .hero h1 {
            font-size: 2.5rem;
            margin-bottom: 1rem;
            color: var(--text);
        }
        
        .hero p {
            font-size: 1.2rem;
            color: var(--text-light);
            max-width: 600px;
            margin: 0 auto;
        }
        
        /* Footer */
        footer {
            background: var(--bg-alt);
            border-top: 1px solid var(--border);
            padding: 2rem;
            margin-top: 4rem;
            text-align: center;
            color: var(--text-light);
        }
        
        /* Responsive */
        @media (max-width: 768px) {
            .article-grid {
                grid-template-columns: 1fr;
            }
            
            .hero h1 { font-size: 1.75rem; }
            .article-content h1 { font-size: 1.75rem; }
            
            header { padding: 1rem; }
            main { padding: 1rem; }
            
            nav a { margin-left: 1rem; font-size: 0.9rem; }
        }
    </style>
</head>
<body>
    <header>
        <div class="header-inner">
            <a href="/" class="logo">{{ site_name }}</a>
            <nav>
                <a href="/">Home</a>
                {% for cat in categories %}
                <a href="/category/{{ cat|lower|replace(' ', '-') }}.html">{{ cat }}</a>
                {% endfor %}
            </nav>
        </div>
    </header>
    
    <main>
        {% block content %}{% endblock %}
    </main>
    
    <footer>
        <p>&copy; {{ year }} {{ site_name }}. All rights reserved.</p>
        <p style="margin-top: 0.5rem; font-size: 0.85rem;">
            Affiliate Disclosure: Some links on this site are affiliate links. 
            We may earn a commission if you make a purchase through these links.
        </p>
    </footer>
</body>
</html>'''

    def _get_index_template(self):
        return '''{% extends "base.html" %}

{% block title %}{{ site_name }} - {{ site_description }}{% endblock %}

{% block content %}
<div class="hero">
    <h1>{{ site_name }}</h1>
    <p>{{ site_description }}</p>
</div>

<h2 style="margin-bottom: 0.5rem;">Latest Reviews & Comparisons</h2>
<p style="color: var(--text-light); margin-bottom: 1rem;">Expert reviews to help you choose the right AI tools</p>

<div class="article-grid">
    {% for article in articles %}
    <div class="article-card">
        <span class="category">{{ article.category }}</span>
        <h2><a href="/{{ article.slug }}.html">{{ article.title }}</a></h2>
        <div class="meta">{{ article.date }} &middot; {{ article.word_count }} words &middot; {{ article.type }}</div>
        <p class="excerpt">{{ article.meta_description }}</p>
    </div>
    {% endfor %}
</div>
{% endblock %}'''

    def _get_article_template(self):
        return '''{% extends "base.html" %}

{% block title %}{{ article.title }} | {{ site_name }}{% endblock %}
{% block meta_description %}{{ article.meta_description }}{% endblock %}
{% block og_title %}{{ article.title }}{% endblock %}
{% block og_description %}{{ article.meta_description }}{% endblock %}
{% block og_type %}article{% endblock %}
{% block og_url %}{{ site_url }}/{{ article.slug }}.html{% endblock %}
{% block canonical %}{{ site_url }}/{{ article.slug }}.html{% endblock %}

{% block content %}
<article class="article-content">
    <h1>{{ article.title }}</h1>
    <div class="article-meta">
        <span>{{ article.date }}</span> &middot; 
        <span>{{ article.word_count }} words</span> &middot;
        <span>{{ article.category }}</span>
    </div>
    
    {{ article.html_content | safe }}
</article>

<script type="application/ld+json">
{
    "@context": "https://schema.org",
    "@type": "Article",
    "headline": "{{ article.title }}",
    "datePublished": "{{ article.date }}",
    "dateModified": "{{ article.date }}",
    "author": {
        "@type": "Organization",
        "name": "{{ site_name }}"
    },
    "publisher": {
        "@type": "Organization",
        "name": "{{ site_name }}"
    },
    "description": "{{ article.meta_description }}"
}
</script>
{% endblock %}'''

    def _get_category_template(self):
        return '''{% extends "base.html" %}

{% block title %}{{ category }} - Best AI Tools | {{ site_name }}{% endblock %}
{% block meta_description %}Discover the best {{ category }} tools. Expert reviews, comparisons, and guides.{% endblock %}

{% block content %}
<h1 style="margin-bottom: 0.5rem;">{{ category }}</h1>
<p style="color: var(--text-light); margin-bottom: 2rem;">All reviews and comparisons in {{ category }}</p>

<div class="article-grid">
    {% for article in articles %}
    <div class="article-card">
        <span class="category">{{ article.category }}</span>
        <h2><a href="/{{ article.slug }}.html">{{ article.title }}</a></h2>
        <div class="meta">{{ article.date }} &middot; {{ article.word_count }} words</div>
        <p class="excerpt">{{ article.meta_description }}</p>
    </div>
    {% endfor %}
</div>
{% endblock %}'''

    def _render_index_html(self, articles, ctx):
        """Render homepage using stdlib (no Jinja2)."""
        nav_links = "".join(
            f'<a href="/category/{slugify(c)}.html">{c}</a>'
            for c in ctx.get("categories", [])
        )
        cards = ""
        for a in articles:
            cards += f'''<div class="article-card">
        <span class="category">{a["category"]}</span>
        <h2><a href="/{a["slug"]}.html">{a["title"]}</a></h2>
        <div class="meta">{a["date"]} &middot; {a["word_count"]} words &middot; {a["type"]}</div>
        <p class="excerpt">{a["meta_description"]}</p>
    </div>\n'''

        return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{ctx["site_name"]} - {ctx["site_description"]}</title>
    <meta name="description" content="{ctx["site_description"]}">
    <link rel="canonical" href="{ctx["site_url"]}">
    <style>{self._get_css()}</style>
</head>
<body>
    <header><div class="header-inner">
        <a href="/" class="logo">{ctx["site_name"]}</a>
        <nav><a href="/">Home</a>{nav_links}</nav>
    </div></header>
    <main>
        <div class="hero">
            <h1>{ctx["site_name"]}</h1>
            <p>{ctx["site_description"]}</p>
        </div>
        <h2 style="margin-bottom:0.5rem;">Latest Reviews & Comparisons</h2>
        <div class="article-grid">{cards}</div>
    </main>
    <footer><p>&copy; {ctx["year"]} {ctx["site_name"]}. All rights reserved.</p></footer>
</body></html>'''

    def _render_article_html(self, article, ctx):
        """Render article page using stdlib (no Jinja2)."""
        nav_links = "".join(
            f'<a href="/category/{slugify(c)}.html">{c}</a>'
            for c in ctx.get("categories", [])
        )
        return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{article["title"]} | {ctx["site_name"]}</title>
    <meta name="description" content="{article["meta_description"]}">
    <meta property="og:title" content="{article["title"]}">
    <meta property="og:description" content="{article["meta_description"]}">
    <meta property="og:type" content="article">
    <link rel="canonical" href="{ctx["site_url"]}/{article["slug"]}.html">
    <style>{self._get_css()}</style>
</head>
<body>
    <header><div class="header-inner">
        <a href="/" class="logo">{ctx["site_name"]}</a>
        <nav><a href="/">Home</a>{nav_links}</nav>
    </div></header>
    <main>
        <article class="article-content">
            <h1>{article["title"]}</h1>
            <div class="article-meta">
                <span>{article["date"]}</span> &middot;
                <span>{article["word_count"]} words</span> &middot;
                <span>{article["category"]}</span>
            </div>
            {article["html_content"]}
        </article>
    </main>
    <footer><p>&copy; {ctx["year"]} {ctx["site_name"]}. All rights reserved.</p></footer>
    <script type="application/ld+json">
    {{"@context":"https://schema.org","@type":"Article","headline":"{article["title"]}","datePublished":"{article["date"]}","author":{{"@type":"Organization","name":"{ctx["site_name"]}"}}}}
    </script>
</body></html>'''

    def _render_category_html(self, category, articles, ctx):
        """Render category page using stdlib (no Jinja2)."""
        nav_links = "".join(
            f'<a href="/category/{slugify(c)}.html">{c}</a>'
            for c in ctx.get("categories", [])
        )
        cards = ""
        for a in articles:
            cards += f'''<div class="article-card">
        <span class="category">{a["category"]}</span>
        <h2><a href="/{a["slug"]}.html">{a["title"]}</a></h2>
        <div class="meta">{a["date"]} &middot; {a["word_count"]} words</div>
        <p class="excerpt">{a["meta_description"]}</p>
    </div>\n'''

        return f'''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>{category} - Best AI Tools | {ctx["site_name"]}</title>
    <meta name="description" content="Discover the best {category} tools. Expert reviews, comparisons, and guides.">
    <style>{self._get_css()}</style>
</head>
<body>
    <header><div class="header-inner">
        <a href="/" class="logo">{ctx["site_name"]}</a>
        <nav><a href="/">Home</a>{nav_links}</nav>
    </div></header>
    <main>
        <h1 style="margin-bottom:0.5rem;">{category}</h1>
        <p style="color:var(--text-light);margin-bottom:2rem;">All reviews and comparisons in {category}</p>
        <div class="article-grid">{cards}</div>
    </main>
    <footer><p>&copy; {ctx["year"]} {ctx["site_name"]}. All rights reserved.</p></footer>
</body></html>'''

    def _get_css(self):
        """Return the CSS styles."""
        return '''* { margin: 0; padding: 0; box-sizing: border-box; }
:root { --primary: #2563eb; --text: #1f2937; --text-light: #6b7280; --bg: #ffffff; --bg-alt: #f9fafb; --border: #e5e7eb; --max-width: 1200px; }
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.7; color: var(--text); background: var(--bg); }
header { background: var(--bg); border-bottom: 1px solid var(--border); padding: 1rem 2rem; position: sticky; top: 0; z-index: 100; }
.header-inner { max-width: var(--max-width); margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
.logo { font-size: 1.5rem; font-weight: 700; color: var(--primary); text-decoration: none; }
nav a { margin-left: 2rem; text-decoration: none; color: var(--text-light); font-weight: 500; }
nav a:hover { color: var(--primary); }
main { max-width: var(--max-width); margin: 0 auto; padding: 2rem; }
.article-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(350px, 1fr)); gap: 2rem; margin-top: 2rem; }
.article-card { border: 1px solid var(--border); border-radius: 12px; padding: 1.5rem; transition: transform 0.2s, box-shadow 0.2s; }
.article-card:hover { transform: translateY(-2px); box-shadow: 0 8px 25px rgba(0,0,0,0.1); }
.article-card .category { display: inline-block; background: var(--primary); color: white; padding: 0.25rem 0.75rem; border-radius: 20px; font-size: 0.75rem; font-weight: 600; text-transform: uppercase; margin-bottom: 0.75rem; }
.article-card h2 { font-size: 1.25rem; margin-bottom: 0.5rem; line-height: 1.4; }
.article-card h2 a { text-decoration: none; color: var(--text); }
.article-card h2 a:hover { color: var(--primary); }
.article-card .meta { color: var(--text-light); font-size: 0.85rem; margin-bottom: 0.75rem; }
.article-content { max-width: 800px; margin: 0 auto; }
.article-content h1 { font-size: 2.25rem; line-height: 1.3; margin-bottom: 1rem; }
.article-content .article-meta { color: var(--text-light); margin-bottom: 2rem; padding-bottom: 1rem; border-bottom: 1px solid var(--border); }
.article-content h2 { font-size: 1.5rem; margin: 2rem 0 1rem; }
.article-content h3 { font-size: 1.25rem; margin: 1.5rem 0 0.75rem; }
.article-content p { margin-bottom: 1rem; }
.article-content ul, .article-content ol { margin: 1rem 0; padding-left: 2rem; }
.article-content li { margin-bottom: 0.5rem; }
.article-content table { width: 100%; border-collapse: collapse; margin: 1.5rem 0; }
.article-content th, .article-content td { padding: 0.75rem 1rem; border: 1px solid var(--border); text-align: left; }
.article-content th { background: var(--bg-alt); font-weight: 600; }
.article-content a { color: var(--primary); }
.article-content blockquote { border-left: 4px solid var(--primary); padding: 1rem 1.5rem; margin: 1.5rem 0; background: var(--bg-alt); }
.hero { text-align: center; padding: 3rem 1rem; background: linear-gradient(135deg, #eff6ff 0%, #f0fdf4 100%); border-radius: 16px; margin-bottom: 2rem; }
.hero h1 { font-size: 2.5rem; margin-bottom: 1rem; }
.hero p { font-size: 1.2rem; color: var(--text-light); max-width: 600px; margin: 0 auto; }
footer { background: var(--bg-alt); border-top: 1px solid var(--border); padding: 2rem; margin-top: 4rem; text-align: center; color: var(--text-light); }
@media (max-width: 768px) { .article-grid { grid-template-columns: 1fr; } .hero h1 { font-size: 1.75rem; } }'''

    def _parse_frontmatter(self, content):
        """Parse YAML-like frontmatter from markdown file."""
        metadata = {}

        if content.startswith("---"):
            parts = content.split("---", 2)
            if len(parts) >= 3:
                frontmatter = parts[1].strip()
                body = parts[2].strip()

                for line in frontmatter.split("\n"):
                    if ":" in line:
                        key, value = line.split(":", 1)
                        key = key.strip()
                        value = value.strip().strip('"').strip("'")

                        # Handle JSON arrays
                        if value.startswith("["):
                            try:
                                value = json.loads(value)
                            except json.JSONDecodeError:
                                pass

                        metadata[key] = value

                return metadata, body

        return metadata, content

    def _load_articles(self):
        """Load all markdown articles from the output directory."""
        articles = []

        if not self.articles_dir.exists():
            return articles

        for md_file in sorted(self.articles_dir.glob("*.md"), reverse=True):
            try:
                with open(md_file, "r") as f:
                    content = f.read()

                metadata, body = self._parse_frontmatter(content)

                if not metadata:
                    continue

                # Convert markdown to HTML
                if HAS_DEPS:
                    html_content = markdown.markdown(
                        body,
                        extensions=["tables", "fenced_code", "toc", "attr_list"],
                    )
                else:
                    html_content = markdown_to_html(body)

                articles.append({
                    "title": metadata.get("title", md_file.stem),
                    "date": metadata.get("date", ""),
                    "slug": metadata.get("slug", slugify(metadata.get("title", md_file.stem))),
                    "category": metadata.get("category", "AI Tools"),
                    "type": metadata.get("type", "article"),
                    "keyword": metadata.get("keyword", ""),
                    "meta_description": metadata.get("meta_description", ""),
                    "tools": metadata.get("tools", []),
                    "html_content": html_content,
                    "word_count": len(body.split()),
                    "filename": md_file.name,
                })

            except Exception as e:
                print(f"  [!] Error loading {md_file.name}: {e}")

        return articles

    def _generate_rss(self, articles):
        """Generate RSS feed for the site."""
        items = []

        for article in articles[:20]:
            items.append(f"""    <item>
      <title>{article['title']}</title>
      <link>{self.site_url}/{article['slug']}.html</link>
      <description>{article['meta_description']}</description>
      <pubDate>{article['date']}</pubDate>
      <guid>{self.site_url}/{article['slug']}.html</guid>
      <category>{article['category']}</category>
    </item>""")

        rss = f"""<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>{self.site_name}</title>
    <link>{self.site_url}</link>
    <description>{self.site_description}</description>
    <language>en-us</language>
    <lastBuildDate>{datetime.now().strftime('%a, %d %b %Y %H:%M:%S +0000')}</lastBuildDate>
    <atom:link href="{self.site_url}/feed.xml" rel="self" type="application/rss+xml"/>
{chr(10).join(items)}
  </channel>
</rss>"""

        feed_path = self.site_dir / "feed.xml"
        with open(feed_path, "w") as f:
            f.write(rss)

        return feed_path

    def _generate_sitemap(self, articles):
        """Generate sitemap.xml for SEO."""
        urls = [f"""  <url>
    <loc>{self.site_url}/</loc>
    <changefreq>daily</changefreq>
    <priority>1.0</priority>
  </url>"""]

        for article in articles:
            urls.append(f"""  <url>
    <loc>{self.site_url}/{article['slug']}.html</loc>
    <lastmod>{article['date']}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
  </url>""")

        sitemap = f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{chr(10).join(urls)}
</urlset>"""

        sitemap_path = self.site_dir / "sitemap.xml"
        with open(sitemap_path, "w") as f:
            f.write(sitemap)

        return sitemap_path

    def _generate_robots_txt(self):
        """Generate robots.txt."""
        robots = f"""User-agent: *
Allow: /

Sitemap: {self.site_url}/sitemap.xml
"""
        robots_path = self.site_dir / "robots.txt"
        with open(robots_path, "w") as f:
            f.write(robots)

        return robots_path

    def build_site(self):
        """Build the complete static site."""
        print("\n[*] Building static site...")
        print("=" * 60)

        # Load articles
        articles = self._load_articles()
        print(f"[+] Loaded {len(articles)} articles")

        if not articles:
            print("[!] No articles found. Generate articles first.")
            return None

        # Get unique categories
        categories = sorted(set(a["category"] for a in articles))
        year = datetime.now().year

        # Template context
        base_context = {
            "site_name": self.site_name,
            "site_description": self.site_description,
            "site_url": self.site_url,
            "categories": categories[:6],  # Top 6 for nav
            "year": year,
        }

        # 1. Generate homepage
        print("[*] Generating homepage...")
        if self.env:
            index_template = self.env.get_template("index.html")
            index_html = index_template.render(articles=articles[:12], **base_context)
        else:
            template_path = self.templates_dir / "index.html"
            with open(template_path, "r") as f:
                template_str = f.read()
            # For stdlib, use a simpler direct HTML generation
            index_html = self._render_index_html(articles[:12], base_context)

        with open(self.site_dir / "index.html", "w") as f:
            f.write(index_html)

        # 2. Generate article pages
        print(f"[*] Generating {len(articles)} article pages...")

        for article in articles:
            if self.env:
                article_template = self.env.get_template("article.html")
                article_html = article_template.render(article=article, **base_context)
            else:
                article_html = self._render_article_html(article, base_context)

            article_path = self.site_dir / f"{article['slug']}.html"
            with open(article_path, "w") as f:
                f.write(article_html)

        # 3. Generate category pages
        print(f"[*] Generating {len(categories)} category pages...")
        category_dir = self.site_dir / "category"
        category_dir.mkdir(exist_ok=True)

        for category in categories:
            cat_articles = [a for a in articles if a["category"] == category]
            cat_slug = slugify(category)

            if self.env:
                category_template = self.env.get_template("category.html")
                cat_html = category_template.render(
                    category=category, articles=cat_articles, **base_context
                )
            else:
                cat_html = self._render_category_html(category, cat_articles, base_context)

            with open(category_dir / f"{cat_slug}.html", "w") as f:
                f.write(cat_html)

        # 4. Generate RSS feed
        print("[*] Generating RSS feed...")
        self._generate_rss(articles)

        # 5. Generate sitemap
        print("[*] Generating sitemap.xml...")
        self._generate_sitemap(articles)

        # 6. Generate robots.txt
        print("[*] Generating robots.txt...")
        self._generate_robots_txt()

        # 7. Generate CNAME file (for custom domain on GitHub Pages)
        cname_path = self.site_dir / "CNAME"
        # Only create if a custom domain is configured
        if "github.io" not in self.site_url:
            domain = self.site_url.replace("https://", "").replace("http://", "").split("/")[0]
            with open(cname_path, "w") as f:
                f.write(domain)

        # Summary
        print(f"\n{'=' * 60}")
        print(f"[+] Site built successfully!")
        print(f"[+] Output: {self.site_dir}")
        print(f"[+] Pages generated:")
        print(f"    - 1 homepage")
        print(f"    - {len(articles)} article pages")
        print(f"    - {len(categories)} category pages")
        print(f"    - 1 RSS feed")
        print(f"    - 1 sitemap.xml")
        print(f"    - 1 robots.txt")
        print(f"[+] Total HTML files: {len(articles) + len(categories) + 1}")

        return {
            "site_dir": str(self.site_dir),
            "total_articles": len(articles),
            "categories": categories,
            "pages_generated": len(articles) + len(categories) + 1,
            "built_at": datetime.now().isoformat(),
        }


def build_site():
    """Convenience function to build the site."""
    publisher = SitePublisher()
    return publisher.build_site()


if __name__ == "__main__":
    result = build_site()
    if result:
        print(f"\nSite ready at: {result['site_dir']}")
