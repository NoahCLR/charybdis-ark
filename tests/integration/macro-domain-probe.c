// Compile against the selected firmware's real incremental macro validator.
#include <assert.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include "users/noah/lib/profile/schema/profile_macros_v1.h"
int main(int argc, char **argv) {
    assert(argc >= 3);
    if (strcmp(argv[1], "generate") == 0) {
        FILE *out = fopen(argv[2], "wb"); assert(out);
        // Protected UTF-8 text, balanced keys, a delay, then empty slots.
        const unsigned char first[] = {1, 5, 1, 'c', 'a', 'f', 0xc3, 0xa9, 0};
        const unsigned char last[] = {1, 2, 4, 1, 3, 4, 1, 4, '1', '2', '|', 0};
        assert(fwrite(first, 1, sizeof(first), out) == sizeof(first));
        for (unsigned i = 1; i < 127; i++) assert(fputc(0, out) == 0);
        assert(fwrite(last, 1, sizeof(last), out) == sizeof(last));
        assert(fclose(out) == 0); return 0;
    }
    assert(argc == 5);
    FILE *in = fopen(argv[1], "rb"); assert(in);
    unsigned long offset = strtoul(argv[2], NULL, 0), length = strtoul(argv[3], NULL, 0);
    assert(fseek(in, (long)offset, SEEK_SET) == 0);
    FILE *out = fopen(argv[4], "wb"); assert(out);
    bool valid = noah_profile_macros_v1_length_valid((uint32_t)length, 128);
    noah_profile_macros_v1_validation_t state = {0};
    for (unsigned long i = 0; i < length; i++) {
        int byte = fgetc(in); assert(byte != EOF); assert(fputc(byte, out) == byte);
        if (valid) {valid = noah_profile_macros_v1_consume(&state, (uint8_t)byte, 128); state.offset++;}
    }
    valid = valid && noah_profile_macros_v1_complete(&state, 128);
    assert(fclose(in) == 0); assert(fclose(out) == 0);
    puts(valid ? "valid" : "invalid"); return 0;
}
