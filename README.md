# Omnichannel Order Demo — E-Logistics nhà thuốc

## 1. Giới thiệu

Website demo mô phỏng quy trình **E-Logistics omnichannel** của một chuỗi nhà thuốc (lấy cảm hứng từ mô hình Long Châu):

**Đặt hàng → OMS (xác nhận đơn) → WMS (kiểm tra & trừ kho) → Picking → Packing → TMS (giao hàng) → Hoàn tất / Lịch sử đơn hàng.**

Khách hàng đặt thuốc qua nhiều kênh (website, app, fanpage, tại quầy), chọn giao tận nơi hoặc nhận tại nhà thuốc; quản trị viên xử lý đơn qua từng bước OMS/WMS/TMS, hệ thống tự sinh mã vận đơn và ghi lại toàn bộ lịch sử trạng thái. Project phục vụ **mục đích học tập / báo cáo**, không phải hệ thống thương mại.

**Công nghệ:** Node.js + Express, SQLite (better-sqlite3), EJS + CSS thuần, express-session + bcrypt.

## 2. Yêu cầu hệ thống

- **Node.js 18 (LTS) trở lên** — cần cho `better-sqlite3` và cú pháp hiện đại. Kiểm tra bằng `node -v`.
- **git** để clone mã nguồn.
- Không cần cài SQLite riêng — database là file `data/app.db`, tự tạo và seed dữ liệu mẫu ở lần chạy đầu.

## 3. Cài đặt và chạy

### Windows

1. Cài Node.js từ <https://nodejs.org> (chọn bản **LTS**, cài mặc định).
2. Clone repo rồi mở terminal (CMD hoặc PowerShell) tại thư mục project:
   ```
   git clone <URL-repo>
   cd omnichannel-order-demo
   ```
3. Cài dependencies:
   ```
   npm install
   ```
4. Chạy server:
   ```
   npm start
   ```
5. Mở trình duyệt vào <http://localhost:3000>.

### Linux / Ubuntu

1. Cài Node.js bản LTS qua NodeSource (khuyến nghị):
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash -
   sudo apt-get install -y nodejs
   ```
   Hoặc dùng apt có sẵn (kiểm tra `node -v` phải ≥ 18):
   ```bash
   sudo apt-get update && sudo apt-get install -y nodejs npm git
   ```
2. Clone và vào thư mục project:
   ```bash
   git clone <URL-repo>
   cd omnichannel-order-demo
   ```
3. Cài dependencies:
   ```bash
   npm install
   ```
4. Chạy server:
   ```bash
   npm start
   ```
5. Mở trình duyệt vào <http://localhost:3000>.

### Đổi cổng nếu 3000 đã bị chiếm

Cổng đọc từ biến môi trường `PORT` (khai báo trong `server.js`, dòng `const PORT = process.env.PORT || 3000;`):

```bash
# Linux/macOS
PORT=4000 npm start

# Windows CMD
set PORT=4000 && npm start

# Windows PowerShell
$env:PORT=4000; npm start
```

## 4. Tài khoản demo có sẵn

Dữ liệu seed tự tạo sẵn 2 tài khoản để đăng nhập thử ngay:

| Tài khoản | Mật khẩu | Vai trò |
|---|---|---|
| `admin` | `admin123` | **admin** — xử lý đơn (OMS/WMS/TMS), quản lý tồn kho |
| `khach1` | `khach123` | **customer** — đặt hàng, theo dõi đơn |

Có thể đăng ký thêm tài khoản khách mới qua trang **Đăng ký**.

## 5. Vận hành thử luồng đầy đủ

1. **Đăng nhập customer** (`khach1` / `khach123`) → chọn sản phẩm ở trang chủ → **Thêm vào giỏ** → vào **Giỏ hàng** → **Tiến hành đặt hàng**: điền số điện thoại, chọn *kênh đặt hàng* (online/app/fanpage/tại quầy) và *cách nhận hàng* (giao tận nơi thì nhập địa chỉ) → **Xác nhận đặt hàng**. Đơn ở trạng thái **Chờ xác nhận**.
2. **Đăng xuất** → **đăng nhập admin** (`admin` / `admin123`) → tự chuyển vào trang **`/admin`**.
3. Ở dashboard, bấm **Xử lý →** vào đơn vừa đặt, thao tác lần lượt:
   - **OMS xác nhận** — hệ thống kiểm tra tồn kho từng sản phẩm (WMS): đủ hàng thì trừ kho, thiếu hàng thì báo lỗi và cho hủy đơn;
   - **Bắt đầu lấy hàng** (picking);
   - **Đóng gói xong** (packing);
   - **TMS bắt đầu giao** — tự sinh **mã vận đơn** dạng `VD-XXXXXX` (đơn nhận tại nhà thuốc thì thay bằng nút **Khách đã nhận hàng**);
   - **Giao hàng thành công** — đơn hoàn tất.
4. **Đăng xuất** → đăng nhập lại **customer** → vào **Đơn hàng của tôi** → mở đơn: timeline trạng thái đã cập nhật đủ các bước kèm mã vận đơn.

Ngoài ra ở phía admin có trang **Tồn kho** (`/admin/inventory`) để cập nhật số lượng tồn; sản phẩm có tồn **dưới 10** được tô màu cảnh báo ⚠️ ở cả dashboard và trang tồn kho.

## 6. Lưu ý khi sử dụng

- Đây là **bản demo/mô phỏng cho mục đích học tập**, không phải hệ thống thật: **không có thanh toán trực tuyến** (mặc định coi như COD), **mã vận đơn và quá trình giao hàng là giả lập** (không có định vị/đơn vị vận chuyển thật).
- Toàn bộ dữ liệu lưu trong file **`data/app.db`** (SQLite). Muốn **reset về dữ liệu seed ban đầu**, tắt server rồi xóa file này — lần chạy kế tiếp sẽ tự tạo lại database và seed 2 tài khoản + ~10 sản phẩm mẫu.
- Không dùng cho môi trường production (session secret mặc định, chưa có HTTPS/CSRF).
