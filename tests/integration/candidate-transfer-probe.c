// Test transport around the selected firmware's production candidate transaction,
// dual-slot store and whole-profile validator. No keyboard or HID is opened.
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "users/noah/lib/profile/storage/profile_candidate_store_backend.h"
#include "users/noah/lib/profile/storage/profile_checksum.h"

static uint8_t memory[NOAH_PROFILE_STORAGE_LOGICAL_EEPROM_SIZE];
static uint8_t source[NOAH_PROFILE_CANDIDATE_V1_MAX_BLOB_SIZE];
static noah_profile_store_t store;
static noah_profile_candidate_store_backend_t backend;
static noah_effective_profile_provider_t provider;
static noah_profile_candidate_transaction_t transaction;
static bool read_memory(void *context, noah_profile_storage_address_t offset, uint8_t *bytes, uint16_t length) {
    (void)context;
    if ((size_t)offset + length > sizeof(memory)) return false;
    memcpy(bytes, memory + offset, length); return true;
}
static bool write_memory(void *context, noah_profile_storage_address_t offset, const uint8_t *bytes, uint16_t length) {
    (void)context;
    if ((size_t)offset + length > sizeof(memory)) return false;
    memcpy(memory + offset, bytes, length); return true;
}
static uint32_t safe(void *context) {(void)context; return 0;}
int main(int argc, char **argv) {
    assert(argc == 4);
    FILE *file = fopen(argv[1], "rb"); assert(file);
    size_t length = fread(source, 1, sizeof(source), file); fclose(file);
    uint32_t abi = (uint32_t)strtoul(argv[3], NULL, 0);
    uint32_t crc = noah_profile_crc32_finish(noah_profile_crc32_update(NOAH_PROFILE_CRC32_INITIAL, source, length));
    uint32_t digest = noah_profile_fnv1a_update(NOAH_PROFILE_FNV1A_INITIAL, source, length);
    uint8_t domains = 0;
    for (size_t offset = 8; offset < length;) {
        domains |= (uint8_t)(1u << ((source[offset] >> 4u) - 1u));
        offset += 4u + source[offset + 2] + ((size_t)source[offset + 3] << 8u);
    }
    noah_profile_validator_v1_compatibility_t compatibility = noah_profile_validator_v1_default_compatibility(abi);
    compatibility.allowed_domain_mask = NOAH_PROFILE_CANDIDATE_V1_KNOWN_DOMAINS;
    compatibility.required_domain_mask = 0;
    noah_profile_validator_v1_declaration_t declaration = {.schema_major = 3, .schema_minor = 0, .domain_mask = domains, .byte_length = (uint16_t)length, .crc32 = crc, .digest = digest, .action_abi_digest = abi};
    noah_profile_reader_t reader = noah_profile_reader_from_memory(source, length);
    noah_profile_validator_v1_t validator;
    noah_profile_validator_v1_error_t error;
    noah_profile_validator_v1_result_t result = noah_profile_validator_v1_begin(&validator, &reader, 0, &declaration, &compatibility, &error);
    while (result == NOAH_PROFILE_VALIDATOR_V1_IN_PROGRESS) result = noah_profile_validator_v1_step(&validator, 20, &error);
    if (result != NOAH_PROFILE_VALIDATOR_V1_VALID) {fprintf(stderr, "source invalid: %u at %zu\n", result, error.byte_offset); return 1;}
    noah_profile_validator_v1_profile_t profile;
    assert(noah_profile_validator_v1_profile(&validator, &profile, &error) == NOAH_PROFILE_VALIDATOR_V1_VALID);
    noah_effective_profile_snapshot_t snapshot;
    assert(noah_effective_profile_snapshot_make_compiled(&profile, &reader, 0, &snapshot) == NOAH_EFFECTIVE_PROFILE_OK);
    assert(noah_effective_profile_provider_init(&provider, &snapshot, safe, NULL, NULL, 0) == NOAH_EFFECTIVE_PROFILE_OK);
    memset(memory, 0xff, sizeof(memory));
    noah_profile_store_init(&store, (noah_profile_store_io_t){.read = read_memory, .write = write_memory},
        (noah_profile_store_compatibility_t){.schema_major = 3, .schema_minor = 0, .compiled_default_digest = digest, .action_abi_digest = abi});
    noah_profile_store_record_t selected;
    assert(noah_profile_store_boot_select(&store, &selected) == NOAH_PROFILE_STORE_NO_COMMITTED_PROFILE);
    noah_profile_candidate_store_backend_init(&backend, &store, &provider, &compatibility, digest, 0);
    noah_profile_candidate_backend_t callbacks = noah_profile_candidate_store_backend_interface(&backend);
    noah_profile_candidate_compatibility_t candidate_compat = {.schema_major = 3, .schema_minor = 0, .supported_domain_mask = domains, .max_payload_length = NOAH_PROFILE_CANDIDATE_V1_MAX_BLOB_SIZE, .action_abi_digest = abi};
    noah_profile_candidate_transaction_init(&transaction, &callbacks, &candidate_compat);
    puts("ready"); fflush(stdout);
    char line[128];
    while (fgets(line, sizeof(line), stdin)) {
        unsigned ticks;
        if (sscanf(line, "corrupt %u", &ticks) == 1) {
            assert(ticks < length); source[ticks] ^= 1u;
            puts("ok"); fflush(stdout); continue;
        }
        if (sscanf(line, "tick %u", &ticks) == 1) {
            assert(ticks <= 1000);
            for (unsigned n = 0; n < ticks; n++) (void)noah_profile_candidate_transaction_scan(&transaction);
            puts("ok"); fflush(stdout); continue;
        }
        uint8_t frame[32]; assert(strlen(line) == 65);
        for (size_t n = 0; n < sizeof(frame); n++) {unsigned value; assert(sscanf(line + n * 2, "%2x", &value) == 1); frame[n] = (uint8_t)value;}
        (void)noah_profile_candidate_transaction_scan(&transaction);
        if (frame[0] == 0x08) {
            noah_profile_candidate_v1_status_t status; noah_profile_candidate_transaction_status(&transaction, &status);
            assert(noah_profile_candidate_v1_handle_status_get(&status, frame, sizeof(frame)));
        } else assert(noah_profile_candidate_transaction_receive(&transaction, frame, sizeof(frame)));
        for (size_t n = 0; n < sizeof(frame); n++) printf("%02x", frame[n]);
        putchar('\n'); fflush(stdout);
    }
    assert(transaction.status.state == NOAH_PROFILE_CANDIDATE_V1_STATE_VALIDATED);
    uint8_t bytes[20]; file = fopen(argv[2], "wb"); assert(file);
    for (uint16_t offset = 0; offset < transaction.metadata.payload_length;) {
        uint8_t size = transaction.metadata.payload_length - offset > 20 ? 20 : (uint8_t)(transaction.metadata.payload_length - offset);
        assert(callbacks.read(callbacks.context, offset, bytes, size) == NOAH_PROFILE_CANDIDATE_BACKEND_OK);
        assert(fwrite(bytes, 1, size, file) == size); offset += size;
    }
    fclose(file); return 0;
}
