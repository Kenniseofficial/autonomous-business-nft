import { NearBindgen, near, call, view, initialize, NearPromise } from "near-sdk-js";
import { PublicKey } from "near-sdk-js/lib/types";

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

    near.storageWrite(`token_owner:${token_id}`, receiver_id);

    const metadata = {
      title: title || "Autonomous Business NFT",
      description: description || "An NFT that runs its own business on NEAR",
      media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      copies: 1
    };
    near.storageWrite(`token_meta:${token_id}`, JSON.stringify(metadata));

    const businessAccount = `business-\( {token_id}. \){near.currentAccountId()}`;
    near.storageWrite(`business_account:${token_id}`, businessAccount);

    const ownerKey = `owner_tokens:${receiver_id}`;
    let list = near.storageRead(ownerKey) || "";
    list = list === "" ? token_id : list + "," + token_id;
    near.storageWrite(ownerKey, list);

    const event = {
      standard: "nep171",
      version: "1.2.0",
      event: "nft_mint",
      data: [{ owner_id: receiver_id, token_ids: [token_id] }],
    };
    near.log(`EVENT_JSON:${JSON.stringify(event)}`);

    return token_id;
  }

  // ========== NEW: Create real sub-account + Function-Call Key ==========
  @call({ payableFunction: true })
  create_business_account({
    token_id,
    public_key,
  }: {
    token_id: string;
    public_key: string;
  }) {
    const owner = near.storageRead(`token_owner:${token_id}`);
    if (!owner) {
      near.panicUtf8("Token does not exist");
    }
    if (near.predecessorAccountId() !== owner) {
      near.panicUtf8("Only the NFT owner can create the business account");
    }

    const businessAccount = near.storageRead(`business_account:${token_id}`);
    if (!businessAccount) {
      near.panicUtf8("Business account name not found");
    }

    const storageCost = BigInt("100000000000000000000000"); // 0.1 NEAR

    if (near.attachedDeposit() < storageCost) {
      near.panicUtf8("Attach at least 0.1 NEAR");
    }

    // Create the sub-account and attach a Function-Call Key
    // The key can only call methods on THIS contract
    return NearPromise.new(businessAccount)
      .createAccount()
      .transfer(storageCost)
      .addAccessKey(
        PublicKey.fromString(public_key),
        BigInt("0"),                      // unlimited gas allowance
        near.currentAccountId(),          // only this contract
        ""                                // empty string = all methods
      );
  }

  @view({})
  nft_metadata() {
    return {
      spec: "nft-1.0.0",
      name: "Autonomous Business NFT",
      symbol: "ABNFT",
      icon: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      base_uri: null,
      reference: null,
      reference_hash: null,
    };
  }

  @view({})
  nft_token({ token_id }: { token_id: string }) {
    const owner = near.storageRead(`token_owner:${token_id}`);
    if (!owner) return null;

    const metaRaw = near.storageRead(`token_meta:${token_id}`);
    let metadata = {
      title: "Untitled",
      description: "No description",
      media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      copies: 1
    };

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
      business_account: near.storageRead(`business_account:${token_id}`) || null
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

    const tokenIds = list.split(",");
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
    return list.split(",").length.toString();
  }

  @view({})
  get_business_account({ token_id }: { token_id: string }): string | null {
    return near.storageRead(`business_account:${token_id}`) || null;
  }

  @view({})
  get_next_token_id(): number {
    return this.next_token_id;
  }
}
