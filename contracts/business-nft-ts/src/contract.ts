import { NearBindgen, near, call, view, initialize } from "near-sdk-js";

@NearBindgen({})
class Contract {
  owner_id: string = "";
  next_token_id: number = 1;

  @initialize({})
  init({ owner_id }: { owner_id: string }) {
    this.owner_id = owner_id;
  }

  // ========== REQUIRED BY WALLETS ==========
  @view({})
  nft_metadata() {
    return {
      spec: "nft-1.0.0",
      name: "Autonomous Business NFT",
      symbol: "ABNFT",
      icon: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      base_uri: null,
      reference: null,
      reference_hash: null
    };
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

    // Owner of this token
    near.storageWrite(`token_owner:${token_id}`, receiver_id);

    // Metadata
    const metadata = {
      title: title || "Autonomous Business NFT",
      description: description || "An NFT that runs its own business on NEAR",
      media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      copies: 1
    };
    near.storageWrite(`token_meta:${token_id}`, JSON.stringify(metadata));

    // Owner → list of token_ids
    const ownerKey = `owner_tokens:${receiver_id}`;
    const current = near.storageRead(ownerKey) || "";
    const newList = current ? `\( {current}, \){token_id}` : token_id;
    near.storageWrite(ownerKey, newList);

    // Emit the event wallets look for
    near.log(
      `EVENT_JSON:{"standard":"nep171","version":"1.0.0","event":"nft_mint","data":[{"owner_id":"\( {receiver_id}","token_ids":[" \){token_id}"]}]}`
    );

    return token_id;
  }

  @view({})
  nft_token({ token_id }: { token_id: string }) {
    const owner = near.storageRead(`token_owner:${token_id}`);
    if (!owner) return null;

    const metaStr = near.storageRead(`token_meta:${token_id}`);
    let metadata = {
      title: "Untitled",
      description: "No description",
      media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      copies: 1
    };

    if (metaStr) {
      try {
        metadata = JSON.parse(metaStr);
      } catch (e) {}
    }

    return {
      token_id,
      owner_id: owner,
      metadata
    };
  }

  @view({})
  nft_tokens_for_owner({
    account_id,
    from_index = "0",
    limit = 50,
  }: {
    account_id: string;
    from_index?: string;
    limit?: number;
  }) {
    const tokensStr = near.storageRead(`owner_tokens:${account_id}`);
    if (!tokensStr) return [];

    const tokenIds = tokensStr.split(",").filter(id => id.length > 0);
    const start = parseInt(from_index) || 0;
    const end = Math.min(start + (limit || 50), tokenIds.length);

    const result = [];
    for (let i = start; i < end; i++) {
      const token = this.nft_token({ token_id: tokenIds[i] });
      if (token) result.push(token);
    }
    return result;
  }

  @view({})
  nft_supply_for_owner({ account_id }: { account_id: string }): string {
    const tokensStr = near.storageRead(`owner_tokens:${account_id}`);
    if (!tokensStr) return "0";
    return tokensStr.split(",").filter(id => id.length > 0).length.toString();
  }

  @view({})
  get_next_token_id(): number {
    return this.next_token_id;
  }
}
