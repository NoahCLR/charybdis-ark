// Ark's live-edit reports against the selected firmware's production Profile
// Wire edit channel and working copy (D-F32). The owner between them is this
// probe's: one half, whose Save, mode and other-half facts are fields the
// corpus sets, so every reply layout and flag reaches Ark's decoders. No
// keyboard or HID is opened.
#include QMK_KEYBOARD_H
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "users/noah/lib/compat/qmk_profile_edit_channel.h"
#include "users/noah/lib/compat/qmk_portable_profile.h"
#include "users/noah/lib/key/behavior/participation.h"
#include "users/noah/lib/profile/runtime/profile_working_copy.h"
#include "users/noah/lib/profile/storage/profile_checksum.h"
#include "users/noah/lib/profile/storage/profile_store_runtime.h"

static uint8_t                                   saved[NOAH_PROFILE_BLOB_V1_MAX_SIZE];
static uint8_t                                   working[NOAH_PROFILE_BLOB_V1_MAX_SIZE];
static noah_profile_validator_v1_compatibility_t rules;
static noah_effective_profile_provider_t         provider;
static noah_effective_profile_snapshot_t         snapshot;
static noah_profile_working_copy_t               copy;
// What the owner adds to the working copy's own status.
static noah_profile_owner_working_status_t owner;
static uint32_t                            values[8];
static struct {
    uint16_t transaction;
    uint32_t session, revision;
} saving;

// Restart (SET 0x28): whether the other half acknowledged it, reply byte 17.
static bool restart_peer_acknowledges;
bool noah_qmk_keyboard_restart_request(void) {
    return restart_peer_acknowledges;
}

// Held keys, as the owner's safe-boundary check reports them.
static uint32_t safe(void *context) {
    (void)context;
    return owner.safe_boundary_reason_mask;
}

noah_profile_working_result_t noah_profile_store_runtime_edit_begin(uint16_t transaction_id, uint32_t session, uint32_t revision, uint8_t splice_count, uint32_t insert_total, uint8_t flags) {
    return noah_profile_working_copy_begin(&copy, transaction_id, session, revision, splice_count, insert_total, flags, false);
}
noah_profile_working_result_t noah_profile_store_runtime_edit_splice(uint16_t transaction_id, uint8_t index, const noah_profile_working_splice_t *splice) {
    return noah_profile_working_copy_splice(&copy, transaction_id, index, splice);
}
noah_profile_working_result_t noah_profile_store_runtime_edit_data(uint16_t transaction_id, uint32_t offset, const uint8_t *bytes, uint32_t count) {
    return noah_profile_working_copy_data(&copy, transaction_id, offset, bytes, count);
}
noah_profile_working_result_t noah_profile_store_runtime_edit_commit(uint16_t transaction_id, uint32_t crc32) {
    return noah_profile_working_copy_commit(&copy, transaction_id, crc32);
}
noah_profile_working_result_t noah_profile_store_runtime_edit_abort(uint16_t transaction_id) {
    return noah_profile_working_copy_abort(&copy, transaction_id);
}
noah_profile_working_result_t noah_profile_store_runtime_revert(uint16_t transaction_id, uint32_t session, uint32_t revision) {
    return noah_profile_working_copy_revert(&copy, transaction_id, session, revision);
}
// Save is the owner's (a candidate through the store): the probe records the
// identity Ark named and answers as the owner would before any flash work.
noah_profile_working_result_t noah_profile_store_runtime_save(uint16_t transaction_id, uint32_t session, uint32_t revision) {
    if (session != copy.session || revision != copy.revision) return NOAH_PROFILE_WORKING_STALE;
    if (owner.peer_refused) return NOAH_PROFILE_WORKING_BUSY;
    saving.transaction = transaction_id;
    saving.session     = session;
    saving.revision    = revision;
    return copy.active ? NOAH_PROFILE_WORKING_QUEUED : NOAH_PROFILE_WORKING_OK;
}
noah_profile_working_result_t noah_profile_store_runtime_set_edit_mode(uint8_t mode) {
    if (mode >= NOAH_PROFILE_EDIT_MODE_COUNT) return NOAH_PROFILE_WORKING_INVALID_ARGUMENT;
    if (copy.active) return NOAH_PROFILE_WORKING_NOT_CLEAN;
    owner.mode.mode = mode;
    owner.mode.counter++;
    return NOAH_PROFILE_WORKING_OK;
}
bool noah_profile_store_runtime_working_status(noah_profile_owner_working_status_t *status) {
    *status = owner;
    return noah_profile_working_copy_status(&copy, &status->local);
}
bool noah_profile_store_runtime_read_working(uint32_t offset, uint8_t *target, uint32_t length) {
    return noah_profile_working_copy_read(&copy, offset, target, length);
}
uint32_t noah_setting(uint8_t id, uint32_t fallback) {
    (void)fallback;
    return id == NOAH_SETTING_COMBOS_ENABLED ? values[0] : id == NOAH_SETTING_BEHAVIORS_ENABLED ? values[2] : 0u;
}
bool noah_participation_behaviors_override(void) {
    return values[3] != 0u;
}
bool is_combo_enabled(void) {
    return values[1] != 0u;
}
uint32_t noah_qmk_portable_live_setting(uint8_t id) {
    return id == NOAH_SETTING_DEFAULT_DPI ? values[4] : id == NOAH_SETTING_RGB_COLOR ? values[5] : id == NOAH_SETTING_DEFAULT_LAYERS ? values[6] : id == NOAH_SETTING_KEYMAP_OPTIONS ? values[7] : 0u;
}

// `set NAME VALUE`: the owner's fields a status read reports.
static bool set(const char *name, unsigned long value) {
#define FIELD(text, target) \
    if (strcmp(name, text) == 0) { \
        target = value; \
        return true; \
    }
    FIELD("peer_required", owner.peer_required)
    FIELD("halves_agree", owner.halves_agree) /* edit status flag 2 */
    FIELD("restart_peer_acknowledges", restart_peer_acknowledges)
    FIELD("peer_known", owner.peer.known)
    FIELD("edits_blocked", owner.edits_blocked)
    FIELD("saved_compiled", owner.saved_compiled)
    FIELD("save_phase", owner.save.phase)
    FIELD("save_transaction", owner.save.transaction_id)
    FIELD("save_last_transaction", owner.save.last_transaction_id)
    FIELD("save_last_result", owner.save.last_result)
    FIELD("save_last_error", owner.save.last_error)
    FIELD("mode_conflict", owner.mode_conflict)
    FIELD("safe_reasons", owner.safe_boundary_reason_mask)
    FIELD("storage_paused", owner.storage_paused)
    FIELD("peer_storage_paused", owner.peer_storage_paused)
    FIELD("peer_refused", owner.peer_refused)
    FIELD("mode_store_failed", owner.mode_store_failed)
    FIELD("adjustment_pending", owner.adjustment_pending)
    FIELD("saved_generation", owner.saved_generation)
    FIELD("saved_origin", owner.saved_origin)
    FIELD("peer_phase", owner.peer.phase)
    FIELD("peer_last_result", owner.peer.last_result)
    FIELD("peer_transaction", owner.peer.transaction_id)
    FIELD("peer_session", owner.peer.session)
    FIELD("peer_revision", owner.peer.revision)
    FIELD("peer_flags", owner.peer.flags)
    FIELD("peer_mode", owner.peer.mode)
    FIELD("peer_mode_counter", owner.peer.mode_counter)
    FIELD("combos_master", values[0])
    FIELD("combos_override", values[1])
    FIELD("behaviours_master", values[2])
    FIELD("behaviours_override", values[3])
    FIELD("default_dpi", values[4])
    FIELD("rgb_color", values[5])
    FIELD("default_layers", values[6])
    FIELD("keymap_options", values[7])
#undef FIELD
    return false;
}

int main(int argc, char **argv) {
    assert(argc == 4);
    FILE *file = fopen(argv[1], "rb");
    assert(file);
    size_t length = fread(saved, 1, sizeof(saved), file);
    fclose(file);
    uint32_t abi = (uint32_t)strtoul(argv[2], NULL, 0);
    rules = noah_profile_validator_v1_default_compatibility(abi);
    rules.placement_positions = (uint16_t)strtoul(argv[3], NULL, 0);
    uint8_t domains = 0;
    // Schema 4 domain envelopes: id, version, a 32-bit payload length.
    for (size_t offset = 8; offset < length;) {
        domains |= (uint8_t)(1u << ((saved[offset] >> 4u) - 1u));
        offset += 6u + saved[offset + 2] + ((size_t)saved[offset + 3] << 8u) + ((size_t)saved[offset + 4] << 16u) + ((size_t)saved[offset + 5] << 24u);
    }
    noah_profile_validator_v1_declaration_t declaration = {.schema_major = NOAH_PROFILE_BLOB_V1_SCHEMA_MAJOR, .schema_minor = NOAH_PROFILE_BLOB_V1_SCHEMA_MINOR, .domain_mask = domains, .byte_length = (uint32_t)length,
        .crc32 = noah_profile_crc32_finish(noah_profile_crc32_update(NOAH_PROFILE_CRC32_INITIAL, saved, length)), .digest = noah_profile_fnv1a_update(NOAH_PROFILE_FNV1A_INITIAL, saved, length), .action_abi_digest = abi};
    noah_profile_reader_t                  reader = noah_profile_reader_from_memory(saved, length);
    noah_profile_validator_v1_t            validator;
    noah_profile_validator_v1_profile_t    profile;
    noah_profile_validator_v1_error_t      error;
    noah_profile_validator_v1_result_t     result = noah_profile_validator_v1_begin(&validator, &reader, 0, &declaration, &rules, &error);
    while (result == NOAH_PROFILE_VALIDATOR_V1_IN_PROGRESS) result = noah_profile_validator_v1_step(&validator, NOAH_PROFILE_VALIDATOR_V1_STEP_READ_MAX, &error);
    if (result != NOAH_PROFILE_VALIDATOR_V1_VALID) {
        fprintf(stderr, "saved profile invalid: %u at %zu\n", result, (size_t)error.byte_offset);
        return 1;
    }
    assert(noah_profile_validator_v1_profile(&validator, &profile, &error) == NOAH_PROFILE_VALIDATOR_V1_VALID);
    assert(noah_effective_profile_snapshot_make_compiled(&profile, &reader, 0, &snapshot) == NOAH_EFFECTIVE_PROFILE_OK);
    assert(noah_effective_profile_provider_init(&provider, &snapshot, safe, NULL, NULL, 0) == NOAH_EFFECTIVE_PROFILE_OK);
    noah_profile_working_copy_init(&copy, working, sizeof(working), &provider, &rules, &rules, 0x5E550001u);
    owner.supported      = true;
    owner.saved_compiled = true;
    owner.saved_origin   = 0xFFu;
    owner.mode.mode      = NOAH_PROFILE_EDIT_MODE_DEFAULT;
    puts("ready");
    fflush(stdout);
    char line[160];
    while (fgets(line, sizeof(line), stdin)) {
        char          name[48];
        unsigned long value;
        if (strcmp(line, "scan\n") == 0) {
            // Scan opportunities until the working copy rests: simulated, no
            // prediction of device timing.
            for (unsigned scan = 0; scan < 100000u && noah_profile_working_copy_busy(&copy); scan++) (void)noah_profile_working_copy_scan(&copy);
            puts(noah_profile_working_copy_busy(&copy) ? "busy" : "ok");
        } else if (strcmp(line, "read\n") == 0) {
            noah_profile_working_status_t status;
            static uint8_t                active[NOAH_PROFILE_BLOB_V1_MAX_SIZE];
            assert(noah_profile_working_copy_status(&copy, &status) && noah_profile_working_copy_read(&copy, 0, active, status.length));
            for (uint32_t n = 0; n < status.length; n++) printf("%02x", active[n]);
            puts("");
        } else if (strcmp(line, "saved\n") == 0) {
            printf("%04x %08lx %08lx\n", saving.transaction, (unsigned long)saving.session, (unsigned long)saving.revision);
        } else if (sscanf(line, "set %47s %lu", name, &value) == 2) {
            puts(set(name, value) ? "ok" : "unknown");
        } else {
            uint8_t frame[32];
            assert(strlen(line) == 65);
            for (size_t n = 0; n < sizeof(frame); n++) {
                unsigned byte;
                assert(sscanf(line + n * 2, "%2x", &byte) == 1);
                frame[n] = (uint8_t)byte;
            }
            if (!noah_qmk_profile_edit_channel(frame, sizeof(frame))) {
                puts("unhandled");
            } else {
                for (size_t n = 0; n < sizeof(frame); n++) printf("%02x", frame[n]);
                puts("");
            }
        }
        fflush(stdout);
    }
    return 0;
}
