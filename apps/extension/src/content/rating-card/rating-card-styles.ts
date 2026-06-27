// Use px (not rem) so card size stays consistent on sites like YouTube/Twitch
// that change the document root font-size. Scale is applied via --reviewo-ui-scale
// relative to a 1920x1080 reference viewport.
import { CARD_BASE_WIDTH_PX } from "./card-responsive-scale.js";

export const RATING_CARD_STYLES = `
:host {
  all: unset;
  box-sizing: border-box;
  display: block;
  position: fixed;
  z-index: 2147483647;
  width: ${CARD_BASE_WIDTH_PX}px;
  --reviewo-ui-scale: 1;
  transform: scale(var(--reviewo-ui-scale));
  pointer-events: auto;
}

:host([data-placement="bottom-right"]) {
  right: 16px;
  bottom: 16px;
  left: auto;
  top: auto;
  transform-origin: 100% 100%;
}

:host([data-placement="bottom-left"]) {
  left: 16px;
  bottom: 16px;
  right: auto;
  top: auto;
  transform-origin: 0% 100%;
}

:host([data-placement="top-right"]) {
  right: 16px;
  top: 16px;
  left: auto;
  bottom: auto;
  transform-origin: 100% 0%;
}

:host([data-placement="top-left"]) {
  left: 16px;
  top: 16px;
  right: auto;
  bottom: auto;
  transform-origin: 0% 0%;
}

.reviewo-card-shell {
  transform-origin: inherit;
}

.reviewo-card-shell.is-preparing {
  visibility: hidden;
  pointer-events: none;
}

.reviewo-card-shell.is-entering {
  animation: reviewo-card-pop-in 320ms cubic-bezier(0.22, 1, 0.36, 1) both;
}

.reviewo-card-shell.is-closing {
  animation: reviewo-card-pop-out 260ms cubic-bezier(0.4, 0, 0.2, 1) both;
  pointer-events: none;
}

@keyframes reviewo-card-pop-in {
  from {
    opacity: 0;
  }

  to {
    opacity: 1;
  }
}

@keyframes reviewo-card-pop-out {
  from {
    opacity: 1;
  }

  to {
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reviewo-card-shell.is-entering,
  .reviewo-card-shell.is-closing {
    animation: none;
  }
}

.reviewo-card {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 16px;
  background: #ffffff;
  box-shadow:
    0 10px 15px -3px rgb(0 0 0 / 0.12),
    0 4px 6px -4px rgb(0 0 0 / 0.12);
  color: #171717;
  display: flex;
  flex-direction: column;
  font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  font-size: 16px;
  min-width: 0;
  overflow: hidden;
  padding: 16px 18px 18px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

.reviewo-card-header {
  align-items: flex-start;
  display: flex;
  gap: 10px;
  justify-content: space-between;
  margin-bottom: 12px;
}

.reviewo-header-aside {
  align-items: flex-end;
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
  max-width: 42%;
}

.reviewo-site-snooze {
  align-items: flex-end;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.reviewo-site-snooze-label {
  color: #737373;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.01em;
  line-height: 1.2;
  text-align: right;
}

.reviewo-site-snooze-options {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  justify-content: flex-end;
}

.reviewo-site-snooze-button {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 6px;
  color: #525252;
  cursor: pointer;
  font-size: 10px;
  font-weight: 700;
  line-height: 1;
  min-width: 30px;
  padding: 4px 6px;
  transition:
    background-color 180ms ease,
    border-color 180ms ease,
    color 180ms ease;
}

.reviewo-site-snooze-button:hover:not(:disabled),
.reviewo-site-snooze-button:focus-visible:not(:disabled) {
  background: #f5f5f5;
  border-color: #d4d4d4;
  color: #171717;
}

.reviewo-site-snooze-button:disabled {
  cursor: default;
  opacity: 0.55;
}

.reviewo-card-heading {
  display: grid;
  gap: 6px;
  min-width: 0;
  width: 100%;
}

.reviewo-eyebrow {
  color: #d4af37;
  font-size: 11px;
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
  flex: 0 0 auto;
  font-size: 18px;
  height: 28px;
  justify-content: center;
  line-height: 1;
  padding: 0;
  transition:
    background-color 180ms ease,
    color 180ms ease;
  width: 28px;
}

.reviewo-dismiss:hover,
.reviewo-dismiss:focus-visible {
  background: #f5f5f5;
  color: #171717;
}

.reviewo-title {
  margin: 0;
  color: #171717;
  font-size: 16px;
  font-weight: 700;
  line-height: 1.35;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.reviewo-stats {
  margin-bottom: 14px;
}

.reviewo-stats-empty {
  margin-bottom: 14px;
}

.reviewo-no-ratings {
  color: #171717;
  font-size: 17px;
  font-weight: 700;
  line-height: 1.3;
  margin: 0 0 4px;
}

.reviewo-rating-row {
  align-items: baseline;
  display: flex;
  gap: 4px;
  margin-bottom: 4px;
}

.reviewo-rating-value {
  color: #171717;
  font-size: 26px;
  font-weight: 800;
  line-height: 1;
}

.reviewo-rating-scale {
  color: #737373;
  font-size: 15px;
  font-weight: 600;
}

.reviewo-meta {
  margin: 0;
  color: #525252;
  font-size: 14px;
  line-height: 1.45;
}

.reviewo-rate-section {
  margin-bottom: 14px;
}

.reviewo-rate-label {
  margin: 0 0 8px;
  color: #525252;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
}

.reviewo-first-rating-copy {
  margin: 0 0 8px;
  color: #525252;
  font-size: 14px;
  line-height: 1.45;
}

.reviewo-rate-controls {
  display: grid;
  gap: 6px;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  margin-bottom: 8px;
}

.reviewo-rate-button {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  color: #171717;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  padding: 9px 0;
  transition:
    background-color 200ms ease,
    border-color 200ms ease,
    color 200ms ease,
    opacity 180ms ease;
}

.reviewo-rate-button.is-selected {
  background: #171717;
  border-color: #171717;
  color: #ffffff;
}

.reviewo-rate-button:hover:not(:disabled),
.reviewo-rate-button:focus-visible:not(:disabled) {
  background: #f5f5f5;
  border-color: #d4d4d4;
}

.reviewo-rate-button.is-selected:hover:not(:disabled),
.reviewo-rate-button.is-selected:focus-visible:not(:disabled) {
  background: #262626;
  border-color: #262626;
  color: #ffffff;
}

.reviewo-rate-button:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.reviewo-rate-hint {
  margin: 0;
  color: #737373;
  font-size: 13px;
  line-height: 1.45;
}

.reviewo-rate-hint.is-hidden {
  display: none;
}

.reviewo-rate-status {
  margin: 6px 0 0;
  color: #525252;
  font-size: 13px;
  line-height: 1.45;
}

.reviewo-rate-status.is-error {
  color: #b91c1c;
}

.reviewo-rate-status.is-success {
  color: #166534;
}

.reviewo-parent-stats {
  border-top: 1px solid #f0f0f0;
  margin-bottom: 14px;
  padding-top: 12px;
}

.reviewo-parent-label {
  color: #737373;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  margin: 0 0 4px;
  text-transform: uppercase;
}

.reviewo-parent-title {
  color: #171717;
  font-size: 14px;
  font-weight: 600;
  margin: 0 0 4px;
}

.reviewo-reviews-panel {
  border-top: 1px solid #f0f0f0;
  margin-bottom: 14px;
  margin-top: 2px;
  padding-top: 12px;
}

.reviewo-reviews-panel-header {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: space-between;
  margin-bottom: 8px;
}

.reviewo-reviews-panel-header .reviewo-rate-label {
  margin: 0;
}

.reviewo-review-sort-label {
  align-items: center;
  color: #737373;
  display: inline-flex;
  font-size: 12px;
  gap: 6px;
}

.reviewo-review-sort-label select {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  color: #171717;
  font-size: 12px;
  padding: 4px 8px;
}

.reviewo-muted-copy {
  color: #737373;
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.reviewo-reviews-error {
  color: #b91c1c;
  margin-bottom: 8px;
}

.reviewo-review-list-viewport {
  max-height: 108px;
  max-width: 100%;
  min-width: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding-right: 2px;
  scroll-behavior: smooth;
}

.reviewo-review-list {
  display: grid;
  gap: 10px;
  max-width: 100%;
  min-width: 0;
}

.reviewo-review-list-hint {
  margin-top: 8px;
}

.reviewo-review-card {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  display: grid;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
  overflow: hidden;
  padding: 10px 12px;
}

.reviewo-review-text {
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
  max-height: 72px;
  max-width: 100%;
  overflow-wrap: anywhere;
  overflow-x: hidden;
  overflow-y: auto;
  white-space: pre-wrap;
  word-break: break-word;
}

.reviewo-review-card.is-compact .reviewo-review-text {
  max-height: 45px;
  overflow: hidden;
}

.reviewo-review-card.is-own-review {
  border-color: #d4af37;
}

.reviewo-review-you-label {
  color: #d4af37;
  font-weight: 700;
}

.reviewo-review-card-footer {
  align-items: center;
  display: flex;
  gap: 10px;
  justify-content: space-between;
}

.reviewo-review-vote-controls {
  display: inline-flex;
  gap: 6px;
}

.reviewo-review-vote-button {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  color: #171717;
  cursor: pointer;
  font-size: 12px;
  min-height: 28px;
  padding: 2px 8px;
}

.reviewo-review-like-button.is-active {
  background: rgba(212, 175, 55, 0.15);
  border-color: #d4af37;
}

.reviewo-review-vote-button:disabled {
  cursor: not-allowed;
  opacity: 0.45;
}

.reviewo-review-date {
  color: #737373;
  font-size: 12px;
}

.reviewo-details {
  align-items: center;
  align-self: stretch;
  background: #171717;
  border-radius: 12px;
  box-sizing: border-box;
  color: #ffffff;
  display: flex;
  flex-shrink: 0;
  font-size: 14px;
  font-weight: 700;
  justify-content: center;
  max-width: 100%;
  min-width: 0;
  padding: 11px 16px;
  text-align: center;
  text-decoration: none;
  transition: background-color 180ms ease;
  width: 100%;
}

.reviewo-details:hover,
.reviewo-details:focus-visible {
  background: #404040;
}
`;
