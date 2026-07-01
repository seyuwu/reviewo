FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV WAITLIST_DATABASE_PATH=/data/waitlist.db

WORKDIR /app

COPY apps/waitlist-bot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/waitlist-bot/bot ./bot

RUN mkdir -p /data \
  && useradd --create-home --shell /usr/sbin/nologin bot \
  && chown -R bot:bot /app /data

USER bot

CMD ["python", "-m", "bot"]
