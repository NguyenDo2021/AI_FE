# Hệ thống bán hàng

Base project quản trị doanh nghiệp xây dựng với Vue 3, TypeScript strict, Vite và Ant Design Vue.

Backend Spring Boot tương thích trực tiếp với các API của frontend nằm trong [backend/README.md](./backend/README.md). Contract được đối chiếu từ source frontend; không cần sửa FE để kết nối.

## Bắt đầu

1. Clone repository và mở thư mục dự án.
2. Cài Node.js phiên bản LTS và pnpm.
3. Cài dependencies:

   ```sh
   pnpm install
   ```

4. Sao chép `.env.development` thành `.env.development.local` nếu cần ghi đè cấu hình cục bộ; đặt `VITE_GLOB_API_URL` trỏ tới backend. API mặc định chạy tại `http://localhost:8080/api`.
5. Khởi chạy:

   ```sh
   pnpm dev
   ```

## Build và kiểm tra

```sh
pnpm type-check
pnpm lint
pnpm build
pnpm preview
```

Build chạy TypeScript check trước khi tạo bundle production.

## Cấu trúc

```text
src/
├── api/                 # API theo domain: auth, user, role
├── assets/              # Ảnh và tài nguyên tĩnh
├── components/          # BasicTable, BasicForm, BasicModal, BasicDrawer
├── composables/         # Composition functions dùng chung
├── constants/           # Permission, menu, storage keys
├── directives/          # v-permission
├── layouts/             # Admin và blank layouts
├── locales/             # Bản dịch vi-VN, en-US
├── router/              # Route definitions và auth/permission guards
├── stores/              # Pinia: auth, app, user
├── styles/
├── types/
├── utils/               # Axios, date, format, storage, validation
└── views/               # Login, dashboard, system, error
```

## Authentication

- `useAuthStore()` quản lý user/session, login/logout, lấy hồ sơ và refresh token.
- Access/refresh token hiện được lưu trong `localStorage` thông qua `utils/storage.ts`. Với triển khai production nhạy cảm, ưu tiên refresh token trong cookie `HttpOnly; Secure; SameSite` do backend quản lý.
- Các request domain dùng Axios instance ở `utils/request.ts`; token tự đính kèm vào `Authorization`.
- Khi nhiều request cùng nhận 401, interceptor chia sẻ một promise refresh; refresh lỗi sẽ xóa session và chuyển về `/login`.
- Hợp đồng backend mặc định: `POST /auth/login` và `POST /auth/refresh` trả `{ accessToken, refreshToken }`; `GET /auth/me` trả `AuthUser`.

## API

Khai báo request và kiểu dữ liệu trong domain tương ứng, ví dụ `api/user/user.api.ts`. Response danh sách người dùng theo hợp đồng `{ items, total, page, pageSize }`. Component gọi hàm API có kiểu; không gọi Axios trực tiếp.

Các lỗi HTTP được chuẩn hóa thành `NormalizedApiError`; thông báo người dùng được bản địa hóa theo status 400/401/403/404/500. Backend cần bật CORS cho origin của ứng dụng.

## Permission

- Dùng hằng số `PERMISSIONS` làm nguồn quyền duy nhất cho route/menu/action.
- `hasPermission(permission, permissions)` kiểm tra một hoặc nhiều quyền.
- Directive `v-permission` gỡ phần tử khỏi DOM khi người dùng thiếu quyền. Đây chỉ là UX; backend vẫn bắt buộc phải xác minh quyền trên mọi endpoint.

## Tạo module mới

1. Tạo model/params trong `src/types/<domain>.ts`.
2. Thêm endpoint typed trong `src/api/<domain>/`.
3. Khai báo permission và route lazy-loaded trong `src/constants/permissions.ts` và `src/router/index.ts`.
4. Thêm bản dịch vi/en rồi thêm menu có cùng permission vào `src/constants/menu.ts`.
5. Tạo view theo Composition API; tái sử dụng BasicTable/Form/Modal/Drawer và gọi API domain.
6. Chạy `pnpm type-check`, `pnpm lint` và `pnpm build`.

## Convention

- Vue 3 Composition API và `<script setup lang="ts">`; strict TypeScript, không dùng `any`.
- API và permission có kiểu/hằng số; không hard-code endpoint trong view.
- Dùng `formatDate`, `formatDateTime`, `parseDate` để chuyển đổi ngày tường minh; API truyền ISO string.
- Mọi nội dung UI mới cần khai báo ở cả `locales/vi-VN.ts` và `locales/en-US.ts`.

## Hợp đồng CRUD mẫu

Màn hình `/system/user` minh họa tìm kiếm, lọc trạng thái, phân trang server-side, tạo, sửa, xem chi tiết và xóa. Backend cần cung cấp:

- `GET /users?page=&pageSize=&keyword=&status=` → `{ items, total, page, pageSize }`
- `GET /users/:id`
- `POST /users`
- `PUT /users/:id`
- `DELETE /users/:id`

Đăng nhập và CRUD cần backend theo các hợp đồng trên; starter không giả lập xác thực hoặc dữ liệu.
