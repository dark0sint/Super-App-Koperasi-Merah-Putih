import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/complaints  (anggota) - Kirim pengaduan/aspirasi/whistleblowing
 * body: { kategori, judul, isi, isAnonim }
 */
router.post('/', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const { kategori, judul, isi, isAnonim } = req.body;
  if (!judul || !isi) return fail(res, 'judul dan isi wajib diisi.', 422);

  const complaint = {
    id: genId('cmp_'),
    memberId: req.user.memberId,
    kategori: kategori || 'Umum',
    judul,
    isi,
    isAnonim: !!isAnonim,
    status: 'baru', // baru | diproses | selesai
    tanggapan: null,
    tanggapanOleh: null,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  db.data.complaints.push(complaint);
  await db.write();
  const responsePayload = { ...complaint, memberId: complaint.isAnonim ? null : complaint.memberId };
  return ok(res, responsePayload, 'Pengaduan Anda berhasil dikirim ke pengurus.', 201);
});

/**
 * GET /api/complaints/mine  (anggota)
 */
router.get('/mine', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const list = db.data.complaints
    .filter((c) => c.memberId === req.user.memberId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, list);
});

/**
 * GET /api/complaints  (pengurus) - semua pengaduan, identitas disamarkan jika anonim
 */
router.get('/', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const { status, page, limit } = req.query;
  let list = [...db.data.complaints];
  if (status) list = list.filter((c) => c.status === status);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const masked = list.map((c) => (c.isAnonim ? { ...c, memberId: 'Anonim' } : c));
  return ok(res, paginate(masked, page, limit));
});

/**
 * POST /api/complaints/:id/respond  (pengurus) - Tanggapi pengaduan
 * body: { tanggapan, status }
 */
router.post('/:id/respond', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const complaint = db.data.complaints.find((c) => c.id === req.params.id);
  if (!complaint) return fail(res, 'Pengaduan tidak ditemukan.', 404);
  const { tanggapan, status } = req.body;
  if (tanggapan) complaint.tanggapan = tanggapan;
  if (status && ['diproses', 'selesai'].includes(status)) complaint.status = status;
  complaint.tanggapanOleh = req.user.id;
  complaint.updatedAt = nowISO();
  await db.write();
  return ok(res, complaint, 'Tanggapan berhasil disimpan.');
});

export default router;
