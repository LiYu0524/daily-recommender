from dataclasses import dataclass


@dataclass
class LLMConfig:
    provider: str
    model: str
    base_url: str | None = None
    api_key: str | None = None
    temperature: float = 0.7


@dataclass
class EmailConfig:
    smtp_server: str
    smtp_port: int
    sender: str
    receiver: str
    sender_password: str


@dataclass
class CommonConfig:
    description: str
    num_workers: int = 4
    save: bool = False
    save_dir: str = "./history"
