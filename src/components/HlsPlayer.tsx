import { useEffect, useRef } from "react";

// Type-only, so hls.js stays out of the server bundle and out of the entry chunk.
import type Hls from "hls.js";

interface HlsPlayerProps {
  src: string;
  title: string;
  /** Called when playback cannot recover, so the caller can fall back to the embed. */
  onFatal?: () => void;
  /** Called periodically while the video plays, with the current playback position in seconds. */
  onTimeUpdate?: (seconds: number) => void;
  /** Seconds to seek to once the media is ready and playing. Pass `undefined` to skip. */
  initialSeconds?: number | undefined;
}

export function HlsPlayer({
  src,
  title,
  onFatal,
  onTimeUpdate,
  initialSeconds,
}: HlsPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onFatalRef = useRef(onFatal);
  const onTimeUpdateRef = useRef(onTimeUpdate);
  const initialSecondsRef = useRef(initialSeconds);

  useEffect(() => {
    onFatalRef.current = onFatal;
  }, [onFatal]);

  useEffect(() => {
    onTimeUpdateRef.current = onTimeUpdate;
  }, [onTimeUpdate]);

  useEffect(() => {
    initialSecondsRef.current = initialSeconds;
  }, [initialSeconds]);

  // When initialSeconds changes after mount (e.g. the marker arrives async
  // after canplay has already fired), re-apply the seek once the media is
  // ready for it. This is the only seek path — the old check for video.src
  // was dead for HLS because hls.js never sets video.src.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let removed = false;
    const applySeek = () => {
      const target = initialSecondsRef.current;
      if (target !== undefined && target > 0 && video.duration > 0) {
        video.currentTime = target;
      }
    };

    if (initialSecondsRef.current !== undefined && initialSecondsRef.current > 0) {
      if (video.readyState >= 3) {
        applySeek();
        return;
      }
      const onCanPlay = () => {
        if (removed) return;
        removed = true;
        applySeek();
        video.removeEventListener("canplay", onCanPlay);
      };
      video.addEventListener("canplay", onCanPlay);
      return () => {
        removed = true;
        video.removeEventListener("canplay", onCanPlay);
      };
    }
    return;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialSeconds]);

  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    let hls: Hls | null = null;
    let cancelled = false;
    let nativeError: (() => void) | null = null;
    let timeHandler: ((event: Event) => void) | null = null;

    const applyInitialSeek = () => {
      const target = initialSecondsRef.current;
      if (target !== undefined && target > 0 && video.duration > 0) {
        video.currentTime = target;
      }
    };

    const playNatively = () => {
      nativeError = () => onFatalRef.current?.();
      video.addEventListener("error", nativeError);
      video.src = src;
      video.addEventListener(
        "canplay",
        () => {
          if (!cancelled) applyInitialSeek();
        },
        { once: true },
      );
    };

    void (async () => {
      const { default: HlsClient } = await import("hls.js");
      if (cancelled) return;

      if (!HlsClient.isSupported()) {
        playNatively();
        return;
      }

      hls = new HlsClient({ enableWorker: true });
      hls.on(HlsClient.Events.ERROR, (_event, data) => {
        if (!data.fatal || !hls) return;
        if (data.type === HlsClient.ErrorTypes.MEDIA_ERROR) hls.recoverMediaError();
        else onFatalRef.current?.();
      });
      hls.loadSource(src);
      hls.attachMedia(video);

      video.addEventListener(
        "canplay",
        () => {
          if (!cancelled) applyInitialSeek();
        },
        { once: true },
      );
    })();

    timeHandler = () => {
      const handler = onTimeUpdateRef.current;
      if (handler) handler(video.currentTime);
    };
    video.addEventListener("timeupdate", timeHandler);

    return () => {
      cancelled = true;
      hls?.destroy();
      if (nativeError) {
        video.removeEventListener("error", nativeError);
        video.removeAttribute("src");
        video.load();
      }
      if (timeHandler) video.removeEventListener("timeupdate", timeHandler);
    };
  }, [src]);

  return <video ref={videoRef} controls playsInline className="size-full" title={title} />;
}
