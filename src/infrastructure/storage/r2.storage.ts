// src/infrastructure/storage/r2.storage.ts

import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../../config/env";

// 1. Initialize the S3 client pointinf to cloudflare r2

const r2Client = new S3Client({
  region: "auto",
  endpoint: `https://${env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
  },
});

export const r2Storage = {
  /**
   * Uploads a file buffer to Cloudflare R2
   * @param key The file path/name (e.g., `documents/user_123/nda.pdf`)
   * @param fileBuffer The raw file data
   * @param contentType The MIME type (e.g., 'application/pdf')
   * @returns The stored key
   */

  async uploadFile(key: string, fileBuffer: Buffer, contentType: string): Promise<string> {
    const command = new PutObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: contentType,
    });

    try {
      await r2Client.send(command);
      return key; 

    } catch (error) { 
      console.error(`[R2 Storage] Failed to upload ${key}:`, error);
      throw new Error("Failed to upload file to storage.");
    }
  },


  /**
   * Generates a temporary, secure URL for the frontend to download/view the file
   * @param key The file path/name in the bucket
   * @param expiresInSeconds How long the link is valid (default: 1 hour)
   * @returns A secure HTTPS URL
   */

  async getSignedDownloadUrl(key: string, expiresInSeconds: number = 3600, filename?: string): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
      ...(filename ? { ResponseContentDisposition: `attachment; filename="${filename}"` } : {})
    });


    try {
      // Create a URL that expires automatically, keeping your files secure
      return await getSignedUrl(r2Client, command, { expiresIn: expiresInSeconds });
    } catch (error) {
      console.error(`[R2 Storage] Failed to generate signed URL for ${key}: `, error);
      throw new Error("Failed to generate secure download link.");
    }
  },

  /**
   * Deletes a file from R2
   */
  async deleteFile(key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: env.R2_BUCKET_NAME,
      Key: key,
    });

    try {
      await r2Client.send(command);
    } catch (error) {
      console.error(`[R2 Storage] Failed to delete ${key}:`, error);
      throw new Error("Failed to delete file from storage.");
    }
  }
}