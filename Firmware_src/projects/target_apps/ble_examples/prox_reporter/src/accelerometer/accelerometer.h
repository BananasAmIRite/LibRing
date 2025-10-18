#ifndef _ACCEL_H_
#define _ACCEL_H_

#include "i2c.h"

typedef struct {
    int16_t x; 
    int16_t y;
    int16_t z;
} accel_data_t; 

typedef enum {
    SENS_2G = 0b00, 
    SENS_4G = 0b01, 
    SENS_8G = 0b10, 
    SENS_16G = 0b11
} accel_sensitivity_t;

bool accel_init(void);

uint8_t accel_cmd_whoami(void);

// reads (unconverted) acceleration data into accel_out
bool accel_cmd_readaccel(accel_data_t *accel_out);

// gets acceleration sensitivity
bool accel_cmd_get_sensitivity(accel_sensitivity_t* sensitivity_out);

// sets acceleration sensitivity 
bool accel_cmd_set_sensitivity(accel_sensitivity_t sensitivity);

// converts an accel_sensitivity_t into units of milli-G's
uint8_t sensitivity_convert_to_mg(accel_sensitivity_t sensitivity);

// converts an accel_data_t into units of milli-G's based on the sensitivity given
void accel_convert_to_mg(accel_data_t *data, accel_sensitivity_t sensitivity);
#endif