from pydantic_settings import BaseSettings
from pathlib import Path


class Settings(BaseSettings):
    anthropic_api_key: str = ""
    anthropic_base_url: str = "https://api.anthropic.com"
    database_url: str = "sqlite:///./opd_claims.db"
    upload_dir: str = "./uploads"
    allowed_origins: list[str] = ["http://localhost:3000", "https://*.vercel.app"]
    max_upload_size_mb: int = 10
    anthropic_model: str = "claude-sonnet-4-6"
    jwt_secret: str = ""
    jwt_algorithm: str = "HS256"
    jwt_expire_minutes: int = 480

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()

BASE_DIR = Path(__file__).parent.parent
DATA_DIR = BASE_DIR / "data"
POLICY_FILE = DATA_DIR / "policy_terms.json"
TEST_CASES_FILE = DATA_DIR / "test_cases.json"
UPLOAD_DIR = Path(settings.upload_dir)
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
