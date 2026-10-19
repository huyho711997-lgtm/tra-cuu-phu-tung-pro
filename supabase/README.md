# Backend AI bảo vệ API key

Project đích: `yxwmcpoklxpzlikxojez`.

## Trạng thái bản mã nguồn

Mã nguồn gồm migration Vault, Edge Function `kgpt-ai`, bản tra cứu `kgpt-ai-part-search` dùng Vault và giao diện tích hợp. Cần triển khai đủ các thành phần này khi phát hành. Kiểm thử tự động dùng key giả, không gọi nhà cung cấp AI thật.

## Cấu trúc

- Supabase Auth xác thực JWT bằng `getUser`, sau đó kiểm tra `user_profiles.status = active`.
- API key nằm trong Supabase Vault. Bảng ánh xạ và tùy chọn nằm trong schema `kgpt_private`, không được đọc trực tiếp bằng tài khoản người dùng.
- Các RPC `kgpt_ai_*` chỉ cấp quyền thực thi cho `service_role`; máy chủ tự lấy actor từ JWT đã xác minh. Người dùng không được tự khai actor hoặc dùng anon key để gọi RPC.
- Quản trị viên có thể thay/xóa key của tài khoản khác và quản lý quyền tự sửa. Thông tin trả về chỉ có revision, bốn ký tự cuối và tùy chọn; không trả key đầy đủ.
- Groq, Gemini và OCR.Space được gọi từ Edge Function. Endpoint nhà cung cấp cố định, không nhận URL do người dùng nhập.
- Giới hạn ứng dụng: 30 thao tác/phút và 1.000/ngày UTC cho mỗi tài khoản/nhóm thao tác; đây là giới hạn riêng của ứng dụng.
- Không ghi key, nội dung tài liệu hoặc lỗi thô của nhà cung cấp vào log.

## Thứ tự triển khai

1. Kiểm tra project và schema thật: bảng `user_profiles` có `id`, `role`, `status`; người dùng không được tự nâng `role` hoặc sửa `status`. Kiểm tra các bảng/view/RPC cũ có thể trả API key. Kiểm tra extension Vault và cấu hình RLS hiện tại trước khi áp dụng.
2. Triển khai Edge Function `kgpt-ai` từ `functions/kgpt-ai/index.ts` cùng `handler.mjs`, giữ kiểm tra JWT bật. Chuẩn bị bản `kgpt-ai-part-search` trong repository để chuyển sang đọc Vault ngay sau migration.
3. Áp dụng `migrations/20261019020022_secure_ai_vault.sql` trong một transaction. Migration chuyển Gemini/OCR key từ `user_api_keys` sang Vault, làm trống cột key cũ và thu hồi quyền truy cập trực tiếp bảng cũ. Nếu transaction lỗi, toàn bộ thay đổi được rollback.
4. Triển khai bản `kgpt-ai-part-search` đọc Vault và cập nhật frontend GitHub Pages ngay sau migration. Giao diện cũ gọi bảng cũ có thể ngừng dùng AI trong khoảng chuyển đổi; không khôi phục giao diện cũ riêng lẻ sau khi đã chuyển key.
5. Kiểm tra bằng tài khoản quản trị viên và tài khoản thường: lưu key thử, thấy bốn ký tự cuối, mở lại bằng thiết bị khác, giữ key khi ô trống, thay/xóa key, khóa tự sửa và chặn truy cập chéo. Không in hoặc truy xuất key thật để kiểm tra.
6. Kiểm tra endpoint chưa đăng nhập phải trả 401, tài khoản bị khóa trả 403; anon/authenticated không được gọi các RPC lưu/đọc credentials trực tiếp. Kiểm tra request AI trên trình duyệt chỉ tới `kgpt-ai`.

Supabase tự cấp `SUPABASE_URL` và `SUPABASE_SERVICE_ROLE_KEY` cho Edge Functions. Không đặt chúng trong frontend. Không tạo thêm key nếu project đã có cấu hình chuẩn.

Origin mặc định: `https://huyho711997-lgtm.github.io`. Nếu dùng tên miền khác, đặt secret `ALLOWED_ORIGINS` là danh sách origin cách nhau bằng dấu phẩy, không gồm đường dẫn. CORS chỉ là giới hạn trình duyệt; xác thực và phân quyền luôn do máy chủ thực hiện.

Nếu triển khai bằng CLI đã được đăng nhập:

```sh
supabase functions deploy kgpt-ai --project-ref yxwmcpoklxpzlikxojez
```

Áp dụng migration qua kết nối Supabase hoặc SQL Editor của đúng project, rồi cập nhật GitHub Pages. Không chạy `db push` đối với project đã có lịch sử migration chưa được kiểm tra.

## Key cũ trong trình duyệt

Sau khi đăng nhập, ứng dụng đọc cấu hình máy chủ và chuyển các key localStorage của đúng tài khoản lên Vault. Không ghi đè key đã tồn tại ở máy chủ. Chỉ xóa bản local sau khi xác nhận thành công; giữ nguyên nếu mạng lỗi. Nếu tài khoản bị khóa quyền tự sửa, quản trị viên cần cập nhật key để hoàn tất chuyển đổi. Việc đổi nhà cung cấp AI được lưu qua nút Lưu cấu hình.

Ô nhập key để trống nghĩa là giữ key đã lưu. Nút Xóa đánh dấu xóa; thay đổi chỉ thực hiện khi bấm Lưu. Key nhập mới chỉ ở bộ nhớ biểu mẫu và được xóa khỏi biểu mẫu khi đóng hoặc đăng xuất.

Migration không sửa các backup cũ hoặc lịch sử repository. Nếu key từng bị công khai, cần thu hồi và tạo key mới ở nhà cung cấp.

## Kiểm tra cục bộ

```sh
node --test tests/secure-ai.test.mjs tests/ai-provider.test.mjs tests/groq-usage.test.mjs tests/groq-key-pool.test.mjs tests/related-parts-selection.test.mjs
node --check assets/js/app-core.mjs
node --check assets/js/secure-ai.mjs
node --check supabase/functions/kgpt-ai/handler.mjs
```

Đã kiểm tra thêm 20 tình huống PostgreSQL cục bộ với Vault API giả lập: cú pháp migration, chuyển dữ liệu, quyền RPC, chặn truy cập chéo, khóa tự sửa, rollback, xóa secret và rate limit. Kiểm tra đó không chứng minh extension Vault, schema hoặc cấu hình quyền của project thật đã đúng. Cần kiểm tra lại trên project đích khi công cụ quản trị được nạp.
