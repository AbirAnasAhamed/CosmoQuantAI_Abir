import traceback
from sqlalchemy import create_engine, text

engine = create_engine("postgresql://user:password@db:5432/cosmoquant_db")
try:
    with engine.connect() as con:
        con.execute(text("DROP TABLE \"AnalystRating\" CASCADE"))
except Exception as e:
    traceback.print_exc()
