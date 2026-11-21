import asyncio
import logging
import re
from html import unescape
import httpx

log = logging.getLogger("search")

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
}


async def search_duckduckgo(query: str, max_results: int = 3) -> list[dict]:
    """Search DuckDuckGo HTML endpoint and return top snippets."""
    results = []
    try:
        async with httpx.AsyncClient(timeout=8.0, follow_redirects=True, headers=HEADERS) as client:
            resp = await client.post("https://html.duckduckgo.com/html/", data={"q": query})
            if resp.status_code == 200:
                # Find result snippets and links
                items = re.findall(
                    r'<a class="result__snippet[^"]*"[^>]*>(.*?)</a>',
                    resp.text,
                    re.DOTALL | re.IGNORECASE,
                )
                titles = re.findall(
                    r'<a class="result__url[^"]*"[^>]*>(.*?)</a>',
                    resp.text,
                    re.DOTALL | re.IGNORECASE,
                )
                for i, raw_s in enumerate(items[:max_results]):
                    snippet = re.sub(r"<[^>]+>", "", unescape(raw_s)).strip()
                    title = re.sub(r"<[^>]+>", "", unescape(titles[i])).strip() if i < len(titles) else "Web Search Result"
                    if snippet:
                        results.append({"title": title, "snippet": snippet})
    except Exception as e:
        log.warning("DuckDuckGo search failed: %s", e)
    return results


async def get_software_version(name: str) -> dict | None:
    """Check official endoflife.date API for verified current release cycles."""
    slug = name.strip().lower().replace(" ", "").replace(".js", "")
    if slug in ("python", "nodejs", "node", "django", "react", "golang", "go", "rust", "php", "ruby"):
        api_slug = "nodejs" if slug in ("node", "nodejs") else ("go" if slug in ("go", "golang") else slug)
        try:
            async with httpx.AsyncClient(timeout=6.0) as client:
                resp = await client.get(f"https://endoflife.date/api/{api_slug}.json")
                if resp.status_code == 200:
                    data = resp.json()
                    if isinstance(data, list) and data:
                        latest = data[0]
                        return {
                            "technology": name.capitalize(),
                            "latest_version": latest.get("latest"),
                            "release_cycle": latest.get("cycle"),
                            "release_date": latest.get("releaseDate"),
                            "source": f"https://endoflife.date/{api_slug}",
                        }
        except Exception:
            pass
    return None


def is_live_search_query(text: str) -> bool:
    """Detect if a user query requires live / current internet search."""
    low = text.lower()
    patterns = [
        r"\b(latest|current|newest|recent|released|release date)\b",
        r"\b(today|yesterday|this week|this month|this year|2024|2025|2026)\b",
        r"\b(what is the latest version|current version of|latest news|current ceo|who is currently)\b",
        r"\b(stock price|weather in|who won)\b",
    ]
    return any(re.search(p, low) for p in patterns)


async def perform_search(query: str) -> str:
    """Perform real-time search and format context for the LLM."""
    context_parts = []

    # Check for software version queries first
    for tech in ["python", "nodejs", "django", "react", "golang", "rust"]:
        if tech in query.lower():
            info = await get_software_version(tech)
            if info:
                context_parts.append(
                    f"[Verified Release Info - {info['technology']}]: "
                    f"Latest Stable Version: {info['latest_version']} "
                    f"(Cycle: {info['release_cycle']}, Released: {info['release_date']}, Source: {info['source']})"
                )

    # General web search snippets
    web_results = await search_duckduckgo(query, max_results=3)
    for i, res in enumerate(web_results, 1):
        context_parts.append(f"[Web Search Result {i}] ({res['title']}): {res['snippet']}")

    return "\n\n".join(context_parts)
