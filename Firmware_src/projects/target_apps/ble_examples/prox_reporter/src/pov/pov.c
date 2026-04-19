#include "pov.h"
#include <math.h>
#include "../leds.h"
#include "pov_font.h"



void accel_extract_gravity(const accel_data_t *data,
                           accel_data_t *gravity,
                           gravity_state_t *state)
{
    if (!state->initialized) {
        state->x = ((int32_t)data->x) << LPF_SHIFT;
        state->y = ((int32_t)data->y) << LPF_SHIFT;
        state->z = ((int32_t)data->z) << LPF_SHIFT;
        state->initialized = true;
    }

    // g = g + alpha * (input - g)
    state->x += (((int32_t)data->x << LPF_SHIFT) - state->x) >> LPF_SHIFT;
    state->y += (((int32_t)data->y << LPF_SHIFT) - state->y) >> LPF_SHIFT;
    state->z += (((int32_t)data->z << LPF_SHIFT) - state->z) >> LPF_SHIFT;

    gravity->x = (int16_t)(state->x >> LPF_SHIFT);
    gravity->y = (int16_t)(state->y >> LPF_SHIFT);
    gravity->z = (int16_t)(state->z >> LPF_SHIFT);
}


void accel_remove_gravity(accel_data_t *data, gravity_state_t *state)
{
    accel_data_t gravity;

    // Step 1: estimate gravity using your LPF
    accel_extract_gravity(data, &gravity, state);

    // Step 2: subtract gravity in-place → linear acceleration
    data->x -= gravity.x;
    data->y -= gravity.y;
    data->z -= gravity.z;
}

#define POV_WIDTH 60
#define DT 0.01f   // assume ~100 Hz update (adjust if needed)

int pov_get_offset(const accel_data_t *linear,
                   pov_state_t *state)
{
    if (!state->initialized) {
        state->vel = 0;
        state->peak_vel = 1; // avoid divide-by-zero
        state->direction = 0;
        state->initialized = true;
    }

    // -------------------------
    // 1. pick axis (X assumed)
    // -------------------------
    float ax = -(float)linear->y;

    // -------------------------
    // 2. integrate accel → velocity
    // -------------------------
    state->vel += ax * DT;

    // -------------------------
    // 3. detect direction change (swing reset)
    // -------------------------
    int8_t new_dir = (state->vel >= 0) ? 1 : -1;

    if (state->direction != 0 && new_dir != state->direction) {
        // new swing started → reset tracking
        state->peak_vel = fabsf(state->vel);
        state->vel = 0;
    }

    state->direction = new_dir;

    // -------------------------
    // 4. track peak velocity
    // -------------------------
    float abs_v = fabsf(state->vel);
    if (abs_v > state->peak_vel) {
        state->peak_vel = abs_v;
    }

    // -------------------------
    // 5. normalize phase (0 → 1)
    // -------------------------
    float phase = 0.5f; // fallback center

    if (state->peak_vel > 0.001f) {
        phase = fabsf(state->vel) / state->peak_vel;
    }

    if (phase > 1.0f) phase = 1.0f;

    // -------------------------
    // 6. map to POV offset
    // -------------------------
    int offset = (int)(phase * (POV_WIDTH - 1));

    return offset;
}


static pov_motion_state_t motion_state;
static pov_display_state_t display_state;
static gravity_state_t gravity_state;

void pov_set_display(const char *text)
{
    memset(&display_state, 0, sizeof(display_state));

    display_state.image_len =
        text_to_bitmap(text,
                        display_state.image,
                        POV_MAX_COLS);

    if (display_state.image_len < WINDOW_SIZE)
        display_state.image_len = WINDOW_SIZE;
}

void pov_step(accel_data_t *accel, uint8_t* led_buf)
{
    // -------------------------
    // 1. remove gravity
    // -------------------------
    accel_remove_gravity(accel, &gravity_state);

    accel_data_t *linear = accel;

    // -------------------------
    // 2. get offset 
    // -------------------------
    // int offset = pov_get_offset(linear, &motion_state);
    int offset = 0; 
    // display_state.offset = offset;

    // // clamp so we don't overflow window
    // if (display_state.offset > display_state.image_len - WINDOW_SIZE)
    //     display_state.offset = display_state.image_len - WINDOW_SIZE;

    // int clamped_offset = offset % display_state.image_len;
    // if (clamped_offset < 0) clamped_offset += display_state.image_len; 


    // -------------------------
    // 3. build LED window
    // -------------------------
    uint8_t LED_segments[5] = {0, 0, 0, 0, 0};


    // [0] = left-most, [4] = right-most
    /*
     0bXABCDEFG
     G -> top segment
     F -> left top segment
     E -> right top segment
     D -> middle segment
     C -> bottom left segment
     B -> bottom right segment
     A -> bottom segment
    */
   // {0x1F, 0x04, 0x04, 0x04, 0x1F},
    // LED_segments[0] = 0x7F; // 0b01001001; 
    // LED_segments[1] = 0x08; // 0b00000000; 
    // LED_segments[2] = 0x08; // 0b00000000; 
    // LED_segments[3] = 0x08; // 0b00110110; 
    // LED_segments[4] = 0x7F; // 0b00000000; 
    // // LED_segments[5] = 0b00010000; 

    for (int i = 0; i < WINDOW_SIZE; i++)
    {
        int idx = offset + i; 
        if (idx < 0 || idx >= display_state.image_len) {
            LED_segments[i] = 0; 
        } else {
        LED_segments[i] =
            display_state.image[offset + i];
        }
    }

    // -------------------------
    // 4. push to hardware
    // -------------------------
    LED_Buff_setSegments((char*)LED_segments, led_buf);
    // LED_Buff_setInt(
    //     offset
    //     // display_state.image_len
    //     , led_buf, 5);
}