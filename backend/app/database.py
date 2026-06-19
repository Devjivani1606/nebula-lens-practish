# pyrefly: ignore [missing-import]
from sqlalchemy import create_engine   # handles the opening and maintanence of the connection pool
from sqlalchemy.ext.declarative import declarative_base  # base class for all the models
from sqlalchemy.orm import sessionmaker  # creates session objects
import os  
from dotenv import load_dotenv  

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")

engine = create_engine(DATABASE_URL)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()  #  Every model class in models.py will inherit from this Base class

# Dependency — used in FastAPI routes
def get_db():
    db = SessionLocal() # Opens a new database transaction session when a request starts.
    try:
        yield db # Delivers this session to the API endpoint function so it can execute queries.
    finally:
        db.close() # Closes the session properly after the request is finished, releasing the connection back to the pool.