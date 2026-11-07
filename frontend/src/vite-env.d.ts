/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_URL?: string;
  readonly VITE_CHAIN_ID?: string;
  readonly VITE_CHAIN_NAME?: string;
  readonly VITE_NATIVE_SYMBOL?: string;
  readonly VITE_RPC_URL?: string;
  readonly VITE_BLOCK_EXPLORER_URL?: string;
  readonly VITE_IPFS_GATEWAY_URL?: string;
  readonly VITE_MARKETPLACE_CONTRACT_ADDRESS?: string;
  readonly VITE_SAL1155_CONTRACT_ADDRESS?: string;
  readonly VITE_CERTIFICATE_SBT_CONTRACT_ADDRESS?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
