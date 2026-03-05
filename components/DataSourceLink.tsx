import Link from "next/link";

const GITHUB_BASE = "https://github.com/TextureHQ/commongrid/blob/main";

interface DataSourceLinkProps {
  paths: string[];
  className?: string;
}

export function DataSourceLink({ paths, className = "" }: DataSourceLinkProps) {
  if (paths.length === 1) {
    return (
      <a
        href={`${GITHUB_BASE}/${paths[0]}`}
        target="_blank"
        rel="noopener noreferrer"
        className={`inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-brand-primary transition-colors ${className}`}
      >
        <span>📦</span>
        <span>View source data on GitHub</span>
      </a>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-x-4 gap-y-1 ${className}`}>
      <span className="text-xs text-text-muted">📦 Source data:</span>
      {paths.map((path) => {
        const fileName = path.split("/").pop() ?? path;
        return (
          <a
            key={path}
            href={`${GITHUB_BASE}/${path}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-text-muted hover:text-brand-primary transition-colors underline underline-offset-2"
          >
            {fileName}
          </a>
        );
      })}
    </div>
  );
}
