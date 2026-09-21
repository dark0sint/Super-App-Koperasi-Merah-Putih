import { nanoid } from 'nanoid';

export const genId = (prefix = '') => `${prefix}${nanoid(12)}`;

export const ok = (res, data, message = 'OK', status = 200) =>
  res.status(status).json({ success: true, message, data });

export const fail = (res, message = 'Terjadi kesalahan', status = 400, errors = null) =>
  res.status(status).json({ success: false, message, errors });

export const nowISO = () => new Date().toISOString();

export const paginate = (array, page = 1, limit = 20) => {
  const p = Math.max(parseInt(page) || 1, 1);
  const l = Math.max(parseInt(limit) || 20, 1);
  const start = (p - 1) * l;
  const items = array.slice(start, start + l);
  return {
    items,
    pagination: { page: p, limit: l, total: array.length, totalPages: Math.ceil(array.length / l) || 1 },
  };
};

export const generateNomorAnggota = (sequenceNumber) => {
  const year = new Date().getFullYear();
  return `KMP-${year}-${String(sequenceNumber).padStart(5, '0')}`;
};
