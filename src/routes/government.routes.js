import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/government/programs  - Daftar program bantuan/pemberdayaan pemerintah
 */
router.get('/programs', verifyToken, async (req, res) => {
  await db.read();
  const list = db.data.govPrograms.filter((p) => p.isActive);
  return ok(res, list);
});

/**
 * POST /api/government/programs  (pengurus) - Tambah/integrasikan program pemerintah
 * body: { nama, deskripsi, instansi, kategori, syarat, kuota, tenggat }
 */
router.post('/programs', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const { nama, deskripsi, instansi, kategori, syarat, kuota, tenggat } = req.body;
  if (!nama) return fail(res, 'nama program wajib diisi.', 422);
  const program = {
    id: genId('gov_'), nama, deskripsi: deskripsi || '', instansi: instansi || '',
    kategori: kategori || 'Pemberdayaan', syarat: syarat || [], kuota: kuota || null,
    tenggat: tenggat || null, isActive: true, createdAt: nowISO(),
  };
  db.data.govPrograms.push(program);
  await db.write();
  return ok(res, program, 'Program pemerintah berhasil ditambahkan.', 201);
});

/**
 * POST /api/government/programs/:id/apply  (anggota) - Ajukan diri untuk program
 * body: { dokumen, catatan }
 */
router.post('/programs/:id/apply', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const program = db.data.govPrograms.find((p) => p.id === req.params.id && p.isActive);
  if (!program) return fail(res, 'Program tidak ditemukan.', 404);

  const existing = db.data.govApplications.find((a) => a.programId === program.id && a.memberId === req.user.memberId);
  if (existing) return fail(res, 'Anda sudah mengajukan diri untuk program ini.', 409);

  const application = {
    id: genId('gapp_'), programId: program.id, memberId: req.user.memberId,
    status: 'diajukan', dokumen: req.body.dokumen || null, catatan: req.body.catatan || '',
    createdAt: nowISO(), updatedAt: nowISO(),
  };
  db.data.govApplications.push(application);
  await db.write();
  return ok(res, application, 'Pengajuan program berhasil dikirim.', 201);
});

/**
 * GET /api/government/applications  (pengurus - semua; anggota - milik sendiri)
 */
router.get('/applications', verifyToken, async (req, res) => {
  await db.read();
  const { page, limit } = req.query;
  let list =
    req.user.role === 'anggota'
      ? db.data.govApplications.filter((a) => a.memberId === req.user.memberId)
      : [...db.data.govApplications];
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

/**
 * PATCH /api/government/applications/:id  (pengurus) - Update status seleksi
 * body: { status: 'diverifikasi'|'disetujui'|'ditolak', catatan }
 */
router.patch('/applications/:id', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const application = db.data.govApplications.find((a) => a.id === req.params.id);
  if (!application) return fail(res, 'Data pengajuan tidak ditemukan.', 404);
  const statusValid = ['diverifikasi', 'disetujui', 'ditolak'];
  if (!statusValid.includes(req.body.status)) return fail(res, `status harus salah satu dari: ${statusValid.join(', ')}`, 422);
  application.status = req.body.status;
  if (req.body.catatan) application.catatan = req.body.catatan;
  application.updatedAt = nowISO();
  await db.write();
  return ok(res, application, 'Status pengajuan diperbarui.');
});

export default router;
