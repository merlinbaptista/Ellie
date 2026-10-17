# Benchmark

Date: 2026-10-17T11:33:28.668Z
Endpoint: http://127.0.0.1:8787
Storage: file-store
LLM: mock-llm
Samples per tool: 30 after 3 warm-ups

| Tool             | p50 (ms) | p95 (ms) | max (ms) | Result |
| ---------------- | -------: | -------: | -------: | ------ |
| due_this_week    |        5 |        6 |        7 | PASS   |
| predict_next     |        4 |        6 |        6 | PASS   |
| get_history      |        4 |        6 |        6 | PASS   |
| log_event        |        3 |        5 |        6 | PASS   |
| diagnose         |       73 |       94 |      106 | PASS   |
| send_to_phone    |        3 |        5 |        5 | PASS   |
| what_do_you_know |        4 |        7 |        7 | PASS   |
