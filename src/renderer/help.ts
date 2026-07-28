/** Keyboard & interaction reference, opened with "?" or from Settings. */

const SHORTCUTS: Array<{ keys: string; what: string }> = [
  { keys: "<kbd>1</kbd>–<kbd>4</kbd> / <kbd>A</kbd>–<kbd>D</kbd>", what: "Answer a question" },
  { keys: "<kbd>Enter</kbd>", what: "Continue / confirm" },
  { keys: "<kbd>Esc</kbd>", what: "Close a panel / go back" },
  { keys: "<kbd>Tab</kbd>", what: "Move between controls (focus is trapped in dialogs)" },
  { keys: "<kbd>Enter</kbd> / <kbd>Space</kbd>", what: "Open the focused temple stone" },
  { keys: "Click a glowing stone", what: "Begin that module" },
  { keys: "Click a marble stone", what: "Practice a mastered module (no stakes)" },
  { keys: "Click the book", what: "Open the Codex of Jargon" },
  { keys: "<kbd>?</kbd>", what: "Show this reference" },
];

function helpRoot(): HTMLElement {
  return document.getElementById("help-root")!;
}

export function isHelpOpen(): boolean {
  return !helpRoot().hasAttribute("hidden");
}

export function closeHelp(): void {
  const r = helpRoot();
  r.hidden = true;
  r.replaceChildren();
}

export function openHelp(): void {
  const card = document.createElement("div");
  card.className = "modal-card help-card";
  card.innerHTML = `
    <div class="settings-head">
      <h2>Keys &amp; Controls</h2>
      <button class="codex-close" data-action="close" aria-label="Close help">
        <span class="return-glyph" aria-hidden="true">&#8617;</span> Return
      </button>
    </div>
    <div class="help-rows">
      ${SHORTCUTS.map(
        (s) =>
          `<div class="help-row"><span class="help-keys">${s.keys}</span>` +
          `<span class="help-what">${s.what}</span></div>`
      ).join("")}
    </div>
  `;
  card.querySelector('[data-action="close"]')!.addEventListener("click", closeHelp);
  helpRoot().replaceChildren(card);
  helpRoot().hidden = false;
  card.querySelector<HTMLButtonElement>('[data-action="close"]')?.focus();
}
