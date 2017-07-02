#ifndef EFFECTS_H
#define EFFECTS_H

#define EFFECT_MULTIPLIER ((int32_t)10000)

EXPORT void effects_noise_sharpening(double effect_size, uint8_t channel_count, void* samples, uint32_t byte_length);

#endif //EFFECTS_H
