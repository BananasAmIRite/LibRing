/**
 ****************************************************************************************
 *
 * @file user_custs1_impl.c
 *
 * @brief Custom 1 server implementation
 *
 * Copyright (C) 2012-2021 Renesas Electronics Corporation and/or its affiliates
 * The MIT License (MIT)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
 * EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
 * MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
 * IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM,
 * DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR
 * OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE
 * OR OTHER DEALINGS IN THE SOFTWARE.
 ****************************************************************************************
 */

/**
 ****************************************************************************************
 * @addtogroup USER_APP
 * @{
 ****************************************************************************************
 */

/*
 * INCLUDE FILES
 ****************************************************************************************
 */

#include "user_custs1_impl.h"
#include "user_custs1_def.h"
#include "user_proxr.h"

/*
 * EXTERNAL VARIABLE DECLARATIONS
 ****************************************************************************************
 */
extern uint32_t led_value;

/*
 * FUNCTION DEFINITIONS
 ****************************************************************************************
 */
#if (BLE_CUSTOM1_SERVER)

void user_custs1_wr_ind_handler(ke_msg_id_t const msgid,
                                     struct custs1_val_write_ind const *param,
                                     ke_task_id_t const dest_id,
                                     ke_task_id_t const src_id)
{
	if (param->handle == SVC1_IDX_CTRL_POINT_VAL)
	{
		if(param->value[0] != 0)
		{
			// Turn on the LED
			LED_GPIO_mode(1);
			led_value = 123;
		} else {
			LED_GPIO_mode(0);
		}
	}
}

#endif //BLE_CUSTOM1_SERVER