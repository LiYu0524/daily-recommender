"""Fetch latest arXiv papers by scraping the /list/{category}/new page."""

import random
import time

import requests
from bs4 import BeautifulSoup


_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"
}


def get_arxiv_new_papers(category: str = "cs.CV", max_results: int = 100) -> list[dict]:
    url = f"https://arxiv.org/list/{category}/new"
    response = requests.get(url, timeout=30, headers=_HEADERS)
    soup = BeautifulSoup(response.text, "html.parser")

    try:
        entries = soup.find_all("dl", id="articles")[0].find_all(["dt", "dd"])
    except (IndexError, AttributeError):
        return []

    papers = []
    for i in range(0, len(entries), 2):
        if i + 1 >= len(entries):
            break

        title_tag = entries[i + 1].find("div", class_="list-title")
        title = (
            title_tag.text.strip().replace("Title:", "").strip()
            if title_tag
            else "No title available"
        )

        abs_link = entries[i].find("a", title="Abstract")
        abs_url = ("https://arxiv.org" + abs_link["href"]) if abs_link else ""

        pdf_link = entries[i].find("a", title="Download PDF")
        pdf_url = ("https://arxiv.org" + pdf_link["href"]) if pdf_link else ""

        abstract_tag = entries[i + 1].find("p", class_="mathjax")
        abstract = abstract_tag.text.strip() if abstract_tag else "No abstract available"

        arxiv_id = pdf_url.split("/")[-1] if pdf_url else ""

        papers.append({
            "title": title,
            "arxiv_id": arxiv_id,
            "abstract": abstract,
            "pdf_url": pdf_url,
            "abstract_url": abs_url,
        })

        if len(papers) >= max_results:
            break

    return papers


def fetch_papers_for_categories(
    categories: list[str],
    max_entries: int = 100,
    sleep_range: tuple[int, int] = (3, 8),
) -> dict[str, list[dict]]:
    papers_by_category: dict[str, list[dict]] = {}
    for cat in categories:
        papers = get_arxiv_new_papers(cat, max_entries)
        papers_by_category[cat] = papers
        print(f"[arxiv] {len(papers)} papers fetched for {cat}")
        if len(categories) > 1:
            time.sleep(random.randint(*sleep_range))
    return papers_by_category
