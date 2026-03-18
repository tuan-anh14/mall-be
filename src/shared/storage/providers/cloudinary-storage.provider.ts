import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { v2 as cloudinary, UploadApiOptions } from 'cloudinary';
import { Readable } from 'stream';
import {
  IStorageProvider,
  UploadResult,
} from '../interfaces/storage-provider.interface';

@Injectable()
export class CloudinaryStorageProvider implements IStorageProvider {
  private readonly logger = new Logger(CloudinaryStorageProvider.name);
  private readonly folder: string;

  constructor(config: ConfigService) {
    const cloudName = config.get<string>('storage.cloudinary.cloudName');
    const apiKey = config.get<string>('storage.cloudinary.apiKey');
    const apiSecret = config.get<string>('storage.cloudinary.apiSecret');

    if (!cloudName || !apiKey || !apiSecret) {
      throw new Error(
        'Cloudinary credentials are missing. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET.',
      );
    }

    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    this.folder = config.get<string>('storage.cloudinary.folder') || 'shopmall';
  }

  async upload(
    file: Express.Multer.File,
    folder?: string,
  ): Promise<UploadResult> {
    const uploadFolder = folder
      ? `${this.folder}/${folder}`
      : this.folder;

    const options: UploadApiOptions = {
      folder: uploadFolder,
      resource_type: 'image',
      // Auto quality + format optimization
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    };

    try {
      const result = await this.uploadStream(file.buffer, options);
      return {
        key: result.public_id,
        url: result.secure_url,
        mimetype: file.mimetype,
        size: file.size,
      };
    } catch (err: any) {
      this.logger.error('Cloudinary upload failed', err);
      throw new BadRequestException(`Upload failed: ${err.message ?? 'Unknown error'}`);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      // key is the Cloudinary public_id (e.g. "shopmall/products/abc123")
      await cloudinary.uploader.destroy(key, { resource_type: 'image' });
    } catch (err: any) {
      this.logger.warn(`Cloudinary delete failed for key "${key}": ${err.message}`);
      // Don't throw — a missing asset shouldn't block the operation
    }
  }

  getUrl(key: string): string {
    return cloudinary.url(key, { secure: true });
  }

  /** Extract Cloudinary public_id from a secure_url */
  static publicIdFromUrl(url: string): string | null {
    try {
      // e.g. https://res.cloudinary.com/<cloud>/image/upload/v123456/shopmall/products/abc.jpg
      const match = url.match(/\/upload\/(?:v\d+\/)?(.+?)(?:\.[a-z]+)?$/i);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  private uploadStream(
    buffer: Buffer,
    options: UploadApiOptions,
  ): Promise<any> {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(options, (err, result) => {
        if (err) return reject(err);
        if (!result) return reject(new Error('No result from Cloudinary'));
        resolve(result);
      });
      Readable.from(buffer).pipe(stream);
    });
  }
}
