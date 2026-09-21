import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, generateNomorAnggota } from '../utils/helpers.js';
import { signToken, verifyToken } from '../middleware/auth.js';

const router = Router();

/**
 * POST /api/auth/register
 * Pendaftaran anggota baru secara mandiri (onboarding digital)
 */
router.post('/register', async (req, res) => {
  const { nama, email, password, noKTP, noHp, alamat, fotoKTP } = req.body;
  if (!nama || !email || !password || !noKTP || !noHp) {
    return fail(res, 'Field nama, email, password, noKTP, dan noHp wajib diisi.', 422);
  }
  await db.read();
  const existing = db.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (existing) return fail(res, 'Email sudah terdaftar.', 409);

  const existingKTP = db.data.members.find((m) => m.noKTP === noKTP);
  if (existingKTP) return fail(res, 'Nomor KTP sudah terdaftar sebagai anggota.', 409);

  const hashed = await bcrypt.hash(password, 10);
  const userId = genId('usr_');
  const memberId = genId('mbr_');
  const nomorAnggota = generateNomorAnggota(db.data.members.length + 1);

  db.data.users.push({
    id: userId,
    email,
    password: hashed,
    role: 'anggota',
    memberId,
    createdAt: nowISO(),
  });

  db.data.members.push({
    id: memberId,
    userId,
    nama,
    noKTP,
    noHp,
    alamat: alamat || '',
    fotoKTP: fotoKTP || null,
    status: 'menunggu_verifikasi', // menunggu_verifikasi | terverifikasi | ditolak
    nomorAnggota,
    kartuAnggotaId: null,
    verifiedBy: null,
    verifiedAt: null,
    createdAt: nowISO(),
  });

  // Buat dompet digital & saldo simpanan awal Rp0
  db.data.wallets.push({ id: genId('wlt_'), memberId, saldo: 0 });

  await db.write();

  const token = signToken({ id: userId, role: 'anggota', memberId });
  return ok(
    res,
    { token, member: db.data.members.find((m) => m.id === memberId) },
    'Pendaftaran berhasil. Akun Anda menunggu verifikasi pengurus.',
    201
  );
});

/**
 * POST /api/auth/login
 */
router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return fail(res, 'Email dan password wajib diisi.', 422);
  await db.read();
  const user = db.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase());
  if (!user) return fail(res, 'Email atau password salah.', 401);
  const match = await bcrypt.compare(password, user.password);
  if (!match) return fail(res, 'Email atau password salah.', 401);

  const token = signToken({ id: user.id, role: user.role, memberId: user.memberId || null });
  const member = user.memberId ? db.data.members.find((m) => m.id === user.memberId) : null;
  return ok(res, { token, user: { id: user.id, email: user.email, role: user.role }, member }, 'Login berhasil.');
});

/**
 * GET /api/auth/me
 */
router.get('/me', verifyToken, async (req, res) => {
  await db.read();
  const user = db.data.users.find((u) => u.id === req.user.id);
  if (!user) return fail(res, 'Pengguna tidak ditemukan.', 404);
  const member = user.memberId ? db.data.members.find((m) => m.id === user.memberId) : null;
  const wallet = member ? db.data.wallets.find((w) => w.memberId === member.id) : null;
  return ok(res, { user: { id: user.id, email: user.email, role: user.role }, member, wallet });
});

/**
 * POST /api/auth/create-staff  (pengurus only - dibuat via kode akses sementara jika belum ada pengurus)
 * Endpoint praktis untuk pengurus membuat akun kasir/pengurus lain.
 * Dilindungi di admin.routes.js (requireRole pengurus) - lihat referensi di sana.
 */

export default router;
