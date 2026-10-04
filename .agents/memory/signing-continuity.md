---
name: Certificate signing continuity
description: Long-lived certificate validity when credentials or security configuration change
---

Keep the certificate signing identity stable across deployments. Do not rotate a shared signing/authentication secret as routine authentication cleanup without a certificate-key migration strategy.

**Why:** Certificate PDFs contain signed verification links and credentials are intended to remain verifiable for years. Replacing the signing identity makes existing authentic credentials appear tampered and their PDF links unusable.

**How to apply:** Before changing signing configuration, separate session security from certificate signing if necessary and introduce versioned signing keys that continue verifying existing credentials. Do not regenerate or overwrite historic certificate PDFs as a silent workaround.