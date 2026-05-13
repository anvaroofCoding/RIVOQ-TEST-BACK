import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import multer from 'multer';
import StatusCodes from 'http-status-codes';
import AppError from '../utils/AppError.js';

/** `public/uploads/profile-avatars` ostida User.avatar relative URL lar */
export const profileAvatarAbsoluteDir = path.join(process.cwd(), 'public', 'uploads', 'profile-avatars');

const storage = multer.diskStorage({
  destination: async (_req, _file, cb) => {
    await fs.mkdir(profileAvatarAbsoluteDir, { recursive: true });
    cb(null, profileAvatarAbsoluteDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase();
    const allowed = ['.jpg', '.jpeg', '.png', '.webp', '.gif'];
    const safe = allowed.includes(ext) ? ext : '.jpg';
    const name = `${req.user._id}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${safe}`;
    cb(null, name);
  },
});

function fileFilter(_req, file, cb) {
  if (/^image\/(jpeg|pjpeg|png|webp|gif)$/i.test(file.mimetype)) {
    return cb(null, true);
  }
  cb(new AppError('Faqat JPEG, PNG, WebP yoki GIF yuklang.', StatusCodes.BAD_REQUEST));
}

export const profileAvatarUpload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter,
});
