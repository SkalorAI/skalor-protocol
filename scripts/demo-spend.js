const { ethers, network } = require("hardhat");

const CONFIG = {
  baseSepolia:    { name: "Base Sepolia",    stableAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e", stableSymbol: "USDC",    explorerBaseUrl: "https://sepolia.basescan.org" },
  tempoModerato:  { name: "Tempo Moderato",  stableAddress: "0x20c0000000000000000000000000000000000000", stableSymbol: "PathUSD", explorerBaseUrl: "https://moderato.tempo.xyz" },
};

const DEMO_VENDOR = "0x000000000000000000000000000000000000dEaD";
const ERC20_ABI = ["function balanceOf(address) view returns (uint256)", "function approve(address, uint256) returns (bool)"];

const fmt = (b) => Number(ethers.formatUnits(b, 6)).toLocaleString("en-US", { style: "currency", currency: "USD" });

async function main() {
  const cfg = CONFIG[network.name]; if (!cfg) throw new Error(`Unknown network: ${network.name}`);
  const mandateAddress = process.env.MANDATE_ADDRESS;
  if (!mandateAddress) throw new Error("Set MANDATE_ADDRESS env var.");

  const [signer] = await ethers.getSigners();
  const stable = new ethers.Contract(cfg.stableAddress, ERC20_ABI, signer);
  const mandate = await ethers.getContractAt("Mandate", mandateAddress);

  console.log(`\n=== SKALOR MANDATE LIVE DEMO === (${cfg.name})\n`);
  console.log(`Mandate: ${mandateAddress}`);
  console.log(`Token:   ${cfg.stableSymbol}\n`);

  const TOP_UP = ethers.parseUnits("1000", 6);
  let mandateBal = await stable.balanceOf(mandateAddress);
  if (mandateBal < ethers.parseUnits("100", 6)) {
    console.log(`Topping up Mandate with ${fmt(TOP_UP)}...`);
    await (await stable.approve(mandateAddress, TOP_UP)).wait();
    await (await mandate.deposit(TOP_UP)).wait();
    console.log(`  Funded.\n`);
  }

  if (!await mandate.allowedCounterparties(DEMO_VENDOR)) {
    console.log(`Allowlisting demo vendor...`);
    await (await mandate.allowCounterparty(DEMO_VENDOR)).wait();
    console.log(`  Allowed.\n`);
  }

  console.log("DEMO 1 — Spend $50 (under per-tx limit) — should SUCCEED");
  const intent50 = ethers.keccak256(ethers.toUtf8Bytes("buy 1 OpenAI API credit"));
  try {
    const tx = await mandate.spend(DEMO_VENDOR, ethers.parseUnits("50", 6), intent50);
    const r = await tx.wait();
    console.log(`  APPROVED — tx: ${r.hash}`);
    console.log(`  Explorer: ${cfg.explorerBaseUrl}/tx/${r.hash}\n`);
  } catch (e) { console.log(`  FAILED unexpectedly: ${e.shortMessage || e.message}\n`); throw e; }

  console.log("DEMO 2 — Spend $10,000 (over per-tx limit) — should REVERT");
  const intent10k = ethers.keccak256(ethers.toUtf8Bytes("agent compromised — drain attempt"));
  try {
    await (await mandate.spend(DEMO_VENDOR, ethers.parseUnits("10000", 6), intent10k)).wait();
    console.log(`  UNEXPECTEDLY succeeded\n`); process.exit(1);
  } catch (e) {
    console.log(`  REVERTED on-chain: ${e.reason || e.shortMessage || e.message}`);
    console.log(`  The Mandate enforced the policy.\n`);
  }

  console.log("=== DEMO COMPLETE ===");
  console.log(`View: ${cfg.explorerBaseUrl}/address/${mandateAddress}\n`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
