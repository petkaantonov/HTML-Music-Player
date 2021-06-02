#include "wasm.h"
#include "malloc.c"
#include <musl/math/libm.h>
#include <musl/math/__rem_pio2_large.c>
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
#include <musl/math/log.c>
#include <musl/math/frexp.c>
#include <musl/math/modf.c>

long lrint(double x) {
	return __builtin_rint(x);
}

unsigned long strlen(const char* str) {
    const char *s;
    for (s = str; *s; ++s);
    return (s - str);
}

static const uint8_t qsort_tmp[8 * 1024];

void qswap(void* a, void* b, unsigned long itemByteLength) {
  memcpy(qsort_tmp, a, itemByteLength);
  memcpy(a, b, itemByteLength);
  memcpy(b, qsort_tmp, itemByteLength);
}

void* partition(void* begin, void* end, unsigned long itemByteLength, int (*compar)(const void*, const void*)) {
    void* pivot = end;
    void* i = begin;
    
    for (void* j = begin; j <= end; j = j + itemByteLength) {
      if (compar(j, pivot) < 0) {
        qswap(i, j, itemByteLength);
        i = i + itemByteLength;
      }
    }
    qswap(i, end, itemByteLength);
    return i;
}

void qsort_impl(void* begin, void* end, unsigned long itemByteLength, int (*compar)(const void*, const void*)) {
  if (begin >= end) {
    return;
  }
  void* p = partition(begin, end, itemByteLength, compar);
  qsort_impl(begin, p - itemByteLength, itemByteLength, compar);
  qsort_impl(p + itemByteLength, end, itemByteLength, compar);
}

void qsort(void* begin, unsigned long length, unsigned long itemByteLength, int (*compar)(const void*, const void*)) {
  if (length < 2) {
    return;
  }
  void* end = begin + ((length - 1) * itemByteLength);
  qsort_impl(begin, end, itemByteLength, compar);
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

