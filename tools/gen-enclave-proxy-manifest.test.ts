import { describe, expect, test } from "vitest";
import {
  assignProxyDestinations,
  hostPort,
} from "./gen-enclave-proxy-manifest";

describe("enclave proxy manifest helpers", () => {
  test("parses host and default ports", () => {
    expect(hostPort("https://example.com/path", "x")).toEqual({
      label: "x",
      host: "example.com",
      port: 443,
    });
    expect(hostPort("http://127.0.0.1:8081", "local")).toEqual({
      label: "local",
      host: "127.0.0.1",
      port: 8081,
    });
  });

  test("assigns non-Aegis vsock ports", () => {
    const assigned = assignProxyDestinations(
      [
        { label: "walrus", host: "a.example", port: 443 },
        { label: "seal", host: "b.example", port: 443 },
      ],
      8103,
    );
    expect(assigned.map((d) => d.vport)).toEqual([8103, 8104]);
    expect(assigned.map((d) => d.lo)).toEqual(["127.0.0.4", "127.0.0.5"]);
  });
});
