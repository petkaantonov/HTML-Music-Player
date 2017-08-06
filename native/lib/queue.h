#ifndef QUEUE_H
#define QUEUE_H

#define QUEUE_TYPES(V)                                  \
    V(double)

#define V(type)                                         \
    typedef struct {                                    \
        uint32_t capacity;                              \
        uint32_t length;                                \
        uint32_t front;                                 \
        type* values;                                   \
    } type ## _queue;
QUEUE_TYPES(V)
#undef V

uint32_t _queue_get_capacity(uint32_t capacity);
#define V(type)                                            \
type ## _queue* type ## _queue_init(uint32_t capacity);                       \
int _ ## type ## _queue_check_capacity(type ## _queue* this, uint32_t size);     \
int _ ## type ## _queue_resize_to(type ## _queue* this, uint32_t capacity);      \
int type ## _queue_push(type ## _queue* this, type item);                        \
int type ## _queue_shift(type ## _queue* this, type* ret);                       \
int type ## _queue_get(type ## _queue* this, int32_t index, type* ret);          \
void type ## _queue_free(type ## _queue* this);                                  \
void type ## _queue_clear(type ## _queue* this);                                  \
int type ## _queue_copy_values(type ## _queue* this, type* values, uint32_t length);  \
uint32_t type ## _queue_export_values(type ## _queue* this, type* out, uint32_t max);
QUEUE_TYPES(V)
#undef V

#define queue_push(this, item) _Generic((this), double_queue*: double_queue_push)(this, item)
#define queue_shift(this, ret) _Generic((this), double_queue*: double_queue_shift)(this, ret)
#define queue_get(this, index, ret) _Generic((this), double_queue*: double_queue_get)(this, index, ret)
#define queue_export_values(this, out, max) _Generic((this), double_queue*: double_queue_export_values)(this, out, max)
#define queue_copy_values(this, values, length) _Generic((this), double_queue*: double_queue_copy_values)(this, values, length)
#define queue_free(this) _Generic((this), double_queue*: double_queue_free)(this)
#define queue_clear(this) _Generic((this), double_queue*: double_queue_clear)(this)

#endif //QUEUE_H
