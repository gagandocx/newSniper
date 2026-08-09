#!/usr/bin/env python3
"""
AI Affiliate Automation - Main Runner

This is the single command that runs the entire pipeline:
1. Discover trending AI tools & generate content ideas
2. Generate SEO-optimized affiliate articles via AI
3. Build the static HTML site
4. Share on social media
5. Deploy to GitHub Pages (if configured)

Run manually:
    python run.py

Run with options:
    python run.py --articles 5        # Generate 5 articles
    python run.py --skip-social       # Skip social media posting
    python run.py --skip-deploy       # Skip deployment
    python run.py --discover-only     # Only run discovery (no generation)
    python run.py --build-only        # Only rebuild site from existing articles

Automate with cron (daily at 8am):
    0 8 * * * cd /path/to/ai-affiliate-automation && python run.py

Automate with GitHub Actions (see .github/workflows/daily.yml)
"""

import argparse
import json
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

# Add src to path
sys.path.insert(0, str(Path(__file__).parent / "src"))

from discovery import TrendingDiscovery
from article_generator import ArticleGenerator
from publisher import SitePublisher
from social_poster import SocialPoster


def print_banner():
    """Print startup banner."""
    print("""
╔══════════════════════════════════════════════════════════════╗
║          AI AFFILIATE AUTOMATION - Content Engine           ║
║                                                              ║
║  Discover → Generate → Publish → Share → Earn               ║
╚══════════════════════════════════════════════════════════════╝
""")


def print_step(step_num, total, title):
    """Print a step header."""
    print(f"\n{'━' * 60}")
    print(f"  Step {step_num}/{total}: {title}")
    print(f"{'━' * 60}")


def run_pipeline(
    num_articles=3,
    skip_social=False,
    skip_deploy=False,
    discover_only=False,
    build_only=False,
):
    """Run the full automation pipeline."""
    print_banner()

    start_time = time.time()
    total_steps = 5
    results = {
        "run_started": datetime.now().isoformat(),
        "steps_completed": [],
        "errors": [],
    }

    config_path = Path(__file__).parent / "config" / "settings.json"

    # ─────────────────────────────────────────────────────────────
    # STEP 1: DISCOVERY
    # ─────────────────────────────────────────────────────────────
    print_step(1, total_steps, "DISCOVERING TRENDING AI TOOLS")

    try:
        discovery = TrendingDiscovery(config_path=config_path)
        content_plan = discovery.get_content_plan(num_articles=num_articles)

        results["steps_completed"].append("discovery")
        results["content_plan"] = {
            "ideas_generated": len(content_plan.get("articles_to_write", [])),
            "trending_searches": len(
                content_plan.get("trending_context", {}).get("trending_searches", [])
            ),
        }

        if discover_only:
            print("\n[*] --discover-only flag set. Stopping after discovery.")
            results["mode"] = "discover_only"
            _save_run_log(results, start_time)
            return results

    except Exception as e:
        error_msg = f"Discovery failed: {e}"
        print(f"\n[!] {error_msg}")
        results["errors"].append(error_msg)
        # Continue with fallback - generate ideas without trending data
        content_plan = {"articles_to_write": []}

    # ─────────────────────────────────────────────────────────────
    # STEP 2: ARTICLE GENERATION
    # ─────────────────────────────────────────────────────────────
    if not build_only:
        print_step(2, total_steps, "GENERATING SEO ARTICLES")

        try:
            generator = ArticleGenerator(config_path=config_path)
            ideas = content_plan.get("articles_to_write", [])[:num_articles]

            if not ideas:
                print("[!] No content ideas available. Using fallback ideas.")
                # Fallback: generate a simple listicle
                ideas = [
                    {
                        "title": f"Best AI Writing Tools in {datetime.now().year}",
                        "type": "listicle",
                        "tools": ["Jasper AI", "Writesonic", "Copy.ai"],
                        "category": "AI Writing",
                        "keyword": f"best ai writing tools {datetime.now().year}",
                        "priority": "high",
                    }
                ]

            generated_articles = generator.generate_batch(ideas)

            results["steps_completed"].append("generation")
            results["articles_generated"] = len(generated_articles)
            results["generated_articles"] = generated_articles

            if not generated_articles:
                print("[!] No articles were generated. Check your API key.")
                results["errors"].append("No articles generated - API may be failing")

        except Exception as e:
            error_msg = f"Article generation failed: {e}"
            print(f"\n[!] {error_msg}")
            results["errors"].append(error_msg)
            generated_articles = []
    else:
        print_step(2, total_steps, "SKIPPING GENERATION (--build-only)")
        generated_articles = []
        results["steps_completed"].append("generation_skipped")

    # ─────────────────────────────────────────────────────────────
    # STEP 3: BUILD STATIC SITE
    # ─────────────────────────────────────────────────────────────
    print_step(3, total_steps, "BUILDING STATIC SITE")

    try:
        publisher = SitePublisher(config_path=config_path)
        site_result = publisher.build_site()

        if site_result:
            results["steps_completed"].append("publishing")
            results["site"] = site_result
        else:
            results["errors"].append("Site build returned no results (no articles?)")

    except Exception as e:
        error_msg = f"Site publishing failed: {e}"
        print(f"\n[!] {error_msg}")
        results["errors"].append(error_msg)

    # ─────────────────────────────────────────────────────────────
    # STEP 4: SOCIAL MEDIA SHARING
    # ─────────────────────────────────────────────────────────────
    if not skip_social and generated_articles:
        print_step(4, total_steps, "SHARING ON SOCIAL MEDIA")

        try:
            poster = SocialPoster(config_path=config_path)
            social_results = poster.post_batch(generated_articles)

            results["steps_completed"].append("social_media")
            results["social_posts"] = len(social_results)

        except Exception as e:
            error_msg = f"Social posting failed: {e}"
            print(f"\n[!] {error_msg}")
            results["errors"].append(error_msg)
    else:
        if skip_social:
            print_step(4, total_steps, "SKIPPING SOCIAL MEDIA (--skip-social)")
        else:
            print_step(4, total_steps, "SKIPPING SOCIAL MEDIA (no new articles)")
        results["steps_completed"].append("social_skipped")

    # ─────────────────────────────────────────────────────────────
    # STEP 5: DEPLOY TO GITHUB PAGES
    # ─────────────────────────────────────────────────────────────
    if not skip_deploy:
        print_step(5, total_steps, "DEPLOYING TO GITHUB PAGES")
        deploy_result = deploy_to_github_pages()
        if deploy_result:
            results["steps_completed"].append("deployment")
            results["deployment"] = deploy_result
        else:
            results["steps_completed"].append("deployment_skipped")
            print("  [*] Deployment skipped (not configured or failed)")
    else:
        print_step(5, total_steps, "SKIPPING DEPLOYMENT (--skip-deploy)")
        results["steps_completed"].append("deployment_skipped")

    # ─────────────────────────────────────────────────────────────
    # SUMMARY
    # ─────────────────────────────────────────────────────────────
    _save_run_log(results, start_time)
    _print_summary(results, start_time)

    return results


def deploy_to_github_pages():
    """Deploy the built site to GitHub Pages via git push."""
    site_dir = Path(__file__).parent / "output" / "site"

    if not site_dir.exists() or not any(site_dir.iterdir()):
        print("  [!] No site files to deploy")
        return None

    # Check if git is available and this is a repo
    try:
        # Check if we're in a git repo with a gh-pages setup
        git_dir = Path(__file__).parent / ".git"

        if not git_dir.exists():
            print("  [!] Not a git repository. To enable auto-deploy:")
            print("      1. Initialize: git init")
            print("      2. Add remote: git remote add origin <your-repo-url>")
            print("      3. Run again and it will auto-deploy to gh-pages branch")
            return None

        # Deploy to gh-pages branch
        print("  [*] Deploying to gh-pages branch...")

        commands = [
            "git add output/site/",
            'git commit -m "Auto-update: new articles generated" --allow-empty',
            "git subtree push --prefix output/site origin gh-pages",
        ]

        for cmd in commands:
            result = subprocess.run(
                cmd,
                shell=True,
                capture_output=True,
                text=True,
                cwd=str(Path(__file__).parent),
            )
            if result.returncode != 0 and "nothing to commit" not in result.stdout:
                print(f"  [!] Deploy command failed: {cmd}")
                print(f"      Error: {result.stderr[:200]}")
                return None

        print("  [+] Deployed to GitHub Pages!")
        return {"status": "deployed", "branch": "gh-pages"}

    except Exception as e:
        print(f"  [!] Deployment error: {e}")
        return None


def _save_run_log(results, start_time):
    """Save run results to log file."""
    elapsed = time.time() - start_time
    results["run_completed"] = datetime.now().isoformat()
    results["elapsed_seconds"] = round(elapsed, 2)

    log_dir = Path(__file__).parent / "output"
    log_dir.mkdir(parents=True, exist_ok=True)

    # Save latest run
    log_path = log_dir / "last_run.json"
    with open(log_path, "w") as f:
        json.dump(results, f, indent=2, default=str)

    # Append to run history
    history_path = log_dir / "run_history.json"
    history = []
    if history_path.exists():
        try:
            with open(history_path, "r") as f:
                history = json.load(f)
        except (json.JSONDecodeError, IOError):
            history = []

    history.append({
        "date": results["run_started"],
        "articles_generated": results.get("articles_generated", 0),
        "errors": len(results.get("errors", [])),
        "elapsed_seconds": results.get("elapsed_seconds", 0),
    })

    # Keep last 100 runs
    history = history[-100:]

    with open(history_path, "w") as f:
        json.dump(history, f, indent=2)


def _print_summary(results, start_time):
    """Print a summary of the pipeline run."""
    elapsed = time.time() - start_time

    print(f"\n{'═' * 60}")
    print(f"  PIPELINE COMPLETE")
    print(f"{'═' * 60}")
    print(f"  Time elapsed:      {elapsed:.1f} seconds")
    print(f"  Steps completed:   {len(results.get('steps_completed', []))}/{5}")
    print(f"  Articles generated: {results.get('articles_generated', 0)}")
    print(f"  Errors:            {len(results.get('errors', []))}")

    if results.get("errors"):
        print(f"\n  Errors encountered:")
        for err in results["errors"]:
            print(f"    - {err}")

    site = results.get("site", {})
    if site:
        print(f"\n  Site Stats:")
        print(f"    - Total articles: {site.get('total_articles', 0)}")
        print(f"    - Categories:     {len(site.get('categories', []))}")
        print(f"    - Pages built:    {site.get('pages_generated', 0)}")

    print(f"\n  Output directory: {Path(__file__).parent / 'output'}")
    print(f"  Site directory:   {Path(__file__).parent / 'output' / 'site'}")
    print(f"{'═' * 60}\n")


def main():
    """Parse arguments and run the pipeline."""
    parser = argparse.ArgumentParser(
        description="AI Affiliate Automation - Automated content generation pipeline",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  python run.py                    # Run full pipeline (3 articles)
  python run.py --articles 5       # Generate 5 articles
  python run.py --skip-social      # Skip social media posting
  python run.py --build-only       # Rebuild site from existing articles
  python run.py --discover-only    # Only discover trends, don't generate
        """,
    )

    parser.add_argument(
        "--articles",
        "-n",
        type=int,
        default=3,
        help="Number of articles to generate (default: 3)",
    )
    parser.add_argument(
        "--skip-social",
        action="store_true",
        help="Skip social media posting step",
    )
    parser.add_argument(
        "--skip-deploy",
        action="store_true",
        help="Skip GitHub Pages deployment",
    )
    parser.add_argument(
        "--discover-only",
        action="store_true",
        help="Only run discovery (no article generation)",
    )
    parser.add_argument(
        "--build-only",
        action="store_true",
        help="Only rebuild site from existing articles",
    )

    args = parser.parse_args()

    run_pipeline(
        num_articles=args.articles,
        skip_social=args.skip_social,
        skip_deploy=args.skip_deploy,
        discover_only=args.discover_only,
        build_only=args.build_only,
    )


if __name__ == "__main__":
    main()
