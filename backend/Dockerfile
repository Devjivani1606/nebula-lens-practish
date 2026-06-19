FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --index-url https://pypi.org/simple --no-cache-dir -r requirements.txt
COPY . .

# Hugging Face Spaces requires port 7860
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
