#By ATC1441 tool to create custom OTA Header image for the SR08 Smart Ring
import struct
import time
import struct
import time

def calculate_crc32(data):
    crc = 0xFFFFFFFF
    for byte in data:
        crc ^= byte
        for _ in range(8):
            if crc & 1:
                crc = (crc >> 1) ^ 0xEDB88320
            else:
                crc >>= 1
    return crc ^ 0xFFFFFFFF

def calculate_xor_checksum(data):
    checksum = 0x00
    for byte in data:
        checksum ^= byte
    return checksum
    
def create_header(image_id=0xAA, valid_flag=0xFF, code_size=0, all_size=0, crc_in=0, version="1.900", encryption_flag=0x00):
    signature = struct.pack("BB", 0x70, 0x51) 
    valid_flag = struct.pack("B", valid_flag)
    image_id = struct.pack("B", image_id)
    all_size_placeholder = struct.pack("I", all_size)
    crc_placeholder = struct.pack("I", crc_in)
    version_bytes = version.encode("ascii") + b"\x00" + (b"\xFF" * (16 - len(version)-1))
    timestamp = struct.pack("I", int(time.time()))
    encryption_flag = struct.pack("B", encryption_flag)
    code_size_placeholder = struct.pack("I", code_size)
    custom_infos_placeholder = struct.pack("I", 0x00170001)
    reserved = b"\xFF" * 23
    header = (
        signature + image_id + valid_flag + all_size_placeholder +
        crc_placeholder + version_bytes + timestamp + encryption_flag + code_size_placeholder + custom_infos_placeholder + reserved
    )    
    if len(header) != 64:
        raise ValueError("Der Header muss genau 64 Bytes lang sein.")    
    return header

def add_header_to_file(input_file, output_file):
    with open(input_file, "rb") as f:
        file_content = f.read()    
    code_size = len(file_content)        
    crc32 = calculate_crc32(file_content)    
    padding_length = (240 - ((len(file_content)+64)% 240)) % 240
    if(((len(file_content)+64)% 240) == 0):
        padding_length = 240
    padding = b"\xFF" * padding_length
    file_content += padding    
    all_size = len(file_content)
    header = create_header(code_size=code_size, all_size=all_size, crc_in=crc32)
    combined_content = header + file_content
    crc = calculate_xor_checksum(combined_content[:-1])
    combined_content = combined_content[:-1] + struct.pack("B", crc)
    with open(output_file, "wb") as f:
        f.write(combined_content)

add_header_to_file("prox_reporter.bin", "../output.bin")