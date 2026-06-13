// src/client/pages/Definitions.tsx — admin-only management of departments & their modules.
import { useState, useEffect, useCallback } from "react";
import { Navigate } from "react-router-dom";
import { apiGet, apiSend } from "../api";
import { useUser } from "../auth";
import { Card } from "../../components/ui/card";
import { Button } from "../../components/ui/button";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { useToast } from "../components/Toast";

type Dept = { id: number; name: string; modules: { id: number; name: string }[] };

const inputCls =
  "border border-border-subtle rounded px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary";

export function Definitions() {
  const user = useUser();
  // Gate in the outer component (no hooks above this return) so the inner
  // component can call hooks unconditionally — Rules of Hooks.
  if (!user.isAdmin) return <Navigate to="/my" replace />;
  return <DefinitionsInner />;
}

function DefinitionsInner() {
  const toast = useToast();
  const [depts, setDepts] = useState<Dept[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newDept, setNewDept] = useState("");
  const [apps, setApps] = useState<{ id: number; name: string }[] | null>(null);
  const [newApp, setNewApp] = useState("");
  const [confirm, setConfirm] = useState<{ title: string; message: string; onConfirm: () => void } | null>(null);

  const load = useCallback(() => {
    setError(null);
    apiGet<Dept[]>("/api/departments")
      .then(setDepts)
      .catch((e) => setError(e instanceof Error ? e.message : "Bir hata oluştu."));
    apiGet<{ id: number; name: string }[]>("/api/applications")
      .then(setApps)
      .catch((e) => setError(e instanceof Error ? e.message : "Bir hata oluştu."));
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function addDept() {
    const name = newDept.trim();
    if (!name) return;
    try {
      await apiSend("/api/admin/departments", "POST", JSON.stringify({ name }), "application/json");
      setNewDept("");
      toast.show("Eklendi.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }
  async function delDept(id: number) {
    try {
      await apiSend(`/api/admin/departments/${id}`, "DELETE");
      toast.show("Silindi.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }
  async function addModule(deptId: number, name: string, reset: () => void) {
    const n = name.trim();
    if (!n) return;
    try {
      await apiSend(
        `/api/admin/departments/${deptId}/modules`,
        "POST",
        JSON.stringify({ name: n }),
        "application/json",
      );
      reset();
      toast.show("Eklendi.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }
  async function delModule(id: number) {
    try {
      await apiSend(`/api/admin/modules/${id}`, "DELETE");
      toast.show("Silindi.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }
  async function addApp() {
    const name = newApp.trim();
    if (!name) return;
    try {
      await apiSend("/api/admin/applications", "POST", JSON.stringify({ name }), "application/json");
      setNewApp("");
      toast.show("Eklendi.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }
  async function delApp(id: number) {
    try {
      await apiSend(`/api/admin/applications/${id}`, "DELETE");
      toast.show("Silindi.");
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Bir hata oluştu.");
    }
  }

  function askDelDept(d: Dept) {
    setConfirm({
      title: "Departmanı sil?",
      message: `«${d.name}» ve modülleri silinsin mi? Geçmiş talepler etkilenmez.`,
      onConfirm: () => delDept(d.id),
    });
  }
  function askDelModule(deptName: string, m: { id: number; name: string }) {
    setConfirm({
      title: "Modülü sil?",
      message: `«${deptName} › ${m.name}» silinsin mi? Geçmiş talepler etkilenmez.`,
      onConfirm: () => delModule(m.id),
    });
  }
  function askDelApp(a: { id: number; name: string }) {
    setConfirm({
      title: "Uygulamayı sil?",
      message: `«${a.name}» silinsin mi? Geçmiş talepler etkilenmez.`,
      onConfirm: () => delApp(a.id),
    });
  }

  return (
    <main className="max-w-4xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight text-on-surface mb-4">
        Tanımlar — Departman, Modül & Uygulama
      </h1>
      {error && (
        <div
          role="alert"
          className="bg-danger/10 border border-danger/30 text-danger rounded p-3 text-sm mb-4"
        >
          {error}
        </div>
      )}

      <Card className="p-4 mb-6">
        <span className="block text-xs font-semibold uppercase tracking-wide mb-1 text-on-surface-variant">
          Yeni departman
        </span>
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Departman adı"
            value={newDept}
            onChange={(e) => setNewDept(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addDept();
            }}
          />
          <Button type="button" onClick={addDept}>
            Ekle
          </Button>
        </div>
      </Card>

      <Card className="p-4 mb-6">
        <span className="block text-xs font-semibold uppercase tracking-wide mb-2 text-on-surface-variant">
          Uygulamalar
        </span>
        <div className="flex flex-wrap gap-2 mb-3">
          {apps?.map((a) => (
            <span
              key={a.id}
              className="inline-flex items-center gap-1.5 bg-surface-tonal border border-border-subtle rounded-lg px-2.5 py-1 text-xs"
            >
              {a.name}
              <button
                type="button"
                className="text-danger font-bold leading-none px-1"
                aria-label={`${a.name} sil`}
                onClick={() => askDelApp(a)}
              >
                ✕
              </button>
            </span>
          ))}
          {apps && apps.length === 0 && (
            <span className="text-xs text-on-surface-variant">Uygulama yok</span>
          )}
        </div>
        <div className="flex gap-2">
          <input
            className={`${inputCls} flex-1`}
            placeholder="Yeni uygulama (ör. ERP)"
            value={newApp}
            onChange={(e) => setNewApp(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addApp();
            }}
          />
          <Button type="button" onClick={addApp}>
            Ekle
          </Button>
        </div>
      </Card>

      {!depts && !error && <p className="text-on-surface-variant">Yükleniyor…</p>}
      {depts && depts.length === 0 && (
        <p className="text-on-surface-variant">Henüz departman tanımlanmamış.</p>
      )}
      <div className="flex flex-col gap-3">
        {depts?.map((d) => (
          <DeptCard
            key={d.id}
            d={d}
            onDelDept={askDelDept}
            onAddModule={addModule}
            onDelModule={askDelModule}
          />
        ))}
      </div>
      {confirm && (
        <ConfirmDialog
          open={!!confirm}
          onOpenChange={(o) => { if (!o) setConfirm(null); }}
          title={confirm.title}
          message={confirm.message}
          confirmLabel="Sil"
          onConfirm={confirm.onConfirm}
        />
      )}
    </main>
  );
}

function DeptCard({
  d,
  onDelDept,
  onAddModule,
  onDelModule,
}: {
  d: Dept;
  onDelDept: (d: Dept) => void;
  onAddModule: (deptId: number, name: string, reset: () => void) => void;
  onDelModule: (deptName: string, m: { id: number; name: string }) => void;
}) {
  const [mod, setMod] = useState("");
  const inputClsLocal =
    "border border-border-subtle rounded px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between mb-2">
        <h2 className="font-semibold text-on-surface">{d.name}</h2>
        <button
          type="button"
          className="text-danger text-sm hover:underline"
          onClick={() => onDelDept(d)}
        >
          Sil
        </button>
      </div>
      <div className="flex flex-wrap gap-2 mb-3">
        {d.modules.map((m) => (
          <span
            key={m.id}
            className="inline-flex items-center gap-1.5 bg-surface-tonal border border-border-subtle rounded-lg px-2.5 py-1 text-xs"
          >
            {m.name}
            <button
              type="button"
              className="text-danger font-bold leading-none"
              aria-label={`${m.name} sil`}
              onClick={() => onDelModule(d.name, m)}
            >
              ✕
            </button>
          </span>
        ))}
        {d.modules.length === 0 && (
          <span className="text-xs text-on-surface-variant">Modül yok</span>
        )}
      </div>
      <div className="flex gap-2">
        <input
          className={`${inputClsLocal} flex-1`}
          placeholder="Yeni modül"
          value={mod}
          onChange={(e) => setMod(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") onAddModule(d.id, mod, () => setMod(""));
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="secondary"
          onClick={() => onAddModule(d.id, mod, () => setMod(""))}
        >
          Modül ekle
        </Button>
      </div>
    </Card>
  );
}
