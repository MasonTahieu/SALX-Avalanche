# SALX: Sàn tín chỉ carbon minh bạch trên Avalanche

> Phiên bản Avalanche của SALX, tham gia **Team1 Vietnam UniHack 2026**. Mã nguồn gốc chạy trên Ethereum Sepolia được giữ nguyên tại [MasonTahieu/SALX](https://github.com/MasonTahieu/SALX).

SALX (tên nội bộ: CarboX) là một marketplace tín chỉ carbon chạy on-chain. Dự án giảm phát thải (rừng, rừng ngập mặn, điện mặt trời, điện gió...) được cộng đồng validator thẩm định rồi token hoá thành **SAL**. SAL có thể mua bán tự do trên sàn, và khi người dùng "retire" (sử dụng) tín chỉ để bù đắp phát thải, hệ thống cấp một **chứng chỉ xanh Soulbound** không thể chuyển nhượng làm bằng chứng vĩnh viễn.

> **1 SAL = 10 kg CO2e**

## Vấn đề và giải pháp

| Vấn đề của thị trường carbon truyền thống | Cách SALX giải quyết |
|---|---|
| Quy trình thẩm định khép kín, khó kiểm chứng | Validator bỏ phiếu on-chain. Danh sách validator và quorum được chốt ngay lúc dự án nộp hồ sơ nên không thể thao túng về sau |
| Một tín chỉ có thể bị bán hoặc tính hai lần (double counting) | Retire sẽ **đốt** SAL. Chứng chỉ là token Soulbound, không bán lại được |
| Hồ sơ MRV khó truy xuất | Ảnh và tài liệu MRV được lưu trên IPFS. Metadata gắn với dự án on-chain |
| Người mua nhỏ lẻ khó tiếp cận | Mua lẻ từng SAL (10 kg CO2e), gộp tối đa 5 dự án vào một chứng chỉ |

## Luồng nghiệp vụ chính

```
Chủ dự án ──nộp hồ sơ + đặt cọc──▶ Validator bỏ phiếu ──đạt quorum──▶ Admin duyệt & mint SAL
                                                                              │
Người mua ◀──────────── mua SAL trên marketplace ◀──── chủ dự án niêm yết ◀──┘
    │
    └──retire SAL (đốt token)──▶ nhận Green Certificate (Soulbound NFT)
```

1. **Nộp dự án**: chủ dự án điền thông tin (lượng CO2 đề xuất, loại dự án, địa điểm, phương pháp luận, ngày giám sát) và tải tài liệu MRV lên IPFS. Khi gửi giao dịch `submitProject`, chủ dự án đặt cọc phí tokenization.
2. **Thẩm định**: validator gọi `voteOnProject`. Quorum = (số validator đủ điều kiện / 2) + 1, trong đó chủ dự án không được tự bỏ phiếu cho mình.
3. **Duyệt & mint**: khi đạt quorum, admin gọi `approveAndMintSAL` với lượng CO2 được duyệt. Nếu lượng được duyệt thấp hơn lượng đề xuất, phần phí thừa được hoàn lại. Chủ dự án có thể huỷ hồ sơ đang chờ để nhận lại toàn bộ cọc.
4. **Giao dịch**: chủ SAL niêm yết (`createListing`). SAL được giữ trong escrow của contract. Người mua có thể mua một phần hoặc toàn bộ (`buySAL`). Sàn thu phí 2%, người bán rút tiền qua `withdrawProceeds`.
5. **Retire**: người dùng chọn 1–5 dự án nguồn. Backend tạo metadata và ký uỷ quyền EIP-712 (có `nonce` và `deadline`). Contract kiểm tra chữ ký, đốt SAL và mint **một** chứng chỉ SBT duy nhất.

## Kiến trúc

```
Ví người dùng (Core / MetaMask / Coin98)
        │ ký giao dịch
        ▼
Smart contracts  ◀── nguồn sự thật duy nhất
        │ emit events
        ▼
Backend indexer (Node.js) ──▶ MongoDB (read-model) + Redis (cache)
        │ REST API                    IPFS (Pinata): metadata, ảnh, tài liệu MRV
        ▼
Frontend (React + Vite)
```

Mọi hành động ghi dữ liệu đều do ví người dùng ký. Backend chỉ chuẩn bị dữ liệu (metadata IPFS, chữ ký EIP-712, báo giá phí) và đồng bộ event để truy vấn nhanh. Khi indexer chưa kịp đồng bộ, frontend tự đọc receipt on-chain để hiển thị ngay.

### Smart contracts (`smart-contract/`)

| Contract | Chuẩn | Vai trò |
|---|---|---|
| `SAL1155` | ERC-1155 | Token tín chỉ carbon. Mỗi `projectId` là một loại token. Hỗ trợ blacklist theo dự án |
| `GreenCertificateSBT` | ERC-721 Soulbound | Chứng chỉ retire, không chuyển nhượng được. Lưu thành phần (dự án + số SAL) on-chain, có thể bị thu hồi khi phát hiện gian lận |
| `SALMarketplace` | — | Trung tâm điều phối: nộp/bỏ phiếu/duyệt dự án, niêm yết, mua bán, retire, quản lý phí và treasury |

Các cơ chế an toàn: `ReentrancyGuard`, `Pausable`, khoá vĩnh viễn địa chỉ marketplace sau khi deploy (`lockMarketplace`), blacklist ví và dự án, chữ ký EIP-712 có hạn dùng để chống giả mạo metadata chứng chỉ.

### Backend (`backend/`)

Node.js + Express, MongoDB (replica set), Redis, Pinata IPFS, ethers.js. Gồm:
- **Indexer** (`services/blockchainListener.js`) đồng bộ toàn bộ event về MongoDB, có retry và theo dõi độ trễ block.
- **REST API**: `/api/projects`, `/api/listings`, `/api/certificates`, `/api/fees`, `/api/transactions`, `/api/leaderboard`, `/api/upload/ipfs`, `/api/health`, `/api/admin/blockchain/*`.
- Tự sinh ảnh chứng chỉ (SVG → PNG) và metadata chứng chỉ.

### Frontend (`frontend/`)

React 19 + TypeScript + Vite + Tailwind CSS 4, ethers.js, hỗ trợ song ngữ và chế độ sáng/tối.

| Trang | Đường dẫn | Chức năng |
|---|---|---|
| Trang chủ | `/` | Thống kê tổng: dự án đã duyệt, lượng carbon đang lưu hành và đã retire |
| Marketplace | `/marketplace` | Duyệt, lọc, sắp xếp và mua SAL |
| Nộp dự án | `/submit` | Form nhiều bước, tải tài liệu MRV |
| Retire | `/retire` | Chọn dự án nguồn, retire và nhận chứng chỉ |
| Dashboard | `/dashboard` | Số dư SAL, niêm yết, dự án, chứng chỉ, tiền chờ rút |
| Validator | `/validator` | Bỏ phiếu thẩm định dự án |
| Bảng xếp hạng | `/leaderboard` | Top ví theo lượng CO2 đã retire |
| Hoạt động | `/activity` | Lịch sử giao dịch on-chain |
| Admin | `/admin` | Duyệt dự án, tạm dừng sàn, blacklist |

## Trạng thái hiện tại

- Mạng: **Avalanche Fuji C-Chain testnet** (chainId 43113). Phí gas và giá niêm yết tính bằng AVAX.
- Explorer: [Snowtrace testnet](https://testnet.snowtrace.io).
- Ví hỗ trợ: Core Wallet (ví chính thức của Avalanche), MetaMask, Coin98. Ví sẽ được tự động chuyển sang Fuji khi kết nối.
- Địa chỉ contract trên Fuji: *chưa deploy, sẽ cập nhật sau khi chạy `npm run deploy:fuji`.*
- Frontend được cấu hình deploy trên Vercel.
- Có test: Hardhat cho contract, Vitest cho các hook frontend, script kiểm thử cho backend.

## Chạy dự án

Yêu cầu: Node.js 22+ (Hardhat 3), Docker (cho MongoDB và Redis), ví Core hoặc MetaMask có AVAX testnet, tài khoản Pinata.

Lấy AVAX testnet miễn phí tại [faucet của UniHack](https://team1vn.xyz/faucet.html) hoặc [Core faucet](https://core.app/tools/testnet-faucet).

### 1. Smart contracts

```bash
cd smart-contract
cp .env.example .env     # điền DEPLOYER_PRIVATE_KEY (ví testnet riêng)
npm install
npm test                 # chạy test Hardhat
npm run compile
npm run deploy:fuji      # deploy 3 contract lên Avalanche Fuji
npm run export:abis      # xuất ABI cho backend và frontend
```

Địa chỉ contract sau khi deploy nằm trong `smart-contract/ignition/deployments/chain-43113/deployed_addresses.json`.

### 2. Backend

```bash
cd backend
cp .env.example .env     # điền địa chỉ contract, block deploy, Pinata và các khoá quản trị
```

```bash
cd backend
docker compose up -d     # MongoDB replica set + Redis + backend (cổng 5000)
npm run check            # kiểm tra cấu hình
npm run test:backend
```

### 3. Frontend

```bash
cd frontend
cp .env.example .env     # mặc định đã trỏ Fuji, chỉ cần điền VITE_API_URL và địa chỉ contract
npm install
npm run dev
npm test
```

## Cấu trúc thư mục

```
SALX/
├── smart-contract/   Solidity contracts, test Hardhat, module deploy Ignition
├── backend/          API Express, indexer blockchain, dịch vụ IPFS
├── frontend/         Ứng dụng React
└── SALX UI Mockups and Prototype/   Mockup, prototype và đặc tả luồng UI
```

## Hạn chế đã biết

- Quyền admin ở backend dùng một secret chung (`x-admin-key`), cần chuyển sang xác thực bằng ví trước khi dùng thật.
- Thêm/xoá validator, rút treasury và chỉnh phí hiện chỉ thao tác được trực tiếp trên contract, chưa có giao diện.
- Contract không có trạng thái "Rejected": phiếu từ chối chỉ không được tính vào quorum.
- Dự án là bản demo trên testnet, chưa kết nối với cơ quan đăng ký tín chỉ carbon chính thức.
