#!/bin/sh
# In-enclave init for the SealedBench attested evaluator.
#
# A Nitro enclave has no network of its own — every outbound byte crosses the
# vsock to the parent EC2 instance (host CID = 3), which runs
# setup-network-proxy.sh. socat forwards raw TCP, so each destination's TLS
# terminates *inside* the enclave: the host sees ciphertext only and cannot
# forge Walrus blobs, Seal key-server responses, or model completions.
#
# The reachable destinations come from the measured manifest baked at
# /etc/sealedbench/proxy-manifest.txt — so the PCRs attest exactly which hosts
# the enclave can dial (Walrus aggregator + publisher, the Seal key servers, and
# the one baked model endpoint). Nothing else resolves.
set +e

PORT="${ENCLAVE_PORT:-3000}"
HOST_CID=3
MANIFEST="${PROXY_MANIFEST:-/etc/sealedbench/proxy-manifest.txt}"

echo "SealedBench enclave init: port=${PORT} manifest=${MANIFEST}"

# Loopback up. Binding to the whole 127/8 makes every per-destination loopback
# IP (127.0.0.4, 127.0.0.5, ...) local without per-IP aliasing.
ip link set dev lo up 2>/dev/null || busybox ip link set dev lo up 2>/dev/null || true
ip addr add 127.0.0.1/8 dev lo 2>/dev/null || busybox ip addr add 127.0.0.1/8 dev lo 2>/dev/null || true

printf '127.0.0.1 localhost\n' > /etc/hosts
# No usable resolver in-enclave: only /etc/hosts entries resolve, so any host
# not in the measured manifest fails closed.
printf 'nameserver 127.0.0.1\n' > /etc/resolv.conf

# Outbound: for each measured host, alias it to a loopback IP and tunnel its
# port over vsock to the matching host-side listener.
while read -r host port vport lo _rest; do
  case "$host" in '' | \#*) continue ;; esac
  printf '%s %s\n' "$lo" "$host" >> /etc/hosts
  socat "TCP-LISTEN:${port},bind=${lo},fork,reuseaddr" "VSOCK-CONNECT:${HOST_CID}:${vport}" &
  echo "egress ${host}:${port} -> ${lo}:${port} -> vsock:${HOST_CID}:${vport}"
done < "$MANIFEST"

# Inbound: expose the axum server to the host over vsock so the orchestrator's
# /evaluate and /get_attestation requests can reach it.
socat "VSOCK-LISTEN:${PORT},reuseaddr,fork" "TCP:127.0.0.1:${PORT}" &
echo "ingress vsock:${PORT} -> tcp:127.0.0.1:${PORT}"

export ENCLAVE_ADDR="127.0.0.1:${PORT}"
LLAMA_PORT="${SEALEDBENCH_LLAMA_PORT:-8081}"
GGUF_PATH="${SEALEDBENCH_GGUF_PATH:-/models/smollm2-135m-instruct-q2_k.gguf}"
MODEL_ALIAS="${SEALEDBENCH_MODEL_ID:-smollm2-135m-instruct-q2_k}"

echo "starting llama-server on 127.0.0.1:${LLAMA_PORT} model=${MODEL_ALIAS}"
/usr/local/bin/llama-server \
  --host 127.0.0.1 \
  --port "${LLAMA_PORT}" \
  --model "${GGUF_PATH}" \
  --alias "${MODEL_ALIAS}" \
  --threads 2 \
  --ctx-size 1024 \
  --parallel 1 \
  --no-webui &

echo "starting sealedbench-enclave-server on ${ENCLAVE_ADDR}"
exec /usr/local/bin/sealedbench-enclave-server
