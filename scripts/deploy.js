const { ethers, network } = require("hardhat");

const CONFIG = {
  baseSepolia: {
    name: "Base Sepolia",
    chainId: 84532,
    stableAddress: "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
    stableSymbol: "USDC",
    explorerBaseUrl: "https://sepolia.basescan.org",
  },
  tempoModerato: {
    name: "Tempo Moderato",
    chainId: 42431,
    stableAddress: "0x20c0000000000000000000000000000000000000",
    stableSymbol: "PathUSD",
    explorerBaseUrl: "https://moderato.tempo.xyz",
  },
};

async function main() {
  const networkName = network.name;
  const config = CONFIG[networkName];
  if (!config) throw new Error(`Unknown network: ${networkName}`);

  const [deployer] = await ethers.getSigners();
  console.log("\n" + "=".repeat(72));
  console.log(`Skalor Mandate deployment - ${config.name}`);
  console.log("=".repeat(72));
  console.log(`Deployer:        ${deployer.address}`);
  console.log(`Stable token:    ${config.stableSymbol} @ ${config.stableAddress}`);

  const balance = await ethers.provider.getBalance(deployer.address);
  console.log(`Native balance:  ${ethers.formatEther(balance)}`);
  if (balance === 0n) throw new Error("Deployer has no native gas balance.");

  console.log("\nDeploying MandateFactory...");
  const Factory = await ethers.getContractFactory("MandateFactory");
  const factory = await Factory.deploy();
  await factory.waitForDeployment();
  const factoryAddr = await factory.getAddress();
  console.log(`  Factory: ${factoryAddr}`);

  console.log("\nDeploying demo Mandate via factory...");
  const PER_TX_LIMIT = ethers.parseUnits("100", 6);
  const DAILY_LIMIT  = ethers.parseUnits("500", 6);

  const tx = await factory.deployMandate(
    config.stableAddress, deployer.address, deployer.address,
    PER_TX_LIMIT, DAILY_LIMIT, []
  );
  const receipt = await tx.wait();

  let mandateAddr = null;
  for (const log of receipt.logs) {
    try {
      const p = factory.interface.parseLog(log);
      if (p && p.name === "MandateDeployed") { mandateAddr = p.args.mandate; break; }
    } catch (_) {}
  }
  if (!mandateAddr) throw new Error("MandateDeployed event not found");
  console.log(`  Mandate: ${mandateAddr}`);

  console.log("\n" + "=".repeat(72));
  console.log("DEPLOYMENT COMPLETE");
  console.log("=".repeat(72));
  console.log(`Network:        ${config.name} (chain ${config.chainId})`);
  console.log(`Factory:        ${factoryAddr}`);
  console.log(`Demo Mandate:   ${mandateAddr}`);
  console.log(`Stable token:   ${config.stableSymbol}`);
  console.log(`Per-tx limit:   $100`);
  console.log(`Daily limit:    $500`);
  console.log("\nExplorer:");
  console.log(`  Factory:  ${config.explorerBaseUrl}/address/${factoryAddr}`);
  console.log(`  Mandate:  ${config.explorerBaseUrl}/address/${mandateAddr}`);
  console.log("\nNext: run demo:");
  console.log(`  MANDATE_ADDRESS=${mandateAddr} npx hardhat run scripts/demo-spend.js --network ${networkName}`);
  console.log("=".repeat(72) + "\n");
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
