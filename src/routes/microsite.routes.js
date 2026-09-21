import { Router } from 'express';
import { db } from '../db.js';
import { ok, fail, nowISO } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/microsite/profile  - Publik (tanpa login) - profil legalitas, pengurus, potensi desa, lokasi
 */
router.get('/profile', async (req, res) => {
  await db.read();
  return ok(res, db.data.cooperativeProfile);
});

/**
 * PUT /api/microsite/profile  (pengurus) - Perbarui profil microsite koperasi
 */
router.put('/profile', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const allowed = [
    'nama', 'noSKBadanHukum', 'tanggalBerdiri', 'alamat', 'desa', 'kecamatan',
    'kabupaten', 'provinsi', 'lokasi', 'potensiDesa', 'kontak', 'pengurus', 'unitUsaha',
  ];
  for (const field of allowed) {
    if (req.body[field] !== undefined) db.data.cooperativeProfile[field] = req.body[field];
  }
  db.data.cooperativeProfile.updatedAt = nowISO();
  await db.write();
  return ok(res, db.data.cooperativeProfile, 'Profil microsite koperasi diperbarui.');
});

export default router;
