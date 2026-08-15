import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import {
  OVERLAY_SCALE_OPTIONS,
  UI_FONT_OPTIONS,
  UI_RESOLUTION_OPTIONS,
} from "../shared/displaySettings";
import type {
  AppLanguage,
  DisplayPreferences,
  UiFontSize,
  UiResolutionPreset,
} from "../shared/types";

export function DisplaySettingsEnhancement() {
  const [host, setHost] = useState<Element | null>(null);
  const [open, setOpen] = useState(false);
  const [preferences, setPreferences] = useState<DisplayPreferences | null>(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    const resolveHost = () => setHost(document.querySelector(".header-actions"));
    resolveHost();
    const observer = new MutationObserver(resolveHost);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    let mounted = true;
    void window.analyzer.getDisplayPreferences().then((value) => {
      if (mounted) setPreferences(value);
    });
    const unsubscribe = window.analyzer.onDisplayPreferencesChanged((value) => {
      if (mounted) setPreferences(value);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  const update = async (
    patch: Partial<DisplayPreferences>,
    successMessage: string,
  ) => {
    const value = await window.analyzer.updateDisplaySettings(patch);
    setPreferences(value);
    setMessage(successMessage);
  };

  const moveOverlay = async () => {
    const started = await window.analyzer.beginOverlayMove();
    if (!started) {
      setMessage("Turn Overlay On first, then choose Move Overlay.");
      return;
    }
    setMessage("");
    setOpen(false);
  };

  const resetOverlay = async () => {
    const value = await window.analyzer.resetOverlayPosition();
    setPreferences(value);
    setMessage("Overlay position reset.");
  };

  if (!host || !preferences) return null;

  return (
    <>
      {createPortal(
        <button
          className={`header-button display-settings-button ${open ? "active" : ""}`}
          onClick={() => {
            setOpen((current) => !current);
            setMessage("");
          }}
          title="Display and overlay settings"
        >
          Display
        </button>,
        host,
      )}

      {open && (
        <div className="display-settings-popover" role="dialog" aria-label="Display settings">
          <div className="display-settings-heading">
            <div>
              <strong>Display & Overlay</strong>
              <small>Saved automatically</small>
            </div>
            <button
              className="display-settings-close"
              onClick={() => setOpen(false)}
              aria-label="Close display settings"
            >
              ×
            </button>
          </div>

          <label className="display-settings-field">
            <span>Language</span>
            <select
              value={preferences.language}
              onChange={(event) =>
                void update(
                  { language: event.target.value as AppLanguage },
                  "Language updated.",
                )
              }
            >
              <option value="en">English</option>
              <option value="tr">Türkçe</option>
            </select>
          </label>

          <label className="display-settings-field">
            <span>Resolution / UI size</span>
            <select
              value={preferences.uiResolutionPreset}
              onChange={(event) =>
                void update(
                  { uiResolutionPreset: event.target.value as UiResolutionPreset },
                  "UI scale updated.",
                )
              }
            >
              {UI_RESOLUTION_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="display-settings-field">
            <span>Text size</span>
            <select
              value={preferences.uiFontSize}
              onChange={(event) =>
                void update(
                  { uiFontSize: event.target.value as UiFontSize },
                  "Text size updated.",
                )
              }
            >
              {UI_FONT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="display-settings-field">
            <span>Overlay size</span>
            <select
              value={String(preferences.overlayScale)}
              onChange={(event) =>
                void update(
                  { overlayScale: Number(event.target.value) },
                  "Overlay size updated.",
                )
              }
            >
              {OVERLAY_SCALE_OPTIONS.map((scale) => (
                <option key={scale} value={scale}>
                  {Math.round(scale * 100)}%
                </option>
              ))}
            </select>
          </label>

          <div className="display-settings-overlay-actions">
            <button className="header-button primary" onClick={moveOverlay}>
              Move Overlay
            </button>
            <button className="header-button" onClick={resetOverlay}>
              Reset Position
            </button>
          </div>

          <p className="display-settings-help">
            Move Overlay makes the timer overlay clickable temporarily. Drag it to the
            desired position, then press <b>Done</b> on the overlay.
          </p>
          {message && <div className="display-settings-message">{message}</div>}
        </div>
      )}
    </>
  );
}
