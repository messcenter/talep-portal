// scripts/seed-definitions.ts
// Idempotent seeding of departments & their modules into the configured database.
//
// Usage:
//   bun run seed:definitions                 # seeds ./data.db (app default)
//   DB_PATH=dev-tour.db bun run seed:definitions
//   bun run scripts/seed-definitions.ts /path/to/other.db
//
// Re-running is safe: existing departments/modules are skipped, only missing ones
// are added. Editing DATA below and re-running adds new entries; removing entries
// here does NOT delete them — use the admin "Tanımlar" page for deletions.

import { openDb } from "../src/db/db";
import { makeRepo } from "../src/db/repo";

// Department -> modules. Sensible defaults for a metal-manufacturing ERP context.
// Edit freely; names are the source of truth (stored as text on requests).
const DATA: Record<string, string[]> = {
  "Üretim": ["Stok Yönetimi", "Üretim Planlama", "İş Emirleri"],
  "Kalite": ["Kalite Kontrol", "Sertifikalar", "Uygunsuzluk"],
  "Satınalma": ["Tedarikçi", "Satınalma Siparişi", "Teklif"],
  "Satış": ["Müşteri", "Satış Siparişi", "Sevkiyat"],
  "Muhasebe": ["Faturalama", "Cari Hesap", "Maliyet"],
  "Finans": ["Ödeme", "Tahsilat", "Bütçe"],
  "İnsan Kaynakları": ["Bordro", "İzin", "Personel"],
  "Bilgi İşlem": ["Donanım", "Yazılım", "Yetkilendirme"],
  "Bakım": ["Arıza", "Periyodik Bakım"],
  "Lojistik": ["Depo", "Sevkiyat", "Nakliye"],
};

const dbPath = process.argv[2] ?? process.env.DB_PATH ?? "data.db";
const now = () => new Date().toISOString();

const db = openDb(dbPath);
const repo = makeRepo(db);

let deptAdded = 0;
let deptExisting = 0;
let modAdded = 0;
let modExisting = 0;

for (const [deptName, modules] of Object.entries(DATA)) {
  let dept = repo.getDepartmentByName(deptName);
  if (dept) {
    deptExisting++;
  } else {
    dept = repo.createDepartment(deptName, now());
    deptAdded++;
  }
  const existing = new Set(repo.listModuleNames(dept.id));
  for (const mod of modules) {
    if (existing.has(mod)) {
      modExisting++;
    } else {
      repo.createModule(dept.id, mod, now());
      modAdded++;
    }
  }
}

console.log(`Seed tamamlandı (${dbPath}):`);
console.log(`  Departman: +${deptAdded} eklendi, ${deptExisting} zaten vardı`);
console.log(`  Modül:     +${modAdded} eklendi, ${modExisting} zaten vardı`);
for (const d of repo.listDepartmentsWithModules()) {
  console.log(`  • ${d.name} — ${d.modules.map((m) => m.name).join(", ") || "(modül yok)"}`);
}
