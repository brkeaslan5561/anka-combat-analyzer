import { useEffect } from "react";

interface AutomaticUpdateResult {
  success: boolean;
  message: string;
}

declare global {
  interface Window {
    ankaUpdater: {
      installLatest(): Promise<AutomaticUpdateResult>;
    };
  }
}

/**
 * The original titlebar updater downloads Setup.exe to the user's Downloads
 * directory. Keep its release-status discovery UI, but intercept clicks only
 * when an update is available and route them through the background updater.
 */
export function AutomaticUpdateEnhancement() {
  useEffect(() => {
    let updating = false;

    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      const button = target?.closest<HTMLButtonElement>(
        ".update-status-button.available",
      );
      if (!button || updating) return;

      // Capture before React's existing click handler so the legacy updater does
      // not also download a visible Setup.exe into Downloads.
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      updating = true;
      button.disabled = true;
      button.classList.add("automatic-updating");
      setButtonLabel(button, isTurkish() ? "Güncelleniyor…" : "Updating…");
      button.title = isTurkish()
        ? "Güncelleme arka planda uygulanıyor."
        : "The update is being applied in the background.";

      void window.ankaUpdater.installLatest().then((result) => {
        if (result.success) return;
        updating = false;
        button.disabled = false;
        button.classList.remove("automatic-updating");
        setButtonLabel(button, isTurkish() ? "Güncel değil" : "Not up to date");
        window.alert(result.message);
      });
    };

    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}

function setButtonLabel(button: HTMLButtonElement, value: string): void {
  const spans = button.querySelectorAll<HTMLSpanElement>("span");
  const label = spans.item(1);
  if (label) label.textContent = value;
}

function isTurkish(): boolean {
  return document.documentElement.lang.toLocaleLowerCase("en-US").startsWith("tr");
}
