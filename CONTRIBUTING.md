# Contributing

Use small patches with a runnable check.

```bash
node scripts/helioz-gate.mjs --selftest
node scripts/helioz-zeus.mjs --selftest
node scripts/helioz-probes.mjs
```

Do not commit local queues, `.helioz/` state, secrets, tokens, screenshots with private data, or generated logs.
