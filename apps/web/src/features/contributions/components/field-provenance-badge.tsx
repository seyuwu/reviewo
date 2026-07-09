import styles from "./entity-contributions-section.module.css";

interface FieldProvenanceBadgeProps {
  label: string;
  votersCount?: number;
}

export function FieldProvenanceBadge({ label, votersCount }: FieldProvenanceBadgeProps) {
  return (
    <span className={styles.provenanceBadge} title={label}>
      ✓ {label}
      {votersCount && votersCount > 0 ? ` (${votersCount})` : ""}
    </span>
  );
}
