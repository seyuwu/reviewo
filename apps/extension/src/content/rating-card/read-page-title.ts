export function readPageSourceTitle(): string | undefined {
  const normalizedTitle = document.title.trim().replace(/\s+/g, " ");

  if (!normalizedTitle) {
    return undefined;
  }

  return normalizedTitle.slice(0, 200);
}
