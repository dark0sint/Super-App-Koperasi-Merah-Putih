import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();
const JENIS_VALID = ['pokok', 'wajib', 'sukarela'];

function computeSaldo(memberId, jenis) {
  return db.data.savingsTransactions
    .filter((t) => t.memberId === memberId && t.jenis === jenis)
    .reduce((acc, t) => acc + (t.tipe === 'setor' ? t.jumlah : -t.jumlah), 0);
}

function resolveMemberId(req) {
  // pengurus/kasir can act on behalf of a member via body.memberId; anggota acts on self
  if (req.user.role === 'anggota') return req.user.memberId;
  return req.body.memberId || req.query.memberId;
}

/**
 * POST /api/savings/deposit
 * Setor simpanan pokok / wajib / sukarela (anggota setor sendiri, atau pengurus mencatat setoran tunai)
 * body: { jenis, jumlah, keterangan, memberId? }
 */
router.post('/deposit', verifyToken, async (req, res) => {
  await db.read();
  const { jenis, jumlah, keterangan } = req.body;
  const memberId = resolveMemberId(req);
  if (!memberId) return fail(res, 'memberId wajib diisi.', 422);
  if (!JENIS_VALID.includes(jenis)) return fail(res, `jenis harus salah satu dari: ${JENIS_VALID.join(', ')}`, 422);
  if (!jumlah || jumlah <= 0) return fail(res, 'jumlah harus lebih besar dari 0.', 422);

  const member = db.data.members.find((m) => m.id === memberId);
  if (!member) return fail(res, 'Anggota tidak ditemukan.', 404);
  if (member.status !== 'terverifikasi' && req.user.role === 'anggota') {
    return fail(res, 'Akun Anda belum terverifikasi pengurus.', 403);
  }

  const saldoSebelum = computeSaldo(memberId, jenis);
  const tx = {
    id: genId('sav_'),
    memberId,
    jenis,
    tipe: 'setor',
    jumlah: Number(jumlah),
    saldoSetelah: saldoSebelum + Number(jumlah),
    keterangan: keterangan || `Setoran simpanan ${jenis}`,
    createdAt: nowISO(),
  };
  db.data.savingsTransactions.push(tx);
  await db.write();
  return ok(res, tx, 'Setoran berhasil dicatat.', 201);
});

/**
 * GET /api/savings/balance/:memberId
 */
router.get('/balance/:memberId', verifyToken, async (req, res) => {
  await db.read();
  const { memberId } = req.params;
  if (req.user.role === 'anggota' && req.user.memberId !== memberId) {
    return fail(res, 'Akses ditolak.', 403);
  }
  const balances = {};
  for (const jenis of JENIS_VALID) balances[jenis] = computeSaldo(memberId, jenis);
  balances.total = Object.values(balances).reduce((a, b) => a + b, 0);
  return ok(res, balances);
});

/**
 * GET /api/savings/history/:memberId
 * Riwayat mutasi transaksi simpanan (transparansi rekening anggota)
 */
router.get('/history/:memberId', verifyToken, async (req, res) => {
  await db.read();
  const { memberId } = req.params;
  if (req.user.role === 'anggota' && req.user.memberId !== memberId) {
    return fail(res, 'Akses ditolak.', 403);
  }
  const { jenis, page, limit } = req.query;
  let list = db.data.savingsTransactions.filter((t) => t.memberId === memberId);
  if (jenis) list = list.filter((t) => t.jenis === jenis);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

/**
 * POST /api/savings/shu  (pengurus) - Catat pembagian Sisa Hasil Usaha per anggota per tahun
 * body: { memberId, tahun, jumlah, keterangan }
 */
router.post('/shu', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const { memberId, tahun, jumlah, keterangan } = req.body;
  if (!memberId || !tahun || !jumlah) return fail(res, 'memberId, tahun, dan jumlah wajib diisi.', 422);
  const record = { id: genId('shu_'), memberId, tahun, jumlah: Number(jumlah), keterangan: keterangan || '', createdAt: nowISO() };
  db.data.shuDistributions.push(record);
  await db.write();
  return ok(res, record, 'Data SHU berhasil dicatat.', 201);
});

/**
 * GET /api/savings/shu/:memberId
 */
router.get('/shu/:memberId', verifyToken, async (req, res) => {
  await db.read();
  const { memberId } = req.params;
  if (req.user.role === 'anggota' && req.user.memberId !== memberId) {
    return fail(res, 'Akses ditolak.', 403);
  }
  const list = db.data.shuDistributions.filter((s) => s.memberId === memberId).sort((a, b) => b.tahun - a.tahun);
  return ok(res, list);
});

export default router;
