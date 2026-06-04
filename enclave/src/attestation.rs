#[derive(Clone, Debug, PartialEq, Eq)]
pub struct NitroAttestationBinding {
    pub public_key: Vec<u8>,
    pub user_data: Option<Vec<u8>>,
    pub nonce: Option<Vec<u8>>,
}

pub fn build_nitro_attestation_binding(public_key: &[u8]) -> NitroAttestationBinding {
    NitroAttestationBinding {
        public_key: public_key.to_vec(),
        user_data: None,
        nonce: None,
    }
}

#[cfg(target_os = "linux")]
pub fn nitro_attestation_document(public_key: &[u8]) -> Result<Vec<u8>, String> {
    use aws_nitro_enclaves_nsm_api::{api::Request, driver};

    let binding = build_nitro_attestation_binding(public_key);
    let nsm_fd = driver::nsm_init();
    let response = driver::nsm_process_request(
        nsm_fd,
        Request::Attestation {
            user_data: binding.user_data.map(Into::into),
            nonce: binding.nonce.map(Into::into),
            public_key: Some(binding.public_key.into()),
        },
    );
    driver::nsm_exit(nsm_fd);

    match response {
        aws_nitro_enclaves_nsm_api::api::Response::Attestation { document } => Ok(document),
        other => Err(format!("unexpected NSM attestation response: {other:?}")),
    }
}

#[cfg(not(target_os = "linux"))]
pub fn nitro_attestation_document(_public_key: &[u8]) -> Result<Vec<u8>, String> {
    Err("Nitro NSM attestation is only available inside a Linux Nitro enclave".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn binds_enclave_key_to_nitro_public_key_field() {
        let binding = build_nitro_attestation_binding(&[1, 2, 3]);

        assert_eq!(binding.public_key, vec![1, 2, 3]);
        assert_eq!(binding.user_data, None);
        assert_eq!(binding.nonce, None);
    }

    #[cfg(not(target_os = "linux"))]
    #[test]
    fn reports_attestation_unavailable_outside_linux_nitro() {
        let error = nitro_attestation_document(&[1, 2, 3]).unwrap_err();

        assert!(error.contains("Nitro NSM attestation is only available"));
    }
}
