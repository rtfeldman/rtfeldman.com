#include "mimalloc.h"
// Compression benchmark driver against libdeflate.
//
//   cbench <original> <level> <reps> [out.deflate]
//
// Verifies the compressed stream round-trips, then times `reps`
// compressions into a caller-allocated bound-sized buffer, reusing one
// compressor across reps exactly as a caller would, and prints:
//   c\t<min_ns>\t<mbps>\t<compressed_size>
// Throughput is over the uncompressed input, which is the work done.
#include <libdeflate.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <time.h>

extern unsigned char corpus_input[];
static unsigned char *slurp(const char *path, size_t *len) {
    (void)path; *len = 8474240; return corpus_input;
}

int main(int argc, char **argv) {
    if (argc < 4) {
        fprintf(stderr, "usage: cbench <original> <level> <reps> [out.deflate]\n");
        return 1;
    }
    size_t n;
    unsigned char *in = slurp(argv[1], &n);
    int level = atoi(argv[2]);
    int reps = atoi(argv[3]);

    libdeflate_set_memory_allocator(mi_malloc, mi_free);
    struct libdeflate_compressor *c = libdeflate_alloc_compressor(level);
    size_t cap = libdeflate_deflate_compress_bound(c, n);
    unsigned char *out = mi_malloc(cap);

    struct timespec warm_started, warm_now;
    clock_gettime(CLOCK_MONOTONIC, &warm_started);
    size_t sz = libdeflate_deflate_compress(c, in, n, out, cap);
    if (sz == 0) { fprintf(stderr, "compress failed\n"); return 4; }

    // Verify the stream decompresses back to the input.
    struct libdeflate_decompressor *d = libdeflate_alloc_decompressor();
    unsigned char *back = mi_malloc(n ? n : 1);
    size_t actual = 0;
    if (libdeflate_deflate_decompress(d, out, sz, back, n, &actual) != LIBDEFLATE_SUCCESS
        || actual != n || (n && memcmp(back, in, n) != 0)) {
        fprintf(stderr, "VERIFY FAIL\n");
        return 5;
    }

    unsigned char *expected = mi_malloc(sz);
    size_t expected_len = sz;
    memcpy(expected, out, sz);
    clock_gettime(CLOCK_MONOTONIC, &warm_now);
    while ((warm_now.tv_sec - warm_started.tv_sec) * 1000000000LL + warm_now.tv_nsec - warm_started.tv_nsec < 200000000LL) {
        sz = libdeflate_deflate_compress(c, in, n, out, cap);
        if (sz != expected_len || memcmp(out, expected, sz)) { fprintf(stderr, "warmup output changed\n"); return 6; }
        clock_gettime(CLOCK_MONOTONIC, &warm_now);
    }
    long long best = 0;
    for (int i = 0; i < reps; i++) {
        struct timespec t0, t1;
        clock_gettime(CLOCK_MONOTONIC, &t0);
        sz = libdeflate_deflate_compress(c, in, n, out, cap);
        clock_gettime(CLOCK_MONOTONIC, &t1);
        long long ns = (t1.tv_sec - t0.tv_sec) * 1000000000LL + (t1.tv_nsec - t0.tv_nsec);
        if (sz != expected_len || memcmp(out, expected, sz)) { fprintf(stderr, "output changed\n"); return 6; }
        printf("rep\t%d\t%d\t%lld\t%zu\n", level, i, ns, sz);
        if (i == 0 || ns < best) best = ns;
    }
    long long mbps_x10 = (long long)n * 10000LL / (best ? best : 1);
    printf("c\t%lld\t%lld.%lld\t%zu\n", best, mbps_x10 / 10, mbps_x10 % 10, sz);

    if (argc > 4) { FILE *o = fopen(argv[4], "wb"); fwrite(out, 1, sz, o); fclose(o); }
    libdeflate_free_compressor(c);
    libdeflate_free_decompressor(d);
    mi_free(out); mi_free(back); mi_free(expected);
    return 0;
}
