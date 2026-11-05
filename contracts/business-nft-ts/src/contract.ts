import { NearBindgen, near, call, view, initialize, LookupMap } from "near-sdk-js";

@NearBindgen({})
class Contract {
  owner_id: string = "";
  next_token_id: number = 1;

  tokens: LookupMap<string> = new LookupMap("t");           // token_id → owner
  token_metadata: LookupMap<string> = new LookupMap("m");   // token_id → JSON string
  tokens_per_owner: LookupMap<string> = new LookupMap("o"); // owner → "1,2,5"

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

    // Save owner
    this.tokens.set(token_id, receiver_id);

    // Save proper metadata as JSON
    const metadata = {
      title: title || "Autonomous Business NFT",
      description: description || "An NFT that runs its own business on NEAR",
      media: "https://near.org/wp-content/themes/near-19/assets/img/brand-icon.png",
      copies: 1
    };
    this.token_metadata.set(token_id, JSON.stringify(metadata));

    // Add to owner's list
    const current = this.tokens_per_owner.get(receiver_id) || "";
    const newList = current ? `\( {current}, \){token_id}` : token_id;
    this.tokens_per_owner.set(receiver_id, newList);

    // Emit NEP-171 event so wallets can index it
    near.log(`EVENT_JSON:{"standard":"nep171","version":"1.0.0","event":"nft_mint","data":[{"owner_id":"\( {receiver_id}","token_ids":[" \){token_id}"]}]}`);

    return token_id;
  }

  @view({})
  nft_token({ token_id }: { token_id: string }) {
    const owner = this.tokens.get(token_id);
    if (!owner) return null;

    const metaStr = this.token_metadata.get(token_id);
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
    const tokensStr = this.tokens_per_owner.get(account_id);
    if (!tokensStr) return [];

    const tokenIds = tokensStr.split(",");
    const start = parseInt(from_index);
    const end = Math.min(start + limit, tokenIds.length);

    const result = [];
    for (let i = start; i < end; i++) {
      const token = this.nft_token({ token_id: tokenIds[i] });
      if (token) result.push(token);
    }
    return result;
  }

  @view({})
  nft_supply_for_owner({ account_id }: { account_id: string }): string {
    const tokensStr = this.tokens_per_owner.get(account_id);
    if (!tokensStr) return "0";
    return tokensStr.split(",").length.toString();
  }

  @view({})
  get_next_token_id(): number {
    return this.next_token_id;
  }
}
