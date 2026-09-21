import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

function getOrCreateWallet(memberId) {
  let wallet = db.data.wallets.find((w) => w.memberId === memberId);
  if (!wallet) {
    wallet = { id: genId('wlt_'), memberId, saldo: 0 };
    db.data.wallets.push(wallet);
  }
  return wallet;
}

function resolveMemberId(req) {
  return req.user.role === 'anggota' ? req.user.memberId : req.body.memberId || req.params.memberId;
}

/**
 * GET /api/wallet/:memberId/balance
 */
router.get('/:memberId/balance', verifyToken, async (req, res) => {
  await db.read();
  if (req.user.role === 'anggota' && req.user.memberId !== req.params.memberId) return fail(res, 'Akses ditolak.', 403);
  const wallet = getOrCreateWallet(req.params.memberId);
  await db.write();
  return ok(res, wallet);
});

/**
 * GET /api/wallet/:memberId/history
 */
router.get('/:memberId/history', verifyToken, async (req, res) => {
  await db.read();
  if (req.user.role === 'anggota' && req.user.memberId !== req.params.memberId) return fail(res, 'Akses ditolak.', 403);
  const { page, limit } = req.query;
  const list = db.data.walletTransactions
    .filter((t) => t.memberId === req.params.memberId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

/**
 * POST /api/wallet/topup  (pengurus/kasir mencatat top up tunai, atau simulasi payment gateway)
 * body: { memberId, jumlah, metode, keterangan }
 */
router.post('/topup', verifyToken, async (req, res) => {
  await db.read();
  const memberId = resolveMemberId(req);
  const { jumlah, metode, keterangan } = req.body;
  if (!memberId) return fail(res, 'memberId wajib diisi.', 422);
  if (!jumlah || jumlah <= 0) return fail(res, 'jumlah harus lebih besar dari 0.', 422);

  const wallet = getOrCreateWallet(memberId);
  wallet.saldo += Number(jumlah);
  const tx = {
    id: genId('wtx_'),
    memberId,
    tipe: 'topup',
    jumlah: Number(jumlah),
    saldoSetelah: wallet.saldo,
    keterangan: keterangan || `Top up via ${metode || 'tunai'}`,
    refId: null,
    createdAt: nowISO(),
  };
  db.data.walletTransactions.push(tx);
  await db.write();
  return ok(res, { wallet, transaction: tx }, 'Top up berhasil.', 201);
});

/**
 * POST /api/wallet/transfer  - Transfer saldo antar anggota
 * body: { toMemberId, jumlah, keterangan }
 */
router.post('/transfer', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const fromMemberId = req.user.memberId;
  const { toMemberId, jumlah, keterangan } = req.body;
  if (!toMemberId || !jumlah || jumlah <= 0) return fail(res, 'toMemberId dan jumlah (>0) wajib diisi.', 422);
  if (toMemberId === fromMemberId) return fail(res, 'Tidak dapat transfer ke diri sendiri.', 422);

  const fromWallet = getOrCreateWallet(fromMemberId);
  if (fromWallet.saldo < jumlah) return fail(res, 'Saldo tidak mencukupi.', 400);
  const toMember = db.data.members.find((m) => m.id === toMemberId);
  if (!toMember) return fail(res, 'Anggota tujuan tidak ditemukan.', 404);
  const toWallet = getOrCreateWallet(toMemberId);

  fromWallet.saldo -= Number(jumlah);
  toWallet.saldo += Number(jumlah);

  const refId = genId('trf_');
  db.data.walletTransactions.push({
    id: genId('wtx_'), memberId: fromMemberId, tipe: 'transfer_keluar', jumlah: Number(jumlah),
    saldoSetelah: fromWallet.saldo, keterangan: keterangan || `Transfer ke ${toMember.nama}`, refId, createdAt: nowISO(),
  });
  db.data.walletTransactions.push({
    id: genId('wtx_'), memberId: toMemberId, tipe: 'transfer_masuk', jumlah: Number(jumlah),
    saldoSetelah: toWallet.saldo, keterangan: keterangan || `Transfer dari anggota`, refId, createdAt: nowISO(),
  });

  await db.write();
  return ok(res, { fromWallet, toWallet }, 'Transfer berhasil.', 201);
});

/**
 * POST /api/wallet/pay-bill  - Pembayaran tagihan (PLN, PDAM, Pulsa, Internet) - simulasi
 * body: { kategori, nomorPelanggan, jumlah }
 */
router.post('/pay-bill', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const memberId = req.user.memberId;
  const { kategori, nomorPelanggan, jumlah } = req.body;
  const kategoriValid = ['PLN', 'PDAM', 'PULSA', 'INTERNET'];
  if (!kategoriValid.includes(kategori)) return fail(res, `kategori harus salah satu dari: ${kategoriValid.join(', ')}`, 422);
  if (!nomorPelanggan || !jumlah || jumlah <= 0) return fail(res, 'nomorPelanggan dan jumlah (>0) wajib diisi.', 422);

  const wallet = getOrCreateWallet(memberId);
  if (wallet.saldo < jumlah) return fail(res, 'Saldo tidak mencukupi.', 400);

  wallet.saldo -= Number(jumlah);
  const bill = {
    id: genId('bill_'), memberId, kategori, nomorPelanggan, jumlah: Number(jumlah),
    status: 'berhasil', createdAt: nowISO(),
  };
  db.data.billPayments.push(bill);
  db.data.walletTransactions.push({
    id: genId('wtx_'), memberId, tipe: 'bayar_tagihan', jumlah: Number(jumlah),
    saldoSetelah: wallet.saldo, keterangan: `Bayar ${kategori} - ${nomorPelanggan}`, refId: bill.id, createdAt: nowISO(),
  });

  await db.write();
  return ok(res, { bill, wallet }, `Pembayaran ${kategori} berhasil.`, 201);
});

/**
 * POST /api/wallet/qris-pay  - Simulasi pembayaran QRIS (mis. belanja di Mart)
 * body: { jumlah, merchant, keterangan }
 */
router.post('/qris-pay', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const memberId = req.user.memberId;
  const { jumlah, merchant, keterangan } = req.body;
  if (!jumlah || jumlah <= 0) return fail(res, 'jumlah harus lebih besar dari 0.', 422);

  const wallet = getOrCreateWallet(memberId);
  if (wallet.saldo < jumlah) return fail(res, 'Saldo tidak mencukupi.', 400);

  wallet.saldo -= Number(jumlah);
  const tx = {
    id: genId('wtx_'), memberId, tipe: 'qris', jumlah: Number(jumlah),
    saldoSetelah: wallet.saldo, keterangan: keterangan || `Pembayaran QRIS di ${merchant || 'Mart Koperasi'}`,
    refId: null, createdAt: nowISO(),
  };
  db.data.walletTransactions.push(tx);
  await db.write();
  return ok(res, { wallet, transaction: tx }, 'Pembayaran QRIS berhasil.', 201);
});

export default router;
