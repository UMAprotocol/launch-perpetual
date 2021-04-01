const Web3 = require("web3");
const HDWalletProvider = require("@truffle/hdwallet-provider");
const { getAbi, getAddress } = require("@uma/core");
const { parseFixed } = require("@ethersproject/bignumber");

// Optional arguments:
// --url: node url, by default points at http://localhost:8545.
// --mnemonic: an account mnemonic you'd like to use. The script will default to using the node's unlocked accounts.
// Mandatory arguments:
// --gasprice: gas price to use in GWEI
// --priceFeedIdentifier: price identifier to use.
// --collateralAddress: collateral token address.
// --expirationTimestamp: timestamp that the contract will expire at.
// --syntheticName: long name.
// --syntheticSymbol: short name.
// --minSponsorTokens: minimum sponsor position size

const argv = require("minimist")(process.argv.slice(), {
  string: ["url", "mnemonic", "priceFeedIdentifier", "fundingRateIdentifier", "collateralAddress", "syntheticName", "syntheticSymbol", "minSponsorTokens"]
});

if (!argv.priceFeedIdentifier) throw "--priceFeedIdentifier required";
if (!argv.fundingRateIdentifier) throw "--fundingRateIdentifier required";
if (!argv.collateralAddress) throw "--collateralAddress required";
if (!argv.syntheticName) throw "--syntheticName required";
if (!argv.syntheticSymbol) throw "--syntheticSymbol required";
if (!argv.minSponsorTokens) throw "--minSponsorTokens required";
if (!argv.gasprice) throw "--gasprice required (in GWEI)";
if (typeof argv.gasprice !== "number") throw "--gasprice must be a number";
if (argv.gasprice < 1 || argv.gasprice > 1000) throw "--gasprice must be between 1 and 1000 (GWEI)";

// Wrap everything in an async function to allow the use of async/await.
(async () => {
  const url = argv.url || "http://localhost:8545";

  // See HDWalletProvider documentation: https://www.npmjs.com/package/@truffle/hdwallet-provider.
  const hdwalletOptions = {
    mnemonic: {
      phrase: argv.mnemonic,
    },
    providerOrUrl: url,
    addressIndex: 0, // Change this to use the nth account.
  };

  // Initialize web3 with an HDWalletProvider if a mnemonic was provided. Otherwise, just give it the url.
  const web3 = new Web3(argv.mnemonic ? new HDWalletProvider(hdwalletOptions) : url);
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
    minSponsorTokens: { rawValue: parseFixed(argv.minSponsorTokens.toString(), decimals).toString() }, // Min sponsor position.
    tokenScaling: { rawValue: toWei("3060") }, // Token scaling used to make initial token trade at 100: 100 / (e.g. current ETH/BTC) price.
    liquidationLiveness: 7200, // 2 hour liquidation liveness.
    withdrawalLiveness: 7200 // 2 hour withdrawal liveness.
  };

  const configSettings = {
    rewardRatePerSecond: { rawValue: toWei("0.000000001") }, 
    // Approximately 3%/year: 0.000000001*60*60*24*360 = 0.03
    proposerBondPercentage: { rawValue: toWei("0.0007") }, 
    // 0.07% is derived from a PfC of 300%/year = (300 / 360 / 24) = .035% / hour, and the minimum time that a proposal 
    // can stay alive is 2 hours, so 0.07% is the minimum that should be staked by a proposer who might corrupt an
    // entire 2 hour proposal liveness period.
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
    gas: 8000000, // Based on empirical observation of Kovan deployments.
    gasPrice: argv.gasprice * 1000000000, // gasprice arg * 1 GWEI
    from: account,
  };

  // Simulate transaction to test before sending to the network.
  console.log("Simulating Deployment...");
  console.log(`Calling PerpFactory @ ${perpetualCreator.options.address}`)
  const address = await perpetualCreator.methods.createPerpetual(perpetualParams, configSettings).call(transactionOptions);
  console.log("Simulation successful. Expected Address:", address);

  // Since the simulated transaction succeeded, send the real one to the network.
  const { transactionHash } = await perpetualCreator.methods.createPerpetual(perpetualParams, configSettings).send(transactionOptions);
  console.log("Deployed in transaction:", transactionHash);

  // Log ABI encoded params for easier contract verification:
  const newPerpetual = new web3.eth.Contract(
    getAbi("Perpetual"),
    address
  ); 
  let perpConstructorParams = {
    ...perpetualParams,
    configStoreAddress: await newPerpetual.methods.configStore().call(),
    finderAddress: getAddress("Finder", networkId),
    tokenFactoryAddress: getAddress("TokenFactory", networkId),
    timerAddress: await perpetualCreator.methods.timerAddress().call(),
    tokenAddress: await newPerpetual.methods.tokenCurrency().call()
  };
  const encodedParameters = web3.eth.abi.encodeParameters(getAbi("Perpetual", "latest")[0].inputs, [
    perpConstructorParams
  ]);
  console.log("Encoded Perpetual Parameters", encodedParameters);
  console.table(perpConstructorParams);
  const encodedConfigStoreParameters = web3.eth.abi.encodeParameters(getAbi("ConfigStore", "latest")[0].inputs, [
    configSettings,
    await perpetualCreator.methods.timerAddress().call()
  ]);
  console.log("Encoded ConfigStore Parameters", encodedConfigStoreParameters);
  console.table({
    ...configSettings,
    timerAddress: await perpetualCreator.methods.timerAddress().call()
  });
  
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1); // Exit with a nonzero exit code to signal failure.
});
