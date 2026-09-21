import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import bcrypt from 'bcryptjs';

import { db, initDB } from './db.js';
import { genId, nowISO } from './utils/helpers.js';

import authRoutes from './routes/auth.routes.js';
import membersRoutes from './routes/members.routes.js';
import savingsRoutes from './routes/savings.routes.js';
import loansRoutes from './routes/loans.routes.js';
import walletRoutes from './routes/wallet.routes.js';
import posRoutes from './routes/pos.routes.js';
import inventoryRoutes from './routes/inventory.routes.js';
import marketplaceRoutes from './routes/marketplace.routes.js';
import adminRoutes from './routes/admin.routes.js';
import micrositeRoutes from './routes/microsite.routes.js';
import complaintsRoutes from './routes/complaints.routes.js';
import elearningRoutes from './routes/elearning.routes.js';
import governmentRoutes from './routes/government.routes.js';

const app = express();
const PORT = process.env.PORT || 4000;

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// --- Seed data awal (hanya berjalan sekali saat database masih kosong) ---
async function seedIfEmpty() {
  await db.read();

  if (db.data.users.length === 0) {
    const email = process.env.DEFAULT_ADMIN_EMAIL || 'admin@koperasimerahputih.id';
    const password = process.env.DEFAULT_ADMIN_PASSWORD || 'Admin123!';
    const hashed = await bcrypt.hash(password, 10);
    db.data.users.push({
      id: genId('usr_'), email, password: hashed, role: 'pengurus',
      nama: 'Administrator Koperasi', memberId: null, createdAt: nowISO(),
    });
    console.log(`\n[SEED] Akun pengurus default dibuat -> email: ${email} | password: ${password}\n`);
  }

  if (db.data.cooperativeProfile && !db.data.cooperativeProfile.nama) {
    db.data.cooperativeProfile.nama = process.env.COOP_NAME || 'Koperasi Desa Merah Putih';
  }

  if (db.data.products.length === 0) {
    db.data.products.push(
      { id: genId('prd_'), sku: 'SMB-001', nama: 'Beras 5kg', kategori: 'Sembako', hargaBeli: 55000, hargaJual: 62000, stok: 50, satuan: 'karung', isActive: true, createdAt: nowISO() },
      { id: genId('prd_'), sku: 'SMB-002', nama: 'Minyak Goreng 1L', kategori: 'Sembako', hargaBeli: 15000, hargaJual: 18000, stok: 40, satuan: 'botol', isActive: true, createdAt: nowISO() },
      { id: genId('prd_'), sku: 'APT-001', nama: 'Paracetamol 500mg (strip)', kategori: 'Apotek', hargaBeli: 3000, hargaJual: 5000, stok: 100, satuan: 'strip', isActive: true, createdAt: nowISO() }
    );
  }

  if (db.data.courses.length === 0) {
    db.data.courses.push({
      id: genId('crs_'),
      judul: 'Pengenalan Dasar Perkoperasian',
      deskripsi: 'Memahami prinsip, nilai, dan manfaat koperasi bagi anggota.',
      kategori: 'Literasi Koperasi',
      konten: [
        { id: genId('cnt_'), urutan: 1, judul: 'Apa itu Koperasi?', isi: 'Koperasi adalah badan usaha yang beranggotakan orang-orang berdasarkan asas kekeluargaan.' },
        { id: genId('cnt_'), urutan: 2, judul: 'Prinsip Koperasi', isi: 'Keanggotaan sukarela, pengelolaan demokratis, dan pembagian SHU secara adil.' },
      ],
      quiz: [
        { id: genId('qz_'), pertanyaan: 'Koperasi berasaskan pada?', opsi: ['Kekeluargaan', 'Persaingan bebas', 'Monopoli'], jawabanBenarIndex: 0 },
      ],
      isActive: true,
      createdAt: nowISO(),
    });
  }

  if (db.data.govPrograms.length === 0) {
    db.data.govPrograms.push({
      id: genId('gov_'),
      nama: 'Bantuan Permodalan UMKM Desa',
      deskripsi: 'Program penyaluran modal usaha bagi anggota koperasi pelaku UMKM.',
      instansi: 'Kementerian Koperasi dan UKM',
      kategori: 'Permodalan',
      syarat: ['Anggota aktif koperasi', 'Memiliki usaha berjalan minimal 6 bulan'],
      kuota: 50,
      tenggat: null,
      isActive: true,
      createdAt: nowISO(),
    });
  }

  await db.write();
}

// --- Routes ---
app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'Super App Koperasi Merah Putih - API siap digunakan.',
    version: '1.0.0',
    docs: '/api/health',
  });
});

app.get('/api/health', (req, res) => {
  res.json({ success: true, message: 'API sehat', time: nowISO() });
});

app.use('/api/auth', authRoutes);
app.use('/api/members', membersRoutes);
app.use('/api/savings', savingsRoutes);
app.use('/api/loans', loansRoutes);
app.use('/api/wallet', walletRoutes);
app.use('/api/pos', posRoutes);
app.use('/api/inventory', inventoryRoutes);
app.use('/api/marketplace', marketplaceRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/microsite', micrositeRoutes);
app.use('/api/complaints', complaintsRoutes);
app.use('/api/elearning', elearningRoutes);
app.use('/api/government', governmentRoutes);

// 404 handler
app.use((req, res) => {
  res.status(404).json({ success: false, message: `Endpoint ${req.method} ${req.originalUrl} tidak ditemukan.` });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ success: false, message: 'Terjadi kesalahan pada server.', error: err.message });
});

async function start() {
  await initDB();
  await seedIfEmpty();
  app.listen(PORT, () => {
    console.log(`\n🚀 Super App Koperasi Merah Putih API berjalan di http://localhost:${PORT}`);
    console.log(`   Cek status: GET http://localhost:${PORT}/api/health\n`);
  });
}

start();
