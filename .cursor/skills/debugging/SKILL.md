---
name: debugging
description: >-
  Systematic reproduce → isolate → fix workflow for NestJS/Lambda/AWS crow
  feeder failures. Use when investigating bugs, test failures, or ECS/Lambda errors.
---

# Debugging

Do not blind-patch. Follow reproduce → isolate → fix → verify.

---

## 1. Reproduce

- Capture exact command, env, endpoint, device id, and error message
- Prefer failing Jest test if possible
- For ECS/Lambda: CloudWatch logs (bunyan JSON / structured logs)

## 2. Isolate

- Bisect layer: controller vs service vs TypeORM vs AWS/Claude vs Lambda glue
- Check config/env missing values first (`src/config/`)
- Check ECDSA headers / clock skew for 401s
- Check SQS/S3 event shape for Lambda misses

## 3. Fix

- Smallest change that addresses root cause
- Add regression test that fails without the fix
- Avoid unrelated cleanup in the same change

## 4. Verify

```bash
npx jest path/to/relevant.spec.ts
make test
make lambda-test
```
