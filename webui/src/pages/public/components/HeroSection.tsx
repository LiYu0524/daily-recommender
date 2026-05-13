export function HeroSection() {
  return (
    <div className="animate-rise max-w-3xl">
      <span className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.24em] text-sea">
        今日趋势速递
      </span>
      <p className="mt-5 font-display text-[12px] font-semibold uppercase tracking-[0.28em] text-slate-500">
        GitHub · HuggingFace · X · arXiv · Semantic Scholar
      </p>
      <h2 className="hero-title mt-3 max-w-xl font-display text-[2.55rem] font-extrabold leading-[1.02] text-ink md:text-[4.35rem]">
        今天什么值得看？
      </h2>
    </div>
  );
}
