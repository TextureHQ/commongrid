"use client";

import { useEffect, useState } from "react";

export default function APIPage() {
  const [iframeSrc, setIframeSrc] = useState<string | null>(null);

  useEffect(() => {
    // Forward parent hash to iframe so deep links resolve correctly
    setIframeSrc(`/api-reference.html${window.location.hash}`);

    // Sync iframe hash changes back to parent URL bar
    const handleMessage = (event: MessageEvent) => {
      if (
        event.origin === window.location.origin &&
        event.data?.type === "api-hash-update" &&
        typeof event.data.hash === "string"
      ) {
        window.history.replaceState(null, "", `/api${event.data.hash}`);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  if (!iframeSrc) return null;

  return (
    <iframe
      src={iframeSrc}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100%",
        height: "100dvh",
        border: "none",
        display: "block",
        zIndex: 10,
      }}
      title="CommonGrid API Reference"
    />
  );
}
