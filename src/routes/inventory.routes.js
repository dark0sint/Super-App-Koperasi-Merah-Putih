import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();
const LOW_STOCK_THRESHOLD = Number(process.env.LOW_STOCK_THRESHOLD) || 10;

/**
 * POST /api/inventory/movement  (pengurus) - Catat stok masuk / keluar / penyesuaian gudang
 * body: { productId, tipe: 'masuk'|'keluar'|'penyesuaian', jumlah, keterangan }
 */
router.post('/movement', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const { productId, tipe, jumlah, keterangan } = req.body;
  const tipeValid = ['masuk', 'keluar', 'penyesuaian'];
  if (!tipeValid.includes(tipe)) return fail(res, `tipe harus salah satu dari: ${tipeValid.join(', ')}`, 422);
  if (!jumlah || jumlah <= 0) return fail(res, 'jumlah harus lebih besar dari 0.', 422);

  const product = db.data.products.find((p) => p.id === productId);
  if (!product) return fail(res, 'Produk tidak ditemukan.', 404);

  if (tipe === 'masuk') product.stok += Number(jumlah);
  else if (tipe === 'keluar') {
    if (product.stok < jumlah) return fail(res, 'Stok tidak mencukupi untuk dikeluarkan.', 400);
    product.stok -= Number(jumlah);
  } else {
    product.stok = Number(jumlah); // penyesuaian = set langsung ke jumlah hasil stok opname
  }

  const movement = {
    id: genId('stk_'), productId, tipe, jumlah: Number(jumlah), stokSesudah: product.stok,
    keterangan: keterangan || '', createdBy: req.user.id, createdAt: nowISO(),
  };
  db.data.stockMovements.push(movement);
  await db.write();
  return ok(res, { movement, product }, 'Pergerakan stok berhasil dicatat.', 201);
});

/**
 * GET /api/inventory/movements  (pengurus)
 */
router.get('/movements', verifyToken, requireRole('pengurus', 'kasir'), async (req, res) => {
  await db.read();
  const { productId, page, limit } = req.query;
  let list = [...db.data.stockMovements];
  if (productId) list = list.filter((m) => m.productId === productId);
  list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

/**
 * GET /api/inventory/low-stock  (pengurus) - Peringatan stok menipis
 */
router.get('/low-stock', verifyToken, requireRole('pengurus', 'kasir'), async (req, res) => {
  await db.read();
  const threshold = Number(req.query.threshold) || LOW_STOCK_THRESHOLD;
  const list = db.data.products.filter((p) => p.isActive && p.stok <= threshold);
  return ok(res, { threshold, count: list.length, items: list });
});

/**
 * GET /api/inventory/summary  (pengurus) - Ringkasan nilai stok gudang
 */
router.get('/summary', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const products = db.data.products.filter((p) => p.isActive);
  const totalItemStok = products.reduce((a, p) => a + p.stok, 0);
  const nilaiStokBeli = products.reduce((a, p) => a + p.stok * p.hargaBeli, 0);
  const nilaiStokJual = products.reduce((a, p) => a + p.stok * p.hargaJual, 0);
  return ok(res, {
    jumlahProduk: products.length,
    totalItemStok,
    nilaiStokBeli,
    nilaiStokJual,
    potensiKeuntungan: nilaiStokJual - nilaiStokBeli,
  });
});

export default router;
