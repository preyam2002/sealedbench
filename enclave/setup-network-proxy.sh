#!/bin/bash
# Host-side (parent EC2) network proxy for the SealedBench enclave. Run AFTER
# `make run-enclave`. Reads the same measured manifest the EIF was built with and
# stands up, via systemd + socat:
#   - one vsock->TCP egress forwarder per destination (Walrus, Seal, model);
#   - one TCP->vsock ingress bridge so the orchestrator reaches /evaluate.
# socat forwards raw TCP, so destination TLS terminates inside the enclave — the
# host can delay or drop, never forge.
set -e

MANIFEST="${PROXY_MANIFEST:-out/proxy-manifest.txt}"
ENCLAVE_PORT="${ENCLAVE_PORT:-3000}"
HOST_PORT="${SEALEDBENCH_HOST_PORT:-3001}"

if [ ! -f "$MANIFEST" ]; then
  echo "❌ manifest not found: $MANIFEST"
  echo "   generate it (repo root) then rebuild the EIF:"
  echo "   pnpm tsx tools/gen-enclave-proxy-manifest.ts --model-endpoint <url> --out enclave/$MANIFEST"
  exit 1
fi

ENCLAVE_CID=$(sudo nitro-cli describe-enclaves | jq -r '.[0].EnclaveCID')
if [ "$ENCLAVE_CID" = "null" ] || [ -z "$ENCLAVE_CID" ]; then
  echo "❌ no enclave running (start it: make run-enclave)"
  exit 1
fi
echo "Enclave CID: $ENCLAVE_CID"

command -v socat >/dev/null 2>&1 || sudo yum install -y socat || sudo apt-get install -y socat

# Pass 1: write all egress unit files (no restart yet).
VPORTS=""
while read -r host port vport lo _rest; do
  case "$host" in '' | \#*) continue ;; esac
  sudo tee "/etc/systemd/system/sealedbench-egress-${vport}.service" >/dev/null <<EOF
[Unit]
Description=SealedBench enclave egress ${host}:${port} (vsock ${vport})
After=network.target

[Service]
ExecStart=/usr/bin/socat VSOCK-LISTEN:${vport},reuseaddr,fork TCP:${host}:${port}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  VPORTS="${VPORTS} ${vport}"
  echo "egress vsock:${vport} -> ${host}:${port}"
done < "$MANIFEST"

# Ingress: host localhost:HOST_PORT -> enclave vsock:ENCLAVE_PORT, so the
# orchestrator can POST /evaluate and GET /get_attestation without colliding
# with Aegis on 127.0.0.1:3000.
sudo tee /etc/systemd/system/sealedbench-ingress.service >/dev/null <<EOF
[Unit]
Description=SealedBench enclave ingress (127.0.0.1:${HOST_PORT} -> vsock ${ENCLAVE_CID}:${ENCLAVE_PORT})
After=network.target

[Service]
ExecStart=/usr/bin/socat TCP-LISTEN:${HOST_PORT},bind=127.0.0.1,reuseaddr,fork VSOCK-CONNECT:${ENCLAVE_CID}:${ENCLAVE_PORT}
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

sudo systemctl daemon-reload
for vport in $VPORTS; do
  sudo systemctl enable "sealedbench-egress-${vport}" >/dev/null 2>&1 || true
  sudo systemctl restart "sealedbench-egress-${vport}"
done
sudo systemctl enable sealedbench-ingress >/dev/null 2>&1 || true
sudo systemctl restart sealedbench-ingress

echo "✅ proxies up. /get_attestation + /evaluate at http://127.0.0.1:${HOST_PORT}"
