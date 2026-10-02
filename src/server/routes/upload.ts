import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { config } from '../config.js';

const router = Router();

// Ensure upload directory exists
const uploadDir = path.resolve(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Multer storage engine
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadDir);
  },
  filename: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanBase = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    const uniqueSuffix = `${Date.now()}_${Math.round(Math.random() * 1e9)}`;
    cb(null, `${cleanBase}_${uniqueSuffix}${ext}`);
  }
});

// File filter for images only
const fileFilter = (_req: Request, file: Express.Multer.File, cb: multer.FileFilterCallback) => {
  const allowedMimeTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/jpg'];
  if (allowedMimeTypes.includes(file.mimetype.toLowerCase())) {
    cb(null, true);
  } else {
    cb(new Error('INVALID_FILE_TYPE: Only JPEG, PNG, WEBP, and HEIC images are allowed.'));
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: config.MAX_UPLOAD_SIZE_MB * 1024 * 1024, // 5MB
    files: 5 // max 5 images per request
  }
});

// Public image upload endpoint
router.post('/', (req: Request, res: Response) => {
  upload.array('images', 5)(req, res, (err: any) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'FILE_TOO_LARGE', message: `File size exceeds the ${config.MAX_UPLOAD_SIZE_MB}MB limit.` });
      }
      return res.status(400).json({ error: 'UPLOAD_ERROR', message: err.message });
    } else if (err) {
      return res.status(400).json({ error: 'INVALID_FILE', message: err.message });
    }

    const files = (req.files as Express.Multer.File[]) || [];
    if (files.length === 0) {
      return res.status(400).json({ error: 'NO_FILES', message: 'No image files provided.' });
    }

    const uploaded = files.map(f => ({
      originalName: f.originalname,
      filename: f.filename,
      sizeBytes: f.size,
      mimeType: f.mimetype,
      url: `/uploads/${f.filename}`
    }));

    return res.json({ success: true, files: uploaded });
  });
});

export default router;
