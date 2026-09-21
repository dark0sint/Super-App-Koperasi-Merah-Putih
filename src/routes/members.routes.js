import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

const memberOwnerOrStaff = (req, member) =>
  req.user.role === 'pengurus' || req.user.role === 'kasir' || member.userId === req.user.id;

/**
 * GET /api/members  (pengurus)
 * Rekapitulasi data anggota, dengan filter status & pencarian nama
 */
router.get('/', verifyToken, requireRole('pengurus', 'kasir'), async (req, res) => {
  await db.read();
  const { status, q, page, limit } = req.query;
  let list = [...db.data.members];
  if (status) list = list.filter((m) => m.status === status);
  if (q) list = list.filter((m) => m.nama.toLowerCase().includes(q.toLowerCase()) || m.nomorAnggota.includes(q));
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

/**
 * GET /api/members/:id
 */
router.get('/:id', verifyToken, async (req, res) => {
  await db.read();
  const member = db.data.members.find((m) => m.id === req.params.id);
  if (!member) return fail(res, 'Anggota tidak ditemukan.', 404);
  if (!memberOwnerOrStaff(req, member)) return fail(res, 'Akses ditolak.', 403);
  return ok(res, member);
});

/**
 * PATCH /api/members/:id  (anggota melengkapi profil sendiri, atau pengurus mengedit)
 */
router.patch('/:id', verifyToken, async (req, res) => {
  await db.read();
  const member = db.data.members.find((m) => m.id === req.params.id);
  if (!member) return fail(res, 'Anggota tidak ditemukan.', 404);
  if (!memberOwnerOrStaff(req, member)) return fail(res, 'Akses ditolak.', 403);

  const editable = ['nama', 'noHp', 'alamat', 'fotoKTP'];
  for (const field of editable) {
    if (req.body[field] !== undefined) member[field] = req.body[field];
  }
  await db.write();
  return ok(res, member, 'Profil anggota diperbarui.');
});

/**
 * POST /api/members/:id/verify  (pengurus) - Verifikasi anggota + terbitkan kartu anggota digital
 * body: { approve: boolean, reason?: string }
 */
router.post('/:id/verify', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const member = db.data.members.find((m) => m.id === req.params.id);
  if (!member) return fail(res, 'Anggota tidak ditemukan.', 404);

  const { approve, reason } = req.body;
  if (approve) {
    member.status = 'terverifikasi';
    member.kartuAnggotaId = genId('KTA-');
    member.verifiedBy = req.user.id;
    member.verifiedAt = nowISO();
  } else {
    member.status = 'ditolak';
    member.verifiedBy = req.user.id;
    member.verifiedAt = nowISO();
    member.rejectReason = reason || 'Tidak memenuhi syarat.';
  }
  await db.write();
  return ok(res, member, approve ? 'Anggota berhasil diverifikasi dan kartu anggota digital diterbitkan.' : 'Pendaftaran anggota ditolak.');
});

/**
 * GET /api/members/:id/kartu-anggota  - Data kartu anggota digital
 */
router.get('/:id/kartu-anggota', verifyToken, async (req, res) => {
  await db.read();
  const member = db.data.members.find((m) => m.id === req.params.id);
  if (!member) return fail(res, 'Anggota tidak ditemukan.', 404);
  if (!memberOwnerOrStaff(req, member)) return fail(res, 'Akses ditolak.', 403);
  if (member.status !== 'terverifikasi') return fail(res, 'Kartu anggota belum tersedia. Anggota belum terverifikasi.', 400);

  return ok(res, {
    kartuAnggotaId: member.kartuAnggotaId,
    nomorAnggota: member.nomorAnggota,
    nama: member.nama,
    status: member.status,
    berlakuSejak: member.verifiedAt,
    koperasi: db.data.cooperativeProfile.nama,
  });
});

export default router;
