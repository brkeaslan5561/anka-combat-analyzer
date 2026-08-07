import React from "react";
import ReactDOM from "react-dom/client";
import { App } from "./App";
import { DesktopEnhancements } from "./DesktopEnhancements";
import { EncounterDeletionEnhancement } from "./EncounterDeletionEnhancement";
import { Overlay } from "./Overlay";
import "./styles.css";
import "./enhancements.css";
import "./encounterDeletion.css";

const isOverlay = new URLSearchParams(window.location.search).get("overlay") === "1";
if (isOverlay) document.documentElement.classList.add("overlay-document");

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    {isOverlay ? (
      <Overlay />
    ) : (
      <>
        <App />
        <DesktopEnhancements />
        <EncounterDeletionEnhancement />
      </>
    )}
  </React.StrictMode>,
);
