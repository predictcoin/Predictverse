// SPDX-License-Identifier: Unlicensed

pragma solidity 0.8.2;

import "@openzeppelin/contracts/utils/math/SafeMath.sol";
import "./interfaces/IBEP20.sol";
import "./utils/SafeBEP20.sol";
import "@openzeppelin/contracts-upgradeable/access/OwnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/UUPSUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/utils/structs/EnumerableSetUpgradeable.sol";
import "@openzeppelin/contracts/interfaces/IERC721.sol";
import "@openzeppelin/contracts/interfaces/IERC721Receiver.sol";

import "./PredictverseBank.sol";

// import "hardhat/console.sol";

contract  Predictverse is Initializable, PausableUpgradeable, UUPSUpgradeable, OwnableUpgradeable, IERC721Receiver{
    using SafeMath for uint256;
    using SafeBEP20 for IBEP20;
    using EnumerableSetUpgradeable for EnumerableSetUpgradeable.UintSet;

    // Info of each user.
    struct UserInfo {
        uint256 amount; // How many nfts the user has provided.
        EnumerableSetUpgradeable.UintSet tokens; // Nfts the user has provided
        uint256 rewardDebt; // Reward debt. See explanation below.
        //
        // We do some fancy math here. Basically, any point in time, the amount of PREDs
        // entitled to a user but is pending to be distributed is:
        //
        //   pending reward = (user.amount * pool.accPredPerShare) - user.rewardDebt
        //
        // Whenever a user deposits or withdraws LP tokens to a pool. Here's what happens:
        //   1. The pool's `accPredPerShare` (and `lastRewardBlock`) gets updated.
        //   2. User receives the pending reward sent to his/her address.
        //   3. User's `amount` gets updated.
        //   4. User's `rewardDebt` gets updated.
    }

    // user info passed to external calls
    struct ExternalUserInfo{
        uint256 amount;
        uint256 rewardDebt;
        uint256[] tokens;
    }

    // Info of each pool.
    struct PoolInfo {
        IERC721 nft; // Address of nft contract.
        uint256 allocPoint; // How many allocation points assigned to this pool. PREDs to distribute per block.
        uint256 lastRewardBlock; // Last block number that PREDs distribution occurs.
        uint256 accPredPerShare; // Accumulated PREDs per nft, times 1e30. See below.
    }

    // The PRED TOKEN!
    IBEP20 public pred;
    // PRED tokens distributed per block.
    uint256 public predPerBlock;
    // Bonus muliplier for early preders.
    uint256 public BONUS_MULTIPLIER;
    //contract holding PRED tokens
    PredictverseBank public bank;

    // Info of each pool.
    PoolInfo[] public poolInfo;
    // Info of each user that stakes LP tokens.
    mapping(uint256 => mapping(address => UserInfo)) private userInfo;
    // Total allocation points. Must be the sum of all allocation points in all pools.
    uint256 public totalAllocPoint;
    // The block number when PRED mining starts.
    uint256 public startBlock;

    event Deposit(address indexed user, uint256 indexed pid, uint256[] _tokenIds);
    event Withdraw(address indexed user, uint256 indexed pid, uint256[] _tokenIds);
    event EmergencyWithdraw(
        address indexed user,
        uint256 indexed pid,
        uint256 amount
    );

    function initialize(
        IBEP20 _pred,
        uint256 _predPerBlock,
        uint256 _startBlock,
        PredictverseBank _bank,
        IERC721 _nft
    ) external initializer {
        __Ownable_init();
        pred = _pred;
        predPerBlock = _predPerBlock;
        startBlock = _startBlock;
        bank = _bank;
        BONUS_MULTIPLIER = 1000000;

        add(200, _nft, false);
    }
    
    // Authourizes upgrade to be done by the proxy. Theis contract uses a UUPS upgrade model
    function _authorizeUpgrade(address newImplementation) internal override onlyOwner{}

    function updateMultiplier(uint256 multiplierNumber) public onlyOwner {
        BONUS_MULTIPLIER = multiplierNumber;
    }

    function poolLength() external view returns (uint256) {
        return poolInfo.length;
    }

    // Add a new lp to the pool. Can only be called by the owner.
    // XXX DO NOT add the same LP token more than once. Rewards will be messed up if you do.
    function add(
        uint256 _allocPoint,
        IERC721 _nft,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }
        uint256 lastRewardBlock = block.number > startBlock
            ? block.number
            : startBlock;
        totalAllocPoint = totalAllocPoint.add(_allocPoint);
        poolInfo.push(
            PoolInfo({
                nft: _nft,
                allocPoint: _allocPoint,
                lastRewardBlock: lastRewardBlock,
                accPredPerShare: 0
            })
        );
    }

    // Update the given pool's PRED allocation point. Can only be called by the owner.
    function set(
        uint256 _pid,
        uint256 _allocPoint,
        bool _withUpdate
    ) public onlyOwner {
        if (_withUpdate) {
            massUpdatePools();
        }

        uint256 prevAllocPoint = poolInfo[_pid].allocPoint;
        poolInfo[_pid].allocPoint = _allocPoint;
        if (prevAllocPoint != _allocPoint) {
            totalAllocPoint = totalAllocPoint.sub(prevAllocPoint).add(
                _allocPoint
            );
        }
    }

    // Return reward multiplier over the given _from to _to block.
    function getMultiplier(uint256 _from, uint256 _to)
        public
        view
        returns (uint256)
    {
        return _to.sub(_from).mul(BONUS_MULTIPLIER);
    }

    // View function to see pending PREDs on frontend.
    function pendingPred(uint256 _pid, address _user)
        external
        view
        returns (uint256)
    {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][_user];
        uint256 accPredPerShare = pool.accPredPerShare;
        uint256 nftSupply = pool.nft.balanceOf(address(this));
        if (block.number > pool.lastRewardBlock && nftSupply != 0) {
            uint256 multiplier = getMultiplier(
                pool.lastRewardBlock,
                block.number
            );
            uint256 predReward = multiplier
            .mul(predPerBlock)
            .mul(pool.allocPoint)
            .div(totalAllocPoint);
            uint256 predBal = pred.balanceOf(address(bank));
            if (predReward >= predBal) {
                predReward = predBal;
            }
            accPredPerShare = accPredPerShare.add(
                predReward.mul(1e30).div(nftSupply)
            );
        }
        return user.amount.mul(accPredPerShare).div(1e30).sub(user.rewardDebt);
    }

    // Update reward variables for all pools. Be careful of gas spending!
    function massUpdatePools() public {
        uint256 length = poolInfo.length;
        for (uint256 pid = 0; pid < length; ++pid) {
            updatePool(pid);
        }
    }

    // Update reward variables of the given pool to be up-to-date.
    function updatePool(uint256 _pid) public {
        PoolInfo storage pool = poolInfo[_pid];
        if (block.number <= pool.lastRewardBlock) {
            return;
        }
        uint256 nftSupply = pool.nft.balanceOf(address(this));
        if (nftSupply == 0) {
            pool.lastRewardBlock = block.number;
            return;
        }
        uint256 multiplier = getMultiplier(pool.lastRewardBlock, block.number);
        uint256 predReward = multiplier
            .mul(predPerBlock)
            .mul(pool.allocPoint)
            .div(totalAllocPoint);
        uint256 predBal = pred.balanceOf(address(bank));
        if (predReward >= predBal) {
            predReward = predBal;
        }

        pool.accPredPerShare = pool.accPredPerShare.add(
            predReward.mul(1e30).div(nftSupply)
        );
        pool.lastRewardBlock = block.number;
    }

    // Deposit LP tokens to MasterPred for PRED allocation.
    function deposit(uint256 _pid, uint256[] memory _tokenIds) public whenNotPaused {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 amount = _tokenIds.length;
        updatePool(_pid);
        if (user.amount > 0) {
            uint256 pending = user
            .amount
            .mul(pool.accPredPerShare)
            .div(1e30)
            .sub(user.rewardDebt);
            if (pending > 0) {
                safePredTransfer(msg.sender, pending);
            }
        }
        
        user.amount = user.amount.add(amount);
        user.rewardDebt = user.amount.mul(pool.accPredPerShare).div(1e30);

        for(uint256 index = 0; index < amount; index++){
            pool.nft.safeTransferFrom(
                address(msg.sender),
                address(this),
                _tokenIds[index]
            );
            require(pool.nft.ownerOf(_tokenIds[index]) == address(this));
            user.tokens.add(_tokenIds[index]);
        }

        emit Deposit(msg.sender, _pid, _tokenIds);
    }

    // Withdraw LP tokens from MasterPred.
    function withdraw(uint256 _pid, uint256[] memory _tokenIds) public whenNotPaused {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 amount = _tokenIds.length;
        require(user.amount >= amount, "Predictverse: Withdraw: not good");

        updatePool(_pid);
        uint256 pending = user.amount.mul(pool.accPredPerShare).div(1e30).sub(
            user.rewardDebt
        );
        if (pending > 0) {
            safePredTransfer(msg.sender, pending);
        }

        user.amount = user.amount.sub(amount);
        user.rewardDebt = user.amount.mul(pool.accPredPerShare).div(1e30);

        for(uint256 index = 0; index < amount; index++){
            require(user.tokens.contains(_tokenIds[index]), "Predictverse: Not owner of nft");
            pool.nft.safeTransferFrom(address(this), address(msg.sender), _tokenIds[index]);
            require(pool.nft.ownerOf(_tokenIds[index]) == msg.sender, "Predictverse: Nft not transferred correctly");
            user.tokens.remove(_tokenIds[index]);
        }

        emit Withdraw(msg.sender, _pid, _tokenIds);
    }


    // Withdraw without caring about rewards. EMERGENCY ONLY.
    function emergencyWithdraw(uint256 _pid, uint256[] memory _tokenIds) public whenPaused {
        PoolInfo storage pool = poolInfo[_pid];
        UserInfo storage user = userInfo[_pid][msg.sender];
        uint256 amount = _tokenIds.length;
        updatePool(_pid);
        user.amount = user.amount.sub(amount);
        user.rewardDebt = user.amount.mul(pool.accPredPerShare).div(1e30);

        for(uint256 index = 0; index < amount; index++){
            require(user.tokens.contains(_tokenIds[index]), "Predictverse: Not owner of nft");
            pool.nft.safeTransferFrom(address(this), address(msg.sender), _tokenIds[index]);
            require(pool.nft.ownerOf(_tokenIds[index]) == msg.sender, "Predictverse: Nft not transferred correctly");
            user.tokens.remove(_tokenIds[index]);
        }
        
        emit EmergencyWithdraw(msg.sender, _pid, amount);
    }

    // Safe pred transfer function, just in case if rounding error causes pool to not have enough PREDs.
    function safePredTransfer(address _to, uint256 _amount) internal {
        bank.safePredTransfer(_to, _amount);
    }

    // returns the nfts a user has staked in a pool
    function getUserInfo(address _user, uint256 _pid) 
        external view 
        returns(ExternalUserInfo memory) 
    {
        UserInfo storage user = userInfo[_pid][_user];
        uint256[] memory tokens = user.tokens.values();
        return ExternalUserInfo(user.amount, user.rewardDebt, tokens);
    }

    //Ensure contract can receive ERC721 tokens
    function onERC721Received(address operator, address from, uint256 tokenId, bytes memory data) pure override external 
        returns(bytes4){
        (operator, from, data, tokenId);
        return IERC721Receiver.onERC721Received.selector;
    }

    //pause deposits and withdrawals and allow only emergency withdrawals(forfeit funds)
    function pause() external onlyOwner{
        _pause();
    }

    function unpause() external onlyOwner{
        _unpause();
    }
}
