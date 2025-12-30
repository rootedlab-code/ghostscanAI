import os
import base64
import itertools
import logging
import hmac

logger = logging.getLogger("Security")

MODULES_DIR = os.path.join(os.path.dirname(os.path.dirname(__file__)), "modules")
PREMIUM_MODULES = ["sauron", "neutron", "elyon"]

def xor_cipher(data, key):
    key_bytes = key.encode('utf-8')
    return bytes([b ^ k for b, k in zip(data, itertools.cycle(key_bytes))])

def decrypt_module_file(file_path, key):
    try:
        with open(file_path, "rb") as f:
            header = f.readline()
            if not header.startswith(b"ENCRYPTED_HEADER_V2"):
                logger.warning(f"Invalid header in {file_path}")
                return False
            encrypted_data = f.read()

        try:
            reversed_data = base64.b64decode(encrypted_data)
        except Exception:
            logger.error(f"Base64 decode failed for {file_path}")
            return False

        xor_data = reversed_data[::-1]
        original_data = xor_cipher(xor_data, key)
        
        # Validation: Try to compile the code to ensure it's valid Python
        # This prevents overwriting with garbage if the key is wrong
        try:
            compile(original_data, file_path, 'exec')
        except SyntaxError:
            logger.error(f"Decryption yielded invalid code for {file_path}. Incorrect key suspected.")
            return False
        
        new_path = file_path.replace(".pye", ".py")
        with open(new_path, "wb") as f:
            f.write(original_data)
            
        os.remove(file_path)
        logger.info(f"Module decrypted: {file_path} -> {new_path}")
        return True
    except Exception as e:
        logger.error(f"Decryption failed for {file_path}: {e}")
        return False

def unlock_all_modules(key: str):
    """
    Attempt to unlock all premium modules with the provided key.
    Returns (success_count, fail_count)
    """
    success_count = 0
    fail_count = 0
    
    expected_key = os.getenv("GHOSTSCAN_MASTER_KEY")
    
    if not expected_key:
        logger.error("GHOSTSCAN_MASTER_KEY environment variable is not set!")
        # Fallback for dev/testing if absolutely needed, but better to fail safe
        raise ValueError("System Configuration Error: Security Key Missing")

    # Constant-time comparison to prevent timing attacks
    if not hmac.compare_digest(key, expected_key):
        raise ValueError("Invalid Decryption Key")

    for module in PREMIUM_MODULES:
        module_path = os.path.join(MODULES_DIR, module)
        if not os.path.exists(module_path):
            continue
            
        for root, dirs, files in os.walk(module_path):
            for file in files:
                if file.endswith(".pye"):
                    full_path = os.path.join(root, file)
                    if decrypt_module_file(full_path, key):
                        success_count += 1
                    else:
                        fail_count += 1
    
    return success_count, fail_count

def get_module_status():
    """
    Checks if modules are encrypted (.pye exists and .py missing).
    Returns dict: { 'module_name': 'locked' | 'unlocked' | 'missing' }
    """
    status = {}
    for module in PREMIUM_MODULES:
        module_path = os.path.join(MODULES_DIR, module)
        if not os.path.exists(module_path):
            status[module] = "missing"
            continue
        
        # Check for core.pye vs core.py as a heuristic
        # Depending on structure, checking one key file is enough
        has_encrypted = False
        has_source = False
        
        for root, dirs, files in os.walk(module_path):
            if "core.pye" in files or "module.pye" in files:
                has_encrypted = True
            if "core.py" in files or "module.py" in files:
                has_source = True
        
        if has_encrypted and not has_source:
             status[module] = "locked"
        elif has_source:
             status[module] = "active"
        else:
             status[module] = "unknown"
             
    return status
