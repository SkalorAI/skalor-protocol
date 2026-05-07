// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {Mandate} from "./Mandate.sol";

/// @title  MandateFactory
/// @notice Deploys per-agent Mandate contracts. Logs every deployment so the
///         off-chain Skalor indexer can discover and track every Mandate.
contract MandateFactory {
    event MandateDeployed(
        address indexed mandate,
        address indexed agent,
        address indexed controller,
        uint256 perTxLimit,
        uint256 dailyLimit
    );

    function deployMandate(
        IERC20 usdc,
        address agent,
        address controller,
        uint256 perTxLimit,
        uint256 dailyLimit,
        address[] calldata initialCounterparties
    ) external returns (address mandateAddr) {
        Mandate m = new Mandate(usdc, agent, controller, perTxLimit, dailyLimit, initialCounterparties);
        mandateAddr = address(m);
        emit MandateDeployed(mandateAddr, agent, controller, perTxLimit, dailyLimit);
    }
}
