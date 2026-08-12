# Shared world image for every legal-agent-simulation Harbor task.
# Built ONCE by harbor/generate.py (--build-image); per-task compose files
# reference it by tag and select the task with the TASK_ID env var.
FROM python:3.12-slim
WORKDIR /world
COPY server.py oracle.py v2runtime.py v3dialects.py evidence.py shim.py start.sh world.json /world/
COPY contracts /world/contracts
COPY corpus /world/corpus
ARG SOLVE_TOKEN=""
ENV SOLVE_TOKEN=${SOLVE_TOKEN} PYTHONUNBUFFERED=1
EXPOSE 8972
CMD ["bash", "/world/start.sh"]
