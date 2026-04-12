import math

framework = """
<!DOCTYPE HTML>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Type" content="text/html; charset=UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    .star-wrapper {
      font-size: 1.3em;
      line-height: 1;
      display: inline-flex;
      align-items: center;
    }
    .half-star {
      display: inline-block;
      width: 0.5em;
      overflow: hidden;
      white-space: nowrap;
      vertical-align: middle;
    }
    .full-star {
      vertical-align: middle;
    }
    .section-title {
      font-size: 24px;
      font-weight: bold;
      color: #333;
      margin: 20px 0 15px 0;
      padding-bottom: 10px;
      border-bottom: 2px solid #333;
    }
    .lang-badge {
      display: inline-block;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 12px;
      font-weight: 600;
      margin-left: 8px;
    }
  </style>
</head>
<body>

<div>
    __CONTENT__
</div>

<br><br>
<div>
To unsubscribe, remove your email in your script settings.
</div>

</body>
</html>
"""


def get_empty_html():
    return """
  <table border="0" cellpadding="0" cellspacing="0" width="100%"
         style="font-family: Arial, sans-serif; border: 1px solid #ddd;
                border-radius: 8px; padding: 16px; background-color: #f9f9f9;">
  <tr>
    <td style="font-size: 20px; font-weight: bold; color: #333;">
        No Content Today. Take a Rest!
    </td>
  </tr>
  </table>
  """


def get_summary_html(content: str, rgb: str = "36,41,46") -> str:
    """Wrap summary HTML content with themed styles. rgb is 'R,G,B' string."""
    style = f"""
    <style>
      .summary-wrapper {{
        border-radius: 16px;
        padding: 24px 28px;
        background: linear-gradient(135deg, rgba({rgb},0.08), rgba({rgb},0.04));
        box-shadow: 0 18px 45px rgba(15, 23, 42, 0.12);
        margin-bottom: 32px;
        font-family: 'Helvetica Neue', Arial, sans-serif;
      }}
      .summary-section {{
        margin-bottom: 24px;
      }}
      .summary-section h2 {{
        margin: 0 0 12px 0;
        font-size: 22px;
        color: #1f2937;
        border-bottom: 2px solid rgba({rgb},0.2);
        padding-bottom: 8px;
      }}
      .summary-section p {{
        margin: 0;
        line-height: 1.7;
        color: #374151;
        font-size: 15px;
      }}
      .summary-list {{
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 16px;
      }}
      .summary-item {{
        padding: 16px 18px;
        border-radius: 12px;
        background: rgba(255,255,255,0.85);
        border: 1px solid rgba(229, 231, 235, 0.8);
      }}
      .summary-item__header {{
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
      }}
      .summary-item__title {{
        font-size: 17px;
        font-weight: 600;
        color: rgb({rgb});
        margin: 0;
      }}
      .summary-pill {{
        display: inline-flex;
        align-items: center;
        padding: 3px 10px;
        border-radius: 999px;
        background: rgba({rgb}, 0.12);
        color: rgb({rgb});
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.3px;
      }}
      .summary-item p {{
        margin: 10px 0 0 0;
        color: #4b5563;
        font-size: 14px;
        line-height: 1.6;
      }}
      .summary-item__stars {{
        margin: 6px 0 0 0;
        font-size: 13px;
        color: #6e7681;
      }}
      .summary-item strong {{
        color: #111827;
      }}
    </style>
    """
    content = str(content or "").strip()
    if 'class="summary-wrapper"' in content or "class='summary-wrapper'" in content:
        return f"{style}\n{content}"
    return f'{style}\n<div class="summary-wrapper">\n{content}\n</div>'


def render_summary_sections(summary_data: dict, rgb: str = "36,41,46") -> str:
    trend_summary = summary_data.get("trend_summary", "No trend summary available")
    additional_observation = summary_data.get("additional_observation", "None")

    recommendations = summary_data.get("recommendations", [])
    recs_html = []
    if isinstance(recommendations, list):
        for item in recommendations:
            if not isinstance(item, dict):
                continue
            title = item.get("title")
            if not title:
                continue
            category = item.get("category", "Unknown")
            reason = item.get("recommend_reason", "No reason provided")
            highlights = item.get("highlights", [])
            highlights_text = ", ".join(highlights) if highlights else "No highlights"
            recs_html.append(
                '  <li class="summary-item">\n'
                '    <div class="summary-item__header">'
                f'<span class="summary-item__title">{title}</span>'
                f'<span class="summary-pill">{category}</span></div>\n'
                f'    <p><strong>Recommend Reason:</strong> {reason}</p>\n'
                f'    <p><strong>Highlights:</strong> {highlights_text}</p>\n'
                '  </li>'
            )

    sections = [
        '<div class="summary-section">',
        "  <h2>Today's Trend</h2>",
        f"  <p>{trend_summary}</p>",
        "</div>",
        '<div class="summary-section">',
        "  <h2>Top Recommendations</h2>",
    ]
    if recs_html:
        sections.append('  <ol class="summary-list">')
        sections.extend(recs_html)
        sections.append("  </ol>")
    else:
        sections.append("  <p>No recommendations.</p>")
    sections.append("</div>")
    sections.extend([
        '<div class="summary-section">',
        "  <h2>Additional Observations</h2>",
        f"  <p>{additional_observation}</p>",
        "</div>",
    ])

    return get_summary_html("\n".join(sections), rgb)


def get_stars(score: float):
    full_star = '<span class="full-star">⭐</span>'
    half_star = '<span class="half-star">⭐</span>'
    low = 2
    high = 8
    if score <= low:
        return ""
    elif score >= high:
        return full_star * 5
    else:
        interval = (high - low) / 10
        star_num = math.ceil((score - low) / interval)
        full_star_num = int(star_num / 2)
        half_star_num = star_num - full_star_num * 2
        return (
            '<div class="star-wrapper">'
            + full_star * full_star_num
            + half_star * half_star_num
            + "</div>"
        )
