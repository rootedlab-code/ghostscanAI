import logging
import importlib
import os
from typing import Dict, Any

logger = logging.getLogger("ModuleManager")

class BaseModule:
    """Base class that all paid modules must inherit from."""
    def __init__(self, name: str, config: Dict[str, Any] = None):
        self.name = name
        self.config = config or {}
        self.is_active = False

    async def initialize(self):
        """Called when system starts."""
        pass

    async def shutdown(self):
        """Called when system stops."""
        pass

class ModuleManager:
    def __init__(self):
        self.modules: Dict[str, BaseModule] = {}
        
    def register_module(self, module: BaseModule):
        if module.name in self.modules:
            logger.warning(f"Module {module.name} already registered.")
            return
        self.modules[module.name] = module
        logger.info(f"Module registered: {module.name}")

    async def initialize_all(self):
        logger.info("Initializing modules...")
        for name, module in self.modules.items():
            try:
                # Simulate secure loading check
                if not self._verify_integrity(module):
                    raise ImportError(f"Signature verification failed for {name}")
                
                await module.initialize()
                module.is_active = True
                logger.info(f"Module {name} initialized successfully.")
            except ImportError as e:
                logger.warning(f"⚠️  SECURE LOAD FAILED for {name}: {e}. Premium features disabled.")
                module.is_active = False
            except Exception as e:
                logger.error(f"Failed to initialize module {name}: {e}")
                module.is_active = False

    def _verify_integrity(self, module) -> bool:
        """
        Placeholder for checking if the module files are present and match checksums.
        In a real scenario, this would check the .pye files.
        """
        # For open source core, we just check if it was registered.
        # This allows us to keep the object in memory but flag it inactive if logic is missing.
        return True

    async def shutdown_all(self):
        logger.info("Shutting down modules...")
        for name, module in self.modules.items():
            if module.is_active:
                await module.shutdown()
                module.is_active = False

    def get_module(self, name: str):
        # Case insensitive lookup
        for key, mod in self.modules.items():
            if key.lower() == name.lower():
                return mod
        return None

# Global instance
module_manager = ModuleManager()
