const Web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const { getAbi, getAddress } = require("@uma/core");
const { parseFixed } = require("@ethersproject/bignumber");
require("dotenv").config();

// Optional arguments:
// --url: node url, by default points at http://localhost:8545.
// --priceFeedIdentifier: price identifier to use.
// --collateralAddress: collateral token address.
// --expirationTimestamp: timestamp that the contract will expire at.
// --syntheticName: long name.
// --syntheticSymbol: short name.
// --minSponsorTokens: minimum sponsor position size

const argv = require("minimist")(process.argv.slice(), {
  string: ["url", "priceFeedIdentifier", "fundingRateIdentifier", "collateralAddress", "syntheticName", "syntheticSymbol", "minSponsorTokens"]
});

// Sanity test optional arguments:
if (!argv.url.startsWith("https")) throw "--url must be an HTTPS endpoint";
if (!argv.priceFeedIdentifier) throw "--priceFeedIdentifier required";
if (!argv.fundingRateIdentifier) throw "--fundingRateIdentifier required";
if (!argv.collateralAddress) throw "--collateralAddress required";
if (!argv.syntheticName) throw "--syntheticName required";
if (!argv.syntheticSymbol) throw "--syntheticSymbol required";
if (!argv.minSponsorTokens) throw "--minSponsorTokens required";

// Check for environment variables:
if (!process.env.MNEMONIC) console.log("missing account MNEMONIC, defaulting to node's unlocked account");

// Wrap everything in an async function to allow the use of async/await.
(async () => {
  const url = argv.url || "http://localhost:8545";

  // See HDWalletProvider documentation: https://www.npmjs.com/package/@truffle/hdwallet-provider.
  const hdwalletOptions = {
    mnemonic: {
      phrase: process.env.MNEMONIC,
    },
    providerOrUrl: url,
    addressIndex: 0, // Change this to use the nth account.
  };

  // Initialize web3 with an HDWalletProvider if a mnemonic was provided. Otherwise, just give it the url.
  const web3 = new Web3(process.env.MNEMONIC ? new HDWalletProvider(hdwalletOptions) : url);
  const { toWei, utf8ToHex, padRight } = web3.utils;

  const accounts = await web3.eth.getAccounts();
  if (!accounts || accounts.length === 0)
    throw "No accounts. Must provide mnemonic or node must have unlocked accounts.";
  const account = accounts[0];
  const networkId = await web3.eth.net.getId();

  // Grab collateral decimals.
  const collateral = new web3.eth.Contract(
    getAbi("IERC20Standard"),
    argv.collateralAddress
  );
  const decimals = (await collateral.methods.decimals().call()).toString();

  // Example Perpetual Parameters. Customize these.
  const perpetualParams = {
    collateralAddress: argv.collateralAddress.toString(), // Collateral token address.
    priceFeedIdentifier: padRight(utf8ToHex(argv.priceFeedIdentifier.toString()), 64), // Price identifier to use.
    fundingRateIdentifier: padRight(utf8ToHex(argv.fundingRateIdentifier.toString()), 64), // Funding rate to use.
    syntheticName: argv.syntheticName, // Long name.
    syntheticSymbol: argv.syntheticSymbol, // Short name.
    collateralRequirement: { rawValue: toWei("1.25") }, // 125% collateral req.
    disputeBondPercentage: { rawValue: toWei("0.1") }, // 10% dispute bond.
    sponsorDisputeRewardPercentage: { rawValue: toWei("0.05") }, // 5% reward for sponsors who are disputed invalidly
    disputerDisputeRewardPercentage: { rawValue: toWei("0.2") }, // 20% reward for correct disputes.
    minSponsorTokens: { rawValue: parseFixed(argv.minSponsorTokens.toString(), decimals) }, // Min sponsor position.
    tokenScaling: { rawValue: toWei("1") }, // Token scaling.
    liquidationLiveness: 7200, // 2 hour liquidation liveness.
    withdrawalLiveness: 7200 // 2 hour withdrawal liveness.
  };

  const configSettings = {
    rewardRatePerSecond: { rawValue: "0" },
    proposerBondPercentage: { rawValue: "0" },
    timelockLiveness: 86400, // 1 day
    maxFundingRate: { rawValue: web3.utils.toWei("0.00001") },
    minFundingRate: { rawValue: web3.utils.toWei("-0.00001") },
    proposalTimePastLimit: 1800 // 30 minutes
  };

  const perpetualCreator = new web3.eth.Contract(
    getAbi("PerpetualCreator"),
    getAddress("PerpetualCreator", networkId)
  );

  // Transaction parameters
  const transactionOptions = {
    gas: 12000000, // 12MM is very high. Set this lower if you have < 2 ETH or so in your wallet.
    gasPrice: await web3.eth.getGasPrice(),
    // Web3 estimates the gas price using the last few blocks median gas price.
    from: account,
  };

  // Simulate transaction to test before sending to the network.
  console.log("Simulating Deployment...");
  const address = await perpetualCreator.methods.createPerpetual(perpetualParams, configSettings).call(transactionOptions);
  console.log("Simulation successful. Expected Address:", address);

  return;
  // Since the simulated transaction succeeded, send the real one to the network.
  const { transactionHash } = await perpetualCreator.methods.createPerpetual(perpetualParams, configSettings).send(transactionOptions);
  console.log("Deployed in transaction:", transactionHash);
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1); // Exit with a nonzero exit code to signal failure.
});
