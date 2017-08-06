#include "queue.h"

uint32_t _queue_get_capacity(uint32_t capacity) {
    capacity = capacity >> 0;
    capacity = capacity - 1;
    capacity = capacity | (capacity >> 1);
    capacity = capacity | (capacity >> 2);
    capacity = capacity | (capacity >> 4);
    capacity = capacity | (capacity >> 8);
    capacity = capacity | (capacity >> 16);
    return capacity + 1;
}

#define V(type)                                            \
type ## _queue* type ## _queue_init(uint32_t capacity) {                      \
    type ## _queue* queue = malloc(sizeof(type ## _queue));                            \
    if (!queue) {                                                              \
        return NULL;                                                           \
    }                                                                          \
    queue->capacity = _queue_get_capacity(capacity);                           \
    queue->length = 0;                                                         \
    queue->front = 0;                                                          \
    queue->values = NULL;                                                      \
                                                                               \
    type* values = malloc(sizeof(type) * capacity);                            \
    if (!values) {                                                             \
        free(queue);                                                           \
        return NULL;                                                           \
    }                                                                          \
    queue->values = values;                                                    \
    return queue;                                                              \
}
QUEUE_TYPES(V)
#undef V

#define V(type)                                                                 \
int _ ## type ## _queue_check_capacity(type ## _queue* this, uint32_t size) {                         \
    if (this->capacity < size) {                                                                    \
        return _  ## type ## _queue_resize_to(this, _queue_get_capacity(this->capacity * 1.5 + 16));    \
    }                                                                                               \
    return 0;                                                                                       \
}
QUEUE_TYPES(V)
#undef V

#define V(type)                                         \
int _ ## type ## _queue_resize_to(type ## _queue* this, uint32_t capacity) {  \
    uint32_t old_capacity = this->capacity;                                 \
    this->capacity = capacity;                                              \
    type* values = realloc(this->values, sizeof(type) * capacity);          \
    if (!values) {                                                          \
        return 1;                                                           \
    }                                                                       \
    this->values = values;                                                  \
    uint32_t front = this->front;                                           \
    uint32_t length = this->length;                                         \
    if (front + length > old_capacity) {                                    \
        uint32_t items_to_move = (front + length) & (old_capacity - 1);     \
        memmove(this->values + old_capacity,                                \
                this->values,                                               \
                items_to_move * sizeof(type));                              \
    }                                                                       \
    return 0;                                                               \
}
QUEUE_TYPES(V)
#undef V

#define V(type)                                     \
int type ## _queue_push(type ## _queue* this, type item) {                \
    uint32_t length = this->length;                                     \
                                                                        \
    int err = _ ## type ## _queue_check_capacity(this, length + 1);   \
    if (err) {                                                          \
        return err;                                                     \
    }                                                                   \
    uint32_t i = (this->front + length) & (this->capacity - 1);         \
    this->values[i] = item;                                             \
    this->length = length + 1;                                          \
    return 0;                                                           \
}
QUEUE_TYPES(V)
#undef V

#define V(type)                        \
int type ## _queue_shift(type ## _queue* this, type* ret) {  \
    if (this->length == 0) {                               \
        return 2;                                          \
    }                                                      \
    if (ret) {                                             \
        *ret = this->values[this->front];                  \
    }                                                      \
    this->front = (this->front + 1) & (this->capacity - 1);\
    this->length--;                                        \
    return 0;                                              \
}
QUEUE_TYPES(V)
#undef V

#define V(type)                                     \
int type ## _queue_get(type ## _queue* this, int32_t index, type* ret) {  \
    if (index < 0) {                                                    \
        index += this->length;                                          \
    }                                                                   \
    if (index < 0 || index >= this->length) {                           \
        return 2;                                                       \
    }                                                                   \
                                                                        \
    uint32_t _index = (this->front + index) & (this->capacity - 1);     \
    *ret = this->values[_index];                                        \
    return 0;                                                           \
}
QUEUE_TYPES(V)
#undef V

#define V(type) \
void type ## _queue_free(type ## _queue* this) {   \
    if (this->values) {   \
        free(this->values);   \
        this->values = NULL;   \
    }   \
    free(this);   \
}
    QUEUE_TYPES(V)

#undef V

#define V(type)                                                                                           \
int type ## _queue_copy_values(type ## _queue* this, type* values, uint32_t length) {                     \
    int err = _ ## type ## _queue_check_capacity(this, length);                                           \
    if (err) {                                                                                            \
        return err;                                                                                       \
    }                                                                                                     \
    type ## _queue_clear(this);                                                                           \
    memmove(this->values, values, length * sizeof(type));                                                 \
    this->length = length;                                                                                \
    return 0;                                                                                             \
}
    QUEUE_TYPES(V)
#undef V

#define V(type)                                                                   \
uint32_t type ## _queue_export_values(type ## _queue* this, type* out, uint32_t max) {          \
    if (this->length == 0) {                                                      \
        return 0;                                                                 \
    }                                                                             \
                                                                                  \
    const uint32_t capacity = this->capacity;                                     \
    const uint32_t front = this->front;                                           \
    const uint32_t length = MIN(max, this->length);                               \
                                                                                  \
    for (uint32_t i = 0; i < length; ++i) {                                       \
        out[i] = this->values[((front + i) & (capacity - 1))];                    \
    }                                                                             \
    return this->length;                                                          \
}
    QUEUE_TYPES(V)
#undef V

#define V(type) \
void type ## _queue_clear(type ## _queue* this) {   \
    this->length = 0;                               \
    this->front = 0;                                \
}
    QUEUE_TYPES(V)

#undef V

#undef QUEUE_TYPES
