import { ethers, upgrades } from "hardhat"

async function main() {
  // We get the contract to deploy
  const predPerBlock = 5000000000;
  const Pred = await ethers.getContractFactory("Predictcoin");
  const pred = await Pred.attach(process.env.PRED as string);

  const Bank = await ethers.getContractFactory("PredictverseBank")
  const bank = await Bank.deploy(pred.address);
  const Predictverse = await ethers.getContractFactory("Predictverse");
  const predictverse = await upgrades.deployProxy(
    Predictverse, 
    [ pred.address, 
      predPerBlock, 0, 
      bank.address, 
      process.env.PREDICTCOIN_SQUAD as string
    ], 
    {kind: "uups"}
  );
  await bank.setMasterPred(predictverse.address);

  console.log(`Farm deployed to:${predictverse.address}, wallet deployed to:${bank.address}`,
  `implementation deployed to:${await ethers.provider.getStorageAt(
    predictverse.address,
    "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
    )}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
