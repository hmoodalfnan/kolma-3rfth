'use client';

import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { biometricAvailable, registerPasskey, listPasskeys } from '@/lib/webauthn/client';

const VISIBLE_MS = 7000;

function isStandalone() {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia?.('(display-mode: standalone)').matches ||
    window.navigator.standalone === true
  );
}

function isIOS() {
  if (typeof navigator === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(navigator.userAgent);
}

/**
 * A brief nudge at the top of the student area, shown for a few seconds on each
 * app open: enrol a fingerprint/Face login (inline) and install the app. Each
 * tip hides itself once it no longer applies — a device that already has a
 * passkey, or an app already running installed — and the banner does not appear
 * at all when nothing is left to suggest. Interacting cancels the auto-hide.
 */
export function OnboardingBanner() {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(true);
  const [hasBio, setHasBio] = useState(true);
  const [bioSupported, setBioSupported] = useState(false);
  const [deferred, setDeferred] = useState(null);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioDone, setBioDone] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [barW, setBarW] = useState('100%');
  const [paused, setPaused] = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    const standalone = isStandalone();
    setInstalled(standalone);

    Promise.all([
      biometricAvailable(),
      listPasskeys()
        .then((k) => k.length > 0)
        .catch(() => false),
    ]).then(([supported, has]) => {
      setBioSupported(supported);
      setHasBio(has);
      const needBio = supported && !has;
      const needInstall = !standalone;
      if (needBio || needInstall) {
        setShow(true);
        timer.current = setTimeout(() => setShow(false), VISIBLE_MS);
      }
    });

    return () => clearTimeout(timer.current);
  }, []);

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setInstalled(true);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  // Drain the countdown bar from full to empty over the visible window; a frame's
  // delay lets the transition run instead of snapping straight to empty.
  useEffect(() => {
    if (!show) return undefined;
    const id = requestAnimationFrame(() => setBarW('0%'));
    return () => cancelAnimationFrame(id);
  }, [show]);

  // Once the user is interacting, stop the auto-hide (and its bar) so it doesn't
  // vanish on them.
  function keepOpen() {
    clearTimeout(timer.current);
    setPaused(true);
  }

  async function enableBiometric() {
    keepOpen();
    setBioBusy(true);
    try {
      await registerPasskey('جهازي');
      setBioDone(true);
      toast.push('تم تفعيل الدخول بالبصمة', 'success');
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return; // cancelled
      if (/مسجَّل بالفعل|already/i.test(err?.message || '')) {
        setBioDone(true);
        toast.push('هذا الجهاز مُفعّل بالفعل', 'success');
        return;
      }
      toast.push(err?.message || 'تعذّر تفعيل البصمة', 'error');
    } finally {
      setBioBusy(false);
    }
  }

  async function install() {
    keepOpen();
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      setDeferred(null);
      return;
    }
    setShowManual(true);
  }

  const showBio = bioSupported && !hasBio && !bioDone;
  const showInstall = !installed;

  if (!show || (!showBio && !showInstall)) return null;

  return (
    <div className="mx-auto mt-3 w-full max-w-2xl px-4">
      <div className="relative rounded-2xl border border-line bg-panel p-4 shadow-sm">
        <button
          type="button"
          onClick={() => setShow(false)}
          aria-label="إغلاق"
          className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full text-muted transition hover:bg-chip"
        >
          ✕
        </button>

        <p className="mb-3 pe-6 text-sm font-bold text-brand">لتسهيل استخدامك للتطبيق</p>

        <div className="space-y-2.5 text-sm">
          {showBio && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-ink">الدخول ببصمتك بدل كلمة المرور.</span>
              <button
                type="button"
                onClick={enableBiometric}
                disabled={bioBusy}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-60"
              >
                {bioBusy ? '...' : 'تفعيل'}
              </button>
            </div>
          )}

          {showInstall && (
            <div className="flex items-center gap-2">
              <span className="flex-1 text-ink">تثبيت التطبيق على جهازك.</span>
              <button
                type="button"
                onClick={install}
                className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:opacity-90"
              >
                تثبيت
              </button>
            </div>
          )}

          {showInstall && showManual && (
            <p className="rounded-lg bg-chip p-2 text-xs text-muted">
              {isIOS() ? (
                <>
                  من زر المشاركة <span aria-hidden="true">⬆️</span> في المتصفح، اختر «إضافة إلى الشاشة
                  الرئيسية».
                </>
              ) : (
                <>من قائمة المتصفح (⋮) اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».</>
              )}
            </p>
          )}
        </div>

        {!paused && (
          <span className="pointer-events-none absolute inset-x-0 bottom-0 h-1 overflow-hidden rounded-b-2xl bg-line/40">
            <span
              className="block h-full bg-accent"
              style={{ width: barW, transition: `width ${VISIBLE_MS}ms linear` }}
            />
          </span>
        )}
      </div>
    </div>
  );
}
