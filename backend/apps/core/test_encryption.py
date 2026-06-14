import base64
import os
import uuid

from django.test import SimpleTestCase, override_settings

from apps.core.security import encryption, key_provider

_V1 = base64.b64encode(os.urandom(32)).decode("ascii")
_V2 = base64.b64encode(os.urandom(32)).decode("ascii")


@override_settings(
    DUENEST_ACTIVE_KEK_VERSION="v1",
    DUENEST_KEKS={"v1": _V1, "v2": _V2},
)
class FileEncryptionTests(SimpleTestCase):
    def setUp(self):
        self.owner_id = 7
        self.file_uuid = uuid.uuid4()
        self.aad = encryption.build_file_aad(self.file_uuid, self.owner_id)
        self.plaintext = b"%PDF-1.4 sensitive passport scan bytes"

    def test_round_trip(self):
        payload = encryption.encrypt_bytes(self.plaintext, self.aad)
        self.assertNotEqual(payload.ciphertext, self.plaintext)
        self.assertEqual(len(payload.nonce), encryption.NONCE_LENGTH_BYTES)
        self.assertEqual(payload.kek_version, "v1")
        opened = encryption.decrypt_bytes(
            payload.ciphertext,
            nonce=payload.nonce,
            wrapped_dek=payload.wrapped_dek,
            kek_version=payload.kek_version,
            aad=self.aad,
        )
        self.assertEqual(opened, self.plaintext)

    def test_each_file_uses_a_unique_dek_and_nonce(self):
        a = encryption.encrypt_bytes(self.plaintext, self.aad)
        b = encryption.encrypt_bytes(self.plaintext, self.aad)
        self.assertNotEqual(a.nonce, b.nonce)
        self.assertNotEqual(a.wrapped_dek, b.wrapped_dek)
        self.assertNotEqual(a.ciphertext, b.ciphertext)

    def test_wrong_aad_fails_closed(self):
        payload = encryption.encrypt_bytes(self.plaintext, self.aad)
        other_aad = encryption.build_file_aad(self.file_uuid, self.owner_id + 1)
        with self.assertRaises(encryption.DecryptionError):
            encryption.decrypt_bytes(
                payload.ciphertext,
                nonce=payload.nonce,
                wrapped_dek=payload.wrapped_dek,
                kek_version=payload.kek_version,
                aad=other_aad,
            )

    def test_corrupted_ciphertext_fails_closed(self):
        payload = encryption.encrypt_bytes(self.plaintext, self.aad)
        tampered = bytearray(payload.ciphertext)
        tampered[0] ^= 0xFF
        with self.assertRaises(encryption.DecryptionError):
            encryption.decrypt_bytes(
                bytes(tampered),
                nonce=payload.nonce,
                wrapped_dek=payload.wrapped_dek,
                kek_version=payload.kek_version,
                aad=self.aad,
            )

    def test_unknown_kek_version_fails_closed(self):
        payload = encryption.encrypt_bytes(self.plaintext, self.aad)
        with self.assertRaises(key_provider.KeyConfigurationError):
            encryption.decrypt_bytes(
                payload.ciphertext,
                nonce=payload.nonce,
                wrapped_dek=payload.wrapped_dek,
                kek_version="v9",
                aad=self.aad,
            )

    def test_dek_rewrap_under_new_version_keeps_content(self):
        payload = encryption.encrypt_bytes(self.plaintext, self.aad)
        dek = encryption.unwrap_dek(payload.wrapped_dek, payload.kek_version)
        rewrapped = encryption.wrap_dek(dek, "v2")
        # Same content opens with the rewrapped DEK under the new version.
        opened = encryption.decrypt_bytes(
            payload.ciphertext,
            nonce=payload.nonce,
            wrapped_dek=rewrapped,
            kek_version="v2",
            aad=self.aad,
        )
        self.assertEqual(opened, self.plaintext)

    def test_wrong_kek_cannot_unwrap(self):
        payload = encryption.encrypt_bytes(self.plaintext, self.aad)
        with self.assertRaises(encryption.DecryptionError):
            # v2 is a valid version but the wrong key for this wrapped DEK.
            encryption.unwrap_dek(payload.wrapped_dek, "v2")


@override_settings(
    DUENEST_ACTIVE_KEK_VERSION="v1",
    DUENEST_KEKS={"v1": _V1, "v2": _V2},
)
class FieldEncryptionTests(SimpleTestCase):
    def test_field_round_trip(self):
        token = encryption.encrypt_field_value(
            "+44 7700 900000", model="emergencypack", field="contact_phone", record_id=42
        )
        self.assertNotIn(b"900000", token)
        out = encryption.decrypt_field_value(
            token, model="emergencypack", field="contact_phone", record_id=42
        )
        self.assertEqual(out, "+44 7700 900000")

    def test_field_aad_binding(self):
        token = encryption.encrypt_field_value(
            "secret note", model="document", field="notes", record_id=1
        )
        with self.assertRaises(encryption.DecryptionError):
            encryption.decrypt_field_value(
                token, model="document", field="notes", record_id=2
            )

    def test_unicode_preserved(self):
        value = "Café — naïve façade ✓ 你好"
        token = encryption.encrypt_field_value(
            value, model="m", field="f", record_id="abc"
        )
        self.assertEqual(
            encryption.decrypt_field_value(token, model="m", field="f", record_id="abc"),
            value,
        )


class KeyProviderConfigTests(SimpleTestCase):
    @override_settings(DUENEST_ACTIVE_KEK_VERSION="", DUENEST_KEKS={})
    def test_missing_active_version_raises(self):
        with self.assertRaises(key_provider.KeyConfigurationError):
            key_provider.validate_configuration()

    @override_settings(
        DUENEST_ACTIVE_KEK_VERSION="v1",
        DUENEST_KEKS={"v1": base64.b64encode(b"tooshort").decode("ascii")},
    )
    def test_wrong_length_kek_raises(self):
        with self.assertRaises(key_provider.KeyConfigurationError):
            key_provider.get_kek("v1")
