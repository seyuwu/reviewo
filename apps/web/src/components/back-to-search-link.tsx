import Link from "next/link";

interface BackToSearchLinkProps {
  query?: string | undefined;
}

export function BackToSearchLink({ query }: BackToSearchLinkProps) {
  const trimmed = query?.trim() ?? "";
  const href = trimmed ? `/?q=${encodeURIComponent(trimmed)}` : "/";

  return (
    <nav className="entity-page-toolbar entity-page-toolbar-prominent" aria-label="Page navigation">
      <Link className="entity-back-button" href={href}>
        ← Назад к поиску
      </Link>
    </nav>
  );
}
