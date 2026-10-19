# Quản lý lịch sử và kiến thức tìm kiếm

## Trang quản lý riêng

Quản trị viên mở **Công cụ hệ thống → Lịch sử & kiến thức tìm kiếm** hoặc vào **?view=knowledge** sau khi đăng nhập.

- **Tổng quan:** chỉ số theo các phiên tạo trong bộ lọc; bảng phân tích tối đa 500 phiên mới nhất, ưu tiên nội dung không có kết quả/gặp lỗi.
- **Phiên tra cứu:** nội dung, phạm vi xe, tài khoản, tên gợi ý, lựa chọn và liên kết lượt tìm trước nếu có.
- **Thao tác:** thời điểm ghi nhận tìm kiếm, nhận kết quả, thay đổi lựa chọn, mở giá và lỗi.
- **Chờ duyệt / Đã duyệt / Ngừng áp dụng / Từ chối:** quản lý tên gọi, tên kho và phạm vi áp dụng.

Lọc theo ngày, tài khoản, nội dung và kiểu tra cứu. Danh sách có 25 dòng/trang. Xuất CSV chỉ gồm trang hiện tại, hoặc mẫu tối đa 500 phiên ở Tổng quan. Chỉ số tổng hợp theo phiên được tính tại máy chủ.

## Thu thập trong nền

Luồng tra cứu không mở câu hỏi bổ sung và không yêu cầu xác nhận kiến thức. Bộ lọc do người dùng chọn được giữ nguyên.

Ứng dụng ghi nhận nội dung đã gửi tìm, bộ lọc xe, tên gợi ý, kết quả tìm được/không tìm được/lỗi, thay đổi lựa chọn và thao tác mở giá thành công. Với tìm thường, ghi nhận tên khi người dùng mở chi tiết kết quả. Hai lượt tìm khác nội dung trong cùng phạm vi, cùng chế độ thường hoặc AI, cách nhau không quá 5 phút, có thể được liên kết nếu lượt trước đã lưu trong cùng phiên trình duyệt.

Không thu phím gõ chưa gửi, hoạt động ngoài ứng dụng, màn hình, API key hay file báo giá. Thanh bên có thông báo ngắn về việc ghi nhận hoạt động tra cứu.

Việc lưu xếp hàng trong nền; lỗi lưu không ngăn tìm/mở giá. Mỗi phiên lưu tối đa 40 tên và mô tả tối đa 180 ký tự. Thời điểm thao tác là thời điểm máy chủ ghi nhận. Chọn hoặc mở một tên chưa xác nhận tính đúng loại.

## Từ hành vi thành gợi ý kiến thức

RPC **kgpt_observe_parts_search** ghi thao tác mở giá và tạo gợi ý **pending**, nguồn **observed**, trong cùng transaction. Chỉ chấp nhận tên có trong phiên của người gọi; cần hãng và dòng xe để tạo gợi ý. Chọn checkbox đơn thuần chưa tạo kiến thức áp dụng.

Quản trị viên xem bằng chứng, kiểm tra nghiệp vụ, nhập căn cứ rồi duyệt. Tín hiệu tự động có nhãn riêng với xác nhận theo luồng cũ. Dữ liệu cũ được giữ; RPC xác nhận cũ còn để tương thích, nhưng giao diện mới không gọi luồng đó.

Chỉ kiến thức **approved** được dùng lại. Hãng, tập dòng xe, tập năm, loại hàng phải trùng phạm vi; tên phải còn trong kho và qua quyền tài khoản tra cứu. Kiểm tra loại chi tiết/vị trí vẫn có hiệu lực. Không có quy tắc phù hợp thì dùng dịch vụ AI hiện có. Tích lũy kiến thức không huấn luyện lại mô hình.

## Dữ liệu và quyền

Project Supabase: **yxwmcpoklxpzlikxojez**.

- **parts_search_sessions:** chủ tài khoản và quản trị viên hoạt động được đọc; người dùng chỉ ghi phiên của mình. Mô tả/phạm vi cố định sau khi bắt đầu.
- **parts_search_events:** chỉ thêm sự kiện cho phiên của mình; không cấp sửa/xóa qua trình duyệt. Quản trị viên xem bằng chứng.
- **parts_search_knowledge:** gợi ý tự động chờ duyệt; chỉ quản trị viên đổi trạng thái/phạm vi.
- **parts_search_knowledge_audit:** trigger lưu người thực hiện và thời điểm duyệt/chỉnh sửa; người dùng không được sửa.
- **kgpt_parts_search_overview:** chỉ quản trị viên hoạt động được gọi để đọc tổng hợp.

Tất cả bảng bật RLS, không cấp quyền cho người chưa đăng nhập. RPC mới chạy theo quyền người gọi. Trang quản lý chỉ mở cho quản trị viên. Đổi tài khoản sẽ xóa dữ liệu trang quản lý, hộp chi tiết và bộ nhớ thu thập cục bộ khỏi giao diện.

Migration bổ sung: **20261019072849_passive_parts_search_capture.sql**.
