# S3, presigned URLs, and images (AWS)

**Review kinds:** pr, repo
**Applies when:** any S3 call, presigned URL, key builder, or sharp pipeline is in scope, and on every repo review.
**Policy:** `docs/SECURITY.md` (S3 not public, least privilege), `docs/ARCHITECTURE.md`.

## How to review

Presigned URLs are credentials with a TTL. For each one, write down who can request it, which bucket and key it signs, which method (GET or PUT), how long it lasts, and what content type and length it allows. Then check the key: anything from the request must stay inside its prefix.

## Criteria

- **AWS-01** (MUST) Object keys built from request data stay inside the intended prefix (`feed/`, `detection/`, `porch/`). `..`, a leading slash, or an encoded separator cannot escape it. Verify: build a key from `../` and from a value containing `/`.
- **AWS-02** (MUST) PUT URLs are limited: expected content type, a maximum length where the SDK allows it, and a short TTL. A URL that can upload any object in the bucket is a MUST. Verify: read each `PutObjectCommand` and the `getSignedUrl` expires value.
- **AWS-03** (SHOULD) GET URLs used for playback are short-lived and are not logged. Verify: read the porch playback TTL and every log of a signed URL.
- **AWS-04** (MUST) The API never returns or logs a permanent object URL for a private bucket. Access is presigned or goes through the API. Verify: search for the bucket host in responses.
- **AWS-05** (SHOULD) `HeadObject` and `GetObject` handle a missing key as a normal case, not an unhandled exception that drops the event. Verify: read each call's error branch.
- **AWS-06** (MUST) sharp is given a pixel limit (`limitInputPixels` or an equivalent size check) before decoding device-uploaded bytes. Verify: read the sharp chain and the installed `sharp` docs for the default limit.
- **AWS-07** (SHOULD) Image work is bounded in concurrency and buffer size. A request cannot hold an unbounded `Buffer` of the original plus every derivative. Verify: read the pipeline.
- **AWS-08** (SHOULD) S3 clients are created once per process, region comes from config, and errors include the operation and key but not the signed URL or the body. Verify: read the provider and the log statements.

## Automatic-fail signals

- A key prefix escape.
- A presigned PUT with no content-type constraint and a long TTL.
- sharp decoding an untrusted image with no pixel cap.
