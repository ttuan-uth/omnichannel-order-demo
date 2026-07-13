# Omnichannel Order Demo — E-Logistics nhà thuốc

## 1. Giới thiệu

Website demo mô phỏng quy trình **E-Logistics omnichannel** của một chuỗi nhà thuốc (lấy cảm hứng từ mô hình Long Châu):

**Đặt hàng → OMS (xác nhận đơn) → WMS (kiểm tra & trừ kho) → Picking → Packing → TMS (giao hàng) → Hoàn tất / Lịch sử đơn hàng.**

Khách hàng đặt thuốc qua nhiều kênh (website, app, fanpage, tại quầy), chọn giao tận nơi hoặc nhận tại nhà thuốc, thanh toán COD hoặc online; quản trị viên xử lý đơn qua từng bước OMS/WMS/TMS, hệ thống tự sinh mã vận đơn và ghi lại toàn bộ lịch sử trạng thái.

Các nhóm tính năng chính: **đặt hàng đa kênh** (online/app/fanpage/tại quầy, COD/thanh toán online), **theo dõi đơn theo thời gian thực** (timeline trạng thái + mã vận đơn), **quản trị OMS/WMS/TMS** (xác nhận đơn, kiểm/trừ/hoàn kho, picking, packing, giao hàng, hủy đơn có lý do, cảnh báo tồn kho), **tìm kiếm/lọc sản phẩm** (tìm theo tên không phân biệt hoa thường, sắp xếp theo tên/giá), **thông báo** (chuông + badge cho từng lần đổi trạng thái đơn) và **quản lý tài khoản** (đổi tên/tên đăng nhập/mật khẩu, lịch sử xem hàng, lịch sử giao dịch).

Project phục vụ **mục đích học tập / báo cáo**, không phải hệ thống thương mại.

**Source:** Node.js + Express, SQLite (better-sqlite3), EJS + CSS thuần, express-session + bcrypt.

## 2. Yêu cầu hệ thống

- **Node.js 18 (LTS) trở lên** — cần cho `better-sqlite3` và cú pháp hiện đại. Kiểm tra bằng `node -v`.
- **git** để clone mã nguồn.
- Không cần cài SQLite riêng — database là file `data/app.db`, tự tạo và seed dữ liệu mẫu ở lần chạy đầu.

## 3. Cài đặt và chạy

### Windows

1. Cài Node.js từ <https://nodejs.org> (chọn bản **LTS**, cài mặc định).
2. Clone repo rồi mở terminal (CMD hoặc PowerShell) tại thư mục project:
   ```
   git clone <https://github.com/ttuan-uth/omnichannel-order-demo>
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

> Khi phát triển có thể chạy `npm run dev` (dùng `node --watch`, tự khởi động lại khi sửa code).

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

Có thể đăng ký thêm tài khoản khách mới qua trang **Đăng ký** (mặc định vai trò `customer`).

## 5. Vận hành thử luồng đầy đủ

### A. Phía khách hàng — đặt hàng

1. **Đăng nhập customer** (`khach1` / `khach123`).
2. Ở **trang chủ** (lưới 4 sản phẩm/hàng): **tìm kiếm sản phẩm theo tên** (ô tìm kiếm, không phân biệt hoa/thường — gõ `panadol` vẫn ra "Panadol Extra") và **sắp xếp** (tên A→Z / Z→A, giá tăng / giảm). Mỗi thẻ sản phẩm hiển thị giá, tồn kho và **số lượng đã bán**.
3. Bấm vào một sản phẩm để xem **trang chi tiết** (mô tả, giá, tồn kho); mỗi lượt xem của khách đã đăng nhập được ghi lại để hiển thị ở mục *Lịch sử xem hàng*.
4. **Thêm vào giỏ** → vào **Giỏ hàng**: sửa số lượng, xóa sản phẩm (tổng số lượng mỗi sản phẩm không vượt quá tồn kho, hệ thống tự điều chỉnh và cảnh báo).
5. **Tiến hành đặt hàng (checkout)**:
   - Nhập **tên người nhận** và **số điện thoại** (validate định dạng số VN ở cả trình duyệt lẫn server);
   - Chọn **kênh đặt hàng**: online / app / fanpage / tại quầy (giả lập omnichannel);
   - Chọn **cách nhận hàng**: *giao tận nơi* (bắt buộc nhập địa chỉ) hoặc *nhận tại nhà thuốc*;
   - Chọn **phương thức thanh toán**: **COD** (thanh toán khi nhận) hoặc **online** (nhập thông tin thẻ để validate định dạng nhưng **không lưu**; đơn được đánh dấu *đã thanh toán* ngay).
   - **Xác nhận đặt hàng** → đơn ở trạng thái **Chờ xác nhận**.

### B. Phía admin — xử lý đơn (OMS/WMS/TMS)

6. **Đăng xuất** → **đăng nhập admin** (`admin` / `admin123`) → tự vào trang **`/admin`**. Dashboard hiển thị số đơn theo từng trạng thái và **khối cảnh báo tồn kho** (tách riêng nhóm *Hết hàng* tồn = 0 màu đỏ và *Sắp hết hàng* tồn 1–9 màu vàng; nếu không có sản phẩm nào dưới ngưỡng thì báo rõ "Không có mặt hàng nào dưới 10 sản phẩm trong kho").
7. Bấm **Xử lý →** vào đơn vừa đặt, thao tác lần lượt:
   - **OMS xác nhận** — hệ thống kiểm tra tồn kho từng sản phẩm (WMS): đủ hàng thì trừ kho, thiếu hàng thì báo lỗi và cho hủy đơn;
   - **Bắt đầu lấy hàng** (picking);
   - **Đóng gói xong** (packing);
   - **TMS bắt đầu giao** — tự sinh **mã vận đơn** dạng `VD-XXXXXX` (đơn *nhận tại nhà thuốc* thì thay bằng nút **Khách đã nhận hàng**);
   - **Giao hàng thành công** — đơn hoàn tất, hệ thống **cộng dồn số lượng đã bán** của từng sản phẩm.
   - **Xác nhận đã thu tiền COD** — với đơn thanh toán **COD**, khi đơn đang ở trạng thái **Đang giao hàng (TMS)** hoặc **Đã giao / hoàn tất**, admin bấm nút **"Xác nhận đã thu tiền COD"** để đánh dấu đơn đã thanh toán (badge chuyển từ **"Chưa thanh toán"** sang **"Đã thanh toán"**). Nếu bấm nhầm, bấm **"Hoàn tác"** để quay lại trạng thái chưa thanh toán. Nút này **chỉ xuất hiện ở 2 trạng thái nói trên**, không hiện ở các bước sớm hơn (chờ xác nhận, đã xác nhận, đang lấy hàng, đã đóng gói) vì lúc đó hàng chưa tới tay khách. Riêng đơn **thanh toán online** được tự động đánh dấu *đã thanh toán* ngay từ lúc checkout nên không cần thao tác này.
   - Trước bước *đang giao*, admin có thể **Hủy đơn** — bắt buộc nhập **lý do hủy**; nếu đã trừ kho thì hoàn kho lại.
   - Mỗi lần chuyển trạng thái đều **gửi thông báo cho khách hàng** chủ đơn.

### C. Phía khách hàng — theo dõi, nhận hàng, thông báo, tài khoản

8. **Đăng xuất** → đăng nhập lại **customer** → vào **Đơn hàng của tôi** → mở đơn: **timeline trạng thái** cập nhật đủ các bước kèm **mã vận đơn**, **phương thức + trạng thái thanh toán**, và **lý do hủy** nếu đơn bị hủy.
9. Khi đơn ở trạng thái **đang giao**, khách có thể tự bấm **"Xác nhận đã nhận hàng"** → đơn chuyển sang *đã giao* (do khách xác nhận), gửi thông báo cho admin.
10. Bấm **icon chuông 🔔** trên đầu trang để xem **thông báo** (badge đếm số chưa đọc): mỗi lần đơn đổi trạng thái khách nhận một thông báo; bấm vào sẽ đánh dấu đã đọc và mở đúng đơn liên quan.
11. Vào **Tài khoản của tôi** (`/account`):
    - Xem thông tin tài khoản; **đổi họ tên / tên đăng nhập** và **đổi mật khẩu** (form đổi mật khẩu có nút 👁️ hiện/ẩn cho từng ô);
    - Xem **Lịch sử xem hàng** (các sản phẩm đã xem) và **Lịch sử giao dịch** (danh sách đơn + link chi tiết). *(Hai mục lịch sử này chỉ hiển thị cho khách hàng; tài khoản admin chỉ thấy phần thông tin + đổi tên/mật khẩu.)*

### D. Quản lý tồn kho (admin)

12. Trang **Tồn kho** (`/admin/inventory`): xem và cập nhật số lượng tồn từng sản phẩm; sản phẩm **hết hàng** (tồn = 0) tô đỏ + nhãn "Hết hàng", **sắp hết** (0 < tồn < 10) tô vàng + "Sắp hết"; có cột **Đã bán**. Cùng khối cảnh báo tồn kho như ở dashboard.

## 6. Lưu ý khi sử dụng

- Đây là **bản demo/mô phỏng cho mục đích học tập**, không phải hệ thống thật: **thanh toán online chỉ là giả lập** (validate định dạng thẻ rồi bỏ, **không lưu thông tin thẻ**), **mã vận đơn và quá trình giao hàng là giả lập** (không có định vị/đơn vị vận chuyển thật).
- Toàn bộ dữ liệu lưu trong file **`data/app.db`** (SQLite). Muốn **reset về dữ liệu seed ban đầu**, tắt server rồi xóa file này — lần chạy kế tiếp sẽ tự tạo lại database và seed 2 tài khoản + ~8–10 sản phẩm mẫu.
- Không dùng cho môi trường production (session secret mặc định, chưa có HTTPS/CSRF).
