import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { MulterAzureStorage } from 'multer-azure-blob-storage';
import config from '../config/config.js';

// 로컬 저장소 폴더 생성
const ensureLocalDir = (): void => {
  const dir = path.join(process.cwd(), config.storage.localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// 파일명 생성: timestamp + 확장자
const generateFilename = (file: Express.Multer.File): string => {
  const ext = path.extname(file.originalname);
  return `${Date.now()}${ext}`;
};

// Azure Blob Storage
const createAzureStorage = () => {
  return new MulterAzureStorage({
    connectionString: config.azure.connectionString,
    containerName: config.azure.containerName,
    blobName: (_req, file) => Promise.resolve(generateFilename(file)),
    containerAccessLevel: 'blob',
  });
};

// Local Disk Storage
const createLocalStorage = () => {
  ensureLocalDir();
  return multer.diskStorage({
    destination: (_req, _file, cb) => {
      cb(null, config.storage.localPath);
    },
    filename: (_req, file, cb) => {
      cb(null, generateFilename(file));
    },
  });
};

const storage = config.storage.type === 'azure'
  ? createAzureStorage()
  : createLocalStorage();

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
});

export default upload;
