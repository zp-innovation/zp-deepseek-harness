# Agent Note: Account-password browser authentication

Status: implemented

English | [中文](2026-09-06-account-password-browser-authentication.zh.md)

## Problem

The process launch URL authenticates a browser only when an operator can obtain fresh terminal output. A user reaching the Web Host from another machine needs a stable interactive credential without receiving the process launch token. The credential must not authorize an untrusted Host or cross-site request, and password storage must survive process restarts without retaining plaintext.

## Decision

`dsh-client-connection` presents an account login form for an unauthenticated index request and accepts `POST /login` only after the existing Host, Origin, and Fetch-Metadata checks pass. The route accepts a bounded `application/x-www-form-urlencoded` body, verifies the username and password, then issues the same authority-bound signed browser cookie as the launch-token exchange. The launch-token path remains available for local bootstrap and recovery.

The Host stores accounts in the sql.js SQLite database at `userDatabasePath`, which defaults to `$DSH_HOME/users.db`. Passwords use bcrypt hashes. SQL statements bind account values as parameters, each successful mutation exports the database before it returns, and filesystem or SQLite failures reject startup or the request instead of reporting success. The store closes with its Cordis fiber.

An empty database receives the configured `bootstrapUsername` and `bootstrapPassword`; their shipped defaults are `admin` and `admin123`. Bootstrap settings do not replace an existing account. A network-reachable deployment changes the bootstrap password before its first startup.

The [browser launch-token decision](../architecture/2026-08-24-browser-token-authentication.md) remains active for cookie signing, authority binding, API-wide enforcement, token rotation, and revocation. This decision adds a credential acquisition path and does not weaken those rules. No active Agent Note is archived because both decisions retain independent security rationale.

## Verification

The user-store suite creates an account, rejects a duplicate, verifies and changes its password, reopens the SQLite file, and deletes the account. The Host route suite boots an isolated database through the Connection plugin and verifies that the default URL-encoded login returns an HttpOnly cookie. Browser-authentication coverage continues to pin signed-cookie validation and launch-token exchange.

## Alternatives considered

**Keep launch-token authentication as the only entry path.** This requires terminal-output access for every new remote browser and does not meet the stable account-login requirement.

**Store password hashes in the credential YAML provider.** Credential records hold plugin-owned secrets but do not provide account uniqueness, ordering, or future account-management queries. A dedicated SQLite file keeps the account data model separate from cookie-signing material.

**Interpolate escaped usernames into SQL.** Correct escaping is easy to regress when account operations expand. Bound parameters keep values out of SQL syntax.

**Ignore database export failures and keep serving from memory.** A successful response would claim durability that the next process cannot observe. Persistence failures remain visible to the caller.

## Consequences

Users can authenticate without the launch URL, and both entry paths converge on one browser-cookie authority model. The SQLite file and signing secret remain separate durable assets under the Harness home.

The default bootstrap password is unsuitable for a network-reachable deployment. Configuration must change before first startup because bootstrap values deliberately do not mutate existing accounts. sql.js persists by exporting the complete database after each account mutation, so this implementation favors a small account set rather than high write throughput or multi-process writers.
