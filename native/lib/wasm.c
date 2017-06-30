#include "wasm.h"
#include "malloc.c"
#include <musl/math/libm.h>
/*#include <musl/math/__rem_pio2_large.c>
#include <musl/math/__rem_pio2.c>
#include <musl/math/__sin.c>
#include <musl/math/__cos.c>
#include <musl/math/__tan.c>
#include <musl/math/__expo2.c>
#include <musl/math/__fpclassify.c>

#include <musl/math/tan.c>
#include <musl/math/pow.c>
#include <musl/math/cos.c>
#include <musl/math/sin.c>
#include <musl/math/exp.c>
#include <musl/math/exp2.c>
#include <musl/math/scalbn.c>
#include <musl/math/log.c>*/
#include <musl/math/frexp.c>
#include <musl/math/modf.c>

int clz(uint32_t x)
{
    static const char debruijn32[32] = {
        0, 31, 9, 30, 3, 8, 13, 29, 2, 5, 7, 21, 12, 24, 28, 19,
        1, 10, 4, 14, 6, 22, 25, 20, 11, 15, 23, 26, 16, 27, 17, 18
    };
    x |= x>>1;
    x |= x>>2;
    x |= x>>4;
    x |= x>>8;
    x |= x>>16;
    x++;
    return debruijn32[x*0x076be629>>27];
}

size_t strlen(const char* str) {
    const char *s;
    for (s = str; *s; ++s);
    return (s - str);
}


#ifdef DEBUG


#define V(cname, op, msg)                                                                                    \
void __assert_## cname ##_fail(const char *expr1,                                                            \
                               const char *expr2,                                                            \
                               int32_t expr1_value,                                                          \
                               int32_t expr2_value,                                                          \
                               const char *file,                                                             \
                               unsigned int line,                                                            \
                               const char *function) {                                                       \
    fprintf(stderr, "Assertion fail: (%s = %d) " #msg " (%s = %d)\n    at %s (%s:%u)",                       \
                                                                          expr1,                             \
                                                                          expr1_value,                       \
                                                                          expr2,                             \
                                                                          expr2_value,                       \
                                                                          function,                          \
                                                                          file,                              \
                                                                          line);                             \
    abort();                                                                                                 \
}
  ASSERTION_TYPES(V)
#undef V

void __assert_fail (const char *__assertion, const char *__file,
               unsigned int __line, const char *__function) {
    fprintf(stderr, "Assertion fail: expression %s evaluates to false\n    at %s (%s:%u)",
                                                        __assertion,
                                                        __function,
                                                        __file,
                                                        __line);
    abort();
}

#endif //DEBUG

