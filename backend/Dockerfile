# Dockerfile for the HealNet backend, placed in backend/ (same folder as main.py)
#
# WHY THIS IS NEEDED: pytesseract requires the actual Tesseract OCR program
# to be installed on the system (not just a Python package) - and Render's
# default Python buildpack has no way to install system-level packages like
# apt does. Switching this service to a Docker-based deploy on Render lets
# us install tesseract-ocr and poppler-utils (needed for PDF-to-image
# conversion) directly.

FROM python:3.11.9-slim

# Install system dependencies: tesseract-ocr (OCR engine) and
# poppler-utils (provides pdftoppm, used by pdf2image for PDF pages)
RUN apt-get update && apt-get install -y \
    tesseract-ocr \
    poppler-utils \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# Render sets $PORT automatically - default to 8000 for local testing
ENV PORT=8000
EXPOSE 8000

CMD ["sh", "-c", "uvicorn main:app --host 0.0.0.0 --port $PORT"]
