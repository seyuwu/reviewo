interface FormFeedbackProps {
  errorMessage?: string | null;
  statusMessage?: string | null;
}

export function FormFeedback({ errorMessage, statusMessage }: FormFeedbackProps) {
  const isVisible = Boolean(errorMessage || statusMessage);

  return (
    <div
      className={`form-feedback-slot form-feedback-area${isVisible ? " is-visible" : ""}`}
      aria-live="polite"
    >
      <div className="form-feedback-slot__inner">
        {statusMessage ? <p className="success-message">{statusMessage}</p> : null}
        {errorMessage ? <p className="error-message">{errorMessage}</p> : null}
      </div>
    </div>
  );
}
