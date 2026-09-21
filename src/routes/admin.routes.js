import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db } from '../db.js';
import { genId, ok, fail, nowISO } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/admin/dashboard - Ringkasan utama untuk pengurus
 */
router.get('/dashboard', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const totalAnggota = db.data.members.length;
  const anggotaTerverifikasi = db.data.members.filter((m) => m.status === 'terverifikasi').length;
  const anggotaMenunggu = db.data.members.filter((m) => m.status === 'menunggu_verifikasi').length;

  const totalSimpanan = db.data.savingsTransactions.reduce(
    (a, t) => a + (t.tipe === 'setor' ? t.jumlah : -t.jumlah), 0
  );
  const totalPinjamanAktif = db.data.loans
    .filter((l) => l.status === 'disetujui')
    .reduce((a, l) => a + (l.sisaPinjaman || 0), 0);
  const pinjamanMenunggu = db.data.loans.filter((l) => l.status === 'diajukan').length;

  const omzetPOS = db.data.posTransactions.reduce((a, t) => a + t.total, 0);
  const totalStokNilaiJual = db.data.products.reduce((a, p) => a + p.stok * p.hargaJual, 0);

  const pengaduanBaru = db.data.complaints.filter((c) => c.status === 'baru').length;
  const totalKursus = db.data.courses.length;

  return ok(res, {
    keanggotaan: { totalAnggota, anggotaTerverifikasi, anggotaMenunggu },
    keuangan: { totalSimpanan, totalPinjamanAktif, pinjamanMenunggu },
    mart: { omzetPOS, totalStokNilaiJual },
    layanan: { pengaduanBaru, totalKursus },
  });
});

/**
 * GET /api/admin/reports/neraca - Neraca sederhana (aset vs kewajiban+ekuitas)
 */
router.get('/reports/neraca', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const kasWallet = db.data.wallets.reduce((a, w) => a + w.saldo, 0);
  const piutangPinjaman = db.data.loans.filter((l) => l.status === 'disetujui').reduce((a, l) => a + l.sisaPinjaman, 0);
  const nilaiPersediaan = db.data.products.reduce((a, p) => a + p.stok * p.hargaBeli, 0);
  const totalAset = kasWallet + piutangPinjaman + nilaiPersediaan;

  const simpananAnggota = db.data.savingsTransactions.reduce(
    (a, t) => a + (t.tipe === 'setor' ? t.jumlah : -t.jumlah), 0
  );

  return ok(res, {
    aset: { kasDompetDigital: kasWallet, piutangPinjamanAnggota: piutangPinjaman, nilaiPersediaanMart: nilaiPersediaan, totalAset },
    kewajibanEkuitas: { simpananAnggota, catatan: 'Simpanan anggota dicatat sebagai kewajiban/ekuitas koperasi kepada anggota.' },
    generatedAt: nowISO(),
  });
});

/**
 * GET /api/admin/reports/laba-rugi - Laporan laba rugi sederhana dari unit Mart & bunga pinjaman
 */
router.get('/reports/laba-rugi', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  let pendapatanPOS = 0;
  let hppPOS = 0;
  for (const trx of db.data.posTransactions) {
    for (const item of trx.items) {
      pendapatanPOS += item.subtotal;
      const product = db.data.products.find((p) => p.id === item.productId);
      if (product) hppPOS += product.hargaBeli * item.qty;
    }
  }
  const labaKotorPOS = pendapatanPOS - hppPOS;

  const pendapatanBungaPinjaman = db.data.loans
    .filter((l) => l.bungaPersen)
    .reduce((a, l) => a + (l.sisaPinjaman !== null ? (l.cicilanPerBulan * l.tenor - l.jumlahPengajuan) : 0), 0);

  return ok(res, {
    pendapatan: { unitMart: pendapatanPOS, bungaPinjaman: Math.max(0, pendapatanBungaPinjaman) },
    hargaPokokPenjualan: hppPOS,
    labaKotorMart: labaKotorPOS,
    estimasiLabaBersih: labaKotorPOS + Math.max(0, pendapatanBungaPinjaman),
    generatedAt: nowISO(),
  });
});

/**
 * GET /api/admin/reports/arus-kas - Arus kas dari mutasi dompet digital
 */
router.get('/reports/arus-kas', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const masuk = ['topup', 'transfer_masuk', 'pencairan_pinjaman'];
  const keluar = ['transfer_keluar', 'bayar_tagihan', 'qris', 'pos', 'cicilan_pinjaman'];
  const kasMasuk = db.data.walletTransactions.filter((t) => masuk.includes(t.tipe)).reduce((a, t) => a + t.jumlah, 0);
  const kasKeluar = db.data.walletTransactions.filter((t) => keluar.includes(t.tipe)).reduce((a, t) => a + t.jumlah, 0);
  return ok(res, { kasMasuk, kasKeluar, kasBersih: kasMasuk - kasKeluar, generatedAt: nowISO() });
});

/**
 * POST /api/admin/staff  (pengurus) - Buat akun staf baru (kasir/pengurus)
 * body: { email, password, role: 'kasir'|'pengurus', nama }
 */
router.post('/staff', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const { email, password, role, nama } = req.body;
  if (!email || !password || !['kasir', 'pengurus'].includes(role)) {
    return fail(res, 'email, password, dan role (kasir/pengurus) wajib diisi.', 422);
  }
  if (db.data.users.find((u) => u.email.toLowerCase() === email.toLowerCase())) {
    return fail(res, 'Email sudah digunakan.', 409);
  }
  const hashed = await bcrypt.hash(password, 10);
  const user = { id: genId('usr_'), email, password: hashed, role, nama: nama || email, memberId: null, createdAt: nowISO() };
  db.data.users.push(user);
  await db.write();
  return ok(res, { id: user.id, email: user.email, role: user.role }, 'Akun staf berhasil dibuat.', 201);
});

export default router;
