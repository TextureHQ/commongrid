"use client";

import { useState } from "react";

export interface FieldItem {
  id: string;
  label: string;
  value: React.ReactNode;
  /** If true, shows a copy button that copies the string value */
  copyable?: boolean;
  /** If provided, wraps the value in a link */
  href?: string;
}

interface DetailFieldListProps {
  items: FieldItem[];
  /** 1 = full-width rows, 2 = two-column grid */
  columns?: 1 | 2;
}

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(value).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    });
  };

  return (
    <button type="button" className="copy-btn" onClick={handleCopy} aria-label="Copy">
      {copied ? "✓ copied" : "copy"}
    </button>
  );
}

function FieldValue({ item }: { item: FieldItem }) {
  if (item.value === null || item.value === undefined) {
    return <span style={{ color: "var(--cg-faint)" }}>—</span>;
  }

  const content = item.href ? (
    <a href={item.href} target={item.href.startsWith("http") ? "_blank" : undefined} rel="noopener noreferrer">
      {item.value}
    </a>
  ) : (
    <>{item.value}</>
  );

  return (
    <>
      {content}
      {item.copyable && typeof item.value === "string" && <CopyButton value={item.value} />}
    </>
  );
}

export function DetailFieldList({ items, columns = 1 }: DetailFieldListProps) {
  const filtered = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== "");

  if (filtered.length === 0) return null;

  const containerClass = columns === 2 ? "detail-fields-2col" : "detail-fields";

  return (
    <div className={containerClass}>
      {filtered.map((item) => (
        <div key={item.id} className="detail-field">
          <div className="detail-field-label">{item.label}</div>
          <div className="detail-field-value">
            <FieldValue item={item} />
          </div>
        </div>
      ))}
    </div>
  );
}
