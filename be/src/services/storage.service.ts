import { BlobServiceClient, ContainerClient } from '@azure/storage-blob';
import fs from 'fs';
import path from 'path';
import config from '../config/config.js';

// Azure Blob Storage
let containerClient: ContainerClient | null = null;

const getContainerClient = (): ContainerClient => {
  if (!containerClient) {
    if (!config.azure.connectionString) {
      throw new Error(
        'AZURE_STORAGE_CONNECTION_STRING 이 설정되지 않았습니다.',
      );
    }
    const blobServiceClient = BlobServiceClient.fromConnectionString(
      config.azure.connectionString,
    );
    containerClient = blobServiceClient.getContainerClient(
      config.azure.containerName,
    );
  }
  return containerClient;
};
//
// Local Storage helpers
const getLocalFilePath = (filename: string): string => {
  return path.join(process.cwd(), config.storage.localPath, filename);
};

const ensureLocalDir = (): void => {
  const dir = path.join(process.cwd(), config.storage.localPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

// Storage type check
export const isAzureStorage = (): boolean => config.storage.type === 'azure';

// Upload (seed.ts에서 사용)
export const uploadFile = async (
  buffer: Buffer,
  filename: string,
  contentType: string,
): Promise<string> => {
  if (isAzureStorage()) {
    const client = getContainerClient();
    const blockBlobClient = client.getBlockBlobClient(filename);
    await blockBlobClient.uploadData(buffer, {
      blobHTTPHeaders: { blobContentType: contentType },
    });
  } else {
    ensureLocalDir();
    const filePath = getLocalFilePath(filename);
    fs.writeFileSync(filePath, buffer);
  }
  return filename;
};

// Get file URL (sale.service.ts에서 사용)
export const getFileUrl = (filename: string): string | null => {
  if (!filename) return null;

  if (isAzureStorage()) {
    try {
      const client = getContainerClient();
      const blockBlobClient = client.getBlockBlobClient(filename);
      return blockBlobClient.url;
    } catch {
      return null;
    }
  } else {
    return `/image/${filename}`;
  }
};

// Delete file
export const deleteFile = async (filename: string): Promise<void> => {
  if (isAzureStorage()) {
    const client = getContainerClient();
    const blockBlobClient = client.getBlockBlobClient(filename);
    await blockBlobClient.deleteIfExists();
  } else {
    const filePath = getLocalFilePath(filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  }
};
