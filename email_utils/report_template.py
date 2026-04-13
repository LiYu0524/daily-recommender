import html

from email_utils.base_template import framework


def _escape(text) -> str:
    return html.escape(str(text or ""), quote=True)


def _source_badge(source: str) -> tuple[str, str]:
    mapping = {
        "github": ("GitHub", "#24292e"),
        "huggingface": ("HuggingFace", "#ff6f00"),
        "twitter": ("X/Twitter", "#1d9bf0"),
    }
    return mapping.get(str(source or "").lower(), (str(source or "source"), "#6b7280"))


def _render_signal(signal: dict) -> str:
    label, color = _source_badge(signal.get("source", ""))
    title = _escape(signal.get("title", "Untitled"))
    why = _escape(signal.get("why_it_matters", ""))
    url = _escape(signal.get("url", ""))
    link_open = f'<a href="{url}" style="color:#0f172a;text-decoration:none;">' if url else ""
    link_close = "</a>" if url else ""
    return f"""
    <li style="margin:10px 0 0 0; color:#475569; line-height:1.7;">
      <span style="display:inline-block;padding:2px 8px;border-radius:999px;background:{color}18;color:{color};
                   font-size:12px;font-weight:700;margin-right:8px;">{_escape(label)}</span>
      {link_open}<strong>{title}</strong>{link_close}
      <div style="margin-top:4px;">{why}</div>
    </li>
    """


def _render_prediction(prediction: dict) -> str:
    confidence = _escape(prediction.get("confidence", "未注明"))
    horizon = _escape(prediction.get("time_horizon", "未注明"))
    content = _escape(prediction.get("prediction", ""))
    rationale = _escape(prediction.get("rationale", ""))
    return f"""
    <div style="padding:16px 18px;border-radius:14px;background:#ffffff;border:1px solid #e2e8f0;margin-bottom:14px;">
      <div style="font-size:16px;font-weight:700;color:#0f172a;">{content}</div>
      <div style="margin-top:8px;font-size:12px;color:#64748b;">
        时间窗口：{horizon} · 置信度：{confidence}
      </div>
      <div style="margin-top:10px;font-size:14px;line-height:1.75;color:#334155;">{rationale}</div>
    </div>
    """


def _render_idea(idea: dict) -> str:
    title = _escape(idea.get("title", "Untitled"))
    detail = _escape(idea.get("detail", ""))
    why_now = _escape(idea.get("why_now", ""))
    return f"""
    <div style="padding:18px 20px;border-radius:16px;background:linear-gradient(180deg,#fffaf0,#ffffff);
                border:1px solid #f1e2bf;margin-bottom:14px;">
      <div style="font-size:17px;font-weight:700;color:#7c2d12;">{title}</div>
      <div style="margin-top:10px;font-size:14px;line-height:1.75;color:#374151;">{detail}</div>
      <div style="margin-top:12px;padding:10px 12px;background:#fff7ed;border-radius:10px;
                  font-size:13px;line-height:1.7;color:#9a3412;">
        为什么是现在：{why_now}
      </div>
    </div>
    """


def _render_watch(watch: dict) -> str:
    item = _escape(watch.get("item", ""))
    reason = _escape(watch.get("reason", ""))
    return f"""
    <li style="margin:10px 0;line-height:1.7;color:#475569;">
      <strong style="color:#0f172a;">{item}</strong>：{reason}
    </li>
    """


def render_report_email(report: dict) -> str:
    title = _escape(report.get("report_title", "Daily Personal Briefing"))
    subtitle = _escape(report.get("subtitle", ""))
    opening = _escape(report.get("opening", "")).replace("\n", "<br><br>")
    metadata = report.get("metadata", {}) or {}
    source_counts = metadata.get("source_counts", {}) or {}
    source_line = " · ".join(f"{_escape(name)} {count}" for name, count in source_counts.items())

    header = f"""
    <div style="font-family:'Helvetica Neue',Arial,sans-serif;margin-bottom:28px;">
      <div style="font-size:28px;font-weight:800;color:#0f172a;line-height:1.25;">{title}</div>
      <div style="margin-top:10px;font-size:15px;line-height:1.7;color:#475569;">{subtitle}</div>
      <div style="margin-top:14px;font-size:12px;color:#64748b;">
        生成日期：{_escape(metadata.get('date', ''))} · 来源覆盖：{source_line}
      </div>
    </div>
    """

    overview = f"""
    <div style="padding:24px 26px;border-radius:18px;background:linear-gradient(135deg,#f8fafc,#eef2ff);
                border:1px solid #dbeafe;box-shadow:0 18px 45px rgba(15,23,42,0.08);margin-bottom:28px;">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;color:#4338ca;text-transform:uppercase;">
        今日主线
      </div>
      <div style="margin-top:14px;font-size:15px;line-height:1.85;color:#1e293b;">
        {opening}
      </div>
    </div>
    """

    theme_blocks = []
    for theme in report.get("themes") or []:
        signals_html = "".join(_render_signal(signal) for signal in (theme.get("signals") or []))
        narrative_html = _escape(theme.get("narrative", "")).replace("\n", "<br><br>")
        theme_blocks.append(
            f"""
            <div style="padding:22px 24px;border-radius:18px;background:#ffffff;border:1px solid #e2e8f0;
                        box-shadow:0 10px 28px rgba(15,23,42,0.05);margin-bottom:18px;">
              <div style="font-size:22px;font-weight:800;color:#0f172a;line-height:1.35;">
                {_escape(theme.get("title", "Untitled"))}
              </div>
              <div style="margin-top:14px;font-size:15px;line-height:1.85;color:#334155;">
                {narrative_html}
              </div>
              <div style="margin-top:16px;padding-top:14px;border-top:1px solid #e2e8f0;">
                <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;color:#64748b;text-transform:uppercase;">
                  相关信号
                </div>
                <ul style="padding-left:18px;margin:8px 0 0 0;">
                  {signals_html}
                </ul>
              </div>
            </div>
            """
        )

    interpretation = report.get("interpretation") or {}
    thesis_html = _escape(interpretation.get("thesis", "")).replace("\n", "<br><br>")
    implications_html = _escape(interpretation.get("implications", "")).replace("\n", "<br><br>")
    interpretation_html = f"""
    <div style="padding:24px 26px;border-radius:18px;background:#f8fafc;border:1px solid #e2e8f0;margin-top:8px;">
      <div style="font-size:13px;font-weight:700;letter-spacing:0.08em;color:#0f766e;text-transform:uppercase;">
        我的判断
      </div>
      <div style="margin-top:14px;font-size:15px;line-height:1.85;color:#1f2937;">
        {thesis_html}
      </div>
      <div style="margin-top:16px;font-size:15px;line-height:1.85;color:#334155;">
        {implications_html}
      </div>
    </div>
    """

    predictions_html = "".join(_render_prediction(item) for item in (report.get("predictions") or []))
    ideas_html = "".join(_render_idea(item) for item in (report.get("ideas") or []))
    watchlist_html = "".join(_render_watch(item) for item in (report.get("watchlist") or []))

    content = (
        header
        + overview
        + '<div class="section-title" style="border-bottom-color:#0f172a;">连续阅读版简报</div>'
        + "".join(theme_blocks)
        + interpretation_html
        + '<div class="section-title" style="border-bottom-color:#2563eb;">短期预测</div>'
        + predictions_html
        + '<div class="section-title" style="border-bottom-color:#ea580c;">想法与机会</div>'
        + ideas_html
        + '<div class="section-title" style="border-bottom-color:#64748b;">继续跟踪</div>'
        + f'<ul style="padding-left:20px;margin:0;">{watchlist_html}</ul>'
    )
    return framework.replace("__CONTENT__", content)
