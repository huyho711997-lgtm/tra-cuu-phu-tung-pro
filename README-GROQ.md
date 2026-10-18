# Chuyển giữa Gemini và Groq

## Tối đa 3 Groq key

Cài đặt AI có 3 ô key dạng mật khẩu. Key 1 cũ được giữ nguyên; Key 2 và Key 3 là tùy chọn. Chọn **Key ưu tiên / xem mức dùng** để đặt key bắt đầu và xem 4 chỉ số riêng của key đó. Cấu hình lưu trên trình duyệt, tách theo tài khoản đăng nhập ứng dụng; không đưa các key lên repository hoặc đồng bộ vào cơ sở dữ liệu.

Khi Groq trả 429, hệ thống tạm bỏ qua key theo thời gian phục hồi và thử key còn lại. Key trả 401/403 cũng được bỏ qua trong lượt đó. Mỗi lượt thử tối đa một lần cho mỗi key riêng biệt, không quá 3 key; key trống hoặc trùng được bỏ qua. Khi thành công, ứng dụng ghi nhớ key đó cho lần sau. Khi tất cả key đều không khả dụng, hệ thống dừng và báo lỗi; không tự chuyển nhà cung cấp hoặc nâng cấp tài khoản. Lỗi mạng, timeout, lỗi máy chủ, dữ liệu sai hoặc kết quả bị cắt không tự chuyển key để tránh gửi lặp.

Lượt gọi thất bại và thành công được ghi nhận riêng cho đúng key. Hạn mức do Groq quyết định theo tổ chức; không cộng hạn mức trong giao diện. Nhiều key cùng tổ chức không tăng hạn mức. Groq cấm đăng ký nhiều tài khoản hoặc điều phối nhiều tổ chức để vượt giới hạn: https://console.groq.com/docs/legal/ai-policy.

## Theo dõi hạn mức Groq

Mở **Cài đặt AI**, chọn Groq để xem bảng **Đã sử dụng · GPT-OSS 120B** gồm yêu cầu/phút, yêu cầu/ngày, token/phút và token/ngày. Bảng tự cập nhật khi dùng AI và khi thời gian phục hồi thay đổi; không gọi thêm API để làm mới số liệu.

Yêu cầu/ngày và token/phút ưu tiên các header hạn mức từ phản hồi Groq, nếu trình duyệt được phép đọc chúng. Các số liệu còn lại được ghi nhận trên trình duyệt này, riêng theo tài khoản và key; không bao gồm những lần gọi trước khi có tính năng hoặc từ thiết bị khác. Số liệu nội bộ theo ngày UTC, còn số liệu máy chủ theo thời gian phục hồi do Groq trả về. Khi header không đọc được, giao diện gắn nhãn số liệu ghi nhận trên máy này.

Token được tính từ `usage` của phản hồi, có loại phần input đã cache khi được cung cấp. Lượt gọi thất bại hoặc chưa trả usage sẽ hiển thị thông báo rằng tổng token có thể chưa đầy đủ. Việc ghi nhận vẫn thực hiện nếu AI đã tiêu thụ token nhưng trả JSON lỗi hoặc kết quả bị cắt. Số liệu có thể mất nếu xóa dữ liệu trang; không lưu API key hoặc nội dung báo giá trong bảng ghi sử dụng.

Bản sửa dựa trên commit `ef60cab` của repository `huyho711997-lgtm/tra-cuu-phu-tung-pro`.

## Cách dùng

1. Đăng nhập ứng dụng, mở **Cài đặt AI** tại màn hình tra cứu hoặc báo giá.
2. Trong **Nhà cung cấp AI**, chọn **Gemini** hoặc **Groq · GPT-OSS 120B**.
3. Với Groq, lấy key tại https://console.groq.com/keys bằng tài khoản **Free**, nhập tối đa 3 key và chọn key ưu tiên, bấm **Lưu cấu hình**.
4. Lựa chọn này áp dụng cho tìm một/nhiều tên phụ tùng, đối chiếu loại chi tiết, đánh giá giá và phân tích báo giá/biên bản.
5. Khi cần dùng lại Gemini, chọn Gemini. Key của hai bên được giữ riêng.

Lựa chọn Gemini/Groq và Groq key được lưu trong localStorage riêng theo tài khoản trên trình duyệt đang dùng. Chúng không đồng bộ sang thiết bị khác. Cấu hình Gemini/OCR.Space tiếp tục sử dụng cơ chế Supabase hiện có. Không cần sửa schema hoặc triển khai lại Edge Function.

## Ảnh/PDF và hạn mức

GPT-OSS 120B chỉ nhận văn bản. Với ảnh/PDF báo giá hoặc biên bản, nhập thêm OCR.Space API key ở phần cài đặt báo giá; ứng dụng gọi OCR.Space lấy chữ rồi đưa văn bản cho Groq. Excel/CSV/TXT không cần OCR.Space. Các cách đọc DOCX bằng bộ xử lý nội bộ hiện có được giữ nguyên.

Tại mục **Công cụ đọc báo giá**, chọn **AI đã chọn · Gemini hoặc Groq** để phân tích bằng AI. Mục **OCR.Space — OCR miễn phí + parser nội bộ** vẫn là cách đọc báo giá riêng không qua mô hình AI.

Ứng dụng không tự nâng cấp tài khoản hay tự chuyển nhà cung cấp khi lỗi. Groq dùng cùng model ID cho Free và Paid; để không phát sinh chi phí, dùng tài khoản Groq Free, không nâng cấp Developer. Hết hạn mức có thể chuyển sang key còn lại như mô tả ở trên; khi tất cả key hết hạn mức sẽ hiển thị lỗi. Một thao tác có thể có nhiều lần gọi AI, nên hạn mức API không tương đương số lượt tra cứu. OCR.Space có hạn mức miễn phí riêng.

Không đưa API key vào mã nguồn hoặc file công khai. Vì đây là website tĩnh sử dụng key cá nhân, key được lưu trên trình duyệt người dùng và gửi trực tiếp đến nhà cung cấp khi sử dụng.

## Đưa bản sửa lên website

Gói ZIP chứa mã nguồn hoàn chỉnh. Giải nén, đưa nội dung vào repository hiện có rồi triển khai theo GitHub Pages/Vercel đang sử dụng. Giữ nguyên cấu hình deployment hiện tại.

Nếu chỉ cập nhật các file thay đổi, thay:

- `index.html`
- `assets/css/app.css`
- `assets/js/app-core.mjs`
- Thêm `assets/js/ai-provider.mjs`
- Thêm `assets/js/groq-usage.mjs`
- Thêm `assets/js/groq-key-pool.mjs`

`tests/ai-provider.test.mjs` và tài liệu này dành cho kiểm tra/hướng dẫn. Không cần cài thêm thư viện hay chạy build.

Sau khi triển khai, tải lại trang (Ctrl+F5), mở Cài đặt AI, chọn nhà cung cấp và nhập key của bạn.

## Kiểm tra

Chạy bằng Node.js 22 trở lên:

```sh
node --test tests/ai-provider.test.mjs
node --test tests/groq-usage.test.mjs
node --test tests/groq-key-pool.test.mjs
node --check assets/js/app-core.mjs
node --check assets/js/ai-provider.mjs
```

Kiểm thử dùng API/Supabase giả lập, không gọi API trả phí và không ghi vào dữ liệu thật. Giao diện Settings được kiểm tra bằng bản xem trước dùng markup và hàm cài đặt thực tế, với dữ liệu tài khoản giả. Chưa kiểm tra trực tiếp Groq bằng API key thật hoặc truy vấn kho bằng phiên đăng nhập thật.
