import { useCallback, useEffect, useRef, useState } from "react";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faHeart, faXmark, faUndo, faArrowUpRightFromSquare, faCheck } from "@fortawesome/free-solid-svg-icons";
import { getSwipeQueue, sendSwipeFeedback, applySwipeFeedback, syncSwipeToZotero } from "./api";
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
        if (next.size > 1) next.delete(source); // keep at least one
      } else {
        next.add(source);
      }
      void loadQueue(next);
      return next;
    });
  };

  const current = index < queue.length ? queue[index] : null;

  const handleSwipe = useCallback(async (action: "like" | "dislike", fromGesture = false) => {
    if (!current || animating.current) return;
    animating.current = true;
    const dir = action === "like" ? "right" : "left";
    setLastSwiped({ item: current, idx: index });

    // Fire-and-forget feedback
    sendSwipeFeedback(current.url, action, current._source_type, current.title)
      .then((res) => setStats(res.stats))
      .catch(() => {});

    if (fromGesture) {
      // Gesture already has dragX set — go straight to exit
      setExiting(dir);
      setTimeout(() => {
        animating.current = false;
        setExiting(null);
        setDragX(0);
        setIndex((i) => i + 1);
      }, 300);
    } else {
      // Button/keyboard: two-phase animation
      // Phase 1: simulate drag (card slides + color overlay)
      setDragX(dir === "right" ? 150 : -150);
      setTimeout(() => {
        // Phase 2: fly out
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
    // re-insert not needed since queue is immutable; just move index back
  }, [lastSwiped]);

  // Pointer events for swipe gesture
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

  // Keyboard
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

  // Card transform
  const isDraggingByPointer = dragging.current;
  const cardStyle = exiting
    ? { transform: `translateX(${exiting === "right" ? 600 : -600}px) rotate(${exiting === "right" ? 15 : -15}deg)`, transition: "transform 0.3s ease-out, opacity 0.3s", opacity: 0 }
    : dragX !== 0
      ? { transform: `translateX(${dragX}px) rotate(${dragX * 0.04}deg)`, transition: isDraggingByPointer ? "none" : "transform 0.2s ease" }
      : { transform: "translateX(0) rotate(0)", transition: "transform 0.2s ease" };

  const overlayOpacity = Math.min(Math.abs(dragX) / 150, 0.4);
  const overlayColor = dragX > 0 ? `rgba(34,197,94,${overlayOpacity})` : dragX < 0 ? `rgba(239,68,68,${overlayOpacity})` : "transparent";

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

  const scoreColor = current.score >= 7 ? "#16a34a" : current.score >= 5 ? "#d97706" : "#9ca3af";

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

      <div className="swipe-card" ref={cardRef} style={cardStyle}
        onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp}
      >
        {/* Overlay tint */}
        <div className="swipe-card-overlay" style={{ background: overlayColor }} />

        {/* Header */}
        <div className="swipe-card-header">
          <span className="swipe-source-badge" style={{ background: SOURCE_COLORS[current._source_type] || "#666" }}>
            {sourceBadgeLabel(current._source_type)}
          </span>
          <span className="swipe-date">{current._date}</span>
          <span className="swipe-score" style={{ borderColor: scoreColor, color: scoreColor }}>{current.score.toFixed(1)}</span>
        </div>

        {/* Title */}
        <h2 className="swipe-card-title">{current.title}</h2>

        {/* Summary — scrollable, stops pointer events from triggering swipe */}
        <div className="swipe-card-summary" onPointerDown={(e) => e.stopPropagation()}>{current.summary}</div>

        {/* Metadata chips */}
        <div className="swipe-meta-row">
          {current.stars != null && <span className="swipe-chip">&#9733; {current.stars.toLocaleString()}</span>}
          {current.upvotes != null && <span className="swipe-chip">&#128077; {current.upvotes}</span>}
          {current.downloads != null && <span className="swipe-chip">&#128229; {current.downloads.toLocaleString()}</span>}
          {current.citation_count != null && <span className="swipe-chip">&#128218; {current.citation_count}</span>}
          {current.language && <span className="swipe-chip">{current.language}</span>}
        </div>

        {/* Open link */}
        <button className="swipe-open-link" onClick={(e) => { e.stopPropagation(); props.onOpenUrl(current.url); }}>
          {copy.swipe?.openLink ?? "Open"} <FontAwesomeIcon icon={faArrowUpRightFromSquare} />
        </button>
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
      </div>

      {/* Progress */}
      <div className="swipe-progress">
        <span>{index} / {queue.length} {copy.swipe?.progress ?? "reviewed"}</span>
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
