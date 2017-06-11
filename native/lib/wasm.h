#ifndef WASM_H
#define WASM_H

#if DEBUG == 1 && defined(NDEBUG)
    #undef NDEBUG
#elif !defined(NDEBUG)
    #define NDEBUG 1
#endif

#define __int8_t_defined
typedef signed char int8_t;
typedef short int int16_t;
typedef int int32_t;
typedef long long int int64_t;
typedef unsigned char uint8_t;
typedef unsigned short int uint16_t;
typedef unsigned int uint32_t;
typedef unsigned long long int uint64_t;
typedef int intptr_t;
typedef unsigned int uintptr_t;
typedef long long int intmax_t;
typedef intptr_t ptrdiff_t;
typedef unsigned long long int uintmax_t;
typedef uint32_t size_t;
typedef double double_t;
typedef float float_t;
typedef struct {} FILE;

#define bool _Bool
#define boolean _Bool
#define true 1
#define false 0
#define __bool_true_false_are_defined 1

FILE* stdin = (FILE*)0;
FILE* stdout = (FILE*)1;
FILE* stderr = (FILE*)2;

#define NOLIBC 1
#define NEED_MINILIBC 0
#define PAGE_SIZE 65536

#define LACKS_UNISTD_H 1
#define LACKS_FCNTL_H 1
#define LACKS_SYS_PARAM_H 1
#define LACKS_SYS_MMAN_H 1
#define LACKS_STRINGS_H 1
#define LACKS_STRING_H 1
#define LACKS_SYS_TYPES_H 1
#define LACKS_ERRNO_H 1
#define LACKS_STDLIB_H 1
#define LACKS_SCHED_H 1
#define LACKS_TIME_H 1

#define CHAR_BIT 8
#define SCHAR_MIN -128
#define SCHAR_MAX 127
#define UCHAR_MAX 255
#define CHAR_MIN -128
#define CHAR_MAX 127
#define MB_LEN_MAX 16
#define SHRT_MIN -32768
#define SHRT_MAX 32767
#define USHRT_MAX 65535
#define INT_MIN -2147483648
#define INT_MAX 2147483647
#define UINT_MAX 4294967295
#define LONG_MIN -INT_MIN
#define LONG_MAX INT_MAX
#define ULONG_MAX UINT_MAX

#define ENOMEM 12
#define EINVAL 22

#define MIN(a,b) (((a)<(b))?(a):(b))
#define MAX(a,b) (((a)>(b))?(a):(b))

#define DOUBLE_TO_I32(val) ((int32_t)((int64_t)(val)))
#define DOUBLE_TO_U32(val) ((uint32_t)((uint64_t)(val)))

#define CLIP_I32_TO_I16(val) (int16_t)(MAX(MIN((val), SHRT_MAX), SHRT_MIN))

#define ABORT_ON_ASSERT_FAILURE 0
#define MALLOC_FAILURE_ACTION
#define NO_MALLOC_STATS 1
#define HAVE_MORECORE 1
// WASM only supports .grow()
#define MORECORE_CANNOT_TRIM 1
// No virtual memory so pointless
#define HAVE_MMAP 0
#define HAVE_MREMAP 0
#define MMAP_CLEARS 0
#define malloc_getpagesize PAGE_SIZE

#define OUTSIDE_SPEEX 1
#define RANDOM_PREFIX speex
#define FIXED_POINT 1
#define EXPORT extern __attribute__((visibility("default")))
#define DLMALLOC_EXPORT EXPORT

extern void* sbrk(intptr_t);
extern int brk(void*);
extern void a_crash();
void* alloc(size_t);
void* realloc(void*, size_t);
void* calloc(size_t, size_t);
void free(void*);
int fprintf(FILE*, const char*, ...);
int printf(const char*, ...);
int clz(uint32_t x);
void* memmove(void*, const void*, size_t);
void* memcpy(void*, const void*, size_t);
void* memset(void*, int, size_t);
void abort();
size_t strlen(const char*);
extern double performance_now(void);
extern double math_random(void);

#ifdef DEBUG

extern void __dump_memory(const void* ptr, uint32_t length, const char* constructor, uint32_t line, const char* file, const char* function);
extern void __debugger(int* stack_ptr, const char* file, const char* function, uint32_t line);

#define dumpMemory(ptr, length) __dump_memory((void*)ptr,                       \
                                              length,                           \
                                              (_Generic((ptr),                  \
                                                uint8_t*: "Uint8Array",         \
                                                int8_t*: "Int8Array",           \
                                                uint16_t*: "Uint16Array",       \
                                                int16_t*: "Int16Array",         \
                                                uint32_t*: "Uint32Array",       \
                                                int32_t*: "Int32Array",         \
                                                float*: "Float32Array",         \
                                                double*: "Float64Array",        \
                                                default: "Uint8Array")),        \
                                              __LINE__,                         \
                                              __FILE__,                         \
                                              __func__)

#define DEBUGGER                                  \
{                                                 \
  int tmp;                                        \
  __debugger(&tmp, __FILE__, __func__, __LINE__); \
}

#define ASSERTION_TYPES(V)                                \
  V(equals, ==, "does not equal")                         \
  V(not_equals, !=, "equals")                             \
  V(gt, >, "is not greater than")                         \
  V(gte, >=, "is not greater than or equal to")           \
  V(lt, <, "is not less than")                            \
  V(lte, <=, "is not less than or equal to")

#define V(cname, op, msg)                                         \
  void __assert_## cname ##_fail(const char *expr1,               \
                           const char *expr2,                     \
                           int32_t expr1_value,                   \
                           int32_t expr2_value,                   \
                           const char *file,                      \
                           unsigned int line,                     \
                           const char *function);
  ASSERTION_TYPES(V)
#undef V

void __assert_fail(const char*, const char*, unsigned int, const char*);

#define assert(expr)                           \
  ((expr)                               \
   ? (void) (0)                     \
   : __assert_fail(#expr, __FILE__, __LINE__, __func__))
#define assert_equals(expr1, expr2) \
  ((expr1) == (expr2) ? (void) (0) : \
    (__assert_equals_fail(#expr1, #expr2, ((int32_t)(expr1)), ((int32_t)(expr2)), __FILE__, __LINE__, __func__)))
#define assert_not_equals(expr1, expr2) \
  ((expr1) != (expr2) ? (void) (0) : \
    (__assert_not_equals_fail(#expr1, #expr2, ((int32_t)(expr1)), ((int32_t)(expr2)), __FILE__, __LINE__, __func__)))
#define assert_gt(expr1, expr2) \
  ((expr1) > (expr2) ? (void) (0) : \
    (__assert_gt_fail(#expr1, #expr2, ((int32_t)(expr1)), ((int32_t)(expr2)), __FILE__, __LINE__, __func__)))
#define assert_gte(expr1, expr2) \
  ((expr1) >= (expr2) ? (void) (0) : \
    (__assert_ge_fail(#expr1, #expr2, ((int32_t)(expr1)), ((int32_t)(expr2)), __FILE__, __LINE__, __func__)))
#define assert_lt(expr1, expr2) \
  ((expr1) < (expr2) ? (void) (0) : \
    (__assert_lt_fail(#expr1, #expr2, ((int32_t)(expr1)), ((int32_t)(expr2)), __FILE__, __LINE__, __func__)))
#define assert_lte(expr1, expr2) \
  ((expr1) <= (expr2) ? (void) (0) : \
    (__assert_lte_fail(#expr1, #expr2, ((int32_t)(expr1)), ((int32_t)(expr2)), __FILE__, __LINE__, __func__)))
#else
  #ifndef NDEBUG
    #define assert(expr) ((expr) ? (void)(0) : abort())
    #define assert_equals(expr1, expr2) ((expr1) == (expr2) ? (void) (0) : abort())
    #define assert_not_equals(expr1, expr2) ((expr1) == (expr2) ? (void) (0) : abort())
    #define assert_gt(expr1, expr2) ((expr1) == (expr2) ? (void) (0) : abort())
    #define assert_gte(expr1, expr2) ((expr1) == (expr2) ? (void) (0) : abort())
    #define assert_lt(expr1, expr2) ((expr1) == (expr2) ? (void) (0) : abort())
    #define assert_lte(expr1, expr2) ((expr1) == (expr2) ? (void) (0) : abort())
  #else
    #define assert(expr) (void) (0)
    #define assert_equals(expr1, expr2) (void) (0)
    #define assert__not_equals(expr1, expr2) (void) (0)
    #define assert_gt(expr1, expr2) (void) (0)
    #define assert_gte(expr1, expr2) (void) (0)
    #define assert_lt(expr1, expr2) (void) (0)
    #define assert_lte(expr1, expr2) (void) (0)
  #endif
#endif

extern void __print_stack_trace(const char*, const char*, const char*, unsigned int);

#define PRINT_STACK_TRACE(msg) __print_stack_trace((msg), __FILE__, __func__, __LINE__);

#endif //WASM_H
