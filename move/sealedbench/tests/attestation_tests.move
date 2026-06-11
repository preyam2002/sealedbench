#[test_only]
module sealedbench::attestation_tests;

use sealedbench::attestation;
use std::string;
use sui::{test_scenario as ts, transfer};

#[test]
fun creates_enclave_config_with_sealedbench_cap() {
    let mut scenario = ts::begin(@0xA11CE);

    let cap = attestation::new_cap_for_testing(ts::ctx(&mut scenario));
    attestation::create_enclave_config(
        &cap,
        string::utf8(b"SealedBench scorer"),
        pcr(0),
        pcr(1),
        pcr(2),
        ts::ctx(&mut scenario),
    );
    transfer::public_transfer(cap, @0xA11CE);

    ts::end(scenario);
}

fun pcr(byte: u8): vector<u8> {
    vector[
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
    ]
}
