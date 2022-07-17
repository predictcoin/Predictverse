// SPDX-License-Identifier: MIT
pragma solidity ^0.8.4;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract PredictcoinSquad is ERC721, ERC721Enumerable, Ownable {
    using Counters for Counters.Counter;

    Counters.Counter private _tokenIdCounter;

    uint private MAX_SUPPLY = 100;

    constructor() ERC721("Predictcoin Squad", "PREDNFT") {}

    function _baseURI() internal pure override returns (string memory) {
        return "ipfs://bafybeigc6izdclf7u6wumsi5zlfszdfbjj6jvtbdm64r7azhxanjqc3oaa/";
    }

    function safeMint(address to) public onlyOwner {
        require(totalSupply() < 100, "Max supply reached");
        uint256 tokenId = _tokenIdCounter.current();
        _tokenIdCounter.increment();
        _safeMint(to, tokenId);
    }

    function multiMint(address to, uint amount) public {
        for(uint i = 0; i < amount; i++){
            safeMint(to);
        }
    }

    // The following functions are overrides required by Solidity.

    function _beforeTokenTransfer(address from, address to, uint256 tokenId)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._beforeTokenTransfer(from, to, tokenId);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
