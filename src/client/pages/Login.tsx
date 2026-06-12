// src/client/pages/Login.tsx
// Friendly landing page for unauthenticated users.
// NOTE: normal flow auto-redirects to /auth/google via the 401 handler in api.ts.
// This page is shown only if someone navigates to /login directly.
import { Card } from "../../components/ui/card";

export function Login() {
  return (
    <div className="min-h-screen bg-surface-tonal flex items-center justify-center px-4">
      <Card className="w-full max-w-md mt-12 p-8 text-center">
        {/* Brand */}
        <div className="mb-2">
          <span className="text-2xl font-bold text-primary tracking-tight">
            Talep Portalı
          </span>
        </div>

        {/* Subtitle */}
        <p className="text-sm text-on-surface-variant mb-8">
          Devam etmek için kurumsal hesabınızla giriş yapın.
        </p>

        {/* Google SSO button */}
        <a
          href="/auth/google"
          className="inline-flex items-center justify-center gap-2 w-full rounded bg-primary text-primary-fg font-semibold text-sm px-4 py-2 hover:bg-[#0d4271] transition-colors"
        >
          {/* Google "G" icon (inline SVG — no external dep needed) */}
          <svg
            aria-hidden="true"
            width="18"
            height="18"
            viewBox="0 0 18 18"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
          >
            <path
              d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"
              fill="#fff"
              fillOpacity=".9"
            />
            <path
              d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.805.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"
              fill="#fff"
              fillOpacity=".9"
            />
            <path
              d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"
              fill="#fff"
              fillOpacity=".7"
            />
            <path
              d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z"
              fill="#fff"
              fillOpacity=".7"
            />
          </svg>
          Google ile giriş
        </a>

        {/* Footer note */}
        <p className="text-xs text-on-surface-variant mt-6">
          Yalnızca <span className="font-mono">@kokilmetal.com.tr</span> hesapları kabul edilir.
        </p>
      </Card>
    </div>
  );
}
