const hre = require("hardhat");
const { ethers } = hre;

const CONTRACT_ADDRESS = "0x87aeCaCc249985C305A569930a2058D08218F2Fc";
const CONSTRUCTOR_ARGUMENTS: any[] = []

async function main () {

  try {
    await hre.run("verify:verify", {
      address: CONTRACT_ADDRESS,
      constructorArguments: CONSTRUCTOR_ARGUMENTS,
    });
  } catch (error) {
    console.log(`Failed to verify: Contract @${CONTRACT_ADDRESS}`);
    console.log(error);
  }

};
main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
