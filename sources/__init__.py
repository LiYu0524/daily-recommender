from sources.github_source import GitHubSource
from sources.huggingface_source import HuggingFaceSource
from sources.twitter_source import TwitterSource
from sources.arxiv_source import ArxivSource
from sources.semanticscholar_source import SemanticScholarSource
from sources.pubmed_source import PubMedSource
from sources.rss_source import RssSource

SOURCE_REGISTRY = {
    "github": GitHubSource,
    "huggingface": HuggingFaceSource,
    "twitter": TwitterSource,
    "arxiv": ArxivSource,
    "semanticscholar": SemanticScholarSource,
    "pubmed": PubMedSource,
    "rss": RssSource,
}
