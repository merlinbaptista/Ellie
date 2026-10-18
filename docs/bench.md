# Benchmark (local mock)

Date: 2026-10-18T16:45:47.046Z
Endpoint: http://127.0.0.1:8787
Storage: file-store
LLM: mock-llm
Samples per tool: 30 after 3 warm-ups

| Tool | p50 (ms) | p95 (ms) | max (ms) | Result |
|---|---:|---:|---:|---|
| due_this_week | 3 | 5 | 6 | PASS |
| predict_next | 3 | 5 | 6 | PASS |
| get_history | 4 | 7 | 10 | PASS |
| log_event | 3 | 4 | 5 | PASS |
| diagnose | 66 | 85 | 100 | PASS |
| send_to_phone | 2 | 4 | 4 | PASS |
| what_do_you_know | 3 | 4 | 6 | PASS |
