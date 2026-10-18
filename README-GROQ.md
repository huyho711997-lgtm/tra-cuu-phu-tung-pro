# Chuyển giữa Gemini và Groq

Bản sửa dựa trên commit `ef60cab` của repository `huyho711997-lgtm/tra-cuu-phu-tung-pro`.

## Cách dùng

1. Đăng nhập ứng dụng, mở **Cài đặt AI** tại màn hình tra cứu hoặc báo giá.
2. Trong **Nhà cung cấp AI**, chọn **Gemini** hoặc **Groq · GPT-OSS 120B**.
3. Với Groq, tạo key tại https://console.groq.com/keys bằng tài khoản **Free**, dán vào ô **Groq API key**, bấm **Lưu cấu hình**.
4. Lựa chọn này áp dụng cho tìm một/nhiều tên phụ tùng, đối chiếu loại chi tiết, đánh giá giá và phân tích báo giá/biên bản.
5. Khi cần dùng lại Gemini, chọn Gemini. Key của hai bên được giữ riêng.

Lựa chọn Gemini/Groq và Groq key được lưu trong localStorage riêng theo tài khoản trên trình duyệt đang dùng. Chúng không đồng bộ sang thiết bị khác. Cấu hình Gemini/OCR.Space tiếp tục sử dụng cơ chế Supabase hiện có. Không cần sửa schema hoặc triển khai lại Edge Function.

## Ảnh/PDF và hạn mức

GPT-OSS 120B chỉ nhận văn bản. Với ảnh/PDF báo giá hoặc biên bản, nhập thêm OCR.Space API key ở phần cài đặt báo giá; ứng dụng gọi OCR.Space lấy chữ rồi đưa văn bản cho Groq. Excel/CSV/TXT không cần OCR.Space. Các cách đọc DOCX bằng bộ xử lý nội bộ hiện có được giữ nguyên.

Tại mục **Công cụ đọc báo giá**, chọn **AI đã chọn · Gemini hoặc Groq** để phân tích bằng AI. Mục **OCR.Space — OCR miễn phí + parser nội bộ** vẫn là cách đọc báo giá riêng không qua mô hình AI.

Ứng dụng không tự nâng cấp tài khoản hay tự chuyển nhà cung cấp khi lỗi. Groq dùng cùng model ID cho Free và Paid; để không phát sinh chi phí, dùng tài khoản Groq Free, không nâng cấp Developer. Hết hạn mức sẽ hiển thị lỗi; không tự thử lại Groq. Một thao tác có thể có nhiều lần gọi AI, nên hạn mức API không tương đương số lượt tra cứu. OCR.Space có hạn mức miễn phí riêng.

Không đưa API key vào mã nguồn hoặc file công khai. Vì đây là website tĩnh sử dụng key cá nhân, key được lưu trên trình duyệt người dùng và gửi trực tiếp đến nhà cung cấp khi sử dụng.

## Đưa bản sửa lên website

Gói ZIP chứa mã nguồn hoàn chỉnh. Giải nén, đưa nội dung vào repository hiện có rồi triển khai theo GitHub Pages/Vercel đang sử dụng. Giữ nguyên cấu hình deployment hiện tại.

Nếu chỉ cập nhật các file thay đổi, thay:

- `index.html`
- `assets/css/app.css`
- `assets/js/app-core.mjs`
- Thêm `assets/js/ai-provider.mjs`

`tests/ai-provider.test.mjs` và tài liệu này dành cho kiểm tra/hướng dẫn. Không cần cài thêm thư viện hay chạy build.

Sau khi triển khai, tải lại trang (Ctrl+F5), mở Cài đặt AI, chọn nhà cung cấp và nhập key của bạn.

## Kiểm tra

Chạy bằng Node.js 22 trở lên:

```sh
node --test tests/ai-provider.test.mjs
node --check assets/js/app-core.mjs
node --check assets/js/ai-provider.mjs
```

Kiểm thử dùng API/Supabase giả lập, không gọi API trả phí và không ghi vào dữ liệu thật. Giao diện Settings được kiểm tra bằng bản xem trước dùng markup và hàm cài đặt thực tế, với dữ liệu tài khoản giả. Chưa kiểm tra trực tiếp Groq bằng API key thật hoặc truy vấn kho bằng phiên đăng nhập thật.
