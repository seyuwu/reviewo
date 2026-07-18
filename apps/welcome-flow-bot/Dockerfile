FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1
ENV WELCOME_FLOW_DATABASE_PATH=/data/welcome_flow.db

WORKDIR /app

COPY apps/welcome-flow-bot/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY apps/welcome-flow-bot/bot ./bot
COPY apps/welcome-flow-bot/templates.json ./templates.json

RUN mkdir -p /data \
  && useradd --create-home --shell /usr/sbin/nologin bot \
  && chown -R bot:bot /app /data

USER bot

CMD ["python", "-m", "bot"]
