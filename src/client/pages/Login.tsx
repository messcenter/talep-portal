// src/client/pages/Login.tsx
// Welcome / sign-in landing for unauthenticated users. The 401 handler in
// api.ts redirects here; the user clicks through to /auth/google.

// Brand wordmark + clipboard glyph. Colour is inherited (currentColor), so the
// same mark works white on the brand panel and primary on the mobile header.
function BrandMark() {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-lg bg-white/15 ring-1 ring-white/25">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path
            d="M8 3.5h8a2 2 0 0 1 2 2V20a1 1 0 0 1-1.5.87L12 18.3l-4.5 2.57A1 1 0 0 1 6 20V5.5a2 2 0 0 1 2-2Z"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
          <path d="M9.5 9.5h5M9.5 13h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        </svg>
      </span>
      <span className="text-lg font-bold tracking-tight">Talep Portalı</span>
    </span>
  );
}

const STEPS = [
  {
    title: "Talep oluştur",
    desc: "İhtiyacını birkaç alanda, ekleriyle birlikte ilet.",
    icon: <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />,
  },
  {
    title: "Netleştir",
    desc: "Soru-cevap iş parçacığıyla talebi olgunlaştır.",
    icon: (
      <path d="M4 5.5h16v10H9l-5 3.5V5.5Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
    ),
  },
  {
    title: "Karara bağla",
    desc: "Kabul ya da gerekçeli ret ile sonuçlandır.",
    icon: (
      <path
        d="m4.5 12.5 4.5 4.5 10.5-11"
        stroke="currentColor"
        strokeWidth="1.9"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    ),
  },
];

function GoogleButton() {
  return (
    <a
      href="/auth/google"
      className="inline-flex w-full items-center justify-center gap-2.5 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-fg shadow-sm transition-all hover:bg-[#0d4271] hover:shadow active:scale-[0.99]"
    >
      <svg aria-hidden="true" width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
        <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844a4.14 4.14 0 0 1-1.796 2.716v2.259h2.908c1.702-1.567 2.684-3.875 2.684-6.615z" fill="#fff" fillOpacity=".9" />
        <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.909-2.259c-.805.54-1.836.86-3.047.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#fff" fillOpacity=".9" />
        <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#fff" fillOpacity=".7" />
        <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#fff" fillOpacity=".7" />
      </svg>
      Google ile giriş
    </a>
  );
}

export function Login() {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      {/* ── Brand panel (desktop only) ────────────────────────────────── */}
      <aside
        className="relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex xl:p-16"
        style={{
          backgroundColor: "#0F4C81",
          backgroundImage:
            "radial-gradient(125% 125% at 0% 0%, #1a5e9c 0%, rgba(15,76,129,0) 46%), radial-gradient(120% 120% at 100% 100%, #0a3760 0%, rgba(15,76,129,0) 52%)",
        }}
      >
        <div className="welcome-grid pointer-events-none absolute inset-0 opacity-70" />

        <div className="welcome-rise relative">
          <BrandMark />
        </div>

        <div className="relative max-w-md">
          <h1
            className="welcome-rise text-3xl font-bold leading-tight tracking-tight"
            style={{ animationDelay: "80ms" }}
          >
            ERP ve yazılım taleplerini
            <br />
            tek yerden yönetin.
          </h1>
          <p
            className="welcome-rise mt-4 text-sm leading-relaxed text-white/70"
            style={{ animationDelay: "140ms" }}
          >
            Dağınık formlar ve tablolar yerine; her talebi açık bir akışta toplayın,
            netleştirin ve karara bağlayın.
          </p>

          <ol className="mt-10 space-y-5">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="welcome-rise flex items-start gap-4"
                style={{ animationDelay: `${220 + i * 80}ms` }}
              >
                <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white/10 ring-1 ring-white/15">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    {s.icon}
                  </svg>
                </span>
                <span>
                  <span className="block text-sm font-semibold">{s.title}</span>
                  <span className="block text-sm text-white/60">{s.desc}</span>
                </span>
              </li>
            ))}
          </ol>
        </div>

        <p className="welcome-rise relative text-xs text-white/45" style={{ animationDelay: "520ms" }}>
          Kokil Metal · Kurumsal iç araç
        </p>
      </aside>

      {/* ── Sign-in panel ─────────────────────────────────────────────── */}
      <main className="flex items-center justify-center bg-surface-tonal px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand (the brand panel is hidden below lg). */}
          <div className="welcome-rise mb-10 flex justify-center text-primary lg:hidden">
            <BrandMark />
          </div>

          <p
            className="welcome-rise text-xs font-medium uppercase tracking-widest text-secondary"
            style={{ animationDelay: "60ms" }}
          >
            Hoş geldiniz
          </p>
          <h2
            className="welcome-rise mt-2 text-2xl font-bold tracking-tight text-on-surface"
            style={{ animationDelay: "120ms" }}
          >
            Giriş yapın
          </h2>
          <p
            className="welcome-rise mt-2 text-sm leading-relaxed text-on-surface-variant"
            style={{ animationDelay: "180ms" }}
          >
            Devam etmek için kurumsal Google hesabınızla giriş yapın.
          </p>

          <div className="welcome-rise mt-8" style={{ animationDelay: "260ms" }}>
            <GoogleButton />
          </div>

          <div
            className="welcome-rise mt-6 flex items-center gap-2 rounded-md border border-border-subtle bg-white px-3 py-2.5"
            style={{ animationDelay: "320ms" }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="shrink-0 text-secondary">
              <path
                d="M12 3 4 6v5c0 4.5 3.2 7.8 8 9 4.8-1.2 8-4.5 8-9V6l-8-3Z"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinejoin="round"
              />
              <path d="m9 12 2 2 4-4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <p className="text-xs text-on-surface-variant">
              Yalnızca <span className="font-medium text-on-surface">@kokilmetal.com.tr</span> hesapları kabul edilir.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
