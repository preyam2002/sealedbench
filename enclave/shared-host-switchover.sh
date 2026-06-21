#!/bin/bash
# Guarded helper for the shared EC2 Nitro host.
# It never deletes build artifacts and terminates enclaves only by explicit ID.
set -euo pipefail

MODE="${1:-status}"
AEGIS_PATH="${AEGIS_PATH:-$HOME/aegis-wallet-nitro/enclave}"
SEALEDBENCH_PATH="${SEALEDBENCH_PATH:-$HOME/sealedbench-nitro/enclave}"
AEGIS_NAME="${AEGIS_NAME:-aegis-enclave}"
SEALEDBENCH_NAME="${SEALEDBENCH_NAME:-sealedbench-enclave}"
AEGIS_CID="${AEGIS_CID:-16}"
SEALEDBENCH_CID="${SEALEDBENCH_CID:-17}"
SEALEDBENCH_MEMORY_MIB="${SEALEDBENCH_MEMORY_MIB:-2048}"
SEALEDBENCH_CPU_COUNT="${SEALEDBENCH_CPU_COUNT:-2}"
SEALEDBENCH_HOST_PORT="${SEALEDBENCH_HOST_PORT:-3001}"

need() {
  command -v "$1" >/dev/null 2>&1 || {
    echo "missing command: $1" >&2
    exit 1
  }
}

enclave_id_by_name() {
  local name="$1"
  sudo nitro-cli describe-enclaves \
    | jq -r --arg name "$name" '.[] | select(.EnclaveName == $name) | .EnclaveID' \
    | head -1
}

status() {
  echo "allocator:"
  sudo cat /etc/nitro_enclaves/allocator.yaml
  echo
  echo "enclaves:"
  sudo nitro-cli describe-enclaves
  echo
  echo "services:"
  systemctl is-active aegis-sui-proxy.service aegis-inbound-proxy.service || true
  systemctl is-active sealedbench-ingress.service || true
}

require_aegis_stop_approval() {
  if [ "${SEALEDBENCH_ALLOW_AEGIS_STOP:-}" != "true" ]; then
    echo "Refusing to stop Aegis without SEALEDBENCH_ALLOW_AEGIS_STOP=true" >&2
    exit 2
  fi
}

stop_aegis_for_switchover() {
  require_aegis_stop_approval
  local aegis_id
  aegis_id="$(enclave_id_by_name "$AEGIS_NAME")"
  sudo systemctl stop aegis-inbound-proxy.service || true
  if [ -n "$aegis_id" ]; then
    sudo nitro-cli terminate-enclave --enclave-id "$aegis_id"
  fi
}

stop_sealedbench() {
  local sealedbench_id
  sealedbench_id="$(enclave_id_by_name "$SEALEDBENCH_NAME")"
  sudo systemctl stop sealedbench-ingress.service || true
  systemctl list-units --type=service --all 'sealedbench-egress-*.service' --no-legend \
    | awk '{print $1}' \
    | xargs -r sudo systemctl stop
  if [ -n "$sealedbench_id" ]; then
    sudo nitro-cli terminate-enclave --enclave-id "$sealedbench_id"
  fi
}

start_sealedbench() {
  stop_aegis_for_switchover
  cd "$SEALEDBENCH_PATH"
  ENCLAVE_CID="$SEALEDBENCH_CID" \
    ENCLAVE_NAME="$SEALEDBENCH_NAME" \
    MEMORY_MIB="$SEALEDBENCH_MEMORY_MIB" \
    CPU_COUNT="$SEALEDBENCH_CPU_COUNT" \
    make run-enclave
  SEALEDBENCH_HOST_PORT="$SEALEDBENCH_HOST_PORT" \
    ENCLAVE_PORT=3000 \
    PROXY_MANIFEST=out/proxy-manifest.txt \
    ./setup-network-proxy.sh
  curl -sS "http://127.0.0.1:${SEALEDBENCH_HOST_PORT}/get_attestation" \
    > /tmp/sealedbench-attestation.json
  echo "SealedBench attestation: /tmp/sealedbench-attestation.json"
}

restore_aegis() {
  stop_sealedbench
  cd "$AEGIS_PATH"
  ENCLAVE_CID="$AEGIS_CID" make run-enclave
  ./setup-network-proxy.sh
  sudo tee /etc/systemd/system/aegis-inbound-proxy.service >/dev/null <<EOF
[Unit]
Description=Aegis Vault inbound localhost HTTP to enclave vsock bridge
After=network.target

[Service]
Type=simple
ExecStart=/usr/bin/socat TCP-LISTEN:3000,bind=127.0.0.1,reuseaddr,fork VSOCK-CONNECT:16:3000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF
  sudo systemctl daemon-reload
  sudo systemctl enable aegis-inbound-proxy.service >/dev/null 2>&1 || true
  sudo systemctl restart aegis-inbound-proxy.service
  echo "Aegis restored on 127.0.0.1:3000 -> VSOCK-CONNECT:16:3000"
}

need jq
need nitro-cli
need systemctl
need socat

case "$MODE" in
  status)
    status
    ;;
  start-sealedbench)
    start_sealedbench
    ;;
  restore-aegis)
    restore_aegis
    ;;
  *)
    echo "usage: $0 {status|start-sealedbench|restore-aegis}" >&2
    exit 64
    ;;
esac
