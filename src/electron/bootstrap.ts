import { app } from "electron";
import { hasSingleInstanceLock } from "./appLifecycleController";
import "./displayOverlayController";
import "./windowVisibilityHotfix";

// GitHub release asset downloads can occasionally be refused by Chromium's
// HTTP/2 connection (net::ERR_HTTP2_SERVER_REFUSED_STREAM). Force Electron's
// network stack to use HTTP/1.1 before the main process registers any update
// requests. QUIC is disabled for the same reason: keep updater traffic on the
// most compatible HTTPS transport available on Windows.
app.commandLine.appendSwitch("disable-http2");
app.commandLine.appendSwitch("disable-quic");

if (hasSingleInstanceLock) {
  void import("./main");
}
