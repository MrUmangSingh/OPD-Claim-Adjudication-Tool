FROM python:3.12-slim

WORKDIR /app

RUN pip install uv

COPY pyproject.toml .
RUN uv pip install --system -r pyproject.toml

COPY . .

ENV DATABASE_URL=sqlite:////mnt/db/opd_claims.db \
    UPLOAD_DIR=/mnt/uploads \
    ANTHROPIC_MODEL=claude-sonnet-4-6 \
    JWT_ALGORITHM=HS256 \
    JWT_EXPIRE_MINUTES=480

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
