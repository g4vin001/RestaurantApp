"use client";

import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

type FeedbackKind = "navigation" | "action";

const SHOW_DELAY_MS = 160;
const SAFETY_TIMEOUT_MS = 15_000;

function isPlainLeftClick(event: MouseEvent) {
  return (
    event.button === 0 &&
    !event.altKey &&
    !event.ctrlKey &&
    !event.metaKey &&
    !event.shiftKey
  );
}

function isInternalNavigation(anchor: HTMLAnchorElement) {
  if (
    anchor.target === "_blank" ||
    anchor.hasAttribute("download") ||
    anchor.getAttribute("rel")?.split(/\s+/).includes("external")
  ) {
    return false;
  }

  const rawHref = anchor.getAttribute("href");
  if (!rawHref || rawHref.startsWith("#")) return false;

  const destination = new URL(anchor.href, window.location.href);
  if (destination.origin !== window.location.origin) return false;

  const current = new URL(window.location.href);
  return (
    destination.pathname !== current.pathname ||
    destination.search !== current.search
  );
}

export function InteractionFeedback() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchKey = searchParams.toString();
  const [kind, setKind] = useState<FeedbackKind | null>(null);
  const [visible, setVisible] = useState(false);
  const activeFormRef = useRef<HTMLFormElement | null>(null);
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const safetyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const responseObserverRef = useRef<MutationObserver | null>(null);
  const observerFrameRef = useRef<number | null>(null);

  const clearFeedback = useCallback(() => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (safetyTimerRef.current) clearTimeout(safetyTimerRef.current);
    if (observerFrameRef.current) cancelAnimationFrame(observerFrameRef.current);
    responseObserverRef.current?.disconnect();
    showTimerRef.current = null;
    safetyTimerRef.current = null;
    observerFrameRef.current = null;
    responseObserverRef.current = null;

    if (activeFormRef.current) {
      activeFormRef.current.removeAttribute("aria-busy");
      delete activeFormRef.current.dataset.halinaPending;
      activeFormRef.current = null;
    }

    setKind(null);
    setVisible(false);
  }, []);

  const startFeedback = useCallback(
    (nextKind: FeedbackKind, form?: HTMLFormElement) => {
      clearFeedback();
      setKind(nextKind);

      if (form) {
        activeFormRef.current = form;
        form.setAttribute("aria-busy", "true");
        form.dataset.halinaPending = "true";

        observerFrameRef.current = requestAnimationFrame(() => {
          const observer = new MutationObserver((records) => {
            const hasPageResponse = records.some((record) => {
              const target =
                record.target instanceof Element
                  ? record.target
                  : record.target.parentElement;
              return !target?.closest("[data-halina-feedback-root]");
            });
            if (hasPageResponse) clearFeedback();
          });
          observer.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true,
          });
          responseObserverRef.current = observer;
          observerFrameRef.current = null;
        });
      }

      showTimerRef.current = setTimeout(() => {
        setVisible(true);
        showTimerRef.current = null;
      }, SHOW_DELAY_MS);
      safetyTimerRef.current = setTimeout(clearFeedback, SAFETY_TIMEOUT_MS);
    },
    [clearFeedback],
  );

  useEffect(() => {
    clearFeedback();
  }, [pathname, searchKey, clearFeedback]);

  useEffect(() => {
    const handleClick = (event: MouseEvent) => {
      if (!isPlainLeftClick(event)) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest<HTMLAnchorElement>("a[href]");
      if (anchor && isInternalNavigation(anchor)) {
        startFeedback("navigation");
      }
    };

    const handleSubmit = (event: SubmitEvent) => {
      const form = event.target;
      if (!(form instanceof HTMLFormElement)) return;
      if (form.method.toLowerCase() === "dialog" || form.target === "_blank") {
        return;
      }
      startFeedback("action", form);
    };

    const handleHistoryNavigation = () => startFeedback("navigation");

    document.addEventListener("click", handleClick, true);
    document.addEventListener("submit", handleSubmit);
    window.addEventListener("popstate", handleHistoryNavigation);
    window.addEventListener("pageshow", clearFeedback);

    return () => {
      document.removeEventListener("click", handleClick, true);
      document.removeEventListener("submit", handleSubmit);
      window.removeEventListener("popstate", handleHistoryNavigation);
      window.removeEventListener("pageshow", clearFeedback);
      clearFeedback();
    };
  }, [clearFeedback, startFeedback]);

  return (
    <div
      data-halina-feedback-root
      data-visible={visible ? "true" : "false"}
      className="halina-interaction-feedback"
      role="status"
      aria-live="polite"
      aria-atomic="true"
    >
      <span className="sr-only">
        {kind === "action" ? "Saving changes" : "Loading page"}
      </span>
      <div className="halina-loading-bar" aria-hidden="true" />
      <div className="halina-loading-label" aria-hidden="true">
        <span className="halina-spinner" />
        {kind === "action" ? "Saving…" : "Loading…"}
      </div>
    </div>
  );
}
