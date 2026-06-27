import type { ReactNode } from "react";

const MAX_RUN = 24;

const reviewTextStyle = {
  boxSizing: "border-box" as const,
  display: "block" as const,
  margin: 0,
  maxWidth: "100%",
  minWidth: 0,
  overflowWrap: "anywhere" as const,
  whiteSpace: "pre-wrap" as const,
  width: "100%",
  wordBreak: "break-all" as const
};

const reviewWrapStyle = {
  boxSizing: "border-box" as const,
  maxWidth: "100%",
  minWidth: 0,
  overflow: "hidden" as const,
  width: "100%"
};

function renderSegment(segment: string, segmentKey: string): ReactNode {
  if (segment.length <= MAX_RUN || /^\s+$/.test(segment)) {
    return segment;
  }

  const pieces: ReactNode[] = [];

  for (let index = 0; index < segment.length; index += MAX_RUN) {
    if (index > 0) {
      pieces.push(<wbr key={`${segmentKey}-wbr-${index}`} />);
    }

    pieces.push(segment.slice(index, index + MAX_RUN));
  }

  return pieces;
}

export function ReviewTextContent({ text }: { text: string }) {
  const segments = text.split(/(\s+)/);

  return (
    <div style={reviewWrapStyle}>
      <p style={reviewTextStyle}>
        {segments.map((segment, index) => (
          <span key={`segment-${index}`}>{renderSegment(segment, `segment-${index}`)}</span>
        ))}
      </p>
    </div>
  );
}
