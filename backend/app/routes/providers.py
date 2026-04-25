from fastapi import APIRouter
from tradingagents.llm_clients.model_catalog import MODEL_OPTIONS

router = APIRouter(prefix="/api/providers", tags=["providers"])

PROVIDER_DISPLAY = {
    "openai":     "OpenAI",
    "anthropic":  "Anthropic",
    "google":     "Google",
    "xai":        "xAI",
    "deepseek":   "DeepSeek",
    "qwen":       "Qwen",
    "glm":        "GLM",
    "kimi":       "Kimi (Moonshot AI)",
    "ollama":     "Ollama (Local)",
    "openrouter": "OpenRouter",
}

# Providers that need provider-specific thinking config in the wizard
THINKING_CONFIG = {
    "openai":    "reasoning_effort",   # low | medium | high
    "anthropic": "effort",             # low | medium | high
    "google":    "thinking_level",     # minimal | high
}


@router.get("")
async def list_providers():
    providers = []
    for key, options in MODEL_OPTIONS.items():
        providers.append({
            "key": key,
            "display": PROVIDER_DISPLAY.get(key, key.title()),
            "thinking_config": THINKING_CONFIG.get(key),
            "quick_models": [
                {"label": label, "value": value}
                for label, value in options.get("quick", [])
                if value != "custom"
            ],
            "deep_models": [
                {"label": label, "value": value}
                for label, value in options.get("deep", [])
                if value != "custom"
            ],
        })
    return providers
