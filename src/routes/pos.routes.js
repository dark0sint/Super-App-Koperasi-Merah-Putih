import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO, paginate } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/pos/products  - Daftar produk untuk kasir (sembako, apotek, dll)
 */
router.get('/products', verifyToken, async (req, res) => {
  await db.read();
  const { q, kategori, page, limit } = req.query;
  let list = db.data.products.filter((p) => p.isActive);
  if (q) list = list.filter((p) => p.nama.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()));
  if (kategori) list = list.filter((p) => p.kategori === kategori);
  return ok(res, paginate(list, page, limit));
});

/**
 * POST /api/pos/products  (pengurus) - Tambah produk baru
 */
router.post('/products', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const { sku, nama, kategori, hargaBeli, hargaJual, stok, satuan } = req.body;
  if (!sku || !nama || hargaJual === undefined) return fail(res, 'sku, nama, dan hargaJual wajib diisi.', 422);
  if (db.data.products.find((p) => p.sku === sku)) return fail(res, 'SKU sudah digunakan.', 409);

  const product = {
    id: genId('prd_'), sku, nama, kategori: kategori || 'Sembako',
    hargaBeli: Number(hargaBeli) || 0, hargaJual: Number(hargaJual),
    stok: Number(stok) || 0, satuan: satuan || 'pcs', isActive: true, createdAt: nowISO(),
  };
  db.data.products.push(product);
  if (product.stok > 0) {
    db.data.stockMovements.push({
      id: genId('stk_'), productId: product.id, tipe: 'masuk', jumlah: product.stok,
      stokSesudah: product.stok, keterangan: 'Stok awal produk', createdBy: req.user.id, createdAt: nowISO(),
    });
  }
  await db.write();
  return ok(res, product, 'Produk berhasil ditambahkan.', 201);
});

/**
 * PATCH /api/pos/products/:id  (pengurus)
 */
router.patch('/products/:id', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const product = db.data.products.find((p) => p.id === req.params.id);
  if (!product) return fail(res, 'Produk tidak ditemukan.', 404);
  const editable = ['nama', 'kategori', 'hargaBeli', 'hargaJual', 'satuan', 'isActive'];
  for (const f of editable) if (req.body[f] !== undefined) product[f] = req.body[f];
  await db.write();
  return ok(res, product, 'Produk diperbarui.');
});

/**
 * POST /api/pos/checkout  (kasir/pengurus) - Transaksi kasir
 * body: { items: [{ productId, qty }], metodeBayar: 'tunai'|'qris'|'saldo', memberId? }
 */
router.post('/checkout', verifyToken, requireRole('kasir', 'pengurus'), async (req, res) => {
  await db.read();
  const { items, metodeBayar, memberId } = req.body;
  if (!Array.isArray(items) || items.length === 0) return fail(res, 'items tidak boleh kosong.', 422);

  const resolvedItems = [];
  let total = 0;
  for (const it of items) {
    const product = db.data.products.find((p) => p.id === it.productId);
    if (!product) return fail(res, `Produk ${it.productId} tidak ditemukan.`, 404);
    if (product.stok < it.qty) return fail(res, `Stok ${product.nama} tidak mencukupi (sisa ${product.stok}).`, 400);
    const subtotal = product.hargaJual * it.qty;
    resolvedItems.push({ productId: product.id, nama: product.nama, qty: it.qty, hargaSatuan: product.hargaJual, subtotal });
    total += subtotal;
  }

  // Jika bayar pakai saldo dompet digital anggota
  if (metodeBayar === 'saldo') {
    if (!memberId) return fail(res, 'memberId wajib diisi untuk pembayaran via saldo.', 422);
    const wallet = db.data.wallets.find((w) => w.memberId === memberId);
    if (!wallet || wallet.saldo < total) return fail(res, 'Saldo dompet digital anggota tidak mencukupi.', 400);
    wallet.saldo -= total;
    db.data.walletTransactions.push({
      id: genId('wtx_'), memberId, tipe: 'pos', jumlah: total, saldoSetelah: wallet.saldo,
      keterangan: 'Belanja di Mart Koperasi', refId: null, createdAt: nowISO(),
    });
  }

  // Kurangi stok & catat pergerakan
  for (const it of resolvedItems) {
    const product = db.data.products.find((p) => p.id === it.productId);
    product.stok -= it.qty;
    db.data.stockMovements.push({
      id: genId('stk_'), productId: product.id, tipe: 'keluar', jumlah: it.qty,
      stokSesudah: product.stok, keterangan: 'Penjualan POS', createdBy: req.user.id, createdAt: nowISO(),
    });
  }

  const transaction = {
    id: genId('pos_'), kasirId: req.user.id, memberId: memberId || null,
    items: resolvedItems, total, metodeBayar: metodeBayar || 'tunai', createdAt: nowISO(),
  };
  db.data.posTransactions.push(transaction);
  await db.write();
  return ok(res, transaction, 'Transaksi berhasil.', 201);
});

/**
 * GET /api/pos/transactions  (pengurus/kasir) - Riwayat transaksi kasir
 */
router.get('/transactions', verifyToken, requireRole('kasir', 'pengurus'), async (req, res) => {
  await db.read();
  const { page, limit } = req.query;
  const list = [...db.data.posTransactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return ok(res, paginate(list, page, limit));
});

export default router;
