"use client";

import { useEffect } from "react";

export function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator) || process.env.NODE_ENV !== "production") {
      return;
    }

    const register = () => {
      void navigator.serviceWorker.register("/sw.js").catch(() => {
        // Offline support is progressive enhancement; registration failure must
        // never block sign-in or gameplay.
      });
    };

    window.addEventListener("load", register);
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
