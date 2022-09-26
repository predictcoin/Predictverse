// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";

import "./utils/SafeBEP20.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";

import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "hardhat/console.sol";


contract PredictverseMarket is Initializable, PausableUpgradeable, UUPSUpgradeable, OwnableUpgradeable, IERC721Receiver{
  using SafeBEP20 for IBEP20;
  using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;
  struct BorrowData{
    uint128 collateral;
    uint128 lockEnd;
  }

  struct ReturnBorrowData{
    uint index;
    uint128 collateral;
    uint128 lockEnd;
  }

  uint public collateral;
  uint public lockPeriod;
  IERC721 public predictcoinSquad;
  IBEP20 public predictcoin;
  mapping(uint => BorrowData) private borrowData;
  EnumerableSetUpgradeable.UintSet private marketNFTs;
  mapping(address => EnumerableSetUpgradeable.UintSet) private allPrederBorrows;

  event Borrow(address indexed borrower, uint indexed index, uint amount);
  event Withdraw(address indexed borrower, uint indexed index, uint amount);
  event SetCollateral(address indexed owner, uint indexed collateral);
  event SetLockPeriod(address indexed owner, uint indexed lockPeriod);

  function initialize(uint collateral_, IERC721 predictcoinSquad_, IBEP20 predictcoin_, uint lockPeriod_) 
    initializer external{
    __Ownable_init();
    collateral = collateral_;
    predictcoinSquad = predictcoinSquad_;
    predictcoin = predictcoin_;
    lockPeriod = lockPeriod_;
    emit SetCollateral(msg.sender, collateral_);
    emit SetLockPeriod(msg.sender, lockPeriod_);
  }

  function borrow(uint[] calldata indexes) external whenNotPaused {
    for(uint i; i < indexes.length; i++){
      uint index = indexes[i]; 
      require(allPrederBorrows[msg.sender].add(index), "PreditcoinSquadMarket:ALREADY_BORROWED");
      borrowData[index] = BorrowData(uint128(collateral), uint128(block.timestamp + lockPeriod));
      emit Borrow(msg.sender, index, collateral);
      predictcoin.transferFrom(msg.sender, address(this), collateral);
      predictcoinSquad.safeTransferFrom(address(this), msg.sender, index);
    }
  }

  function withdraw(uint[] calldata indexes) external whenNotPaused {
    for(uint i; i< indexes.length; i++){
      uint index = indexes[i];
      BorrowData memory nftBorrowData = borrowData[index];
      require(block.timestamp >= nftBorrowData.lockEnd, "PreditcoinSquadMarket:LOCKPERIOD_NOT_OVER");
      require(allPrederBorrows[msg.sender].remove(index), "PreditcoinSquadMarket:NOT_BORROWED");
      delete borrowData[index];
      emit Withdraw(msg.sender, index, nftBorrowData.collateral);
      predictcoin.transfer(msg.sender, nftBorrowData.collateral);
      predictcoinSquad.safeTransferFrom(msg.sender, address(this), index);
    } 
  }

  function withdrawNFTs(uint[] calldata indexes) external onlyOwner{
    for(uint i; i < indexes.length; i++){
      marketNFTs.remove(indexes[i]);
      predictcoinSquad.safeTransferFrom(address(this), msg.sender, indexes[i]);
    }
  }

  function setCollateral(uint collateral_) external whenPaused onlyOwner{
    require(collateral_ != 0, "PreditcoinSquadMarket:NONZERO_COLLATERAL");
    collateral = collateral_;
    emit SetCollateral(msg.sender, collateral_);
  }

  function setLockPeriod(uint lockPeriod_) external whenPaused onlyOwner{
    lockPeriod = lockPeriod_;
    emit SetLockPeriod(msg.sender, lockPeriod_);
  }

  function getBorrowData(address preder) external view returns (ReturnBorrowData[] memory){
    uint totalNftBorrows = allPrederBorrows[preder].length();
    uint[] memory nftsBorrowed = new uint[](totalNftBorrows);
    nftsBorrowed = allPrederBorrows[preder].values();
    ReturnBorrowData[] memory returnData = new ReturnBorrowData[](totalNftBorrows);
    for(uint i; i < totalNftBorrows; i++){
      uint index = nftsBorrowed[i];
      returnData[i] = ReturnBorrowData(index, borrowData[index].collateral, borrowData[index].lockEnd);
    }
    return returnData;
  }

  function getMarketNFTs() external view returns(uint[] memory) {
    return marketNFTs.values(); 
  }

  //Ensure contract can receive ERC721 tokens
  function onERC721Received(address operator, address from, uint256 tokenId, bytes memory data) override external 
      returns(bytes4){
      (operator, from, data, tokenId);
      marketNFTs.add(tokenId);
      return IERC721Receiver.onERC721Received.selector;
  }

  //pause deposits and withdrawals
  function pause() external onlyOwner{
      _pause();
  }

  function unpause() external onlyOwner{
      _unpause();
  }

  function _authorizeUpgrade(address newImplementation) onlyOwner internal override{
  }
}