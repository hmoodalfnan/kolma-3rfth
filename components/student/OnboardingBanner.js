'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

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
 * fingerprint/Face login, and add the app to the home screen. It remembers the
 * dismissal, hides the install tip once the app already runs standalone, and
 * offers the native install prompt on browsers that support it.
 */
export function OnboardingBanner() {
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [deferred, setDeferred] = useState(null);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY)) return;
    setInstalled(isStandalone());
    setShow(true);
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

  async function install() {
    if (!deferred) return;
    deferred.prompt();
    await deferred.userChoice.catch(() => {});
    setDeferred(null);
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

        <p className="mb-2 pe-6 text-sm font-bold text-brand">لتسهيل استخدامك للتطبيق</p>

        <ul className="space-y-2.5 text-sm">
          <li className="flex items-start gap-2">
            <span aria-hidden="true" className="text-lg leading-none">🔐</span>
            <span className="flex-1">
              <span className="text-ink">فعّل الدخول ببصمتك لتسجيل دخول أسرع.</span>{' '}
              <Link href="/settings" prefetch className="font-semibold text-brand underline">
                تفعيل الآن
              </Link>
            </span>
          </li>

          {showInstall && (
            <li className="flex items-start gap-2">
              <span aria-hidden="true" className="text-lg leading-none">📲</span>
              <span className="flex-1">
                <span className="text-ink">أضِف التطبيق إلى شاشتك الرئيسية.</span>{' '}
                {deferred ? (
                  <button
                    type="button"
                    onClick={install}
                    className="font-semibold text-brand underline"
                  >
                    تثبيت
                  </button>
                ) : isIOS() ? (
                  <span className="text-muted">
                    من زر المشاركة <span aria-hidden="true">⬆️</span> اختر «إضافة إلى الشاشة الرئيسية».
                  </span>
                ) : (
                  <span className="text-muted">من قائمة المتصفح اختر «إضافة إلى الشاشة الرئيسية».</span>
                )}
              </span>
            </li>
          )}
        </ul>
      </div>
    </div>
  );
}
