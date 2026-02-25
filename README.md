# mall-be

Backend REST API cho hệ thống thương mại điện tử, xây dựng với NestJS, Prisma, PostgreSQL và JWT authentication.

## Tính năng

- **Xác thực & Phân quyền** — JWT access/refresh token, Passport strategies, RBAC (CUSTOMER, ADMIN), bcrypt password hashing
- **Quản lý người dùng** — Đăng ký, đăng nhập, quản lý hồ sơ, soft delete, phân quyền theo vai trò
- **File Storage** — Hỗ trợ lưu trữ file cục bộ
- **Clean Architecture** — Repository pattern với CRUD tổng quát, soft-delete, custom decorators, guards, exception filters, response interceptors
- **API Documentation** — Swagger/OpenAPI (chỉ khả dụng ngoài môi trường production)
- **Bảo mật** — Helmet, CORS, rate limiting, input validation

## Tech Stack

| Layer | Technology |
|---|---|
| Framework | NestJS 11 |
| Language | TypeScript 5 |
| Database | PostgreSQL + Prisma ORM 7 |
| Auth | Passport.js + JWT (Access & Refresh Token) |
| Storage | Local filesystem |
| Validation | class-validator & class-transformer |
| Documentation | Swagger/OpenAPI |
| Testing | Jest |

## Yêu cầu

- Node.js v18+
- PostgreSQL v14+
- yarn

## Bắt đầu

```bash
# 1. Clone repository
git clone <repository-url>
cd mall-be

# 2. Cài đặt dependencies
yarn install

# 3. Cấu hình môi trường
cp .env.example .env
```

Chỉnh sửa `.env` với các giá trị của bạn:

```env
PORT=8000
NODE_ENV="development"

DATABASE_URL="postgresql://user:password@localhost:5432/mall_be?schema=public"

FRONTEND_URL=http://localhost:8000

JWT_SECRET="your-super-secret-jwt-key"
JWT_ACCESS_TOKEN_EXPIRES_IN="15m"
JWT_REFRESH_SECRET="your-super-secret-refresh-jwt-key"
JWT_REFRESH_TOKEN_EXPIRES_IN="7d"

MAX_FILE_SIZE_MB=10
LOCAL_STORAGE_PATH="./uploads"
```

```bash
# 4. Chạy migration
yarn prisma:migrate:deploy

# 5. Generate Prisma client
yarn prisma:generate

# 6. Khởi động ở chế độ development
yarn start:dev
```

API chạy tại `http://localhost:8000`
Swagger docs tại `http://localhost:8000/api`

## Chạy với Docker

```bash
# Build và chạy với Docker Compose (API + PostgreSQL)
docker compose up --build
```

Hoặc build Docker image thủ công:

```bash
docker build --build-arg DATABASE_URL="postgresql://placeholder" -t mall-be .
docker run -p 8000:8000 --env-file .env mall-be
```

## Scripts

| Lệnh | Mô tả |
|---|---|
| `yarn start:dev` | Khởi động ở chế độ watch |
| `yarn start:prod` | Khởi động production build |
| `yarn build` | Build project |
| `yarn test` | Chạy unit tests |
| `yarn test:cov` | Tạo coverage report |
| `yarn lint` | Lint và auto-fix |
| `yarn format` | Format với Prettier |
| `yarn prisma:migrate:dev` | Tạo migration mới |
| `yarn prisma:migrate:deploy` | Chạy migration |
| `yarn prisma:studio` | Mở Prisma Studio |

## API Endpoints

### Authentication
- `POST /api/v1/auth/register` — Đăng ký tài khoản mới
- `POST /api/v1/auth/login` — Đăng nhập và nhận JWT token

### Users
- `GET /api/v1/users` — Danh sách người dùng (Admin only)
- `GET /api/v1/users/:id` — Lấy thông tin người dùng
- `PUT /api/v1/users/:id` — Cập nhật người dùng
- `DELETE /api/v1/users/:id` — Soft delete người dùng

Tài liệu đầy đủ tại `/api` khi server đang chạy.

## Kiến trúc

### Repository Pattern
- `BaseRepository` — CRUD tổng quát
- `ReadRepository` — Các thao tác đọc
- `WriteRepository` — Tạo, cập nhật, xóa
- `SoftDeletableRepository` — Hỗ trợ soft delete

### Auth Flow
1. Người dùng đăng ký hoặc đăng nhập
2. Server xác thực thông tin và cấp access token + refresh token
3. Client gửi access token trong header `Authorization: Bearer <token>`
4. `JwtAuthGuard` xác thực token trên các route được bảo vệ
5. `RoleGuard` kiểm tra phân quyền theo vai trò

### Custom Decorators
- `@Public()` — Bỏ qua JWT guard
- `@Roles(UserRole.ADMIN)` — Giới hạn theo vai trò
- `@CurrentUser()` — Inject thông tin user hiện tại từ request

## Bảo mật

- bcrypt password hashing
- JWT access & refresh token
- Role-based access control (RBAC)
- Input validation và payload whitelisting
- Bảo vệ SQL injection qua Prisma
- Global exception handling
- Rate limiting via `@nestjs/throttler`
- Helmet security headers
- CORS cấu hình

## License

[MIT](LICENSE)
