import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();
const DEFAULT_BUNGA_PERSEN = 1.5; // per bulan, flat - dapat disesuaikan pengurus saat approve

/**
 * POST /api/loans/apply
 * Pengajuan pinjaman oleh anggota
 * body: { jumlahPengajuan, tenor (bulan), tujuan }
 */
router.post('/apply', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const { jumlahPengajuan, tenor, tujuan } = req.body;
  if (!jumlahPengajuan || jumlahPengajuan <= 0) return fail(res, 'jumlahPengajuan harus lebih besar dari 0.', 422);
  if (!tenor || tenor <= 0) return fail(res, 'tenor (jumlah bulan) wajib diisi.', 422);

  const member = db.data.members.find((m) => m.id === req.user.memberId);
  if (!member || member.status !== 'terverifikasi') {
    return fail(res, 'Hanya anggota terverifikasi yang dapat mengajukan pinjaman.', 403);
  }

  // Cek apakah masih ada pinjaman aktif yang belum lunas
  const activeLoan = db.data.loans.find((l) => l.memberId === member.id && ['diajukan', 'disetujui'].includes(l.status));
  if (activeLoan) return fail(res, 'Anda masih memiliki pinjaman aktif/menunggu persetujuan.', 409);

  const loan = {
    id: genId('loan_'),
    memberId: member.id,
    jumlahPengajuan: Number(jumlahPengajuan),
    tenor: Number(tenor),
    tujuan: tujuan || '',
    status: 'diajukan', // diajukan | disetujui | ditolak | lunas
    bungaPersen: null,
    cicilanPerBulan: null,
    sisaPinjaman: null,
    approvedBy: null,
    approvedAt: null,
    rejectReason: null,
    createdAt: nowISO(),
  };
  db.data.loans.push(loan);
  await db.write();
  return ok(res, loan, 'Pengajuan pinjaman berhasil dikirim. Menunggu persetujuan pengurus.', 201);
});

/**
 * GET /api/loans  (pengurus - lihat semua; anggota - lihat milik sendiri)
 */
router.get('/', verifyToken, async (req, res) => {
  await db.read();
  const { status, page, limit } = req.query;
  let list =
    req.user.role === 'anggota'
      ? db.data.loans.filter((l) => l.memberId === req.user.memberId)
      : [...db.data.loans];
  if (status) list = list.filter((l) => l.status === status);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

/**
 * GET /api/loans/:id
 */
router.get('/:id', verifyToken, async (req, res) => {
  await db.read();
  const loan = db.data.loans.find((l) => l.id === req.params.id);
  if (!loan) return fail(res, 'Data pinjaman tidak ditemukan.', 404);
  if (req.user.role === 'anggota' && loan.memberId !== req.user.memberId) return fail(res, 'Akses ditolak.', 403);
  const payments = db.data.loanPayments.filter((p) => p.loanId === loan.id);
  return ok(res, { ...loan, payments });
});

/**
 * POST /api/loans/:id/decision  (pengurus) - proses persetujuan cepat
 * body: { approve: boolean, bungaPersen?, reason? }
 */
router.post('/:id/decision', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const loan = db.data.loans.find((l) => l.id === req.params.id);
  if (!loan) return fail(res, 'Data pinjaman tidak ditemukan.', 404);
  if (loan.status !== 'diajukan') return fail(res, 'Pinjaman ini sudah diproses sebelumnya.', 409);

  const { approve, bungaPersen, reason } = req.body;
  if (approve) {
    const bunga = bungaPersen !== undefined ? Number(bungaPersen) : DEFAULT_BUNGA_PERSEN;
    const totalBunga = loan.jumlahPengajuan * (bunga / 100) * loan.tenor;
    const totalBayar = loan.jumlahPengajuan + totalBunga;
    loan.status = 'disetujui';
    loan.bungaPersen = bunga;
    loan.cicilanPerBulan = Math.ceil(totalBayar / loan.tenor);
    loan.sisaPinjaman = totalBayar;
    loan.approvedBy = req.user.id;
    loan.approvedAt = nowISO();

    // Pencairan dana otomatis ke dompet digital anggota
    const wallet = db.data.wallets.find((w) => w.memberId === loan.memberId);
    if (wallet) {
      wallet.saldo += loan.jumlahPengajuan;
      db.data.walletTransactions.push({
        id: genId('wtx_'),
        memberId: loan.memberId,
        tipe: 'pencairan_pinjaman',
        jumlah: loan.jumlahPengajuan,
        saldoSetelah: wallet.saldo,
        keterangan: `Pencairan pinjaman #${loan.id}`,
        refId: loan.id,
        createdAt: nowISO(),
      });
    }
  } else {
    loan.status = 'ditolak';
    loan.rejectReason = reason || 'Tidak memenuhi kriteria kelayakan.';
    loan.approvedBy = req.user.id;
    loan.approvedAt = nowISO();
  }
  await db.write();
  return ok(res, loan, approve ? 'Pinjaman disetujui dan dana dicairkan ke dompet digital anggota.' : 'Pinjaman ditolak.');
});

/**
 * POST /api/loans/:id/pay  - Pembayaran cicilan (dipotong dari dompet digital)
 * body: { jumlah }
 */
router.post('/:id/pay', verifyToken, async (req, res) => {
  await db.read();
  const loan = db.data.loans.find((l) => l.id === req.params.id);
  if (!loan) return fail(res, 'Data pinjaman tidak ditemukan.', 404);
  if (req.user.role === 'anggota' && loan.memberId !== req.user.memberId) return fail(res, 'Akses ditolak.', 403);
  if (loan.status !== 'disetujui') return fail(res, 'Pinjaman ini tidak dalam status aktif.', 409);

  const { jumlah } = req.body;
  if (!jumlah || jumlah <= 0) return fail(res, 'jumlah pembayaran harus lebih besar dari 0.', 422);

  const wallet = db.data.wallets.find((w) => w.memberId === loan.memberId);
  if (!wallet || wallet.saldo < jumlah) return fail(res, 'Saldo dompet digital tidak mencukupi.', 400);

  const sisaSebelum = loan.sisaPinjaman;
  const jumlahBayar = Math.min(Number(jumlah), sisaSebelum);
  loan.sisaPinjaman = Math.max(0, sisaSebelum - jumlahBayar);

  wallet.saldo -= jumlahBayar;
  db.data.walletTransactions.push({
    id: genId('wtx_'),
    memberId: loan.memberId,
    tipe: 'cicilan_pinjaman',
    jumlah: jumlahBayar,
    saldoSetelah: wallet.saldo,
    keterangan: `Pembayaran cicilan pinjaman #${loan.id}`,
    refId: loan.id,
    createdAt: nowISO(),
  });

  const payment = {
    id: genId('lp_'),
    loanId: loan.id,
    memberId: loan.memberId,
    jumlah: jumlahBayar,
    sisaSebelum,
    sisaSesudah: loan.sisaPinjaman,
    createdAt: nowISO(),
  };
  db.data.loanPayments.push(payment);

  if (loan.sisaPinjaman === 0) loan.status = 'lunas';

  await db.write();
  return ok(res, { loan, payment }, loan.status === 'lunas' ? 'Cicilan dibayar. Pinjaman telah lunas!' : 'Cicilan berhasil dibayar.');
});

export default router;
