import { NearBindgen, near, call, view, initialize } from "near-sdk-js";

@NearBindgen({})
class Contract {
  owner_id: string = "";
  next_token_id: number = 1;
  // Simple storage: we store everything as JSON strings under fixed keys
  // This avoids the LookupMap reconstruction bug

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

    // Store metadata  ← ONLY THIS LINE WAS FIXED
    near.storageWrite(`token_meta:\( {token_id}`, ` \){title}|${description}`);

    // Add to owner's list
    const ownerKey = `owner_tokens:${receiver_id}`;
    let list = near.storageRead(ownerKey) || "";
    if (list === "") {
      list = token_id;
    } else {
      list = list + "," + token_id;
    }
    near.storageWrite(ownerKey, list);

    // Emit event for wallets
    const event = {
      standard: "nep171",
      version: "1.2.0",
      event: "nft_mint",
      data: [{ owner_id: receiver_id, token_ids: [token_id] }],
    };
    near.log(`EVENT_JSON:${JSON.stringify(event)}`);

    return token_id;
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

    const metaStr = near.storageRead(`token_meta:${token_id}`) || "Untitled|No description";
    const parts = metaStr.split("|");

    return {
      token_id: token_id,
      owner_id: owner,
      metadata: {
        title: parts[0] || "Untitled",
        description: parts[1] || "",
        media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
        copies: 1,
      },
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
    const max = limit ? limit : 50;
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
  get_next_token_id(): number {
    return this.next_token_id;
  }
}
