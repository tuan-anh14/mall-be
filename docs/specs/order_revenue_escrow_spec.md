# SPEC: HỆ THỐNG QUẢN LÝ DOANH THU TẠM GIỮ (ESCROW & REVENUE SYSTEM)

## 1. Tổng quan
Sau khi thực hiện Flatten Order (phẳng hóa đơn hàng), hệ thống cần một cơ chế quản lý dòng tiền minh bạch để đảm bảo:
- Khách hàng yên tâm thanh toán (Sàn giữ tiền).
- Shop không phải bỏ tiền túi ra hoàn trả nếu chưa nhận được doanh thu.
- Tiền chỉ về ví Shop khi giao hàng thành công.

## 2. Thay đổi Database (Prisma Schema)

### A. Thêm Enum mới
```prisma
enum RevenueStatus {
  UNPAID      // Đơn COD chưa thanh toán
  PENDING     // Đã thanh toán, Sàn đang tạm giữ (Escrow)
  RELEASED    // Đã trả tiền vào ví cho Shop
  REFUNDED    // Đã hoàn tiền lại cho khách
}
```

### B. Cập nhật Model Order
```prisma
model Order {
  // ... các trường cũ
  revenueStatus  RevenueStatus @default(UNPAID)
  isPaidOnline   Boolean       @default(false)
  // ...
}
```

## 3. Luồng Logic Chi Tiết (Backend)

### Luồng 1: Thanh toán thành công (VNPAY/Wallet)
- **Action:** Webhook/IPN gọi về báo thành công.
- **Logic:**
  1. Tìm toàn bộ đơn hàng có chung `paymentGroupId` (Prefix mới: `ORD-`).
  2. Cập nhật `status = CONFIRMED`.
  3. Cập nhật `isPaidOnline = true`.
  4. Cập nhật `revenueStatus = PENDING`.
  5. Ghi nhận giao dịch `PAYMENT` trong `WalletTransaction`.

### Luồng 2: Hoàn thành đơn hàng (Giải ngân)
- **Action:** Shop cập nhật trạng thái đơn sang `DELIVERED`.
- **Logic:**
  1. Kiểm tra đơn hàng có `revenueStatus === PENDING` hay không.
  2. Nếu đúng:
     - Gọi `WalletService.addBalance(sellerId, amount)` để cộng tiền vào ví Shop.
     - Tạo giao dịch `REVENUE` trong `WalletTransaction` để lưu vết.
     - Cập nhật `revenueStatus = RELEASED`.
  3. Nếu đơn COD:
     - Ghi nhận `revenueStatus = RELEASED` (vì khách đã trả tiền mặt cho shipper/shop).

### Luồng 3: Hủy đơn & Hoàn tiền (Refund)
- **Action:** Shop bấm "Đồng ý Hủy" khi khách yêu cầu.
- **Logic:**
  1. Kiểm tra `revenueStatus`.
  2. Nếu là `PENDING`:
     - Gọi `WalletService.refundToWallet(userId, amount)`.
     - Cập nhật `revenueStatus = REFUNDED`.
     - **Kết quả:** Shop không mất tiền, Sàn lấy tiền đang giữ trả lại khách.
  3. Nếu là `UNPAID`: Chỉ chuyển `status = CANCELLED`.

## 4. Giao diện Người bán (Frontend)

### A. SellerOrdersPage
- Hiển thị nhãn trạng thái tiền tệ bên cạnh tổng tiền:
  - `PENDING`: "Chờ quyết toán" (Màu vàng).
  - `RELEASED`: "Đã về ví" (Màu xanh).
- Nút bấm:
  - Hiện nút **Xác nhận giao hàng** / **Xác nhận đã giao**.
  - Hiện nút **Đồng ý Hủy / Từ chối** khi có yêu cầu hủy.

## 5. Giao diện Quản trị (Admin Dashboard)

### A. Quản lý Tài chính (Finance Management)
- **Tổng quan quỹ:** Hiển thị tổng số tiền đang tạm giữ trong hệ thống (Escrow Balance).
- **Danh sách chờ quyết toán:** Hiển thị các đơn hàng `status = DELIVERED` nhưng `revenueStatus = PENDING`.
- **Thao tác quản trị:** 
    - Nút **Force Release**: Admin cưỡng bức chuyển tiền về ví Shop (dùng khi có tranh chấp đã xử lý xong).
    - Nút **Force Refund**: Admin cưỡng bức hoàn tiền cho Khách.

## 6. Danh sách công việc (Checklist)
- [ ] Update `schema.prisma` và `db push`.
- [ ] Refactor `OrdersService.handlePaymentCallback` (Prefix ORD-).
- [ ] Thêm logic giải ngân tự động vào `OrdersService.updateStatus`.
- [ ] Cập nhật UI `SellerOrdersPage.tsx` (Hiển thị revenueStatus).
- [ ] Tạo trang `AdminFinancePage.tsx` để Admin quản lý dòng tiền tổng.
