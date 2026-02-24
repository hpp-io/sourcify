import { fetchJson } from "./utils.js";
import type { VerifyPayload } from "./types.js";

export async function verifyToSourcify(
  sourcifyBase: string,
  chainId: number,
  address: string,
  payload: VerifyPayload
): Promise<unknown> {
  const url = `${sourcifyBase.replace(/\/+$/, "")}/v2/verify/${chainId}/${address}`;
  return fetchJson(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "User-Agent": "hpp-backfill" },
    body: JSON.stringify(payload),
  });
}
