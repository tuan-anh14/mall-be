import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiParam,
} from '@nestjs/swagger';
import { BlogsService } from './blogs.service';
import { CreateBlogDto } from './dto/create-blog.dto';
import { UpdateBlogDto } from './dto/update-blog.dto';
import { CreateBlogCategoryDto } from './dto/create-blog-category.dto';
import { RejectBlogDto } from './dto/reject-blog.dto';
import { BlogQueryDto } from './dto/blog-query.dto';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { Roles } from '@/common/decorators/roles.decorator';
import { RolesGuard } from '@/common/guards/role.guard';
import { UserType } from 'generated/prisma/client';

@ApiTags('Blogs')
@Controller()
export class BlogsController {
  constructor(private readonly blogsService: BlogsService) {}

  // ──────────────────────────────────────────────────────────
  // CATEGORIES (Public READ / Admin WRITE)
  // ──────────────────────────────────────────────────────────

  @Public()
  @Get('blog-categories')
  @ApiOperation({ summary: 'List all blog categories' })
  @ApiResponse({ status: 200 })
  getCategories() {
    return this.blogsService.getCategories();
  }

  @Post('blog-categories')
  @UseGuards(RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Create blog category' })
  @ApiResponse({ status: 201 })
  createCategory(@Body() dto: CreateBlogCategoryDto) {
    return this.blogsService.createCategory(dto);
  }

  @Delete('blog-categories/:id')
  @UseGuards(RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: Delete blog category' })
  @ApiParam({ name: 'id', type: String })
  deleteCategory(@Param('id') id: string) {
    return this.blogsService.deleteCategory(id);
  }

  // ──────────────────────────────────────────────────────────
  // PUBLIC BLOG READ
  // ──────────────────────────────────────────────────────────

  @Public()
  @Get('blogs')
  @ApiOperation({ summary: 'Get published blog posts (public, paginated)' })
  @ApiResponse({ status: 200 })
  getPublishedBlogs(@Query() query: BlogQueryDto) {
    return this.blogsService.getPublishedBlogs(query);
  }

  @Public()
  @Get('blogs/:slug')
  @ApiOperation({ summary: 'Get a published blog post by slug' })
  @ApiParam({ name: 'slug', type: String })
  @ApiResponse({ status: 200 })
  getBlogBySlug(@Param('slug') slug: string) {
    return this.blogsService.getBlogBySlug(slug);
  }

  // ──────────────────────────────────────────────────────────
  // AUTHENTICATED AUTHOR ENDPOINTS
  // ──────────────────────────────────────────────────────────

  @Get('my-blogs')
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get current user's own blog posts" })
  @ApiResponse({ status: 200 })
  getMyBlogs(@CurrentUser('id') userId: string, @Query() query: BlogQueryDto) {
    return this.blogsService.getMyBlogs(userId, query);
  }

  @Post('blogs')
  @HttpCode(HttpStatus.CREATED)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a blog post (DRAFT or submit as PENDING)' })
  @ApiResponse({ status: 201 })
  createBlog(@CurrentUser('id') userId: string, @Body() dto: CreateBlogDto) {
    return this.blogsService.createBlog(userId, dto);
  }

  @Put('blogs/:id')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update own blog post (only DRAFT or REJECTED)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  updateBlog(
    @CurrentUser('id') userId: string,
    @Param('id') blogId: string,
    @Body() dto: UpdateBlogDto,
  ) {
    return this.blogsService.updateBlog(userId, blogId, dto);
  }

  @Delete('blogs/:id')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete own blog post (DRAFT / REJECTED only)' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  deleteBlog(
    @CurrentUser('id') userId: string,
    @CurrentUser('userType') userType: UserType,
    @Param('id') blogId: string,
  ) {
    return this.blogsService.deleteBlog(userId, blogId, userType);
  }

  // ──────────────────────────────────────────────────────────
  // ADMIN ENDPOINTS
  // ──────────────────────────────────────────────────────────

  @Get('admin/blogs')
  @UseGuards(RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: List all blog posts with filters' })
  @ApiResponse({ status: 200 })
  getAllBlogsAdmin(@Query() query: BlogQueryDto) {
    return this.blogsService.getAllBlogsAdmin(query);
  }

  @Put('admin/blogs/:id')
  @UseGuards(RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: Edit any blog post' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  adminUpdateBlog(@Param('id') blogId: string, @Body() dto: UpdateBlogDto) {
    return this.blogsService.adminUpdateBlog(blogId, dto);
  }

  @Patch('admin/blogs/:id/approve')
  @UseGuards(RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: Approve a pending blog post' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  approveBlog(@Param('id') blogId: string) {
    return this.blogsService.approveBlog(blogId);
  }

  @Patch('admin/blogs/:id/reject')
  @UseGuards(RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: Reject a pending blog post with a reason' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  rejectBlog(@Param('id') blogId: string, @Body() dto: RejectBlogDto) {
    return this.blogsService.rejectBlog(blogId, dto);
  }

  @Delete('admin/blogs/:id')
  @UseGuards(RolesGuard)
  @Roles(UserType.ADMIN)
  @ApiBearerAuth()
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Admin: Delete any blog post' })
  @ApiParam({ name: 'id', type: String })
  @ApiResponse({ status: 200 })
  adminDeleteBlog(
    @CurrentUser('id') adminId: string,
    @CurrentUser('userType') userType: UserType,
    @Param('id') blogId: string,
  ) {
    return this.blogsService.deleteBlog(adminId, blogId, userType);
  }
}
