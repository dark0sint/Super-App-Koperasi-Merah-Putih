import { Router } from 'express';
import { db } from '../db.js';
import { genId, ok, fail, nowISO } from '../utils/helpers.js';
import { verifyToken, requireRole } from '../middleware/auth.js';

const router = Router();

/**
 * GET /api/elearning/courses  - Daftar kelas literasi koperasi, bisnis UMKM, dsb.
 */
router.get('/courses', verifyToken, async (req, res) => {
  await db.read();
  const list = db.data.courses.filter((c) => c.isActive);
  // Sembunyikan jawaban benar quiz dari listing publik
  const sanitized = list.map((c) => ({
    ...c,
    quiz: c.quiz.map(({ pertanyaan, opsi }) => ({ pertanyaan, opsi })),
  }));
  return ok(res, sanitized);
});

/**
 * POST /api/elearning/courses  (pengurus) - Tambah materi/kelas baru
 * body: { judul, deskripsi, kategori, konten: [{judul, isi}], quiz: [{pertanyaan, opsi, jawabanBenarIndex}] }
 */
router.post('/courses', verifyToken, requireRole('pengurus'), async (req, res) => {
  await db.read();
  const { judul, deskripsi, kategori, konten, quiz } = req.body;
  if (!judul) return fail(res, 'judul wajib diisi.', 422);

  const course = {
    id: genId('crs_'),
    judul,
    deskripsi: deskripsi || '',
    kategori: kategori || 'Literasi Koperasi',
    konten: (konten || []).map((k, i) => ({ id: genId('cnt_'), urutan: i + 1, ...k })),
    quiz: (quiz || []).map((q) => ({ id: genId('qz_'), ...q })),
    isActive: true,
    createdAt: nowISO(),
  };
  db.data.courses.push(course);
  await db.write();
  return ok(res, course, 'Kelas berhasil ditambahkan.', 201);
});

/**
 * POST /api/elearning/courses/:id/enroll  (anggota)
 */
router.post('/courses/:id/enroll', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const course = db.data.courses.find((c) => c.id === req.params.id);
  if (!course) return fail(res, 'Kelas tidak ditemukan.', 404);
  let enrollment = db.data.courseEnrollments.find((e) => e.courseId === course.id && e.memberId === req.user.memberId);
  if (enrollment) return ok(res, enrollment, 'Anda sudah terdaftar di kelas ini.');
  enrollment = {
    id: genId('enr_'), courseId: course.id, memberId: req.user.memberId,
    progress: 0, completedContentIds: [], quizScore: null, quizPassed: false,
    completedAt: null, createdAt: nowISO(),
  };
  db.data.courseEnrollments.push(enrollment);
  await db.write();
  return ok(res, enrollment, 'Berhasil mendaftar kelas.', 201);
});

/**
 * POST /api/elearning/courses/:id/progress  (anggota) - Tandai konten selesai dibaca
 * body: { contentId }
 */
router.post('/courses/:id/progress', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const course = db.data.courses.find((c) => c.id === req.params.id);
  if (!course) return fail(res, 'Kelas tidak ditemukan.', 404);
  const enrollment = db.data.courseEnrollments.find((e) => e.courseId === course.id && e.memberId === req.user.memberId);
  if (!enrollment) return fail(res, 'Anda belum terdaftar di kelas ini.', 403);

  const { contentId } = req.body;
  if (contentId && !enrollment.completedContentIds.includes(contentId)) {
    enrollment.completedContentIds.push(contentId);
  }
  enrollment.progress = course.konten.length
    ? Math.round((enrollment.completedContentIds.length / course.konten.length) * 100)
    : 0;
  await db.write();
  return ok(res, enrollment, 'Progres pembelajaran diperbarui.');
});

/**
 * POST /api/elearning/courses/:id/quiz  (anggota) - Kumpulkan jawaban kuis edukatif
 * body: { answers: [indexJawabanPerNomor] }
 */
router.post('/courses/:id/quiz', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const course = db.data.courses.find((c) => c.id === req.params.id);
  if (!course) return fail(res, 'Kelas tidak ditemukan.', 404);
  const enrollment = db.data.courseEnrollments.find((e) => e.courseId === course.id && e.memberId === req.user.memberId);
  if (!enrollment) return fail(res, 'Anda belum terdaftar di kelas ini.', 403);
  if (!course.quiz.length) return fail(res, 'Kelas ini tidak memiliki kuis.', 400);

  const { answers } = req.body;
  if (!Array.isArray(answers) || answers.length !== course.quiz.length) {
    return fail(res, `answers harus berupa array sepanjang ${course.quiz.length}.`, 422);
  }

  let benar = 0;
  course.quiz.forEach((q, i) => {
    if (answers[i] === q.jawabanBenarIndex) benar += 1;
  });
  const score = Math.round((benar / course.quiz.length) * 100);
  enrollment.quizScore = score;
  enrollment.quizPassed = score >= 70;
  if (enrollment.quizPassed) enrollment.completedAt = nowISO();
  await db.write();
  return ok(res, { score, benar, total: course.quiz.length, lulus: enrollment.quizPassed }, 'Kuis selesai dinilai.');
});

/**
 * GET /api/elearning/my-progress  (anggota)
 */
router.get('/my-progress', verifyToken, requireRole('anggota'), async (req, res) => {
  await db.read();
  const list = db.data.courseEnrollments.filter((e) => e.memberId === req.user.memberId);
  return ok(res, list);
});

export default router;
