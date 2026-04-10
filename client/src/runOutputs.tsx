import type { ReactNode } from "react";
import type { RunOutputFile } from "./types";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

export function normalizeRunOutputs(value: unknown): RunOutputFile[] {
  if (!Array.isArray(value)) {
    return [];
  }

  const files: RunOutputFile[] = [];

  for (const item of value) {
    if (!isRecord(item) || typeof item.type !== "string" || typeof item.name !== "string" || typeof item.source !== "string") {
      continue;
    }

    if (item.type === "markdown" && typeof item.content === "string") {
      files.push({
        type: "markdown",
        name: item.name,
        content: item.content,
        source: item.source,
      });
      continue;
    }

    if (item.type === "html" && typeof item.url === "string") {
      files.push({
        type: "html",
        name: item.name,
        url: item.url,
        source: item.source,
      });
      continue;
    }

    if (item.type === "json_list" && Array.isArray(item.items)) {
      files.push({
        type: "json_list",
        name: item.name,
        items: item.items,
        source: item.source,
      });
    }
  }

  return files;
}

export function getRunOutputKey(file: RunOutputFile) {
  return `${file.source}:${file.type}:${file.name}`;
}

export function renderRunOutputLabel(file: RunOutputFile): ReactNode {
  const prefix = `${file.source} / `;

  if (file.type === "html") {
    return <a href={file.url} target="_blank" rel="noreferrer">{prefix}{file.name}</a>;
  }

  if (file.type === "json_list") {
    return <span>{prefix}{file.name} ({file.items.length} items)</span>;
  }

  return <span>{prefix}{file.name}</span>;
}
