from pydantic import BaseSettings


class Settings(BaseSettings):
    app_name: str = "PlaceFinder"
    debug: bool = True

    class Config:
        env_file = ".env"


settings = Settings()
