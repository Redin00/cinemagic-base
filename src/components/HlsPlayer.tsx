import { useEffect, useRef } from "react";

// Type-only, so hls.js stays out of the server bundle and out of the entry chunk.
import type Hls from "hls.js";

interface HlsPlayerProps {
  src: string;
  title: string;
  /** Called when playback cannot recover, so the caller can fall back to the embed. */
  onFatal?: () => void;
}

export function HlsPlayer({ src, title, onFatal }: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFatalRef = useRef(onFatal);

  useEffect(() => {
    onFatalRef.current = onFatal;
  }, [onFatal]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let cancelled = false;
    let nativeError: (() => void) | null = null;

    const playNatively = () => {
      nativeError = () => onFatalRef.current?.();
      video.addEventListener("error", nativeError);
      video.src = src;
    };

    void (async () => {
      const { default: HlsClient } = await import("hls.js");
      if (cancelled) return;

      // Safari and iOS have no MSE and only play HLS natively. Everywhere else
      // prefer hls.js: canPlayType() answers "maybe" for HLS in Chromium builds
      // that cannot actually play it.
      if (!HlsClient.isSupported()) {
        playNatively();
        return;
      }

      hls = new HlsClient({ enableWorker: true });
      hls.on(HlsClient.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        if (data.type === HlsClient.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        // Network and mux errors are what a revoked CORS policy or DRM looks like.
        else onFatalRef.current?.();
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    })();

    return () => {
      cancelled = true;
      hls?.destroy();
      if (nativeError) {
        video.removeEventListener("error", nativeError);
        video.removeAttribute("src");
        video.load();
      }
    };
  }, [src]);

  return <video ref={videoRef} controls playsInline className="size-full" title={title} />;
}
