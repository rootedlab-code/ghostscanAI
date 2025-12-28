# Base Image with GPU support
FROM tensorflow/tensorflow:latest-gpu

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV DEBIAN_FRONTEND=noninteractive

# Update system and install dependencies
# libgl1 and libglib2.0-0 are required for opencv
# wget, gnupg, unzip for chrome and chromedriver
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    unzip \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Install Google Chrome
RUN wget -q -O - https://dl-ssl.google.com/linux/linux_signing_key.pub | apt-key add - \
    && echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y google-chrome-stable \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir --ignore-installed -r requirements.txt

# Copy source code
COPY src/ /app/src/

# Set working directory
WORKDIR /app

# Run the application
CMD ["python", "-m", "src.main"]
