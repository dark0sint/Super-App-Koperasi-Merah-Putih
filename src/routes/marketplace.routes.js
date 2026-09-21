import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/marketplace/products  - Jelajahi produk UMKM desa (publik untuk anggota login)
 */
router.get('/products', verifyToken, async (req, res) => {
  await db.read();
  const { q, kategori, page, limit } = req.query;
  let list = db.data.marketplaceProducts.filter((p) => p.isActive);
  if (q) list = list.filter((p) => p.namaProduk.toLowerCase().includes(q.toLowerCase()));
  if (kategori) list = list.filter((p) => p.kategori === kategori);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

/**
 * POST /api/marketplace/products  (anggota) - Anggota/UMKM memasarkan produk asli desa
 * body: { namaProduk, deskripsi, harga, stok, kategori, foto }
 */
router.post('/products', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const { namaProduk, deskripsi, harga, stok, kategori, foto } = req.body;
  if (!namaProduk || harga === undefined) return fail(res, 'namaProduk dan harga wajib diisi.', 422);

  const product = {
    id: genId('mkt_'), penjualMemberId: req.user.memberId, namaProduk,
    deskripsi: deskripsi || '', harga: Number(harga), stok: Number(stok) || 0,
    kategori: kategori || 'Umum', foto: foto || null, isActive: true, createdAt: nowISO(),
  };
  db.data.marketplaceProducts.push(product);
  await db.write();
  return ok(res, product, 'Produk berhasil dipasarkan di Marketplace Desa.', 201);
});

/**
 * PATCH /api/marketplace/products/:id  (pemilik produk)
 */
router.patch('/products/:id', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const product = db.data.marketplaceProducts.find((p) => p.id === req.params.id);
  if (!product) return fail(res, 'Produk tidak ditemukan.', 404);
  if (product.penjualMemberId !== req.user.memberId) return fail(res, 'Anda bukan pemilik produk ini.', 403);
  const editable = ['namaProduk', 'deskripsi', 'harga', 'stok', 'kategori', 'foto', 'isActive'];
  for (const f of editable) if (req.body[f] !== undefined) product[f] = req.body[f];
  await db.write();
  return ok(res, product, 'Produk diperbarui.');
});

/**
 * GET /api/marketplace/my-products  (anggota)
 */
router.get('/my-products', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const list = db.data.marketplaceProducts.filter((p) => p.penjualMemberId === req.user.memberId);
  return ok(res, list);
});

/**
 * POST /api/marketplace/orders  (anggota) - Pesan produk UMKM
 * body: { produkId, qty, alamatKirim }
 */
router.post('/orders', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const { produkId, qty, alamatKirim } = req.body;
  const product = db.data.marketplaceProducts.find((p) => p.id === produkId && p.isActive);
  if (!product) return fail(res, 'Produk tidak ditemukan.', 404);
  if (!qty || qty <= 0) return fail(res, 'qty harus lebih besar dari 0.', 422);
  if (product.stok < qty) return fail(res, 'Stok produk tidak mencukupi.', 400);

  const totalHarga = product.harga * qty;
  const order = {
    id: genId('ord_'), pembeliMemberId: req.user.memberId, produkId,
    qty: Number(qty), totalHarga, status: 'menunggu_konfirmasi',
    alamatKirim: alamatKirim || '', createdAt: nowISO(),
  };
  product.stok -= qty;
  db.data.marketplaceOrders.push(order);
  await db.write();
  return ok(res, order, 'Pesanan berhasil dibuat. Menunggu konfirmasi penjual.', 201);
});

/**
 * GET /api/marketplace/orders  - riwayat pesanan (sebagai pembeli atau penjual)
 */
router.get('/orders', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const asSeller = req.query.role === 'penjual';
  let list;
  if (asSeller) {
    const myProductIds = db.data.marketplaceProducts.filter((p) => p.penjualMemberId === req.user.memberId).map((p) => p.id);
    list = db.data.marketplaceOrders.filter((o) => myProductIds.includes(o.produkId));
  } else {
    list = db.data.marketplaceOrders.filter((o) => o.pembeliMemberId === req.user.memberId);
  }
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, list);
});

/**
 * PATCH /api/marketplace/orders/:id/status  (penjual) - update status pesanan
 * body: { status: 'diproses'|'dikirim'|'selesai'|'dibatalkan' }
 */
router.patch('/orders/:id/status', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const order = db.data.marketplaceOrders.find((o) => o.id === req.params.id);
  if (!order) return fail(res, 'Pesanan tidak ditemukan.', 404);
  const product = db.data.marketplaceProducts.find((p) => p.id === order.produkId);
  if (!product || product.penjualMemberId !== req.user.memberId) return fail(res, 'Akses ditolak.', 403);

  const statusValid = ['diproses', 'dikirim', 'selesai', 'dibatalkan'];
  if (!statusValid.includes(req.body.status)) return fail(res, `status harus salah satu dari: ${statusValid.join(', ')}`, 422);

  if (req.body.status === 'dibatalkan') product.stok += order.qty; // kembalikan stok
  order.status = req.body.status;
  await db.write();
  return ok(res, order, 'Status pesanan diperbarui.');
});

export default router;
