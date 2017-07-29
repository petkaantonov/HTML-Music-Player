#define WASM_NO_TIME 1
#define WASM_NO_FS 1

#include <wasm.c>
#include "resampler.c"
#include "channel_mixer.c"
#include "mp3_decoder.c"
#include "effects.c"
#include "fingerprinter.c"
#include "loudness_analyzer.c"

extern void initialize(int, int, int);
static uintptr_t heapStart;
static int errNo;

int main() {
    // Sanity checks
    uint8_t bytes[10];
    for (int i = 0; i < 10; ++i) {
        bytes[i] = i;
    }

    if (*((uint32_t*)(&bytes[4])) != 117835012) {
        printf("buggy wasm compiler");
        abort();
    }

    int dummy;
    heapStart = (uintptr_t)(&dummy) + (uintptr_t)(4);
    initialize(heapStart, DEBUG, STACK_SIZE);
}

EXPORT int* __errno_location() {
    return &errNo;
}

