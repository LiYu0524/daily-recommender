"""Fetch recent papers from PubMed via NCBI E-utilities API (free, no auth required)."""

from __future__ import annotations

import random
import time
from typing import Any

import requests

EUTILS_BASE = "https://eutils.ncbi.nlm.nih.gov/entrez/eutils"
DEFAULT_TIMEOUT = 20
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (iDeer-daily-recommender; +https://github.com/LiYu0524/iDeer)"
}


def search_pubmed(
    query: str,
    max_results: int = 50,
    days: int = 7,
    timeout: int = DEFAULT_TIMEOUT,
    api_key: str = "",
) -> list[str]:
    """Search PubMed and return a list of PMIDs."""
    params: dict[str, Any] = {
        "db": "pubmed",
        "term": query,
        "retmax": max_results,
        "sort": "date",
        "datetype": "edat",
        "reldate": days,
        "retmode": "json",
    }
    if api_key:
        params["api_key"] = api_key

    try:
        resp = requests.get(f"{EUTILS_BASE}/esearch.fcgi", params=params,
                            headers=_HEADERS, timeout=timeout)
        resp.raise_for_status()
        data = resp.json()
        return data.get("esearchresult", {}).get("idlist", [])
    except Exception as e:
        print(f"[pubmed] Search failed for '{query}': {e}")
        return []


def fetch_details(
    pmids: list[str],
    timeout: int = DEFAULT_TIMEOUT,
    api_key: str = "",
) -> list[dict[str, Any]]:
    """Fetch paper details for a list of PMIDs using efetch."""
    if not pmids:
        return []

    params: dict[str, Any] = {
        "db": "pubmed",
        "id": ",".join(pmids),
        "retmode": "xml",
    }
    if api_key:
        params["api_key"] = api_key

    try:
        resp = requests.get(f"{EUTILS_BASE}/efetch.fcgi", params=params,
                            headers=_HEADERS, timeout=timeout)
        resp.raise_for_status()
    except Exception as e:
        print(f"[pubmed] Fetch failed for {len(pmids)} PMIDs: {e}")
        return []

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(resp.text, "xml")

    papers = []
    for article in soup.find_all("PubmedArticle"):
        papers.append(_parse_article(article))

    return papers


def _parse_article(article) -> dict[str, Any]:
    """Parse a single PubmedArticle XML element into a dict."""
    medline = article.find("MedlineCitation")
    if not medline:
        return {}

    pmid_tag = medline.find("PMID")
    pmid = pmid_tag.text.strip() if pmid_tag else ""

    art = medline.find("Article")
    if not art:
        return {"paper_id": pmid, "title": "Untitled", "abstract": "", "url": f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"}

    # Title
    title_tag = art.find("ArticleTitle")
    title = title_tag.get_text(" ", strip=True) if title_tag else "Untitled"

    # Abstract
    abstract_tag = art.find("Abstract")
    if abstract_tag:
        abstract_parts = abstract_tag.find_all("AbstractText")
        abstract = " ".join(p.get_text(" ", strip=True) for p in abstract_parts)
    else:
        abstract = ""

    # Authors
    author_list = art.find("AuthorList")
    authors = []
    if author_list:
        for au in author_list.find_all("Author")[:10]:
            last = au.find("LastName")
            fore = au.find("ForeName")
            if last:
                name = last.text.strip()
                if fore:
                    name = f"{fore.text.strip()} {name}"
                authors.append(name)

    # Journal
    journal_tag = art.find("Journal")
    journal = ""
    if journal_tag:
        j_title = journal_tag.find("Title")
        if j_title:
            journal = j_title.get_text(strip=True)
        else:
            j_iso = journal_tag.find("ISOAbbreviation")
            if j_iso:
                journal = j_iso.get_text(strip=True)

    # Year
    pub_date = art.find("ArticleDate") or (journal_tag.find("PubDate") if journal_tag else None)
    year = ""
    if pub_date:
        year_tag = pub_date.find("Year")
        if year_tag:
            year = year_tag.text.strip()

    # DOI
    doi = ""
    for eid in art.find_all("ELocationID"):
        if eid.get("EIdType") == "doi":
            doi = eid.text.strip()
            break

    url = f"https://pubmed.ncbi.nlm.nih.gov/{pmid}/"

    return {
        "paper_id": pmid,
        "title": title,
        "abstract": abstract,
        "authors": ", ".join(authors),
        "journal": journal,
        "year": year,
        "doi": doi,
        "url": url,
    }


def fetch_papers_for_queries(
    queries: list[str],
    max_results_per_query: int = 50,
    days: int = 7,
    api_key: str = "",
    sleep_range: tuple[float, float] = (0.5, 1.5),
) -> list[dict[str, Any]]:
    """Fetch recent PubMed papers for multiple queries, deduplicated by PMID."""
    all_pmids: list[str] = []
    seen: set[str] = set()

    for query in queries:
        pmids = search_pubmed(query, max_results=max_results_per_query, days=days, api_key=api_key)
        for pid in pmids:
            if pid not in seen:
                seen.add(pid)
                all_pmids.append(pid)
        print(f"[pubmed] {len(pmids)} results for '{query}'")
        if len(queries) > 1:
            time.sleep(random.uniform(*sleep_range))

    if not all_pmids:
        return []

    # Fetch in batches of 100 (NCBI limit)
    papers: list[dict[str, Any]] = []
    for i in range(0, len(all_pmids), 100):
        batch = all_pmids[i:i + 100]
        papers.extend(fetch_details(batch, api_key=api_key))
        if i + 100 < len(all_pmids):
            time.sleep(random.uniform(*sleep_range))

    print(f"[pubmed] {len(papers)} total papers fetched (deduped)")
    return papers


if __name__ == "__main__":
    import json
    results = fetch_papers_for_queries(["machine learning drug discovery"], max_results_per_query=5, days=30)
    print(json.dumps(results, indent=2, ensure_ascii=False))
