#[test_only]
module sealedbench::sealed_eval_tests;

use sealedbench::sealed_eval::{Self, SealedEval};
use std::{string, vector};
use sui::{
    clock::{Self as clock, Clock},
    object::{Self, UID},
    test_scenario::{Self as ts},
};

const AUTHOR: address = @0xA11CE;

public struct DummyPolicy has key, store {
    id: UID,
}

#[test]
fun create_records_metadata_and_timestamp() {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, AUTHOR);
        let mut c = ts::take_shared<Clock>(&scenario);
        clock::set_for_testing(&mut c, 1_234);
        let policy = DummyPolicy { id: object::new(ts::ctx(&mut scenario)) };
        sealed_eval::create(
            digest(1),
            digest(2),
            string::utf8(b"walrus-blob-id"),
            object::id(&policy),
            string::utf8(b"open-model/checkpoint"),
            50,
            2_000,
            &c,
            ts::ctx(&mut scenario),
        );
        destroy_policy(policy);
        ts::return_shared(c);
    };

    {
        ts::next_tx(&mut scenario, AUTHOR);
        let eval = ts::take_shared<SealedEval>(&scenario);
        assert!(sealed_eval::author(&eval) == AUTHOR, 0);
        assert!(sealed_eval::sealed_at_ms(&eval) == 1_234, 1);
        assert!(sealed_eval::cutoff_ts_ms(&eval) == 2_000, 2);
        assert!(sealed_eval::set_size(&eval) == 50, 3);
        assert!(!sealed_eval::revealed(&eval), 4);
        assert!(vector::length(sealed_eval::sha256_plaintext(&eval)) == 32, 5);
        assert!(vector::length(sealed_eval::sha256_ciphertext(&eval)) == 32, 6);
        ts::return_shared(eval);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 1, location = sealedbench::sealed_eval)]
fun rejects_short_plaintext_hash() {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, AUTHOR);
        let c = ts::take_shared<Clock>(&scenario);
        let policy = DummyPolicy { id: object::new(ts::ctx(&mut scenario)) };
        sealed_eval::create(
            b"short",
            digest(2),
            string::utf8(b"walrus-blob-id"),
            object::id(&policy),
            string::utf8(b"open-model/checkpoint"),
            50,
            2_000,
            &c,
            ts::ctx(&mut scenario),
        );
        destroy_policy(policy);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
#[expected_failure(abort_code = 2, location = sealedbench::sealed_eval)]
fun rejects_short_ciphertext_hash() {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, AUTHOR);
        let c = ts::take_shared<Clock>(&scenario);
        let policy = DummyPolicy { id: object::new(ts::ctx(&mut scenario)) };
        sealed_eval::create(
            digest(1),
            b"short",
            string::utf8(b"walrus-blob-id"),
            object::id(&policy),
            string::utf8(b"open-model/checkpoint"),
            50,
            2_000,
            &c,
            ts::ctx(&mut scenario),
        );
        destroy_policy(policy);
        ts::return_shared(c);
    };

    finish(scenario);
}

#[test]
fun reveal_records_plaintext_blob_id_once() {
    let mut scenario = setup_with_eval();

    {
        ts::next_tx(&mut scenario, AUTHOR);
        let mut eval = ts::take_shared<SealedEval>(&scenario);
        sealed_eval::reveal(&mut eval, string::utf8(b"plaintext-blob-id"));
        assert!(sealed_eval::revealed(&eval), 0);
        ts::return_shared(eval);
    };

    finish(scenario);
}

fun setup(): ts::Scenario {
    let mut scenario = ts::begin(AUTHOR);

    {
        ts::next_tx(&mut scenario, AUTHOR);
        clock::share_for_testing(clock::create_for_testing(ts::ctx(&mut scenario)));
    };

    scenario
}

fun setup_with_eval(): ts::Scenario {
    let mut scenario = setup();

    {
        ts::next_tx(&mut scenario, AUTHOR);
        let c = ts::take_shared<Clock>(&scenario);
        let policy = DummyPolicy { id: object::new(ts::ctx(&mut scenario)) };
        sealed_eval::create(
            digest(1),
            digest(2),
            string::utf8(b"walrus-blob-id"),
            object::id(&policy),
            string::utf8(b"open-model/checkpoint"),
            50,
            2_000,
            &c,
            ts::ctx(&mut scenario),
        );
        destroy_policy(policy);
        ts::return_shared(c);
    };

    scenario
}

fun digest(byte: u8): vector<u8> {
    vector[
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
    ]
}

fun destroy_policy(policy: DummyPolicy) {
    let DummyPolicy { id } = policy;
    object::delete(id);
}

fun finish(scenario: ts::Scenario) {
    ts::end(scenario);
}
