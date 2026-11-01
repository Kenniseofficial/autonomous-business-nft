import { NearBindgen, near, call, view, initialize, LookupMap } from "near-sdk-js";

@NearBindgen({})
class Contract {
  owner_id: string = "";
  next_token_id: number = 1;

  tokens: LookupMap<string> = new LookupMap("tokens");
  business_accounts: LookupMap<string> = new LookupMap("business");
  token_metadata: LookupMap<string> = new LookupMap("metadata");

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

    this.tokens.set(token_id, receiver_id);

    const business_account = `business-\( {token_id}. \){near.currentAccountId()}`;
    this.business_accounts.set(token_id, business_account);

    this.token_metadata.set(token_id, `\( {title}| \){description}`);

    return token_id;
  }

  @view({})
  get_next_token_id(): number {
    return this.next_token_id;
  }

  @view({})
  get_token_owner(token_id: string): string | null {
    return this.tokens.get(token_id);
  }

  @view({})
  get_business_account(token_id: string): string | null {
    return this.business_accounts.get(token_id);
  }

  @view({})
  get_token_metadata(token_id: string): string | null {
    return this.token_metadata.get(token_id);
  }
}
