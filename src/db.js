import { Low } from 'lowdb';
import { JSONFile } from 'lowdb/node';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const file = path.join(dataDir, 'db.json');

export const defaultData = {
  // --- Administrasi & Keanggotaan ---
  users: [], // { id, email, password(hash), role: 'anggota'|'pengurus'|'kasir', memberId?, createdAt }
  members: [], // { id, userId, nama, noKTP, noHp, alamat, status, nomorAnggota, kartuAnggotaId, fotoKTP, verifiedBy, verifiedAt, createdAt }

  // --- Simpan Pinjam ---
  savingsTransactions: [], // { id, memberId, jenis: 'pokok'|'wajib'|'sukarela', tipe:'setor'|'tarik', jumlah, saldoSetelah, keterangan, createdAt }
  loans: [], // { id, memberId, jumlahPengajuan, tenor, tujuan, status, bungaPersen, cicilanPerBulan, sisaPinjaman, approvedBy, approvedAt, rejectReason, createdAt }
  loanPayments: [], // { id, loanId, memberId, jumlah, sisaSebelum, sisaSesudah, createdAt }
  shuDistributions: [], // { id, memberId, tahun, jumlah, keterangan, createdAt }

  // --- Dompet Digital & Pembayaran ---
  wallets: [], // { id, memberId, saldo }
  walletTransactions: [], // { id, memberId, tipe: 'topup'|'transfer_keluar'|'transfer_masuk'|'bayar_tagihan'|'qris'|'pos', jumlah, saldoSetelah, keterangan, refId, createdAt }
  billPayments: [], // { id, memberId, kategori: 'PLN'|'PDAM'|'PULSA'|'INTERNET', nomorPelanggan, jumlah, status, createdAt }

  // --- Mart / POS & Inventori ---
  products: [], // { id, sku, nama, kategori, hargaBeli, hargaJual, stok, satuan, isActive, createdAt }
  stockMovements: [], // { id, productId, tipe: 'masuk'|'keluar'|'penyesuaian', jumlah, stokSesudah, keterangan, createdBy, createdAt }
  posTransactions: [], // { id, kasirId, memberId, items: [{productId, nama, qty, hargaSatuan, subtotal}], total, metodeBayar, createdAt }

  // --- Marketplace Lokal Desa ---
  marketplaceProducts: [], // { id, penjualMemberId, namaProduk, deskripsi, harga, stok, kategori, foto, isActive, createdAt }
  marketplaceOrders: [], // { id, pembeliMemberId, produkId, qty, totalHarga, status, alamatKirim, createdAt }

  // --- Microsite Profil Koperasi ---
  cooperativeProfile: {
    nama: 'Koperasi Desa Merah Putih',
    noSKBadanHukum: '',
    tanggalBerdiri: '',
    alamat: '',
    desa: '',
    kecamatan: '',
    kabupaten: '',
    provinsi: '',
    lokasi: { lat: null, lng: null },
    potensiDesa: '',
    kontak: { telepon: '', email: '', instagram: '' },
    pengurus: [], // { jabatan, nama, foto }
    unitUsaha: [],
    updatedAt: null,
  },

  // --- Pengaduan / Whistleblowing ---
  complaints: [], // { id, memberId, kategori, judul, isi, isAnonim, status, tanggapan, tanggapanOleh, createdAt, updatedAt }

  // --- E-Learning ---
  courses: [], // { id, judul, deskripsi, kategori, konten:[{judul, isi, urutan}], quiz:[{pertanyaan, opsi:[], jawabanBenarIndex}], isActive, createdAt }
  courseEnrollments: [], // { id, courseId, memberId, progress, completedContentIds:[], quizScore, quizPassed, completedAt, createdAt }

  // --- Program Pemerintah ---
  govPrograms: [], // { id, nama, deskripsi, instansi, kategori, syarat, kuota, tenggat, isActive, createdAt }
  govApplications: [], // { id, programId, memberId, status, dokumen, catatan, createdAt, updatedAt }
};

const adapter = new JSONFile(file);
export const db = new Low(adapter, defaultData);

export async function initDB() {
  await db.read();
  db.data ||= structuredClone(defaultData);
  // Ensure all top-level keys exist even if db.json predates a schema change
  for (const key of Object.keys(defaultData)) {
    if (db.data[key] === undefined) db.data[key] = structuredClone(defaultData[key]);
  }
  await db.write();
}
