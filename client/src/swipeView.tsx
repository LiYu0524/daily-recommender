import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeart, faXmark, faUndo, faArrowUpRightFromSquare, faCheck } from "@fortawesome/free-solid-svg-icons";
import { getSwipeQueue, sendSwipeFeedback, applySwipeFeedback, syncSwipeToZotero, buildUrl } from "./api";
import type { SwipeItem, SwipeStats } from "./types";
import type { AppCopy } from "./copy";
import iconArxiv from "./assets/icon_arxiv.svg";
import iconHF from "./assets/icon_hf.svg";
import iconGitHub from "./assets/icon_github.svg";
import iconPubMed from "./assets/icon_pubmed.svg";
import iconSS from "./assets/icon_ss.svg";
import iconX from "./assets/icon_x.black.svg";

const SOURCE_COLORS: Record<string, string> = {
  arxiv: "#b31b1b",
  huggingface: "#ff6f00",
  github: "#24292e",
  semanticscholar: "#1857b6",
  twitter: "#1d9bf0",
  pubmed: "#2e7d32",
};

const SOURCE_ICONS: Record<string, string> = {
  arxiv: iconArxiv,
  huggingface: iconHF,
  github: iconGitHub,
  semanticscholar: iconSS,
  twitter: iconX,
  pubmed: iconPubMed,
};

const ALL_SOURCES = ["arxiv", "huggingface", "github", "semanticscholar", "pubmed", "twitter"] as const;

function sourceBadgeLabel(source: string) {
  const map: Record<string, string> = { arxiv: "arXiv", huggingface: "HuggingFace", github: "GitHub", semanticscholar: "S2", twitter: "X", pubmed: "PubMed" };
  return map[source] || source;
}

function firstSentence(text: string): string {
  const m = text.match(/^.+?[.!?](?:\s|$)/s);
  return m ? m[0].trim() : text;
}

export function SwipeView(props: {
  backendHealthy: boolean;
  copy: AppCopy;
  onOpenUrl: (url: string) => void;
}) {
  const { copy } = props;
  const [selectedSources, setSelectedSources] = useState<Set<string>>(new Set(ALL_SOURCES));
  const [queue, setQueue] = useState<SwipeItem[]>([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<SwipeStats>({ liked: 0, disliked: 0, total: 0 });
  const [lastSwiped, setLastSwiped] = useState<{ item: SwipeItem; idx: number } | null>(null);
  const [dragX, setDragX] = useState(0);
  const [exiting, setExiting] = useState<"left" | "right" | null>(null);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState("");
  const [teaserUrl, setTeaserUrl] = useState<string | null>(null);
  const [teaserLoading, setTeaserLoading] = useState(false);
  const teaserCache = useRef<Map<string, string | null>>(new Map());
  const dragging = useRef(false);
  const animating = useRef(false);
  const startX = useRef(0);
  const cardRef = useRef<HTMLDivElement>(null);

  const loadQueue = useCallback(async (sources?: Set<string>) => {
    const srcList = [...(sources ?? selectedSources)];
    setLoading(true);
    try {
      const data = await getSwipeQueue(srcList, 30, 50);
      setQueue(data.items);
      setIndex(0);
      setStats({ liked: data.total_swiped, disliked: 0, total: data.total_swiped });
    } catch {
      setQueue([]);
    } finally {
      setLoading(false);
    }
  }, [selectedSources]);

  useEffect(() => { if (props.backendHealthy) void loadQueue(); }, [props.backendHealthy, loadQueue]);

  const toggleSource = (source: string) => {
    setSelectedSources((prev) => {
      const next = new Set(prev);
      if (next.has(source)) {
        if (next.size > 1) next.delete(source);
      } else {
        next.add(source);
      }
      void loadQueue(next);
      return next;
    });
  };

  const current = index < queue.length ? queue[index] : null;

  // Prefetch teaser images for upcoming cards
  const prefetchTeaser = useCallback((item: SwipeItem) => {
    const cache = teaserCache.current;
    if (cache.has(item.url)) return;
    cache.set(item.url, null); // mark as in-flight
    fetch(buildUrl(`/api/paper-teaser?url=${encodeURIComponent(item.url)}`))
      .then(r => r.json())
      .then((d: { image_url: string | null }) => {
        if (d.image_url) {
          const proxyUrl = buildUrl(`/api/proxy-image?url=${encodeURIComponent(d.image_url)}`);
          cache.set(item.url, proxyUrl);
          // Preload the actual image bytes into browser cache
          const img = new Image();
          img.src = proxyUrl;
        } else {
          cache.set(item.url, null);
        }
      })
      .catch(() => cache.set(item.url, null));
  }, []);

  // On index change: set current teaser + prefetch next 3
  useEffect(() => {
    if (!current) { setTeaserUrl(null); setTeaserLoading(false); return; }

    const cached = teaserCache.current.get(current.url);
    if (cached !== undefined) {
      // Already fetched (or fetched as null)
      setTeaserUrl(cached);
      setTeaserLoading(false);
    } else {
      // Not prefetched yet — fetch now
      setTeaserUrl(null);
      setTeaserLoading(true);
      fetch(buildUrl(`/api/paper-teaser?url=${encodeURIComponent(current.url)}`))
        .then(r => r.json())
        .then((d: { image_url: string | null }) => {
          if (d.image_url) {
            const proxyUrl = buildUrl(`/api/proxy-image?url=${encodeURIComponent(d.image_url)}`);
            teaserCache.current.set(current.url, proxyUrl);
            setTeaserUrl(proxyUrl);
          } else {
            teaserCache.current.set(current.url, null);
          }
        })
        .catch(() => teaserCache.current.set(current.url, null))
        .finally(() => setTeaserLoading(false));
    }

    // Prefetch next 3 cards
    for (let i = index + 1; i <= Math.min(index + 3, queue.length - 1); i++) {
      prefetchTeaser(queue[i]);
    }
  }, [index, current?.url, queue, prefetchTeaser]);

  const handleSwipe = useCallback(async (action: "like" | "dislike", fromGesture = false) => {
    if (!current || animating.current) return;
    animating.current = true;
    const dir = action === "like" ? "right" : "left";
    setLastSwiped({ item: current, idx: index });

    sendSwipeFeedback(current.url, action, current._source_type, current.title)
      .then((res) => setStats(res.stats))
      .catch(() => {});

    if (fromGesture) {
      setExiting(dir);
      setTimeout(() => {
        animating.current = false;
        setExiting(null);
        setDragX(0);
        setIndex((i) => i + 1);
      }, 300);
    } else {
      setDragX(dir === "right" ? 150 : -150);
      setTimeout(() => {
        setExiting(dir);
        setDragX(0);
        setTimeout(() => {
          animating.current = false;
          setExiting(null);
          setIndex((i) => i + 1);
        }, 300);
      }, 200);
    }
  }, [current, index]);

  const handleUndo = useCallback(() => {
    if (!lastSwiped) return;
    setIndex(lastSwiped.idx);
    setLastSwiped(null);
  }, [lastSwiped]);

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    setDragX(e.clientX - startX.current);
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    if (dragX > 100) {
      void handleSwipe("like", true);
    } else if (dragX < -100) {
      void handleSwipe("dislike", true);
    } else {
      setDragX(0);
    }
  };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") void handleSwipe("like");
      else if (e.key === "ArrowLeft") void handleSwipe("dislike");
      else if (e.key === "z" || e.key === "Z") handleUndo();
      else if (e.key === " " && current) { e.preventDefault(); props.onOpenUrl(current.url); }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handleSwipe, handleUndo, current, props]);

  const handleApply = async () => {
    setApplying(true);
    try {
      await applySwipeFeedback();
      setApplied(true);
      setTimeout(() => setApplied(false), 3000);
    } catch { /* ignore */ }
    setApplying(false);
  };

  const handleSyncZotero = async () => {
    setSyncing(true);
    setSyncResult("");
    try {
      const res = await syncSwipeToZotero();
      setSyncResult(`${res.synced} synced`);
      setTimeout(() => setSyncResult(""), 4000);
    } catch {
      setSyncResult("failed");
      setTimeout(() => setSyncResult(""), 3000);
    }
    setSyncing(false);
  };

  const isDraggingByPointer = dragging.current;
  const cardStyle = exiting
    ? { transform: `translateX(${exiting === "right" ? 600 : -600}px) rotate(${exiting === "right" ? 15 : -15}deg)`, transition: "transform 0.3s ease-out, opacity 0.3s", opacity: 0 }
    : dragX !== 0
      ? { transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`, transition: isDraggingByPointer ? "none" : "transform 0.2s ease" }
      : { transform: "translateX(0) rotate(0)", transition: "transform 0.2s ease" };

  const stampOpacity = exiting ? 1 : Math.min(Math.abs(dragX) / 120, 1);
  const stampDirection = exiting === "right" ? "accept" : exiting === "left" ? "reject" : dragX > 30 ? "accept" : dragX < -30 ? "reject" : null;
  const sourceColor = SOURCE_COLORS[current?._source_type ?? ""] || "#666";

  if (loading) {
    return <div className="swipe-container"><p className="swipe-empty">{copy.swipe?.loading ?? "Loading..."}</p></div>;
  }

  if (!current) {
    return (
      <div className="swipe-container">
        <div className="swipe-source-filter">
          {ALL_SOURCES.map((src) => (
            <button key={src} className={selectedSources.has(src) ? "swipe-source-icon active" : "swipe-source-icon"} onClick={() => toggleSource(src)} title={sourceBadgeLabel(src)} style={{ borderColor: selectedSources.has(src) ? (SOURCE_COLORS[src] || "#666") : "transparent" }}>
              <img src={SOURCE_ICONS[src]} alt={src} />
            </button>
          ))}
        </div>
        <div className="swipe-empty-card">
          <p className="swipe-empty-title">{copy.swipe?.empty ?? "No more items"}</p>
          <p className="swipe-empty-sub">{copy.swipe?.emptyHint ?? "Run a digest first or expand the date range."}</p>
          <button className="swipe-apply-btn" onClick={() => void loadQueue()}>{copy.swipe?.refresh ?? "Refresh"}</button>
          {stats.total > 0 && (
            <button className="swipe-apply-btn secondary" onClick={() => void handleApply()} disabled={applying}>
              {applied ? (copy.swipe?.applied ?? "Applied!") : applying ? (copy.swipe?.applying ?? "Applying...") : (copy.swipe?.applyFeedback ?? "Apply to profile")}
            </button>
          )}
        </div>
      </div>
    );
  }

  const oneSentence = firstSentence(current.summary ?? "");

  return (
    <div className="swipe-container">
      {/* Source filter bar */}
      <div className="swipe-source-filter">
        {ALL_SOURCES.map((src) => (
          <button
            key={src}
            className={selectedSources.has(src) ? "swipe-source-icon active" : "swipe-source-icon"}
            onClick={() => toggleSource(src)}
            title={sourceBadgeLabel(src)}
            style={{ borderColor: selectedSources.has(src) ? (SOURCE_COLORS[src] || "#666") : "transparent" }}
          >
            <img src={SOURCE_ICONS[src]} alt={src} />
          </button>
        ))}
      </div>

      <div className="swipe-card swipe-card-fullpage" ref={cardRef} style={cardStyle}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      >
        {/* Swipe stamp overlay */}
        {stampDirection && (
          <div className={`swipe-stamp ${stampDirection}`} style={{ opacity: stampOpacity }}>
            <span className="swipe-stamp-label">{stampDirection === "accept" ? "ACCEPT" : "REJECT"}</span>
          </div>
        )}
        {/* Border glow */}
        {stampDirection && (
          <div className={`swipe-card-border-glow ${stampDirection}`} style={{ opacity: stampOpacity }} />
        )}

        {/* 顶部图片区 */}
        <div className={teaserUrl ? "swipe-teaser-area" : "swipe-teaser-area compact"} style={{ background: teaserLoading ? "#f3f4f6" : (teaserUrl ? "#fff" : sourceColor + "18") }}>
          {teaserLoading
            ? <div className="swipe-teaser-spinner" />
            : teaserUrl
              ? <img src={teaserUrl} className="swipe-teaser-img" alt="teaser" />
              : <div className="swipe-teaser-authors">
                  {current._source_type === "github" ? (
                    <>
                      <a className="swipe-teaser-github-link" href={current.url} onClick={e => { e.stopPropagation(); props.onOpenUrl(current.url); }}>
                        {current.url.replace("https://github.com/", "")}
                      </a>
                      <div className="swipe-teaser-meta-row">
                        {current.language && <span className="swipe-teaser-chip">{current.language}</span>}
                        {current.stars != null && <span className="swipe-teaser-chip">★ {current.stars.toLocaleString()}</span>}
                        {current.forks != null && <span className="swipe-teaser-chip">⑂ {current.forks.toLocaleString()}</span>}
                      </div>
                    </>
                  ) : (
                    <>
                      {current.authors && <span className="swipe-teaser-authors-text">{current.authors}</span>}
                      {current.venue && <span className="swipe-teaser-venue">{current.venue}</span>}
                    </>
                  )}
                </div>}
          <span className="swipe-source-badge swipe-source-badge-overlay" style={{ background: sourceColor }}>
            {sourceBadgeLabel(current._source_type)}
          </span>
        </div>

        {/* 下半内容区 */}
        <div className="swipe-card-body">
          <h2 className="swipe-card-title">{current.title}</h2>
          <p className="swipe-card-onesent">{oneSentence}</p>
          <button className="swipe-open-link" onClick={(e) => { e.stopPropagation(); props.onOpenUrl(current.url); }}>
            {copy.swipe?.openLink ?? "Open"} <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div className="swipe-actions">
        <button className="swipe-btn dislike" onClick={() => void handleSwipe("dislike")} title="Skip (←)">
          <FontAwesomeIcon icon={faXmark} />
        </button>
        {lastSwiped && (
          <button className="swipe-btn undo" onClick={handleUndo} title="Undo (Z)">
            <FontAwesomeIcon icon={faUndo} />
          </button>
        )}
        <button className="swipe-btn like" onClick={() => void handleSwipe("like")} title="Like (→)">
          <FontAwesomeIcon icon={faHeart} />
        </button>
        {stats.total > 0 && (
          <>
            <button className="swipe-apply-inline" onClick={() => void handleApply()} disabled={applying}>
              {applied ? <FontAwesomeIcon icon={faCheck} /> : (copy.swipe?.applyFeedback ?? "Apply")}
            </button>
            <button className="swipe-apply-inline zotero" onClick={() => void handleSyncZotero()} disabled={syncing}>
              {syncResult || (syncing ? "Syncing..." : "Zotero")}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
