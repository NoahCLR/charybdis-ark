#include <assert.h>
#include <stdint.h>
#include <stdio.h>
#include "users/noah/lib/profile/schema/profile_rgb_v1.h"

int main(int argc, char **argv) {
    assert(argc == 2);
    FILE *file = fopen(argv[1], "rb");
    assert(file != NULL);
    // Four single-byte limits, then the PD slot mask, 32 bits little-endian.
    uint8_t config[8];
    assert(fread(config, 1, sizeof(config), file) == sizeof(config));
    noah_profile_rgb_v1_limits_t limits = noah_profile_rgb_v1_default_limits();
    limits.compiled_stage_mask = config[0];
    limits.logical_layer_count = config[1];
    limits.maximum_brightness = config[2];
    limits.tap_branch_color_count = config[3];
    limits.supported_pd_mode_mask = (uint32_t)config[4] | (uint32_t)config[5] << 8 | (uint32_t)config[6] << 16 | (uint32_t)config[7] << 24;
    unsigned count = 0;
    int expected;
    while ((expected = fgetc(file)) != EOF) {
        uint8_t size[2], bytes[4096];
        assert(fread(size, 1, 2, file) == 2);
        size_t length = (size_t)size[0] | ((size_t)size[1] << 8);
        assert(length <= sizeof(bytes));
        assert(fread(bytes, 1, length, file) == length);
        noah_profile_rgb_v1_view_t view;
        noah_profile_rgb_v1_error_t error;
        int accepted = noah_profile_rgb_v1_decode(bytes, length, &limits, &view, &error) == NOAH_PROFILE_RGB_V1_OK;
        if (accepted != expected) {
            fprintf(stderr, "RGB corpus case %u: Ark=%d C=%d\n", count, expected, accepted);
            return 1;
        }
        count++;
    }
    assert(!ferror(file));
    fclose(file);
    printf("RGB C/Ark parity passed: %u cases\n", count);
    return 0;
}
