# Comments

> **Precedence:** CONTEXT.md > GOVERNANCE.md > **COMMENTS.md**.
>
> **AI agents — read this file when:** adding comments, JSDoc, or reviewing documentation-in-code.

---

## Policy summary

Comments are a maintenance cost. Prefer self-documenting names, types, and structure.

Add comments only when they convey information the code cannot:

- **Intent / why** behind a non-obvious decision
- **Architecture trade-offs** and alternatives considered
- **Security constraints** (ECDSA bypass, TLS exceptions)
- **Performance trade-offs**
- **AWS, Nest, TypeORM, or Claude quirks** and workarounds
- **Justification** for unavoidable `any` or lint suppressions

Do **not**:

- Restate what the next line does
- Leave `TODO` without ticket/context
- Keep commented-out dead code (delete it)

---

## Spacing rules (TypeScript)

### Standalone comments

- Empty line **above and below** for mid-block standalone comments
- At **block start**: empty line **below** only
- At **block end**: empty line **above** only

### JSDoc

- Place directly **above** the declaration
- **No** blank line between JSDoc and the symbol

### Example

```typescript
async function processDetection(labels: RekognitionLabel[]): Promise<void> {
  // Claude requires instance counts, not just label names

  const analysis = await this.claudeService.analyzeAnimalDetection(labels);

  // Persist crow counts for gallery cooldown logic

  await this.detectionEventService.updateAnalysis(analysis);
}

/**
 * Verifies an ECDSA device signature for Pi / Lambda callers.
 */
export class EcdsaAuthGuard implements CanActivate {
  // implementation
}
```

---

## Nest / Lambda notes

- Prefer clarifying comments near auth bypass, SSL exceptions, and status-state machines.
- Do not narrate DI constructor wiring.
