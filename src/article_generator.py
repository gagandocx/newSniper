"""
SEO Article Generator Module

Generates high-quality, SEO-optimized affiliate articles using AI APIs.
Supports:
- Google Gemini (free)
- OpenAI GPT (paid)

Article types:
- Listicles ("Best X Tools in 2026")
- Comparisons ("Tool A vs Tool B")
- Reviews ("Tool Review 2026")
- Alternatives ("Top X Alternatives to Tool")
- How-to guides
- Category guides
"""

import json
import os
import re
import time
from datetime import datetime
from pathlib import Path

try:
    import requests
    from slugify import slugify
    HAS_DEPS = True
except ImportError:
    HAS_DEPS = False
    from compat import http_post, slugify


class ArticleGenerator:
    """Generates SEO-optimized affiliate articles using AI."""

    def __init__(self, config_path=None):
        if config_path is None:
            config_path = Path(__file__).parent.parent / "config" / "settings.json"

        with open(config_path, "r") as f:
            self.config = json.load(f)

        # Load affiliate programs
        programs_path = Path(__file__).parent.parent / "config" / "affiliate_programs.json"
        with open(programs_path, "r") as f:
            self.programs = json.load(f)["programs"]

        self.api_key = self.config["api_key"]
        self.api_provider = self.config.get("api_provider", "gemini")
        self.year = datetime.now().year
        self.output_dir = Path(__file__).parent.parent / "output" / "articles"
        self.output_dir.mkdir(parents=True, exist_ok=True)

    def _call_gemini(self, prompt):
        """Call Google Gemini API for content generation."""
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={self.api_key}"

        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.7,
                "maxOutputTokens": 4096,
                "topP": 0.9,
            },
        }

        try:
            if HAS_DEPS:
                response = requests.post(url, json=payload, timeout=60)
                response.raise_for_status()
                data = response.json()
            else:
                resp = http_post(url, json_data=payload, timeout=60)
                if resp["status_code"] != 200:
                    print(f"  [!] Gemini API error: HTTP {resp['status_code']}")
                    print(f"  [!] Response: {resp['text'][:500]}")
                    return ""
                data = resp["json"] if resp["json"] else json.loads(resp["text"])

            # Extract text from Gemini response
            candidates = data.get("candidates", [])
            if candidates:
                parts = candidates[0].get("content", {}).get("parts", [])
                if parts:
                    return parts[0].get("text", "")

            return ""
        except Exception as e:
            print(f"  [!] Gemini API error: {e}")
            return ""

    def _call_openai(self, prompt):
        """Call OpenAI API for content generation."""
        url = "https://api.openai.com/v1/chat/completions"

        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
        }

        payload = {
            "model": "gpt-4o-mini",
            "messages": [
                {
                    "role": "system",
                    "content": "You are an expert SEO content writer specializing in AI tool reviews and comparisons. You write engaging, informative, and well-structured articles that help readers make purchasing decisions. Always include pros, cons, pricing, and clear recommendations.",
                },
                {"role": "user", "content": prompt},
            ],
            "temperature": 0.7,
            "max_tokens": 4096,
        }

        try:
            if HAS_DEPS:
                response = requests.post(url, json=payload, headers=headers, timeout=60)
                response.raise_for_status()
                data = response.json()
            else:
                resp = http_post(url, json_data=payload, headers=headers, timeout=60)
                if resp["status_code"] != 200:
                    print(f"  [!] OpenAI API error: HTTP {resp['status_code']}")
                    return ""
                data = resp["json"] if resp["json"] else json.loads(resp["text"])

            return data["choices"][0]["message"]["content"]
        except Exception as e:
            print(f"  [!] OpenAI API error: {e}")
            return ""

    def _generate_content(self, prompt):
        """Route to the configured API provider."""
        if self.api_provider == "openai":
            return self._call_openai(prompt)
        else:
            return self._call_gemini(prompt)

    def _get_tool_info(self, tool_name):
        """Get affiliate program info for a tool."""
        for program in self.programs:
            if program["name"].lower() == tool_name.lower():
                return program
        return None

    def _build_affiliate_section(self, tools):
        """Build affiliate link references for tools mentioned in article."""
        sections = []
        for tool_name in tools:
            info = self._get_tool_info(tool_name)
            if info:
                sections.append(
                    f"- **[{info['name']}]({info['affiliate_link']})** - {info['description']} "
                    f"(Starting at {info['price_range']})"
                )
        return "\n".join(sections)

    def _build_listicle_prompt(self, idea):
        """Build prompt for listicle articles."""
        tools_info = []
        for tool_name in idea.get("tools", []):
            info = self._get_tool_info(tool_name)
            if info:
                tools_info.append(
                    f"- {info['name']}: {info['description']}. "
                    f"Pricing: {info['price_range']}. "
                    f"Pros: {', '.join(info['pros'])}. "
                    f"Cons: {', '.join(info['cons'])}. "
                    f"Rating: {info['rating']}/5"
                )

        tools_context = "\n".join(tools_info) if tools_info else "Use general knowledge about AI tools in this category."

        return f"""Write a comprehensive, SEO-optimized article titled: "{idea['title']}"

Target keyword: {idea.get('keyword', idea['title'])}

TOOLS TO COVER:
{tools_context}

ARTICLE REQUIREMENTS:
1. Start with a compelling introduction (2-3 paragraphs) explaining why readers need these tools
2. Include a "Quick Comparison Table" in markdown format near the top with columns: Tool | Best For | Price | Rating
3. For EACH tool, write a detailed section with:
   - H2 heading with the tool name
   - 2-3 paragraph overview
   - Key Features (bullet list of 4-5 features)
   - Pricing breakdown
   - Pros and Cons lists
   - Who it's best for (one sentence)
4. End with a "How We Tested" section (2 paragraphs)
5. End with a "Final Verdict" section recommending the best overall pick and best budget pick
6. Include a FAQ section with 4-5 common questions and answers

SEO REQUIREMENTS:
- Use the target keyword in the first paragraph
- Include the keyword naturally 3-5 times throughout
- Use H2 and H3 headings with related keywords
- Write meta description (under 160 chars) at the very top in format: META: description here
- Keep paragraphs short (2-3 sentences max)
- Total length: 2000-3000 words

TONE: Professional but conversational. Like a knowledgeable friend recommending tools.
Write in Markdown format.
"""

    def _build_comparison_prompt(self, idea):
        """Build prompt for comparison articles."""
        tools = idea.get("tools", [])
        tool1_info = self._get_tool_info(tools[0]) if len(tools) > 0 else None
        tool2_info = self._get_tool_info(tools[1]) if len(tools) > 1 else None

        context_parts = []
        if tool1_info:
            context_parts.append(
                f"{tool1_info['name']}:\n"
                f"  - Description: {tool1_info['description']}\n"
                f"  - Price: {tool1_info['price_range']}\n"
                f"  - Pros: {', '.join(tool1_info['pros'])}\n"
                f"  - Cons: {', '.join(tool1_info['cons'])}\n"
                f"  - Rating: {tool1_info['rating']}/5"
            )
        if tool2_info:
            context_parts.append(
                f"{tool2_info['name']}:\n"
                f"  - Description: {tool2_info['description']}\n"
                f"  - Price: {tool2_info['price_range']}\n"
                f"  - Pros: {', '.join(tool2_info['pros'])}\n"
                f"  - Cons: {', '.join(tool2_info['cons'])}\n"
                f"  - Rating: {tool2_info['rating']}/5"
            )

        tools_context = "\n\n".join(context_parts)

        return f"""Write a comprehensive, SEO-optimized comparison article titled: "{idea['title']}"

Target keyword: {idea.get('keyword', idea['title'])}

TOOLS TO COMPARE:
{tools_context}

ARTICLE STRUCTURE:
1. Introduction (2 paragraphs) - briefly introduce both tools and who this comparison is for
2. "Quick Verdict" box - 2-3 sentences saying which is better for what
3. Side-by-side comparison table (markdown): Feature | {tools[0] if tools else 'Tool 1'} | {tools[1] if len(tools) > 1 else 'Tool 2'}
4. Detailed comparison sections:
   - Features & Capabilities (H2)
   - Ease of Use (H2)
   - Pricing & Value (H2)
   - Output Quality (H2)
   - Integrations & Workflow (H2)
   - Customer Support (H2)
5. "Who Should Choose {tools[0] if tools else 'Tool 1'}?" section
6. "Who Should Choose {tools[1] if len(tools) > 1 else 'Tool 2'}?" section
7. Final Verdict with clear winner recommendation
8. FAQ (4 questions)

SEO REQUIREMENTS:
- Target keyword in first paragraph
- Use keyword 3-5 times naturally
- H2/H3 headings with related keywords
- META description at top: META: description here (under 160 chars)
- Short paragraphs (2-3 sentences)
- Total length: 1800-2500 words

TONE: Fair, balanced, but ultimately helpful with a clear recommendation.
Write in Markdown format.
"""

    def _build_review_prompt(self, idea):
        """Build prompt for review articles."""
        tool_name = idea.get("tools", [""])[0]
        tool_info = self._get_tool_info(tool_name)

        context = ""
        if tool_info:
            context = (
                f"Tool: {tool_info['name']}\n"
                f"Category: {tool_info['category']}\n"
                f"Description: {tool_info['description']}\n"
                f"Price: {tool_info['price_range']}\n"
                f"Pros: {', '.join(tool_info['pros'])}\n"
                f"Cons: {', '.join(tool_info['cons'])}\n"
                f"Rating: {tool_info['rating']}/5"
            )

        return f"""Write a comprehensive, SEO-optimized review article titled: "{idea['title']}"

Target keyword: {idea.get('keyword', idea['title'])}

TOOL INFORMATION:
{context}

ARTICLE STRUCTURE:
1. META description (under 160 chars): META: description here
2. Introduction (2 paragraphs) - what is this tool and why review it
3. "Quick Summary" box with: Rating, Price, Best For, Key Feature
4. "What is {tool_name}?" section (2 paragraphs)
5. Key Features (detailed breakdown of 5-7 features, each with H3)
6. Pricing & Plans (table format with features per tier)
7. Ease of Use / Getting Started (H2)
8. Output Quality / Performance (H2, with examples)
9. Pros and Cons (clear bullet lists)
10. Who is {tool_name} Best For? (3-4 user personas)
11. {tool_name} Alternatives (brief mention of 3 alternatives)
12. Final Verdict & Rating (X/5 stars with summary)
13. FAQ (5 questions)

SEO REQUIREMENTS:
- Target keyword in first paragraph and H1
- Keyword used 4-6 times naturally
- Related keywords in H2/H3 headings
- Short paragraphs, scannable content
- Total length: 2000-2800 words

TONE: Honest, detailed, experience-based review. Mention both positives and negatives.
Write in Markdown format.
"""

    def _build_alternative_prompt(self, idea):
        """Build prompt for alternatives articles."""
        tools_info = []
        for tool_name in idea.get("tools", []):
            info = self._get_tool_info(tool_name)
            if info:
                tools_info.append(
                    f"- {info['name']}: {info['description']} ({info['price_range']})"
                )

        tools_context = "\n".join(tools_info)

        return f"""Write a comprehensive, SEO-optimized article titled: "{idea['title']}"

Target keyword: {idea.get('keyword', idea['title'])}

ALTERNATIVE TOOLS TO RECOMMEND:
{tools_context}

ARTICLE STRUCTURE:
1. META description (under 160 chars): META: description here
2. Introduction - why people look for alternatives (2 paragraphs)
3. Quick comparison table: Tool | Best For | Price | Free Plan?
4. For EACH alternative:
   - H2 with tool name and "Best for [use case]"
   - 2 paragraph overview
   - Key differentiator from the original tool
   - Pricing
   - Pros/Cons (3 each)
5. "How to Choose the Right Alternative" section
6. Final recommendation
7. FAQ (4 questions)

SEO REQUIREMENTS:
- Target keyword in first paragraph
- Include "[original tool] alternative" variations
- H2/H3 with keyword variations
- META description at top
- Short paragraphs
- Total: 1800-2500 words

TONE: Helpful, acknowledging the original tool's strengths while showing viable alternatives.
Write in Markdown format.
"""

    def _build_category_guide_prompt(self, idea):
        """Build prompt for category guide articles."""
        tools_info = []
        for tool_name in idea.get("tools", []):
            info = self._get_tool_info(tool_name)
            if info:
                tools_info.append(
                    f"- {info['name']}: {info['description']} "
                    f"(Rating: {info['rating']}/5, Price: {info['price_range']})"
                )

        tools_context = "\n".join(tools_info) if tools_info else "Use general AI tool knowledge."

        return f"""Write a comprehensive, SEO-optimized guide titled: "{idea['title']}"

Target keyword: {idea.get('keyword', idea['title'])}
Category/Use case: {idea.get('category', 'AI Tools')}

TOOLS TO INCLUDE:
{tools_context}

ARTICLE STRUCTURE:
1. META description (under 160 chars): META: description here
2. Introduction - why AI tools matter for this use case (2-3 paragraphs)
3. "What to Look For" section - buying criteria (4-5 factors)
4. Quick comparison table
5. Detailed review of each tool (H2 per tool):
   - Overview
   - Best features for this use case
   - Pricing
   - Verdict (1-2 sentences)
6. "Our Testing Methodology" section
7. Final Recommendations (Best Overall, Best Value, Best for Beginners)
8. FAQ (4-5 questions)

SEO REQUIREMENTS:
- Target keyword in first paragraph
- Related long-tail keywords in H2/H3
- META description
- Short scannable paragraphs
- Total: 2000-3000 words

TONE: Expert guide that helps readers make confident decisions.
Write in Markdown format.
"""

    def generate_article(self, idea):
        """Generate a full SEO article from a content idea."""
        article_type = idea.get("type", "listicle")

        print(f"  [*] Generating {article_type} article: {idea['title']}")

        # Select the right prompt builder
        prompt_builders = {
            "listicle": self._build_listicle_prompt,
            "comparison": self._build_comparison_prompt,
            "review": self._build_review_prompt,
            "alternative": self._build_alternative_prompt,
            "category_guide": self._build_category_guide_prompt,
            "how_to": self._build_category_guide_prompt,  # reuse category guide format
        }

        builder = prompt_builders.get(article_type, self._build_listicle_prompt)
        prompt = builder(idea)

        # Generate content via AI
        print(f"  [*] Calling {self.api_provider} API...")
        content = self._generate_content(prompt)

        if not content:
            print(f"  [!] Failed to generate content for: {idea['title']}")
            return None

        # Extract meta description
        meta_description = ""
        meta_match = re.search(r"META:\s*(.+?)(?:\n|$)", content)
        if meta_match:
            meta_description = meta_match.group(1).strip()
            # Remove META line from content
            content = re.sub(r"META:\s*.+?\n?", "", content, count=1)

        # Add affiliate links section at the bottom
        affiliate_section = self._build_affiliate_section(idea.get("tools", []))

        # Build the final article with frontmatter
        slug = slugify(idea["title"])
        date_str = datetime.now().strftime("%Y-%m-%d")

        frontmatter = f"""---
title: "{idea['title']}"
date: {date_str}
slug: {slug}
category: {idea.get('category', 'AI Tools')}
type: {article_type}
keyword: "{idea.get('keyword', '')}"
meta_description: "{meta_description}"
tools: {json.dumps(idea.get('tools', []))}
---

"""
        # Compose final article
        final_article = frontmatter + content.strip()

        if affiliate_section:
            final_article += f"\n\n---\n\n## Quick Links\n\n{affiliate_section}\n"

        # Add disclosure
        final_article += (
            "\n\n---\n\n"
            "*Disclosure: This article contains affiliate links. "
            "If you purchase through these links, we may earn a commission "
            "at no additional cost to you. We only recommend tools we've tested and believe in.*\n"
        )

        # Save the article
        filename = f"{date_str}-{slug}.md"
        filepath = self.output_dir / filename

        with open(filepath, "w") as f:
            f.write(final_article)

        print(f"  [+] Article saved: {filepath}")
        print(f"  [+] Word count: ~{len(content.split())}")

        return {
            "title": idea["title"],
            "slug": slug,
            "filename": filename,
            "filepath": str(filepath),
            "type": article_type,
            "keyword": idea.get("keyword", ""),
            "meta_description": meta_description,
            "word_count": len(content.split()),
            "tools": idea.get("tools", []),
            "generated_at": datetime.now().isoformat(),
        }

    def generate_batch(self, ideas):
        """Generate multiple articles from a list of content ideas."""
        results = []

        print(f"\n[*] Generating {len(ideas)} articles...")
        print("=" * 60)

        for i, idea in enumerate(ideas, 1):
            print(f"\n[{i}/{len(ideas)}] Processing: {idea['title']}")

            result = self.generate_article(idea)

            if result:
                results.append(result)
            else:
                print(f"  [!] Skipped (generation failed)")

            # Rate limiting - wait between API calls
            if i < len(ideas):
                wait_time = 3 if self.api_provider == "gemini" else 2
                print(f"  [*] Waiting {wait_time}s (rate limiting)...")
                time.sleep(wait_time)

        # Save batch results
        results_path = self.output_dir / "batch_results.json"
        with open(results_path, "w") as f:
            json.dump(
                {
                    "generated_at": datetime.now().isoformat(),
                    "total_articles": len(results),
                    "articles": results,
                },
                f,
                indent=2,
            )

        print(f"\n{'=' * 60}")
        print(f"[+] Batch complete: {len(results)}/{len(ideas)} articles generated")
        print(f"[+] Results saved: {results_path}")

        return results


def generate_articles(content_plan, num_articles=3):
    """Convenience function: generate articles from a content plan."""
    generator = ArticleGenerator()
    ideas = content_plan.get("articles_to_write", [])[:num_articles]
    return generator.generate_batch(ideas)


if __name__ == "__main__":
    # Test with a sample idea
    sample_idea = {
        "title": f"Best 3 AI Writing Tools in {datetime.now().year}",
        "type": "listicle",
        "tools": ["Jasper AI", "Writesonic", "Copy.ai"],
        "category": "AI Writing",
        "keyword": f"best ai writing tools {datetime.now().year}",
        "monetization": "multiple_affiliate_links",
        "priority": "high",
    }

    generator = ArticleGenerator()
    result = generator.generate_article(sample_idea)

    if result:
        print(f"\nGenerated: {result['title']}")
        print(f"Word count: {result['word_count']}")
        print(f"Saved to: {result['filepath']}")
    else:
        print("Article generation failed.")
