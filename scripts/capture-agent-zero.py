import asyncio
import os
import sys
from pathlib import Path


async def main() -> None:
    source = Path(os.environ["AGENT_ZERO_SOURCE"]).resolve()
    output = Path(os.environ["AGENT_ZERO_OUTPUT"]).resolve()
    os.chdir(source)
    sys.path.insert(0, str(source))

    from agent import AgentContext, LoopData
    from helpers import dotenv, runtime, settings
    from initialize import initialize_agent

    runtime.initialize()
    runtime.args["dockerized"] = "true"
    dotenv.load_dotenv()
    settings.reload_settings()
    context = AgentContext(config=initialize_agent(), set_current=True)
    messages = await context.agent0.prepare_prompt(LoopData())
    system_prompt = messages[0].content
    if not isinstance(system_prompt, str) or not system_prompt.strip():
        raise RuntimeError("Agent Zero produced an empty system prompt")

    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(system_prompt.rstrip() + "\n", encoding="utf-8")


asyncio.run(main())
