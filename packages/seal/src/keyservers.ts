import {
  createSuiClient,
  keyServerObjectIds,
  type SealNetwork,
  type SuiRpcClient,
} from "./config.ts";

/** What the enclave needs to fetch keys from one Seal key server. */
export type KeyServerInfo = {
  objectId: string;
  url: string;
  /** IBE master public key (96-byte G2), base64. */
  pkB64: string;
};

function fieldsOf(content: unknown): Record<string, unknown> {
  if (
    content &&
    typeof content === "object" &&
    "fields" in content &&
    content.fields &&
    typeof content.fields === "object"
  ) {
    return content.fields as Record<string, unknown>;
  }
  throw new Error("object content has no fields");
}

function pkToBase64(value: unknown): string {
  if (Array.isArray(value)) {
    return Buffer.from(value as number[]).toString("base64");
  }
  if (typeof value === "string") {
    // JSON-RPC may already render vector<u8> as base64.
    return value;
  }
  throw new Error("key server pk must be number[] or base64 string");
}

/**
 * Resolve a key server's fetch_key URL + IBE master public key from its
 * on-chain object: the `KeyServer` wrapper records first/last version, and the
 * versioned `KeyServerV1` lives in a dynamic field keyed by that u64 version.
 */
export async function fetchKeyServerInfo(
  client: SuiRpcClient,
  objectId: string,
): Promise<KeyServerInfo> {
  const wrapper = await client.getObject({
    id: objectId,
    options: { showContent: true },
  });
  const content = wrapper.data?.content;
  if (content?.dataType !== "moveObject") {
    throw new Error(`key server ${objectId} has no Move object content`);
  }
  const fields = content.fields as Record<string, unknown>;
  const version = String(fields.last_version ?? fields.first_version ?? "1");

  const versioned = await client.getDynamicFieldObject({
    parentId: objectId,
    name: { type: "u64", value: version },
  });
  const versionedContent = versioned.data?.content;
  if (versionedContent?.dataType !== "moveObject") {
    throw new Error(
      `key server ${objectId} has no versioned record at version ${version}`,
    );
  }
  const wrapperFields = fieldsOf(versionedContent);
  const value = fieldsOf(wrapperFields.value ?? versionedContent);
  const url = String(value.url ?? "");
  if (!url) {
    throw new Error(`key server ${objectId} v${version} records no URL`);
  }
  return { objectId, url, pkB64: pkToBase64(value.pk) };
}

/** Resolve all configured key servers for a network. */
export async function fetchConfiguredKeyServers(
  network: SealNetwork,
  client: SuiRpcClient = createSuiClient(network),
): Promise<KeyServerInfo[]> {
  return Promise.all(
    keyServerObjectIds(network).map((objectId) =>
      fetchKeyServerInfo(client, objectId),
    ),
  );
}
