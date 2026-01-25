#include "rwip_config.h"
#include "gattc_task.h"
#include "gapc_task.h"
#include "user_periph_setup.h"
#include "wkupct_quadec.h"
#include "app_easy_msg_utils.h"
#include "gpio.h"
#include "app_security.h"
#include "user_proxr.h"
#include "arch.h"
#include "arch_api.h"
#include "lld_evt.h"
#include "app_task.h"
#include "app_proxr.h"

#include "timer0.h"
#include "timer0_2.h"
#if (BLE_SUOTA_RECEIVER)
#include "app_suotar.h"
#endif

#if defined (CFG_SPI_FLASH_ENABLE)
#include "spi_flash.h"
#endif

#include "arch_console.h"

#include "user_config.h"

#include "leds.h"

#include "./accelerometer/accelerometer.h"
#include "custs1_task.h"
#include "user_custs1_impl.h"


#if defined(__IS_SDK6_COMPILER_GCC__) && !defined(__clang__)
#pragma message("Please note that SDK6 GCC support will be deprecated in the next SDK6 release")
#endif

static led_gpios theLedGpiosLow[] = {
        {GPIO_PORT_2, GPIO_PIN_1},
        {GPIO_PORT_1, GPIO_PIN_3},
        {GPIO_PORT_2, GPIO_PIN_0},
        {GPIO_PORT_1, GPIO_PIN_2},
        {GPIO_PORT_1, GPIO_PIN_0},
        {GPIO_PORT_1, GPIO_PIN_1},
        {GPIO_PORT_0, GPIO_PIN_2},
};

static led_gpios theLedGpiosHigh[] = {
        {GPIO_PORT_2, GPIO_PIN_8},
        {GPIO_PORT_2, GPIO_PIN_7},
        {GPIO_PORT_2, GPIO_PIN_6},
        {GPIO_PORT_2, GPIO_PIN_5},
        {GPIO_PORT_2, GPIO_PIN_2},
        {GPIO_PORT_2, GPIO_PIN_9},
};



uint8_t LED_Buffer[6] = {0x00,0x00,0x00,0x00,0x00,0x00};

uint32_t counter_time = 0;
uint8_t counter_ms = 0;
uint8_t current_line = 0;
uint32_t realUnix = 0;
uint32_t lastTime = 0;

uint32_t led_value = 0;

uint8_t LED_Display_state = 0;
uint32_t turnOnTime = 0;

uint8_t whoami_res = 0; 


accel_sensitivity_t sens; 

static timer_hnd main_timer_hnd = EASY_TIMER_INVALID_TIMER; 

bool btn_send_enabled = false; 

typedef enum {
    DEFAULT,
    ACCEL_INIT,
    ACCEL_CONFIG, 
    ACCEL_SENS, 
    WHOAMI, 
    DISP_INFO, 
    BT_INIT, 
    BT_NOTIF, 
    NUM_STATES
} user_state_t;

uint8_t user_state = 0;
bool user_run = false;  

bool has_timer_started = false; 

void calcTime()
{
           uint32_t currentTime = lld_evt_time_get();
           if(currentTime == 0)
                   return;
           currentTime/=1000;
           if (currentTime < lastTime) {
               realUnix += (UINT32_MAX / 1000) + 1;
           }
           realUnix += (currentTime - lastTime);
           lastTime = currentTime;
}

void LED_GPIO_mode(uint8_t mode)
{
        arch_printf("LED_GPIO_mode: %i\r\n", mode);
        if(mode == 1)
        {
                if(LED_Display_state != 1)
                {
                        LED_Display_state = 1;
                        calcTime();
                        turnOnTime = realUnix;
                        LED_Pin_Config(true);
                        // Here we enable the Timer
                        arch_force_active_mode();
                        timer0_enable_irq();
                        timer0_start();
                }
        } else {
                if(LED_Display_state != 0)
                {
                        LED_Display_state = 0;
                        LED_Pin_Config(false);
                        // Here we disable the Timer
                        timer0_disable_irq();
                        timer0_stop();
                        arch_restore_sleep_mode();
                }
        }
}

void refreshMenu()
{
        //LED_Buff_setInt(counter_time, LED_Buffer, 5);
        calcTime();
        /*LED_Buff_setInt((realUnix % 86400) / 3600, LED_Buffer, 2);
        LED_Buff_setInt((realUnix % 3600) / 60, &LED_Buffer[3], 2);
        if((counter_time%2)==0)
                LED_Buffer[2] = 0x48;*/

        // uint8_t whoami = accel_cmd_whoami();

        LED_Buff_setInt(led_value, LED_Buffer, 5);
}

static void timer_cb(void)
{
    // static uint8_t accel_counter = 0; 

    if(LED_Display_state) {
        // on each timer callback, swap LED lines so that each line is written to
        // after each line has been written to, refresh the menu
            current_line++;
            current_line%=6;
            if(current_line == 0)
            {
                    counter_ms++;
                    if(counter_ms >=55)// every 495ms
                    {
                        counter_ms = 0;
                        counter_time++;
                        arch_printf("Time %i MS: %i\r\n", realUnix, lld_evt_time_get());
                        //if(realUnix - turnOnTime >= 10)
                            //       LED_GPIO_mode(0);
                    }
                    memset(LED_Buffer,0x00,sizeof(LED_Buffer));
                    refreshMenu();
            }

            LED_write(LED_Buffer, current_line);
    }
}

static void main_timer_cb(void) {

    if (!user_run) {
        start_main_timer();
        return; 
    }

    if (user_state == DEFAULT) {
        // default nothing state
        LED_GPIO_mode(0);
        user_run = false; 
    } else if (user_state == ACCEL_INIT) {
        LED_GPIO_mode(1);
        bool val = accel_init(); 

        if (val) {
            led_value = 1;
        } else {
            led_value = 11; 
        } 
        
        // stop after running once
        user_run = false; 
    } else if (user_state == ACCEL_CONFIG) {
        LED_GPIO_mode(1);

        bool val = accel_config(); 

        bool out = accel_cmd_set_sensitivity(SENS_16G);
     
        led_value = out; 

        btn_send_enabled = true; 
        
        // if (val) {
        //     led_value = 100; 
        // } else {
        //     led_value = 9; 
        // }
        
        user_run = false; 
    } else if (user_state == ACCEL_SENS) {

        accel_cmd_get_sensitivity(&sens); 

        led_value = sens; 
        user_run = false; 
    } else if (user_state == WHOAMI) {
        // user_run = false;
        LED_GPIO_mode(1); 
        uint8_t whoami_out = accel_cmd_whoami(); 
        
        led_value = whoami_out; 

        user_run = false; 
    } else if (user_state == DISP_INFO) {
        // led_value = 1; 
        LED_GPIO_mode(1);

        accel_data_t data; 

        bool out = accel_cmd_readaccel(&data); 

        accel_convert_to_mg(&data, sens); 

        led_value = abs(data.y); 
        // led_value = out; 
        // user_run = false; 
    } else if (user_state == BT_INIT) {
        
        // // Skip accelerometer reads - just send test data
        // accel_data_t data; 
        // accel_cmd_readaccel(&data); 
        // accel_convert_to_mg(&data, sens); 

        // #if (BLE_CUSTOM1_SERVER)
        //     uint8_t out = update_accel_data(&data);
        //     led_value = out; 
        // #endif

        LED_GPIO_mode(0); 
        arch_force_active_mode();
        
        // Reinitialize and reconfigure accelerometer in case it was powered down during sleep
        accel_init();
        accel_config();

        
        led_value = 127; // Display x-axis value
        
        user_run = false; 
        // user_run = true;
    } else if (user_state == BT_NOTIF) {
        // Force active mode to prevent sleep from powering down I2C peripheral

        
        // Read accelerometer data
        accel_data_t data;
        accel_cmd_readaccel(&data);
        // accel_convert_to_mg(&data, sens);

        #if (BLE_CUSTOM1_SERVER)
            update_accel_data(&sens, &data); // Send real accelerometer data
            notify_accel_data(&sens, &data); // notify corresponding devices
        #endif
        
        
        user_run = true; // Continuous updates
    } else {
        // Restore sleep mode after operations complete
        arch_restore_sleep_mode();
        // stop running if invalid state
        user_run = false; 
    }

    start_main_timer();
}


void start_refresh_timer(void)
{
        static tim0_2_clk_div_config_t clk_div_config =
        {
            .clk_div  = TIM0_2_CLK_DIV_8
        };
        timer0_2_clk_enable();
        timer0_2_clk_div_set(&clk_div_config);
        timer0_set_pwm_high_counter(0);
        timer0_set_pwm_low_counter(0);
        // Set timer with 2MHz source clock divided by 10 so Fclk = 2MHz/10 = 200kHz
        timer0_init(TIM0_CLK_FAST, PWM_MODE_ONE, TIM0_CLK_DIV_BY_10);
        // reload value for 100ms (T = 1/200kHz * RELOAD_100MS = 0,000005 * 20000 = 100ms)
        timer0_set_pwm_on_counter(300);
        timer0_register_callback(timer_cb);
}

void start_main_timer(void) {
    // Timer interval in 10ms units (50 = 500ms, 10 = 100ms, 5 = 50ms)
    // Safe range: 5-10 (50-100ms) for 10-20Hz update rate
    main_timer_hnd = app_easy_timer(10, main_timer_cb); // 50ms = 20Hz
}

static void app_wakeup_cb(void)
{
    // If state is not idle, ignore the message
    if (ke_state_get(TASK_APP) == APP_CONNECTABLE)
    {
        default_advertise_operation();
    }
}

static void app_resume_system_from_sleep(void)
{
    if (GetBits16(SYS_STAT_REG, PER_IS_DOWN))
    {
        periph_init();
    }

    if (arch_ble_ext_wakeup_get())
    {
        arch_set_sleep_mode(app_default_sleep_mode);
        arch_ble_force_wakeup();
        arch_ble_ext_wakeup_off();
        app_easy_wakeup();
    }
}

void user_app_on_init(void)
{

     default_app_on_init();
    //  start_main_timer();
     arch_printf("Booted now\r\n");
     LED_GPIO_mode(0);
}

static void app_button_press_cb(void)
{
    app_resume_system_from_sleep();

    app_button_enable();

    bool pin_val = GPIO_GetPinStatus(GPIO_BUTTON_PORT, GPIO_BUTTON_PIN);
    #if (BLE_CUSTOM1_SERVER)
        if (btn_send_enabled) {
            update_btn_data(pin_val); 
            notify_btn_data(pin_val);
        }
    #endif 

    if (pin_val)
            return; // only set pressed when button goes from pressed to not pressed
    arch_printf("Button was just pressed\r\n");

    if (user_state == DEFAULT && !has_timer_started) {
        has_timer_started = true; 
        start_main_timer(); 
    }

    user_state = (user_state + 1) % NUM_STATES;
    user_run = true; 
}

void app_button_enable(void)
{
    app_easy_wakeup_set(app_wakeup_cb);
    wkupct_register_callback(app_button_press_cb);

    if (!GPIO_GetPinStatus(GPIO_BUTTON_PORT, GPIO_BUTTON_PIN))
    {
        wkupct_enable_irq(WKUPCT_PIN_SELECT(GPIO_BUTTON_PORT, GPIO_BUTTON_PIN), // select pin (GPIO_BUTTON_PORT, GPIO_BUTTON_PIN)
                          WKUPCT_PIN_POLARITY(GPIO_BUTTON_PORT, GPIO_BUTTON_PIN, WKUPCT_PIN_POLARITY_HIGH), // polarity low
                          1, // 1 event
                          0); // debouncing time = 0
    }else{
            wkupct_enable_irq(WKUPCT_PIN_SELECT(GPIO_BUTTON_PORT, GPIO_BUTTON_PIN), // select pin (GPIO_BUTTON_PORT, GPIO_BUTTON_PIN)
                              WKUPCT_PIN_POLARITY(GPIO_BUTTON_PORT, GPIO_BUTTON_PIN, WKUPCT_PIN_POLARITY_LOW), // polarity low
                              1, // 1 event
                              0); // debouncing time = 0
    }
}

#if (BLE_SUOTA_RECEIVER)
void on_suotar_status_change(const uint8_t suotar_event)
{
#if (!SUOTAR_SPI_DISABLE)
    uint8_t dev_id;

    // Release the SPI flash memory from power down
    spi_flash_release_from_power_down();

    // Try to auto-detect the SPI flash memory
    spi_flash_auto_detect(&dev_id);

    // Disable the SPI flash memory protection (unprotect all sectors)
    spi_flash_configure_memory_protection(SPI_FLASH_MEM_PROT_NONE);

    if (suotar_event == SUOTAR_END)
    {
        // Power down the SPI flash memory
        spi_flash_power_down();
    }
#endif
}
#endif
void user_app_on_disconnect(struct gapc_disconnect_ind const *param)
{
    arch_printf("BLE Disconnected\r\n");
    default_app_on_disconnect(NULL);

    // if (main_timer_hnd != EASY_TIMER_INVALID_TIMER) {
    //     app_easy_timer_cancel(main_timer_hnd);
    //     main_timer_hnd = EASY_TIMER_INVALID_TIMER;
    // }

#if (BLE_BATT_SERVER)
    app_batt_poll_stop();
#endif

#if (BLE_SUOTA_RECEIVER)
    // Issue a platform reset when it is requested by the suotar procedure
    if (suota_state.reboot_requested)
    {
        // Reboot request will be served
        suota_state.reboot_requested = 0;

        // Platform reset
        platform_reset(RESET_AFTER_SUOTA_UPDATE);
    }
#endif

}

void user_app_on_connect(uint8_t conidx, struct gapc_connection_req_ind const *param)
{
    default_app_on_connection(conidx, param);
    arch_printf("BLE Connected\r\n");
}

void app_advertise_complete(const uint8_t status)
{
    if ((status == GAP_ERR_NO_ERROR) || (status == GAP_ERR_CANCELED))
    {

    }

    if (status == GAP_ERR_CANCELED)
    {
        arch_ble_ext_wakeup_on();
        app_button_enable();
    }
}

void user_catch_rest_hndl(ke_msg_id_t const msgid,
                          void const *param,
                          ke_task_id_t const dest_id,
                          ke_task_id_t const src_id)
{
    switch(msgid)
    {
        case GATTC_EVENT_REQ_IND:
        {
            // Confirm unhandled indication to avoid GATT timeout
            struct gattc_event_ind const *ind = (struct gattc_event_ind const *) param;
            struct gattc_event_cfm *cfm = KE_MSG_ALLOC(GATTC_EVENT_CFM, src_id, dest_id, gattc_event_cfm);
            cfm->handle = ind->handle;
            KE_MSG_SEND(cfm);
        } break;

        #if (BLE_CUSTOM1_SERVER)
        case CUSTS1_VAL_WRITE_IND:
        {
            struct custs1_val_write_ind const *ind = (struct custs1_val_write_ind const *)param;
            user_custs1_wr_ind_handler(msgid, ind, dest_id, src_id);
        } break;
        #endif

        default:
            break;
    }
}

/// @} APP
