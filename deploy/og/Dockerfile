FROM python:3.12-slim-bookworm

RUN pip install --no-cache-dir "psycopg[binary]==3.2.9"

WORKDIR /app
COPY og.py crm.py lgs-og.png lgs-crm.js ./

EXPOSE 8080
CMD ["python", "-u", "og.py"]
