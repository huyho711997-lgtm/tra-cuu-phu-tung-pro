# Tra cứu có hỏi bổ sung và kiến thức được duyệt

## Sử dụng

1. Chọn hãng, dòng xe và nhập tên phụ tùng; dùng **Tìm bằng AI** hoặc **Tìm nhiều phụ tùng**.
2. Trả lời các thông tin còn thiếu. Bản đầu hỗ trợ phân biệt loại máy nén, vị trí cản, bên xe của đèn/gương/cửa và công nghệ đèn pha. Nếu chưa chọn năm, có thể chọn từ các năm đang có trong bộ lọc. **Chưa rõ** giữ thông tin chưa xác định; có thể hủy tìm kiếm.
3. Kiểm tra tên kho. Dùng **Bổ sung / sửa mô tả** để chỉnh yêu cầu; thao tác này tạo phiên mới và chạy lại phần đối chiếu. Mô tả gốc của phiên cũ được giữ nguyên.
4. Chọn các tên đúng, ghi chú nếu cần và bấm **Xác nhận đúng tên đã chọn**. Việc chọn checkbox hoặc xem báo giá chỉ ghi nhận lựa chọn, chưa tạo kiến thức được duyệt.
5. Nếu chưa có kết quả đúng, chọn **Chưa có tên phù hợp**. Hệ thống bỏ các lựa chọn hiện tại và ghi nhận để quản trị viên xem xét.

## Lịch sử và duyệt

Nút **Lịch sử & kiến thức tìm kiếm** nằm ở phần tra cứu. Người dùng xem lịch sử của mình, bao gồm cả lượt tìm kiếm thường (không phát sinh câu hỏi hay dùng AI).

Quản trị viên có thêm các mục **Chờ duyệt**, **Đã duyệt**, **Từ chối**, **Ngừng áp dụng**, **Cần cải thiện**. Mỗi trang danh sách có 30 bản ghi. Thống kê tổng hợp tối đa 500 phiên gần nhất và ghi rõ phạm vi này.

Khi duyệt, kiểm tra bằng chứng nguồn, tên trong kho và phạm vi hãng/dòng/năm/loại hàng; nhập căn cứ và đánh dấu đã kiểm tra. Có thể sửa phạm vi, từ chối, ngừng áp dụng hoặc chuyển về chờ duyệt. Mỗi thay đổi có lịch sử người thực hiện và thời điểm. Lưu bị từ chối nếu người khác đã sửa bản ghi kể từ khi mở.

## Áp dụng kiến thức

- Chỉ dùng bản ghi `approved`, đối chiếu bằng tên gọi đã chuẩn hóa.
- Phạm vi hãng, tập dòng xe, tập năm và loại hàng phải trùng với lượt tìm kiếm. Phạm vi chưa giới hạn năm chỉ dùng cho lượt tìm kiếm cũng chưa giới hạn năm.
- Kiểm tra tên thực tế vẫn có trong kho theo đầy đủ bộ lọc và quyền của người đang đăng nhập.
- Các quy tắc phân biệt loại chi tiết/vị trí vẫn có hiệu lực. Nếu câu trả lời còn thiếu, không tự chọn tên chưa đủ căn cứ.
- Nếu không có kiến thức áp dụng được, tiếp tục luồng AI hiện có. Việc bổ sung kiến thức không huấn luyện lại mô hình.

## Dữ liệu và quyền

Project Supabase: `yxwmcpoklxpzlikxojez`.

- `parts_search_sessions`: nội dung gốc, mô tả sau bổ sung, bộ lọc, câu trả lời, tên đã gợi ý, lựa chọn, kết quả và trạng thái xác nhận.
- `parts_search_knowledge`: đề nghị tên gọi và phạm vi, trạng thái duyệt, ghi chú và nguồn.
- `parts_search_knowledge_audit`: lịch sử duyệt/chỉnh sửa do trigger tạo; người dùng không được sửa.
- `kgpt_confirm_parts_search`: xác nhận và tạo đề nghị trong cùng transaction, chạy theo quyền người gọi. Chỉ chấp nhận tên đã có trong phiên thuộc người gọi.

Các bảng bật RLS, không cấp quyền cho người chưa đăng nhập. Lịch sử chỉ cho chủ tài khoản và quản trị viên hoạt động; chỉ quản trị viên được thay đổi trạng thái kiến thức. Quyền tra cứu được kiểm tra bằng `kgpt_has_permission`. API key, file báo giá và thông tin đăng nhập không được đưa vào dữ liệu học này.

Sau khi hoàn tất bổ sung, nội dung và phạm vi của phiên được cố định. Lựa chọn có thể cập nhật, nhưng mô tả mới phải tạo phiên mới. Kiến thức và lịch sử duyệt được giữ khi tài khoản nguồn bị xóa; tham chiếu tài khoản/phiên được bỏ theo ràng buộc khóa ngoại.

Hai migration triển khai: `20261019065723_parts_search_learning.sql`, `20261019070340_parts_search_evidence_integrity.sql`.
