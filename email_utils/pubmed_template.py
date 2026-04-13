def get_paper_block_html(
    title: str,
    rate: str,
    authors: str,
    journal: str,
    year: str,
    pubmed_id: str,
    summary: str,
    url: str,
) -> str:
    meta_parts = []
    if authors:
        # Truncate long author lists
        author_list = authors.split(", ")
        if len(author_list) > 3:
            authors_display = ", ".join(author_list[:3]) + f" et al. ({len(author_list)} authors)"
        else:
            authors_display = authors
        meta_parts.append(authors_display)
    if journal:
        meta_parts.append(f"<strong>{journal}</strong>")
    if year:
        meta_parts.append(year)

    meta_html = " · ".join(meta_parts) if meta_parts else ""

    return f"""
    <table border="0" cellpadding="0" cellspacing="0" width="100%"
           style="font-family: Arial, sans-serif; border: 1px solid #ddd;
                  border-radius: 8px; padding: 16px; background-color: #e8f5e9;
                  margin-bottom: 12px;">
    <tr>
        <td>
            <div style="font-size: 20px; font-weight: bold; color: #1b5e20;">
                {title}
            </div>
            <div style="margin: 6px 0;">
                <span style="font-size: 14px; color: #555;">Relevance: </span>
                {rate}
            </div>
            <div style="font-size: 13px; color: #2e7d32; margin-bottom: 6px;">
                PMID: {pubmed_id}
            </div>
            <div style="font-size: 13px; color: #666; margin-bottom: 8px;">
                {meta_html}
            </div>
            <div style="font-size: 14px; color: #333; margin-bottom: 10px;">
                <strong>TLDR:</strong> {summary}
            </div>
            <a href="{url}"
               style="display: inline-block; padding: 8px 18px;
                      background-color: #2e7d32; color: white;
                      text-decoration: none; border-radius: 5px;
                      font-size: 14px;">
                View on PubMed
            </a>
        </td>
    </tr>
    </table>
    """
