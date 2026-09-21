import jwt from 'jsonwebtoken';
import { fail } from '../utils/helpers.js';

const SECRET = process.env.JWT_SECRET || 'ganti_dengan_kunci_rahasia_koperasi_merah_putih';

export function signToken(payload) {
  return jwt.sign(payload, SECRET, { expiresIn: process.env.JWT_EXPIRES_IN || '7d' });
}

export function verifyToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return fail(res, 'Token tidak ditemukan. Silakan login.', 401);
  const parts = header.split(' ');
  const token = parts.length === 2 ? parts[1] : parts[0];
  if (!token) return fail(res, 'Format token salah.', 401);
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch (err) {
    return fail(res, 'Token tidak valid atau kedaluwarsa.', 401);
  }
}

export function optionalToken(req, res, next) {
  const header = req.headers['authorization'];
  if (!header) return next();
  const token = header.split(' ')[1] || header;
  try {
    req.user = jwt.verify(token, SECRET);
  } catch (err) {
    // ignore invalid token for optional auth
  }
  next();
}

export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return fail(res, 'Anda tidak memiliki akses untuk aksi ini.', 403);
    }
    next();
  };
}
