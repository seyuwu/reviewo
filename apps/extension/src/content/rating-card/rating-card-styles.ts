export const RATING_CARD_STYLES = `
:host {
  all: unset;
  box-sizing: border-box;
  display: block;
  position: fixed;
  right: 1rem;
  bottom: 1rem;
  z-index: 2147483647;
  width: min(18rem, calc(100vw - 2rem));
  max-width: min(18rem, calc(100vw - 2rem));
  pointer-events: auto;
}

.reviewo-card {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 1rem;
  background: #ffffff;
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 0.12),
    0 4px 6px -4px rgb(0 0 0 / 0.12);
  color: #171717;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  padding: 0.875rem 1rem 1rem;
}

.reviewo-card-header {
  align-items: center;
  display: flex;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}

.reviewo-eyebrow {
  color: #d4af37;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.reviewo-dismiss {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: #737373;
  cursor: pointer;
  display: inline-flex;
  font-size: 1.125rem;
  height: 1.75rem;
  justify-content: center;
  line-height: 1;
  padding: 0;
  width: 1.75rem;
}

.reviewo-dismiss:hover,
.reviewo-dismiss:focus-visible {
  background: #f5f5f5;
  color: #171717;
}

.reviewo-title {
  margin: 0 0 0.75rem;
  color: #171717;
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reviewo-stats {
  margin-bottom: 0.875rem;
}

.reviewo-stats-empty {
  margin-bottom: 0.875rem;
}

.reviewo-no-ratings {
  color: #171717;
  font-size: 1rem;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 0.25rem;
}

.reviewo-rating-row {
  align-items: baseline;
  display: flex;
  gap: 0.25rem;
  margin-bottom: 0.25rem;
}

.reviewo-rating-value {
  color: #171717;
  font-size: 1.5rem;
  font-weight: 800;
  line-height: 1;
}

.reviewo-rating-scale {
  color: #737373;
  font-size: 0.875rem;
  font-weight: 600;
}

.reviewo-meta {
  margin: 0;
  color: #525252;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.reviewo-rate-section {
  margin-bottom: 0.875rem;
}

.reviewo-rate-label {
  margin: 0 0 0.5rem;
  color: #525252;
  font-size: 0.75rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.reviewo-first-rating-copy {
  margin: 0 0 0.5rem;
  color: #525252;
  font-size: 0.8125rem;
  line-height: 1.4;
}

.reviewo-rate-controls {
  display: grid;
  gap: 0.375rem;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-bottom: 0.5rem;
}

.reviewo-rate-button {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 0.65rem;
  color: #171717;
  cursor: pointer;
  font-size: 0.8125rem;
  font-weight: 700;
  padding: 0.5rem 0;
}

.reviewo-rate-button:hover:not(:disabled),
.reviewo-rate-button:focus-visible:not(:disabled) {
  background: #f5f5f5;
  border-color: #d4d4d4;
}

.reviewo-rate-button.is-selected {
  background: #171717;
  border-color: #171717;
  color: #ffffff;
}

.reviewo-rate-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.reviewo-rate-hint {
  margin: 0;
  color: #737373;
  font-size: 0.75rem;
  line-height: 1.4;
}

.reviewo-rate-hint.is-hidden {
  display: none;
}

.reviewo-rate-status {
  margin: 0.35rem 0 0;
  color: #525252;
  font-size: 0.75rem;
  line-height: 1.4;
}

.reviewo-rate-status.is-error {
  color: #b91c1c;
}

.reviewo-rate-status.is-success {
  color: #166534;
}

.reviewo-parent-stats {
  border-top: 1px solid #f0f0f0;
  margin-bottom: 0.875rem;
  padding-top: 0.75rem;
}

.reviewo-parent-label {
  color: #737373;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 0.25rem;
  text-transform: uppercase;
}

.reviewo-parent-title {
  color: #171717;
  font-size: 0.8125rem;
  font-weight: 600;
  margin: 0 0 0.25rem;
}

.reviewo-details {
  align-items: center;
  background: #171717;
  border-radius: 0.75rem;
  color: #ffffff;
  display: inline-flex;
  font-size: 0.8125rem;
  font-weight: 700;
  justify-content: center;
  padding: 0.625rem 0.875rem;
  text-decoration: none;
  width: 100%;
}

.reviewo-details:hover,
.reviewo-details:focus-visible {
  background: #404040;
}
`;
