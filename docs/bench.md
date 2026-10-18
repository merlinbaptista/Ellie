# Benchmark (local mock)

Date: 2026-10-18T17:08:00.182Z
Endpoint: http://127.0.0.1:8787
Storage: file-store
LLM: mock-llm
Samples per tool: 30 after 3 warm-ups

| Tool | p50 (ms) | p95 (ms) | max (ms) | Result |
|---|---:|---:|---:|---|
| due_this_week | 5 | 10 | 11 | PASS |
| predict_next | 5 | 8 | 8 | PASS |
| get_history | 6 | 8 | 8 | PASS |
| log_event | 5 | 7 | 8 | PASS |
| diagnose | 78 | 95 | 103 | PASS |
| send_to_phone | 4 | 6 | 6 | PASS |
| what_do_you_know | 5 | 7 | 8 | PASS |
