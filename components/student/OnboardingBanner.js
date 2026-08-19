'use client';

import { useEffect, useState } from 'react';
import { useToast } from '@/components/ui/Toast';
import { biometricAvailable, registerPasskey } from '@/lib/webauthn/client';

const DISMISS_KEY = 'onboard_dismissed_v1';

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
 * A one-time, dismissible nudge at the top of the student area: turn on
 * fingerprint/Face login (enrolled inline, right from the banner), and install
 * the app. It remembers the dismissal, hides the install tip once the app runs
 * standalone, and uses the native install prompt where the browser supports it.
 */
export function OnboardingBanner() {
  const toast = useToast();
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState(null);
  const [bioSupported, setBioSupported] = useState(false);
  const [bioBusy, setBioBusy] = useState(false);
  const [bioDone, setBioDone] = useState(false);
  const [showManual, setShowManual] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    setInstalled(isStandalone());
    setShow(true);
    biometricAvailable().then(setBioSupported);
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

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, '1');
    setShow(false);
  }

  async function enableBiometric() {
    setBioBusy(true);
    try {
      await registerPasskey('جهازي');
      setBioDone(true);
      toast.push('تم تفعيل الدخول بالبصمة', 'success');
    } catch (err) {
      if (err?.name === 'NotAllowedError' || err?.name === 'AbortError') return; // user cancelled
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
    if (deferred) {
      deferred.prompt();
      await deferred.userChoice.catch(() => {});
      setDeferred(null);
      return;
    }
    setShowManual(true); // no native prompt (iOS/Safari): show the manual steps
  }

  if (!show) return null;

  const showInstall = !installed;

  return (
    <div className="mx-auto mt-3 w-full max-w-2xl px-4">
      <div className="relative rounded-2xl border border-line bg-panel p-4 shadow-sm">
        <button
          type="button"
          onClick={dismiss}
          aria-label="إغلاق"
          className="absolute end-2 top-2 flex size-7 items-center justify-center rounded-full text-muted transition hover:bg-chip"
        >
          ✕
        </button>

        <p className="mb-3 pe-6 text-sm font-bold text-brand">لتسهيل استخدامك للتطبيق</p>

        <div className="space-y-2.5 text-sm">
          {bioSupported && (
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-lg leading-none">🔐</span>
              <span className="flex-1 text-ink">الدخول ببصمتك بدل كلمة المرور.</span>
              {bioDone ? (
                <span className="shrink-0 text-sm font-semibold text-brand">مُفعّل ✓</span>
              ) : (
                <button
                  type="button"
                  onClick={enableBiometric}
                  disabled={bioBusy}
                  className="shrink-0 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink transition hover:opacity-90 disabled:opacity-60"
                >
                  {bioBusy ? '...' : 'تفعيل'}
                </button>
              )}
            </div>
          )}

          {showInstall && (
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="text-lg leading-none">📲</span>
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
      </div>
    </div>
  );
}
