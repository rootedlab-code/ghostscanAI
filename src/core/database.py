from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
import os

# Define Base for models to inherit from
Base = declarative_base()

class DatabaseManager:
    def __init__(self, db_path="data/osint_scanner.db"):
        # Ensure data directory exists
        os.makedirs(os.path.dirname(db_path), exist_ok=True)
        
        self.db_url = f"sqlite:///{db_path}"
        self.engine = create_engine(
            self.db_url, 
            connect_args={"check_same_thread": False} # Needed for SQLite + FastAPI
        )
        self.SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=self.engine)

    def init_db(self):
        """Creates all tables defined in models."""
        Base.metadata.create_all(bind=self.engine)

    def get_db(self):
        """Dependency for FastAPI to get a database session."""
        db = self.SessionLocal()
        try:
            yield db
        finally:
            db.close()

# Global instance
db_manager = DatabaseManager()
