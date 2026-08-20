import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { DesktopEnhancements } from "./DesktopEnhancements";
import { DisplaySettingsEnhancement } from "./DisplaySettingsEnhancement";
import { LanguageEnhancement } from "./LanguageEnhancement";
import { Overlay } from "./Overlay";
import "./styles.css";
import "./enhancements.css";
import "./displaySettings.css";

const isOverlay = new URLSearchParams(window.location.search).get("overlay") === "1";
if (isOverlay) document.documentElement.classList.add("overlay-document");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageEnhancement />
    {isOverlay ? (
      <Overlay />
    ) : (
      <>
        <App />
        <DesktopEnhancements />
        <DisplaySettingsEnhancement />
      </>
    )}
  </React.StrictMode>,
);
