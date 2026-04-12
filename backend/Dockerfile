# syntax=docker/dockerfile:1
# Python Image
FROM python:3.12-slim

# Set working directory
WORKDIR /app

# ✅ 1. Install System Dependencies & Fonts (Critical Fix)
# এই অংশটি আপনার ফাইলে মিসিং ছিল, যা ফন্ট এরর সরাবে
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf-2.0-0 \
    libffi-dev \
    shared-mime-info \
    libpangoft2-1.0-0 \
    libharfbuzz-subset0 \
    libjpeg-dev \
    libopenjp2-7-dev \
    fonts-liberation \
    fontconfig \
    fonts-dejavu-core \
    build-essential \
    wget \
    && rm -rf /var/lib/apt/lists/*

# ✅ 1.5 Install TA-Lib C Library (Required for Python TA-Lib)
# Source: http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz
RUN wget http://prdownloads.sourceforge.net/ta-lib/ta-lib-0.4.0-src.tar.gz && \
    tar -xvzf ta-lib-0.4.0-src.tar.gz && \
    cd ta-lib/ && \
    ./configure --prefix=/usr && \
    make && \
    make install && \
    cd .. && \
    rm -rf ta-lib-0.4.0-src.tar.gz ta-lib/

# ✅ 2. Fix Cache Directories (Fontconfig Permission Fix)
# ওয়ার্কার যাতে ক্যাশ লিখতে পারে তার জন্য ফোল্ডার পারমিশন সেট করা
ENV XDG_CACHE_HOME=/tmp/.cache
ENV MPLCONFIGDIR=/tmp/.matplotlib

RUN mkdir -p /tmp/.cache && chmod 777 /tmp/.cache \
    && mkdir -p /tmp/.matplotlib && chmod 777 /tmp/.matplotlib

# Install dependencies
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --default-timeout=1000 -r requirements.txt

# Copy all backend files
COPY . .

# Fix line endings for prestart.sh (Windows compatibility)
RUN sed -i 's/\r$//' /app/prestart.sh

# Expose port
EXPOSE 8000

# Command to run the app
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000", "--reload"]