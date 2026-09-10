import { useTranslation } from "@/lib/i18n-hook";
import type { BrowserType } from "@/hooks/use-browser-info";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Link2, Shield } from "lucide-react";

const BROWSER_META: Record<BrowserType, { name: string; installUrl: string; storeLabel: string }> = {
  chrome: {
    name: "Google Chrome",
    installUrl: "https://chromewebstore.google.com/detail/ublock-origin-lite/ddkjiahejlhfcafbddmgiahcphecmpfh",
    storeLabel: "Chrome Web Store",
  },
  edge: {
    name: "Microsoft Edge",
    installUrl: "https://microsoftedge.microsoft.com/addons/detail/ublock-origin-lite/cimighlppcgcoapaliogpjjdehbnofhn",
    storeLabel: "Edge Add-ons",
  },
  opera: {
    name: "Opera",
    installUrl: "https://addons.opera.com/en/extensions/details/ublock/",
    storeLabel: "Opera Add-ons",
  },
  firefox: {
    name: "Mozilla Firefox",
    installUrl: "https://addons.mozilla.org/firefox/addon/ublock-origin/",
    storeLabel: "Firefox Add-ons",
  },
  safari: {
    name: "Safari",
    installUrl: "https://apps.apple.com/app/ublock-origin/id1482872396",
    storeLabel: "Mac App Store",
  },
  other: {
    name: "your browser",
    installUrl: "https://github.com/gorhill/uBlock",
    storeLabel: "uBlock Origin releases",
  },
};

export function useAdBlockPrompt(info: { browser: BrowserType; adblockActive: boolean }) {
  return { info, shouldShow: !info.adblockActive };
}

export function AdBlockPrompt({ browser }: { browser: BrowserType }) {
  const meta = BROWSER_META[browser];
  const { t } = useTranslation();

  return (
    <Alert className="relative" variant="destructive" role="alert">
      <div className="flex items-start gap-3">
        <Shield className="size-4 mt-0.5 shrink-0 text-destructive" />
        <div className="flex-1 min-w-0 text-left">
          <AlertTitle className="flex items-center gap-2">
            <Link2 className="size-3.5 shrink-0" />
            {t("adblock_title")}
          </AlertTitle>
          <AlertDescription className="mt-1">
            {t("adblock_message")}{" "}
            <a
              href={meta.installUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2 hover:no-underline"
            >
              {t("adblock_install")}
            </a>
          </AlertDescription>
        </div>
      </div>
    </Alert>
  );
}
