import { useEffect, useState } from "react";
import { translateUiText } from "../shared/i18n";
import type { AppLanguage } from "../shared/types";

const TRANSLATED_ATTRIBUTES = ["title", "aria-label", "placeholder"] as const;

export function LanguageEnhancement() {
  const [language, setLanguage] = useState<AppLanguage>("en");

  useEffect(() => {
    let mounted = true;
    void window.analyzer.getDisplayPreferences().then((preferences) => {
      if (mounted) setLanguage(preferences.language);
    });
    const unsubscribe = window.analyzer.onDisplayPreferencesChanged((preferences) => {
      if (mounted) setLanguage(preferences.language);
    });
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    document.documentElement.lang = language === "tr" ? "tr" : "en";

    let translating = false;
    let scheduled = false;
    const translateDocument = () => {
      scheduled = false;
      if (translating) return;
      translating = true;
      try {
        translateElement(document.body, language);
      } finally {
        translating = false;
      }
    };
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(translateDocument);
    };

    const observer = new MutationObserver(schedule);
    translateDocument();
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: [...TRANSLATED_ATTRIBUTES],
    });

    const nativeConfirm = window.confirm.bind(window);
    const nativeAlert = window.alert.bind(window);
    window.confirm = (message?: string) =>
      nativeConfirm(translateUiText(String(message ?? ""), language));
    window.alert = (message?: unknown) =>
      nativeAlert(translateUiText(String(message ?? ""), language));

    return () => {
      observer.disconnect();
      window.confirm = nativeConfirm;
      window.alert = nativeAlert;
    };
  }, [language]);

  return null;
}

function translateElement(root: Element, language: AppLanguage): void {
  translateAttributes(root, language);
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT,
  );
  let node = walker.nextNode();
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) {
      const parent = node.parentElement;
      if (parent && !isExcludedElement(parent)) {
        const current = node.nodeValue ?? "";
        const translated = translateUiText(current, language);
        if (translated !== current) node.nodeValue = translated;
      }
    } else if (node instanceof Element) {
      translateAttributes(node, language);
    }
    node = walker.nextNode();
  }
}

function translateAttributes(element: Element, language: AppLanguage): void {
  if (isExcludedElement(element)) return;
  for (const attribute of TRANSLATED_ATTRIBUTES) {
    const current = element.getAttribute(attribute);
    if (!current) continue;
    const translated = translateUiText(current, language);
    if (translated !== current) element.setAttribute(attribute, translated);
  }
}

function isExcludedElement(element: Element): boolean {
  return ["SCRIPT", "STYLE", "NOSCRIPT", "TEXTAREA"].includes(element.tagName);
}
