.PHONY: build docker-build docker-build-prebuilt build-enclave build-enclave-prebuilt run-enclave run-enclave-debug host-proxy stop-enclave logs pcrs clean test

IMAGE ?= sealedbench-enclave:latest
OUT_DIR ?= out
EIF ?= $(OUT_DIR)/sealedbench-enclave.eif
PORT ?= 3000
ENCLAVE_CID ?= 16
ENCLAVE_NAME ?= sealedbench-enclave
MEMORY_MIB ?= 3072
CPU_COUNT ?= 2
MANIFEST ?= $(OUT_DIR)/proxy-manifest.txt
# Baked model target, reflected in the PCRs. Set per deployment, e.g.:
#   make build-enclave BUILD_ARGS='\
#     --build-arg SEALEDBENCH_MODEL_ENDPOINT=https://api.anthropic.com \
#     --build-arg SEALEDBENCH_MODEL_ID=claude-opus-4-8 \
#     --build-arg SEALEDBENCH_MODEL_PROVIDER=anthropic'
BUILD_ARGS ?=

build:
	cargo build --release --bin sealedbench-enclave-server

docker-build:
	@test -f $(MANIFEST) || { \
		echo "missing $(MANIFEST)."; \
		echo "from repo root: pnpm tsx tools/gen-enclave-proxy-manifest.ts --model-endpoint <url> --out enclave/$(MANIFEST)"; \
		exit 1; }
	@test -f models/smollm2-135m-instruct-q2_k.gguf || { \
		echo "missing models/smollm2-135m-instruct-q2_k.gguf."; \
		echo "from repo root: pnpm tsx scripts/fetch-oss-model.ts enclave/models/smollm2-135m-instruct-q2_k.gguf"; \
		exit 1; }
	docker build $(BUILD_ARGS) -t $(IMAGE) .

build-enclave: docker-build
	mkdir -p $(OUT_DIR)
	nitro-cli build-enclave --docker-uri $(IMAGE) --output-file $(EIF) | tee $(OUT_DIR)/build-output.txt
	$(MAKE) pcrs

docker-build-prebuilt:
	@test -f $(MANIFEST) || { \
		echo "missing $(MANIFEST)."; \
		echo "from repo root: pnpm tsx tools/gen-enclave-proxy-manifest.ts --network testnet --local-model --base-vsock-port 8103 --out enclave/$(MANIFEST)"; \
		exit 1; }
	@test -f models/smollm2-135m-instruct-q2_k.gguf || { \
		echo "missing models/smollm2-135m-instruct-q2_k.gguf."; \
		echo "from repo root: pnpm tsx scripts/fetch-oss-model.ts enclave/models/smollm2-135m-instruct-q2_k.gguf"; \
		exit 1; }
	@test -x prebuilt/sealedbench-enclave-server || { \
		echo "missing prebuilt/sealedbench-enclave-server."; \
		exit 1; }
	@test -x prebuilt/llama-b9701/llama-server || { \
		echo "missing prebuilt/llama-b9701/llama-server."; \
		exit 1; }
	docker build -f Dockerfile.prebuilt -t $(IMAGE) .

build-enclave-prebuilt: docker-build-prebuilt
	mkdir -p $(OUT_DIR)
	nitro-cli build-enclave --docker-uri $(IMAGE) --output-file $(EIF) | tee $(OUT_DIR)/build-output.txt
	$(MAKE) pcrs

pcrs:
	@PCR0=$$(grep -o '"PCR0": "[0-9a-f]*"' $(OUT_DIR)/build-output.txt | cut -d '"' -f4 | head -1); \
	PCR1=$$(grep -o '"PCR1": "[0-9a-f]*"' $(OUT_DIR)/build-output.txt | cut -d '"' -f4 | head -1); \
	PCR2=$$(grep -o '"PCR2": "[0-9a-f]*"' $(OUT_DIR)/build-output.txt | cut -d '"' -f4 | head -1); \
	test "$${#PCR0}" = "96"; \
	test "$${#PCR1}" = "96"; \
	test "$${#PCR2}" = "96"; \
	printf '{\n  "pcr0": "%s",\n  "pcr1": "%s",\n  "pcr2": "%s"\n}\n' "$$PCR0" "$$PCR1" "$$PCR2" > $(OUT_DIR)/pcr-values.json; \
	cat $(OUT_DIR)/pcr-values.json

# Production run: NO --debug-mode, so PCRs are real and match the EIF.
run-enclave:
	nitro-cli run-enclave \
		--eif-path $(EIF) \
		--memory $(MEMORY_MIB) \
		--cpu-count $(CPU_COUNT) \
		--enclave-name $(ENCLAVE_NAME) \
		--enclave-cid $(ENCLAVE_CID)

# Debug run ONLY for boot/log testing. Yields all-zero, unattestable PCRs.
# Never register a debug enclave.
run-enclave-debug:
	@echo "⚠️  --debug-mode: PCRs will be all-zero and unattestable. Testing only."
	nitro-cli run-enclave \
		--eif-path $(EIF) \
		--memory $(MEMORY_MIB) \
		--cpu-count $(CPU_COUNT) \
		--enclave-name $(ENCLAVE_NAME) \
		--enclave-cid $(ENCLAVE_CID) \
		--debug-mode

# Host-side proxy (run on the parent EC2 after run-enclave).
host-proxy:
	./setup-network-proxy.sh

stop-enclave:
	@ENCLAVE_ID=$$(nitro-cli describe-enclaves | jq -r --arg name "$(ENCLAVE_NAME)" '.[] | select(.EnclaveName == $$name) | .EnclaveID' | head -1); \
	if [ -z "$$ENCLAVE_ID" ]; then \
		echo "no running enclave named $(ENCLAVE_NAME)"; \
	else \
		nitro-cli terminate-enclave --enclave-id "$$ENCLAVE_ID"; \
	fi

logs:
	@ENCLAVE_ID=$$(nitro-cli describe-enclaves | jq -r --arg name "$(ENCLAVE_NAME)" '.[] | select(.EnclaveName == $$name) | .EnclaveID' | head -1); \
	test -n "$$ENCLAVE_ID"; \
	nitro-cli console --enclave-id "$$ENCLAVE_ID"

clean:
	rm -rf $(OUT_DIR)
	docker rmi $(IMAGE) || true

test:
	cargo test
