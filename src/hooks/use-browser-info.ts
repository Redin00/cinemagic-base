import { useEffect, useState } from "react";

export type BrowserType = "chrome" | "firefox" | "edge" | "safari" | "opera" | "other";

export interface BrowserInfo {
  browser: BrowserType;
  adblockActive: boolean;
}

/** Detect the current browser from the user agent string. */
export function detectBrowser(): BrowserType {
  const ua = navigator.userAgent;
  if (/OPR|Opera/i.test(ua)) return "opera";
  if (/Edg/i.test(ua)) return "edge";
  if (/Firefox/i.test(ua)) return "firefox";
  if (/Chrome/i.test(ua) && !/Edg/i.test(ua)) return "chrome";
  if (/Safari/i.test(ua)) return "safari";
  return "other";
}

/** Detect whether an ad blocker (e.g. uBlock Origin) is likely active. */
export function detectAdblock(): boolean {
  try {
    const el = document.createElement("div");
    el.className = "adsbox ads-ad ads-ad-box ads-advertisement";
    el.id = "ublock-detection-test-" + Math.random().toString(36).slice(2, 8);
    el.style.cssText =
      "position:absolute;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;visibility:hidden;";
    el.innerHTML = "&nbsp;";
    document.body.appendChild(el);
    const display = getComputedStyle(el).display;
    document.body.removeChild(el);
    return display === "none";
  } catch {
    return false;
  }
}

/** React hook — browser detection runs client-side only to avoid SSR issues. */
export function useBrowserInfo(): BrowserInfo {
  const [browser, setBrowser] = useState<BrowserType>("other");
  const [adblockActive, setAdblockActive] = useState(false);

  useEffect(() => {
    setBrowser(detectBrowser());
    setAdblockActive(detectAdblock());
  }, []);

  return { browser, adblockActive };
}
