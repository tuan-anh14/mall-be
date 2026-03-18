import {
  Body,
  Controller,
  Delete,
  Post,
  UseInterceptors,
  UploadedFiles,
  BadRequestException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { FilesInterceptor } from '@nestjs/platform-express';
import {
  ApiTags,
  ApiOperation,
  ApiConsumes,
  ApiBody,
  ApiResponse,
  ApiUnauthorizedResponse,
  ApiBadRequestResponse,
} from '@nestjs/swagger';
import { IsString } from 'class-validator';
import { StorageService } from '@/shared/storage/storage.service';
import { CloudinaryStorageProvider } from '@/shared/storage/providers/cloudinary-storage.provider';

class DeleteImageDto {
  @IsString()
  url: string;
}

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private readonly storageService: StorageService) {}

  @Post('images')
  @ApiOperation({
    summary: 'Upload product images (max 10 files, PNG/JPG/WEBP, 10MB each)',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Images uploaded successfully',
    schema: { example: { urls: ['https://res.cloudinary.com/...'] } },
  })
  @ApiUnauthorizedResponse({ description: 'Not authenticated' })
  @ApiBadRequestResponse({ description: 'No files or invalid file type/size' })
  @UseInterceptors(FilesInterceptor('files', 10))
  async uploadImages(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files?.length) throw new BadRequestException('No files provided');
    const results = await Promise.all(
      files.map((file) => this.storageService.upload(file, 'products')),
    );
    return { urls: results.map((r) => r.url) };
  }

  @Delete('images')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete an uploaded image by its URL' })
  @ApiResponse({ status: 200, description: 'Image deleted successfully' })
  async deleteImage(@Body() dto: DeleteImageDto) {
    if (!dto?.url) throw new BadRequestException('url is required');

    // Derive the storage key from the URL
    // For Cloudinary: extract public_id; for local: strip leading /uploads/
    let key: string;
    if (dto.url.includes('cloudinary.com')) {
      const publicId = CloudinaryStorageProvider.publicIdFromUrl(dto.url);
      if (!publicId) throw new BadRequestException('Cannot parse Cloudinary public_id from URL');
      key = publicId;
    } else {
      // Local: url is like /uploads/products/uuid.jpg
      key = dto.url.replace(/^\/uploads\//, '');
    }

    await this.storageService.delete(key);
    return { message: 'Image deleted successfully' };
  }
}
