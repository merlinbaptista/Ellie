# Benchmark

Date: 2026-10-17T12:10:03.222Z
Endpoint: http://127.0.0.1:8787
Storage: file-store
LLM: mock-llm
Samples per tool: 30 after 3 warm-ups

| Tool | p50 (ms) | p95 (ms) | max (ms) | Result |
|---|---:|---:|---:|---|
| due_this_week | 8 | 9 | 12 | PASS |
| predict_next | 7 | 9 | 9 | PASS |
| get_history | 8 | 9 | 10 | PASS |
| log_event | 5 | 6 | 8 | PASS |
| diagnose | 76 | 101 | 106 | PASS |
| send_to_phone | 4 | 5 | 5 | PASS |
| what_do_you_know | 6 | 8 | 8 | PASS |
