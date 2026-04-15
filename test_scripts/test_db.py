import traceback
from sqlalchemy import create_engine, text

def test_db():
    engine = create_engine("postgresql://user:password@localhost:5432/cosmoquant_db")
    try:
        with engine.connect() as con:
            con.execute(text('DROP TABLE "AnalystRating" CASCADE'))
    except Exception as e:
        traceback.print_exc()

if __name__ == "__main__":
    test_db()
