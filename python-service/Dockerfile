FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY *.py ./

# Accounts, sessions, library and history live in this file, so it has to
# outlive the container.
ENV SC_DB_PATH=/app/data/streamapp.db
VOLUME /app/data

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
