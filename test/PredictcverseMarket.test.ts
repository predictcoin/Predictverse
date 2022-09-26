import { time, loadFixture } from "@nomicfoundation/hardhat-network-helpers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { 
  PredictcoinSquadMarket, 
  Predictcoin, 
  PredictcoinSquad, 
 } from "../typechain-types";

describe("PredictverseMarket", () => {

  let market: PredictcoinSquadMarket, pred: Predictcoin, squad: PredictcoinSquad;
  let owner, prederA, prederB;
  let lockPeriod = 6 * 30 * 24 * 60 * 60;
  let collateral;

  beforeEach( async () => {
    [owner, prederA, prederB] = await ethers.getSigners();
    const Predictcoin = await ethers.getContractFactory("Predictcoin");
    pred = await Predictcoin.deploy() as Predictcoin;
    collateral = 1000 * await pred.decimals()
    
    const Squad = await ethers.getContractFactory("PredictcoinSquad");
    squad = await Squad.deploy() as PredictcoinSquad;

    const Market = await ethers.getContractFactory("PredictverseMarket");
    market = await upgrades.deployProxy(
      Market, [collateral, squad.address, pred.address, lockPeriod], {kind: "uups"}
    ) as PredictcoinSquadMarket;
    
    await squad.setApprovalForAll(market.address, true);
    await pred.approve(market.address, ethers.constants.MaxUint256);
    await pred.connect(prederA).approve(market.address, ethers.constants.MaxUint256);
    await squad.multiMint(market.address, 10)
  })

  it("should set initial values", async () => {
    const _pred = await market.predictcoin()
    const _squad = await market.predictcoinSquad();
    const _collateral = await market.collateral();
    const _lockperiod  = await market.lockPeriod();
    const _owner = await market.owner();

    expect(_pred).to.equal(pred.address);
    expect(_squad).to.equal(squad.address);
    expect(_collateral).to.equal(collateral);
    expect(_lockperiod).to.equal(lockPeriod);
    expect(_owner).to.equal(owner.address);
  })

  describe("Borrow", () => {
    it("should let anyone borrow", async () => {
      expect(await market.borrow([0])).to.changeTokenBalances(
        pred, [ owner, market], [-collateral, collateral]
      );
      const borrowTime = await time.latest()
      const owner_0 = await squad.ownerOf(0);
      const [{index, collateral:_collateral, lockEnd}] = await market.getBorrowData(owner.address);
      
      expect(owner_0).to.equal(owner.address)
      expect(index).to.equal(0)
      expect(collateral).to.equal(_collateral)
      expect(lockPeriod + borrowTime).to.equal(lockEnd)
    })

    it("should not let them borrow without collateral", async () => {
      await expect(market.connect(prederA).borrow([0]))
        .to.be.revertedWith("BEP20: transfer amount exceeds balance");
    })

    it("should not let users borrow the same token", async () => {
      await pred.transfer(prederA.address, collateral)
      await market.borrow([0]);
      await expect(market.connect(prederA).borrow([0])).to.be.revertedWith(
        "ERC721: transfer from incorrect owne"
      );
    })
  })

  describe("Withdraw", async () => {
    it("should let users withdraw after lock time elapsed", async () => {
      await market.borrow([0]);
      await time.increase(lockPeriod+1);
      expect(await market.withdraw([0])).to.changeTokenBalances(
        pred,
        [owner, market],
        [collateral, -collateral]
      )
      const owner_0 = await squad.ownerOf(0);
      const borrowData = await market.getBorrowData(owner.address);
      expect(borrowData.length).to.equal(0);
      expect(owner_0).to.equal(market.address)
    })

    it("should not let users withdraw before lock time elapsed", async () => {
      await market.borrow([0]);
      await expect( market.withdraw([0])).to.be.revertedWith("PreditcoinSquadMarket:LOCKPERIOD_NOT_OVER")
    })

    it("should not let users withdraw without erc721 token", async () => {
      await market.borrow([0]);
      await squad.transferFrom(owner.address, prederA.address, 0);
      await time.increase(lockPeriod+1);
      await expect(market.withdraw([0])).to.be.revertedWith("ERC721: caller is not token owner nor approved")
    })
  })

  describe("Setter & Owner operations", () => {
    it("should set collateral", async () => {
      await market.borrow([0, 4]);
      const oldCollateral = await market.collateral();
      await market.pause()
      await market.setCollateral(1);
      await market.unpause()
      await market.borrow([3]);
      const newCollateral = await  market.collateral();
      const borrowData = await market.getBorrowData(owner.address);
      
      expect(newCollateral).to.equal(1);
      expect(borrowData[1].collateral).to.equal(oldCollateral);
      expect(borrowData[2].collateral).to.equal(newCollateral);
    })

    it("should set lock period", async () => {
      await market.borrow([0, 4]);
      let current = await time.latest();
      const oldEnd = (await market.lockPeriod()).add(current);
      await market.pause();
      await market.setLockPeriod(1);
      await market.unpause()
      await market.borrow([3]);
      current = await time.latest();
      const newEnd = (await market.lockPeriod()).add(current);
      const borrowData = await market.getBorrowData(owner.address);
      
      expect(await market.lockPeriod()).to.equal(1);
      expect(borrowData[1].lockEnd).to.equal(oldEnd);
      expect(borrowData[2].lockEnd).to.equal(newEnd);
    })

    it("should let owner withdraw nfts", async () => {
      await market.withdrawNFTs([0,1,2,3,4,5,6,7,8,9]);
      for(let i=0; i<10; i++){
        const owner_0 =  await squad.ownerOf(i)
        expect(owner_0).to.equal(owner.address);
      }
      await expect(squad.tokenOfOwnerByIndex(market.address, 0))
        .to.be.revertedWith("ERC721Enumerable: owner index out of bounds");
    })

    it("should return market NFTs", async () => {
      const nfts1 = await market.getMarketNFTs();
      await market.borrow([3]);
      const nfts2 = await market.getMarketNFTs();
      await market.withdrawNFTs([0, 2, 5, 6]);
      const nfts3 = await market.getMarketNFTs();

      expect(nfts1.length).to.equal(10);
      expect(nfts2.length).to.equal(nfts1.length);
      expect(nfts3.length).to.equal(6);
      [0, 2, 5, 6].forEach(index => {
        expect(nfts3.map(i => i.toNumber()).indexOf(index)).to.equal(-1);
        expect(nfts2.map(i => i.toNumber()).indexOf(index)).to.not.equal(-1);
      })
    })
  })
})