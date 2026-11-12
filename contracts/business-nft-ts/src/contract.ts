import { NearBindgen, near, call, view, initialize, assert } from "near-sdk-js";

const TGAS = 1_000_000_000_000n;
const MIN_ACTIVATION_DEPOSIT = 1_500_000_000_000_000_000_000_000n; // 1.5 NEAR: covers the treasury code storage

// near-sdk-js "Raw" storage functions take the key as bytes, not text
function keyBytes(s: string): Uint8Array {
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
const CODE_KEY = keyBytes("treasury_code");

// Some low-level near-sdk-js functions are typed differently between SDK versions,
// so the calls below go through this untyped handle to avoid build-time type errors.
const nearAny: any = near;

// ---- base64 -> bytes (used only for uploading the treasury wasm in small chunks) ----
const B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
const B64_TABLE = new Uint8Array(128);
for (let i = 0; i < 64; i++) B64_TABLE[B64.charCodeAt(i)] = i;

function b64ToBytes(s: string): Uint8Array {
  const out = new Uint8Array(Math.floor((s.length * 3) / 4));
  let buf = 0;
  let bits = 0;
  let o = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    if (c === 61) break; // '='
    buf = ((buf << 6) | B64_TABLE[c]) & 0xffff;
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (buf >> bits) & 0xff;
    }
  }
  return out.subarray(0, o);
}

// ---- owner token index helpers (used by nft_transfer) ----
function addToOwnerList(owner: string, token_id: string) {
  const key = `owner_tokens:${owner}`;
  let list = near.storageRead(key) || "";
  list = list === "" ? token_id : list + "," + token_id;
  near.storageWrite(key, list);
}

function removeFromOwnerList(owner: string, token_id: string) {
  const key = `owner_tokens:${owner}`;
  const list = near.storageRead(key) || "";
  const ids = list.split(",").filter((x) => x !== "" && x !== token_id);
  near.storageWrite(key, ids.join(","));
}

@NearBindgen({})
class Contract {
  owner_id: string = "";
  next_token_id: number = 1;

  @initialize({})
  init({ owner_id }: { owner_id: string }) {
    this.owner_id = owner_id;
  }

  @call({ payableFunction: true })
  nft_mint({
    receiver_id,
    title,
    description,
  }: {
    receiver_id: string;
    title: string;
    description: string;
  }): string {
    const token_id = this.next_token_id.toString();
    this.next_token_id += 1;

    // Store owner
    near.storageWrite(`token_owner:${token_id}`, receiver_id);

    // Store rich metadata
    const metadata = {
      title: title || "Autonomous Business NFT",
      description: description || "An NFT that runs its own business on NEAR",
      media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      copies: 1,
    };
    near.storageWrite(`token_meta:${token_id}`, JSON.stringify(metadata));

    // Pre-calculate business account name
    // FIX: the template string was corrupted (backslash / spaces); it must be exactly this
    const businessAccount = `business-${token_id}.${near.currentAccountId()}`;
    near.storageWrite(`business_account:${token_id}`, businessAccount);

    // Track tokens per owner
    const ownerKey = `owner_tokens:${receiver_id}`;
    let list = near.storageRead(ownerKey) || "";
    list = list === "" ? token_id : list + "," + token_id;
    near.storageWrite(ownerKey, list);

    // NEP-171 event
    const event = {
      standard: "nep171",
      version: "1.2.0",
      event: "nft_mint",
      data: [{ owner_id: receiver_id, token_ids: [token_id] }],
    };
    near.log(`EVENT_JSON:${JSON.stringify(event)}`);

    return token_id;
  }

  // ========== NEW: NEP-171 transfer (the dashboard's Sell / Transfer instructions rely on it) ==========
  // Moves ownership and keeps the owner_tokens index in sync, so the new owner can see the business
  // in the dashboard and is the only one who passes the treasury's owner check when claiming.
  @call({ payableFunction: true })
  nft_transfer({
    receiver_id,
    token_id,
    memo,
  }: {
    receiver_id: string;
    token_id: string;
    approval_id?: number;
    memo?: string;
  }) {
    assert(near.attachedDeposit() === 1n, "Requires attached deposit of exactly 1 yoctoNEAR");
    const sender = near.predecessorAccountId();
    const owner = near.storageRead(`token_owner:${token_id}`);
    assert(owner !== null && owner !== undefined, "Token not found");
    assert(owner === sender, "Only the token owner can transfer it");
    assert(receiver_id !== owner, "Receiver must be different from the current owner");

    near.storageWrite(`token_owner:${token_id}`, receiver_id);
    removeFromOwnerList(owner as string, token_id);
    addToOwnerList(receiver_id, token_id);

    const event = {
      standard: "nep171",
      version: "1.2.0",
      event: "nft_transfer",
      data: [{ old_owner_id: owner, new_owner_id: receiver_id, token_ids: [token_id], memo: memo || undefined }],
    };
    near.log(`EVENT_JSON:${JSON.stringify(event)}`);
  }

  // ========== NEW: treasury code upload (contract owner only) ==========
  // The compiled treasury.wasm is uploaded in small base64 chunks, then deployed onto each business account.
  @call({})
  treasury_code_reset() {
    assert(near.predecessorAccountId() === this.owner_id, "Only the contract owner");
    nearAny.storageWriteRaw(CODE_KEY, new Uint8Array(0));
  }

  @call({})
  treasury_code_append({ chunk_b64 }: { chunk_b64: string }) {
    assert(near.predecessorAccountId() === this.owner_id, "Only the contract owner");
    const existing: Uint8Array = nearAny.storageReadRaw(CODE_KEY) || new Uint8Array(0);
    const chunk = b64ToBytes(chunk_b64);
    const merged = new Uint8Array(existing.length + chunk.length);
    merged.set(existing, 0);
    merged.set(chunk, existing.length);
    nearAny.storageWriteRaw(CODE_KEY, merged);
  }

  @view({})
  treasury_code_len(): number {
    const code: Uint8Array | null = nearAny.storageReadRaw(CODE_KEY);
    return code ? code.length : 0;
  }

  // ========== NEW: activation (replaces the user-signed CreateAccount, which NEAR rejects for subaccounts) ==========
  // Only the NFT owner can activate. The contract creates business-<id>.<this contract>, funds it with the
  // attached deposit, deploys the treasury contract and registers the agent's function-call key.
  @call({ payableFunction: true })
  activate_business({
    token_id,
    agent_public_key,
  }: {
    token_id: string;
    agent_public_key: string;
  }) {
    const caller = near.predecessorAccountId();
    const owner = near.storageRead(`token_owner:${token_id}`);
    assert(owner === caller, "Only the NFT owner can activate this business");
    assert(!near.storageRead(`business_activated:${token_id}`), "Business already activated");

    const deposit = near.attachedDeposit();
    assert(deposit >= MIN_ACTIVATION_DEPOSIT, "Attach at least 1.5 NEAR to cover treasury storage");

    const code: Uint8Array | null = nearAny.storageReadRaw(CODE_KEY);
    assert(code !== null && code !== undefined && code.length > 0, "Treasury code has not been uploaded");

    const business = near.storageRead(`business_account:${token_id}`);
    assert(!!business, "Business account not found");

    near.storageWrite(`business_activated:${token_id}`, "1");
    near.storageWrite(`agent_key:${token_id}`, agent_public_key);

    const p = near.promiseBatchCreate(business as string);
    near.promiseBatchActionCreateAccount(p);
    near.promiseBatchActionTransfer(p, deposit);
    nearAny.promiseBatchActionDeployContract(p, code as Uint8Array);
    nearAny.promiseBatchActionFunctionCall(
      p,
      "add_agent_key",
      JSON.stringify({ public_key: agent_public_key }),
      0n,
      10n * TGAS
    );
    const cb = nearAny.promiseThen(
      p,
      near.currentAccountId(),
      "on_activated",
      JSON.stringify({ token_id, owner_id: caller, deposit: deposit.toString() }),
      0n,
      10n * TGAS
    );
    near.promiseReturn(cb);
  }

  // If account creation / deploy failed, undo the flags and refund the owner.
  @call({ privateFunction: true })
  on_activated({
    token_id,
    owner_id,
    deposit,
  }: {
    token_id: string;
    owner_id: string;
    deposit: string;
  }) {
    let ok = true;
    try {
      near.promiseResult(0);
    } catch (e) {
      ok = false;
    }
    if (!ok) {
      near.storageRemove(`business_activated:${token_id}`);
      near.storageRemove(`agent_key:${token_id}`);
      const p = near.promiseBatchCreate(owner_id);
      near.promiseBatchActionTransfer(p, BigInt(deposit));
      near.promiseReturn(p);
    }
  }

  // ========== NEW: rotate the agent key (owner only) ==========
  @call({})
  rotate_agent_key({
    token_id,
    agent_public_key,
  }: {
    token_id: string;
    agent_public_key: string;
  }) {
    const owner = near.storageRead(`token_owner:${token_id}`);
    assert(owner === near.predecessorAccountId(), "Only the NFT owner can rotate the key");
    const oldKey = near.storageRead(`agent_key:${token_id}`);
    assert(!!oldKey, "Business is not activated");
    const business = near.storageRead(`business_account:${token_id}`);

    const p = near.promiseBatchCreate(business as string);
    nearAny.promiseBatchActionFunctionCall(
      p,
      "rotate_agent_key",
      JSON.stringify({ old_key: oldKey, new_key: agent_public_key }),
      0n,
      20n * TGAS
    );
    const cb = nearAny.promiseThen(
      p,
      near.currentAccountId(),
      "on_rotated",
      JSON.stringify({ token_id, new_key: agent_public_key }),
      0n,
      10n * TGAS
    );
    near.promiseReturn(cb);
  }

  @call({ privateFunction: true })
  on_rotated({ token_id, new_key }: { token_id: string; new_key: string }) {
    try {
      near.promiseResult(0);
      near.storageWrite(`agent_key:${token_id}`, new_key);
    } catch (e) {
      // rotation failed on the business account; keep the old key on record
    }
  }

  // ========== VIEW METHODS ==========

  @view({})
  nft_token({ token_id }: { token_id: string }) {
    const owner = near.storageRead(`token_owner:${token_id}`);
    if (!owner) return null;

    let metadata: any = {
      title: "Untitled",
      description: "",
      media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      copies: 1,
    };

    const metaRaw = near.storageRead(`token_meta:${token_id}`);
    if (metaRaw) {
      try {
        metadata = JSON.parse(metaRaw);
      } catch (e) {
        const parts = metaRaw.split("|");
        metadata.title = parts[0] || "Untitled";
        metadata.description = parts[1] || "";
      }
    }

    return {
      token_id,
      owner_id: owner,
      metadata,
      business_account: near.storageRead(`business_account:${token_id}`) || null,
    };
  }

  @view({})
  nft_tokens_for_owner({
    account_id,
    from_index,
    limit,
  }: {
    account_id: string;
    from_index?: string;
    limit?: number;
  }) {
    const list = near.storageRead(`owner_tokens:${account_id}`);
    if (!list) return [];

    // FIX: skip empty entries (an owner list can become "" after a transfer)
    const tokenIds = list.split(",").filter((x) => x !== "");
    const start = from_index ? parseInt(from_index) : 0;
    const max = limit || 50;
    const end = Math.min(start + max, tokenIds.length);

    const result = [];
    for (let i = start; i < end; i++) {
      const token = this.nft_token({ token_id: tokenIds[i] });
      if (token) result.push(token);
    }
    return result;
  }

  @view({})
  nft_supply_for_owner({ account_id }: { account_id: string }): string {
    const list = near.storageRead(`owner_tokens:${account_id}`);
    if (!list) return "0";
    return list.split(",").filter((x) => x !== "").length.toString();
  }

  @view({})
  get_business_account({ token_id }: { token_id: string }): string | null {
    return near.storageRead(`business_account:${token_id}`) || null;
  }

  @view({})
  get_next_token_id(): number {
    return this.next_token_id;
  }

  // Used by each business's treasury contract to verify who owns the NFT when `claim` is called
  @view({})
  get_token_owner({ token_id }: { token_id: string }): string | null {
    return near.storageRead(`token_owner:${token_id}`) || null;
  }
}
