import { Logger, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { STORAGE_PROVIDER } from './interfaces/storage-provider.interface';
import { LocalStorageProvider } from './providers/local-storage.provider';
import { CloudinaryStorageProvider } from './providers/cloudinary-storage.provider';
import { StorageService } from './storage.service';
import { StorageController } from './storage.controller';

@Module({
  controllers: [StorageController],
  providers: [
    {
      provide: STORAGE_PROVIDER,
      useFactory: (config: ConfigService) => {
        const providerType = config.get<string>('storage.provider');
        if (providerType === 'cloudinary') {
          new Logger('StorageModule').log('Using Cloudinary storage provider');
          return new CloudinaryStorageProvider(config);
        }
        new Logger('StorageModule').log('Using Local storage provider');
        return new LocalStorageProvider(config);
      },
      inject: [ConfigService],
    },
    StorageService,
  ],
  exports: [StorageService],
})
export class StorageModule {}
