import { expect } from "chai";
import { ethers, upgrades, network } from "hardhat";
import { Signer, Contract, BigNumber as _BigNumber, BigNumber, ContractFactory } from "ethers";

let signers: Signer[], 
  predictverse: Contract, 
  PrederA: Signer, 
  pred: Contract,
  PrederB: Signer,
  nft1: Contract,
  Predictverse: ContractFactory,
  bank: Contract,
  Bank: ContractFactory,
  tokenId1: _BigNumber,
  tokenId2: _BigNumber,
  blockNo: Number;
const predPerBlock = 1000000000;
let bankContract: Contract;

type pool = {
  lpToken: string, 
  allocPoint: _BigNumber, 
  lastRewardBlock: _BigNumber, 
  accPredPerShare: _BigNumber
};

let poolBefore: pool;

const multiplier = 10000000;


const checkRevert = async (call: () => Promise<void>, message:string) => {
  try{
    await call();
  }catch{(err: {message: string}) =>  {
    expect(err.message).to.equal("ERC721: transfer of token that is not own")
  }};
}

describe("Predictverse Contract Tests", () => {

  beforeEach( async () => {
    signers = await ethers.getSigners();
    [PrederA, PrederB] = signers

    const Pred = await ethers.getContractFactory("Predictcoin");
    pred = await Pred.deploy();

    Bank = await ethers.getContractFactory("PredictverseBank")
    bank = await Bank.deploy(pred.address);

    const NFT1 = await ethers.getContractFactory("PredictcoinSquad");
    nft1 = await NFT1.deploy();

    await nft1.safeMint(await PrederA.getAddress());
    await nft1.safeMint(await PrederA.getAddress());
    await nft1.safeMint(await PrederB.getAddress());

    tokenId2 = BigNumber.from(1);
    tokenId1 = BigNumber.from(0);

    Predictverse = await ethers.getContractFactory("Predictverse");
    //predictverse = await Predictverse.deploy(pred.address, predPerBlock, 0)
    predictverse = await upgrades.deployProxy(Predictverse, [pred.address, predPerBlock, 0, bank.address, nft1.address], {kind: "uups"});
    blockNo = await ethers.provider.getBlockNumber();

    await nft1.setApprovalForAll(predictverse.address, true);
    await nft1.connect(PrederB).setApprovalForAll(predictverse.address, true);
    await bank.setMasterPred(predictverse.address);
  })

  it("should initialise contract state variables", async () => {
    expect(await predictverse.pred()).to.equal(pred.address)
    expect(await predictverse.predPerBlock()).to.equal(predPerBlock)
    expect(await predictverse.startBlock()).to.equal(0)
    expect(await predictverse.totalAllocPoint()).to.equal(200)
    expect(await predictverse.poolLength()).to.equal(1)
  })
  
  it("should add the Pred Token Pool", async () => {
    const pool = await predictverse.poolInfo(0)
    expect(pool.nft).to.equal(nft1.address)
    expect(pool.allocPoint.toString()).to.equal("200")
    expect(pool.lastRewardBlock.toString()).to.equal(blockNo.toString());
    expect(pool.accPredPerShare.toString()).to.equal("0")
  })

  it("should update multiplier", async () => {
    await predictverse.updateMultiplier(multiplier)
    expect(await predictverse.BONUS_MULTIPLIER()).to.equal(multiplier)
  })

  it("should allow only owner add a new pool", async () => {
    await expect(predictverse.add(4000, PrederA, false, {from: PrederB})).to.be.reverted;
  })

  it("should add a new pool", async () => {
    const poolAddr = nft1.address
    await predictverse.add(4000, poolAddr, false)
    const pool = await predictverse.poolInfo(1)
    expect(pool.nft).to.equal(poolAddr)
    expect(pool.allocPoint.toString()).to.equal("4000")
    expect(pool.accPredPerShare.toString()).to.equal("0")
  })

  it("should allow only owner set allocation point", async () => {
    await expect(predictverse.set(0, 10000000, false, {from: PrederB})).to.be.reverted
  })

  it("should set allocation point", async () => {
    await predictverse.set(0, 10000000, false)
    const pool = await predictverse.poolInfo(0)
    expect(pool.allocPoint).to.equal(10000000)
    expect(await predictverse.totalAllocPoint()).to.equal(10000000)
  })

  it("should return multiplier across blocks", async () => {
    const bonus_multiplier = await predictverse.BONUS_MULTIPLIER()
    expect(await predictverse.getMultiplier(110, 200)).to.be.equal(bonus_multiplier*(200-110))
  })

  context("when user deposits when bank is empty", async () => {
    beforeEach(async () => {
      await predictverse.updateMultiplier(multiplier)
      poolBefore = await predictverse.poolInfo(0)
      await predictverse.deposit(0, [tokenId1])
    })

    it("should update user info", async () => {
      const userInfo = await predictverse.getUserInfo(await PrederA.getAddress(), 0)
      expect(userInfo.amount).to.equal(1)
      expect(userInfo.rewardDebt).to.equal(0)
      expect(userInfo.tokens[0]).to.equal(tokenId1)
      expect(await predictverse.pendingPred(0, await PrederA.getAddress())).to.equal(0)
    })

    it("should update pool", async () => {
      const poolAfter = await predictverse.poolInfo(0)
      expect(poolAfter.lastRewardBlock).to.gt(poolBefore.lastRewardBlock)
      expect(poolAfter.accPredPerShare).to.equal(poolBefore.accPredPerShare)
    })
  
    it("should update user pending Pred when bank increases balance", async () => {
      await pred.transfer(bank.address, (10**17).toString());
      await predictverse.updatePool(0)
      const user = await predictverse.getUserInfo(await PrederA.getAddress(), 0)
      const pool = await predictverse.poolInfo(0)
      const pending = (multiplier*predPerBlock).toString();
      expect(await predictverse.pendingPred(0, await PrederA.getAddress()))
        .to.equal(
          user.amount.mul(pool.accPredPerShare).div((BigNumber.from(10).pow(30))).sub(user.rewardDebt)
        )
    })

    it("should mass update pools", async () => {
      await pred.transfer(bank.address, (10**17).toString());
      const oldPool: pool = await predictverse.poolInfo(0)
      await predictverse.massUpdatePools()
      const newPool: pool = await predictverse.poolInfo(0)
      const _multiplier = newPool.lastRewardBlock.sub(oldPool.lastRewardBlock).mul(multiplier)

      expect(newPool.lastRewardBlock).to.equal(oldPool.lastRewardBlock.add(BigNumber.from(2)))
      expect(newPool.accPredPerShare, "AccPredShare not correct").to.equal(
        oldPool.accPredPerShare.add(
          _multiplier
          .mul(predPerBlock)
          .mul((BigNumber.from(10).pow(30)))
          .div(await nft1.balanceOf(predictverse.address))
        )
    )})

    it("it should withdraw user rewards with withdraw function", async () => {
      await pred.transfer(bank.address, (10**17).toString());
      const pending: BigNumber = await predictverse.pendingPred(0, await PrederA.getAddress());
      let user = await predictverse.getUserInfo(await PrederA.getAddress(), 0)

      await expect(() => predictverse.withdraw(0, []))
        .to.changeTokenBalances(
          pred, [bank, PrederA], [BigNumber.from(0).sub(pending.add(pending)), pending.add(pending)]
      )

      user = await predictverse.getUserInfo(await PrederA.getAddress(), 0)
      expect(user.amount).to.equal(1)
      expect(user.rewardDebt).to.equal(pending.mul(2))
      expect(await predictverse.pendingPred(0, await PrederA.getAddress())).to.equal(0);
    })

    it("it should withdraw user rewards with deposit function", async () => {
      await pred.transfer(bank.address, (10**17).toString());
      const pending: BigNumber = await predictverse.pendingPred(0, await PrederA.getAddress());

      await expect(() => predictverse.deposit(0, []))
        .to.changeTokenBalances(
          pred, [bank, PrederA], [BigNumber.from(0).sub(pending.mul(2)), pending.mul(2)]
      )

      const user = await predictverse.getUserInfo(await PrederA.getAddress(), 0)
      //await predictverse.deposit(0, 0)

      expect(user.amount).to.equal(1)
      expect(user.rewardDebt).to.equal(pending.mul(2))
    })

    it("it should withdraw user balance and rewards", async () => {
      await pred.transfer(bank.address, (10**17).toString());
      const pending: BigNumber = await predictverse.pendingPred(0, await PrederA.getAddress());
      let user = await predictverse.getUserInfo(await PrederA.getAddress(),0)
      await predictverse.withdraw(0, [tokenId1])
      user = await predictverse.getUserInfo(await PrederA.getAddress(), 0)

      await expect(() => predictverse.withdraw(0, [tokenId1])
        .to.changeTokenBalances(
          pred, [bankContract, PrederA], [BigNumber.from(0).sub(pending), pending]
        ))
      
      await expect(() => predictverse.withdraw(0, [tokenId1])
        .to.changeTokenBalances(
          nft1, [predictverse, PrederA], [BigNumber.from(0).sub(1), BigNumber.from(1)]
        ))

      expect(user.amount, "Total amount not withdrawn").to.equal(0)
      expect(user.rewardDebt, "Reward debt not removed").to.equal(0)
    })
  })

  context("when user deposits when bank is not empty", async () => {
    let oldBlockNo: number, poolAfter:any, 
      totalAllocPoint:BigNumber, accPredPerShare:BigNumber, predReward:BigNumber;

    beforeEach(async () => {
      await predictverse.updateMultiplier(multiplier);
      poolBefore = await predictverse.poolInfo(0);
      await pred.transfer(bank.address, (10**17).toString());
      await predictverse.deposit(0, [tokenId1]);
      oldBlockNo = await ethers.provider.getBlockNumber();

      await predictverse.updatePool(0);

      poolAfter = await predictverse.poolInfo(0);
      totalAllocPoint = await predictverse.totalAllocPoint()

      predReward = BigNumber.from(multiplier)
          .mul(poolAfter.lastRewardBlock.sub(oldBlockNo))
          .mul(predPerBlock)
          .mul(poolAfter.allocPoint)
          .div(totalAllocPoint);
      accPredPerShare = predReward
          .mul((BigNumber.from(10).pow(30)).toString())
          .div(await nft1.balanceOf(predictverse.address));
    });

    it("should update user info", async () => {
      const userInfo = await predictverse.getUserInfo(await PrederA.getAddress(), 0);
      const poolBalance = await nft1.balanceOf(predictverse.address);
      expect(userInfo.amount).to.equal(1)
      expect(userInfo.rewardDebt).to.equal(0)
      expect(userInfo.tokens[0]).to.equal(tokenId1)
      expect(await predictverse.pendingPred(0, await PrederA.getAddress())).to.equal(
        userInfo.amount.mul(predReward.div(poolBalance)).sub(userInfo.rewardDebt)
      );
    })

    it("should update pool", async () => {

      expect(poolAfter.lastRewardBlock).to.gt(poolBefore.lastRewardBlock)

      expect(poolAfter.accPredPerShare).to.equal(
        poolBefore.accPredPerShare.add(
          BigNumber.from(multiplier)
          .mul(poolAfter.lastRewardBlock.sub(oldBlockNo))
          .mul(predPerBlock)
          .mul(poolAfter.allocPoint)
          .mul((BigNumber.from(10).pow(30)).toString())
          .div(await nft1.balanceOf(predictverse.address))
          .div(totalAllocPoint)
        )
      )
    })
  })

  context("when user deposits/withdraws multiple tokens", async () => {
    let oldBlockNo: number, poolAfter:any, poolBefore:any,
      totalAllocPoint:BigNumber, accPredPerShare:BigNumber, predReward:BigNumber;
    beforeEach(async () => {
      await predictverse.updateMultiplier(multiplier);
      poolBefore = await predictverse.poolInfo(0);
      await pred.transfer(bank.address, (10**17).toString());
      await predictverse.deposit(0, [tokenId1, tokenId2]);

      oldBlockNo = await ethers.provider.getBlockNumber();

      await predictverse.updatePool(0);

      poolAfter = await predictverse.poolInfo(0);
      totalAllocPoint = await predictverse.totalAllocPoint()

      predReward = BigNumber.from(multiplier)
          .mul(poolAfter.lastRewardBlock.sub(oldBlockNo))
          .mul(predPerBlock)
          .mul(poolAfter.allocPoint)
          .div(totalAllocPoint);
      accPredPerShare = predReward
          .mul((BigNumber.from(10).pow(30)).toString())
          .div(await nft1.balanceOf(predictverse.address));
    });

    it("should update userInfo when user deposits", async () => {
      const userInfo = await predictverse.getUserInfo(await PrederA.getAddress(), 0);
      const poolBalance = await nft1.balanceOf(predictverse.address);
      expect(userInfo.amount).to.equal(2);
      expect(userInfo.rewardDebt).to.equal(0);
      expect(userInfo.tokens[0]).to.equal(tokenId1);
      expect(userInfo.tokens[1]).to.equal(tokenId2);

      expect(await predictverse.pendingPred(0, await PrederA.getAddress()))
        .to.equal(userInfo.amount.mul(predReward.div(poolBalance)).sub(userInfo.rewardDebt));
    });

    it("should update pool Info when user deposits", async () => {
      expect(poolAfter.lastRewardBlock).to.gt(poolBefore.lastRewardBlock)

      expect(poolAfter.accPredPerShare).to.equal(
        poolBefore.accPredPerShare.add(
          BigNumber.from(multiplier)
          .mul(poolAfter.lastRewardBlock.sub(oldBlockNo))
          .mul(predPerBlock)
          .mul(poolAfter.allocPoint)
          .mul((BigNumber.from(10).pow(30)).toString())
          .div(await nft1.balanceOf(predictverse.address))
          .div(totalAllocPoint)
        )
      )
    })
    
    it("should update userInfo when user withdraws", async () => {
      const oldUserInfo = await predictverse.getUserInfo(await PrederA.getAddress(), 0);
      const poolBalance = await nft1.balanceOf(predictverse.address);
      const newReward = predReward
        .div(poolAfter.lastRewardBlock.sub(oldBlockNo))
        .mul(poolAfter.lastRewardBlock.sub(oldBlockNo).add(1));
      const reward = oldUserInfo.amount.mul(newReward.div(poolBalance)).sub(oldUserInfo.rewardDebt);

      await expect(() => predictverse.withdraw(0, []))
        .to.changeTokenBalances(
          pred, [bank, PrederA], [BigNumber.from(0).sub(reward), reward] 
      );

      await expect(() => predictverse.withdraw(0, [0, 1]))
        .to.changeTokenBalances(
          nft1, [predictverse, PrederA], [BigNumber.from(0).sub(2), 2] 
      );

      const userInfo = await predictverse.getUserInfo(await PrederA.getAddress(), 0);
      expect(userInfo.amount).to.equal(0);
      expect(userInfo.rewardDebt).to.equal(0);
      expect(await predictverse.pendingPred(0, await PrederA.getAddress())).to.equal(0);
    })

    it("should update pool when user withdraws", async () => {
      await predictverse.withdraw(0, [0, 1]);
      const newBlockNo = await ethers.provider.getBlockNumber();
      const pool = await predictverse.poolInfo(0);
      const newAccPredPerShare = accPredPerShare
        .div(poolAfter.lastRewardBlock.sub(oldBlockNo))
        .mul(poolAfter.lastRewardBlock.sub(oldBlockNo).add(1));

      expect(pool.lastRewardBlock).to.equal(newBlockNo);
      expect(pool.accPredPerShare).to.equal(
        newAccPredPerShare
      );
    })

  })

  context("when user performs multiple deposits/withdrawals", async () => {

    it("should not allow a user deposit a token twice", async () => {
      await predictverse.deposit(0, [0]);

      await checkRevert(async () => 
        await predictverse.deposit(0, [0]), "ERC721: transfer of token that is not own");
    });

    it("should not allow a user deposit a token he doesn't own", async () => {

      await checkRevert(async () => 
        predictverse.deposit(0, [2]), "ERC721: transfer caller is not owner nor approved")
    })

    it("should not allow a user withdraw a token he doesn't deposit", async () => {
      await predictverse.deposit(0, [0]);
      const newPredictverse = predictverse.connect(PrederB);
      await newPredictverse.deposit(0, [2]);
      await expect(newPredictverse.withdraw(0, [0]))
        .to.be.revertedWith("Predictverse: Not owner of nft");
      predictverse.connect(PrederA);
    });
  })

  context("when contract is paused", () => {
    beforeEach( async () => {
      await predictverse.updateMultiplier(multiplier)
      await pred.transfer(bank.address, (BigNumber.from(10).pow(19)).toString());
      await predictverse.deposit(0, [tokenId2])
      await predictverse.massUpdatePools()
      await predictverse.pause()
    })

    it("should allow Owner unpause contract", async () => {
      await predictverse.unpause()
      expect(await predictverse.paused()).to.equal(false)
    })

    it("should allow only Owner pause and unpause contract", async () => {
      await expect(predictverse.pause({from: PrederB})).to.be.reverted
      await expect(predictverse.unpause({from: PrederB})).to.be.reverted
    })

    it("should not allow user to deposit and withdraw funds", async () => {
      await expect(predictverse.deposit(0, [tokenId2])).to.be.reverted
      await expect(predictverse.withdraw(0, [tokenId2])).to.be.reverted
    })

    it("should withdraw funds and forfeit rewards with Emergency withdraw", async () => {
      const oldBankBalance = await pred.balanceOf(bank.address)
      await predictverse.emergencyWithdraw(0, [tokenId2]);
      const user = await predictverse.getUserInfo(await PrederA.getAddress(), 0)
      
      expect(await pred.balanceOf(bank.address)).to.equal(oldBankBalance)
      expect(user.amount).to.equal(0)
      expect(user.rewardDebt).to.equal(0)
    })
  })

  // context("Contract Upgrade Tests", async () => {
  //   it("should upgrade contract", async () => {
  //     const provider = ethers.getDefaultProvider()
  //     const oldImplementation = await provider.getStorageAt(bank.address, 0);
  //     predictverse = await upgrades.upgradeProxy(predictverse.address, Predictverse);
  //     const newImplementation = await provider.getStorageAt(bank.address, 0);

  //     expect(newImplementation).to.not.equal(oldImplementation)
  //     expect(await predictverse.pred()).to.equal(pred.address)
  //     expect(await predictverse.predPerBlock()).to.equal(predPerBlock)
  //     expect(await predictverse.startBlock()).to.equal(0)
  //     expect(await predictverse.totalAllocPoint()).to.equal(200)
  //     expect(await predictverse.poolLength()).to.equal(1)
  //   })

  // })
})