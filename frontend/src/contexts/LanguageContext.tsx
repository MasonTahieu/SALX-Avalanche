import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Language = 'vi' | 'en';

const dictionary: Record<string, { vi: string; en: string }> = {
  // Common & Nav
  'common.connectWallet': { vi: 'Kết nối ví', en: 'Connect Wallet' },
  'common.disconnect': { vi: 'Ngắt kết nối', en: 'Disconnect' },
  'common.getFaucet': { vi: 'Nhận Fuji AVAX ↗', en: 'Get Fuji AVAX ↗' },
  'common.light': { vi: 'Sáng', en: 'Light' },
  'common.dark': { vi: 'Tối', en: 'Dark' },
  'common.retry': { vi: 'Thử lại', en: 'Retry' },
  'common.viewSnowtrace': { vi: 'Xem trên Snowtrace', en: 'View on Snowtrace' },
  'common.serverWakingTitle': { vi: 'Đang đánh thức máy chủ SALX…', en: 'Starting the SALX server…' },
  'common.serverWakingSub': {
    vi: 'Máy chủ ngủ khi không hoạt động trên gói miễn phí. Lần tải đầu có thể mất tối đa 1 phút.',
    en: 'It sleeps when idle on free hosting. The first load can take up to a minute.',
  },
  'cert.noneHint': {
    vi: 'Sau khi retire, chứng nhận của bạn sẽ hiện ở đây sau vài giây.',
    en: 'After you retire SAL, your certificate appears here within a few seconds.',
  },

  // Nav
  'nav.marketplace': { vi: 'Sàn giao dịch', en: 'Marketplace' },
  'nav.retire': { vi: 'Retire', en: 'Retire' },
  'nav.submit': { vi: 'Đăng ký dự án', en: 'Submit' },
  'nav.dashboard': { vi: 'Bảng điều khiển', en: 'Dashboard' },
  'nav.leaderboard': { vi: 'Bảng xếp hạng', en: 'Leaderboard' },
  'nav.proof': { vi: 'Bằng chứng', en: 'Proof' },
  'nav.pendingProjects': { vi: 'Duyệt dự án', en: 'Pending Projects' },
  'nav.admin': { vi: 'Quản trị', en: 'Admin' },

  // Wallet Modal
  'wallet.roleLabel': { vi: 'Vai trò kết nối', en: 'Role' },
  'wallet.roleUser': { vi: 'Người dùng', en: 'User' },
  'wallet.roleValidator': { vi: 'Thẩm định (Validator)', en: 'Validator' },
  'wallet.selectWallet': { vi: 'Chọn ví để tiếp tục', en: 'Select wallet to continue' },
  'wallet.privyTitle': { vi: 'Google hoặc Email', en: 'Google or Email' },
  'wallet.privySub': { vi: 'Không cần cài extension. Tự tạo ví an toàn', en: 'No extension needed. Wallet created for you' },
  'wallet.coreSub': { vi: 'Ví chính thức của Avalanche', en: 'Official Avalanche wallet' },
  'wallet.metamaskSub': { vi: 'Tiện ích mở rộng trình duyệt', en: 'Browser extension' },
  'wallet.coin98Sub': { vi: 'Ví đa chuỗi phổ biến tại VN', en: 'Multi-chain wallet' },
  'wallet.approveNote': { vi: 'Bạn luôn xác nhận mọi giao dịch trên ví của mình', en: 'You approve every transaction in your wallet' },
  'wallet.connectingAs': { vi: 'Đang kết nối với vai trò', en: 'Connecting as' },

  // Tx Stepper
  'tx.approve': { vi: 'Phê duyệt', en: 'Approve' },
  'tx.sign': { vi: 'Ký ví', en: 'Sign' },
  'tx.confirming': { vi: 'Đang xác nhận', en: 'Confirming' },
  'tx.success': { vi: 'Thành công', en: 'Success' },

  // Home — Hero
  'home.badge': { vi: 'Xây dựng trên Avalanche Fuji C-Chain', en: 'Built on Avalanche Fuji C-Chain' },
  'home.heroTitle1': { vi: 'Tín chỉ carbon minh bạch.', en: 'Verifiable carbon credits.' },
  'home.heroTitle2': { vi: 'Chứng thực vĩnh viễn on-chain.', en: 'Settled permanently on-chain.' },
  'home.heroSub': {
    vi: 'Giải quyết nạn tính trùng (double-counting) và thiếu minh bạch của thị trường carbon truyền thống: 1 SAL = 10 kg CO₂e được thẩm định cộng đồng, giao dịch tự do và đốt để nhận Chứng chỉ Xanh Soulbound (SBT).',
    en: 'Solving double-counting and opaque offsets: 1 SAL = 10 kg CO₂e verified by decentralized validators, traded freely, and burned to mint a non-transferable Soulbound Green Certificate.',
  },
  'home.ctaMarket': { vi: 'Khám phá Marketplace', en: 'Explore Marketplace' },
  'home.ctaSubmit': { vi: 'Đăng ký dự án', en: 'Submit Project' },
  'home.ctaSampleCert': { vi: 'Xem chứng chỉ SBT mẫu', en: 'View sample SBT certificate' },
  'home.statProjects': { vi: 'Dự án đã duyệt', en: 'Approved projects' },
  'home.statRetired': { vi: 'Tấn CO₂e đã retire', en: 'Tonnes CO₂e retired' },
  'home.statSupply': { vi: 'SAL đang lưu hành', en: 'Circulating SAL' },
  'home.statTx': { vi: 'Giao dịch & niêm yết', en: 'Active listings' },

  // Home — Problem
  'home.probTag': { vi: '01 / Vấn đề thị trường carbon', en: '01 / The Carbon Market Gap' },
  'home.probTitle': { vi: 'Vì sao thị trường carbon truyền thống khó tin cậy?', en: 'Why legacy carbon markets struggle with trust' },
  'home.prob1Title': { vi: 'Tính trùng (Double-counting)', en: 'Double-counting' },
  'home.prob1Desc': {
    vi: 'Một tín chỉ có thể bị bán cho nhiều bên cùng lúc qua các sổ cái rời rạc. Trên SALX, retire là đốt token SAL vĩnh viễn on-chain.',
    en: 'The same credit can be sold across fragmented registries. On SALX, retiring permanently burns SAL tokens on-chain.',
  },
  'home.prob2Title': { vi: 'Thiếu truy vết MRV', en: 'Opaque MRV trail' },
  'home.prob2Desc': {
    vi: 'Hồ sơ đo đạc, báo cáo và thẩm định (MRV) thường đóng kín. SALX lưu tài liệu MRV trên IPFS và gắn hash trực tiếp vào dự án.',
    en: 'Measurement, Reporting & Verification (MRV) files are rarely public. SALX pins MRV evidence to IPFS and links hashes on-chain.',
  },
  'home.prob3Title': { vi: 'Chứng chỉ giấy dễ làm giả', en: 'Forgeable paper certificates' },
  'home.prob3Desc': {
    vi: 'Chứng nhận PDF dễ chỉnh sửa và khó đối chiếu. SALX cấp Soulbound NFT (ERC-721) không thể chuyển nhượng, xác minh công khai qua QR & Snowtrace.',
    en: 'PDF certificates are easy to alter. SALX mints non-transferable Soulbound NFTs (ERC-721) verifiable via QR & Snowtrace.',
  },

  // Home — How it works
  'home.flowTag': { vi: '02 / Cách hoạt động', en: '02 / How SALX Works' },
  'home.flowTitle': { vi: 'Luồng xác thực 4 bước từ thực địa đến chứng chỉ', en: '4-step verifiable lifecycle from field to certificate' },
  'home.step1Title': { vi: 'Đăng ký dự án + MRV', en: 'Submit Project + MRV' },
  'home.step1Desc': { vi: 'Chủ dự án tải hồ sơ MRV lên IPFS và đặt cọc phí tokenization on-chain.', en: 'Project owners pin MRV files to IPFS and stake tokenization fees on-chain.' },
  'home.step2Title': { vi: 'Validator bỏ phiếu', en: 'Validator Voting' },
  'home.step2Desc': { vi: 'Danh sách validator và quorum được chốt ngay khi nộp — chống thao túng kết quả.', en: 'Validator set and quorum lock at submission time to prevent governance manipulation.' },
  'home.step3Title': { vi: 'Mint SAL (ERC-1155)', en: 'Mint SAL (ERC-1155)' },
  'home.step3Desc': { vi: 'Đạt quorum → mint token SAL (1 SAL = 10 kg CO₂e) và niêm yết trên sàn.', en: 'Once quorum passes, SAL tokens (1 SAL = 10 kg CO₂e) are minted and listed.' },
  'home.step4Title': { vi: 'Mua, Retire & Nhận SBT', en: 'Buy, Retire & Mint SBT' },
  'home.step4Desc': { vi: 'Người mua gộp 1–5 dự án, đốt SAL với chữ ký EIP-712 để nhận chứng chỉ Soulbound.', en: 'Buyers combine 1–5 projects, burn SAL with EIP-712 auth, and receive a Soulbound SBT.' },

  // Home — On-chain Proof
  'home.proofTag': { vi: '03 / Bằng chứng on-chain', en: '03 / On-chain Architecture & Proof' },
  'home.proofTitle': { vi: '3 Smart Contract kiểm chứng công khai trên Avalanche Fuji', en: '3 verified smart contracts on Avalanche Fuji' },
  'home.proofSub': {
    vi: 'Toàn bộ sở hữu, niêm yết, đốt tín chỉ và chứng chỉ xanh nằm trên Avalanche C-Chain. Kể cả khi backend tạm nghỉ, tài sản on-chain vẫn nguyên vẹn.',
    en: 'All balances, escrows, burns, and certificates live on Avalanche C-Chain. Even if the backend stops, on-chain provenance remains intact.',
  },
  'home.proofFullLink': { vi: 'Xem báo cáo đối chiếu Proof ↗', en: 'Open full Proof report ↗' },

  // Home — Featured Projects (CardSwap)
  'home.featTag': { vi: '04 / Dự án đang mở bán', en: '04 / Live Carbon Projects' },
  'home.featTitle': { vi: 'Chọn dự án giảm phát thải để bù đắp ngay', en: 'Select verified projects to offset today' },
  'home.featSub': {
    vi: 'Tương tác với bộ thẻ dự án bên phải hoặc bấm chọn để xem chi tiết và mua lẻ từng SAL (10 kg CO₂e).',
    en: 'Interact with the live project stack or click any card to inspect MRV provenance and buy SAL.',
  },
  'home.featSelect': { vi: 'Chọn dự án này', en: 'Select this project' },
  'home.featBuy': { vi: 'Mua trên Marketplace', en: 'Buy on Marketplace' },
  'home.featLoading': { vi: 'Đang tải danh sách dự án từ Avalanche…', en: 'Loading live projects from Avalanche…' },
  'home.featEmpty': { vi: 'Chưa có dự án nào đang niêm yết. Hãy đăng ký dự án đầu tiên!', en: 'No active listings yet. Submit the first carbon project!' },

  // Home — Certificate Showcase
  'home.certTag': { vi: '05 / Chứng chỉ Soulbound (SBT)', en: '05 / Soulbound Certificate Showcase' },
  'home.certTitle': { vi: 'Bằng chứng bù đắp phát thải không thể làm giả', en: 'Tamper-proof retirement record with full audit trail' },
  'home.certDesc': {
    vi: 'Mỗi lần retire tạo ra một ERC-721 Soulbound duy nhất lưu danh sách dự án nguồn, tổng kg CO₂e đã đốt và mã QR xác minh tức thì.',
    en: 'Each retirement mints a unique ERC-721 Soulbound token storing source projects, burned kg CO₂e, and an instant QR verification link.',
  },
  'home.certBtn': { vi: 'Retire SAL ngay', en: 'Retire SAL now' },
  'home.certVerifyBtn': { vi: 'Xác minh SBT #2 mẫu', en: 'Verify Sample SBT #2' },

  // Home — Why Avalanche
  'home.avaxTag': { vi: '06 / Vì sao chọn Avalanche', en: '06 / Why Avalanche' },
  'home.avaxTitle': { vi: 'Hạ tầng tốc độ cao cho giao dịch carbon vi mô', en: 'High-speed settlement for micro-carbon transactions' },
  'home.avax1Title': { vi: 'Finality dưới 2 giây', en: 'Sub-2s Finality' },
  'home.avax1Desc': { vi: 'Giao dịch mua bán và đốt SAL xác nhận gần như tức thì, phù hợp cho cả demo trực tiếp lẫn giao dịch bán lẻ.', en: 'Purchases and SAL burns finalize almost instantly — ideal for retail offsets and live demos.' },
  'home.avax2Title': { vi: 'Phí gas siêu thấp', en: 'Ultra-low Fees' },
  'home.avax2Desc': { vi: 'Cho phép mua lẻ từ 1 SAL (10 kg CO₂e) mà chi phí on-chain không ăn mòn giá trị tín chỉ.', en: 'Makes micro-offsets starting at 1 SAL (10 kg CO₂e) economically viable on-chain.' },
  'home.avax3Title': { vi: 'Core Wallet & EVM', en: 'Core Wallet & EVM' },
  'home.avax3Desc': { vi: 'Tương thích mượt với Core, MetaMask, Coin98 và Privy cho người dùng chưa có ví Web3.', en: 'Seamless support for Core, MetaMask, Coin98, and embedded Privy wallets.' },

  // Home — Final CTA & Footer
  'home.finalTitle': { vi: 'Sẵn sàng biến cam kết xanh thành bằng chứng on-chain?', en: 'Ready to turn climate commitments into on-chain proof?' },
  'home.finalSub': { vi: 'Khám phá các dự án đã thẩm định trên Fuji Testnet hoặc thử tính dấu chân carbon của bạn.', en: 'Browse verified projects on Fuji Testnet or calculate your carbon footprint.' },
  'home.footerTeam': { vi: 'Team1 Vietnam UniHack 2026 · Xây dựng trên Avalanche Fuji C-Chain', en: 'Team1 Vietnam UniHack 2026 · Built on Avalanche Fuji C-Chain' },
};

interface LanguageContextValue {
  language: Language;
  locale: string;
  setLanguage: (language: Language) => void;
  toggleLanguage: () => void;
  t: (key: string) => string;
}

const LanguageContext = createContext<LanguageContextValue | null>(null);

function initialLanguage(): Language {
  try {
    const saved = localStorage.getItem('salx.language');
    if (saved === 'en' || saved === 'vi') return saved;
  } catch {
    // ignore storage errors in restricted contexts
  }
  return 'vi';
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(initialLanguage);

  const setLanguage = (next: Language) => {
    try {
      localStorage.setItem('salx.language', next);
    } catch {
      // ignore
    }
    setLanguageState(next);
  };

  useEffect(() => {
    document.documentElement.lang = language;
    try {
      localStorage.setItem('salx.language', language);
    } catch {
      // ignore
    }
  }, [language]);

  const value = useMemo<LanguageContextValue>(() => ({
    language,
    locale: language === 'vi' ? 'vi-VN' : 'en-US',
    setLanguage,
    toggleLanguage: () => setLanguage(language === 'vi' ? 'en' : 'vi'),
    t: (key: string) => dictionary[key]?.[language] || key,
  }), [language]);

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export function useLanguage() {
  const value = useContext(LanguageContext);
  if (!value) throw new Error('useLanguage must be used inside LanguageProvider');
  return value;
}
