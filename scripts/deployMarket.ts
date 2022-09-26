import { ethers, upgrades } from "hardhat"

async function main() {
  // We get the contract to deploy
  const Pred = await ethers.getContractFactory("Predictcoin");
  const pred = Pred.attach(process.env.PRED as string);
  const collateral = process.env.NODE_ENV === "production" 
    ? 1000 * await pred.decimals()
    : 1 * await pred.decimals();
  const lockPeriod = process.env.NODE_ENV === "production" 
    ? 6 * 30 * 24 * 60 * 60 // 6 months
    : 5 * 60 // 5 minutes;
  const Squad = await ethers.getContractFactory("PredictcoinSquad");
  const squad = Squad.attach(process.env.PREDICTCOIN_SQUAD as string);

  const Market = await ethers.getContractFactory("PredictcoinSquadMarket");
  const market = await upgrades.deployProxy(
    Market, 
    [ 
      collateral,
      squad.address,
      pred.address,
      lockPeriod
    ], 
    {kind: "uups"}
  );

  console.log(`Farm deployed to:${market.address},
    Implementation deployed to:${await ethers.provider.getStorageAt(
      market.address,
      "0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc"
  )}`);
};

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
