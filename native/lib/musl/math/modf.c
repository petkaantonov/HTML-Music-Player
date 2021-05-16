#include "libm.h"

double modf(double x, double *iptr) {
	return __builtin_modf(x, iptr);
}
