# Gemini / Groq và lưu API key trên Supabase

Bản tích hợp này dùng backend Supabase cho Gemini, Groq và OCR.Space.
API key được lưu mã hóa trong Vault; trình duyệt nhận thông tin đã cấu hình và bốn ký tự cuối.

Mở Cài đặt AI, chọn nhà cung cấp, nhập key mới và bấm Lưu cấu hình.
Để trống ô nhập để giữ key đã lưu. Nút Xóa đánh dấu gỡ key khi bấm Lưu.
Groq hỗ trợ ba key; backend thử key còn lại khi gặp 401/403/429, không chuyển nhà cung cấp.
Key trùng được bỏ qua. Các key cùng tổ chức vẫn dùng chung hạn mức của nhà cung cấp.

Ảnh/PDF khi chọn Groq được gửi qua OCR.Space ở backend rồi phân tích văn bản bằng Groq.
Gemini nhận ảnh/PDF qua backend. Tên phụ tùng gợi ý được đối chiếu với dữ liệu kho và bộ lọc xe hiện có.

Lượt dùng hiển thị theo revision của từng key. Các chỉ số ghi nhận trên thiết bị là ước tính từ những lượt gọi của thiết bị đó;
chỉ số từ header nhà cung cấp được chuyển về qua backend. Không cộng hạn mức nhiều key hoặc tự nâng cấp gói dịch vụ.

Xem [hướng dẫn triển khai Supabase](supabase/README.md) để chuyển dữ liệu, triển khai backend và cập nhật GitHub Pages.
Khi phát hành, triển khai đủ migration Vault, hai Edge Functions và frontend theo hướng dẫn.
