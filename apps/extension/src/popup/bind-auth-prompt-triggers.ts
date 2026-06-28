export function bindAuthPromptTriggers(
  container: ParentNode,
  onRequestSignIn: () => void
): void {
  container.querySelectorAll<HTMLElement>("[data-open-auth-prompt]").forEach((trigger) => {
    trigger.addEventListener("click", () => {
      onRequestSignIn();
    });
  });
}
