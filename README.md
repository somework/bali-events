# Bali Events - Local Ops

## Docker Compose

The top-level `docker-compose.yml` defines services for:

- `collector` (build context: `./collector`)
- `enricher` (build context: `./enricher`)
- `bot-api` (build context: `./bot-api`)
- `redis` (local cache)
- `postgres` (optional local database; enabled with profile `local`)

### Required environment variables

Set these in your shell or an `.env` file in the repo root.

| Variable | Used by | Purpose | Default |
| --- | --- | --- | --- |
| `REDIS_URL` | collector, enricher, bot-api | Redis connection string | `redis://redis:6379/0` |
| `DATABASE_URL` | collector, enricher, bot-api | Postgres connection string | `postgres://postgres:${POSTGRES_PASSWORD:-postgres}@postgres:5432/${POSTGRES_DB:-bali_events}` |
| `BOT_API_PORT` | bot-api | Port exposed on the host | `8080` |
| `POSTGRES_DB` | postgres | Database name (local profile only) | `bali_events` |
| `POSTGRES_USER` | postgres | Database user (local profile only) | `postgres` |
| `POSTGRES_PASSWORD` | postgres | Database password (local profile only) | `postgres` |

### Commands

Run all services with local Redis and externally managed Postgres:

```sh
docker compose up --build
```

Run all services with local Postgres enabled:

```sh
docker compose --profile local up --build
```
