# Quản lý lịch sử và kiến thức tìm kiếm

## Tự động an toàn

Thao tác mở giá vẫn lưu lịch sử, nhưng nếu tên tìm và tên kho chỉ khác chữ hoa/thường, khoảng trắng hoặc biểu diễn Unicode NFC thì không tạo gợi ý chờ duyệt mới. Không bỏ dấu tiếng Việt, dấu câu, mã phụ tùng hoặc vị trí để suy ra cùng tên. Quy tắc đã tồn tại trong cùng phạm vi không tạo lại hàng chờ; quyết định từ chối/ngừng áp dụng được giữ.

Khi quản trị viên mở **Gợi ý chờ duyệt**, máy chủ tự đánh giá tối đa 25 mục trên trang. Chỉ tự duyệt khi tên tương đương theo quy tắc trên, hoặc trùng một quy tắc **do quản trị viên duyệt thủ công** với cùng tên kho và đúng toàn bộ hãng, tập dòng xe, tập năm và loại hàng. Tên kho phải còn trong dữ liệu đúng bộ lọc. Quyết định từ chối/ngừng áp dụng cùng phạm vi chặn tự duyệt.

Các tên gọi mới vẫn ở trạng thái chờ duyệt, có lý do hoặc nhãn chạy thử; không dùng số lượt mở giá hay kết luận AI làm căn cứ duy nhất để tự duyệt. Không gọi thêm AI để xét duyệt. Nếu chưa nhận được kết quả kiểm tra tự động, giao diện không đánh dấu thành công; bấm Làm mới để đọc trạng thái máy chủ trước khi tiếp tục.

Mục đã xử lý giữ nguyên vị trí trên trang. Nhãn **Tự duyệt · Cùng tên, khác cách viết** hoặc **Tự duyệt · Quy tắc đã xác nhận** phân biệt nguồn quyết định. Mở **Nguồn & lịch sử** để xem `review_method`, lý do, quy tắc nguồn, người thực hiện và thời điểm. Vẫn có nút **Ngừng áp dụng** ở tab Đã duyệt. Khi quy tắc nguồn ngừng áp dụng hoặc thay đổi tên/phạm vi, các quy tắc kế thừa cũng được ngừng áp dụng.

RPC xét duyệt chỉ cho quản trị viên hoạt động, chạy theo quyền người gọi và RLS. Không thêm quyền duyệt cho người dùng tra cứu. Migration: `20261019122606_parts_knowledge_safe_automation.sql`.

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

Quản trị viên bấm **Duyệt** trực tiếp trên dòng, hoặc chọn các gợi ý trong trang rồi **Duyệt đã chọn**. Không mở hộp xác nhận, không yêu cầu ghi chú hay đánh dấu xác nhận nghiệp vụ. **Từ chối** và **Ngừng áp dụng** cũng thao tác trực tiếp trên danh sách. **Nguồn** dùng để xem bằng chứng khi cần; **Chỉnh sửa** cho phép sửa tên/phạm vi, lưu thay đổi hoặc lưu và duyệt, ghi chú không bắt buộc.

Chọn cả trang chỉ gồm các gợi ý đang hiển thị (tối đa 25), không bao gồm các trang khác. Khi lưu, từng bản ghi được kiểm tra phiên bản để tránh ghi đè thay đổi đồng thời; lỗi từng phần được báo rõ. Máy chủ vẫn ghi người duyệt, thời điểm và lịch sử thay đổi. Tín hiệu tự động có nhãn riêng với xác nhận theo luồng cũ. Dữ liệu cũ được giữ; RPC xác nhận cũ còn để tương thích, nhưng giao diện mới không gọi luồng đó.

Duyệt, từ chối, ngừng áp dụng và lưu chỉnh sửa cập nhật ngay dòng hiện tại, không tải lại bảng. Dòng đã xử lý được giữ tại chỗ và hiện trạng thái mới để không làm nhảy vị trí cuộn; các dòng chưa xử lý vẫn giữ lựa chọn. Thống kê cập nhật trong nền. **Gợi ý tiếp theo** lấy tiếp sau các dòng chưa xử lý trên trang; chuyển trang, đổi bộ lọc hoặc Làm mới sẽ nạp lại danh sách từ máy chủ.

Nút và dòng đang lưu hiện trạng thái ngay khi bấm; chỉ dòng đó bị khóa, các dòng khác vẫn có thể chọn và duyệt tiếp. Chuyển trang/bộ lọc tạm khóa đến khi các thao tác lưu hoàn tất. Duyệt nhiều dòng cập nhật từng dòng ngay khi máy chủ phản hồi; chỉ hiện thành công sau khi lưu được. Nếu lỗi, dòng được mở lại để thử và có thông báo tại chỗ. Thanh chọn nhiều dòng bám khi cuộn; nút biểu tượng có nhãn trợ năng và chú thích khi trỏ chuột. Hiệu ứng tuân theo cài đặt giảm chuyển động của thiết bị.

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
