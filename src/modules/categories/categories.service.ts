import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class CategoriesService {
  constructor(private readonly prisma: PrismaService) {}

  findAll() {
    return this.prisma.category.findMany({
      select: { id: true, name: true, slug: true, icon: true },
      orderBy: { sortOrder: 'asc' },
    });
  }
}
