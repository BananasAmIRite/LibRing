#ifndef FLUID_5X25_H_
#define FLUID_5X25_H_

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

// Grid coordinates:
// - x: 0..4 (columns, left->right)
// - y: 0..24 (rows, top->bottom)
//
// Cell value is "density" in [0,255]. Total mass is conserved by the step.

#define FLUID_5X25_W 5
#define FLUID_5X25_H 25

typedef struct {
    // densities
    uint8_t d[FLUID_5X25_W][FLUID_5X25_H];
    // cached total mass for conservation
    uint32_t mass0;
    uint8_t initialized;
} fluid_5x25_t;

void fluid_5x25_init(fluid_5x25_t *f);

// Step with normalized forces in [0,1].
// left_0_1: 0 -> push to x=0, 0.5 -> neutral, 1 -> push to x=4
// down_0_1: 0 -> push to y=0, 0.5 -> neutral, 1 -> push to y=24
void fluid_5x25_step(fluid_5x25_t *f, float left_0_1, float down_0_1);

// Sample a single cell. Out of bounds returns 0.
uint8_t fluid_5x25_get(const fluid_5x25_t *f, int x, int y);

// Batch sample N integer coordinates.
// xs[i], ys[i] are grid coordinates; out[i] gets density (0 if OOB).
void fluid_5x25_sample(const fluid_5x25_t *f,
                       const uint8_t *xs,
                       const uint8_t *ys,
                       uint8_t n,
                       uint8_t *out);

// Convert the fluid grid into 5 seven-segment bytes.
// Sampling follows the user-provided digit-local coordinates:
//   (2,0)->G, (0,1)->F, (0,3)->C, (2,5)->A,
//   (2,2)->D, (4,1)->E, (4,3)->B
// For digit i, all sample x coordinates are offset by i*5.
//
// Because fluid_5x25_t is stored as x=0..4, y=0..24, these digit sample
// coordinates are interpreted on a transposed logical 25x5 view and read
// through fluid_5x25_get(f, sample_y, sample_x).
void fluid_5x25_to_segments(const fluid_5x25_t *f, uint8_t LED_segments[5]);

#ifdef __cplusplus
}
#endif

#endif

