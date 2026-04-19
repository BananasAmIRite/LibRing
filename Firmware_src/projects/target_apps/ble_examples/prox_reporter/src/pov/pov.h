#ifndef _POV_H_
#define _POV_H_

#include "accelerometer.h"

#define LPF_SHIFT 4   // alpha = 1/16


typedef struct {
    int32_t x;
    int32_t y;
    int32_t z;
    bool initialized;
} gravity_state_t;

void accel_extract_gravity(const accel_data_t *data,
                           accel_data_t *gravity,
                           gravity_state_t *state); 

void accel_remove_gravity(accel_data_t *data, gravity_state_t *state); 

typedef struct {
    float vel;
    float peak_vel;
    int8_t direction;   // +1 or -1
    bool initialized;
} pov_state_t;

int pov_get_offset(const accel_data_t *linear,
                   pov_state_t *state);

#define POV_MAX_COLS 200
#define WINDOW_SIZE 5
#define FONT_W 5
#define SPACE_W 1

typedef struct {
    float vel;
    float peak_vel;
    int8_t direction;
    bool initialized;
} pov_motion_state_t;

typedef struct {
    uint8_t image[POV_MAX_COLS];
    uint16_t image_len;

    uint16_t offset;
} pov_display_state_t;

void pov_set_display(const char *text); 
void pov_step(accel_data_t *accel, uint8_t* led_buf);

#endif