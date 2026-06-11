module sealedbench::attestation {
    use enclave::enclave;
    use std::string::String;

    public struct SEALEDBENCH has drop {}

    fun init(ctx: &mut TxContext) {
        let cap = enclave::new_cap(SEALEDBENCH {}, ctx);
        transfer::public_transfer(cap, tx_context::sender(ctx));
    }

    public fun create_enclave_config(
        cap: &enclave::Cap<SEALEDBENCH>,
        name: String,
        pcr0: vector<u8>,
        pcr1: vector<u8>,
        pcr2: vector<u8>,
        ctx: &mut TxContext,
    ) {
        enclave::create_enclave_config<SEALEDBENCH>(cap, name, pcr0, pcr1, pcr2, ctx);
    }

    #[test_only]
    public fun new_cap_for_testing(ctx: &mut TxContext): enclave::Cap<SEALEDBENCH> {
        enclave::new_cap(SEALEDBENCH {}, ctx)
    }
}
