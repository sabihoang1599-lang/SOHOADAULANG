# Số Hóa Đầu Làng — bản khởi đầu

Bộ mã nguồn HTML/CSS/JavaScript kết nối Supabase, phù hợp để bắt đầu phát triển trên máy tính hoặc điện thoại.

## Các tệp
- `index.html`: giao diện đăng nhập và các màn hình chính.
- `style.css`: giao diện thích ứng điện thoại/máy tính.
- `config.js`: nơi điền Supabase Project URL và Publishable key.
- `app.js`: đăng ký/đăng nhập, tải địa bàn, tải thông báo, gửi email đặt lại mật khẩu.
- `schema.sql`: cấu trúc database và chính sách Row Level Security (RLS).

## Thiết lập Supabase
1. Mở Supabase Dashboard và chọn project.
2. Vào **Project Settings → API Keys**.
3. Sao chép **Project URL** và **Publishable key** vào `config.js`.
4. Vào **SQL Editor → New query**, mở `schema.sql`, dán toàn bộ nội dung và chạy.
5. Vào **Authentication → URL Configuration**, đặt Site URL theo địa chỉ triển khai của bạn. Khi phát triển local, thêm địa chỉ local phù hợp vào Redirect URLs.
6. Đăng ký tài khoản qua giao diện. Nếu bật xác minh email, hãy mở email và xác minh.
7. Để gán quyền quản trị hệ thống đầu tiên, lấy UUID tài khoản từ **Authentication → Users**, sau đó chạy câu SQL mẫu ở cuối `schema.sql`, thay `AUTH_USER_UUID_HERE` bằng UUID đúng. Chỉ làm việc này cho tài khoản quản trị được ủy quyền.

## Chạy giao diện
Có thể mở `index.html` để xem giao diện tĩnh, nhưng đăng nhập và xác minh email thường cần phục vụ qua HTTP/HTTPS. Nên triển khai bằng GitHub Pages, Netlify hoặc một máy chủ web tĩnh. Nếu dùng GitHub Pages, cấu hình URL chuyển hướng trong Supabase Auth tương ứng với URL trang của bạn.

## An toàn trước khi dùng thật
- Không đưa `Secret key`, `service_role key`, mật khẩu database, OTP hay thông tin nhạy cảm vào HTML/JS hoặc repository.
- Publishable key có thể nằm trong frontend chỉ khi RLS được bật và kiểm thử đúng.
- Tài khoản đăng ký mới mặc định là `user`, không tự có quyền quản trị.
- Các chính sách RLS trong `schema.sql` là điểm khởi đầu, cần được chuyên gia rà soát và kiểm thử trước khi lưu dữ liệu cá nhân hoặc tài liệu nội bộ.
- Màn hình phản ánh hiện chỉ lưu bản nháp trong trình duyệt, chưa gửi cho cơ quan/địa phương.
- Các thẻ lịch họp, tài liệu, nhiệm vụ hiện là giao diện mẫu, chưa có chức năng quản trị hoàn chỉnh.
- Cần thiết kế riêng quy trình phê duyệt bàn giao, đổi email, đổi username và quản lý tài liệu trước khi phát hành.
