// Use px (not rem) so card size stays consistent on sites like YouTube/Twitch
// that change the document root font-size.
import { CARD_BASE_WIDTH_PX } from "./card-responsive-scale.js";

export const RATING_CARD_STYLES = `
:host {
  all: unset;
  box-sizing: border-box;
  display: block;
  position: fixed;
  z-index: 2147483647;
  width: min(${CARD_BASE_WIDTH_PX}px, calc(100vw - 32px));
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

  .reviewo-card,
  .reviewo-chat-panel,
  .reviewo-chat-panel-inner {
    transition: none !important;
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
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 16px 18px 18px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

@supports (interpolate-size: allow-keywords) {
  .reviewo-card {
    height: auto;
    interpolate-size: allow-keywords;
    transition: height 320ms cubic-bezier(0.22, 1, 0.36, 1);
  }
}

.reviewo-card-scroll {
  display: contents;
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

.reviewo-header-controls {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  gap: 2px;
}

.reviewo-pin {
  align-items: center;
  background: transparent;
  border: 0;
  border-radius: 999px;
  color: #a3a3a3;
  cursor: pointer;
  display: inline-flex;
  flex: 0 0 auto;
  height: 28px;
  justify-content: center;
  padding: 0;
  transition:
    background-color 180ms ease,
    color 180ms ease,
    transform 180ms ease;
  width: 28px;
}

.reviewo-pin-icon {
  display: block;
  height: 17px;
  transform: rotate(-45deg);
  transform-origin: center;
  width: 17px;
}

.reviewo-pin.is-pinned .reviewo-pin-icon {
  transform: rotate(-45deg) scale(1.08);
}

.reviewo-pin:hover,
.reviewo-pin:focus-visible {
  background: #f5f5f5;
  color: #525252;
}

.reviewo-pin.is-pinned {
  background: rgba(212, 175, 55, 0.14);
  color: #b8860b;
}

.reviewo-pin.is-pinned:hover,
.reviewo-pin.is-pinned:focus-visible {
  background: rgba(212, 175, 55, 0.22);
  color: #996515;
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

.reviewo-disable-everywhere-button {
  background: transparent;
  border: 0;
  color: #737373;
  cursor: pointer;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.2;
  padding: 0;
  text-align: right;
  text-decoration: underline;
  text-underline-offset: 2px;
  transition: color 180ms ease;
}

.reviewo-disable-everywhere-button:hover:not(:disabled),
.reviewo-disable-everywhere-button:focus-visible:not(:disabled) {
  color: #171717;
}

.reviewo-disable-everywhere-button:disabled {
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

.reviewo-review-carousel {
  display: grid;
  gap: 8px;
  max-width: 100%;
  min-width: 0;
}

.reviewo-review-carousel-actions {
  align-items: center;
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.reviewo-review-carousel-nav {
  align-items: center;
  display: flex;
  gap: 8px;
  justify-content: center;
}

.reviewo-review-write-cta {
  align-items: center;
  background: rgba(212, 175, 55, 0.12);
  border: 1px solid rgba(212, 175, 55, 0.45);
  border-radius: 999px;
  color: #171717;
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  min-height: 32px;
  padding: 0 12px;
  text-decoration: none;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.reviewo-review-write-cta:hover,
.reviewo-review-write-cta:focus-visible {
  background: rgba(212, 175, 55, 0.2);
  border-color: #d4af37;
}

.reviewo-review-write-actions {
  align-items: center;
  display: inline-flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
}

.reviewo-review-publish-button,
.reviewo-review-cancel-button {
  border-radius: 999px;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
  font-weight: 700;
  min-height: 32px;
  padding: 0 12px;
}

.reviewo-review-publish-button {
  background: #171717;
  border: 1px solid #171717;
  color: #ffffff;
}

.reviewo-review-cancel-button {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  color: #171717;
}

.reviewo-review-publish-button:hover:not(:disabled),
.reviewo-review-publish-button:focus-visible:not(:disabled) {
  background: #404040;
  border-color: #404040;
}

.reviewo-review-cancel-button:hover:not(:disabled),
.reviewo-review-cancel-button:focus-visible:not(:disabled) {
  background: #fafafa;
  border-color: #d4d4d4;
}

.reviewo-review-publish-button:disabled,
.reviewo-review-cancel-button:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}

.reviewo-review-carousel-button {
  align-items: center;
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  color: #171717;
  cursor: pointer;
  display: inline-flex;
  flex-shrink: 0;
  font: inherit;
  font-size: 14px;
  height: 32px;
  justify-content: center;
  line-height: 1;
  min-width: 32px;
  padding: 0;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.reviewo-review-carousel-button:hover:not(:disabled),
.reviewo-review-carousel-button:focus-visible:not(:disabled) {
  background: #fafafa;
  border-color: #d4d4d8;
}

.reviewo-review-carousel-button:disabled {
  cursor: default;
  opacity: 0.35;
}

.reviewo-review-carousel-counter {
  color: #737373;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
  min-width: 56px;
  text-align: center;
}

.reviewo-review-carousel .reviewo-review-list-viewport {
  max-height: none;
  overflow: visible;
  padding-right: 0;
}

.reviewo-review-carousel .reviewo-review-text,
.reviewo-review-carousel .reviewo-review-card.is-compact .reviewo-review-text {
  height: 96px;
  max-height: 96px;
  min-height: 96px;
  overflow-x: hidden;
  overflow-y: auto;
}

.reviewo-review-list {
  display: block;
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

.reviewo-review-editor-card {
  gap: 6px;
}

.reviewo-review-editor {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-sizing: border-box;
  color: #171717;
  font: inherit;
  font-size: 13px;
  height: 96px;
  line-height: 1.45;
  min-height: 96px;
  padding: 9px 10px;
  resize: none;
  width: 100%;
}

.reviewo-review-editor:focus-visible {
  border-color: #171717;
  outline: 2px solid rgb(23 23 23 / 0.12);
  outline-offset: 1px;
}

.reviewo-review-editor-status {
  color: #737373;
  display: none;
  font-size: 12px;
  line-height: 1.4;
  margin: 0;
}

.reviewo-review-editor-status.is-visible {
  display: block;
}

.reviewo-review-editor-status.is-error {
  color: #b91c1c;
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
  opacity: 1;
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
  margin-top: 12px;
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

.reviewo-settings-tip {
  background: rgba(212, 175, 55, 0.1);
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 12px;
  display: grid;
  gap: 10px;
  margin-top: 12px;
  padding: 10px 12px;
}

.reviewo-settings-tip-copy {
  color: #525252;
  font-size: 12px;
  line-height: 1.45;
  margin: 0;
}

.reviewo-settings-tip-kbd {
  color: #171717;
  font-weight: 700;
}

.reviewo-settings-tip-dismiss {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 999px;
  color: #171717;
  cursor: pointer;
  font-size: 12px;
  font-weight: 700;
  justify-self: start;
  padding: 6px 12px;
}

.reviewo-settings-tip-dismiss:hover,
.reviewo-settings-tip-dismiss:focus-visible {
  background: #fafafa;
  border-color: #d4d4d4;
}

.reviewo-auth-back {
  background: transparent;
  border: 0;
  color: #171717;
  cursor: pointer;
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
  margin: 0 0 6px;
  padding: 0;
}

.reviewo-auth-panel {
  display: grid;
  gap: 12px;
}

.reviewo-auth-lead {
  color: #525252;
  font-size: 14px;
  line-height: 1.45;
  margin: 0;
}

.reviewo-auth-mode-toggle {
  background: #fafafa;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  display: grid;
  gap: 4px;
  grid-template-columns: 1fr 1fr;
  padding: 4px;
}

.reviewo-auth-mode-button {
  background: transparent;
  border: 0;
  border-radius: 8px;
  color: #525252;
  cursor: pointer;
  font-size: 13px;
  font-weight: 700;
  padding: 8px 10px;
}

.reviewo-auth-mode-button.is-active {
  background: #ffffff;
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.08);
  color: #171717;
}

.reviewo-auth-form {
  display: grid;
  gap: 10px;
}

.reviewo-auth-field {
  display: grid;
  gap: 4px;
}

.reviewo-auth-field-label {
  color: #525252;
  font-size: 12px;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
}

.reviewo-auth-field input {
  background: #ffffff;
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  box-sizing: border-box;
  color: #171717;
  font: inherit;
  font-size: 14px;
  padding: 10px 12px;
  width: 100%;
}

.reviewo-auth-field input:focus-visible {
  border-color: #171717;
  outline: 2px solid rgb(23 23 23 / 0.12);
  outline-offset: 1px;
}

.reviewo-auth-display-name-slot {
  display: none;
}

.reviewo-auth-display-name-slot.is-visible {
  display: block;
}

.reviewo-auth-submit {
  background: #171717;
  border: 0;
  border-radius: 12px;
  color: #ffffff;
  cursor: pointer;
  font-size: 14px;
  font-weight: 700;
  margin-top: 2px;
  padding: 11px 16px;
}

.reviewo-auth-submit:hover:not(:disabled),
.reviewo-auth-submit:focus-visible:not(:disabled) {
  background: #404040;
}

.reviewo-auth-submit:disabled {
  cursor: not-allowed;
  opacity: 0.65;
}

.reviewo-auth-status {
  color: #525252;
  font-size: 13px;
  line-height: 1.45;
  margin: 0;
}

.reviewo-auth-status.is-error {
  color: #b91c1c;
}

.reviewo-auth-status.is-success {
  color: #166534;
}

.reviewo-chat-section {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  margin-top: 10px;
}

.reviewo-chat-section.is-expanded {
  background: #fafafa;
  border-radius: 0 0 14px 14px;
  border-top: 1px solid #e5e7eb;
  flex: 0 0 auto;
  margin-top: 8px;
  padding-top: 8px;
}

.reviewo-chat-panel {
  flex: 0 0 auto;
  max-height: 0;
  overflow: hidden;
  transition: max-height 320ms cubic-bezier(0.22, 1, 0.36, 1);
}

.reviewo-chat-panel.is-open {
  height: min(36vh, 280px);
  max-height: min(36vh, 280px);
}

.reviewo-chat-panel.is-loading.is-open {
  height: min(36vh, 280px);
  max-height: min(36vh, 280px);
}

.reviewo-chat-panel-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.reviewo-chat-host {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  width: 100%;
}

.reviewo-chat-footer {
  display: grid;
  flex: 0 0 auto;
  flex-shrink: 0;
  gap: 6px;
  padding-top: 8px;
}

.reviewo-chat-footer[hidden] {
  display: none !important;
}

.reviewo-chat-toggle {
  flex-shrink: 0;
  width: 100%;
  border: 1px solid #e5e7eb;
  border-radius: 12px;
  background: #fafafa;
  color: #171717;
  cursor: pointer;
  font: inherit;
  font-size: 14px;
  font-weight: 600;
  padding: 10px 12px;
  text-align: left;
  transition:
    background-color 180ms ease,
    border-color 180ms ease;
}

.reviewo-chat-section.is-expanded .reviewo-chat-toggle {
  background: #fff;
  border-radius: 10px;
  margin-bottom: 0;
  margin-top: 8px;
}

.reviewo-chat-toggle:hover,
.reviewo-chat-toggle:focus-visible {
  background: #f5f5f5;
}

.reviewo-card-shell.is-chat-expanded .reviewo-card {
  display: flex;
  flex-direction: column;
  max-height: min(98vh, 900px);
  overflow: hidden;
}

.reviewo-card-shell.is-chat-expanded .reviewo-card-scroll {
  display: block;
  flex: 0 0 auto;
  min-height: auto;
  overflow: visible;
}

.reviewo-card-shell.is-chat-expanded .reviewo-rate-section,
.reviewo-card-shell.is-chat-expanded .reviewo-settings-tip {
  display: none !important;
}

.reviewo-card-shell.is-chat-expanded .reviewo-details {
  flex: 0 0 auto;
  margin-bottom: 0;
  margin-top: 8px;
}

.reviewo-card-shell.is-chat-expanded .reviewo-chat-section {
  flex: 0 0 auto;
}

:host([data-placement^="bottom"]).is-chat-expanded .reviewo-card-shell.is-chat-expanded .reviewo-card {
  overflow: hidden;
}

:host([data-placement^="top"]).is-chat-expanded .reviewo-card-shell.is-chat-expanded .reviewo-card {
  overflow: hidden;
}

.reviewo-chat-drawer {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  height: 100%;
  margin-top: 0;
  min-height: 0;
  min-width: 0;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: 0;
  background: transparent;
  overflow: hidden;
}

.reviewo-chat-drawer-header {
  flex-shrink: 0;
  min-width: 0;
}

.reviewo-chat-drawer-header-main {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.reviewo-chat-drawer-header-top {
  align-items: stretch;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  min-width: 0;
  width: 100%;
}

.reviewo-chat-drawer-header-top-center {
  align-items: stretch;
  display: flex;
  flex: 1 1 auto;
  min-width: 0;
}

.reviewo-chat-title {
  align-items: center;
  display: flex;
  flex: 0 0 auto;
  font-size: 14px;
  font-weight: 700;
  margin: 0;
  min-width: 0;
}

.reviewo-chat-drawer-header-top .entity-chat-locale-switch {
  align-items: center;
  display: inline-flex;
  flex: 0 0 auto;
  flex-shrink: 0;
}

.reviewo-chat-load-older {
  align-items: center;
  appearance: none;
  background: #ffffff;
  border: 1px solid #d4d4d4;
  border-radius: 999px;
  box-sizing: border-box;
  color: #525252;
  cursor: pointer;
  display: flex;
  flex: 1 1 auto;
  font: inherit;
  font-size: 11px;
  font-weight: 600;
  justify-content: center;
  line-height: 1.2;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
  padding: 5px 8px;
  text-align: center;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
}

.reviewo-chat-load-older:disabled {
  cursor: default;
  opacity: 0.45;
}

.entity-chat-locale-switch {
  display: inline-flex;
  flex-shrink: 0;
  gap: 3px;
}

.entity-chat-locale-button {
  appearance: none;
  background: #ffffff;
  border: 1px solid #a3a3a3;
  border-radius: 999px;
  color: #171717;
  cursor: pointer;
  font: inherit;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.04em;
  line-height: 1;
  min-width: 28px;
  padding: 4px 7px;
  width: auto;
}

.entity-chat-locale-button.is-active {
  background: #171717;
  border-color: #171717;
  box-shadow: none;
  color: #ffffff;
}

.reviewo-chat-drawer-body {
  display: flex;
  flex: 1 1 0;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  overflow: hidden;
}

.reviewo-chat-message-list {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 8px;
  list-style: none;
  margin: 0;
  min-height: 0;
  overflow-x: hidden;
  overflow-y: auto;
  padding: 0;
}

.reviewo-chat-message {
  font-size: 13px;
  line-height: 1.45;
  min-width: 0;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.reviewo-chat-message span {
  overflow-wrap: anywhere;
  word-break: break-word;
}

.reviewo-chat-message strong {
  margin-right: 4px;
}

.reviewo-chat-composer {
  display: grid;
  flex-shrink: 0;
  gap: 8px;
  grid-template-columns: minmax(0, 1fr) auto;
  min-width: 0;
  width: 100%;
}

.reviewo-chat-send-status,
.reviewo-chat-sign-in-hint {
  flex-shrink: 0;
  margin: 0;
}

.reviewo-chat-composer input {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  font: inherit;
  font-size: 13px;
  min-width: 0;
  padding: 8px 10px;
}

.reviewo-chat-send {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  background: #171717;
  color: #ffffff;
  cursor: pointer;
  font: inherit;
  font-size: 13px;
  font-weight: 600;
  padding: 8px 12px;
}

.reviewo-chat-send:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}

.reviewo-chat-error {
  color: #b91c1c;
  font-size: 13px;
  margin: 0;
}
`;
