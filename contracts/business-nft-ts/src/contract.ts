import { NearBindgen, near, call, view, initialize, LookupMap } from "near-sdk-js";

@NearBindgen({})
class Contract {
  owner_id: string = "";
  next_token_id: number = 1;

  // token_id → owner
  tokens: LookupMap<string> = new LookupMap("t");
  // token_id → metadata string (title|description)
  token_metadata: LookupMap<string> = new LookupMap("m");
  // owner → list of token_ids (comma separated)
  tokens_per_owner: LookupMap<string> = new LookupMap("o");

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

    // save owner
    this.tokens.set(token_id, receiver_id);

    // save metadata (FIXED template literal)
    this.token_metadata.set(token_id, `\( {title}| \){description}`);

    // add to owner's list
    let owner_tokens = this.tokens_per_owner.get(receiver_id) || "";
    if (owner_tokens === "") {
      owner_tokens = token_id;
    } else {
      owner_tokens = owner_tokens + "," + token_id;
    }
    this.tokens_per_owner.set(receiver_id, owner_tokens);

    // Emit the event wallets look for
    const event = {
      standard: "nep171",
      version: "1.2.0",
      event: "nft_mint",
      data: [
        {
          owner_id: receiver_id,
          token_ids: [token_id],
        },
      ],
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
    const owner = this.tokens.get(token_id);
    if (!owner) return null;

    const metaStr = this.token_metadata.get(token_id) || "Untitled|No description";
    const parts = metaStr.split("|");
    const title = parts[0] || "Untitled";
    const description = parts[1] || "";

    return {
      token_id: token_id,
      owner_id: owner,
      metadata: {
        title: title,
        description: description,
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
    const tokensStr = this.tokens_per_owner.get(account_id);
    if (!tokensStr) return [];

    const tokenIds = tokensStr.split(",");
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
    const tokensStr = this.tokens_per_owner.get(account_id);
    if (!tokensStr) return "0";
    return tokensStr.split(",").length.toString();
  }

  @view({})
  get_next_token_id(): number {
    return this.next_token_id;
  }
}
