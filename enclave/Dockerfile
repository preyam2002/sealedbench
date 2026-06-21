ARG LLAMA_CPP_REF=fe7c8b2414bb39e3dbc192fb494a1eb054b90890

FROM debian:bookworm AS llama_builder
ARG LLAMA_CPP_REF
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates cmake g++ git make \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /src
RUN git clone https://github.com/ggml-org/llama.cpp.git \
    && cd llama.cpp \
    && git checkout ${LLAMA_CPP_REF} \
    && cmake -B build -DCMAKE_BUILD_TYPE=Release -DLLAMA_BUILD_SERVER=ON -DGGML_NATIVE=OFF \
    && cmake --build build --config Release -j2

# Builder: compile the enclave server. reqwest uses bundled rustls-tls (Mozilla
# roots compiled in), so no OpenSSL system libs are needed at build or runtime.
FROM rust:1.91-bookworm AS builder
WORKDIR /app
COPY Cargo.toml Cargo.lock ./
COPY src ./src
RUN cargo build --release --bin sealedbench-enclave-server

FROM debian:bookworm-slim

# In-enclave init deps: socat (vsock<->tcp tunnels), iproute2 (loopback), and
# libgomp1 for the CPU llama.cpp server.
# ca-certificates is belt-and-suspenders; rustls bundles its own roots.
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates socat iproute2 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Model target baked into the measured image -> reflected in the PCRs. The OSS
# model runs on enclave loopback; no model API key or external model host is
# needed for the demo path.
ARG SEALEDBENCH_MODEL_ENDPOINT="http://127.0.0.1:8081"
ARG SEALEDBENCH_MODEL_ID="smollm2-135m-instruct-q2_k"
ARG SEALEDBENCH_MODEL_PROVIDER="openai"
ARG SEALEDBENCH_GGUF_PATH="/models/smollm2-135m-instruct-q2_k.gguf"
ENV SEALEDBENCH_MODEL_ENDPOINT=${SEALEDBENCH_MODEL_ENDPOINT} \
    SEALEDBENCH_MODEL_ID=${SEALEDBENCH_MODEL_ID} \
    SEALEDBENCH_MODEL_PROVIDER=${SEALEDBENCH_MODEL_PROVIDER} \
    SEALEDBENCH_GGUF_PATH=${SEALEDBENCH_GGUF_PATH} \
    SEALEDBENCH_LLAMA_PORT=8081 \
    ENCLAVE_PORT=3000

# The measured outbound allowlist: the exact hosts the enclave may dial. Baking
# it means the attestation covers the destination set, not just the code.
# Generate before building: tools/gen-enclave-proxy-manifest.ts.
COPY out/proxy-manifest.txt /etc/sealedbench/proxy-manifest.txt
COPY models/smollm2-135m-instruct-q2_k.gguf /models/smollm2-135m-instruct-q2_k.gguf
COPY run.sh /usr/local/bin/run.sh
COPY --from=llama_builder /src/llama.cpp/build/bin/llama-server /usr/local/bin/llama-server
COPY --from=builder /app/target/release/sealedbench-enclave-server /usr/local/bin/sealedbench-enclave-server
RUN chmod +x /usr/local/bin/run.sh

EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/run.sh"]
