import { useEffect, useState } from "react";

/**
 * Chrome/Edge/Android fire `beforeinstallprompt` instead of showing their own
 * mini-infobar IF the page calls preventDefault() on it — that's what lets us
 * show our own "Установить приложение" button instead and trigger the same
 * native install dialog later, on demand, via the captured event's prompt().
 * Not part of any standard lib.dom.d.ts, so declared locally.
 */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // display-mode: standalone covers Chrome/Edge/Android once installed;
  // navigator.standalone is Safari's own (non-standard) equivalent for when
  // the app was added to the iOS home screen.
  const nav = window.navigator as Navigator & { standalone?: boolean };
  return Boolean(window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone);
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  // iOS Safari never fires beforeinstallprompt and has no programmatic
  // install API at all — "Поделиться → На экран «Домой»" is the only path,
  // so that's all we can do here besides explaining it.
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * Explicit install control for Settings — intercepts the browser's own
 * install prompt (see BeforeInstallPromptEvent above) so we can show our own
 * button instead of relying on whatever mini-infobar/menu item the browser
 * would otherwise surface on its own schedule. Renders nothing once the app
 * is already installed, and a short static instruction instead of a button
 * on iOS, where no programmatic install is possible.
 */
export function InstallAppButton() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());

    function onBeforeInstallPrompt(e: Event) {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    }
    function onAppInstalled() {
      setInstalled(true);
      setDeferredPrompt(null);
    }

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onAppInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onAppInstalled);
    };
  }, []);

  async function handleInstall() {
    if (!deferredPrompt) return;
    setBusy(true);
    try {
      await deferredPrompt.prompt();
      await deferredPrompt.userChoice;
    } finally {
      // The captured event can only be prompted once, whether the user
      // accepted or dismissed it — clear it either way so a stale prompt()
      // call can't silently no-op later.
      setDeferredPrompt(null);
      setBusy(false);
    }
  }

  if (installed) {
    return <p className="text-xs text-muted-foreground">Приложение уже установлено ✓</p>;
  }

  if (isIOS()) {
    return (
      <p className="text-xs text-muted-foreground">
        На iPhone/iPad установить можно только вручную: нажми «Поделиться» внизу Safari → «На экран
        «Домой»».
      </p>
    );
  }

  if (!deferredPrompt) {
    return (
      <p className="text-xs text-muted-foreground">
        Этот браузер пока не предложил установку — открой сайт в Chrome/Edge на Android или
        десктопе, либо просто попользуйся приложением ещё немного.
      </p>
    );
  }

  return (
    <button
      type="button"
      onClick={handleInstall}
      disabled={busy}
      className="btn-accent-hover rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-all hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
    >
      {busy ? "Открываем диалог…" : "Установить приложение"}
    </button>
  );
}
