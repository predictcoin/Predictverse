import '@typechain/hardhat'
import '@nomiclabs/hardhat-ethers'
import "@nomiclabs/hardhat-waffle";
import '@openzeppelin/hardhat-upgrades';
import "@nomiclabs/hardhat-etherscan";

import {config} from "dotenv"
config();
config({ path: `.env.${process.env.NODE_ENV}` });
const mnemonic = process.env.MNEMONIC;
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    compilers: [
      {
        version: "0.6.2",
      },
      {
        version: "0.6.12",
      },
      {
        version: "0.8.2",
      },
      {
        version: "0.8.7",
      },
    ],
  },
  networks: {
    bscTestnet:{
      url: "https://data-seed-prebsc-1-s1.binance.org:8545/",
      chainId: 97,
      accounts: {mnemonic, path: "m/44'/60'/0'/0", initialIndex: 0, count: 10},
      timeout: 200000
    },
    bscMainnet:{
      url: "https://bsc-mainnet.web3api.com/v1/Q3SYS628Q7NM9568343JHPK9HBNDRHUZ5K",
      chainId: 56,
      accounts: {mnemonic, path: "m/44'/60'/0'/0", initialIndex: 0, count: 10},
      timeout: 200000
    }
  },
  mocha: {
    timeout: 200000
  },
  etherscan: {
    apiKey:{
      bsc: "RQIX47IVTSQCJJNVIIHSG6GGCJTSZASBQ6"
    }
  }
};
