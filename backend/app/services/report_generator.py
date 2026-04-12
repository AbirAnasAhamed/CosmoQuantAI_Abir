import os
import pandas as pd
import quantstats as qs
from weasyprint import HTML
import io
import matplotlib.pyplot as plt
import logging

# ✅ ফিক্স ১: ফন্ট ওয়ার্নিং বন্ধ করা
logging.getLogger('matplotlib.font_manager').disabled = True
plt.rcParams['font.family'] = 'sans-serif'
plt.rcParams['font.sans-serif'] = ['Liberation Sans', 'DejaVu Sans', 'Arial', 'sans-serif']

# ✅ ফিক্স ২: সঠিক পাথ নির্ধারণ (Absolute Path ব্যবহার করা সেফ)
BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__))) # backend/app
REPORT_DIR = os.path.join(BASE_DIR, "reports") # backend/app/reports

os.makedirs(REPORT_DIR, exist_ok=True)

def generate_report(task_id: str, returns_json: str, symbol: str, timeframe: str, format: str = "pdf"):
    try:
        print(f"📄 Generating report for task: {task_id}")

        # ১. JSON ডাটা প্রসেসিং
        try:
            returns = pd.read_json(io.StringIO(returns_json), typ='series')
            returns.index = pd.to_datetime(returns.index)
            if returns.index.tz is not None:
                returns.index = returns.index.tz_localize(None)
        except Exception as e:
            print(f"⚠️ Data conversion error: {e}")
            return None

        # ✅ ফিক্স ৩: ফাইলের নাম স্যানিটাইজ করা (BTC/USDT -> BTC_USDT)
        safe_symbol = symbol.replace("/", "_")
        
        filename = f"report_{safe_symbol}_{timeframe}_{task_id}.html"
        file_path = os.path.join(REPORT_DIR, filename)

        # ✅ ফিক্স ৪: ফোল্ডার আছে কিনা নিশ্চিত করা
        if not os.path.exists(REPORT_DIR):
            os.makedirs(REPORT_DIR)

        # HTML রিপোর্ট জেনারেট
        qs.reports.html(returns, output=file_path, title=f"Backtest Report - {symbol}", download_filename=file_path)
        print(f"✅ HTML Report saved: {file_path}")

        if format == "html":
            return file_path

        # PDF কনভার্শন
        if format == "pdf":
            pdf_name = f"report_{safe_symbol}_{timeframe}_{task_id}.pdf"
            pdf_path = os.path.join(REPORT_DIR, pdf_name)
            HTML(filename=file_path).write_pdf(pdf_path)
            print(f"✅ PDF Report saved: {pdf_path}")
            return pdf_path
            
    except Exception as e:
        import traceback
        print(f"❌ Report Generation Error: {e}")
        print(traceback.format_exc()) # বিস্তারিত এরর লগ
        return None