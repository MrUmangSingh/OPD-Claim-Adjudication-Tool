from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    database_url: str = "sqlite:///./opd_claims.db"
    upload_dir: str = "./uploads"
    allowed_origins: list[str] = ["http://localhost:3000", "https://*.vercel.app"]
    max_upload_size_mb: int = 10
    claude_model: str = "claude-sonnet-4-6"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

BASE_DIR = Path(__file__).parent.parent
POLICY_FILE = BASE_DIR.parent / "policy_terms.json"
TEST_CASES_FILE = BASE_DIR.parent / "test_cases.json"
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
