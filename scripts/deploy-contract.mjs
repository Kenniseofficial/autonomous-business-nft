// Deploys a .wasm file to the NFT contract account (testnet).
// Usage:  node deploy-contract.mjs /path/to/business_nft.wasm
// The key is read from the NEAR_PRIVATE_KEY environment variable, never from this file.
import fs from "fs";
import { JsonRpcProvider, Account, KeyPairSigner } from "near-api-js";

const CONTRACT = "buildingfromthetop.testnet";
const RPC = "https://rpc.testnet.near.org";

const wasmPath = process.argv[2];
const key = process.env.NEAR_PRIVATE_KEY;
if (!wasmPath) throw new Error("Give the path to the .wasm file, e.g. node deploy-contract.mjs ./business_nft.wasm");
if (!key) throw new Error("Set NEAR_PRIVATE_KEY first (see the guide)");

const provider = new JsonRpcProvider({ url: RPC });
const signer = KeyPairSigner.fromSecretKey(key);
const account = new Account(CONTRACT, provider, signer);

const wasm = fs.readFileSync(wasmPath);
console.log("File:", wasmPath, "-", wasm.length, "bytes");
console.log("Deploying to", CONTRACT, "...");
const result = await account.deployContract(wasm);
console.log("Deploy finished. Transaction:", result?.transaction?.hash ?? "(check the explorer)");
