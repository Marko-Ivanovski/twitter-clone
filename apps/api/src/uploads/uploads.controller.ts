import {
  BadRequestException,
  Controller,
  Post,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import { randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import { memoryStorage } from 'multer';
import path from 'path';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { detectImageExtension } from './image-signature';
import { UPLOAD_ROOT } from './upload-files';
import { getUploadsBaseUrl, isUploadFolder } from './upload-url';

const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

@Controller('uploads')
export class UploadsController {
  @Post()
  @UseGuards(JwtAuthGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
    }),
  )
  async uploadFile(
    @UploadedFile() file: Express.Multer.File | undefined,
    @Query('folder') folder?: string,
  ) {
    if (!file) {
      throw new BadRequestException('File is required');
    }

    const extension = detectImageExtension(file.buffer);
    if (!extension) {
      throw new BadRequestException(
        'Only JPG, PNG, WEBP, or GIF images are allowed',
      );
    }

    const targetFolder = isUploadFolder(folder) ? folder : 'misc';
    const directory = path.join(UPLOAD_ROOT, targetFolder);
    const fileName = `${randomUUID()}${extension}`;

    await fs.mkdir(directory, { recursive: true });
    await fs.writeFile(path.join(directory, fileName), file.buffer);

    return { url: `${getUploadsBaseUrl()}/${targetFolder}/${fileName}` };
  }
}
