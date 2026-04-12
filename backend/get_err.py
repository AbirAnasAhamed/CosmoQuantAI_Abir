import traceback
from sqlalchemy import create_engine

engine = create_engine(postgresql://user:password@db:5432/cosmoquant_db)
try:
    with engine.connect() as con:
        con.execute(DROP
