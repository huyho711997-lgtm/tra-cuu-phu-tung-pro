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

Origin mặc định gồm GitHub Pages `https://huyho711997-lgtm.github.io` và tên miền Vercel hiện có `https://tra-cuu-phu-tung-pro.vercel.app`. Nếu dùng tên miền khác, đặt secret `ALLOWED_ORIGINS` là danh sách origin cách nhau bằng dấu phẩy, không gồm đường dẫn. CORS chỉ là giới hạn trình duyệt; xác thực và phân quyền luôn do máy chủ thực hiện.

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

## Nhiều Gemini key (Free Tier)

Hạn mức Gemini API tính **theo dự án Google Cloud, không theo từng key** (và theo từng model; RPD reset lúc 00:00 giờ Thái Bình Dương). Nhiều key cùng một dự án dùng chung một hạn mức; chỉ key tạo ở **dự án khác nhau** mới có hạn mức riêng. Nguồn: https://aistudio.google.com/docs/rate-limits

- Mỗi tài khoản lưu tối đa 10 key Gemini trong một secret Vault `gemini`, cách nhau bằng dấu phẩy, chấm phẩy hoặc xuống dòng. Không cần migration mới.
- `kgpt-ai`: mỗi yêu cầu bắt đầu từ một key ngẫu nhiên để trải tải. Key bị 429 được nghỉ (theo `Retry-After`/`retryDelay`, mặc định 65 giây; lỗi hạn mức ngày thì nghỉ đến nửa đêm giờ Thái Bình Dương); key bị 401/403 nghỉ 10 phút. Model là vòng ngoài: hết lượt model ưu tiên thì dùng model dự phòng (hạn mức tính theo model). Mọi key đang nghỉ thì trả 429 ngay kèm `retryAfter`, không gọi dồn nhà cung cấp. Trạng thái nghỉ chỉ nằm trong bộ nhớ của instance Edge Function (dấu vân tay SHA-256 rút gọn, không lưu key) nên có thể mất khi instance khởi động lại.
- `kgpt-ai-part-search` (nút "Tìm bằng AI") cũng xoay vòng và chuyển key tương tự.
- Lưu key với `appendKeys:["gemini"]` sẽ gộp key mới vào key đã lưu (bỏ trùng, tối đa 10) thay vì ghi đè; chỉ đọc key của chính mình hoặc khi là quản trị viên, quyền ghi vẫn do RPC lưu kiểm tra.

Triển khai: cần deploy lại **cả hai** function trước khi dùng tùy chọn "Thêm vào key đã lưu" (backend cũ bỏ qua `appendKeys` và sẽ ghi đè key cũ):

```sh
supabase functions deploy kgpt-ai --project-ref yxwmcpoklxpzlikxojez
supabase functions deploy kgpt-ai-part-search --project-ref yxwmcpoklxpzlikxojez
```

## Key AI dùng chung (admin quản lý, admin cấp quyền)

Key Gemini / Groq / OCR.Space được **quản trị viên lưu một lần** ở trang *Quản lý người dùng → Key AI dùng chung*; người dùng không còn tự nhập key. Admin bật/tắt quyền dùng cho từng tài khoản bằng công tắc ở cột *Key AI dùng chung* (hoặc “Bật cho tất cả tài khoản đang hoạt động”).

- Migration `20261108060000_shared_ai_keys.sql`: bảng `kgpt_private.ai_shared_credentials` (key nằm trong Vault, như key riêng), cột `ai_settings.use_shared_keys` (mặc định `false` — **không ai được dùng cho đến khi admin cấp**), và các RPC chỉ `service_role` gọi: `kgpt_ai_shared_read`, `kgpt_ai_shared_save`, `kgpt_ai_shared_grant`. `kgpt_ai_credentials` và `settings_metadata` đã được cập nhật.
- Quy tắc chọn key: admin luôn dùng được key chung; người khác chỉ khi được cấp. Tài khoản được cấp dùng **key chung ưu tiên hơn key riêng cùng tên**; tên nào key chung không có thì dùng key riêng. Tài khoản chưa được cấp vẫn dùng key riêng cũ (nếu có) như trước.
- Migration `20261108080000_shared_ai_key_management.sql` (chạy sau migration trên): thêm `items` vào metadata (từng key đã che: tên, số thứ tự, mã nhận diện `fp` = 8 ký tự đầu md5, 4 ký tự cuối), RPC `kgpt_ai_shared_remove_key` (xóa riêng một key Gemini) và `kgpt_ai_shared_secrets` (chỉ Edge Function dùng, để kiểm tra tình trạng). Cả hai chỉ `service_role` gọi.
- `kgpt-ai` thêm 2 action admin: `sharedCheck` (kiểm tra tình trạng bằng lệnh liệt kê model của Gemini/Groq — không tốn lượt tạo nội dung; OCR.Space không có cách kiểm tra miễn phí nên báo "không kiểm tra tự động"; kết quả chỉ gồm trạng thái ok/invalid/limited/error, không có key) và `sharedRemove` (xóa riêng một key Gemini theo `fp`). Trạng thái "hết lượt · còn N phút" lấy từ bộ nhớ tạm của instance đang chạy nên chỉ mang tính tham khảo.
- Edge Function `kgpt-ai` có thêm 3 action chỉ dành cho admin: `shared` (đọc metadata), `sharedSave` (lưu / thêm bằng `appendKeys:["gemini"]` / xóa; gộp key và giới hạn 10 key làm ngay trong CSDL nên key cũ không rời khỏi Vault), `grant` (cấp/thu hồi cho tối đa 1000 tài khoản). Trình duyệt chỉ nhận id phiên bản và 4 ký tự cuối (chỉ admin thấy), không bao giờ nhận key.
- Mọi người dùng chung một bộ key nên hạn mức Gemini free (tính theo dự án Google Cloud) bị chia sẻ: hãy dùng key từ **nhiều dự án khác nhau**. Trạng thái “key đang nghỉ” nằm trong bộ nhớ của instance Edge Function và được dùng chung giữa mọi người dùng trong instance đó.

Triển khai (thứ tự quan trọng — migration trước, function sau):

```sh
supabase db push --project-ref yxwmcpoklxpzlikxojez   # hoặc dán file migration vào SQL Editor bằng quyền owner
supabase functions deploy kgpt-ai --project-ref yxwmcpoklxpzlikxojez
supabase functions deploy kgpt-ai-part-search --project-ref yxwmcpoklxpzlikxojez
```

### Cài đặt dùng chung: cách đọc giấy đăng kiểm

Migration `20261108090000_ai_global_settings.sql` thêm bảng `kgpt_private.ai_global_settings` và RPC `kgpt_ai_global_set` (chỉ `service_role`; Edge Function kiểm tra quản trị viên). Action `globalSet` của `kgpt-ai` nhận `{name:'regReader', value:'gemini'|'fast'}`.

- `gemini` (mặc định): Gemini đọc trực tiếp ảnh/PDF (`thinking:'minimal'` để nhanh hơn).
- `fast`: OCR.Space lấy chữ, Groq bóc tách JSON; thiếu biển số/số khung, file lớn hơn 1MB hoặc lỗi thì tự chuyển sang Gemini. Cần key OCR.Space và Groq.
- Cài đặt này cũng áp dụng cho nút *Đọc hạng mục từ báo giá* (Tìm nhiều phụ tùng): `fast` = OCR.Space (mỗi tệp ≤ 1MB) → Groq trả danh sách hạng mục; tệp lớn/đọc lỗi/không ra hạng mục thì Gemini đọc thay (`thinking:'minimal'`).
- Admin đổi tại *Quản lý người dùng → Key AI dùng chung → Cách đọc giấy đăng kiểm*. Mọi tài khoản đọc giá trị này qua `settings` (trường `global.regReader`) và áp dụng sau khi tải lại trang.
