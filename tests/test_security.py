
import os
import unittest
import hmac
from unittest.mock import patch, MagicMock
import sys

# Append path to import src
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Import the actual module
from src.core import security

class TestSecurity(unittest.TestCase):
    
    def setUp(self):
        # Reset env var before each test
        if "GHOSTSCAN_MASTER_KEY" in os.environ:
            del os.environ["GHOSTSCAN_MASTER_KEY"]

    def test_missing_env_var(self):
        """Test that missing env var raises ValueError"""
        with self.assertRaises(ValueError) as cm:
            security.unlock_all_modules("some_key")
        self.assertIn("Security Key Missing", str(cm.exception))

    def test_wrong_key(self):
        """Test that wrong key raises ValueError"""
        os.environ["GHOSTSCAN_MASTER_KEY"] = "SECRET_123"
        with self.assertRaises(ValueError) as cm:
            security.unlock_all_modules("WRONG_KEY")
        self.assertIn("Invalid Decryption Key", str(cm.exception))

    def test_correct_key(self):
        """Test that correct key proceeds to decryption logic (mocked)"""
        os.environ["GHOSTSCAN_MASTER_KEY"] = "SECRET_123"
        
        # We need to mock os.walk and open/decrypt because we don't have real files
        with patch('os.walk') as mock_walk:
            mock_walk.return_value = [] # No files found
            
            success, failed = security.unlock_all_modules("SECRET_123")
            
            # Should return 0, 0 because no files, but no error raised
            self.assertEqual(success, 0)
            self.assertEqual(failed, 0)

if __name__ == '__main__':
    unittest.main()
