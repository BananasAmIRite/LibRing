#include "accelerometer.h"
#include "i2c.h"
#include "arch_console.h"

// I2C configuration for SC7A20
static const i2c_cfg_t sc7a20_i2c_cfg = {
    .clock_cfg = {
        .ss_hcnt = I2C_SS_SCL_HCNT_REG_RESET,
        .ss_lcnt = I2C_SS_SCL_LCNT_REG_RESET,
        .fs_hcnt = I2C_FS_SCL_HCNT_REG_RESET,
        .fs_lcnt = I2C_FS_SCL_LCNT_REG_RESET,
    },
    .restart_en = I2C_RESTART_ENABLE,
    .speed = I2C_SPEED_FAST,        // 400 kHz
    .mode = I2C_MODE_MASTER,
    .addr_mode = I2C_ADDRESSING_7B,
    .address = 0x18, // SC7A20 i2c addr
    .tx_fifo_level = 16,
    .rx_fifo_level = 16,
};

bool accel_init(void) {
    i2c_init(&sc7a20_i2c_cfg);

    // config accelerometer
    uint8_t abort_code;
    uint8_t config[2] = {0x20, 0b01010111}; // ctrl reg 1, 0101 = 100hz, 0 = sleep, 111 = enable xyz
    i2c_master_transmit_buffer_sync(config, sizeof(uint8_t)*2, &abort_code, I2C_F_NONE);

    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Accelerometer Configuration failed, error: %d\r\n", abort_code);
        return false;
    }

    arch_printf("Accelerometer Initialized successfully");
    return true;
}

uint8_t accel_cmd_whoami(void) {
    uint8_t whoami_addr = 0x0F; // whoami addr 
    i2c_abort_t abort_code;
    i2c_master_transmit_buffer_sync(&whoami_addr, 1, &abort_code, I2C_F_NONE); 

    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("SC7A20: I2C write failed, error: %d\r\n", abort_code);
        return -1;
    }

    uint8_t res;
    
    i2c_master_receive_buffer_sync(&res, 1, &abort_code, I2C_F_WAIT_FOR_STOP);
    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("SC7A20: I2C read failed, error: %d\r\n", abort_code);
        return -1;
    }

    return res; 
}

bool accel_cmd_readaccel(accel_data_t *accel_out) {
    i2c_abort_t abort_code; 
    uint8_t accel_raw[6]; // X_LOW, X_HIGH, Y_LOW, Y_HIGH, Z_LOW, Z_HIGH
    uint8_t addr = 0x28 | 0b10000000; // X_LOW + batch read
    i2c_master_transmit_buffer_sync(&addr, 1, &abort_code, I2C_F_NONE);

    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Error when reading acceleration: %d", abort_code);
        return false; 
    }

    i2c_master_receive_buffer_sync(accel_raw, 6, &abort_code, I2C_F_WAIT_FOR_STOP);
    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Error when reading acceleration: %d", abort_code);
        return false;
    }

    // compute actual accelerations
    int16_t accel_x = (int16_t)((accel_raw[1] << 8) | accel_raw[0]); // X_HIGH concatenated with X_LOW
    int16_t accel_y = (int16_t)((accel_raw[3] << 8) | accel_raw[2]); // Y_HIGH concatenated with U_LOW
    int16_t accel_z = (int16_t)((accel_raw[5] << 8) | accel_raw[4]); // Z_HIGH concatenated with Z_LOW

    accel_out->x = accel_x; 
    accel_out->y = accel_y; 
    accel_out->z = accel_z;

    return true;
}

bool accel_cmd_get_sensitivity(accel_sensitivity_t* sensitivity_out) {
    uint8_t ctrl4_reg = 0x23; 
    i2c_abort_t abort_code; 
    
    // write register address
    i2c_master_transmit_buffer_sync(&ctrl4_reg, 1, &abort_code, I2C_F_NONE);
    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Error writing register address: %d\r\n", abort_code);
        return false;
    }
    
    // read the register value
    uint8_t ctrl4_value;
    i2c_master_receive_buffer_sync(&ctrl4_value, 1, &abort_code, I2C_F_WAIT_FOR_STOP);
    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Error reading sensitivity: %d\r\n", abort_code);
        return false;
    }

    *sensitivity_out = (ctrl4_value >> 4) & 0b11; 
    return true; 
}

bool accel_cmd_set_sensitivity(accel_sensitivity_t sensitivity) {
    uint8_t ctrl4_reg = 0x23; 
    i2c_abort_t abort_code; 
    
    // write register address
    i2c_master_transmit_buffer_sync(&ctrl4_reg, 1, &abort_code, I2C_F_NONE);
    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Error writing register address: %d\r\n", abort_code);
        return false;
    }
    
    // read register value
    uint8_t ctrl4_value;
    i2c_master_receive_buffer_sync(&ctrl4_value, 1, &abort_code, I2C_F_WAIT_FOR_STOP);
    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Error reading sensitivity: %d\r\n", abort_code);
        return false;
    }

    uint8_t modified = (ctrl4_value & ~(0b11 << 4)) | sensitivity << 4; 

    uint8_t new_conf[2] = {ctrl4_reg, modified}; 
    i2c_master_transmit_buffer_sync(new_conf, 2, &abort_code, I2C_F_NONE); 

    if (abort_code != I2C_ABORT_NONE) {
        arch_printf("Error setting sensitivity: %d\r\n", abort_code);
        return false;
    }
    
    arch_printf("Sensitivity set to: %d\r\n", sensitivity);
    return true;
}

uint8_t sensitivity_convert_to_mg(accel_sensitivity_t sensitivity) {
        switch (sensitivity) {
        case SENS_2G:  return 4;    // 2G range: 4 mg/LSB
        case SENS_4G:  return 8;    // 4G range: 8 mg/LSB  
        case SENS_8G:  return 16;   // 8G range: 16 mg/LSB
        case SENS_16G: return 32;   // 16G range: 32 mg/LSB
        default:       return 0;
    }
}

void accel_convert_to_mg(accel_data_t *data, accel_sensitivity_t sensitivity) {
    data->x >>= 6; 
    data->y >>= 6; 
    data->z >>= 6;

    uint8_t sens = sensitivity_convert_to_mg(sensitivity);
    
    data->x *= sens; 
    data->y *= sens; 
    data->z *= sens; 
}