// Compile against the selected firmware's real autocorrect list validator and
// the lookups its engine reads the list with.
//
//   probe FILE OFFSET LENGTH
//
// validates the LENGTH bytes at OFFSET of FILE as domain 0x80 and prints
// "valid", or "invalid CODE TABLE ROW" in the validator's numbers (TABLE 255
// and ROW 65535 for none). For a valid list it then prints every typo as the
// runtime reads it, a line each in row order: the typo's bytes in hex, its
// match, and its correction's bytes in hex; then the part-of-word typos'
// rows, as the part index lists them.
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include "users/noah/lib/profile/schema/profile_autocorrect_v1.h"

static void hex(const uint8_t *bytes, uint8_t length) {
    for (uint8_t i = 0; i < length; i++) printf("%02x", bytes[i]);
}

int main(int argc, char **argv) {
    assert(argc == 4);
    unsigned long offset = strtoul(argv[2], NULL, 0), length = strtoul(argv[3], NULL, 0);
    FILE *in = fopen(argv[1], "rb");
    assert(in);
    uint8_t *bytes = malloc(offset + length + 1u);
    assert(bytes);
    assert(fread(bytes, 1, offset + length, in) == offset + length);
    assert(fclose(in) == 0);
    noah_profile_reader_t reader = noah_profile_reader_from_memory(bytes, offset + length);

    noah_profile_autocorrect_v1_validation_t      state = {0};
    noah_profile_autocorrect_v1_error_t           error = {0};
    noah_profile_autocorrect_v1_validation_step_t step;
    // Never more steps than a list at every ceiling takes, whatever the bytes say.
    unsigned long steps = 0, most = 8ul * (NOAH_PROFILE_AUTOCORRECT_V1_MAX_CORRECTIONS + NOAH_PROFILE_AUTOCORRECT_V1_MAX_TYPOS) + 16ul;
    do {
        step = noah_profile_autocorrect_v1_validation_step(&state, &reader, offset, length, &error);
        assert(++steps <= most);
    } while (step == NOAH_PROFILE_AUTOCORRECT_V1_VALIDATING);
    if (step == NOAH_PROFILE_AUTOCORRECT_V1_REJECTED) {
        printf("invalid %u %u %u\n", (unsigned)error.code, (unsigned)error.table, (unsigned)error.row);
        free(bytes);
        return 0;
    }
    puts("valid");
    noah_profile_autocorrect_v1_list_t list;
    assert(noah_profile_autocorrect_v1_open(&list, &reader, offset, length));
    for (uint16_t row = 0; row < list.typos; row++) {
        noah_profile_autocorrect_v1_typo_t typo, found;
        uint8_t text[NOAH_PROFILE_AUTOCORRECT_V1_TEXT_MAX], correction[NOAH_PROFILE_AUTOCORRECT_V1_TEXT_MAX], correction_length;
        assert(noah_profile_autocorrect_v1_typo_at(&list, row, &typo, text));
        assert(noah_profile_autocorrect_v1_correction(&list, typo.correction, correction, &correction_length));
        // The binary search the engine uses finds every typo by its bytes.
        assert(noah_profile_autocorrect_v1_find(&list, text, typo.length, &found) && found.index == row);
        hex(text, typo.length);
        printf(" %u ", (unsigned)typo.match);
        hex(correction, correction_length);
        putchar('\n');
    }
    printf("parts");
    for (uint16_t position = 0; position < list.part_typos; position++) {
        noah_profile_autocorrect_v1_typo_t typo;
        assert(noah_profile_autocorrect_v1_part_at(&list, position, &typo, NULL));
        printf(" %u", (unsigned)typo.index);
    }
    putchar('\n');
    free(bytes);
    return 0;
}
