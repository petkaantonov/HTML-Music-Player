#ifndef _MATH_H
#define _MATH_H

#ifdef __cplusplus
extern "C" {
#endif

#include <features.h>

int __flt_rounds(void);
#define DECIMAL_DIG 17
#define FLT_ROUNDS (__flt_rounds())
#define FLT_RADIX 2
#define FLT_TRUE_MIN 1.40129846432481707092e-45F
#define FLT_MIN 1.17549435082228750797e-38F
#define FLT_MAX 3.40282346638528859812e+38F
#define FLT_EPSILON 1.1920928955078125e-07F
#define FLT_MANT_DIG 24
#define FLT_MIN_EXP (-125)
#define FLT_MAX_EXP 128
#define FLT_HAS_SUBNORM 1
#define FLT_DIG 6
#define FLT_DECIMAL_DIG 9
#define FLT_MIN_10_EXP (-37)
#define FLT_MAX_10_EXP 38
#define DBL_TRUE_MIN 4.94065645841246544177e-324
#define DBL_MIN 2.22507385850720138309e-308
#define DBL_MAX 1.79769313486231570815e+308
#define DBL_EPSILON 2.22044604925031308085e-16

#define DBL_MANT_DIG 53
#define DBL_MIN_EXP (-1021)
#define DBL_MAX_EXP 1024
#define DBL_HAS_SUBNORM 1
#define DBL_DIG 15
#define DBL_DECIMAL_DIG 17
#define DBL_MIN_10_EXP (-307)
#define DBL_MAX_10_EXP 308
#define LDBL_HAS_SUBNORM 1
#define LDBL_DECIMAL_DIG DECIMAL_DIG
#define FLT_EVAL_METHOD 0
#define LDBL_TRUE_MIN 4.94065645841246544177e-324L
#define LDBL_MIN 2.22507385850720138309e-308L
#define LDBL_MAX 1.79769313486231570815e+308L
#define LDBL_EPSILON 2.22044604925031308085e-16L
#define LDBL_MANT_DIG 53
#define LDBL_MIN_EXP (-1021)
#define LDBL_MAX_EXP 1024

#define LDBL_DIG 15
#define LDBL_MIN_10_EXP (-307)
#define LDBL_MAX_10_EXP 308
#define HUGE_VALF INFINITY
#define HUGE_VAL ((double)INFINITY)

#define __NEED_float_t
#define __NEED_double_t
#include <bits/alltypes.h>

#if 100*__GNUC__+__GNUC_MINOR__ >= 303
#define NAN       __builtin_nanf("")
#define INFINITY  __builtin_inff()
#else
#define NAN       (0.0f/0.0f)
#define INFINITY  1e5000f
#endif

#define MATH_ERRNO  1
#define MATH_ERREXCEPT 2
#define math_errhandling 2

#define FP_ILOGBNAN (-1-(int)(((unsigned)-1)>>1))
#define FP_ILOGB0 FP_ILOGBNAN

#define FP_NAN       0
#define FP_INFINITE  1
#define FP_ZERO      2
#define FP_SUBNORMAL 3
#define FP_NORMAL    4

int __fpclassify(double);
int __fpclassifyf(float);

static __inline unsigned __FLOAT_BITS(float __f)
{
    union {float __f; unsigned __i;} __u;
    __u.__f = __f;
    return __u.__i;
}
static __inline unsigned long long __DOUBLE_BITS(double __f)
{
    union {double __f; unsigned long long __i;} __u;
    __u.__f = __f;
    return __u.__i;
}

#define fpclassify(x) _Generic((x), float: __fpclassifyf, default: __fpclassify)(x)
#define isinf(x) _Generic((x), \
                    float: ((__FLOAT_BITS(x) & 0x7fffffff) == 0x7f800000), \
                    default: ((__DOUBLE_BITS(x) & -1ULL>>1) == 0x7ffULL<<52))

#define isnan(x) _Generic((x), \
                    float: ((__FLOAT_BITS(x) & 0x7fffffff) > 0x7f800000), \
                    default: ((__DOUBLE_BITS(x) & -1ULL>>1) > 0x7ffULL<<52))

#define isnormal(x) _Generic((x), \
                    float: (((__FLOAT_BITS(x)+0x00800000) & 0x7fffffff) >= 0x01000000), \
                    default: (((__DOUBLE_BITS(x)+(1ULL<<52)) & -1ULL>>1) >= 1ULL<<53))

#define isfinite(x) _Generic((x), \
                    float: ((__FLOAT_BITS(x) & 0x7fffffff) < 0x7f800000), \
                    default: ((__DOUBLE_BITS(x) & -1ULL>>1) < 0x7ffULL<<52))

int __signbit(double);
int __signbitf(float);

#define signbit(x) _Generic((x), \
                    float: ((int)(__FLOAT_BITS(x)>>31)), \
                    default: ((int)(__DOUBLE_BITS(x)>>63)))


#define isunordered(x,y) (isnan((x)) ? ((void)(y),1) : isnan((y)))

#define __ISREL_DEF(rel, op, type) \
static __inline int __is##rel(type __x, type __y) \
{ return !isunordered(__x,__y) && __x op __y; }

__ISREL_DEF(lessf, <, float_t)
__ISREL_DEF(less, <, double_t)
__ISREL_DEF(lessequalf, <=, float_t)
__ISREL_DEF(lessequal, <=, double_t)
__ISREL_DEF(lessgreaterf, !=, float_t)
__ISREL_DEF(lessgreater, !=, double_t)
__ISREL_DEF(greaterf, >, float_t)
__ISREL_DEF(greater, >, double_t)
__ISREL_DEF(greaterequalf, >=, float_t)
__ISREL_DEF(greaterequal, >=, double_t)

#define __tg_pred_2(x, y, p) _Generic((x), \
                                float: p##f, \
                                default: p)(x, y)

#define isless(x, y)            __tg_pred_2(x, y, __isless)
#define islessequal(x, y)       __tg_pred_2(x, y, __islessequal)
#define islessgreater(x, y)     __tg_pred_2(x, y, __islessgreater)
#define isgreater(x, y)         __tg_pred_2(x, y, __isgreater)
#define isgreaterequal(x, y)    __tg_pred_2(x, y, __isgreaterequal)

double      acos(double);
float       acosf(float);

double      acosh(double);
float       acoshf(float);

double      asin(double);
float       asinf(float);

double      asinh(double);
float       asinhf(float);

double      atan(double);
float       atanf(float);

double      atan2(double, double);
float       atan2f(float, float);

double      atanh(double);
float       atanhf(float);

double      cbrt(double);
float       cbrtf(float);

double      ceil(double);
float       ceilf(float);

double      copysign(double, double);
float       copysignf(float, float);

double      cos(double);
float       cosf(float);

double      cosh(double);
float       coshf(float);

double      erf(double);
float       erff(float);

double      erfc(double);
float       erfcf(float);

double      exp(double);
float       expf(float);

double      exp2(double);
float       exp2f(float);

double      expm1(double);
float       expm1f(float);

double      fabs(double);
float       fabsf(float);

double      fdim(double, double);
float       fdimf(float, float);

double      floor(double);
float       floorf(float);

double      fma(double, double, double);
float       fmaf(float, float, float);

double      fmax(double, double);
float       fmaxf(float, float);

double      fmin(double, double);
float       fminf(float, float);

double      fmod(double, double);
float       fmodf(float, float);

double      frexp(double, int *);
float       frexpf(float, int *);

double      hypot(double, double);
float       hypotf(float, float);

int         ilogb(double);
int         ilogbf(float);

double      ldexp(double, int);
float       ldexpf(float, int);

double      lgamma(double);
float       lgammaf(float);

long long   llrint(double);
long long   llrintf(float);

long long   llround(double);
long long   llroundf(float);

double      log(double);
float       logf(float);

double      log10(double);
float       log10f(float);

double      log1p(double);
float       log1pf(float);

double      log2(double);
float       log2f(float);

double      logb(double);
float       logbf(float);

long        lrint(double);
long        lrintf(float);

long        lround(double);
long        lroundf(float);

EXPORT double modf(double, double *);
float       modff(float, float *);

double      nan(const char *);
float       nanf(const char *);

double      nearbyint(double);
float       nearbyintf(float);

double      nextafter(double, double);
float       nextafterf(float, float);

double      pow(double, double);
float       powf(float, float);

double      remainder(double, double);
float       remainderf(float, float);

double      remquo(double, double, int *);
float       remquof(float, float, int *);

double      rint(double);
float       rintf(float);

double      round(double);
float       roundf(float);

double      scalbln(double, long);
float       scalblnf(float, long);

double      scalbn(double, int);
float       scalbnf(float, int);

double      sin(double);
float       sinf(float);

double      sinh(double);
float       sinhf(float);

double      sqrt(double);
float       sqrtf(float);

double      tan(double);
float       tanf(float);

double      tanh(double);
float       tanhf(float);

double      tgamma(double);
float       tgammaf(float);

double      trunc(double);
float       truncf(float);


#if defined(_XOPEN_SOURCE) || defined(_BSD_SOURCE)
#undef  MAXFLOAT
#define MAXFLOAT        3.40282346638528859812e+38F
#endif

#if defined(_XOPEN_SOURCE) || defined(_GNU_SOURCE) || defined(_BSD_SOURCE)
#define M_E             2.7182818284590452354   /* e */
#define M_LOG2E         1.4426950408889634074   /* log_2 e */
#define M_LOG10E        0.43429448190325182765  /* log_10 e */
#define M_LN2           0.69314718055994530942  /* log_e 2 */
#define M_LN10          2.30258509299404568402  /* log_e 10 */
#define M_PI            3.14159265358979323846  /* pi */
#define M_PI_2          1.57079632679489661923  /* pi/2 */
#define M_PI_4          0.78539816339744830962  /* pi/4 */
#define M_1_PI          0.31830988618379067154  /* 1/pi */
#define M_2_PI          0.63661977236758134308  /* 2/pi */
#define M_2_SQRTPI      1.12837916709551257390  /* 2/sqrt(pi) */
#define M_SQRT2         1.41421356237309504880  /* sqrt(2) */
#define M_SQRT1_2       0.70710678118654752440  /* 1/sqrt(2) */

extern int signgam;

double      j0(double);
double      j1(double);
double      jn(int, double);

double      y0(double);
double      y1(double);
double      yn(int, double);
#endif

#if defined(_GNU_SOURCE) || defined(_BSD_SOURCE)
#define HUGE            3.40282346638528859812e+38F

double      drem(double, double);
float       dremf(float, float);

int         finite(double);
int         finitef(float);

double      scalb(double, double);
float       scalbf(float, float);

double      significand(double);
float       significandf(float);

double      lgamma_r(double, int*);
float       lgammaf_r(float, int*);

float       j0f(float);
float       j1f(float);
float       jnf(int, float);

float       y0f(float);
float       y1f(float);
float       ynf(int, float);
#endif

#ifdef _GNU_SOURCE

void        sincos(double, double*, double*);
void        sincosf(float, float*, float*);

double      exp10(double);
float       exp10f(float);

double      pow10(double);
float       pow10f(float);

#endif

#ifdef __cplusplus
}
#endif

#endif
