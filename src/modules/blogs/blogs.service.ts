import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { BlogStatus, UserType } from 'generated/prisma/client';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { CreateBlogCategoryDto } from './dto/create-blog-category.dto';
import { RejectBlogDto } from './dto/reject-blog.dto';
import { BlogQueryDto } from './dto/blog-query.dto';

// Shared include for blog queries
const BLOG_INCLUDE = {
  author: {
    select: {
      id: true,
      firstName: true,
      lastName: true,
      avatar: true,
      userType: true,
      sellerProfile: { select: { storeName: true, storeSlug: true } },
    },
  },
  category: { select: { id: true, name: true, slug: true } },
} as const;

@Injectable()
export class BlogsService {
  constructor(private readonly prisma: PrismaService) {}

  // ──────────────────────────────────────────────────────────
  // HELPERS
  // ──────────────────────────────────────────────────────────

  /** Generate a URL-safe slug from a title string */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '') // strip diacritics (Vietnamese)
      .replace(/đ/g, 'd')             // special Vietnamese char
      .replace(/[^a-z0-9\s-]/g, '')   // remove special chars
      .trim()
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-');
  }

  /** Estimate reading time in minutes (avg 200 wpm) */
  private calcReadTime(content: string): number {
    const text = content.replace(/<[^>]*>/g, ''); // strip HTML tags
    const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.ceil(wordCount / 200));
  }

  /** Ensure the generated slug is unique, appending a suffix if needed */
  private async ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
    let slug = base;
    let attempt = 0;

    while (true) {
      const existing = await this.prisma.blog.findUnique({ where: { slug } });
      if (!existing || existing.id === excludeId) break;
      attempt++;
      slug = `${base}-${attempt}`;
    }

    return slug;
  }

  private formatBlog(blog: any) {
    return {
      id: blog.id,
      title: blog.title,
      slug: blog.slug,
      content: blog.content,
      summary: blog.summary ?? null,
      thumbnail: blog.thumbnail ?? null,
      status: blog.status,
      views: blog.views,
      readTime: blog.readTime,
      adminNote: blog.adminNote ?? null,
      author: blog.author
        ? {
            id: blog.author.id,
            name: `${blog.author.firstName} ${blog.author.lastName}`,
            avatar: blog.author.avatar,
            userType: blog.author.userType,
            storeName: blog.author.sellerProfile?.storeName ?? null,
          }
        : null,
      category: blog.category,
      createdAt: blog.createdAt,
      updatedAt: blog.updatedAt,
    };
  }

  // ──────────────────────────────────────────────────────────
  // CATEGORIES
  // ──────────────────────────────────────────────────────────

  async getCategories() {
    const categories = await this.prisma.blogCategory.findMany({
      orderBy: { name: 'asc' },
      include: { _count: { select: { blogs: { where: { status: BlogStatus.PUBLISHED } } } } },
    });
    return categories.map((c) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      blogCount: c._count.blogs,
    }));
  }

  async createCategory(dto: CreateBlogCategoryDto) {
    const slug = this.slugify(dto.name);
    const existing = await this.prisma.blogCategory.findUnique({ where: { name: dto.name } });
    if (existing) throw new BadRequestException('Category with this name already exists');

    const category = await this.prisma.blogCategory.create({
      data: { name: dto.name, slug },
    });
    return category;
  }

  async deleteCategory(categoryId: string) {
    const category = await this.prisma.blogCategory.findUnique({ where: { id: categoryId } });
    if (!category) throw new NotFoundException('Category not found');
    const count = await this.prisma.blog.count({ where: { categoryId } });
    if (count > 0)
      throw new BadRequestException('Cannot delete a category that still has blog posts');

    await this.prisma.blogCategory.delete({ where: { id: categoryId } });
    return { message: 'Category deleted' };
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC READ
  // ──────────────────────────────────────────────────────────

  async getPublishedBlogs(query: BlogQueryDto) {
    const { page = 1, limit = 12, category, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { status: BlogStatus.PUBLISHED };
    if (category) where.category = { slug: category };
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [blogs, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        include: BLOG_INCLUDE,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blog.count({ where }),
    ]);

    return {
      blogs: blogs.map((b) => this.formatBlog(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async getBlogBySlug(slug: string) {
    const blog = await this.prisma.blog.findUnique({
      where: { slug },
      include: BLOG_INCLUDE,
    });

    if (!blog || blog.status !== BlogStatus.PUBLISHED) {
      throw new NotFoundException('Blog post not found');
    }

    // Increment view count (fire and forget)
    this.prisma.blog.update({ where: { id: blog.id }, data: { views: { increment: 1 } } }).catch(() => {});

    // Related posts in the same category
    const related = await this.prisma.blog.findMany({
      where: {
        categoryId: blog.categoryId,
        status: BlogStatus.PUBLISHED,
        id: { not: blog.id },
      },
      include: BLOG_INCLUDE,
      orderBy: { createdAt: 'desc' },
      take: 3,
    });

    return {
      blog: this.formatBlog(blog),
      related: related.map((b) => this.formatBlog(b)),
    };
  }

  // ──────────────────────────────────────────────────────────
  // AUTHOR CRUD (Buyer / Seller)
  // ──────────────────────────────────────────────────────────

  async getMyBlogs(userId: string, query: BlogQueryDto) {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = { authorId: userId };
    if (status) where.status = status;
    if (search) where.title = { contains: search, mode: 'insensitive' };

    const [blogs, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        include: BLOG_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blog.count({ where }),
    ]);

    return {
      blogs: blogs.map((b) => this.formatBlog(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async createBlog(userId: string, dto: CreateBlogDto) {
    const category = await this.prisma.blogCategory.findUnique({ where: { id: dto.categoryId } });
    if (!category) throw new NotFoundException('Category not found');

    const baseSlug = this.slugify(dto.title);
    const slug = await this.ensureUniqueSlug(baseSlug);
    const readTime = this.calcReadTime(dto.content);

    // Validate status: users can only save as DRAFT or submit as PENDING
    const allowedStatuses: BlogStatus[] = [BlogStatus.DRAFT, BlogStatus.PENDING];
    const status = dto.status && allowedStatuses.includes(dto.status) ? dto.status : BlogStatus.DRAFT;

    const blog = await this.prisma.blog.create({
      data: {
        title: dto.title,
        slug,
        content: dto.content,
        summary: dto.summary ?? null,
        thumbnail: dto.thumbnail ?? null,
        categoryId: dto.categoryId,
        authorId: userId,
        status,
        readTime,
      },
      include: BLOG_INCLUDE,
    });

    return { blog: this.formatBlog(blog) };
  }

  async updateBlog(userId: string, blogId: string, dto: UpdateBlogDto) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog post not found');
    if (blog.authorId !== userId) throw new ForbiddenException('Not your blog post');

    // Only DRAFT or REJECTED posts can be edited by the author
    const editableStatuses: BlogStatus[] = [BlogStatus.DRAFT, BlogStatus.REJECTED];
    if (!editableStatuses.includes(blog.status)) {
      throw new BadRequestException(
        'Only draft or rejected posts can be edited. To update a published post, contact admin.',
      );
    }

    let slug = blog.slug;
    if (dto.title && dto.title !== blog.title) {
      const baseSlug = this.slugify(dto.title);
      slug = await this.ensureUniqueSlug(baseSlug, blogId);
    }

    const readTime = dto.content ? this.calcReadTime(dto.content) : blog.readTime;

    // When updating a REJECTED post and submitting, reset adminNote
    const newStatus = dto.status ?? blog.status;
    const adminNote = newStatus === BlogStatus.PENDING ? null : blog.adminNote;

    const updated = await this.prisma.blog.update({
      where: { id: blogId },
      data: {
        ...(dto.title && { title: dto.title, slug }),
        ...(dto.content !== undefined && { content: dto.content, readTime }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.thumbnail !== undefined && { thumbnail: dto.thumbnail }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        status: newStatus,
        adminNote,
      },
      include: BLOG_INCLUDE,
    });

    return { blog: this.formatBlog(updated) };
  }

  async deleteBlog(userId: string, blogId: string, userType: UserType) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog post not found');

    // Admin can delete any; authors can only delete their own DRAFT / REJECTED
    if (userType === UserType.ADMIN) {
      await this.prisma.blog.delete({ where: { id: blogId } });
    } else {
      if (blog.authorId !== userId) throw new ForbiddenException('Not your blog post');
      if (blog.status === BlogStatus.PUBLISHED || blog.status === BlogStatus.PENDING) {
        throw new BadRequestException('Cannot delete a published or pending post');
      }
      await this.prisma.blog.delete({ where: { id: blogId } });
    }

    return { message: 'Blog post deleted' };
  }

  // ──────────────────────────────────────────────────────────
  // ADMIN ACTIONS
  // ──────────────────────────────────────────────────────────

  async getAllBlogsAdmin(query: BlogQueryDto) {
    const { page = 1, limit = 10, status, search } = query;
    const skip = (page - 1) * limit;

    const where: any = {};
    if (status) where.status = status;
    if (search)
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { author: { firstName: { contains: search, mode: 'insensitive' } } },
        { author: { lastName: { contains: search, mode: 'insensitive' } } },
      ];

    const [blogs, total] = await Promise.all([
      this.prisma.blog.findMany({
        where,
        include: BLOG_INCLUDE,
        orderBy: { updatedAt: 'desc' },
        skip,
        take: limit,
      }),
      this.prisma.blog.count({ where }),
    ]);

    return {
      blogs: blogs.map((b) => this.formatBlog(b)),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async approveBlog(blogId: string) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog post not found');
    if (blog.status !== BlogStatus.PENDING) {
      throw new BadRequestException('Only pending posts can be approved');
    }

    const updated = await this.prisma.blog.update({
      where: { id: blogId },
      data: { status: BlogStatus.PUBLISHED, adminNote: null },
      include: BLOG_INCLUDE,
    });

    return { blog: this.formatBlog(updated) };
  }

  async rejectBlog(blogId: string, dto: RejectBlogDto) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog post not found');
    if (blog.status !== BlogStatus.PENDING) {
      throw new BadRequestException('Only pending posts can be rejected');
    }

    const updated = await this.prisma.blog.update({
      where: { id: blogId },
      data: { status: BlogStatus.REJECTED, adminNote: dto.reason },
      include: BLOG_INCLUDE,
    });

    return { blog: this.formatBlog(updated) };
  }

  async adminUpdateBlog(blogId: string, dto: UpdateBlogDto) {
    const blog = await this.prisma.blog.findUnique({ where: { id: blogId } });
    if (!blog) throw new NotFoundException('Blog post not found');

    let slug = blog.slug;
    if (dto.title && dto.title !== blog.title) {
      const baseSlug = this.slugify(dto.title);
      slug = await this.ensureUniqueSlug(baseSlug, blogId);
    }

    const readTime = dto.content ? this.calcReadTime(dto.content) : blog.readTime;

    const updated = await this.prisma.blog.update({
      where: { id: blogId },
      data: {
        ...(dto.title && { title: dto.title, slug }),
        ...(dto.content !== undefined && { content: dto.content, readTime }),
        ...(dto.summary !== undefined && { summary: dto.summary }),
        ...(dto.thumbnail !== undefined && { thumbnail: dto.thumbnail }),
        ...(dto.categoryId && { categoryId: dto.categoryId }),
        ...(dto.status && { status: dto.status }),
      },
      include: BLOG_INCLUDE,
    });

    return { blog: this.formatBlog(updated) };
  }
}
