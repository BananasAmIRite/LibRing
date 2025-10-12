
#include "gpio.h"

typedef struct led_gpios
{
        GPIO_PORT port;
        GPIO_PIN pin;
}led_gpios;

void LED_Pin_Config(bool enable);

void LED_Buff_setInt(uint32_t inputNum, unsigned char *LED_Buf, int lenInt);

void LED_write(unsigned char *LED_Buffer, int line);