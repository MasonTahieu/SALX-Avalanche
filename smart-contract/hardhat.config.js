import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { defineConfig } from "hardhat/config";
import * as dotenv from "dotenv";

dotenv.config();

const compilerSettings = {
  optimizer: {
    enabled: true,
    runs: 200,
  },
  viaIR: true,
};

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin],

  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts",
  },

  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
        settings: compilerSettings,
      },
      production: {
        version: "0.8.28",
        settings: compilerSettings,
      },
    },
  },

  // Snowtrace do Routescan vận hành. Trỏ API verify của Fuji/C-Chain sang
  // Routescan để source hiện trên testnet.snowtrace.io / snowtrace.io
  // (mặc định Hardhat gửi sang Etherscan V2, hiển thị trên snowscan).
  chainDescriptors: {
    43113: {
      name: "Avalanche Fuji",
      blockExplorers: {
        etherscan: {
          name: "Snowtrace",
          url: "https://testnet.snowtrace.io",
          apiUrl:
            "https://api.routescan.io/v2/network/testnet/evm/43113/etherscan/api",
        },
      },
    },
    43114: {
      name: "Avalanche C-Chain",
      blockExplorers: {
        etherscan: {
          name: "Snowtrace",
          url: "https://snowtrace.io",
          apiUrl:
            "https://api.routescan.io/v2/network/mainnet/evm/43114/etherscan/api",
        },
      },
    },
  },

  verify: {
    // Routescan không yêu cầu API key thật; chuỗi bất kỳ là được.
    etherscan: {
      apiKey: process.env.SNOWTRACE_API_KEY || "verifyContract",
    },
    blockscout: { enabled: false },
  },

  networks: {
    // Avalanche Fuji C-Chain testnet: mạng chính của SALX cho UniHack.
    fuji: {
      type: "http",
      chainId: 43113,
      url:
        process.env.FUJI_RPC_URL ||
        "https://api.avax-test.network/ext/bc/C/rpc",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
    avalanche: {
      type: "http",
      chainId: 43114,
      url:
        process.env.AVALANCHE_RPC_URL ||
        "https://api.avax.network/ext/bc/C/rpc",
      accounts: process.env.DEPLOYER_PRIVATE_KEY
        ? [process.env.DEPLOYER_PRIVATE_KEY]
        : [],
    },
    sepolia: {
      type: "http",
      chainId: 11155111,
      url:
        process.env.SEPOLIA_RPC_URL ||
        "https://rpc.sepolia.org",
      accounts: process.env.SEPOLIA_PRIVATE_KEY
        ? [process.env.SEPOLIA_PRIVATE_KEY]
        : [],
    },
  },
});