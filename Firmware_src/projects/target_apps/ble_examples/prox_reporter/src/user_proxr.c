
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

#include "leds.c"

#if defined(__IS_SDK6_COMPILER_GCC__) && !defined(__clang__)
#pragma message("Please note that SDK6 GCC support will be deprecated in the next SDK6 release")
#endif



uint8_t LED_Buffer[6] = {0x00,0x00,0x00,0x00,0x00,0x00};

uint32_t counter_time = 0;
uint8_t counter_ms = 0;
uint8_t current_line = 0;
uint32_t realUnix = 0;
uint32_t lastTime = 0;

uint8_t LED_Display_state = 0;
uint32_t turnOnTime = 0;

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
        }else{
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
        LED_Buff_setInt(lld_evt_time_get()/100, LED_Buffer, 5);
}

static void timer_cb(void)
{
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

                LED_write(&LED_Buffer, current_line);
        }
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
     arch_printf("Booted now\r\n");
     LED_GPIO_mode(1);
}

static void app_button_press_cb(void)
{
    app_resume_system_from_sleep();

    app_button_enable();
    if(GPIO_GetPinStatus(GPIO_BUTTON_PORT, GPIO_BUTTON_PIN))
            return;
    arch_printf("Button was just pressed\r\n");
    if(LED_Display_state){
            LED_GPIO_mode(0);
    }else{
            LED_GPIO_mode(1);
    }
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

        default:
            break;
    }
}

/// @} APP
