void __secs_to_zone(long long, int, int *, long *, long *, const char **);
int __secs_to_tm(long long, struct tm *);
long long __tm_to_secs(const struct tm *);
long long __year_to_secs(long long, int *);
int __month_to_secs(int, int);
